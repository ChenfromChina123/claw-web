/**
 * 文件大小限制和截断工具
 * 
 * 参考 Claude Code 实现：
 * - src/constants/toolLimits.ts
 * - src/utils/toolResultStorage.ts
 * - src/utils/truncate.ts
 * 
 * 功能：
 * - 集中管理所有文件大小限制常量
 * - 提供统一的截断逻辑
 * - 防止大文件直接传给 LLM 导致 Token 超限
 */

import os from 'os'
import fs from 'fs'
import path from 'path'

// ==================== 文件大小限制常量 ====================

/**
 * 工具结果大小限制
 */
export const TOOL_RESULT_LIMITS = {
  /** 单个工具结果最大字符数 (50KB) */
  MAX_CHARS: 50_000,
  
  /** 单个工具结果最大字节数 (100K tokens ≈ 400KB) */
  MAX_BYTES: 400_000,
  
  /** 每条消息所有工具结果最大字符数 (200KB) */
  MAX_PER_MESSAGE_CHARS: 200_000,
  
  /** 工具摘要最大长度 */
  SUMMARY_MAX_LENGTH: 50,
  
  /** 预览大小 (持久化时使用) */
  PREVIEW_SIZE: 2000,
} as const

/**
 * 文件读取大小限制
 */
export const FILE_READ_LIMITS = {
  /** 最大行数 */
  MAX_LINES: 10_000,
  
  /** 最大字节数 (256KB) */
  MAX_BYTES: 256 * 1024,
  
  /** 快速路径最大文件大小 (10MB) */
  FAST_PATH_MAX_BYTES: 10 * 1024 * 1024,
} as const

/**
 * 图片处理大小限制
 */
export const IMAGE_LIMITS = {
  /** 最大图片文件大小 (10MB) */
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  
  /** 最大 Base64 输出大小 (2MB) */
  MAX_BASE64_SIZE: 2 * 1024 * 1024,
  
  /** 最大宽度 */
  MAX_WIDTH: 2048,
  
  /** 最大高度 */
  MAX_HEIGHT: 2048,
  
  /** 默认压缩质量 */
  DEFAULT_QUALITY: 80,
} as const

/**
 * 附件大小限制
 */
export const ATTACHMENT_LIMITS = {
  /** 文本附件最大大小 (10MB) */
  TEXT_MAX_SIZE: 10 * 1024 * 1024,
  
  /** 二进制附件最大大小 (50MB) */
  BINARY_MAX_SIZE: 50 * 1024 * 1024,
  
  /** Skill 文件最大大小 (1MB) */
  SKILL_MAX_SIZE: 1 * 1024 * 1024,
} as const

/**
 * Token 估算常量
 */
export const TOKEN_ESTIMATION = {
  /** 每个 Token 约 4 字节 */
  BYTES_PER_TOKEN: 4,
  
  /** 工具调用开销 (约 500 tokens) */
  TOOL_CALL_OVERHEAD: 500,
} as const

// ==================== 截断结果类型 ====================

export interface TruncateResult {
  /** 截断后的内容 */
  truncated: string
  /** 是否被截断 */
  wasTruncated: boolean
  /** 原始大小 */
  originalSize: number
  /** 截断点字节数 */
  truncatedAt?: number
  /** 剩余行数信息 */
  remainingLines?: number
}

// ==================== 截断函数 ====================

/**
 * 截断字符串，尽量在行边界截断
 * 
 * @param content 原始内容
 * @param maxChars 最大字符数
 * @returns 截断结果
 */
export function truncateString(content: string, maxChars: number): TruncateResult {
  if (content.length <= maxChars) {
    return {
      truncated: content,
      wasTruncated: false,
      originalSize: content.length,
    }
  }

  // 尽量在行边界截断
  const truncated = content.slice(0, maxChars)
  const lastNewline = truncated.lastIndexOf('\n')
  
  // 如果最后一个换行符位置超过 70%，使用它作为截断点
  const cutPoint = lastNewline > maxChars * 0.7 ? lastNewline : maxChars
  
  const finalContent = content.slice(0, cutPoint)
  const lines = finalContent.split('\n')
  
  return {
    truncated: finalContent,
    wasTruncated: true,
    originalSize: content.length,
    truncatedAt: cutPoint,
    remainingLines: lines.length,
  }
}

