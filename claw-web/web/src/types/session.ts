/**
 * 会话相关类型定义
 * 从 server/src/models/types.ts 迁移并扩展
 */

import type { Message } from './message'
import type { ToolCall } from './tool'

export type ToolCallMap = Map<string, ToolCall[]>

export interface Session {
  id: string
  userId: string
  title: string
  model: string
  isPinned?: boolean
  createdAt: Date | string
  updatedAt: Date | string
  messageCount?: number
  lastMessageAt?: Date | string
}

export interface SessionListItem {
  id: string
  title: string
  model: string
  createdAt: Date | string
  updatedAt: Date | string
  lastMessagePreview?: string
  messageCount?: number
  unreadCount?: number
  isPinned?: boolean
}

export interface CreateSessionRequest {
  title?: string
  model?: string
  systemPrompt?: string
  tools?: string[]
  mcpServers?: string[]
}

export interface UpdateSessionRequest {
  title?: string
  model?: string
  isPinned?: boolean
}

export interface SessionWithMessages {
  session: Session
  messages: Message[]
  toolCalls: ToolCallMap
}
