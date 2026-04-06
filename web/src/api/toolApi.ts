/**
 * 工具管理 API 接口
 * 提供 REST API 调用方式，与 WebSocket RPC 互补
 */

import apiClient from './client'
import type { ToolDefinition } from '@/types'
import type { ApiResponse } from '@/types'

export interface ToolExecutionRequest {
  toolName: string
  toolInput: Record<string, unknown>
  sessionId?: string
  context?: Record<string, unknown>
}

export interface ToolValidationRequest {
  toolName: string
  toolInput: Record<string, unknown>
}

export interface ToolListResponse {
  tools: ToolDefinition[]
  categories: string[]
  total: number
}

export interface ToolExecutionResponse {
  success: boolean
  result?: unknown
  error?: string
  output?: string
  metadata?: {
    duration?: number
    tokens?: number
    cost?: number
  }
}

export interface ToolValidationResponse {
  valid: boolean
  errors: string[]
  tool?: {
    name: string
    description: string
    inputSchema: Record<string, unknown>
  }
}

export interface ToolHistoryResponse {
  history: Array<{
    id: string
    name: string
    input: Record<string, unknown>
    output?: unknown
    status: 'pending' | 'executing' | 'completed' | 'error'
    startedAt?: number
    completedAt?: number
    error?: string
  }>
  count: number
}

/**
 * 解包 API 响应数据
 */
function unwrapData<T>(response: ApiResponse<T>): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error?.message || '请求失败')
  }
  return response.data
}

export const toolApi = {
  async listTools(category?: string): Promise<ToolListResponse> {
    const params = category ? { category } : {}
    const response = await apiClient.get<ApiResponse<ToolListResponse>>('/tools', { params })
    return unwrapData(response.data)
  },

  async getTool(toolName: string): Promise<ToolDefinition> {
    const response = await apiClient.get<ApiResponse<ToolDefinition>>(
      `/tools/${encodeURIComponent(toolName)}`
    )
    return unwrapData(response.data)
  },

  async executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    const response = await apiClient.post<ApiResponse<ToolExecutionResponse>>('/tools/execute', request)
    return unwrapData(response.data)
  },

  async getHistory(limit?: number): Promise<ToolHistoryResponse> {
    const params = limit ? { limit } : {}
    const response = await apiClient.get<ApiResponse<ToolHistoryResponse>>('/tools/history', { params })
    return unwrapData(response.data)
  },

  async clearHistory(): Promise<{ message: string }> {
    const response = await apiClient.post<ApiResponse<{ message: string }>>('/tools/history/clear')
    return unwrapData(response.data)
  },

  async validateInput(request: ToolValidationRequest): Promise<ToolValidationResponse> {
    const response = await apiClient.post<ApiResponse<ToolValidationResponse>>('/tools/validate', request)
    return unwrapData(response.data)
  },
}

export default toolApi
