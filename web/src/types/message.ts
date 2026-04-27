/**
 * 消息相关类型定义
 * 支持：文本消息、工具调用、思维链、系统消息等
 */

import type { ToolCall } from './tool'

export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageType = 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'system' | 'error' | 'image'

/** 图片附件类型 */
export interface ImageAttachment {
  imageId: string
  type: 'image'
  originalName?: string
  mimeType?: string
}

/** 图片内容块（多模态消息中的图片部分） */
export interface ImageContentBlock {
  type: 'image'
  source: {
    type: 'url'
    url: string
    media_type: string
  }
}

/** 文本内容块 */
export interface TextContentBlock {
  type: 'text'
  text: string
}

export interface BaseMessage {
  id: string
  sessionId: string
  role: MessageRole
  type: MessageType
  createdAt: Date | string
  updatedAt?: Date | string
  sequence?: number  // 消息序号，用于确保消息顺序
}

export interface TextMessage extends BaseMessage {
  type: 'text'
  content: string
  isStreaming?: boolean
  attachments?: ImageAttachment[]
  imageBlocks?: ImageContentBlock[]
}

export interface ImageMessage extends BaseMessage {
  type: 'image'
  content: string
  imageUrl: string
  imageId: string
  mimeType: string
  originalName?: string
}

export interface ToolUseMessage extends BaseMessage {
  type: 'tool_use'
  toolName: string
  toolInput: Record<string, unknown>
  toolCallId: string
  status: 'pending' | 'executing' | 'completed' | 'error'
  toolOutput?: unknown
  error?: string
}

export interface ToolResultMessage extends BaseMessage {
  type: 'tool_result'
  toolUseId: string
  toolName: string
  result?: unknown
  error?: string
  isAccepted?: boolean
}

export interface ThinkingMessage extends BaseMessage {
  type: 'thinking'
  content: string
  isCollapsed?: boolean
}

export interface SystemMessage extends BaseMessage {
  type: 'system'
  content: string
  level: 'info' | 'warning' | 'error'
}

export interface ErrorMessage extends BaseMessage {
  type: 'error'
  content: string
  code?: string
  recoverable?: boolean
}

export type Message = TextMessage | ImageMessage | ToolUseMessage | ToolResultMessage | ThinkingMessage | SystemMessage | ErrorMessage

export interface MessageGroup {
  id: string
  messages: Message[]
  role: MessageRole
  timestamp: Date | string
}

export interface ConversationTurn {
  id: string
  userMessage?: TextMessage
  assistantMessages: Message[]
  toolCalls: ToolCall[]
  timestamp: Date | string
}