/**
 * 截断工具结果，自动添加截断提示
 * 
 * @param content 原始内容
 * @param toolName 工具名称（用于日志）
 * @param maxChars 最大字符数
 * @returns 截断结果，包含提示信息
 */
export function truncateToolResult(
  content: string,
  toolName: string,
  maxChars: number = TOOL_RESULT_LIMITS.MAX_CHARS
): { result: string; wasTruncated: boolean; originalSize: number } {
  const truncated = truncateString(content, maxChars)
  
  if (!truncated.wasTruncated) {
    return {
      result: content,
      wasTruncated: false,
      originalSize: content.length,
    }
  }

  const truncationNotice = `\n\n[输出已截断] 原始大小: ${formatBytes(truncated.originalSize)}, 截断至: ${formatBytes(truncated.truncatedAt || maxChars)}`

  console.warn(`[${toolName}] 输出被截断: ${formatBytes(truncated.originalSize)} -> ${formatBytes(truncated.truncatedAt || maxChars)}`)

  return {
    result: truncated.truncated + truncationNotice,
    wasTruncated: true,
    originalSize: truncated.originalSize,
  }
}

/**
 * 截断文件读取结果
 * 
 * @param content 文件内容
 * @param options 截断选项
 * @returns 截断结果
 */
export function truncateFileRead(
  content: string,
  options: {
    maxLines?: number
    maxBytes?: number
    filePath?: string
  } = {}
): { content: string; wasTruncated: boolean; info: FileReadTruncationInfo } {
  const maxLines = options.maxLines || FILE_READ_LIMITS.MAX_LINES
  const maxBytes = options.maxBytes || FILE_READ_LIMITS.MAX_BYTES

  const lines = content.split('\n')
  const totalLines = lines.length
  const totalBytes = content.length

  // 检查行数限制
  if (totalLines > maxLines) {
    const truncatedLines = lines.slice(0, maxLines)
    const truncatedContent = truncatedLines.join('\n')
    
    return {
      content: truncatedContent,
      wasTruncated: true,
      info: {
        originalLines: totalLines,
        readLines: maxLines,
        originalBytes: totalBytes,
        truncatedBytes: truncatedContent.length,
        truncatedType: 'lines',
        message: `文件共 ${totalLines} 行，已截断至前 ${maxLines} 行。`,
        remainingLines: totalLines - maxLines,
      },
    }
  }

  // 检查字节限制
  if (totalBytes > maxBytes) {
    const truncated = truncateString(content, maxBytes)
    
    return {
      content: truncated.truncated,
      wasTruncated: true,
      info: {
        originalLines: totalLines,
        readLines: truncated.remainingLines || 0,
        originalBytes: totalBytes,
        truncatedBytes: truncated.truncatedAt || maxBytes,
        truncatedType: 'bytes',
        message: `文件共 ${formatBytes(totalBytes)}，已截断至 ${formatBytes(maxBytes)}。`,
      },
    }
  }

  return {
    content,
    wasTruncated: false,
    info: {
      originalLines: totalLines,
      readLines: totalLines,
      originalBytes: totalBytes,
      truncatedBytes: totalBytes,
      truncatedType: null,
      message: null,
    },
  }
}

export interface FileReadTruncationInfo {
  originalLines: number
  readLines: number
  originalBytes: number
  truncatedBytes: number
  truncatedType: 'lines' | 'bytes' | null
  message: string | null
  remainingLines?: number
}

// ==================== 工具结果持久化 ====================

/**
 * 持久化工具结果的存储目录
 */
let toolResultStorageDir: string | null = null

/**
 * 获取工具结果存储目录
 */
export function getToolResultStorageDir(): string {
  if (!toolResultStorageDir) {
    toolResultStorageDir = path.join(os.tmpdir(), 'claw-tool-results')
    fs.mkdirSync(toolResultStorageDir, { recursive: true })
  }
  return toolResultStorageDir
}

export interface PersistedToolResult {
  id: string
  preview: string
  storagePath: string
  originalSize: number
  createdAt: Date
}

