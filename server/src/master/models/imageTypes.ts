/**
 * 图片相关类型定义
 *
 * 定义多模态消息中图片内容块的类型，以及图片存储元数据
 */

/** 图片内容块 - 数据库存储格式（URL 引用，不存 base64） */
export interface ImageContentBlock {
  type: 'image'
  source: {
    type: 'url'
    url: string
    media_type: string
  }
}

/** 图片内容块 - Anthropic API 格式（base64） */
export interface AnthropicImageBlock {
  type: 'image'
  source: {
    type: 'base64'
    media_type: string
    data: string
  }
  cache_control?: { type: 'ephemeral' }
}

/** 图片内容块 - OpenAI API 格式 */
export interface OpenAIImageBlock {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'auto' | 'low' | 'high'
  }
}

/** 文本内容块 */
export interface TextContentBlock {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

/** 工具调用内容块 */
export interface ToolUseContentBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

/** 工具结果内容块 */
export interface ToolResultContentBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string
  is_error?: boolean
}

/** 消息内容块联合类型（数据库存储格式） */
export type MessageContentBlock =
  | TextContentBlock
  | ImageContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock

/** 消息内容类型：字符串或内容块数组 */
export type MessageContent = string | MessageContentBlock[]

/** 图片元数据（chat_images 表） */
export interface ChatImage {
  id: string
  userId: string
  sessionId?: string
  messageId?: string
  filename: string
  originalName?: string
  mimeType: string
  size: number
  width?: number
  height?: number
  storagePath: string
  llmReadyPath?: string
  createdAt: Date | string
}

/** 图片上传结果 */
export interface ImageUploadResult {
  imageId: string
  url: string
  originalName: string
  mimeType: string
  size: number
  width?: number
  height?: number
}

/** 图片附件（WebSocket 消息中传递） */
export interface ImageAttachment {
  imageId: string
  type: 'image'
  originalName?: string
  mimeType?: string
}

/** 图片处理配置 */
export const IMAGE_PROCESSING_CONFIG = {
  maxWidth: 2048,
  maxHeight: 2048,
  defaultQuality: 80,
  compressedQuality: 60,
  maxFileSize: 10 * 1024 * 1024,
  maxBase64Size: 2 * 1024 * 1024,
  allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
  allowedExtensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
} as const
