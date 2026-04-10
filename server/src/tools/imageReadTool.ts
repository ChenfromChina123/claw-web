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
 * 参考 claude-code-haha/src/tools/FileReadTool 的实现
 */

import { readFile, stat } from 'fs/promises'
import { join, resolve, extname } from 'path'
import sharp from 'sharp'
import { llmService } from '../services/llmService'

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
 * 
 * 使用 sharp 库进行智能图片处理：
 * 1. 获取原始图片尺寸
 * 2. 如果超过最大尺寸，按比例缩小
 * 3. 转换为 JPEG 格式以减小体积
 * 4. 应用质量压缩
 * 
 * @param imageBuffer 原始图片缓冲区
 * @param filePath 文件路径（用于推断格式）
 * @param options 处理选项
 * @returns 处理后的图片缓冲区和元信息
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
    // 获取图片元信息（不解码整个图片）
    const metadata = await sharp(imageBuffer).metadata()
    
    const originalWidth = metadata.width || 0
    const originalHeight = metadata.height || 0
    const format = metadata.format || ext
    
    let processedBuffer = imageBuffer
    let displayWidth: number | undefined
    let displayHeight: number | undefined
    let wasProcessed = false
    
    // 如果不是要求完整尺寸，则进行优化处理
    if (!options.fullSize) {
      // 创建 sharp 实例进行转换
      let pipeline = sharp(imageBuffer)
      
      // 检查是否需要调整尺寸
      const needsResize = 
        originalWidth > options.maxWidth || 
        originalHeight > options.maxHeight
      
      if (needsResize) {
        // 按比例缩放，保持宽高比
        pipeline = pipeline.resize(options.maxWidth, options.maxHeight, {
          fit: 'inside',      // 保持比例，完全在边界内
          withoutEnlargement: true  // 不放大小图
        })
        wasProcessed = true
        
        // 计算实际输出尺寸
        const ratio = Math.min(
          options.maxWidth / originalWidth,
          options.maxHeight / originalHeight
        )
        displayWidth = Math.round(originalWidth * ratio)
        displayHeight = Math.round(originalHeight * ratio)
      }
      
      // 转换为 JPEG 格式（除非原图就是 PNG 且较小）
      if (ext !== 'png' || imageBuffer.length > 500000) {
        pipeline = pipeline.jpeg({
          quality: options.quality,
          mozjpeg: true  // 使用 mozjpeg 编码器获得更好的压缩率
        })
        wasProcessed = true
      } else if (ext === 'png') {
        // 小 PNG 图片保持原格式但进行优化
        pipeline = pipeline.png({
          compressionLevel: 9,
          palette: true,  // 如果可能，使用调色板模式
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
    // 如果 sharp 处理失败，返回原始数据
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
 * 执行图片读取操作
 * 
 * 主要流程：
 * 1. 验证输入参数
 * 2. 检查文件是否存在且为图片格式
 * 3. 读取文件内容
 * 4. 处理和压缩图片
 * 5. 返回 Base64 编码的结果
 * 
 * @param input 工具输入参数
 * @param projectRoot 项目根目录
 * @returns 图片读取结果
 */
export async function executeImageRead(
  input: ImageReadInput,
  projectRoot: string
): Promise<ImageReadResult> {
  try {
    // 1. 验证输入
    const validation = validateImageReadInput(input)
    if (!validation.valid) {
      return {
        success: false,
        error: `输入验证失败:\n${validation.errors.join('\n')}`
      }
    }
    
    const { path: imagePath, maxWidth, maxHeight, quality, fullSize } = input
    
    // 2. 解析路径
    const resolvedPath = imagePath.startsWith('/') || /^[a-zA-Z]:/.test(imagePath)
      ? imagePath
      : resolve(projectRoot, imagePath)
    
    // 3. 检查文件是否存在
    let fileStats
    try {
      fileStats = await stat(resolvedPath)
    } catch {
      return {
        success: false,
        error: `文件不存在: ${resolvedPath}`
      }
    }
    
    // 4. 检查是否为目录
    if (fileStats.isDirectory()) {
      return {
        success: false,
        error: '路径是目录，请提供具体的图片文件路径'
      }
    }
    
    // 5. 检查是否为支持的图片格式
    if (!isSupportedImageFormat(resolvedPath)) {
      const ext = extname(resolvedPath)
      return {
        success: false,
        error: `不支持的图片格式: ${ext}\n支持的格式: ${Array.from(SUPPORTED_IMAGE_EXTENSIONS).join(', ')}`
      }
    }
    
    // 6. 检查文件大小
    if (fileStats.size > IMAGE_CONFIG.maxFileSize) {
      return {
        success: false,
        error: `文件过大: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB\n最大支持: ${IMAGE_CONFIG.maxFileSize / 1024 / 1024}MB`
      }
    }
    
    // 7. 读取文件
    const imageBuffer = await readFile(resolvedPath)
    
    if (imageBuffer.length === 0) {
      return {
        success: false,
        error: '图片文件为空'
      }
    }
    
    // 8. 处理图片
    const { buffer: processedBuffer, metadata } = await processImage(imageBuffer, resolvedPath, {
      maxWidth: maxWidth || IMAGE_CONFIG.maxWidth,
      maxHeight: maxHeight || IMAGE_CONFIG.maxHeight,
      quality: quality || IMAGE_CONFIG.defaultQuality,
      fullSize: fullSize || false
    })
    
    // 9. 转换为 Base64
    const base64 = processedBuffer.toString('base64')
    
    // 10. 检查 Base64 大小
    if (base64.length > IMAGE_CONFIG.maxBase64Size && !fullSize) {
      // 如果还是太大，使用更激进的压缩
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
        // 继续使用之前的结果
      }
    }
    
    // 11. 返回结果
    return {
      success: true,
      result: {
        base64,
        mimeType: metadata.mimeType,
        metadata,
        path: resolvedPath
      }
    }
    
  } catch (error) {
    console.error('[ImageRead] 执行错误:', error)
    return {
      success: false,
      error: `图片读取失败: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

/**
 * 创建图片描述文本（供 Agent 理解图片内容）
 */
export function createImageDescription(metadata: ImageMetadata): string {
  const lines = [
    `📷 图片信息:`,
    `- 格式: ${metadata.format.toUpperCase()}`,
    `- 尺寸: ${metadata.originalWidth} × ${metadata.originalHeight} 像素`,
    `- 文件大小: ${(metadata.originalSize / 1024).toFixed(1)} KB`,
  ]
  
  if (metadata.wasProcessed) {
    lines.push(`- 已优化: ${metadata.displayWidth} × ${metadata.displayHeight} 像素 (${(metadata.outputSize / 1024).toFixed(1)} KB)`)
  }
  
  return lines.join('\n')
}
