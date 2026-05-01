/**
 * 图片读取工具 - 允许 Agent 查看和分析图片
 * 
 * 功能：
 * - 读取图片文件并使用大模型视觉 API 分析图片内容
 * - 自动压缩大图片以适应 token 限制
 * - 支持多种图片格式（PNG, JPG, JPEG, GIF, WebP, SVG, BMP, TIFF）
 * - 返回图片分析结果和元信息（尺寸、格式、大小等）
 * - 智能调整图片质量以平衡清晰度和 token 消耗
 * 
 * 参考 claw-web/src/tools/FileReadTool 的实现
 */

import { readFile, stat } from 'fs/promises'
import { join, resolve, extname } from 'path'
import sharp from 'sharp'
import { llmService } from '../services/llmService'

/**
 * 图片分析结果内存缓存（避免同一图片重复调用 LLM）
 */
const analysisCache = new Map<string, { text: string; mtimeMs: number }>()
const ANALYSIS_CACHE_MAX_SIZE = 100

/**
 * 支持的图片格式
 */
const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif'
])

/**
 * 图片 MIME 类型映射
 */
const MIME_TYPE_MAP: Record<string, string> = {
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'gif': 'image/gif',
  'webp': 'image/webp',
  'svg': 'image/svg+xml',
  'bmp': 'image/bmp',
  'tiff': 'image/tiff',
  'tif': 'image/tiff'
}

/**
 * 图片处理配置
 */
const IMAGE_CONFIG = {
  // 最大输出宽度（像素）
  maxWidth: 2048,
  // 最大输出高度（像素）  
  maxHeight: 2048,
  // 默认 JPEG 质量 (0-100)
  defaultQuality: 80,
  // 压缩模式的质量 (用于大图)
  compressedQuality: 60,
  // 最大文件大小限制 (10MB)
  maxFileSize: 10 * 1024 * 1024,
  // Base64 后的最大大小估算 (约 2MB base64 = ~1.5MB 原始数据)
  maxBase64Size: 2 * 1024 * 1024
}

/**
 * 图片元信息接口
 */
export interface ImageMetadata {
  /** 原始宽度 */
  originalWidth: number
  /** 原始高度 */
  originalHeight: number
  /** 输出宽度（可能被调整） */
  displayWidth?: number
  /** 输出高度（可能被调整） */
  displayHeight?: number
  /** 图片格式 */
  format: string
  /** 原始文件大小（字节） */
  originalSize: number
  /** 输出数据大小（字节） */
  outputSize: number
  /** MIME 类型 */
  mimeType: string
  /** 是否被压缩/调整大小 */
  wasProcessed: boolean
}

/**
 * 图片读取结果接口
 */
export interface ImageReadResult {
  /** 是否成功 */
  success: boolean
  /** 结果数据 */
  result?: {
    /** Base64 编码的图片数据（仅内部使用，不返回给 Agent） */
    base64?: string
    /** MIME 类型 */
    mimeType: string
    /** 图片元信息 */
    metadata: ImageMetadata
    /** 文件路径 */
    path: string
    /** 大模型分析后的图片描述（返回给 Agent 的内容） */
    analysis?: string
    /** 是否使用了大模型分析 */
    analyzed?: boolean
  }
  /** 错误信息 */
  error?: string
}

/**
 * 工具输入参数接口
 */
export interface ImageReadInput {
  /** 图片文件路径 */
  path: string
  /** 可选：最大宽度（覆盖默认值） */
  maxWidth?: number
  /** 可选：最大高度（覆盖默认值） */
  maxHeight?: number
  /** 可选：图片质量 0-100（覆盖默认值） */
  quality?: number
  /** 可选：是否返回完整尺寸（不压缩） */
  fullSize?: boolean
}

/**
 * 验证输入参数
 */
export function validateImageReadInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['输入必须是对象'] }
  }
  
  const { path, maxWidth, maxHeight, quality, fullSize } = input as Record<string, unknown>
  
  if (!path || typeof path !== 'string') {
    errors.push('path 是必需参数，且必须是字符串')
  }
  
  if (maxWidth !== undefined && (typeof maxWidth !== 'number' || maxWidth <= 0)) {
    errors.push('maxWidth 必须是正数')
  }
  
  if (maxHeight !== undefined && (typeof maxHeight !== 'number' || maxHeight <= 0)) {
    errors.push('maxHeight 必须是正数')
  }
  
  if (quality !== undefined && (typeof quality !== 'number' || quality < 0 || quality > 100)) {
    errors.push('quality 必须是 0-100 之间的数字')
  }
  
  if (fullSize !== undefined && typeof fullSize !== 'boolean') {
    errors.push('fullSize 必须是布尔值')
  }
  
  return { valid: errors.length === 0, errors }
}

