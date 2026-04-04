/**
 * MCP 客户端管理器 - 支持多种传输协议
 * 
 * 支持的传输协议：
 * - stdio: 标准输入/输出通信
 * - websocket: WebSocket 通信
 * - sse: Server-Sent Events
 * - streamable-http: HTTP Streamable 传输
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'

export interface MCPServerConfig {
  id: string
  name: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
  transport: 'stdio' | 'websocket' | 'sse' | 'streamable-http'
  url?: string
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverId: string
  serverName: string
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

export interface MCPResult {
  success: boolean
  result?: unknown
  error?: string
}

export type MCPServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface MCPServerRuntime {
  config: MCPServerConfig
  status: MCPServerStatus
  process?: ChildProcess
  tools: MCPTool[]
  resources: MCPResource[]
  error?: string
  connectedAt?: number
}

export type EventSender = (event: string, data: unknown) => void

interface MCPRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

interface MCPResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface MCPNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

/**
 * Stdio 传输协议实现
 */
class StdioTransport extends EventEmitter {
  private process: ChildProcess | null = null
  private messageId = 0
  private pendingRequests = new Map<string | number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private buffer = ''

  async connect(config: MCPServerConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = config.args || []
      
      this.process = spawn(config.command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...config.env },
        shell: true,
      })

      this.process.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString()
        this.processBuffer()
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        this.emit('error', data.toString())
      })

      this.process.on('error', (error) => {
        this.emit('error', error.message)
        reject(error)
      })

      this.process.on('close', (code) => {
        this.emit('close', code)
      })

      // 初始化握手
      setTimeout(() => {
        this.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
          },
          clientInfo: {
            name: 'claude-code-haha-web',
            version: '1.0.0',
          },
        }).then(() => {
          this.emit('connected')
          resolve()
        }).catch(reject)
      }, 500)
    })
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line)
          this.handleMessage(message)
        } catch {
          // Ignore non-JSON lines
        }
      }
    }
  }

  private handleMessage(message: MCPResponse | MCPNotification): void {
    if ('id' in message && message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        this.pendingRequests.delete(message.id)
        if ('error' in message && message.error) {
          pending.reject(new Error(message.error.message))
        } else if ('result' in message) {
          pending.resolve(message.result)
        }
      }
    } else if ('method' in message) {
      this.emit('notification', message.method, message.params)
    }
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Process not connected'))
        return
      }

      const id = ++this.messageId
      const request: MCPRequest = { jsonrpc: '2.0', id, method, params }
      
      this.pendingRequests.set(id, { resolve, reject })
      this.process.stdin.write(JSON.stringify(request) + '\n')

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 30000)
    })
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPResult> {
    try {
      const result = await this.sendRequest('tools/call', {
        name,
        arguments: args,
      })
      return { success: true, result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }
    }
  }

  async listTools(): Promise<MCPTool[]> {
    try {
      const result = await this.sendRequest('tools/list') as { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> }
      return (result.tools || []).map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
        serverId: '',
        serverName: '',
      }))
    } catch {
      return []
    }
  }

  disconnect(): void {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
    this.pendingRequests.clear()
    this.buffer = ''
  }
}

/**
 * WebSocket 传输协议实现
 */
class WebSocketTransport extends EventEmitter {
  private ws: WebSocket | null = null
  private messageId = 0
  private pendingRequests = new Map<string | number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private url: string

