/**
 * 图片存储服务 - 处理图片的上传、压缩、存储和 LLM 格式转换
 *
 * 功能：
 * - 保存图片到磁盘（chat-images/ 目录）
 * - 使用 sharp 压缩/调整图片尺寸
 * - 生成 LLM 就绪的压缩版本（确保缓存一致性）
 * - 将 URL 引用转为 base64（供 LLM API 调用）
 * - LRU 内存缓存减少重复磁盘 IO
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { existsSync } from 'fs'
import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import { ImageRepository } from '../db/repositories/imageRepository'
import {
  IMAGE_PROCESSING_CONFIG,
  type ChatImage,
  type ImageUploadResult,
  type ImageContentBlock,
  type AnthropicImageBlock,
  type OpenAIImageBlock,
} from '../models/imageTypes'

/** LRU 缓存条目 */
interface CacheEntry {
  data: string
  size: number
  lastAccessed: number
}

/** LRU 缓存配置 */
const BASE64_CACHE_CONFIG = {
  /** 最大缓存条目数 */
  maxEntries: 50,
  /** 最大缓存总大小（50MB） */
  maxSizeBytes: 50 * 1024 * 1024,
  /** 缓存过期时间（30分钟） */
  ttlMs: 30 * 60 * 1000,
}

function resolveWorkspaceBaseDir(): string {
  const fromEnv = process.env.WORKSPACE_BASE_DIR?.trim()
  if (fromEnv) {
    return path.resolve(fromEnv)
  }
  return path.resolve(process.cwd(), '..', 'workspaces')
}

export class ImageStorageService {
  private static instance: ImageStorageService
  private imageRepo = new ImageRepository()
  private base64Cache: Map<string, CacheEntry> = new Map()
  private cacheTotalSize = 0

  static getInstance(): ImageStorageService {
    if (!ImageStorageService.instance) {
      ImageStorageService.instance = new ImageStorageService()
    }
    return ImageStorageService.instance
  }

  /**
   * 保存上传的图片
   */
  async saveImage(params: {
    userId: string
    sessionId?: string
    fileBuffer: Buffer
    originalName: string
    mimeType: string
  }): Promise<ImageUploadResult> {
    const { userId, sessionId, fileBuffer, originalName, mimeType } = params

    this.validateImage(mimeType, fileBuffer.length)

    const ext = this.getExtensionFromMime(mimeType)
    const filename = `${uuidv4()}${ext}`

    const chatImagesDir = await this.ensureChatImagesDir(userId)
    const storagePath = path.join(chatImagesDir, filename)

    await fs.writeFile(storagePath, fileBuffer)

    let width: number | undefined
    let height: number | undefined
    try {
      const metadata = await sharp(fileBuffer).metadata()
      width = metadata.width
      height = metadata.height
    } catch {
      // 某些格式可能无法读取元数据
    }

    const llmReadyPath = await this.generateLlmReadyVersion(
      fileBuffer,
      mimeType,
      chatImagesDir,
      filename
    )

    const chatImage = await this.imageRepo.create({
      userId,
      sessionId,
      filename,
      originalName,
      mimeType,
      size: fileBuffer.length,
      width,
      height,
      storagePath,
      llmReadyPath,
    })

    return {
      imageId: chatImage.id,
      url: `/api/chat/images/${chatImage.id}`,
      originalName,
      mimeType,
      size: fileBuffer.length,
      width,
      height,
    }
  }

  /**
   * 获取图片元数据
   */
  async getImage(imageId: string): Promise<ChatImage | null> {
    return this.imageRepo.findById(imageId)
  }

  /**
   * 获取图片二进制数据
   */
  async getImageBuffer(imageId: string): Promise<Buffer | null> {
    const image = await this.imageRepo.findById(imageId)
    if (!image) return null

    try {
      return await fs.readFile(image.storagePath)
    } catch {
      return null
    }
  }

  /**
   * 删除图片
   */
  async deleteImage(imageId: string): Promise<void> {
    this.invalidateCache(imageId)

    const image = await this.imageRepo.findById(imageId)
    if (!image) return

    try {
      await fs.unlink(image.storagePath)
    } catch {
      // 文件可能已删除
    }

    if (image.llmReadyPath) {
      try {
        await fs.unlink(image.llmReadyPath)
      } catch {
        // 忽略
      }
    }

    await this.imageRepo.delete(imageId)
  }

