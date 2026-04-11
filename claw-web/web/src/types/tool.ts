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

/**
 * 文件写入工具输出类型
 */
export type FileWriteOperationType = 'create' | 'update'

/**
 * 文件写入工具输出结果（对应后端 FileWriteTool 的 outputSchema）
 */
export interface FileWriteToolOutput {
  /** 操作类型：新建或更新 */
  type: FileWriteOperationType
  /** 与工作区 API 一致的虚拟路径，如 /skills/README.md */
  virtualPath?: string
  /** 文件路径 */
  filePath: string
  /** 写入的内容 */
  content: string
  /** 结构化差异补丁（更新时） */
  structuredPatch: Array<{
    oldStart: number
    oldCount: number
    newStart: number
    newCount: number
    lines: Array<{ type: 'context' | 'add' | 'delete'; content: string }>
  }>
  /** 原始文件内容（更新时） */
  originalFile: string | null
}

/**
 * Agent 文件输出数据
 * 当 Agent 使用输出命令时，用于在对话框中展示的文件信息
 */
export interface AgentFileOutput {
  /** 唯一标识 */
  id: string
  /** 关联的消息 ID */
  messageId: string
  /** 文件名 */
  fileName: string
  /** 文件路径 */
  filePath: string
  /** 文件内容（文本或 Base64） */
  content: string
  /** MIME 类型 */
  mimeType?: string
  /** 文件大小（字节） */
  size?: number
  /** 描述信息 */
  description?: string
  /** 是否为 Base64 编码 */
  isBase64?: boolean
  /** 创建时间 */
  createdAt: Date | string
}
