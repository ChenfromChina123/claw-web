/**
 * 图片存储服务 - 处理图片的上传、压缩、存储和 LLM 格式转换
 *
 * 功能：
 * - 保存图片到磁盘（chat-images/ 目录）
 * - 使用 sharp 压缩/调整图片尺寸
 * - 生成 LLM 就绪的压缩版本（确保缓存一致性）
 * - 将 URL 引用转为 base64（供 LLM API 调用）
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
   * 获取 LLM 就绪版本的 base64 数据
   */
  private async getLlmReadyBase64(imageId: string): Promise<string | null> {
    const image = await this.imageRepo.findById(imageId)
    if (!image) return null

    const filePath = image.llmReadyPath || image.storagePath
    try {
      const buffer = await fs.readFile(filePath)
      return buffer.toString('base64')
    } catch {
      return null
    }
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
