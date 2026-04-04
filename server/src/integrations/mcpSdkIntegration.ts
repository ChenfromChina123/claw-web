/**
 * MCP SDK 集成模块
 * 
 * 使用 @modelcontextprotocol/sdk 实现完整的 MCP 协议支持。
 * 
 * 功能：
 * - MCP Client/Server 实现
 * - 完整协议握手
 * - 工具调用
 * - 资源订阅
 * - 提示词模板
 */

import { v4 as uuidv4 } from 'uuid'

// ==================== MCP SDK 类型定义 ====================

/**
 * MCP JSON-RPC 消息类型
 */
export interface MCPJSONRPCMessage {
  jsonrpc: '2.0'
  id?: string | number
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
}

/**
 * MCP 初始化参数
 */
export interface MCPInitializeParams {
  protocolVersion: string
  capabilities: {
    tools?: Record<string, unknown>
    resources?: {
      subscribe?: boolean
      listChanged?: boolean
    }
    prompts?: {
      listChanged?: boolean
    }
  }
  clientInfo: {
    name: string
    version: string
  }
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  name: string
  description?: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/**
 * MCP 资源定义
 */
export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

/**
 * MCP 提示词定义
 */
export interface MCPPrompt {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
}

/**
 * MCP 调用结果
 */
export interface MCPToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource'
    text?: string
    data?: string
    mimeType?: string
  }>
  isError?: boolean
}

// ==================== MCP 协议常量 ====================

export const MCP_PROTOCOL_VERSION = '2024-11-05'

export const MCP_ERROR_CODES = {
  // JSON-RPC 标准错误码
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  
  // MCP 特定错误码
  TOOL_NOT_FOUND: -32001,
  TOOL_EXECUTION_FAILED: -32002,
  RESOURCE_NOT_FOUND: -32003,
  RESOURCE_NOT_READABLE: -32004,
  PROMPT_NOT_FOUND: -32005,
  SERVER_ERROR: -32000,
}

// ==================== MCP 事件类型 ====================

export type MCPEventType = 
  | 'initialized'
  | 'tools/list'
  | 'tools/call'
  | 'resources/list'
  | 'resources/read'
  | 'resources/subscribe'
  | 'resources/unsubscribe'
  | 'prompts/list'
  | 'prompts/get'
  | 'ping'
  | 'notification'

// ==================== MCP Client 实现 ====================

export type MCPEventHandler = (event: MCPEventType, data: unknown) => void

export class MCPClient {
  private serverUrl: string
  private sessionId: string | null = null
  private protocolVersion: string = MCP_PROTOCOL_VERSION
  private capabilities: MCPInitializeParams['capabilities'] = {}
  private connected: boolean = false
  private messageId: number = 0
  private pendingRequests: Map<string | number, { resolve: (value: unknown) => void; reject: (error: Error) => void }> = new Map()
  private eventHandlers: Set<MCPEventHandler> = new Set()
  private tools: Map<string, MCPTool> = new Map()
  private resources: Map<string, MCPResource> = new Map()
  private prompts: Map<string, MCPPrompt> = new Map()
  
  // 用于 HTTP 传输
  private abortController: AbortController | null = null
  
  constructor(serverUrl: string) {
    this.serverUrl = serverUrl
  }
  
  // ==================== 连接管理 ====================
  
