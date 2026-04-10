/**
 * MCP 网关
 * 统一处理所有 MCP 相关操作
 * 基于现有的 MCPConnectionManager 包装
 */

import { MCPConnectionManager } from '../../integrations/mcpConnectionManager'
import type { MCPServerConfig, MCPTool, MCPToolResult } from '@claw/shared/types/mcp'
import { getPerformanceMonitor } from '../../monitoring/PerformanceMonitor'
import type { MCPServerStatus } from '@claw/shared/types/mcp'

export class McpGateway {
  private connectionManager: MCPConnectionManager
  private perfMonitor = getPerformanceMonitor()
  
  constructor() {
    this.connectionManager = new MCPConnectionManager()
  }
  
  /**
   * 添加 MCP 服务器
   */
  async addServer(
    config: Omit<MCPServerConfig, 'id'>
  ): Promise<{ serverId: string; success: boolean; error?: string }> {
    const start = Date.now()
    
    try {
      const server = this.connectionManager.addServer(config)
      
      // 异步连接
      this.connectionManager.connectServer(server.id).catch(error => {
        console.error('[McpGateway] 连接失败:', error)
      })
      
      this.perfMonitor.record('mcp.addServer', Date.now() - start, true, {
        serverId: server.id,
        transport: config.transport,
      })
      
      return { serverId: server.id, success: true }
    } catch (error) {
      this.perfMonitor.record('mcp.addServer', Date.now() - start, false, {
        error: error instanceof Error ? error.message : String(error),
      })
      
      return {
        serverId: '',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  
  /**
   * 移除 MCP 服务器
   */
  async removeServer(serverId: string): Promise<boolean> {
    const start = Date.now()
    try {
      const result = await this.connectionManager.removeServer(serverId)
      this.perfMonitor.record('mcp.removeServer', Date.now() - start, true)
      return result
    } catch (error) {
      this.perfMonitor.record('mcp.removeServer', Date.now() - start, false)
      return false
    }
  }
  
  /**
   * 调用 MCP 工具
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    const start = Date.now()
    
    try {
      // 使用现有的连接管理器调用工具
      const result = await this.connectionManager.callTool(serverId, toolName, args)
      
      this.perfMonitor.record('mcp.callTool', Date.now() - start, result.success, {
        serverId,
        toolName,
      })
      
      return result
    } catch (error) {
      this.perfMonitor.record('mcp.callTool', Date.now() - start, false, {
        serverId,
        toolName,
        error: error instanceof Error ? error.message : String(error),
      })
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  
  /**
   * 列出服务器的所有工具
   */
  async listTools(serverId: string): Promise<MCPTool[]> {
    const start = Date.now()
    
    try {
      const tools = await this.connectionManager.getServerTools(serverId)
      
      this.perfMonitor.record('mcp.listTools', Date.now() - start, true, {
        serverId,
        toolCount: tools.length,
      })
      
      return tools
    } catch (error) {
      this.perfMonitor.record('mcp.listTools', Date.now() - start, false)
      return []
    }
  }
  
  /**
   * 获取所有服务器状态
   */
  getServerStatus(): Array<{
    serverId: string
    name: string
    status: MCPServerStatus
    toolCount?: number
    error?: string
  }> {
    return this.connectionManager.getServerStatus()
  }
  
  /**
   * 关闭网关
   */
  async shutdown(): Promise<void> {
    await this.connectionManager.shutdown()
  }
}

// 单例模式
let instance: McpGateway | null = null
export function getMcpGateway(): McpGateway {
  if (!instance) {
    instance = new McpGateway()
  }
  return instance
}
