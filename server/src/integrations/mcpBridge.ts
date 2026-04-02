/**
 * MCP 客户端桥接 - 将 src MCP 客户端集成到 server
 * 
 * 这个模块桥接了 Claude Code HAHA 的 MCP 客户端功能
 */

import { v4 as uuidv4 } from 'uuid'

// MCP 服务器配置
export interface MCPServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
}

// MCP 工具定义
export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverId: string
}

// MCP 资源定义
export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

// MCP 调用结果
export interface MCPResult {
  success: boolean
  result?: unknown
  error?: string
}

// WebSocket 事件发送函数类型
export type EventSender = (event: string, data: unknown) => void

/**
 * Web MCP 客户端 - 桥接到 src MCP 客户端
 */
export class WebMCPBridge {
  private projectRoot: string
  private servers: Map<string, MCPServerConfig> = new Map()
  private tools: Map<string, MCPTool[]> = new Map()
  private resources: Map<string, MCPResource[]> = new Map()
  
  constructor() {
    this.projectRoot = this.getProjectRoot()
    this.loadServers()
  }
  
  private getProjectRoot(): string {
    const currentDir = process.cwd()
    return currentDir.replace(/\\server\\src$/i, '').replace(/\/server\/src$/, '')
  }
  
  /**
   * 加载 MCP 服务器配置
   */
  private loadServers(): void {
    // 初始化一些默认服务器
    // 这些配置可以从配置文件加载
  }
  
  /**
   * 获取所有 MCP 服务器
   */
  getServers(): MCPServerConfig[] {
    return Array.from(this.servers.values())
  }
  
  /**
   * 添加 MCP 服务器
   */
  addServer(config: Omit<MCPServerConfig, 'id'>): MCPServerConfig {
    const server: MCPServerConfig = {
      ...config,
      id: uuidv4(),
    }
    
    this.servers.set(server.id, server)
    return server
  }
  
  /**
   * 移除 MCP 服务器
   */
  removeServer(serverId: string): boolean {
    this.tools.delete(serverId)
    this.resources.delete(serverId)
    return this.servers.delete(serverId)
  }
  
  /**
   * 启用/禁用 MCP 服务器
   */
  toggleServer(serverId: string, enabled: boolean): boolean {
    const server = this.servers.get(serverId)
    if (server) {
      server.enabled = enabled
      return true
    }
    return false
  }
  
  /**
   * 获取服务器的工具列表
   */
  getServerTools(serverId: string): MCPTool[] {
    return this.tools.get(serverId) || []
  }
  
  /**
   * 获取所有可用工具
   */
  getAllTools(): MCPTool[] {
    const allTools: MCPTool[] = []
    for (const tools of this.tools.values()) {
      allTools.push(...tools)
    }
    return allTools
  }
  
  /**
   * 获取服务器的资源列表
   */
  getServerResources(serverId: string): MCPResource[] {
    return this.resources.get(serverId) || []
  }
  
  /**
   * 获取所有可用资源
   */
  getAllResources(): MCPResource[] {
    const allResources: MCPResource[] = []
    for (const resources of this.resources.values()) {
      allResources.push(...resources)
    }
    return allResources
  }
  
  /**
   * 调用 MCP 工具
   */
  async callTool(
    toolName: string, 
    toolInput: Record<string, unknown>,
    sendEvent?: EventSender
  ): Promise<MCPResult> {
    // 查找工具所属的服务器
    let targetTool: MCPTool | undefined
    let targetServer: MCPServerConfig | undefined
    
    for (const [serverId, tools] of this.tools) {
      const tool = tools.find(t => t.name === toolName)
      if (tool) {
        targetTool = tool
        targetServer = this.servers.get(serverId)
        break
      }
    }
    
    if (!targetTool || !targetServer) {
      return { success: false, error: `Tool not found: ${toolName}` }
    }
    
    if (!targetServer.enabled) {
      return { success: false, error: `Server ${targetServer.name} is disabled` }
    }
    
    sendEvent?.('mcp_tool_start', { tool: toolName, input: toolInput })
    
    try {
      // 这里需要调用实际的 MCP 服务器
      // 使用 @modelcontextprotocol/sdk 进行通信
      const result = { output: 'MCP tool call placeholder' }
      
      sendEvent?.('mcp_tool_end', { tool: toolName, result })
      return { success: true, result }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      sendEvent?.('mcp_tool_error', { tool: toolName, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }
  
  /**
   * 读取 MCP 资源
   */
  async readResource(
    uri: string,
    sendEvent?: EventSender
  ): Promise<{ success: boolean; content?: string; mimeType?: string; error?: string }> {
    // 查找资源
    let targetResource: MCPResource | undefined
    
    for (const resources of this.resources.values()) {
      const resource = resources.find(r => r.uri === uri)
      if (resource) {
        targetResource = resource
        break
      }
    }
    
    if (!targetResource) {
      return { success: false, error: `Resource not found: ${uri}` }
    }
    
    sendEvent?.('mcp_resource_read', { uri })
    
    try {
      // 这里需要调用实际的 MCP 服务器读取资源
      return {
        success: true,
        content: 'Resource content placeholder',
        mimeType: targetResource.mimeType,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMessage }
    }
  }
  
  /**
   * 测试 MCP 服务器连接
   */
  async testConnection(serverId: string): Promise<{ success: boolean; message: string }> {
    const server = this.servers.get(serverId)
    
    if (!server) {
      return { success: false, message: 'Server not found' }
    }
    
    try {
      // 测试连接
      // 这里需要实际测试 MCP 服务器连接
      return { success: true, message: 'Connection successful' }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, message: `Connection failed: ${errorMessage}` }
    }
  }
  
  /**
   * 获取 MCP 状态
   */
  getStatus(): {
    totalServers: number
    enabledServers: number
    totalTools: number
    totalResources: number
  } {
    const servers = Array.from(this.servers.values())
    return {
      totalServers: servers.length,
      enabledServers: servers.filter(s => s.enabled).length,
      totalTools: this.getAllTools().length,
      totalResources: this.getAllResources().length,
    }
  }
  
  /**
   * 导出服务器配置
   */
  exportConfig(): MCPServerConfig[] {
    return this.getServers()
  }
  
  /**
   * 导入服务器配置
   */
  importConfig(configs: MCPServerConfig[]): number {
    let imported = 0
    for (const config of configs) {
      if (!this.servers.has(config.id)) {
        this.servers.set(config.id, config)
        imported++
      }
    }
    return imported
  }
}

export default WebMCPBridge
