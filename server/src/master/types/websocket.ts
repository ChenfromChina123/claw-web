/**
 * WebSocket 相关类型定义
 */

/**
 * WebSocket 连接数据
 */
export interface WebSocketData {
  connectionId: string
  userId: string | null
  sessionId: string | null
  token: string | null
  sendEvent: ((event: string, data: unknown) => void) | null
}

/**
 * WebSocket 消息
 */
export interface WebSocketMessage {
  type: string
  [key: string]: unknown
}

/**
 * 会话对话状态
 */
export interface SessionConversationState {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  toolCalls: Array<{
    id: string
    name: string
    input: unknown
  }>
}

/**
 * 事件发送函数类型
 */
export type EventSender = (event: string, data: unknown) => void

/**
 * WebSocket 消息处理器
 */
export interface MessageHandler {
  (wsData: WebSocketData, message: WebSocketMessage, sendEvent: EventSender): Promise<void>
}

/**
 * 消息处理器映射
 */
export type MessageHandlers = Record<string, MessageHandler>