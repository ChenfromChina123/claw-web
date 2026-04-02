/**
 * 工具相关类型定义
 * 包含工具定义、执行结果、状态等
 */

export type ToolCategory = 'file' | 'shell' | 'web' | 'system' | 'ai' | 'mcp'

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: ToolInputSchema
  category: ToolCategory
  permissions?: ToolPermissions
}

export interface ToolInputSchema {
  type: 'object'
  properties: Record<string, ToolProperty>
  required?: string[]
}

export interface ToolProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  enum?: string[]
  default?: unknown
  format?: string
}

export interface ToolPermissions {
  requiresAuth?: boolean
  dangerous?: boolean
  sandboxed?: boolean
  confirmationRequired?: boolean
}

export interface ToolCall {
  id: string
  messageId: string
  sessionId: string
  toolName: string
  toolInput: Record<string, unknown>
  toolOutput: Record<string, unknown> | null
  status: 'pending' | 'executing' | 'completed' | 'error'
  createdAt: Date | string
  completedAt?: Date | string
  duration?: number
  error?: string
}

export interface ToolResult {
  success: boolean
  result?: unknown
  error?: string
  output?: string
  metadata?: ToolMetadata
}

export interface ToolMetadata {
  duration?: number
  tokens?: number
  cost?: number
  exitCode?: number
  fileSize?: number
}

export interface ToolExecutionHistory {
  toolCall: ToolCall
  result: ToolResult
  timestamp: Date | string
}

export interface ToolCategoryInfo {
  category: ToolCategory
  label: string
  icon: string
  color: string
  tools: ToolDefinition[]
}