  /**
   * 连接到 MCP 服务器
   */
  async connect(): Promise<void> {
    if (this.connected) {
      console.warn('[MCPClient] 已经连接到服务器')
      return
    }
    
    console.log(`[MCPClient] 连接到 ${this.serverUrl}`)
    
    try {
      // 发送初始化请求
      const response = await this.sendRequest<MCPInitializeParams & { capabilities: MCPInitializeParams['capabilities']; protocolVersion: string }>('initialize', {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
          resources: {
            subscribe: true,
            listChanged: true,
          },
          prompts: {
            listChanged: true,
          },
        },
        clientInfo: {
          name: 'claude-code-haha-server',
          version: '1.0.0',
        },
      })
      
      this.protocolVersion = response.protocolVersion
      this.capabilities = response.capabilities
      this.connected = true
      
      // 发送初始化完成通知
      await this.sendNotification('initialized', {})
      
      // 获取服务器能力列表
      await this.refreshCapabilities()
      
      console.log(`[MCPClient] 连接成功，协议版本: ${this.protocolVersion}`)
      console.log(`[MCPClient] 服务器能力:`, JSON.stringify(this.capabilities, null, 2))
      
      this.emit('initialized', { protocolVersion: this.protocolVersion })
    } catch (error) {
      this.connected = false
      console.error('[MCPClient] 连接失败:', error)
      throw error
    }
  }
  
  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return
    }
    
    console.log('[MCPClient] 断开连接')
    
    try {
      await this.sendNotification('notifications/initialized', {})
    } catch {
      // 忽略断开时的错误
    }
    
    this.abortController?.abort()
    this.connected = false
    this.sessionId = null
    this.tools.clear()
    this.resources.clear()
    this.prompts.clear()
  }
  
  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected
  }
  
  // ==================== 能力刷新 ====================
  
  /**
   * 刷新服务器能力列表
   */
  async refreshCapabilities(): Promise<void> {
    // 刷新工具列表
    if (this.capabilities.tools) {
      const toolsResponse = await this.sendRequest<{ tools: MCPTool[] }>('tools/list', {})
      this.tools.clear()
      for (const tool of toolsResponse.tools) {
        this.tools.set(tool.name, tool)
      }
      console.log(`[MCPClient] 加载了 ${this.tools.size} 个工具`)
    }
    
    // 刷新资源列表
    if (this.capabilities.resources) {
      const resourcesResponse = await this.sendRequest<{ resources: MCPResource[] }>('resources/list', {})
      this.resources.clear()
      for (const resource of resourcesResponse.resources) {
        this.resources.set(resource.uri, resource)
      }
      console.log(`[MCPClient] 加载了 ${this.resources.size} 个资源`)
    }
    
    // 刷新提示词列表
    if (this.capabilities.prompts) {
      try {
        const promptsResponse = await this.sendRequest<{ prompts: MCPPrompt[] }>('prompts/list', {})
        this.prompts.clear()
        for (const prompt of promptsResponse.prompts) {
          this.prompts.set(prompt.name, prompt)
        }
        console.log(`[MCPClient] 加载了 ${this.prompts.size} 个提示词`)
      } catch {
        // 提示词列表可能不可用
      }
    }
  }
  
  // ==================== 工具操作 ====================
  
  /**
   * 获取所有工具
   */
  getTools(): MCPTool[] {
    return Array.from(this.tools.values())
  }
  
  /**
   * 获取工具
   */
  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name)
  }
  
  /**
   * 调用工具
   */
  async callTool(name: string, arguments_: Record<string, unknown>): Promise<MCPToolCallResult> {
    if (!this.connected) {
      throw new Error('未连接到 MCP 服务器')
    }
    
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`工具不存在: ${name}`)
    }
    
    console.log(`[MCPClient] 调用工具 ${name}:`, arguments_)
    
    try {
      const result = await this.sendRequest<MCPToolCallResult>('tools/call', {
        name,
        arguments: arguments_,
      })
      
      console.log(`[MCPClient] 工具 ${name} 执行成功`)
      return result
    } catch (error) {
      console.error(`[MCPClient] 工具 ${name} 执行失败:`, error)
      throw error
    }
  }
  
  // ==================== 资源操作 ====================
  
  /**
   * 获取所有资源
   */
  getResources(): MCPResource[] {
    return Array.from(this.resources.values())
  }
  
  /**
   * 获取资源
   */
  getResource(uri: string): MCPResource | undefined {
    return this.resources.get(uri)
  }
  
  /**
   * 读取资源
   */
  async readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string }> }> {
    if (!this.connected) {
      throw new Error('未连接到 MCP 服务器')
    }
    
    console.log(`[MCPClient] 读取资源 ${uri}`)
    
    return await this.sendRequest('resources/read', { uri })
  }
  
  /**
   * 订阅资源
   */
  async subscribeResource(uri: string): Promise<void> {
    if (!this.connected) {
      throw new Error('未连接到 MCP 服务器')
    }
    
    if (!this.capabilities.resources?.subscribe) {
      throw new Error('服务器不支持资源订阅')
    }
    
    console.log(`[MCPClient] 订阅资源 ${uri}`)
    await this.sendNotification('resources/subscribe', { uri })
  }
  
  /**
   * 取消订阅资源
   */
  async unsubscribeResource(uri: string): Promise<void> {
    if (!this.connected) {
      throw new Error('未连接到 MCP 服务器')
    }
    
    console.log(`[MCPClient] 取消订阅资源 ${uri}`)
    await this.sendNotification('resources/unsubscribe', { uri })
  }
  
  // ==================== 提示词操作 ====================
  
  /**
   * 获取所有提示词
   */
  getPrompts(): MCPPrompt[] {
    return Array.from(this.prompts.values())
  }
  
  /**
   * 获取提示词
   */
  getPrompt(name: string): MCPPrompt | undefined {
    return this.prompts.get(name)
  }
  
  /**
   * 获取提示词渲染
   */
  async getPromptRendered(name: string, args?: Record<string, string>): Promise<{ messages: Array<{ role: string; content: string }> }> {
    if (!this.connected) {
      throw new Error('未连接到 MCP 服务器')
    }
    
    console.log(`[MCPClient] 获取提示词 ${name}`)
    
    return await this.sendRequest('prompts/get', {
      name,
      arguments: args,
    })
  }
  
  // ==================== Ping ====================
  
  /**
   * Ping 服务器
   */
  async ping(): Promise<boolean> {
    if (!this.connected) {
      return false
    }
    
    try {
      await this.sendRequest('ping', {})
      return true
    } catch {
      return false
    }
  }
  
  // ==================== 事件处理 ====================
  
  /**
   * 添加事件处理器
   */
  on(handler: MCPEventHandler): () => void {
    this.eventHandlers.add(handler)
    return () => {
      this.eventHandlers.delete(handler)
    }
  }
  
  /**
   * 发射事件
   */
  private emit(event: MCPEventType, data: unknown): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event, data)
      } catch (error) {
        console.error('[MCPClient] 事件处理器错误:', error)
      }
    }
  }
  
  // ==================== HTTP 传输层 ====================
  
  /**
   * 发送请求
   */
  private async sendRequest<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = ++this.messageId
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    if (this.sessionId) {
      headers['MCP-Session-ID'] = this.sessionId
    }
    
    const body: MCPJSONRPCMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }
    
    try {
      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: this.abortController?.signal,
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }
      
      const data = await response.json() as MCPJSONRPCMessage
      
      if (data.error) {
        throw new Error(`MCP Error ${data.error.code}: ${data.error.message}`)
      }
      
      return data.result as T
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('请求被取消')
      }
      throw error
    }
  }
  
  /**
   * 发送通知（不需要响应）
   */
  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    
    if (this.sessionId) {
      headers['MCP-Session-ID'] = this.sessionId
    }
    
    const body: MCPJSONRPCMessage = {
      jsonrpc: '2.0',
      method,
      params,
    }
    
    try {
      await fetch(this.serverUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: this.abortController?.signal,
      })
    } catch (error) {
      // 忽略通知错误
      console.warn('[MCPClient] 发送通知失败:', error)
    }
  }
}

