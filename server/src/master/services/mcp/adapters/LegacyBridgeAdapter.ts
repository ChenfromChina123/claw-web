/**
 * server/src/integrations/mcpBridge.ts 适配器
 * 将现有桥接代码适配到新接口
 */

import type { IMcpTransport } from '@claw/shared/interfaces/McpTransport'
import type { MCPServerConfig, MCPTool, MCPToolResult, MCPServerStatus } from '@claw/shared/types/mcp'
import { getWebMCPBridgeInstance } from '../../../integrations/mcpBridge'

export class LegacyBridgeAdapter implements IMcpTransport {
  private bridge = getWebMCPBridgeInstance()
  private connected = false
  private config: MCPServerConfig | null = null
  private status: MCPServerStatus = 'disconnected'
  
  /**
   * 连接 MCP 服务器
   */
  async connect(config: MCPServerConfig): Promise<void> {
    this.config = config
    this.status = 'connecting'
    
    try {
      // 现有桥接已经处理了连接逻辑
      this.connected = true
      this.status = 'connected'
      console.log(`[LegacyBridgeAdapter] 已连接：${config.name}`)
    } catch (error) {
      this.status = 'error'
      throw error
    }
  }
  
  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    this.connected = false
    this.status = 'disconnected'
  }
  
  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<MCPTool[]> {
    if (!this.config) {
      throw new Error('Not configured')
    }
    
    // 使用现有桥接的工具列表
    return this.bridge.getServerTools(this.config.id)
  }
  
  /**
   * 调用 MCP 工具
   */
  async callTool(
    name: string, 
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    try {
      const result = await this.bridge.callTool(name, args)
      return {
        success: result.success,
        result: result.result,
        error: result.error,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  
  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected
  }
  
  /**
   * 获取连接状态
   */
  getStatus(): MCPServerStatus {
    return this.status
  }
}
