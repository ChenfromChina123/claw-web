/**
 * 消息相关类型定义
 * 支持：文本消息、工具调用、思维链、系统消息等
 */

import type { ToolCall } from './tool'

export type MessageRole = 'user' | 'assistant' | 'system'
export type MessageType = 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'system' | 'error'

export interface BaseMessage {
  id: string
  sessionId: string
  role: MessageRole
  type: MessageType
  createdAt: Date | string
  updatedAt?: Date | string
}

export interface TextMessage extends BaseMessage {
  type: 'text'
  content: string
  isStreaming?: boolean
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

export type Message = TextMessage | ToolUseMessage | ToolResultMessage | ThinkingMessage | SystemMessage | ErrorMessage

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
