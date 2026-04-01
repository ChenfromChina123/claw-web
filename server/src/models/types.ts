export interface User {
  id: string
  username: string
  createdAt: Date
  updatedAt: Date
}

export interface Session {
  id: string
  userId: string
  title: string
  model: string
  createdAt: Date
  updatedAt: Date
}

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: Date
}

export interface ToolCall {
  id: string
  messageId: string
  sessionId: string
  toolName: string
  toolInput: Record<string, unknown>
  toolOutput: Record<string, unknown> | null
  status: 'pending' | 'executing' | 'completed' | 'error'
  createdAt: Date
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ToolResult {
  toolUseId: string
  toolName: string
  result?: unknown
  error?: string
}

export interface SessionWithMessages {
  session: Session
  messages: Message[]
  toolCalls: Map<string, ToolCall[]>
}

export interface WebSocketMessage {
  type: string
  [key: string]: unknown
}
