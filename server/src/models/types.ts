export interface User {
  id: string
  username: string
  email?: string
  passwordHash?: string
  avatar?: string
  isActive?: boolean
  isAdmin?: boolean
  createdAt: Date
  updatedAt: Date
  lastLogin?: Date
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
  toolCalls?: ToolCall[]
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
  toolCalls?: ToolCall[]
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

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  username: string
  password: string
  code: string
}

export interface ResetPasswordRequest {
  email: string
  code: string
  newPassword: string
}

export interface AuthResponse {
  accessToken: string
  tokenType: string
  userId: string
  username: string
  email: string
  isAdmin: boolean
  avatar?: string
}
