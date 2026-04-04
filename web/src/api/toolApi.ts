/**
 * 工具管理 API 接口
 * 提供 REST API 调用方式，与 WebSocket RPC 互补
 */

import apiClient from './client'
import { unwrapApiData } from './unwrapApiResponse'
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

export const toolApi = {
  async listTools(category?: string): Promise<ToolListResponse> {
    const params = category ? { category } : {}
    const { data } = await apiClient.get<ApiResponse<ToolListResponse>>('/tools', { params })
    return unwrapApiData(data)
  },

  async getTool(toolName: string): Promise<ToolDefinition> {
    const { data } = await apiClient.get<ApiResponse<ToolDefinition>>(
      `/tools/${encodeURIComponent(toolName)}`
    )
    return unwrapApiData(data)
  },

  async executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    const { data } = await apiClient.post<ApiResponse<ToolExecutionResponse>>('/tools/execute', request)
    return unwrapApiData(data)
  },

  async getHistory(limit?: number): Promise<ToolHistoryResponse> {
    const params = limit ? { limit } : {}
    const { data } = await apiClient.get<ApiResponse<ToolHistoryResponse>>('/tools/history', { params })
    return unwrapApiData(data)
  },

  async clearHistory(): Promise<{ message: string }> {
    const { data } = await apiClient.post<ApiResponse<{ message: string }>>('/tools/history/clear')
    return unwrapApiData(data)
  },

  async validateInput(request: ToolValidationRequest): Promise<ToolValidationResponse> {
    const { data } = await apiClient.post<ApiResponse<ToolValidationResponse>>('/tools/validate', request)
    return unwrapApiData(data)
  },
}

export default toolApi