  /**
   * 将图片 URL 引用内容块转为 Anthropic API 格式（base64）
   */
  async resolveImageForAnthropic(imageBlock: ImageContentBlock): Promise<AnthropicImageBlock> {
    const imageId = this.extractImageId(imageBlock.source.url)
    const base64Data = await this.getLlmReadyBase64(imageId)
    if (!base64Data) {
      throw new Error(`无法加载图片: ${imageBlock.source.url}`)
    }

    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageBlock.source.media_type,
        data: base64Data,
      },
    }
  }

  /**
   * 将图片 URL 引用内容块转为 OpenAI API 格式
   */
  async resolveImageForOpenAI(imageBlock: ImageContentBlock): Promise<OpenAIImageBlock> {
    const imageId = this.extractImageId(imageBlock.source.url)
    const base64Data = await this.getLlmReadyBase64(imageId)
    if (!base64Data) {
      throw new Error(`无法加载图片: ${imageBlock.source.url}`)
    }

    return {
      type: 'image_url',
      image_url: {
        url: `data:${imageBlock.source.media_type};base64,${base64Data}`,
      },
    }
  }

  /**
   * 更新图片关联的消息 ID
   */
  async updateMessageId(imageId: string, messageId: string): Promise<void> {
    await this.imageRepo.updateMessageId(imageId, messageId)
  }

  /**
   * 获取图片的分析文本缓存
   */
  async getImageAnalysis(imageId: string): Promise<string | null> {
    const image = await this.imageRepo.findById(imageId)
    return image?.analysisText || null
  }

  /**
   * 更新图片的分析文本缓存
   */
  async updateImageAnalysis(imageId: string, analysisText: string): Promise<void> {
    await this.imageRepo.updateAnalysisText(imageId, analysisText)
  }

  /**
   * 获取 LLM 就绪版本的 base64 数据（带 LRU 缓存）
   */
  private async getLlmReadyBase64(imageId: string): Promise<string | null> {
    const cached = this.getFromCache(imageId)
    if (cached !== null) return cached

    const image = await this.imageRepo.findById(imageId)
    if (!image) return null

    const filePath = image.llmReadyPath || image.storagePath
    try {
      const buffer = await fs.readFile(filePath)
      const base64Data = buffer.toString('base64')
      this.putToCache(imageId, base64Data)
      return base64Data
    } catch {
      return null
    }
  }

  /**
   * 从缓存获取 base64 数据
   */
  private getFromCache(imageId: string): string | null {
    const entry = this.base64Cache.get(imageId)
    if (!entry) return null

    if (Date.now() - entry.lastAccessed > BASE64_CACHE_CONFIG.ttlMs) {
      this.base64Cache.delete(imageId)
      this.cacheTotalSize -= entry.size
      return null
    }

    entry.lastAccessed = Date.now()
    return entry.data
  }

  /**
   * 将 base64 数据写入缓存
   */
  private putToCache(imageId: string, data: string): void {
    const size = data.length * 2

    if (size > BASE64_CACHE_CONFIG.maxSizeBytes) return

    while (this.base64Cache.size >= BASE64_CACHE_CONFIG.maxEntries ||
           this.cacheTotalSize + size > BASE64_CACHE_CONFIG.maxSizeBytes) {
      this.evictOldest()
    }

    const existing = this.base64Cache.get(imageId)
    if (existing) {
      this.cacheTotalSize -= existing.size
    }

    this.base64Cache.set(imageId, {
      data,
      size,
      lastAccessed: Date.now(),
    })
    this.cacheTotalSize += size
  }

  /**
   * 驱逐最久未使用的缓存条目
   */
  private evictOldest(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.base64Cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      const entry = this.base64Cache.get(oldestKey)!
      this.cacheTotalSize -= entry.size
      this.base64Cache.delete(oldestKey)
    }
  }

  /**
   * 使指定图片的缓存失效
   */
  private invalidateCache(imageId: string): void {
    const entry = this.base64Cache.get(imageId)
    if (entry) {
      this.cacheTotalSize -= entry.size
      this.base64Cache.delete(imageId)
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { entries: number; totalSizeMB: number; hitRate: number } {
    return {
      entries: this.base64Cache.size,
      totalSizeMB: parseFloat((this.cacheTotalSize / 1024 / 1024).toFixed(2)),
      hitRate: 0,
    }
  }

  /**
   * 清空所有缓存
   */
  clearCache(): void {
    this.base64Cache.clear()
    this.cacheTotalSize = 0
  }

  /**
   * 删除会话关联的所有图片（磁盘文件 + 数据库记录 + 缓存）
   */
  async deleteImagesBySession(sessionId: string): Promise<number> {
    const images = await this.imageRepo.findBySessionId(sessionId)
    let deletedCount = 0

    for (const image of images) {
      this.invalidateCache(image.id)

      try {
        await fs.unlink(image.storagePath)
      } catch {
        // 文件可能已删除
      }

      if (image.llmReadyPath) {
        try {
          await fs.unlink(image.llmReadyPath)
        } catch {
          // 忽略
        }
      }

      deletedCount++
    }

    await this.imageRepo.deleteBySessionId(sessionId)
    console.log(`[ImageStorageService] 已清理会话 ${sessionId} 的 ${deletedCount} 张图片`)
    return deletedCount
  }

  /**
   * 删除用户关联的所有图片（磁盘文件 + 数据库记录 + 缓存）
   */
  async deleteImagesByUser(userId: string): Promise<number> {
    const images = await this.imageRepo.findByUserId(userId)
    let deletedCount = 0

    for (const image of images) {
      this.invalidateCache(image.id)

      try {
        await fs.unlink(image.storagePath)
      } catch {
        // 文件可能已删除
      }

      if (image.llmReadyPath) {
        try {
          await fs.unlink(image.llmReadyPath)
        } catch {
          // 忽略
        }
      }

      deletedCount++
    }

    await this.imageRepo.deleteByUserId(userId)
    console.log(`[ImageStorageService] 已清理用户 ${userId} 的 ${deletedCount} 张图片`)
    return deletedCount
  }

  /**
   * 清理孤立图片（无 session 关联且超过指定天数）
   */
  async cleanupOrphanImages(olderThanDays: number = 30): Promise<number> {
    const orphanImages = await this.imageRepo.findOrphanImages(olderThanDays)
    let deletedCount = 0

    for (const image of orphanImages) {
      this.invalidateCache(image.id)

      try {
        await fs.unlink(image.storagePath)
      } catch {
        // 文件可能已删除
      }

      if (image.llmReadyPath) {
        try {
          await fs.unlink(image.llmReadyPath)
        } catch {
          // 忽略
        }
      }

      await this.imageRepo.delete(image.id)
      deletedCount++
    }

    if (deletedCount > 0) {
      console.log(`[ImageStorageService] 已清理 ${deletedCount} 张孤立图片（超过 ${olderThanDays} 天）`)
    }
    return deletedCount
  }

  /**
   * 生成 LLM 就绪的压缩版本
   * 使用固定参数确保同一图片始终生成相同的 base64，保证前缀缓存命中
   */
  private async generateLlmReadyVersion(
    fileBuffer: Buffer,
    mimeType: string,
    outputDir: string,
    originalFilename: string
  ): Promise<string> {
    const llmReadyFilename = `llm-${originalFilename}`
    const llmReadyPath = path.join(outputDir, llmReadyFilename)

    try {
      let pipeline = sharp(fileBuffer)

      const metadata = await sharp(fileBuffer).metadata()
      const needsResize = (metadata.width && metadata.width > IMAGE_PROCESSING_CONFIG.maxWidth) ||
        (metadata.height && metadata.height > IMAGE_PROCESSING_CONFIG.maxHeight)

      if (needsResize) {
        pipeline = pipeline.resize(IMAGE_PROCESSING_CONFIG.maxWidth, IMAGE_PROCESSING_CONFIG.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
      }

      if (mimeType === 'image/png') {
        pipeline = pipeline.png({ compressionLevel: 9, palette: true })
      } else {
        pipeline = pipeline.jpeg({ quality: IMAGE_PROCESSING_CONFIG.defaultQuality })
      }

      await pipeline.toFile(llmReadyPath)

      const compressedBuffer = await fs.readFile(llmReadyPath)
      const base64Size = compressedBuffer.toString('base64').length

      if (base64Size > IMAGE_PROCESSING_CONFIG.maxBase64Size) {
        pipeline = sharp(fileBuffer).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: IMAGE_PROCESSING_CONFIG.compressedQuality })
        await pipeline.toFile(llmReadyPath)
      }

      return llmReadyPath
    } catch (error) {
      console.error('[ImageStorageService] 生成 LLM 就绪版本失败:', error)
      return llmReadyPath
    }
  }

  /**
   * 确保聊天图片目录存在
   */
  private async ensureChatImagesDir(userId: string): Promise<string> {
    const baseDir = resolveWorkspaceBaseDir()
    const chatImagesDir = path.join(baseDir, 'users', userId, 'chat-images')

    if (!existsSync(chatImagesDir)) {
      await fs.mkdir(chatImagesDir, { recursive: true })
    }

    return chatImagesDir
  }

  /**
   * 验证图片类型和大小
   */
  private validateImage(mimeType: string, size: number): void {
    if (!IMAGE_PROCESSING_CONFIG.allowedMimeTypes.includes(mimeType as any)) {
      throw new Error(`不支持的图片类型: ${mimeType}，支持: ${IMAGE_PROCESSING_CONFIG.allowedMimeTypes.join(', ')}`)
    }

    if (size > IMAGE_PROCESSING_CONFIG.maxFileSize) {
      throw new Error(`图片大小 ${size} 字节超过限制 ${IMAGE_PROCESSING_CONFIG.maxFileSize} 字节`)
    }
  }

  /**
   * 从 MIME 类型获取文件扩展名
   */
  private getExtensionFromMime(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
    }
    return mimeToExt[mimeType] || '.bin'
  }

  /**
   * 从 URL 路径中提取图片 ID
   */
  private extractImageId(url: string): string {
    const match = url.match(/\/api\/chat\/images\/([^/?]+)/)
    if (match) return match[1]
    return url
  }
}

export const imageStorageService = ImageStorageService.getInstance()
