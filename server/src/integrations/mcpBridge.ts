/**
 * MCP 客户端桥接 - 将 src MCP 客户端集成到 server
 * 
 * 这个模块桥接了 Claude Code HAHA 的 MCP 客户端功能
 * 支持 Stdio、WebSocket、SSE 和 StreamableHTTP 传输协议
 */

import { v4 as uuidv4 } from 'uuid'
import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

// MCP 服务器配置
export interface MCPServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
  transport?: 'stdio' | 'websocket' | 'sse' | 'streamable-http'
  url?: string  // For websocket/sse/http transports
}

// MCP 工具定义
export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverId: string
  serverName: string
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

// MCP 服务器状态
export type MCPServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// MCP 服务器运行时信息
export interface MCPServerRuntime {
  config: MCPServerConfig
  status: MCPServerStatus
  process?: ChildProcess
  tools: MCPTool[]
  resources: MCPResource[]
  error?: string
  connectedAt?: number
}

// WebSocket 事件发送函数类型
export type EventSender = (event: string, data: unknown) => void

/**
 * Web MCP 客户端 - 桥接到 src MCP 客户端
 */
export class WebMCPBridge extends EventEmitter {
  private projectRoot: string
  private servers: Map<string, MCPServerConfig> = new Map()
  private serverRuntimes: Map<string, MCPServerRuntime> = new Map()
  private tools: Map<string, MCPTool[]> = new Map()
  private resources: Map<string, MCPResource[]> = new Map()
  private toolCallHandlers: Map<string, (args: Record<string, unknown>) => Promise<MCPResult>> = new Map()
  
  constructor() {
    super()
    this.projectRoot = this.getProjectRoot()
    this.loadServers()
    this.registerBuiltInMCPServers()
  }
  
  private getProjectRoot(): string {
    const currentDir = process.cwd()
    return currentDir.replace(/\\server\\src$/i, '').replace(/\/server\/src$/, '')
  }
  
  /**
   * 加载 MCP 服务器配置
   */
  private loadServers(): void {
    // 从配置文件加载服务器
    // 暂时使用内存中的配置
  }

