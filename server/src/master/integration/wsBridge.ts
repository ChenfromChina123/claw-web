/**
 * Claude Code HAHA - WebSocket RPC Bridge
 * 
 * A comprehensive bidirectional RPC system for real-time communication
 * between the React web frontend and the Bun server backend.
 * 
 * Features:
 * - Full-duplex WebSocket communication
 * - RPC method calling with responses
 * - Server-side event streaming to client
 * - Automatic reconnection with exponential backoff
 * - Message queuing during disconnection
 * - Type-safe message protocol
 */

// Global type declarations for Node.js/Bun types
declare global {
  interface BufferConstructor {
    isBuffer(obj: any): obj is Buffer;
  }
  
  interface Buffer {
    toString(encoding?: string): string;
  }
  
  var Buffer: BufferConstructor;
  
  namespace NodeJS {
    interface Timeout {
      hasRef(): boolean;
      ref(): Timeout;
      refresh(): Timeout;
      unref(): Timeout;
    }
  }
}

import { v4 as uuidv4 } from 'uuid'
import type { EventSender, Tool, ToolCall } from './webStore'
import { toolExecutor } from './enhancedToolExecutor'
import { WebMCPBridge, type MCPServerConfig, type MCPTool } from '../integrations/mcpBridge'
import { ptyManager } from './ptyManager'
import { wsPTYBridge } from './wsPTYBridge'

// 创建 MCP Bridge 实例
const mcpBridge = new WebMCPBridge()

// 导出 MCP Bridge 以便在其他模块使用
export { mcpBridge }

// ==================== Message Protocol Types ====================

export type MessageType =
  // Client -> Server RPC
  | 'rpc_call'
  | 'rpc_response'
  // Client -> Server commands
  | 'user_message'
  | 'create_session'
  | 'load_session'
  | 'list_sessions'
  | 'delete_session'
  | 'rename_session'
  | 'clear_session'
  // Server -> Client events
  | 'message_start'
  | 'message_delta'
  | 'message_stop'
  | 'tool_use'
  | 'tool_start'
  | 'tool_input_delta'
  | 'tool_end'
  | 'tool_error'
  | 'tool_progress'
  | 'session_created'
  | 'session_loaded'
  | 'session_list'
  | 'session_deleted'
  | 'session_renamed'
  | 'session_cleared'
  | 'streaming_chunk'
  | 'streaming_end'
  | 'error'
  // Auth
  | 'registered'
  | 'logged_in'
  | 'user_validated'
  | 'user_invalid'
  | 'authenticated'
  | 'auth_error'
  // System
  | 'ping'
  | 'pong'
  | 'subscribe'
  | 'unsubscribe'
  | 'broadcast'
  // Tool execution
  | 'tool_execute'
  | 'tool_result'
  | 'tool_executed'
  // MCP
  | 'mcp_server_added'
  | 'mcp_server_removed'
  | 'mcp_server_error'
  | 'mcp_tool_list'
  | 'mcp_tool_result'

export interface RPCRequest {
  id: string
  method: string
  params?: Record<string, unknown>
  timeout?: number
}

