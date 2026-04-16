/**
 * src/services/mcp/client.ts 适配器
 * 将现有 MCP 客户端适配到新的接口
 */

import type { IMcpTransport } from '@claw/shared/interfaces/McpTransport'
import type { MCPServerConfig, MCPTool, MCPToolResult, MCPServerStatus } from '@claw/shared/types/mcp'
import { getErrorMessage } from '@claw/shared/utils/error-handling'

// 动态导入现有 src 客户端
type SrcClientType = any

export class SrcClientAdapter implements IMcpTransport {
  private srcClient: SrcClientType
  private connected = false
  private config: MCPServerConfig | null = null
  private status: MCPServerStatus = 'disconnected'
  
  constructor(srcClient: SrcClientType) {
    this.srcClient = srcClient
  }
  
  /**
   * 连接 MCP 服务器
   */
  async connect(config: MCPServerConfig): Promise<void> {
    if (this.connected) {
      throw new Error('Already connected')
    }
    
    this.config = config
    this.status = 'connecting'
    
    try {
      // 调用现有 src 客户端的连接逻辑
      // 注意：这里需要适配 src/client.ts 的 connect 方法
      await this.srcClient.connect(config)
      this.connected = true
      this.status = 'connected'
      
      console.log(`[SrcClientAdapter] 已连接：${config.name}`)
    } catch (error) {
      this.status = 'error'
      throw error
    }
  }
  
  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return
    
    try {
      await this.srcClient.disconnect()
      this.connected = false
      this.status = 'disconnected'
    } catch (error) {
      console.error('[SrcClientAdapter] 断开连接失败:', error)
    }
  }
  
  /**
   * 列出所有可用工具
   */
  async listTools(): Promise<MCPTool[]> {
    if (!this.connected) {
      throw new Error('Not connected')
    }
    
    // 调用现有 src 客户端的工具列表方法
    const tools = await this.srcClient.listTools()
    
    // 转换为共享类型
    return tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema,
      serverId: this.config!.id,
      serverName: this.config!.name,
      annotations: tool.annotations,
    }))
  }
  
  /**
   * 调用 MCP 工具
   */
  async callTool(
    name: string, 
    args: Record<string, unknown>
  ): Promise<MCPToolResult> {
    if (!this.connected) {
      throw new Error('Not connected')
    }
    
    const startTime = Date.now()
    
    try {
      const result = await this.srcClient.callTool(name, args)
      return {
        success: true,
        result,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
        duration: Date.now() - startTime,
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