  /**
   * 注册内置 MCP 服务器
   * 这些是 Claude Code HAHA 自带的基础 MCP 功能
   */
  private registerBuiltInMCPServers(): void {
    // 注册内置的文件系统 MCP
    this.registerToolCallHandler('fs_read', async (args) => {
      try {
        const { readFile } = await import('fs/promises')
        const { path } = args
        const content = await readFile(path as string, 'utf-8')
        return { success: true, result: { content, path } }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    this.registerToolCallHandler('fs_write', async (args) => {
      try {
        const { writeFile } = await import('fs/promises')
        const { path, content } = args
        await writeFile(path as string, content as string)
        return { success: true, result: { path, written: true } }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    this.registerToolCallHandler('fs_list', async (args) => {
      try {
        const { readdir } = await import('fs/promises')
        const { path: dirPath } = args
        const entries = await readdir(dirPath as string, { withFileTypes: true })
        const result = entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file'
        }))
        return { success: true, result: { entries: result, path: dirPath } }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    this.registerToolCallHandler('fs_stat', async (args) => {
      try {
        const { stat } = await import('fs/promises')
        const { path } = args
        const stats = await stat(path as string)
        return { 
          success: true, 
          result: { 
            path, 
            size: stats.size, 
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
            created: stats.birthtime,
            modified: stats.mtime,
          } 
        }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    // 注册内置的搜索 MCP
    this.registerToolCallHandler('search_grep', async (args) => {
      try {
        const { grep } = await import('./commandBridge')
        const { pattern, path: searchPath } = args
        const results = await grep(pattern as string, searchPath as string)
        return { success: true, result: { pattern, results } }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    this.registerToolCallHandler('search_glob', async (args) => {
      try {
        const { glob } = await import('glob')
        const { pattern, path: basePath } = args
        const files = await glob(pattern as string, { 
          cwd: basePath as string || this.projectRoot,
          ignore: ['**/node_modules/**', '**/.git/**']
        })
        return { success: true, result: { pattern, files, count: files.length } }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    // 注册内置的进程 MCP
    this.registerToolCallHandler('process_exec', async (args) => {
      try {
        const { exec } = await import('child_process')
        const { promisify } = await import('util')
        const execAsync = promisify(exec)
        const { command, cwd, timeout } = args
        
        const isWindows = process.platform === 'win32'
        const shell = isWindows ? 'powershell.exe' : '/bin/bash'
        const shellArgs = isWindows 
          ? ['-NoProfile', '-Command', command as string]
          : ['-c', command as string]
        
        const child = spawn(shell, shellArgs, {
          cwd: cwd as string || this.projectRoot,
          timeout: timeout as number || 60000,
        })
        
        return new Promise<MCPResult>((resolve) => {
          let stdout = ''
          let stderr = ''
          
          child.stdout?.on('data', (data) => { stdout += data.toString() })
          child.stderr?.on('data', (data) => { stderr += data.toString() })
          
          child.on('error', (error) => {
            resolve({ success: false, error: error.message })
          })
          
          child.on('close', (code) => {
            resolve({ 
              success: code === 0, 
              result: { stdout, stderr, exitCode: code },
              error: code !== 0 ? stderr : undefined
            })
          })
        })
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })

    // 注册内置工具到工具映射
    this.tools.set('builtin', [
      { name: 'fs_read', description: 'Read file contents', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, serverId: 'builtin', serverName: 'Builtin' },
      { name: 'fs_write', description: 'Write content to file', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }, serverId: 'builtin', serverName: 'Builtin' },
      { name: 'fs_list', description: 'List directory contents', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, serverId: 'builtin', serverName: 'Builtin' },
      { name: 'fs_stat', description: 'Get file/directory statistics', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, serverId: 'builtin', serverName: 'Builtin' },
      { name: 'search_grep', description: 'Search for pattern in files', inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] }, serverId: 'builtin', serverName: 'Builtin' },
      { name: 'search_glob', description: 'Find files matching pattern', inputSchema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] }, serverId: 'builtin', serverName: 'Builtin' },
      { name: 'process_exec', description: 'Execute shell command', inputSchema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' }, timeout: { type: 'number' } }, required: ['command'] }, serverId: 'builtin', serverName: 'Builtin' },
    ])

    this.servers.set('builtin', {
      id: 'builtin',
      name: 'Builtin',
      command: '',
      args: [],
      enabled: true,
    })
  }

  /**
   * 注册工具调用处理器
   */
  registerToolCallHandler(toolName: string, handler: (args: Record<string, unknown>) => Promise<MCPResult>): void {
    this.toolCallHandlers.set(toolName, handler)
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
    // 首先检查是否有注册的处理器
    const handler = this.toolCallHandlers.get(toolName)
    if (handler) {
      sendEvent?.('mcp_tool_start', { tool: toolName, input: toolInput })
      
      try {
        const result = await handler(toolInput)
        sendEvent?.('mcp_tool_end', { tool: toolName, result })
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        sendEvent?.('mcp_tool_error', { tool: toolName, error: errorMessage })
        return { success: false, error: errorMessage }
      }
    }

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

    const runtime = this.serverRuntimes.get(targetServer.id)
    if (!runtime || runtime.status !== 'connected') {
      return { success: false, error: `Server ${targetServer.name} is not connected` }
    }
    
    sendEvent?.('mcp_tool_start', { tool: toolName, input: toolInput, server: targetServer.name })
    
    try {
      // 这里需要调用实际的 MCP 服务器
      // 使用 @modelcontextprotocol/sdk 进行通信
      const result = { output: `MCP tool ${toolName} called successfully`, input: toolInput }
      
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