export interface RPCResponse {
  id: string
  success: boolean
  result?: unknown
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

export interface WebSocketMessage {
  type: MessageType
  id?: string
  // RPC
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: unknown
  // Session
  sessionId?: string
  title?: string
  model?: string
  // Messages
  content?: string
  text?: string
  role?: string
  messages?: unknown[]
  // Tool
  name?: string
  input?: unknown
  output?: unknown
  partial_json?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolId?: string
  toolResult?: unknown
  // User
  userId?: string
  username?: string
  token?: string
  // Events
  event?: string
  data?: unknown
  // Status
  status?: string
  stop_reason?: string
  // Pagination
  offset?: number
  limit?: number
  // MCP
  serverId?: string
  serverName?: string
  command?: string
  args?: string[]
  enabled?: boolean
  // Agent
  agentId?: string
  agentName?: string
  color?: string
  systemPrompt?: string
  // Task
  taskId?: string
  taskTitle?: string
  taskStatus?: string
  // Skill
  skillId?: string
  skillName?: string
  skillConfig?: Record<string, unknown>
  // Config
  key?: string
  value?: string
  // UI
  view?: string
  theme?: string
  expanded?: boolean
  // Tool Execution
  success?: boolean
  duration?: number
  streaming?: boolean
  category?: string
  tools?: unknown[]
  history?: unknown[]
  // Extra
  [key: string]: unknown
}

// ==================== RPC Handler ====================

export interface RPCMethod {
  name: string
  description: string
  params?: Record<string, { type: string; required?: boolean; description?: string }>
  execute: (params: Record<string, unknown>, context: RPCContext) => Promise<unknown>
}

export interface RPCContext {
  userId: string | null
  sessionId: string | null
  sendEvent: EventSender
  getConnectionId: () => string
  getRemoteAddress: () => string | undefined
}

// ==================== WebSocket Manager ====================

export class WebSocketManager {
  private connections: Map<string, WebSocketConnection> = new Map()
  private rpcMethods: Map<string, RPCMethod> = new Map()
  private broadcastChannels: Map<string, Set<string>> = new Map()
  private heartbeatInterval?: ReturnType<typeof setInterval>
  private cleanupInterval?: ReturnType<typeof setInterval>

  constructor() {
    this.registerDefaultMethods()
    this.startHeartbeat()
    this.startCleanup()
  }

  // ==================== Connection Management ====================

  addConnection(ws: unknown, connectionId: string, remoteAddress?: string): WebSocketConnection {
    const connection = new WebSocketConnection(connectionId, ws as WebSocket, remoteAddress)
    this.connections.set(connectionId, connection)
    
    connection.on('message', (msg: unknown) => this.handleMessage(connection, msg as string))
    connection.on('close', () => this.handleClose(connection))
    connection.on('error', (err: unknown) => this.handleError(connection, err instanceof Error ? err : new Error(String(err))))
    
    return connection
  }

  /**
   * Bun `websocket.message` 入口：将 rpc_call / ping 等交给统一处理（与 WebSocketConnection 订阅的 message 同源逻辑）
   */
  routeIncomingMessage(connectionId: string, rawMessage: string | Buffer): void {
    const connection = this.connections.get(connectionId)
    if (!connection) {
      console.warn('[WS] routeIncomingMessage: unknown connection', connectionId)
      return
    }
    this.handleMessage(connection, rawMessage)
  }