  constructor(url: string) {
    super()
    this.url = url
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          this.sendRequest('initialize', {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {}, resources: {} },
            clientInfo: { name: 'claude-code-haha-web', version: '1.0.0' },
          }).then(() => {
            this.emit('connected')
            resolve()
          }).catch(reject)
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            this.handleMessage(message)
          } catch {
            // Ignore non-JSON messages
          }
        }

        this.ws.onerror = (error) => {
          this.emit('error', error)
          reject(new Error('WebSocket connection failed'))
        }

        this.ws.onclose = () => {
          this.emit('close')
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  private handleMessage(message: MCPResponse | MCPNotification): void {
    if ('id' in message && message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id)
      if (pending) {
        this.pendingRequests.delete(message.id)
        if ('error' in message && message.error) {
          pending.reject(new Error(message.error.message))
        } else if ('result' in message) {
          pending.resolve(message.result)
        }
      }
    } else if ('method' in message) {
      this.emit('notification', message.method, message.params)
    }
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'))
        return
      }

      const id = ++this.messageId
      const request: MCPRequest = { jsonrpc: '2.0', id, method, params }
      
      this.pendingRequests.set(id, { resolve, reject })
      this.ws.send(JSON.stringify(request))

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 30000)
    })
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPResult> {
    try {
      const result = await this.sendRequest('tools/call', { name, arguments: args })
      return { success: true, result }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }
    }
  }

  async listTools(): Promise<MCPTool[]> {
    try {
      const result = await this.sendRequest('tools/list') as { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> }
      return (result.tools || []).map(t => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || { type: 'object', properties: {} },
        serverId: '',
        serverName: '',
      }))
    } catch {
      return []
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.pendingRequests.clear()
  }
}

/**
 * HTTP Streamable 传输协议实现
 */
class StreamableHttpTransport extends EventEmitter {
  private baseUrl: string
  private sessionId: string | null = null
  private messageId = 0

  constructor(url: string) {
    super()
    this.baseUrl = url
  }

  async connect(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          protocolVersion: '2024-11-05',
          capabilities: { tools: {}, resources: {} },
          clientInfo: { name: 'claude-code-haha-web', version: '1.0.0' },
        }),
      })

      if (response.ok) {
        const data = await response.json() as { sessionId?: string }
        this.sessionId = data.sessionId || uuidv4()
        this.emit('connected')
      } else {
        throw new Error(`HTTP ${response.status}`)
      }
    } catch (error) {
      this.emit('error', error)
      throw error
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPResult> {
    try {
      const response = await fetch(`${this.baseUrl}/tools/call`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(this.sessionId ? { 'MCP-Session-ID': this.sessionId } : {}),
        },
        body: JSON.stringify({ name, arguments: args }),
      })

      if (response.ok) {
        const result = await response.json()
        return { success: true, result }
      } else {
        const error = await response.text()
        return { success: false, error }
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }
    }
  }

  async listTools(): Promise<MCPTool[]> {
    try {
      const response = await fetch(`${this.baseUrl}/tools/list`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(this.sessionId ? { 'MCP-Session-ID': this.sessionId } : {}),
        },
      })

      if (response.ok) {
        const data = await response.json() as { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> }
        return (data.tools || []).map(t => ({
          name: t.name,
          description: t.description || '',
          inputSchema: t.inputSchema || { type: 'object', properties: {} },
          serverId: '',
          serverName: '',
        }))
      }
      return []
    } catch {
      return []
    }
  }

  disconnect(): void {
    this.sessionId = null
  }
}

/**
 * MCP 服务器连接管理器
 */
class MCPClientConnection {
  private transport: StdioTransport | WebSocketTransport | StreamableHttpTransport | null = null
  public runtime: MCPServerRuntime

  constructor(config: MCPServerConfig) {
    this.runtime = {
      config,
      status: 'disconnected',
      tools: [],
      resources: [],
    }
  }

