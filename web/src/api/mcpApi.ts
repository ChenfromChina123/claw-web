/**
 * MCP (Model Context Protocol) 管理 API 接口
 */

import apiClient from './client'
import { unwrapApiData } from './unwrapApiResponse'
import type { ApiResponse } from '@/types'

export interface MCPServer {
  id: string
  name: string
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
  command: string
  args?: string[]
  env?: Record<string, string>
  /** 服务端返回该服务器下的工具数量 */
  tools: number
  enabled?: boolean
  createdAt?: string
  lastConnected?: string
}

export interface MCPTool {
  name: string
  description: string
  serverName: string
  serverId?: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface MCPServerListResponse {
  servers: MCPServer[]
  count: number
  message?: string
}

export interface MCPToolListResponse {
  tools: MCPTool[]
  count: number
  serverName?: string
  message?: string
}

export interface MCPToolCallRequest {
  serverName: string
  toolName: string
  toolInput: Record<string, unknown>
}

export interface MCPToolCallResponse {
  success: boolean
  result?: unknown
  error?: string
  serverName: string
  toolName: string
}

export interface MCPServerAddRequest {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
  transport?: 'stdio' | 'websocket' | 'sse' | 'streamable-http'
  url?: string
}

export const mcpApi = {
  async listServers(): Promise<MCPServerListResponse> {
    const { data } = await apiClient.get<ApiResponse<MCPServerListResponse>>('/mcp/servers')
    return unwrapApiData(data)
  },

  async listTools(serverName?: string): Promise<MCPToolListResponse> {
    const params = serverName ? { serverName } : {}
    const { data } = await apiClient.get<ApiResponse<MCPToolListResponse>>('/mcp/tools', { params })
    return unwrapApiData(data)
  },

  async callTool(request: MCPToolCallRequest): Promise<MCPToolCallResponse> {
    const { data } = await apiClient.post<ApiResponse<MCPToolCallResponse>>('/mcp/call', request)
    return unwrapApiData(data)
  },

  async addServer(request: MCPServerAddRequest): Promise<{
    success: boolean
    server?: { id: string; name: string; command: string; enabled: boolean }
    message?: string
  }> {
    const { data } = await apiClient.post<
      ApiResponse<{
        success: boolean
        server?: { id: string; name: string; command: string; enabled: boolean }
        message?: string
      }>
    >('/mcp/servers', request)
    return unwrapApiData(data)
  },

  async removeServer(serverId: string): Promise<{ success: boolean; message?: string }> {
    const { data } = await apiClient.delete<ApiResponse<{ success: boolean; message?: string }>>(
      `/mcp/servers/${encodeURIComponent(serverId)}`
    )
    return unwrapApiData(data)
  },

  async testConnection(serverId: string): Promise<{ success: boolean; message?: string; latency?: number }> {
    const { data } = await apiClient.post<ApiResponse<{ success: boolean; message?: string; latency?: number }>>(
      `/mcp/servers/${encodeURIComponent(serverId)}/test`
    )
    return unwrapApiData(data)
  },

  async getServerStatus(serverId: string): Promise<MCPServer> {
    const { data } = await apiClient.get<ApiResponse<MCPServer>>(
      `/mcp/servers/${encodeURIComponent(serverId)}/status`
    )
    return unwrapApiData(data)
  },
}

export default mcpApi