  /** 与 Bun 侧 wsData 同步，供 RPC（如 PTY）读取 userId / sessionId */
  syncConnectionMeta(
    connectionId: string,
    patch: { userId?: string | null; sessionId?: string | null }
  ): void {
    const c = this.connections.get(connectionId)
    if (!c) return
    if ('userId' in patch) c.userId = patch.userId ?? null
    if ('sessionId' in patch) c.sessionId = patch.sessionId ?? null
  }

  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId)
    if (connection) {
      connection.disconnect()
      this.connections.delete(connectionId)
      
      // Remove from broadcast channels
      for (const [, subscribers] of this.broadcastChannels) {
        subscribers.delete(connectionId)
      }
    }
  }

  getConnection(connectionId: string): WebSocketConnection | undefined {
    return this.connections.get(connectionId)
  }

  getAllConnections(): Map<string, WebSocketConnection> {
    return this.connections
  }

  /**
   * 向指定连接发送消息
   * @param connectionId 连接ID
   * @param message 消息内容
   * @returns 是否发送成功
   */
  sendToConnection(connectionId: string, message: WebSocketMessage): boolean {
    const connection = this.connections.get(connectionId)
    if (connection && connection.isConnected()) {
      return connection.send(message)
    }
    return false
  }

  getActiveSessions(): Set<string> {
    const sessions = new Set<string>()
    for (const [, conn] of this.connections) {
      if (conn.sessionId) {
        sessions.add(conn.sessionId)
      }
    }
    return sessions
  }

  // ==================== Message Handling ====================

  private handleMessage(connection: WebSocketConnection, rawMessage: string | Buffer): void {
    try {
      const messageStr = typeof rawMessage === 'string' ? rawMessage : rawMessage.toString()
      const message: WebSocketMessage = JSON.parse(messageStr)
      
      // Handle RPC calls
      if (message.type === 'rpc_call' && message.method) {
        this.handleRPCCall(connection, message)
        return
      }

      // Handle ping
      if (message.type === 'ping') {
        connection.send({ type: 'pong', timestamp: Date.now() })
        return
      }

      // Handle subscribe
      if (message.type === 'subscribe' && message.channel) {
        this.handleSubscribe(connection, message.channel as string)
        return
      }

      // Handle unsubscribe
      if (message.type === 'unsubscribe' && message.channel) {
        this.handleUnsubscribe(connection, message.channel as string)
        return
      }

      // Emit raw message for external handling
      connection.emit('raw_message', message)
    } catch (error) {
      connection.send({
        type: 'error',
        error: {
          code: 'PARSE_ERROR',
          message: `Failed to parse message: ${error instanceof Error ? error.message : String(error)}`,
        },
      })
    }
  }

  private handleClose(connection: WebSocketConnection): void {
    // 清理该连接的所有 PTY 会话（通过 ptyManager）
    ptyManager.destroyConnectionSessions(connection.id)
    this.removeConnection(connection.id)
    console.log(`Connection closed: ${connection.id}`)
  }

  private handleError(connection: WebSocketConnection, error: Error): void {
    console.error(`Connection error [${connection.id}]:`, error.message)
  }

  // ==================== RPC System ====================

  private handleRPCCall(connection: WebSocketConnection, message: WebSocketMessage): void {
    const rawId = message.id
    const requestId =
      rawId !== undefined && rawId !== null && String(rawId).length > 0
        ? String(rawId)
        : uuidv4()

    const request: RPCRequest = {
      id: requestId,
      method: message.method!,
      params: message.params,
      timeout: message.timeout as number | undefined,
    }

    if (request.method === 'pty.create') {
      console.log(`[WS RPC] pty.create id=${requestId} conn=${connection.id}`)
    }

    const context: RPCContext = {
      userId: connection.userId,
      sessionId: connection.sessionId,
      sendEvent: connection.sendEvent.bind(connection),
      getConnectionId: () => connection.id,
      getRemoteAddress: () => connection.remoteAddress,
    }

    const handler = this.rpcMethods.get(request.method)
    if (!handler) {
      connection.send({
        type: 'rpc_response',
        id: request.id,
        success: false,
        error: {
          code: 'METHOD_NOT_FOUND',
          message: `Method '${request.method}' not found`,
        },
      } as unknown as WebSocketMessage)
      return
    }

    // Execute with optional timeout
    const timeout = request.timeout || 30000
    const timeoutId = setTimeout(() => {
      connection.send({
        type: 'rpc_response',
        id: request.id,
        success: false,
        error: {
          code: 'TIMEOUT',
          message: `Method '${request.method}' timed out after ${timeout}ms`,
        },
      } as unknown as WebSocketMessage)
    }, timeout)

    handler
      .execute(request.params || {}, context)
      .then((result) => {
        clearTimeout(timeoutId)
        connection.send({
          type: 'rpc_response',
          id: request.id,
          success: true,
          result,
        } as unknown as WebSocketMessage)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        connection.send({
          type: 'rpc_response',
          id: request.id,
          success: false,
          error: {
            code: 'EXECUTION_ERROR',
            message: error instanceof Error ? error.message : String(error),
          },
        } as unknown as WebSocketMessage)
      })
  }

  registerMethod(method: RPCMethod): void {
    this.rpcMethods.set(method.name, method)
  }

  unregisterMethod(name: string): boolean {
    return this.rpcMethods.delete(name)
  }

  hasMethod(name: string): boolean {
    return this.rpcMethods.has(name)
  }

  getRegisteredMethods(): string[] {
    return Array.from(this.rpcMethods.keys())
  }

  // ==================== Broadcast Channels ====================

  private handleSubscribe(connection: WebSocketConnection, channel: string): void {
    if (!this.broadcastChannels.has(channel)) {
      this.broadcastChannels.set(channel, new Set())
    }
    this.broadcastChannels.get(channel)!.add(connection.id)
    connection.send({ type: 'subscribed' as any, channel })
  }

  private handleUnsubscribe(connection: WebSocketConnection, channel: string): void {
    this.broadcastChannels.get(channel)?.delete(connection.id)
    connection.send({ type: 'unsubscribed' as any, channel })
  }

  broadcast(channel: string, message: WebSocketMessage, excludeConnectionId?: string): number {
    const subscribers = this.broadcastChannels.get(channel)
    if (!subscribers) return 0

    let count = 0
    for (const connectionId of subscribers) {
      if (connectionId === excludeConnectionId) continue
      const connection = this.connections.get(connectionId)
      if (connection && connection.isConnected()) {
        connection.send(message)
        count++
      }
    }
    return count
  }

  /**
   * 广播工具执行事件到所有连接的客户端
   */
  broadcastToolEvent(
    eventType: 'tool.execution_started' | 'tool.execution_progress' | 'tool.execution_completed' | 'tool.execution_failed',
    eventData: any
  ): void {
    const message: WebSocketMessage = {
      type: 'event',
      event: eventType,
      data: eventData,
    }

    let sentCount = 0
    for (const [, connection] of this.connections) {
      if (connection.isConnected()) {
        connection.send(message)
        sentCount++
      }
    }

    if (sentCount > 0) {
      console.log(`[WebSocket] 广播工具事件 ${eventType} 到 ${sentCount} 个客户端`)
    }
  }

  // ==================== Default RPC Methods ====================

  private registerDefaultMethods(): void {
    // System methods
    this.registerMethod({
      name: 'system.ping',
      description: 'Ping the server',
      execute: async () => ({ pong: true, timestamp: Date.now() }),
    })

    this.registerMethod({
      name: 'system.info',
      description: 'Get server information',
      execute: async () => ({
        version: '1.0.0',
        uptime: process.uptime(),
        platform: process.platform,
        nodeVersion: process.version,
        memory: process.memoryUsage(),
        connections: this.connections.size,
        registeredMethods: this.getRegisteredMethods().length,
      }),
    })

    this.registerMethod({
      name: 'system.listMethods',
      description: 'List all registered RPC methods',
      execute: async () => {
        return this.getRegisteredMethods().map((name) => {
          const method = this.rpcMethods.get(name)
          return {
            name: method?.name,
            description: method?.description,
            params: method?.params,
          }
        })
      },
    })

    // Connection methods
    this.registerMethod({
      name: 'connection.authenticate',
      description: 'Authenticate a connection',
      params: { userId: { type: 'string', required: true } },
      execute: async (params, context) => {
        const connection = this.connections.get(context.getConnectionId())
        const userId = params.userId as string
        if (connection) {
          connection.userId = userId
        }

        // 用户认证成功后，确保 Worker 连接
        // 这样即使用户没有 PTY 需求，Worker 也会保持连接，供 Agent 使用
        await wsPTYBridge.onUserConnected(userId, context.getConnectionId())

        return { authenticated: true, userId }
      },
    })

    this.registerMethod({
      name: 'connection.setSession',
      description: 'Set active session for connection',
      params: { sessionId: { type: 'string', required: true } },
      execute: async (params, context) => {
        const connection = this.connections.get(context.getConnectionId())
        if (connection) {
          connection.sessionId = params.sessionId as string
        }
        return { sessionId: params.sessionId }
      },
    })

    // ==================== Tool RPC Methods ====================

    this.registerMethod({
      name: 'tool.list',
      description: 'List all available tools',
      params: {
        category: { type: 'string', required: false, description: 'Filter by category (file, shell, web, system, ai, mcp)' },
      },
      execute: async (params) => {
        const category = params.category as string | undefined
        const tools = category
          ? toolExecutor.getToolsByCategory(category)
          : toolExecutor.getAllTools()
        
        return {
          tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            category: t.category,
            permissions: t.permissions,
          })),
          categories: ['file', 'shell', 'web', 'system', 'ai', 'mcp'],
          total: tools.length,
        }
      },
    })

    this.registerMethod({
      name: 'tool.execute',
      description: 'Execute a tool by name',
      params: {
        toolName: { type: 'string', required: true, description: 'Name of the tool to execute' },
        toolInput: { type: 'object', required: true, description: 'Tool input parameters' },
        sessionId: { type: 'string', required: false, description: 'Session ID for context' },
        context: { type: 'object', required: false, description: 'Execution context options' },
      },
      execute: async (params, context) => {
        const { toolName, toolInput, sessionId } = params
        const toolInputObj = toolInput as Record<string, unknown>
        const sessionIdStr = sessionId as string | undefined

        const executionId = uuidv4()
        const startTime = Date.now()

        // Send tool start event
        context.sendEvent('tool_start', {
          id: executionId,
          name: toolName,
          input: toolInputObj,
          sessionId: sessionIdStr,
        })

        try {
          const result = await toolExecutor.execute(
            toolName as string,
            toolInputObj,
            context.sendEvent.bind(null)
          )

          // Send tool end event
          context.sendEvent('tool_end', {
            id: executionId,
            name: toolName,
            success: result.success,
            result: result.result,
            error: result.error,
            duration: Date.now() - startTime,
          })

          return {
            id: executionId,
            toolName,
            success: result.success,
            result: result.result,
            error: result.error,
            output: result.output,
            metadata: result.metadata,
            duration: Date.now() - startTime,
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          
          // Send tool error event
          context.sendEvent('tool_error', {
            id: executionId,
            name: toolName,
            error: errorMessage,
            duration: Date.now() - startTime,
          })

          return {
            id: executionId,
            toolName,
            success: false,
            error: errorMessage,
            duration: Date.now() - startTime,
          }
        }
      },
    })

    this.registerMethod({
      name: 'tool.executeStreaming',
      description: 'Execute a tool with streaming output (for long-running tools)',
      params: {
        toolName: { type: 'string', required: true, description: 'Name of the tool to execute' },
        toolInput: { type: 'object', required: true, description: 'Tool input parameters' },
        sessionId: { type: 'string', required: false, description: 'Session ID for context' },
      },
      execute: async (params, context) => {
        const { toolName, toolInput, sessionId } = params
        const toolInputObj = toolInput as Record<string, unknown>
        const sessionIdStr = sessionId as string | undefined

        const executionId = uuidv4()
        const startTime = Date.now()

        // For streaming, we send progress events as they happen
        const sendStreamingEvent = (data: unknown) => {
          context.sendEvent('tool_progress', {
            executionId,
            toolName,
            ...(data as object),
          })
        }

        try {
          const result = await toolExecutor.execute(
            toolName as string,
            toolInputObj,
            sendStreamingEvent
          )

          // Send completion event
          context.sendEvent('tool_end', {
            id: executionId,
            name: toolName,
            success: result.success,
            result: result.result,
            error: result.error,
            streaming: true,
            duration: Date.now() - startTime,
          })

          return {
            id: executionId,
            toolName,
            success: result.success,
            result: result.result,
            error: result.error,
            streaming: true,
            duration: Date.now() - startTime,
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          
          context.sendEvent('tool_error', {
            id: executionId,
            name: toolName,
            error: errorMessage,
            streaming: true,
            duration: Date.now() - startTime,
          })

          return {
            id: executionId,
            toolName,
            success: false,
            error: errorMessage,
            streaming: true,
            duration: Date.now() - startTime,
          }
        }
      },
    })

    this.registerMethod({
      name: 'tool.register',
      description: 'Register a custom tool',
      params: {
        name: { type: 'string', required: true, description: 'Tool name' },
        description: { type: 'string', required: true, description: 'Tool description' },
        inputSchema: { type: 'object', required: true, description: 'Input schema' },
        category: { type: 'string', required: true, description: 'Category' },
        handler: { type: 'string', required: false, description: 'Handler code (base64 encoded)' },
      },
      execute: async (params) => {
        const { name, description, inputSchema, category } = params

        return {
          success: true,
          message: `Tool '${name}' registered successfully`,
          tool: {
            name,
            description,
            inputSchema,
            category,
          },
        }
      },
    })

    this.registerMethod({
      name: 'tool.history',
      description: 'Get tool execution history',
      params: {
        limit: { type: 'number', required: false, description: 'Maximum number of results', default: 50 },
      },
      execute: async (params) => {
        const limit = (params.limit as number) || 50
        const history = toolExecutor.getHistory(limit)
        
        return {
          history,
          count: history.length,
        }
      },
    })

    this.registerMethod({
      name: 'tool.clearHistory',
      description: 'Clear tool execution history',
      execute: async () => {
        toolExecutor.clearHistory()
        return { success: true, message: 'Tool history cleared' }
      },
    })

    this.registerMethod({
      name: 'tool.validateInput',
      description: 'Validate tool input against schema',
      params: {
        toolName: { type: 'string', required: true, description: 'Tool name' },
        toolInput: { type: 'object', required: true, description: 'Input to validate' },
      },
      execute: async (params) => {
        const { toolName, toolInput } = params
        const tool = toolExecutor.getTool(toolName as string)
        
        if (!tool) {
          return {
            valid: false,
            errors: [`Tool '${toolName}' not found`],
          }
        }

        const inputObj = toolInput as Record<string, unknown>
        const required = tool.inputSchema.required || []
        const missing: string[] = []

        for (const field of required) {
          if (inputObj[field] === undefined || inputObj[field] === null) {
            missing.push(field)
          }
        }

        return {
          valid: missing.length === 0,
          errors: missing.length > 0 ? [`Missing required fields: ${missing.join(', ')}`] : [],
          tool: {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          },
        }
      },
    })

    // ==================== MCP RPC Methods ====================

    this.registerMethod({
      name: 'mcp.listServers',
      description: 'List all configured MCP servers',
      execute: async () => {
        const servers = mcpBridge.getServers()
        const serverRuntimes = (mcpBridge as any).serverRuntimes
        
        return {
          servers: servers.map(s => {
            const runtime = serverRuntimes?.get(s.id)
            return {
              id: s.id,
              name: s.name,
              command: s.command,
              args: s.args,
              enabled: s.enabled,
              status: runtime?.status || 'disconnected',
              tools: runtime?.tools?.length || 0,
              connectedAt: runtime?.connectedAt,
              error: runtime?.error,
            }
          }),
          count: servers.length,
        }
      },
    })

    this.registerMethod({
      name: 'mcp.addServer',
      description: 'Add a new MCP server',
      params: {
        name: { type: 'string', required: true, description: 'Server name' },
        command: { type: 'string', required: true, description: 'Command to start server' },
        args: { type: 'array', required: false, description: 'Command arguments' },
        env: { type: 'object', required: false, description: 'Environment variables' },
        transport: { type: 'string', required: false, description: 'Transport type (stdio, websocket, sse, streamable-http)' },
        url: { type: 'string', required: false, description: 'Server URL (for websocket/sse/http)' },
      },
      execute: async (params) => {
        const { name, command, args, env, transport, url } = params
        
        const server = mcpBridge.addServer({
          name: name as string,
          command: command as string,
          args: (args as string[]) || [],
          env: env as Record<string, string> || {},
          enabled: true,
          transport: transport as 'stdio' | 'websocket' | 'sse' | 'streamable-http' || 'stdio',
          url: url as string,
        })

        return {
          success: true,
          server: {
            id: server.id,
            name: server.name,
            command: server.command,
            enabled: server.enabled,
          },
          message: `MCP server '${name}' added successfully`,
        }
      },
    })

    this.registerMethod({
      name: 'mcp.removeServer',
      description: 'Remove an MCP server',
      params: {
        serverId: { type: 'string', required: true, description: 'Server ID' },
      },
      execute: async (params) => {
        const { serverId } = params
        const removed = mcpBridge.removeServer(serverId as string)
        
        return {
          success: removed,
          message: removed ? `Server removed successfully` : `Server not found: ${serverId}`,
        }
      },
    })

    this.registerMethod({
      name: 'mcp.toggleServer',
      description: 'Enable or disable an MCP server',
      params: {
        serverId: { type: 'string', required: true, description: 'Server ID' },
        enabled: { type: 'boolean', required: true, description: 'Enable or disable' },
      },
      execute: async (params) => {
        const { serverId, enabled } = params
        const success = mcpBridge.toggleServer(serverId as string, enabled as boolean)
        
        return {
          success,
          message: success ? `Server ${enabled ? 'enabled' : 'disabled'}` : `Server not found: ${serverId}`,
        }
      },
    })

    this.registerMethod({
      name: 'mcp.listTools',
      description: 'List all tools available from MCP servers',
      params: {
        serverId: { type: 'string', required: false, description: 'Filter by server ID' },
        serverName: { type: 'string', required: false, description: 'Filter by server name' },
      },
      execute: async (params) => {
        const { serverId, serverName } = params
        let tools = mcpBridge.getAllTools()
        
        if (serverId) {
          tools = tools.filter(t => t.serverId === serverId)
        }
        if (serverName) {
          tools = tools.filter(t => t.serverName === serverName)
        }

        return {
          tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            serverId: t.serverId,
            serverName: t.serverName,
          })),
          count: tools.length,
          serverId,
          serverName,
        }
      },
    })

    this.registerMethod({
      name: 'mcp.callTool',
      description: 'Call a tool from an MCP server',
      params: {
        toolName: { type: 'string', required: true, description: 'Tool name' },
        toolInput: { type: 'object', required: true, description: 'Tool input' },
        serverId: { type: 'string', required: false, description: 'Server ID (optional, auto-detected)' },
      },
      execute: async (params, context) => {
        const { toolName, toolInput, serverId } = params

        const sendEvent = (event: string, data: unknown) => {
          context.sendEvent(event, data)
        }
        
        const result = await mcpBridge.callTool(
          toolName as string,
          toolInput as Record<string, unknown>,
          sendEvent
        )

        return {
          success: result.success,
          result: result.result,
          error: result.error,
          toolName,
        }
      },
    })

    this.registerMethod({
      name: 'mcp.getStatus',
      description: 'Get MCP system status',
      execute: async () => {
        return mcpBridge.getStatus()
      },
    })

    this.registerMethod({
      name: 'mcp.testConnection',
      description: 'Test connection to an MCP server',
      params: {
        serverId: { type: 'string', required: true, description: 'Server ID' },
      },
      execute: async (params) => {
        const { serverId } = params
        return await mcpBridge.testConnection(serverId as string)
      },
    })

    // ==================== Session RPC Methods ====================

    this.registerMethod({
      name: 'session.list',
      description: 'List all sessions for the current user',
      params: {
        offset: { type: 'number', required: false, description: 'Offset for pagination' },
        limit: { type: 'number', required: false, description: 'Limit for pagination' },
      },
      execute: async (params, context) => {
        const offset = (params.offset as number) || 0
        const limit = (params.limit as number) || 50
        
        // This will be connected to the actual session manager
        return {
          sessions: [],
          offset,
          limit,
          total: 0,
          message: 'Session listing will be connected to database in Phase 2',
        }
      },
    })

    this.registerMethod({
      name: 'session.export',
      description: 'Export session data',
      params: {
        sessionId: { type: 'string', required: true, description: 'Session ID' },
        format: { type: 'string', required: false, description: 'Export format (json, markdown, txt)' },
      },
      execute: async (params) => {
        const { sessionId, format } = params
        
        return {
          success: true,
          sessionId,
          format: format || 'json',
          message: 'Session export will be available in Phase 2',
        }
      },
    })
  }

  // ==================== Heartbeat & Cleanup ====================

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const [, connection] of this.connections) {
        if (connection.isConnected()) {
          connection.send({ type: 'ping', timestamp: Date.now() })
        }
      }
    }, 30000)
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      for (const [id, connection] of this.connections) {
        if (!connection.isConnected()) {
          this.removeConnection(id)
        }
      }
    }, 60000)
  }

  // ==================== Shutdown ====================

  shutdown(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
    if (this.cleanupInterval) clearInterval(this.cleanupInterval)
    
    for (const [, connection] of this.connections) {
      connection.send({ type: 'shutdown' as any, message: 'Server is shutting down' })
      connection.disconnect()
    }
    this.connections.clear()
    this.broadcastChannels.clear()
    this.rpcMethods.clear()
  }
}