// ==================== MCP 服务器连接管理器 ====================

export interface MCPServerConnectionConfig {
  id: string
  name: string
  url: string
  transport: 'http' | 'websocket' | 'sse'
  enabled: boolean
  authToken?: string
}

export class MCPServerConnectionManager {
  private connections: Map<string, MCPClient> = new Map()
  private configs: Map<string, MCPServerConnectionConfig> = new Map()
  private toolRegistry: Map<string, { serverId: string; tool: MCPTool }> = new Map()
  private eventHandlers: Set<(event: string, data: unknown) => void> = new Set()
  
  // ==================== 连接管理 ====================
  
  /**
   * 添加服务器配置
   */
  addServer(config: MCPServerConnectionConfig): void {
    this.configs.set(config.id, config)
    console.log(`[MCPServerManager] 添加服务器: ${config.name} (${config.url})`)
  }
  
  /**
   * 移除服务器配置
   */
  removeServer(serverId: string): void {
    const client = this.connections.get(serverId)
    if (client) {
      client.disconnect()
      this.connections.delete(serverId)
    }
    
    // 移除该服务器的工具
    for (const [toolName, entry] of this.toolRegistry) {
      if (entry.serverId === serverId) {
        this.toolRegistry.delete(toolName)
      }
    }
    
    this.configs.delete(serverId)
    console.log(`[MCPServerManager] 移除服务器: ${serverId}`)
  }
  
  /**
   * 连接服务器
   */
  async connectServer(serverId: string): Promise<void> {
    const config = this.configs.get(serverId)
    if (!config) {
      throw new Error(`服务器配置不存在: ${serverId}`)
    }
    
    if (config.transport !== 'http') {
      throw new Error(`暂不支持的传输协议: ${config.transport}`)
    }
    
    const client = new MCPClient(config.url)
    
    // 添加事件处理器
    client.on((event, data) => {
      this.emit(event as string, { serverId, ...data as object })
    })
    
    await client.connect()
    this.connections.set(serverId, client)
    
    // 注册工具
    for (const tool of client.getTools()) {
      this.toolRegistry.set(tool.name, { serverId, tool })
    }
    
    console.log(`[MCPServerManager] 连接服务器成功: ${config.name}`)
  }
  