/**
 * 检查文件是否为支持的图片格式
 */
function isSupportedImageFormat(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase().slice(1)
  return SUPPORTED_IMAGE_EXTENSIONS.has(ext)
}

/**
 * 获取文件的 MIME 类型
 */
function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase().slice(1)
  return MIME_TYPE_MAP[ext] || 'application/octet-stream'
}

/**
 * 处理和压缩图片
 */
async function processImage(
  imageBuffer: Buffer,
  filePath: string,
  options: {
    maxWidth: number
    maxHeight: number
    quality: number
    fullSize: boolean
  }
): Promise<{ buffer: Buffer; metadata: ImageMetadata }> {
  const ext = extname(filePath).toLowerCase().slice(1)
  
  try {
    const metadata = await sharp(imageBuffer).metadata()
    
    const originalWidth = metadata.width || 0
    const originalHeight = metadata.height || 0
    const format = metadata.format || ext
    
    let processedBuffer = imageBuffer
    let displayWidth: number | undefined
    let displayHeight: number | undefined
    let wasProcessed = false
    
    if (!options.fullSize) {
      let pipeline = sharp(imageBuffer)
      
      const needsResize = 
        originalWidth > options.maxWidth || 
        originalHeight > options.maxHeight
      
      if (needsResize) {
        pipeline = pipeline.resize(options.maxWidth, options.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        wasProcessed = true
        
        const ratio = Math.min(
          options.maxWidth / originalWidth,
          options.maxHeight / originalHeight
        )
        displayWidth = Math.round(originalWidth * ratio)
        displayHeight = Math.round(originalHeight * ratio)
      }
      
      if (ext !== 'png' || imageBuffer.length > 500000) {
        pipeline = pipeline.jpeg({
          quality: options.quality,
          mozjpeg: true
        })
        wasProcessed = true
      } else if (ext === 'png') {
        pipeline = pipeline.png({
          compressionLevel: 9,
          palette: true,
          quality: options.quality
        })
        wasProcessed = true
      }
      
      processedBuffer = await pipeline.toBuffer()
    }
    
    const resultMetadata: ImageMetadata = {
      originalWidth,
      originalHeight,
      displayWidth: displayWidth || originalWidth,
      displayHeight: displayHeight || originalHeight,
      format,
      originalSize: imageBuffer.length,
      outputSize: processedBuffer.length,
      mimeType: wasProcessed ? (options.fullSize ? getMimeType(filePath) : 'image/jpeg') : getMimeType(filePath),
      wasProcessed
    }
    
    return {
      buffer: processedBuffer,
      metadata: resultMetadata
    }
    
  } catch (error) {
    console.error('[ImageRead] 图片处理失败:', error)
    
    return {
      buffer: imageBuffer,
      metadata: {
        originalWidth: 0,
        originalHeight: 0,
        format: ext,
        originalSize: imageBuffer.length,
        outputSize: imageBuffer.length,
        mimeType: getMimeType(filePath),
        wasProcessed: false
      }
    }
  }
}

/**
 * 使用大模型视觉 API 分析图片内容
 */
export async function analyzeImageWithLLM(
  base64Image: string,
  mimeType: string,
  metadata: ImageMetadata
): Promise<string> {
  try {
    console.log('[ImageRead] 开始使用大模型分析图片...')
    
    const messages = [
      {
        role: 'user' as const,
        content: [
          { 
            type: 'image' as const, 
            source: { 
              type: 'base64' as const, 
              media_type: mimeType, 
              data: base64Image 
            } 
          },
          { 
            type: 'text' as const, 
            text: '请详细描述这张图片的内容，包括：\n1. 图片中的主要物体和场景\n2. 颜色、光线等视觉特征\n3. 如果有文字，请提取出来\n4. 图片的类型（照片、截图、图表、设计图等）\n5. 任何其他重要的视觉信息\n\n请用中文回答。' 
          },
        ],
      },
    ]
    
    const response = await llmService.chat(messages, {
      maxTokens: 2048,
      temperature: 0.3,
    })
    
    console.log('[ImageRead] 大模型分析完成')
    
    return response.content
  } catch (error) {
    console.error('[ImageRead] 大模型分析失败:', error)
    return `[图片分析失败：${error instanceof Error ? error.message : String(error)}]\n\n图片基本信息：\n${createImageDescription(metadata)}`
  }
}

/**
 * 创建图片描述文本
 */
export function createImageDescription(metadata: ImageMetadata): string {
  const lines = [
    `📷 图片信息:`,
    `- 格式：${metadata.format.toUpperCase()}`,
    `- 尺寸：${metadata.originalWidth} × ${metadata.originalHeight} 像素`,
    `- 文件大小：${(metadata.originalSize / 1024).toFixed(1)} KB`,
  ]
  
  if (metadata.wasProcessed) {
    lines.push(`- 已优化：${metadata.displayWidth} × ${metadata.displayHeight} 像素 (${(metadata.outputSize / 1024).toFixed(1)} KB)`)
  }
  
  return lines.join('\n')
}

/**
 * 执行图片读取操作
 */
export async function executeImageRead(
  input: ImageReadInput,
  projectRoot: string
): Promise<ImageReadResult> {
  try {
    const validation = validateImageReadInput(input)
    if (!validation.valid) {
      return {
        success: false,
        error: `输入验证失败:\n${validation.errors.join('\n')}`
      }
    }
    
    const { path: imagePath, maxWidth, maxHeight, quality, fullSize } = input
    
    const resolvedPath = imagePath.startsWith('/') || /^[a-zA-Z]:/.test(imagePath)
      ? imagePath
      : resolve(projectRoot, imagePath)
    
    let fileStats
    try {
      fileStats = await stat(resolvedPath)
    } catch {
      return {
        success: false,
        error: `文件不存在：${resolvedPath}`
      }
    }
    
    if (fileStats.isDirectory()) {
      return {
        success: false,
        error: '路径是目录，请提供具体的图片文件路径'
      }
    }
    
    if (!isSupportedImageFormat(resolvedPath)) {
      const ext = extname(resolvedPath)
      return {
        success: false,
        error: `不支持的图片格式：${ext}\n支持的格式：${Array.from(SUPPORTED_IMAGE_EXTENSIONS).join(', ')}`
      }
    }
    
    if (fileStats.size > IMAGE_CONFIG.maxFileSize) {
      return {
        success: false,
        error: `文件过大：${(fileStats.size / 1024 / 1024).toFixed(2)}MB\n最大支持：${IMAGE_CONFIG.maxFileSize / 1024 / 1024}MB`
      }
    }
    
    const imageBuffer = await readFile(resolvedPath)
    
    if (imageBuffer.length === 0) {
      return {
        success: false,
        error: '图片文件为空'
      }
    }
    
    const { buffer: processedBuffer, metadata } = await processImage(imageBuffer, resolvedPath, {
      maxWidth: maxWidth || IMAGE_CONFIG.maxWidth,
      maxHeight: maxHeight || IMAGE_CONFIG.maxHeight,
      quality: quality || IMAGE_CONFIG.defaultQuality,
      fullSize: fullSize || false
    })
    
    const base64 = processedBuffer.toString('base64')
    
    if (base64.length > IMAGE_CONFIG.maxBase64Size && !fullSize) {
      console.warn('[ImageRead] 图片仍然过大，应用激进压缩')
      
      try {
        const aggressiveBuffer = await sharp(imageBuffer)
          .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 40, mozjpeg: true })
          .toBuffer()
        
        const aggressiveBase64 = aggressiveBuffer.toString('base64')
        
        return {
          success: true,
          result: {
            base64: aggressiveBase64,
            mimeType: 'image/jpeg',
            metadata: {
              ...metadata,
              outputSize: aggressiveBuffer.length,
              displayWidth: 1024,
              displayHeight: 1024,
              wasProcessed: true
            },
            path: resolvedPath
          }
        }
      } catch (compressError) {
        console.error('[ImageRead] 激进压缩失败:', compressError)
      }
    }
    
    // 检查内存缓存（基于文件路径和修改时间）
    const cacheKey = resolvedPath
    const cached = analysisCache.get(cacheKey)
    if (cached && cached.mtimeMs === fileStats.mtimeMs) {
      return {
        success: true,
        result: {
          base64,
          mimeType: metadata.mimeType,
          metadata,
          path: resolvedPath,
          analysis: cached.text,
          analyzed: true,
        },
      }
    }

    // 使用大模型分析图片内容（不直接返回 base64 给 Agent）
    const analysis = await analyzeImageWithLLM(base64, metadata.mimeType, metadata)

    // 缓存分析结果
    if (analysisCache.size >= ANALYSIS_CACHE_MAX_SIZE) {
      const firstKey = analysisCache.keys().next().value
      if (firstKey) analysisCache.delete(firstKey)
    }
    analysisCache.set(cacheKey, { text: analysis, mtimeMs: fileStats.mtimeMs })
    
    return {
      success: true,
      result: {
        base64, // 仅内部使用，不返回给 Agent
        mimeType: metadata.mimeType,
        metadata,
        path: resolvedPath,
        analysis, // 返回大模型分析结果
        analyzed: true
      }
    }
    
  } catch (error) {
    console.error('[ImageRead] 执行错误:', error)
    return {
      success: false,
      error: `图片读取失败：${error instanceof Error ? error.message : String(error)}`
    }
  }
}
