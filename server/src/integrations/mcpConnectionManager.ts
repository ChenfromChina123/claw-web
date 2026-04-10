/**
 * MCP 服务器连接管理器
 * 
 * 提供真实的外部 MCP 服务器连接能力
 * 支持：Stdio、HTTP、WebSocket、SSE 传输协议
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

// ==================== 类型定义 ====================

/**
 * MCP 服务器配置接口
 */
export interface MCPServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
  transport?: 'stdio' | 'http' | 'websocket' | 'sse' | 'streamable-http'
  url?: string
  headers?: Record<string, string>
  /** 自动重连 */
  autoReconnect?: boolean
  /** 重连间隔（毫秒） */
  reconnectInterval?: number
  /** 最大重连次数 */
  maxReconnectAttempts?: number
}

/**
 * MCP 工具定义
 */
export interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  }
}

/**
 * MCP 资源定义
 */
export interface MCPResourceDefinition {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

/**
 * MCP 服务器运行时状态
 */
export type MCPServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting'

/**
 * MCP 服务器运行时信息
 */
export interface MCPServerRuntime {
  config: MCPServerConfig
  status: MCPServerStatus
  process?: ChildProcess
  tools: MCPToolDefinition[]
  resources: MCPResourceDefinition[]
  error?: string
  connectedAt?: number
  lastErrorAt?: number
  reconnectCount: number
}

// ==================== MCP 连接管理器 ====================

export class MCPConnectionManager extends EventEmitter {
  private servers: Map<string, MCPServerConfig> = new Map()
  private runtimes: Map<string, MCPServerRuntime> = new Map()
  
  // 连接超时配置
  private connectionTimeout: number = 30000
  
  constructor() {
    super()
    this.initializeDefaultServers()
  }
  
  /**
   * 初始化默认的 MCP 服务器配置
   */
  private initializeDefaultServers(): void {
    // 这里可以预配置一些常用的 MCP 服务器
    // 例如 GitHub、Slack、Database 等
  }
  
  // ==================== 服务器管理 ====================
  
  /**
   * 添加 MCP 服务器配置
   */
  addServer(config: Omit<MCPServerConfig, 'id'>): MCPServerConfig {
    const server: MCPServerConfig = {
      ...config,
      id: uuidv4(),
      autoReconnect: config.autoReconnect ?? true,
      reconnectInterval: config.reconnectInterval ?? 5000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
    }
    
    this.servers.set(server.id, server)
    
    // 初始化运行时信息
    this.runtimes.set(server.id, {
      config: server,
      status: 'disconnected',
      tools: [],
      resources: [],
      reconnectCount: 0,
    })
    
    console.log(`[MCPConnectionManager] 添加服务器: ${server.name}`)
    this.emit('serverAdded', server)
    
    return server
  }
  
  /**
   * 移除 MCP 服务器
   */
  async removeServer(serverId: string): Promise<boolean> {
    const runtime = this.runtimes.get(serverId)
    
    if (runtime && (runtime.status === 'connected' || runtime.status === 'connecting')) {
      await this.disconnectServer(serverId)
    }
    
    const removed = this.servers.delete(serverId)
    this.runtimes.delete(serverId)
    
    if (removed) {
      console.log(`[MCPConnectionManager] 移除服务器: ${serverId}`)
      this.emit('serverRemoved', { serverId })
    }
    
    return removed
  }
  
  /**
   * 获取所有服务器配置
   */
  getServers(): MCPServerConfig[] {
    return Array.from(this.servers.values())
  }
  
  /**
   * 获取服务器配置
   */
  getServer(serverId: string): MCPServerConfig | undefined {
    return this.servers.get(serverId)
  }
  
  // ==================== 连接管理 ====================
  
