/**
 * 工具定义相关类型
 */

/**
 * 工具执行结果
 */
export interface ToolResult {
  success: boolean
  result?: unknown
  error?: string
  output?: string
}

/**
 * 工具定义接口
 */
export interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * 工具类别
 */
export type ToolCategory = 
  | 'read' 
  | 'write' 
  | 'edit' 
  | 'search' 
  | 'bash' 
  | 'web' 
  | 'agent'