/**
 * 持久化大型工具结果
 * 
 * @param content 原始内容
 * @param toolUseId 工具调用 ID
 * @param previewSize 预览大小
 * @returns 持久化结果
 */
export async function persistToolResult(
  content: string,
  toolUseId: string,
  previewSize: number = TOOL_RESULT_LIMITS.PREVIEW_SIZE
): Promise<PersistedToolResult> {
  const id = `tool-result-${toolUseId}-${Date.now()}`
  const storagePath = path.join(getToolResultStorageDir(), `${id}.json`)
  
  const data = {
    id,
    content,
    toolUseId,
    createdAt: new Date().toISOString(),
  }
  
  await fs.promises.writeFile(storagePath, JSON.stringify(data), 'utf-8')
  
  return {
    id,
    preview: content.slice(0, previewSize),
    storagePath,
    originalSize: content.length,
    createdAt: new Date(),
  }
}

/**
 * 从持久化存储中读取结果
 * 
 * @param id 持久化结果 ID
 * @returns 原始内容或 null
 */
export async function retrievePersistedResult(id: string): Promise<string | null> {
  const storagePath = path.join(getToolResultStorageDir(), `${id}.json`)
  
  try {
    const data = await fs.promises.readFile(storagePath, 'utf-8')
    const parsed = JSON.parse(data)
    return parsed.content
  } catch {
    return null
  }
}

// ==================== 辅助函数 ====================

/**
 * 格式化文件大小
 * 
 * @param bytes 字节数
 * @returns 格式化后的字符串
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`
}

/**
 * 估算 Token 数量
 * 
 * @param text 文本
 * @returns 估算的 Token 数
 */
export function estimateTokens(text: string): number {
  // 粗略估算：每 4 字符约 1 Token
  return Math.ceil(text.length / TOKEN_ESTIMATION.BYTES_PER_TOKEN)
}

/**
 * 估算消息列表的 Token 数
 * 
 * @param messages 消息列表
 * @returns 估算的 Token 数
 */
export function estimateMessagesTokens(messages: Array<{ role: string; content: unknown }>): number {
  let total = 0
  
  for (const msg of messages) {
    const content = typeof msg.content === 'string' 
      ? msg.content 
      : JSON.stringify(msg.content)
    total += estimateTokens(content)
  }
  
  // 加上工具调用开销
  const toolCallsCount = messages.filter(m => {
    if (typeof m.content !== 'string') {
      return (m.content as Array<{ type?: string }>)?.some(c => c.type === 'tool_use')
    }
    return false
  }).length
  
  total += toolCallsCount * TOKEN_ESTIMATION.TOOL_CALL_OVERHEAD
  
  return total
}

/**
 * 检查内容是否超过限制
 * 
 * @param content 内容
 * @param maxBytes 最大字节数
 * @returns 是否超过
 */
export function exceedsLimit(content: string, maxBytes: number): boolean {
  return content.length > maxBytes
}

// ==================== 配置加载 ====================

/**
 * 从环境变量加载限制配置
 */
export function loadLimitsFromEnv(): {
  toolResultMaxChars: number
  fileReadMaxBytes: number
  imageMaxFileSize: number
} {
  return {
    toolResultMaxChars: parseInt(process.env.TOOL_RESULT_MAX_CHARS || '', 10) || TOOL_RESULT_LIMITS.MAX_CHARS,
    fileReadMaxBytes: parseInt(process.env.FILE_READ_MAX_BYTES || '', 10) || FILE_READ_LIMITS.MAX_BYTES,
    imageMaxFileSize: parseInt(process.env.IMAGE_MAX_FILE_SIZE || '', 10) || IMAGE_LIMITS.MAX_FILE_SIZE,
  }
}

export default {
  TOOL_RESULT_LIMITS,
  FILE_READ_LIMITS,
  IMAGE_LIMITS,
  ATTACHMENT_LIMITS,
  TOKEN_ESTIMATION,
  truncateString,
  truncateToolResult,
  truncateFileRead,
  persistToolResult,
  retrievePersistedResult,
  formatBytes,
  estimateTokens,
  estimateMessagesTokens,
  exceedsLimit,
  loadLimitsFromEnv,
}