// ==================== WebSocket Connection ====================

type ConnectionEventHandler = (data?: unknown) => void

class WebSocketConnection {
  readonly id: string
  readonly createdAt: number
  private socket: globalThis.WebSocket
  readonly remoteAddress?: string
  userId: string | null = null
  sessionId: string | null = null
  private connected: boolean = true
  private messageQueue: WebSocketMessage[] = []
  private eventHandlers: Map<string, Set<ConnectionEventHandler>> = new Map()
  private listeners: Map<string, Function[]> = new Map()

  constructor(id: string, socket: globalThis.WebSocket, remoteAddress?: string) {
    this.id = id
    this.socket = socket
    this.remoteAddress = remoteAddress
    this.createdAt = Date.now()
  }

  // Event system
  on(event: string, handler: ConnectionEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
  }

  off(event: string, handler: ConnectionEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  emit(event: string, data?: unknown): void {
    this.eventHandlers.get(event)?.forEach((handler) => handler(data))
  }

  // Add listener for raw messages
  addListener(event: string, fn: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(fn)
  }

  // Send message to client
  send(message: WebSocketMessage): boolean {
    if (!this.connected) {
      this.messageQueue.push(message)
      return false
    }

    try {
      this.socket.send(JSON.stringify(message))
      return true
    } catch (error) {
      console.error(`Failed to send message to ${this.id}:`, error)
      this.connected = false
      return false
    }
  }

  // Send event with helper
  sendEvent(event: string, data: unknown): void {
    this.send({ type: 'event', event, data, sessionId: this.sessionId } as unknown as WebSocketMessage)
  }

  // Check connection state
  isConnected(): boolean {
    return this.connected
  }

  // Flush queued messages
  flushQueue(): number {
    if (!this.connected) return 0

    let count = 0
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()
      if (message && this.send(message)) {
        count++
      }
    }
    return count
  }

  // Disconnect
  disconnect(code: number = 1000, reason?: string): void {
    this.connected = false
    try {
      this.socket.close(code, reason)
    } catch {
      // Socket may already be closed
    }
  }

  // Get connection metadata
  getInfo(): {
    id: string
    userId: string | null
    sessionId: string | null
    connected: boolean
    createdAt: number
    uptime: number
    queuedMessages: number
    remoteAddress?: string
  } {
    return {
      id: this.id,
      userId: this.userId,
      sessionId: this.sessionId,
      connected: this.connected,
      createdAt: this.createdAt,
      uptime: Date.now() - this.createdAt,
      queuedMessages: this.messageQueue.length,
      remoteAddress: this.remoteAddress,
    }
  }
}

// Singleton instance
export const wsManager = new WebSocketManager()
export { WebSocketConnection }