  /**
   * 连接到 MCP 服务器
   */
  async connectServer(serverId: string): Promise<boolean> {
    const config = this.servers.get(serverId)
    if (!config) {
      throw new Error(`服务器不存在: ${serverId}`)
    }
    
    if (!config.enabled) {
      throw new Error(`服务器未启用: ${config.name}`)
    }
    
    const runtime = this.runtimes.get(serverId)!
    
    if (runtime.status === 'connected') {
      console.log(`[MCPConnectionManager] 服务器已连接: ${config.name}`)
      return true
    }
    
    console.log(`[MCPConnectionManager] 正在连接到: ${config.name} (${config.transport || 'stdio'})`)
    runtime.status = 'connecting'
    this.emit('serverConnecting', { serverId, config })
    
    try {
      let success = false
      
      switch (config.transport || 'stdio') {
        case 'stdio':
          success = await this.connectStdioServer(config, runtime)
          break
        case 'http':
        case 'streamable-http':
          success = await this.connectHttpServer(config, runtime)
          break
        case 'websocket':
          success = await this.connectWebSocketServer(config, runtime)
          break
        case 'sse':
          success = await this.connectSSEServer(config, runtime)
          break
        default:
          throw new Error(`不支持的传输协议: ${config.transport}`)
      }
      
      if (success) {
        runtime.status = 'connected'
        runtime.connectedAt = Date.now()
        runtime.reconnectCount = 0
        
        console.log(`[MCPConnectionManager] ✅ 连接成功: ${config.name}`)
        this.emit('serverConnected', { serverId, config, tools: runtime.tools })
        
        // 启动健康检查
        this.startHealthCheck(serverId)
        
        return true
      } else {
        throw new Error('连接失败')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      runtime.status = 'error'
      runtime.error = errorMessage
      runtime.lastErrorAt = Date.now()
      
      console.error(`[MCPConnectionManager] ❌ 连接失败: ${config.name} - ${errorMessage}`)
      this.emit('serverError', { serverId, error: errorMessage })
      
      // 尝试自动重连
      if (config.autoReconnect && runtime.reconnectCount < (config.maxReconnectAttempts || 10)) {
        this.scheduleReconnect(serverId)
      }
      
      return false
    }
  }
  
  /**
   * 断开 MCP 服务器连接
   */
  async disconnectServer(serverId: string): Promise<void> {
    const runtime = this.runtimes.get(serverId)
    if (!runtime) return
    
    console.log(`[MCPConnectionManager] 断开连接: ${runtime.config.name}`)
    
    // 终止进程
    if (runtime.process) {
      runtime.process.kill('SIGTERM')
      
      // 等待进程退出
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (runtime.process && !runtime.process.killed) {
            runtime.process.kill('SIGKILL')
          }
          resolve()
        }, 5000)
      })
      
