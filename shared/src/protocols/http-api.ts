import type { MCPServerRuntime } from '../types/mcp'

/**
 * HTTP API 统一响应格式
 */
export interface APIResponse<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
  timestamp?: string
}

/**
 * 创建成功响应
 */
export function createSuccessResponse<T>(data: T): APIResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
}

/**
 * 创建错误响应
 */
export function createErrorResponse(
  error: string, 
  code?: string
): APIResponse<never> {
  return {
    success: false,
    error,
    code,
    timestamp: new Date().toISOString(),
  }
}

// MCP API 相关类型
export interface AddMCPServerRequest {
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  transport?: 'stdio' | 'websocket' | 'sse' | 'streamable-http'
  url?: string
}

export interface ListMCPServersResponse {
  servers: MCPServerRuntime[]
  count: number
}

export interface ExecuteToolRequest {
  toolName: string
  input: Record<string, unknown>
  sessionId?: string
}
