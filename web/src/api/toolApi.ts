/**
 * 工具相关 API 接口
 */

import apiClient from './client'
import type { ToolDefinition, ToolExecutionHistory } from '@/types'

export const toolApi = {
  /**
   * 获取所有可用工具列表
   */
  async listTools(): Promise<ToolDefinition[]> {
    const { data } = await apiClient.get<{ tools: ToolDefinition[] }>('/tools')
    return data.tools
  },

  /**
   * 按分类获取工具
   */
  async getToolsByCategory(category: string): Promise<ToolDefinition[]> {
    const tools = await this.listTools()
    return tools.filter((tool) => tool.category === category)
  },

  /**
   * 获取工具执行历史
   */
  async getHistory(limit: number = 50): Promise<ToolExecutionHistory[]> {
    const { data } = await apiClient.get<{ history: ToolExecutionHistory[] }>('/tools/history', {
      params: { limit },
    })
    return data.history
  },

  /**
   * 执行工具（通过 REST API）
   */
  async execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    const { data } = await apiClient.post('/tools/execute', { name, input })
    return data
  },
}
