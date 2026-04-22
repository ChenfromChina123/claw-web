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
  /** 避免并发 connect() 创建多个 WebSocket（例如 ChatStore 与 PTY 同时触发） */
  private connectInFlight: Promise<void> | null = null
  /** 存储登录token，用于重连时恢复身份 */
  private currentToken: string | null = null

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
    // 已连接则直接返回
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve()
    }

    // 保存token用于重连（必须在检查 connectInFlight 之前保存）
    if (token) {
      this.currentToken = token
      console.log('[WS] Token saved for connection/reconnection')
    }

    // 防止并发 connect() 创建多个 WebSocket（例如 ChatStore 与 PTY 同时触发）
    // 如果有token且正在连接中，继续等待现有连接完成（因为token已保存）
    if (this.connectInFlight) {
      console.log('[WS] Connection already in progress, waiting for it to complete...')
      return this.connectInFlight
    }

    this.connectInFlight = new Promise((resolve, reject) => {
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

          // 优先使用传入的token，否则使用保存的token（用于重连）
          const authToken = token || this.currentToken
          console.log(`[WS] onopen: token param=${!!token}, currentToken=${!!this.currentToken}, using=${authToken ? 'login' : 'register'}`)
          if (authToken) {
            this.send({ type: 'login' as WebSocketMessageType, token: authToken })
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
          this.connectInFlight = null
          reject(error)
        }

        this.ws.onclose = (event) => {
          console.log(`[WS] Disconnected (code: ${event.code}, reason: ${event.reason}, wasClean: ${event.wasClean})`)
          this.status.value = 'disconnected'
          this.isConnected.value = false
          this.stopHeartbeat()
          this.connectInFlight = null

          if (!this.manualClose) {
            console.log('[WS] Connection closed unexpectedly, attempting reconnect...')
            this.attemptReconnect()
          } else {
            console.log('[WS] Connection closed manually, not reconnecting')
          }
        }
      } catch (error) {
        this.status.value = 'disconnected'
        this.connectInFlight = null
        reject(error)
      }
    })

    this.connectInFlight.then(
      () => {
        this.connectInFlight = null
      },
      () => {
        this.connectInFlight = null
      }
    )

    return this.connectInFlight
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
   * 用户登出
   * 清除token并重置连接状态
   */
  logout(): void {
    this.currentToken = null
    this.disconnect()
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
      const id = String(this.generateId())

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

    console.log(`[WS] 将在 ${delay}ms 后重连 (第 ${this.reconnectAttempts} 次), token存在: ${!!this.currentToken}`)

    setTimeout(() => {
      if (!this.manualClose) {
        // 使用保存的token进行重连，不传token参数，让connect()方法使用this.currentToken
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
      console.log('[WS] Raw message received:', message)

      switch (message.type) {
        case 'pong':
          this.handlePong()
          break

        // 服务端 wsBridge 心跳会主动向客户端发 ping，需回复 pong，否则会误落入 default 并刷警告
        case 'ping':
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
          }
          break

        case 'rpc_response':
          this.handleRPCResponse(message as unknown as RPCResponse)
          break

        case 'registered':
        case 'logged_in':
          // 处理注册和登录响应
          console.log(`[WS] ${message.type === 'registered' ? 'Registered' : 'Logged in'}:`, (message as { userId?: string }).userId)
          console.log('[WS] connectResolve exists:', !!this.connectResolve)
          if (this.connectResolve) {
            console.log('[WS] Resolving connection promise')
            this.connectResolve()
            this.clearConnectPromise()
          }
          break

        case 'connected':
          console.log('[WS] Connected to server:', (message as { connectionId?: string }).connectionId)
          break

        case 'session_list': {
          const sessions = (message as { sessions?: Session[] }).sessions ?? []
          console.log('[WS] Session list received:', sessions.length)
          // 与 chat store 约定：{ sessions }，勿只传数组（否则 store 读不到 .sessions）
          this.emitEvent('session_list', { sessions })
          console.log('[WS] Session list event emitted')
          break
        }

        case 'session_created':
          console.log('[WS] Session created:', (message as { session?: unknown }).session)
          this.emitEvent('session_created', (message as { session?: unknown }).session)
          console.log('[WS] Session created event emitted')
          break

        case 'session_loaded': {
          const m = message as {
            session?: Session
            messages?: Message[]
            toolCalls?: ToolCall[]
          }
          console.log('[WS] Session loaded:', m.session?.id, 'messages:', m.messages?.length)
          this.emitEvent('session_loaded', {
            session: m.session,
            messages: m.messages,
            toolCalls: m.toolCalls,
          })
          console.log('[WS] Session loaded event emitted')
          break
        }

        case 'session_rolled_back': {
          const m = message as {
            session?: Session
            messages?: Message[]
            toolCalls?: ToolCall[]
            anchorMessageId?: string
          }
          this.emitEvent('session_rolled_back', {
            session: m.session,
            messages: m.messages,
            toolCalls: m.toolCalls,
            anchorMessageId: m.anchorMessageId,
          })
          break
        }

        case 'session_deleted': {
          const m = message as { sessionId?: string }
          this.emitEvent('session_deleted', { sessionId: m.sessionId })
          break
        }

        case 'session_renamed': {
          const m = message as { sessionId?: string; title?: string }
          this.emitEvent('session_renamed', {
            sessionId: m.sessionId,
            title: m.title,
          })
          break
        }
        
        case 'session_title_updated': {
          const m = message as { sessionId?: string; title?: string }
          console.log('[WS] Received session_title_updated:', m)
          this.emitEvent('session_title_updated', {
            sessionId: m.sessionId,
            title: m.title,
          })
          break
        }

        case 'error':
          const errorMsg = (message as { message?: string }).message || 'Unknown error'
          console.error('[WS] Error from server:', errorMsg)
          // 如果在连接过程中收到错误，拒绝连接Promise
          if (this.connectReject) {
            console.error('[WS] Connection rejected due to error:', errorMsg)
            this.connectReject(new Error(errorMsg))
            this.clearConnectPromise()
          }
          this.emitEvent('error', message)
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
    const rid =
      response.id !== undefined && response.id !== null ? String(response.id) : ''
    const pending = rid ? this.pendingRPCs.get(rid) : undefined
    if (pending) {
      clearTimeout(pending.timeoutId)
      this.pendingRPCs.delete(rid)

      if (response.success) {
        // 服务端 rpc_response 形如 { success, result }，业务数据在 result 内
        const r = response as RPCResponse
        pending.resolve(
          Object.prototype.hasOwnProperty.call(r, 'result') ? r.result : r
        )
      } else {
        pending.reject(new Error(response.error?.message || 'RPC 调用失败'))
      }
    } else {
      console.warn(
        '[WS] rpc_response 无匹配的待处理请求 id=',
        rid,
        'keys=',
        [...this.pendingRPCs.keys()].slice(0, 8)
      )
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
        break

      // Tool events
      case 'tool_start':
        this.handleToolStart(message)
        break

      case 'tool_end':
        this.handleToolEnd(message)
        break

      case 'tool_error':
        this.handleToolError(message)
        break

      case 'tool_progress':
        this.handleToolProgress(message)
        break

      case 'tool_use':
        this.handleToolUseStart(message)
        break

      case 'tool_use_end':
        this.handleToolUseEnd(message)
        break

      case 'error':
        console.error('[WS] Server error:', message.message)
        break
    }
  }

  /**
   * 处理工具开始执行
   */
  private handleToolStart(message: WSMessage): void {
    const eventData = message.data as {
      id?: string
      name?: string
      input?: Record<string, unknown>
      sessionId?: string
    } | undefined

    if (!eventData) return

    const toolCall: ToolCall = {
      id: eventData.id || message.id || this.generateId(),
      messageId: '',
      sessionId: eventData.sessionId || this.currentSession.value?.id || '',
      toolName: eventData.name || message.name || '',
      toolInput: eventData.input || (message.input as Record<string, unknown>) || {},
      toolOutput: null,
      status: 'executing',
      createdAt: new Date(),
    }

    console.log('[WS] Tool start:', toolCall.toolName, 'id:', toolCall.id, 'status:', toolCall.status)

    this.toolCalls.value = [...this.toolCalls.value, toolCall]
    this.emitEvent('tool_start', toolCall)
  }

  /**
   * 处理工具执行结束
   */
  private handleToolEnd(message: WSMessage): void {
    const eventData = message.data as {
      id?: string
      name?: string
      success?: boolean
      result?: unknown
      error?: string
      duration?: number
    } | undefined

    const toolId = eventData?.id || message.id
    if (!toolId) return

    const toolCalls = [...this.toolCalls.value]
    const tool = toolCalls.find((t) => t.id === toolId)

    if (tool) {
      tool.status = (eventData?.success !== false) ? 'completed' : 'error'
      const raw = eventData?.result ?? message.result
      if (raw === null || raw === undefined) {
        tool.toolOutput = null
      } else if (typeof raw === 'object' && !Array.isArray(raw)) {
        tool.toolOutput = raw as Record<string, unknown>
      } else {
        tool.toolOutput = { value: raw as unknown }
      }
      tool.completedAt = new Date()

      if (eventData?.error || message.error) {
        tool.error = (eventData?.error || message.error) as string
      }

      console.log('[WS] Tool end:', tool.toolName, 'id:', tool.id, 'status:', tool.status, 'duration:', eventData?.duration)

      this.toolCalls.value = toolCalls
      this.emitEvent('tool_end', tool)
    }
  }

  /**
   * 处理工具执行错误
   */
  private handleToolError(message: WSMessage): void {
    const eventData = message.data as {
      id?: string
      name?: string
      error?: string
      errorType?: string
      duration?: number
    } | undefined

    const toolId = eventData?.id || message.id
    if (!toolId) return

    const toolCalls = [...this.toolCalls.value]
    const tool = toolCalls.find((t) => t.id === toolId)

    if (tool) {
      tool.status = 'error'
      tool.error = eventData?.error || (message.error as string) || 'Unknown error'
      tool.completedAt = new Date()

      console.error('[WS] Tool error:', eventData?.name || message.name, 'errorType:', eventData?.errorType || 'UNKNOWN', 'error:', tool.error)

      this.toolCalls.value = toolCalls
      this.emitEvent('tool_error', {
        ...tool,
        errorType: eventData?.errorType || 'UNKNOWN',
        duration: eventData?.duration,
      })
    }
  }

  /**
   * 处理工具执行进度
   */
  private handleToolProgress(message: WSMessage): void {
    const eventData = message.data as {
      executionId?: string
      name?: string
      output?: string
      [key: string]: unknown
    } | undefined

    if (eventData) {
      this.emitEvent('tool_progress', {
        executionId: eventData.executionId || message.id,
        toolName: eventData.name || message.name,
        output: eventData.output,
        ...eventData,
      })
    }
  }

  /**
   * 处理工具调用开始 (来自 AI 响应)
   */
  private handleToolUseStart(message: WSMessage): void {
    const toolCall: ToolCall = {
      id: message.id as string || this.generateId(),
      messageId: '',
      sessionId: this.currentSession.value?.id || '',
      toolName: message.name as string || '',
      toolInput: (message.input as Record<string, unknown>) || {},
      toolOutput: null,
      status: 'pending',
      createdAt: new Date(),
    }

    console.log('[WS] Tool use started:', toolCall.toolName, 'id:', toolCall.id)

    this.toolCalls.value = [...this.toolCalls.value, toolCall]
    this.emitEvent('tool_use', toolCall)
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

  // ==================== Tool RPC Methods ====================

  /**
   * 获取工具列表
   * @param category 可选的类别过滤
   */
  async listTools(category?: string): Promise<{
    tools: Array<{
      name: string
      description: string
      inputSchema: Record<string, unknown>
      category: string
      permissions?: { dangerous?: boolean; sandboxed?: boolean }
    }>
    categories: string[]
    total: number
  }> {
    return this.callRPC('tool.list', { category })
  }

  /**
   * 执行工具 (RPC)
   * @param toolName 工具名称
   * @param toolInput 工具输入参数
   * @param sessionId 可选的会话 ID
   * @param context 可选的执行上下文
   */
  async executeTool(
    toolName: string,
    toolInput: Record<string, unknown>,
    sessionId?: string,
    context?: Record<string, unknown>
  ): Promise<{
    id: string
    toolName: string
    success: boolean
    result?: unknown
    error?: string
    output?: string
    metadata?: { duration?: number; tokens?: number; cost?: number }
    duration: number
  }> {
    return this.callRPC('tool.execute', { toolName, toolInput, sessionId, context })
  }

  /**
   * 流式执行工具 (RPC)
   * 用于长时间运行的工具，实时发送进度事件
   */
  async executeToolStreaming(
    toolName: string,
    toolInput: Record<string, unknown>,
    sessionId?: string
  ): Promise<{
    id: string
    toolName: string
    success: boolean
    result?: unknown
    error?: string
    streaming: boolean
    duration: number
  }> {
    return this.callRPC('tool.executeStreaming', { toolName, toolInput, sessionId })
  }

  /**
   * 获取工具执行历史
   * @param limit 最大返回数量
   */
  async getToolHistory(limit?: number): Promise<{
    history: Array<{
      id: string
      name: string
      input: Record<string, unknown>
      output?: unknown
      status: string
      startedAt?: number
      completedAt?: number
      error?: string
    }>
    count: number
  }> {
    return this.callRPC('tool.history', { limit })
  }

  /**
   * 清空工具执行历史
   */
  async clearToolHistory(): Promise<{ success: boolean; message: string }> {
    return this.callRPC('tool.clearHistory', {})
  }

  /**
   * 验证工具输入
   * @param toolName 工具名称
   * @param toolInput 要验证的输入
   */
  async validateToolInput(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<{
    valid: boolean
    errors: string[]
    tool?: {
      name: string
      description: string
      inputSchema: Record<string, unknown>
    }
  }> {
    return this.callRPC('tool.validateInput', { toolName, toolInput })
  }

  // ==================== MCP RPC Methods ====================

  /**
   * 获取 MCP 服务器列表
   */
  async listMCPServers(): Promise<{
    servers: Array<{
      name: string
      status: string
      tools: string[]
    }>
    count: number
    message?: string
  }> {
    return this.callRPC('mcp.listServers', {})
  }

  /**
   * 获取 MCP 工具列表
   * @param serverName 可选的服务器名称过滤
   */
  async listMCPTools(serverName?: string): Promise<{
    tools: Array<{
      name: string
      description: string
      serverName: string
      inputSchema: Record<string, unknown>
    }>
    count: number
    serverName?: string
    message?: string
  }> {
    return this.callRPC('mcp.listTools', { serverName })
  }

  /**
   * 调用 MCP 工具
   * @param serverName MCP 服务器名称
   * @param toolName 工具名称
   * @param toolInput 工具输入
   */
  async callMCPTool(
    serverName: string,
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<{
    success: boolean
    result?: unknown
    error?: string
    serverName: string
    toolName: string
  }> {
    return this.callRPC('mcp.callTool', { serverName, toolName, toolInput })
  }

  // ==================== Session RPC Methods ====================

  /**
   * 获取会话列表 (RPC)
   */
  async listSessionsRPC(
    offset?: number,
    limit?: number
  ): Promise<{
    sessions: unknown[]
    offset: number
    limit: number
    total: number
    message?: string
  }> {
    return this.callRPC('session.list', { offset, limit })
  }

  /**
   * 导出会话
   * @param sessionId 会话 ID
   * @param format 导出格式 (json, markdown, txt)
   */
  async exportSession(
    sessionId: string,
    format?: string
  ): Promise<{
    success: boolean
    sessionId: string
    format: string
    message?: string
  }> {
    return this.callRPC('session.export', { sessionId, format })
  }

  // ==================== System RPC Methods ====================

  /**
   * Ping 服务器
   */
  async ping(): Promise<{ pong: boolean; timestamp: number }> {
    return this.callRPC('system.ping', {}, 5000)
  }

  /**
   * 获取服务器信息
   */
  async getSystemInfo(): Promise<{
    version: string
    uptime: number
    platform: string
    nodeVersion: string
    memory: unknown
    connections: number
    registeredMethods: number
  }> {
    return this.callRPC('system.info', {})
  }

  /**
   * 列出所有可用的 RPC 方法
   */
  async listMethods(): Promise<Array<{
    name: string
    description: string
    params?: Record<string, unknown>
  }>> {
    return this.callRPC('system.listMethods', {})
  }

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

  sendMessage(content: string, sessionId?: string, model?: string, agentOptions?: {
    maxIterations?: number
    debugMode?: boolean
    timeout?: number
  }): void {
    console.log('[WS] sendMessage called:', { content, sessionId, model, agentOptions })
    // 使用传入的 sessionId 或当前会话的 id
    const targetSessionId = sessionId || this.currentSession.value?.id
    console.log('[WS] targetSessionId:', targetSessionId)
    if (!targetSessionId) {
      console.error('[WS] Cannot send message: no sessionId provided and no current session')
      return
    }
    const message = {
      type: 'user_message',
      content,
      sessionId: targetSessionId,
      model: model || this.currentSession.value?.model || 'qwen-plus',
      agentOptions,
    }
    console.log('[WS] Sending message:', message)
    this.send(message)
  }

  deleteSession(sessionId: string): void {
    console.log('[WS] deleteSession called, readyState:', this.ws?.readyState, 'ws:', !!this.ws)
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload = { type: 'delete_session', sessionId }
      console.log('[WS] Sending delete_session:', payload)
      this.ws.send(JSON.stringify(payload))
    } else {
      console.warn('[WS] Cannot delete session: WebSocket not open, readyState:', this.ws?.readyState)
    }
  }

  renameSession(sessionId: string, title: string): void {
    console.log('[WS] renameSession called, readyState:', this.ws?.readyState, 'ws:', !!this.ws)
    if (this.ws?.readyState === WebSocket.OPEN) {
      const payload = { type: 'rename_session', sessionId, title }
      console.log('[WS] Sending rename_session:', payload)
      this.ws.send(JSON.stringify(payload))
    } else {
      console.warn('[WS] Cannot rename session: WebSocket not open, readyState:', this.ws?.readyState)
    }
  }

  clearSession(sessionId?: string): void {
    this.send({
      type: 'clear_session',
      sessionId: sessionId || this.currentSession.value?.id,
    })
  }

  /**
   * 从指定用户消息起截断会话（含该条及之后），需配合服务端 session_rolled_back
   */
  rollbackSession(sessionId: string, anchorMessageId: string): void {
    this.send({
      type: 'rollback_session' as WebSocketMessageType,
      sessionId,
      anchorMessageId,
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

  /**
   * 中断当前正在进行的 Agent 生成
   */
  interruptGeneration(sessionIdOverride?: string | null): void {
    const sessionId =
      sessionIdOverride ||
      this.currentSession.value?.id ||
      undefined
    this.send({
      type: 'interrupt_generation' as WebSocketMessageType,
      sessionId,
    })
  }
}

export const wsClient = new EnhancedWebSocketClient()
export default wsClient