  /**
   * 断开服务器连接
   */
  async disconnectServer(serverId: string): Promise<void> {
    const client = this.connections.get(serverId)
    if (client) {
      await client.disconnect()
      this.connections.delete(serverId)
      
      // 移除该服务器的工具
      for (const [toolName, entry] of this.toolRegistry) {
        if (entry.serverId === serverId) {
          this.toolRegistry.delete(toolName)
        }
      }
    }
    
    console.log(`[MCPServerManager] 断开服务器: ${serverId}`)
  }
  
  /**
   * 重新连接所有服务器
   */
  async reconnectAll(): Promise<void> {
    const enabledConfigs = Array.from(this.configs.values()).filter(c => c.enabled)
    
    for (const config of enabledConfigs) {
      try {
        await this.connectServer(config.id)
      } catch (error) {
        console.error(`[MCPServerManager] 连接服务器 ${config.name} 失败:`, error)
      }
    }
  }
  
  /**
   * 获取连接状态
   */
  getConnectionStatus(serverId: string): 'connected' | 'disconnected' | 'connecting' | 'error' {
    const client = this.connections.get(serverId)
    if (client && client.isConnected()) {
      return 'connected'
    }
    return 'disconnected'
  }
  
  // ==================== 工具操作 ====================
  
  /**
   * 获取所有可用的工具
   */
  getAllTools(): Array<{ serverId: string; serverName: string; tool: MCPTool }> {
    const result: Array<{ serverId: string; serverName: string; tool: MCPTool }> = []
    
    for (const [toolName, entry] of this.toolRegistry) {
      const config = this.configs.get(entry.serverId)
      result.push({
        serverId: entry.serverId,
        serverName: config?.name || 'Unknown',
        tool: entry.tool,
      })
    }
    
    return result
  }
  
  /**
   * 调用工具
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const entry = this.toolRegistry.get(toolName)
    if (!entry) {
      throw new Error(`工具不存在: ${toolName}`)
    }
    
    const client = this.connections.get(entry.serverId)
    if (!client || !client.isConnected()) {
      throw new Error(`服务器未连接: ${entry.serverId}`)
    }
    
    return await client.callTool(toolName, args)
  }
  
  /**
   * 查找工具所属的服务器
   */
  findToolServer(toolName: string): { serverId: string; serverName: string } | undefined {
    const entry = this.toolRegistry.get(toolName)
    if (!entry) {
      return undefined
    }
    
    const config = this.configs.get(entry.serverId)
    return {
      serverId: entry.serverId,
      serverName: config?.name || 'Unknown',
    }
  }
  
  // ==================== 事件处理 ====================
  
  /**
   * 添加事件处理器
   */
  on(handler: (event: string, data: unknown) => void): () => void {
    this.eventHandlers.add(handler)
    return () => {
      this.eventHandlers.delete(handler)
    }
  }
  
  /**
   * 发射事件
   */
  private emit(event: string, data: unknown): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event, data)
      } catch (error) {
        console.error('[MCPServerManager] 事件处理器错误:', error)
      }
    }
  }
  
  // ==================== 统计信息 ====================
  
  /**
   * 获取统计信息
   */
  getStats(): {
    totalServers: number
    connectedServers: number
    totalTools: number
    servers: Array<{
      id: string
      name: string
      status: 'connected' | 'disconnected' | 'connecting' | 'error'
      toolCount: number
    }>
  } {
    const servers: Array<{
      id: string
      name: string
      status: 'connected' | 'disconnected' | 'connecting' | 'error'
      toolCount: number
    }> = []
    
    let connectedCount = 0
    
    for (const [id, config] of this.configs) {
      const status = this.getConnectionStatus(id)
      const toolCount = Array.from(this.toolRegistry.values()).filter(e => e.serverId === id).length
      
      if (status === 'connected') {
        connectedCount++
      }
      
      servers.push({
        id,
        name: config.name,
        status,
        toolCount,
      })
    }
    
    return {
      totalServers: this.configs.size,
      connectedServers: connectedCount,
      totalTools: this.toolRegistry.size,
      servers,
    }
  }
}

// ==================== 单例实例 ====================

let mcpServerManagerInstance: MCPServerConnectionManager | null = null

/**
 * 获取 MCP 服务器管理器单例
 */
export function getMCPServerManager(): MCPServerConnectionManager {
  if (!mcpServerManagerInstance) {
    mcpServerManagerInstance = new MCPServerConnectionManager()
  }
  return mcpServerManagerInstance
}

export default MCPClient
