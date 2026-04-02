// 会话类型
export interface Session {
  id: string
  title: string
  userId: string
  model: string
  createdAt: Date
  updatedAt: Date
}

// 消息类型
export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: ToolCall[]
  createdAt?: Date
}

// 工具调用类型
export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output?: unknown
  status: 'pending' | 'completed' | 'error'
}

// 工具类型
export interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

// 模型类型
export interface Model {
  id: string
  name: string
  provider: string
}

// 用户类型
export interface User {
  id: string
  email: string
  username: string
  avatar?: string
  createdAt?: Date
}

// WebSocket 消息类型
export interface WSMessage {
  type: string
  [key: string]: unknown
}

// API 响应类型
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

// 登录请求
export interface LoginRequest {
  email: string
  password: string
}

// 注册请求
export interface RegisterRequest {
  email: string
  username: string
  password: string
  code: string
}

// 命令类型
export interface Command {
  name: string
  description: string
  usage: string
  category: 'general' | 'session' | 'config' | 'tools' | 'advanced'
}

// MCP 服务器类型
export interface MCPServer {
  id: string
  name: string
  command: string
  args: string[]
  enabled: boolean
}
