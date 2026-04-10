import type { MCPTool, MCPToolResult, MCPServerConfig, MCPServerStatus } from '../types/mcp'

/**
 * MCP 传输层接口
 * 定义不同传输协议的统一抽象
 */
export interface IMcpTransport {
  /**
   * 连接 MCP 服务器
   */
  connect(config: MCPServerConfig): Promise<void>
  
  /**
   * 断开连接
   */
  disconnect(): Promise<void>
  
  /**
   * 列出所有可用工具
   */
  listTools(): Promise<MCPTool[]>
  
  /**
   * 调用 MCP 工具
   */
  callTool(
    name: string, 
    args: Record<string, unknown>
  ): Promise<MCPToolResult>
  
  /**
   * 检查连接状态
   */
  isConnected(): boolean
  
  /**
   * 获取连接状态
   */
  getStatus(): MCPServerStatus
}