  async connect(): Promise<void> {
    const { config } = this.runtime

    this.runtime.status = 'connecting'

    try {
      switch (config.transport) {
        case 'stdio':
          this.transport = new StdioTransport()
          await (this.transport as StdioTransport).connect(config)
          break

        case 'websocket':
          if (!config.url) throw new Error('WebSocket URL is required')
          this.transport = new WebSocketTransport(config.url)
          await (this.transport as WebSocketTransport).connect()
          break

        case 'streamable-http':
          if (!config.url) throw new Error('HTTP URL is required')
          this.transport = new StreamableHttpTransport(config.url)
          await (this.transport as StreamableHttpTransport).connect()
          break

        case 'sse':
          if (!config.url) throw new Error('SSE URL is required')
          // SSE 使用与 WebSocket 相同的连接方式
          this.transport = new WebSocketTransport(config.url.replace('/sse', '/ws'))
          await (this.transport as WebSocketTransport).connect()
          break

        default:
          throw new Error(`Unsupported transport: ${config.transport}`)
      }

      // 获取工具列表
      if (this.transport) {
        this.runtime.tools = await this.transport.listTools()
      }

      this.runtime.status = 'connected'
      this.runtime.connectedAt = Date.now()
      this.runtime.error = undefined

    } catch (error) {
      this.runtime.status = 'error'
      this.runtime.error = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPResult> {
    if (!this.transport || this.runtime.status !== 'connected') {
      return { success: false, error: 'Server not connected' }
    }
    return this.transport.callTool(name, args)
  }

  disconnect(): void {
    if (this.transport) {
      this.transport.disconnect()
      this.transport = null
    }
    this.runtime.status = 'disconnected'
    this.runtime.connectedAt = undefined
  }
}

/**
 * MCP 服务器管理器 - 统一管理多个 MCP 服务器
 */
class MCPClientManager {
  private connections = new Map<string, MCPClientConnection>()
  private config: MCPServerConfig[] = []
  private builtinTools: MCPTool[] = []
  private builtinResources: MCPResource[] = []

  constructor() {
    this.initBuiltin()
  }

  private initBuiltin(): void {
    // 内置工具定义
    this.builtinTools = [
      {
        name: 'fs_read',
        description: 'Read file contents',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to read' },
          },
          required: ['path'],
        },
        serverId: 'builtin',
        serverName: 'Builtin',
      },
      {
        name: 'fs_write',
        description: 'Write content to file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to write' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['path', 'content'],
        },
        serverId: 'builtin',
        serverName: 'Builtin',
      },
      {
        name: 'fs_list',
        description: 'List directory contents',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path' },
          },
          required: ['path'],
        },
        serverId: 'builtin',
        serverName: 'Builtin',
      },
      {
        name: 'fs_stat',
        description: 'Get file statistics',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File or directory path' },
          },
          required: ['path'],
        },
        serverId: 'builtin',
        serverName: 'Builtin',
      },
      {
        name: 'search_grep',
        description: 'Search for pattern in files',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern to search' },
            path: { type: 'string', description: 'Directory or file to search' },
          },
          required: ['pattern'],
        },
        serverId: 'builtin',
        serverName: 'Builtin',
      },
      {
        name: 'search_glob',
        description: 'Find files matching pattern',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Glob pattern' },
            path: { type: 'string', description: 'Base directory' },
          },
          required: ['pattern'],
        },
        serverId: 'builtin',
        serverName: 'Builtin',
      },
      {
        name: 'process_exec',
        description: 'Execute shell command',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to execute' },
            cwd: { type: 'string', description: 'Working directory' },
            timeout: { type: 'number', description: 'Timeout in milliseconds' },
          },
          required: ['command'],
        },
        serverId: 'builtin',
        serverName: 'Builtin',
      },
    ]

    // 内置资源定义
    this.builtinResources = [
      {
        uri: 'file://config',
        name: 'Configuration',
        description: 'Application configuration',
        mimeType: 'application/json',
        serverId: 'builtin',
      },
      {
        uri: 'file://env',
        name: 'Environment',
        description: 'Environment variables',
        mimeType: 'text/plain',
        serverId: 'builtin',
      },
    ]
  }

  getBuiltinTools(): MCPTool[] {
    return [...this.builtinTools]
  }

  getBuiltinResources(): MCPResource[] {
    return [...this.builtinResources]
  }

  getConfig(): MCPServerConfig[] {
    return [...this.config]
  }

  addServer(config: Omit<MCPServerConfig, 'id'>): MCPServerConfig {
    const server: MCPServerConfig = {
      ...config,
      id: uuidv4(),
    }
    this.config.push(server)
    return server
  }

  updateServer(id: string, updates: Partial<MCPServerConfig>): boolean {
    const index = this.config.findIndex(s => s.id === id)
    if (index >= 0) {
      this.config[index] = { ...this.config[index], ...updates }
      return true
    }
    return false
  }

  removeServer(id: string): boolean {
    const index = this.config.findIndex(s => s.id === id)
    if (index >= 0) {
      // 断开连接
      const connection = this.connections.get(id)
      if (connection) {
        connection.disconnect()
        this.connections.delete(id)
      }
      this.config.splice(index, 1)
      return true
    }
    return false
  }

  async connectServer(id: string): Promise<void> {
    const config = this.config.find(s => s.id === id)
    if (!config) {
      throw new Error(`Server not found: ${id}`)
    }

    let connection = this.connections.get(id)
    if (!connection) {
      connection = new MCPClientConnection(config)
      this.connections.set(id, connection)
    }

    await connection.connect()
  }

  disconnectServer(id: string): void {
    const connection = this.connections.get(id)
    if (connection) {
      connection.disconnect()
    }
  }

  async reconnectAll(): Promise<void> {
    const enabledServers = this.config.filter(s => s.enabled)
    await Promise.all(enabledServers.map(s => this.connectServer(s.id).catch(err => {
      console.error(`Failed to connect ${s.name}:`, err.message)
    })))
  }

  getServerRuntime(id: string): MCPServerRuntime | undefined {
    const connection = this.connections.get(id)
    return connection?.runtime
  }

  getAllServerRuntimes(): MCPServerRuntime[] {
    return this.config.map(config => {
      const connection = this.connections.get(config.id)
      return connection?.runtime || { config, status: 'disconnected', tools: [], resources: [] }
    })
  }

  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [...this.builtinTools]
    
    for (const connection of this.connections.values()) {
      if (connection.runtime.status === 'connected') {
        for (const tool of connection.runtime.tools) {
          tools.push({ ...tool, serverId: connection.runtime.config.id, serverName: connection.runtime.config.name })
        }
      }
    }
    
    return tools
  }

  getAllResources(): MCPResource[] {
    const resources: MCPResource[] = [...this.builtinResources]
    
    for (const connection of this.connections.values()) {
      if (connection.runtime.status === 'connected') {
        for (const resource of connection.runtime.resources) {
          resources.push({ ...resource, serverId: connection.runtime.config.id })
        }
      }
    }
    
    return resources
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPResult> {
    // 首先检查内置工具
    const builtinTool = this.builtinTools.find(t => t.name === name)
    if (builtinTool) {
      return this.executeBuiltinTool(name, args)
    }

    // 查找远程服务器上的工具
    for (const connection of this.connections.values()) {
      if (connection.runtime.status === 'connected') {
        const tool = connection.runtime.tools.find(t => t.name === name)
        if (tool) {
          return connection.callTool(name, args)
        }
      }
    }

    return { success: false, error: `Tool not found: ${name}` }
  }

  private async executeBuiltinTool(name: string, args: Record<string, unknown>): Promise<MCPResult> {
    try {
      const { readFile, writeFile, readdir, stat } = await import('fs/promises')
      const { glob } = await import('glob')
      const { exec } = await import('child_process')
      const { promisify } = await import('util')
      const execAsync = promisify(exec)

      switch (name) {
        case 'fs_read':
          return { success: true, result: { content: await readFile(args.path as string, 'utf-8'), path: args.path } }

        case 'fs_write':
          await writeFile(args.path as string, args.content as string)
          return { success: true, result: { path: args.path, written: true } }

        case 'fs_list':
          const entries = await readdir(args.path as string, { withFileTypes: true })
          return { 
            success: true, 
            result: { 
              entries: entries.map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })),
              path: args.path,
            } 
          }

        case 'fs_stat':
          const stats = await stat(args.path as string)
          return { 
            success: true, 
            result: { 
              path: args.path,
              size: stats.size,
              isFile: stats.isFile(),
              isDirectory: stats.isDirectory(),
              created: stats.birthtime,
              modified: stats.mtime,
            } 
          }

        case 'search_glob':
          const files = await glob(args.pattern as string, { 
            cwd: args.path as string || '.',
            ignore: ['**/node_modules/**', '**/.git/**'],
          })
          return { success: true, result: { pattern: args.pattern, files, count: files.length } }

        case 'search_grep':
          // 简单的 grep 实现
          const searchFiles = await glob('**/*', { 
            cwd: args.path as string || '.',
            ignore: ['**/node_modules/**', '**/.git/**'],
          })
          const grepResults: string[] = []
          const pattern = new RegExp(args.pattern as string, 'gi')
          
          for (const file of searchFiles.slice(0, 100)) {
            try {
              const content = await readFile(`${args.path}/${file}`, 'utf-8')
              const lines = content.split('\n')
              for (let i = 0; i < lines.length; i++) {
                if (pattern.test(lines[i])) {
                  grepResults.push(`${file}:${i + 1}: ${lines[i]}`)
                }
              }
              pattern.lastIndex = 0
            } catch {
              // Skip unreadable files
            }
          }
          return { success: true, result: { pattern: args.pattern, results: grepResults } }

        case 'process_exec':
          const command = args.command as string
          const cwd = args.cwd as string || process.cwd()
          const timeout = args.timeout as number || 60000
          const { stdout, stderr } = await execAsync(command, { cwd, timeout })
          return { success: true, result: { stdout, stderr, exitCode: 0 } }

        default:
          return { success: false, error: `Unknown builtin tool: ${name}` }
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }
    }
  }

  async readResource(uri: string): Promise<{ success: boolean; content?: string; mimeType?: string; error?: string }> {
    // 解析 URI
    if (uri.startsWith('file://')) {
      const path = uri.slice(7)
      try {
        const { readFile } = await import('fs/promises')
        const content = await readFile(path, 'utf-8')
        return { success: true, content, mimeType: 'text/plain' }
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        }
      }
    }

    return { success: false, error: `Unknown URI scheme: ${uri}` }
  }

  getStatus(): {
    totalServers: number
    connectedServers: number
    enabledServers: number
    totalTools: number
    totalResources: number
  } {
    let connectedServers = 0
    for (const connection of this.connections.values()) {
      if (connection.runtime.status === 'connected') {
        connectedServers++
      }
    }

    return {
      totalServers: this.config.length,
      connectedServers,
      enabledServers: this.config.filter(s => s.enabled).length,
      totalTools: this.getAllTools().length,
      totalResources: this.getAllResources().length,
    }
  }

  async testConnection(id: string): Promise<{ success: boolean; message: string }> {
    const config = this.config.find(s => s.id === id)
    if (!config) {
      return { success: false, message: 'Server not found' }
    }

    try {
      const connection = new MCPClientConnection(config)
      await connection.connect()
      connection.disconnect()
      return { success: true, message: 'Connection successful' }
    } catch (error) {
      return { 
        success: false, 
        message: `Connection failed: ${error instanceof Error ? error.message : String(error)}` 
      }
    }
  }

  importConfig(configs: MCPServerConfig[]): number {
    let imported = 0
    for (const config of configs) {
      if (!this.config.some(c => c.id === config.id)) {
        this.config.push(config)
        imported++
      }
    }
    return imported
  }

  exportConfig(): MCPServerConfig[] {
    return this.config.map(c => ({ ...c }))
  }
}

// 导出单例
export const mcpClientManager = new MCPClientManager()
export default mcpClientManager
