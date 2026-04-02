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
import type { EventSender } from './webStore'

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
    const connection = new WebSocketConnection(connectionId, ws as unknown as globalThis.WebSocket, remoteAddress)
    this.connections.set(connectionId, connection)
    
    connection.on('message', (msg) => this.handleMessage(connection, msg))
    connection.on('close', () => this.handleClose(connection))
    connection.on('error', (err) => this.handleError(connection, err))
    
    return connection
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
    this.removeConnection(connection.id)
    console.log(`Connection closed: ${connection.id}`)
  }

  private handleError(connection: WebSocketConnection, error: Error): void {
    console.error(`Connection error [${connection.id}]:`, error.message)
  }

  // ==================== RPC System ====================

  private handleRPCCall(connection: WebSocketConnection, message: WebSocketMessage): void {
    const request: RPCRequest = {
      id: message.id || uuidv4(),
      method: message.method!,
      params: message.params,
      timeout: message.timeout,
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
      } as RPCResponse & { type: 'rpc_response' })
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
      } as RPCResponse & { type: 'rpc_response' })
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
        } as RPCResponse & { type: 'rpc_response' })
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
        } as RPCResponse & { type: 'rpc_response' })
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
    connection.send({ type: 'subscribed', channel })
  }

  private handleUnsubscribe(connection: WebSocketConnection, channel: string): void {
    this.broadcastChannels.get(channel)?.delete(connection.id)
    connection.send({ type: 'unsubscribed', channel })
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
        if (connection) {
          connection.userId = params.userId as string
        }
        return { authenticated: true, userId: params.userId }
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
      connection.send({ type: 'shutdown', message: 'Server is shutting down' })
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
    this.send({ type: 'event', event, data, sessionId: this.sessionId } as WebSocketMessage)
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
