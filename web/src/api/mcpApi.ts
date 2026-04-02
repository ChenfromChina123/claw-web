/**
 * MCP (Model Context Protocol) 相关 API 接口
 */

import apiClient from './client'

export interface MCPServer {
  id: string
  name: string
  type: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  enabled: boolean
  status: 'connected' | 'disconnected' | 'error'
  tools?: MCPTool[]
  error?: string
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverId: string
  serverName: string
}

export interface CreateMCPServerRequest {
  name: string
  type: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
}

export const mcpApi = {
  /**
   * 获取 MCP 服务器列表
   */
  async listServers(): Promise<MCPServer[]> {
    const { data } = await apiClient.get<{ servers: MCPServer[] }>('/mcp/servers')
    return data.servers
  },

  /**
   * 创建 MCP 服务器配置
   */
  async createServer(request: CreateMCPServerRequest): Promise<MCPServer> {
    const { data } = await apiClient.post<MCPServer>('/mcp/servers', request)
    return data
  },

  /**
   * 更新 MCP 服务器配置
   */
  async updateServer(serverId: string, updates: Partial<CreateMCPServerRequest>): Promise<MCPServer> {
    const { data } = await apiClient.put<MCPServer>(`/mcp/servers/${serverId}`, updates)
    return data
  },

  /**
   * 删除 MCP 服务器
   */
  async deleteServer(serverId: string): Promise<void> {
    await apiClient.delete(`/mcp/servers/${serverId}`)
  },

  /**
   * 启用/禁用 MCP 服务器
   */
  async toggleServer(serverId: string, enabled: boolean): Promise<void> {
    await apiClient.patch(`/mcp/servers/${serverId}/toggle`, { enabled })
  },

  /**
   * 测试 MCP 服务器连接
   */
  async testConnection(serverId: string): Promise<{ success: boolean; error?: string }> {
    const { data } = await apiClient.post<{ success: boolean; error?: string }>(`/mcp/servers/${serverId}/test`)
    return data
  },

  /**
   * 获取服务器的工具列表
   */
  async getServerTools(serverId: string): Promise<MCPTool[]> {
    const { data } = await apiClient.get<{ tools: MCPTool[] }>(`/mcp/servers/${serverId}/tools`)
    return data.tools
  },
}
