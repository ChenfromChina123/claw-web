/**
 * 增强版 WebSocket 客户端
 * 功能：自动重连、心跳检测、RPC 调用、消息队列、事件订阅
 */

import { ref, shallowRef } from 'vue'
import type {
  RPCResponse,
  Session,
  Message,
  ToolCall,
  ConnectionStatus,
  WebSocketState,
  WebSocketMessage as WSMessage,
  WebSocketMessageType,
} from '@/types'

type EventCallback = (data?: unknown) => void

interface PendingRPC {
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
  timeoutId: ReturnType<typeof setTimeout>
}

class EnhancedWebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private baseReconnectDelay = 1000
  private listeners: Map<string, Set<EventCallback>> = new Map()
  private messageQueue: WSMessage[] = []
  private pendingRPCs: Map<string, PendingRPC> = new Map()
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null
  private lastPingTime = 0
  private latency = ref(0)
  private manualClose = false
  private connectResolve: (() => void) | null = null
  private connectReject: ((reason?: unknown) => void) | null = null
  private connectTimeout: ReturnType<typeof setTimeout> | null = null

  public status = ref<ConnectionStatus>('disconnected')
  public isConnected = ref(false)
  public currentSession = ref<Session | null>(null)
  public messages = shallowRef<Message[]>([])
  public toolCalls = shallowRef<ToolCall[]>([])
  public connectionError = ref<string | null>(null)

  constructor() {
    this.url = this.getWebSocketUrl()
  }

  /**
   * 获取 WebSocket URL
   */
  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    return `${protocol}//${host}/ws`
  }

  /**
   * 建立 WebSocket 连接
   */
  connect(token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      this.manualClose = false
      this.status.value = 'connecting'
      this.connectionError.value = null

      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('[WS] Connected')
          this.status.value = 'connected'
          this.isConnected.value = true
          this.reconnectAttempts = 0
          this.connectionError.value = null

          this.startHeartbeat()

          if (token) {
            this.send({ type: 'login' as WebSocketMessageType, token })
          } else {
            this.send({ type: 'register' as WebSocketMessageType })
          }

          this.flushMessageQueue()

          this.connectTimeout = setTimeout(() => {
            if (this.connectReject) {
              this.connectReject(new Error('连接超时：未收到注册/登录响应'))
              this.clearConnectPromise()
            }
          }, 10000)

          this.connectResolve = resolve
          this.connectReject = reject
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error)
          this.connectionError.value = '连接错误'
          reject(error)
        }

        this.ws.onclose = (event) => {
          console.log(`[WS] Disconnected (code: ${event.code})`)
          this.status.value = 'disconnected'
          this.isConnected.value = false
          this.stopHeartbeat()

          if (!this.manualClose) {
            this.attemptReconnect()
          }
        }
      } catch (error) {
        this.status.value = 'disconnected'
        reject(error)
      }
    })
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.manualClose = true
    this.stopHeartbeat()
    this.clearPendingRPCs('连接已断开')
    this.clearConnectPromise()

    if (this.ws) {
      this.ws.close(1000, '用户主动断开')
      this.ws = null
    }

    this.status.value = 'disconnected'
    this.isConnected.value = false
  }

  /**
   * 发送消息
   */
  send(message: WSMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
        return true
      } catch (error) {
        console.error('[WS] Send failed:', error)
        this.messageQueue.push(message)
        return false
      }
    } else {
      this.messageQueue.push(message)
      return false
    }
  }

  /**
   * RPC 调用封装
   */
  async callRPC<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    timeout: number = 30000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = this.generateId()

      const timeoutId = setTimeout(() => {
        this.pendingRPCs.delete(id)
        reject(new Error(`RPC 调用超时：${method}`))
      }, timeout)

      this.pendingRPCs.set(id, {
        resolve: resolve as (value?: unknown) => void,
        reject: reject as (reason?: unknown) => void,
        timeoutId,
      })

      const success = this.send({
        type: 'rpc_call',
        id,
        method,
        params,
      })

      if (!success) {
        clearTimeout(timeoutId)
        this.pendingRPCs.delete(id)
        reject(new Error('WebSocket 未连接'))
      }
    })
  }

  /**
   * 事件订阅
   */
  on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)

    return () => this.off(event, callback)
  }

  /**
   * 取消事件订阅
   */
  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback)
  }

  /**
   * 获取连接状态信息
   */
  getState(): WebSocketState {
    return {
      status: this.status.value,
      connectionId: null,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.connectionError.value,
      latency: this.latency.value,
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 清理连接 Promise 相关状态
   */
  private clearConnectPromise(): void {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
      this.connectTimeout = null
    }
    this.connectResolve = null
    this.connectReject = null
  }

  /**
   * 尝试重连（指数退避）
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] 达到最大重连次数')
      this.status.value = 'disconnected'
      this.connectionError.value = `重连失败（已尝试 ${this.maxReconnectAttempts} 次）`
      return
    }

    this.reconnectAttempts++
    this.status.value = 'reconnecting'

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000
    )

    console.log(`[WS] 将在 ${delay}ms 后重连 (第 ${this.reconnectAttempts} 次)`)

    setTimeout(() => {
      if (!this.manualClose) {
        this.connect().catch((err) => {
          console.error('[WS] Reconnect failed:', err)
        })
      }
    }, delay)
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(): void {
    this.stopHeartbeat()

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now()
        this.send({ type: 'ping' })

        this.heartbeatTimeout = setTimeout(() => {
          console.warn('[WS] 心跳超时，关闭连接')
          this.ws?.close(4001, '心跳超时')
        }, 10000)
      }
    }, 30000)
  }

  /**
   * 停止心跳检测
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  /**
   * 清空消息队列
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()
      if (msg && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg))
      }
    }
  }

  /**
   * 清空待处理的 RPC 请求
   */
  private clearPendingRPCs(reason: string): void {
    for (const [, pending] of this.pendingRPCs) {
      clearTimeout(pending.timeoutId)
      pending.reject(new Error(reason))
    }
    this.pendingRPCs.clear()
  }

  /**
   * 处理收到的消息
   */
  private handleMessage(data: string): void {
    try {
      const message: WSMessage = JSON.parse(data)

      switch (message.type) {
        case 'pong':
          this.handlePong()
          break

        case 'rpc_response':
          this.handleRPCResponse(message as unknown as RPCResponse)
          break

        case 'registered':
        case 'logged_in':
          // 处理注册和登录响应
          console.log(`[WS] ${message.type === 'registered' ? 'Registered' : 'Logged in'}:`, (message as { userId?: string }).userId)
          if (this.connectResolve) {
            this.connectResolve()
            this.clearConnectPromise()
          }
          break

        default: {
          // 处理后端发送的事件消息格式：{type: 'event', event: 'eventName', data: {...}}
          const eventName = (message as { event?: string }).event
          const eventData = (message as { data?: unknown }).data
          if (eventName) {
            console.log(`[WS] Event received: ${eventName}`, eventData)
            this.emitEvent(eventName, eventData)
            this.handleBuiltInEvent(message)
          } else {
            console.warn('[WS] Event message missing event field:', message)
          }
          break
        }
      }
    } catch (error) {
      console.error('[WS] 消息解析失败:', error)
    }
  }

  /**
   * 处理心跳响应
   */
  private handlePong(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
    this.latency.value = Date.now() - this.lastPingTime
  }

  /**
   * 处理 RPC 响应
   */
  private handleRPCResponse(response: RPCResponse): void {
    const pending = this.pendingRPCs.get(response.id)
    if (pending) {
      clearTimeout(pending.timeoutId)
      this.pendingRPCs.delete(response.id)

      if (response.success) {
        pending.resolve(response)
      } else {
        pending.reject(new Error(response.error?.message || 'RPC 调用失败'))
      }
    }
  }

  /**
   * 触发事件监听器
   */
  private emitEvent(event: string, data: unknown): void {
    const callbacks = this.listeners.get(event)
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data)
        } catch (error) {
          console.error(`[WS] Event handler error (${event}):`, error)
        }
      })
    }

    const allCallbacks = this.listeners.get('*')
    if (allCallbacks) {
      allCallbacks.forEach((callback) => {
        try {
          callback(data)
        } catch (error) {
          console.error('[WS] Wildcard handler error:', error)
        }
      })
    }
  }

  /**
   * 处理内置事件
   */
  private handleBuiltInEvent(message: WSMessage): void {
    switch (message.type) {
      case 'registered':
        console.log('[WS] Registered:', message.userId)
        if (this.connectResolve) {
          this.connectResolve()
          this.clearConnectPromise()
        }
        break

      case 'logged_in':
        console.log('[WS] Logged in:', message.userId)
        if (this.connectResolve) {
          this.connectResolve()
          this.clearConnectPromise()
        }
        break

      case 'session_created':
        this.currentSession.value = message.session as Session
        this.messages.value = []
        this.toolCalls.value = []
        break

      case 'session_loaded':
        this.currentSession.value = message.session as Session
        this.messages.value = (message.messages || []) as Message[]
        this.toolCalls.value = (message.toolCalls || []) as ToolCall[]
        break

      case 'content_block_delta':
        // 不在这里处理，让事件直接传递给外部监听器
        // 避免与 chat.ts 中的处理逻辑冲突
        break

      case 'tool_use':
        this.handleToolUseStart(message)
        break

      case 'tool_end':
      case 'tool_error':
        this.handleToolUseEnd(message)
        break

      case 'error':
        console.error('[WS] Server error:', message.message)
        break
    }
  }

  /**
   * 处理工具调用开始
   */
  private handleToolUseStart(message: WSMessage): void {
    const toolCall: ToolCall = {
      id: message.id as string,
      messageId: '',
      sessionId: this.currentSession.value?.id || '',
      toolName: message.name as string,
      toolInput: (message.input as Record<string, unknown>) || {},
      toolOutput: null,
      status: 'pending',
      createdAt: new Date(),
    }
    this.toolCalls.value = [...this.toolCalls.value, toolCall]
  }

  /**
   * 处理工具调用结束
   */
  private handleToolUseEnd(message: WSMessage): void {
    const toolCalls = [...this.toolCalls.value]
    const tool = toolCalls.find((t) => t.id === message.id)
    if (tool) {
      tool.status = message.type === 'tool_error' ? 'error' : 'completed'
      tool.toolOutput = (message.output as Record<string, unknown>) || { error: message.error }
      tool.completedAt = new Date()
      this.toolCalls.value = toolCalls
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }

  // ==================== 公共 API 方法 ====================

  /**
   * 创建新会话
   * @param title 会话标题
   * @param model 使用的模型
   * @param force 是否强制创建（跳过验证）
   */
  createSession(title?: string, model?: string, force?: boolean): void {
    this.send({
      type: 'create_session',
      title: title || '新对话',
      model: model || 'qwen-plus',
      force: force || false,
    })
  }

  loadSession(sessionId: string): void {
    this.send({ type: 'load_session', sessionId })
  }

  listSessions(): void {
    this.send({ type: 'list_sessions' })
  }

  sendMessage(content: string, model?: string): void {
    this.send({
      type: 'user_message',
      content,
      sessionId: this.currentSession.value?.id,
      model: model || this.currentSession.value?.model || 'qwen-plus',
    })
  }

  deleteSession(sessionId: string): void {
    this.send({ type: 'delete_session', sessionId })
  }

  renameSession(sessionId: string, title: string): void {
    this.send({ type: 'rename_session', sessionId, title })
  }

  clearSession(sessionId?: string): void {
    this.send({
      type: 'clear_session',
      sessionId: sessionId || this.currentSession.value?.id,
    })
  }

  getTools(): void {
    this.send({ type: 'get_tools' as WebSocketMessageType })
  }

  getModels(): void {
    this.send({ type: 'get_models' as WebSocketMessageType })
  }

  executeCommand(command: string): void {
    this.send({ type: 'execute_command' as WebSocketMessageType, command })
  }
}

export const wsClient = new EnhancedWebSocketClient()
export default wsClient