      runtime.process = undefined
    }
    
    runtime.status = 'disconnected'
    runtime.tools = []
    runtime.resources = []
    
    this.emit('serverDisconnected', { serverId })
  }
  
  /**
   * 断开所有服务器
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises: Promise<void>[] = []
    
    for (const [serverId, runtime] of this.runtimes) {
      if (runtime.status === 'connected' || runtime.status === 'connecting') {
        disconnectPromises.push(this.disconnectServer(serverId))
      }
    }
    
    await Promise.all(disconnectPromises)
    console.log('[MCPConnectionManager] 所有服务器已断开')
  }
  
  /**
   * 列出所有服务器 ID
   */
  listServers(): string[] {
    return Array.from(this.servers.keys())
  }
  
  // ==================== Stdio 传输实现 ====================
  
  /**
   * 通过 Stdio 连接服务器
   */
  private async connectStdioServer(
    config: MCPServerConfig,
    runtime: MCPServerRuntime
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        const child = spawn(config.command, config.args, {
          env: { ...process.env, ...config.env },
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        })
        
        runtime.process = child
        
        let stdout = ''
        let stderr = ''
        let initialized = false
        
        // 设置超时
        const timeout = setTimeout(() => {
          if (!initialized) {
            child.kill()
            reject(new Error('连接超时'))
          }
        }, this.connectionTimeout)
        
        // 处理 stdout
        child.stdout?.on('data', (data: Buffer) => {
          const message = data.toString()
          stdout += message
          
          try {
            // 尝试解析 JSON-RPC 消息
            const parsed = JSON.parse(message)
            
            if (parsed.method === 'initialize' || parsed.result?.capabilities) {
              initialized = true
              clearTimeout(timeout)
              
              // 初始化成功，请求工具列表
              this.sendJsonRpc(child, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
            } else if (parsed.method === 'tools/list' && parsed.result?.tools) {
              runtime.tools = parsed.result.tools
              console.log(`[MCPConnectionManager] 加载了 ${runtime.tools.length} 个工具`)
              
              // 请求资源列表
              this.sendJsonRpc(child, { jsonrpc: '2.0', id: 2, method: 'resources/list', params: {} })
            } else if (parsed.method === 'resources/list' && parsed.result?.resources) {
              runtime.resources = parsed.result.resources
              resolve(true)
            }
          } catch {
            // 非JSON 数据，忽略
          }
        })
        
        // 处理 stderr
        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString()
          console.warn(`[MCP:${config.name}] stderr: ${data.toString()}`)
        })
        
        // 处理错误
        child.on('error', (error) => {
          clearTimeout(timeout)
          reject(new Error(`进程启动失败: ${error.message}`))
        })
        
        // 处理退出
        child.on('close', (code) => {
          clearTimeout(timeout)
          
          if (!initialized) {
            reject(new Error(`进程意外退出，退出码: ${code}${stderr ? `\n${stderr}` : ''}`))
          } else {
            runtime.status = 'disconnected'
            this.emit('serverDisconnected', { serverId: config.id })
          }
        })
        
        // 发送初始化请求
        this.sendJsonRpc(child, {
          jsonrpc: '2.0',
          id: 0,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'claude-code-haha-server', version: '1.0.0' },
          },
        })
        
      } catch (error) {
        reject(error)
      }
    })
  }
  
  /**
   * 发送 JSON-RPC 消息
   */
  private sendJsonRpc(process: ChildProcess, message: Record<string, unknown>): void {
    if (process.stdin && !process.stdin.destroyed) {
      process.stdin.write(JSON.stringify(message) + '\n')
    }
  }
  
  // ==================== HTTP 传输实现 ====================
  
  /**
   * 通过 HTTP 连接服务器
   */
  private async connectHttpServer(
    config: MCPServerConfig,
    runtime: MCPServerRuntime
  ): Promise<boolean> {
    if (!config.url) {
      throw new Error('HTTP 传输需要 URL')
    }
    
    try {
      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 0,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'claude-code-haha-server', version: '1.0.0' },
          },
        }),
        signal: AbortSignal.timeout(this.connectionTimeout),
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      
      if (result.error) {
        throw new Error(result.error.message || '初始化失败')
      }
      
      // 获取工具列表
      const toolsResponse = await fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...config.headers },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      })
      
      const toolsResult = await toolsResponse.json()
      runtime.tools = toolsResult.result?.tools || []
      
      console.log(`[MCPConnectionManager] HTTP 连接成功，加载了 ${runtime.tools.length} 个工具`)
      
      return true
      
    } catch (error) {
      throw new Error(`HTTP 连接失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  /**
   * 通过 WebSocket 连接服务器
   */
  private async connectWebSocketServer(
    _config: MCPServerConfig,
    _runtime: MCPServerRuntime
  ): Promise<boolean> {
    // TODO: 实现 WebSocket 传输
    console.warn('[MCPConnectionManager] WebSocket 传输暂未实现')
    return false
  }
  
  /**
   * 通过 SSE 连接服务器
   */
  private async connectSSEServer(
    _config: MCPServerConfig,
    _runtime: MCPServerRuntime
  ): Promise<boolean> {
    // TODO: 实现 SSE 传输
    console.warn('[MCPConnectionManager] SSE 传输暂未实现')
    return false
  }
  
  // ==================== 工具调用 ====================
  
  /**
   * 调用 MCP 工具
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const runtime = this.runtimes.get(serverId)
    
    if (!runtime || runtime.status !== 'connected') {
      return { success: false, error: `服务器未连接: ${serverId}` }
    }
    
    const tool = runtime.tools.find(t => t.name === toolName)
    if (!tool) {
      return { success: false, error: `工具不存在: ${toolName}` }
    }
    
    console.log(`[MCPConnectionManager] 调用工具: ${toolName}`)
    this.emit('toolCallStart', { serverId, toolName, args })
    
    try {
      let result: unknown
      
      if (runtime.process) {
        // Stdio 传输
        result = await this.callToolViaStdio(runtime.process, toolName, args)
      } else if (runtime.config.url) {
        // HTTP 传输
        result = await this.callToolViaHttp(runtime.config, toolName, args)
      } else {
        throw new Error('无法确定传输方式')
      }
      
      this.emit('toolCallEnd', { serverId, toolName, result })
      return { success: true, result }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.emit('toolCallError', { serverId, toolName, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }
  
  /**
   * 通过 Stdio 调用工具
   */
  private async callToolViaStdio(
    process: ChildProcess,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = uuidv4()
      let responded = false
      
      const timeout = setTimeout(() => {
        if (!responded) {
          responded = true
          reject(new Error('工具调用超时'))
        }
      }, 60000)
      
      const handler = (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString())
          
          if (message.id === id) {
            responded = true
            clearTimeout(timeout)
            process.stdout?.off('data', handler)
            
            if (message.error) {
              reject(new Error(message.error.message || '工具执行失败'))
            } else {
              resolve(message.result)
            }
          }
        } catch {
          // 忽略非响应消息
        }
      }
      
      process.stdout?.on('data', handler)
      
      // 发送工具调用请求
      this.sendJsonRpc(process, {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      })
    })
  }
  
  /**
   * 通过 HTTP 调用工具
   */
  private async callToolViaHttp(
    config: MCPServerConfig,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const response = await fetch(config.url!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...config.headers },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: uuidv4(),
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    
    const result = await response.json()
    
    if (result.error) {
      throw new Error(result.error.message)
    }
    
    return result.result
  }
  
  // ==================== 健康检查与重连 ====================
  
  /**
   * 启动健康检查
   */
  private startHealthCheck(serverId: string): void {
    const interval = setInterval(async () => {
      const runtime = this.runtimes.get(serverId)
      if (!runtime || runtime.status !== 'connected') {
        clearInterval(interval)
        return
      }
      
      // 简单的健康检查：检查进程是否存活
      if (runtime.process && runtime.process.exitCode === null) {
        // 进程正常
      } else {
        console.warn(`[MCPConnectionManager] 健康检查失败: ${runtime.config.name}`)
        this.emit('healthCheckFailed', { serverId })
        
        clearInterval(interval)
        
        // 触发重连
        if (runtime.config.autoReconnect) {
          this.scheduleReconnect(serverId)
        }
      }
    }, 30000) // 每30秒检查一次
    
    // 存储interval ID以便清理（实际应用中应该保存引用）
    ;(this as unknown as Record<string, unknown>)[`healthCheck_${serverId}`] = interval
  }
  
  /**
   * 安排重连
   */
  private scheduleReconnect(serverId: string): void {
    const runtime = this.runtimes.get(serverId)
    if (!runtime) return
    
    runtime.status = 'reconnecting'
    runtime.reconnectCount++
    
    const delay = (runtime.config.reconnectInterval || 5000) * Math.min(runtime.reconnectCount, 5)
    
    console.log(
      `[MCPConnectionManager] 将在 ${delay}ms 后尝试第 ${runtime.reconnectCount} 次重连: ${runtime.config.name}`
    )
    
    this.emit('serverReconnecting', { serverId, attempt: runtime.reconnectCount, delay })
    
    setTimeout(async () => {
      try {
        await this.connectServer(serverId)
      } catch (error) {
        console.error(`[MCPConnectionManager] 重连失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    }, delay)
  }
  
  // ==================== 查询方法 ====================
  
  /**
   * 获取服务器状态
   */
  getServerStatus(serverId: string): MCPServerStatus | undefined {
    return this.runtimes.get(serverId)?.status
  }
  
  /**
   * 获取服务器的工具列表
   */
  getServerTools(serverId: string): MCPToolDefinition[] {
    return this.runtimes.get(serverId)?.tools || []
  }
  
  /**
   * 获取所有可用工具
   */
  getAllTools(): Array<{ serverId: string; serverName: string; tool: MCPToolDefinition }> {
    const tools: Array<{ serverId: string; serverName: string; tool: MCPToolDefinition }> = []
    
    for (const [serverId, runtime] of this.runtimes) {
      if (runtime.status === 'connected') {
        for (const tool of runtime.tools) {
          tools.push({
            serverId,
            serverName: runtime.config.name,
            tool,
          })
        }
      }
    }
    
    return tools
  }
  
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
      status: MCPServerStatus
      toolCount: number
      reconnectCount: number
    }>
  } {
    const servers: Array<{
      id: string
      name: string
      status: MCPServerStatus
      toolCount: number
      reconnectCount: number
    }> = []
    
    let connectedCount = 0
    
    for (const [id, runtime] of this.runtimes) {
      if (runtime.status === 'connected') connectedCount++
      
      servers.push({
        id,
        name: runtime.config.name,
        status: runtime.status,
        toolCount: runtime.tools.length,
        reconnectCount: runtime.reconnectCount,
      })
    }
    
    return {
      totalServers: this.servers.size,
      connectedServers: connectedCount,
      totalTools: this.getAllTools().length,
      servers,
    }
  }
}

// ==================== 单例实例 ====================

let mcpConnectionManagerInstance: MCPConnectionManager | null = null

/**
 * 获取 MCP 连接管理器单例
 */
export function getMCPConnectionManager(): MCPConnectionManager {
  if (!mcpConnectionManagerInstance) {
    mcpConnectionManagerInstance = new MCPConnectionManager()
  }
  return mcpConnectionManagerInstance
}

export default MCPConnectionManager
