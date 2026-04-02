import { ref, shallowRef } from 'vue'
import type { WSMessage, Session, Message, ToolCall } from '@/types'

type EventCallback = (data: unknown) => void

class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private listeners: Map<string, Set<EventCallback>> = new Map()
  private messageQueue: WSMessage[] = []
  
  public isConnected = ref(false)
  public currentSession = ref<Session | null>(null)
  public messages = shallowRef<Message[]>([])
  public toolCalls = shallowRef<ToolCall[]>([])
  
  constructor() {
    this.url = this.getWebSocketUrl()
  }
  
  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    return `${protocol}//${host}/ws`
  }
  
  connect(token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)
        
        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.isConnected.value = true
          this.reconnectAttempts = 0
          
          // 发送注册消息
          if (token) {
            this.send({ type: 'login', token })
          } else {
            this.send({ type: 'register' })
          }
          
          // 发送队列中的消息
          while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift()
            if (msg) {
              this.ws?.send(JSON.stringify(msg))
            }
          }
          
          resolve()
        }
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }
        
        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          reject(error)
        }
        
        this.ws.onclose = () => {
          console.log('WebSocket disconnected')
          this.isConnected.value = false
          this.attemptReconnect()
        }
      } catch (error) {
        reject(error)
      }
    })
  }
  
  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      console.log(`Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`)
      
      setTimeout(() => {
        this.connect()
      }, delay)
    }
  }
  
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
  
  send(message: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      this.messageQueue.push(message)
    }
  }
  
  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)?.add(callback)
  }
  
  off(event: string, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback)
  }
  
  private handleMessage(data: string): void {
    try {
      const message: WSMessage = JSON.parse(data)
      const event = message.type
      
      // 触发事件监听器
      const callbacks = this.listeners.get(event)
      if (callbacks) {
        callbacks.forEach(callback => callback(message))
      }
      
      // 触发所有监听器
      const allCallbacks = this.listeners.get('*')
      if (allCallbacks) {
        allCallbacks.forEach(callback => callback(message))
      }
      
      // 处理内置事件
      this.handleBuiltInEvent(message)
    } catch (error) {
      console.error('Failed to parse message:', error)
    }
  }
  
  private handleBuiltInEvent(message: WSMessage): void {
    switch (message.type) {
      case 'registered':
        console.log('Registered:', message.userId)
        break
        
      case 'logged_in':
        console.log('Logged in:', message.userId)
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
        
      case 'session_list':
        // 处理会话列表更新
        break
        
      case 'message_start':
        // AI 开始生成消息
        break
        
      case 'content_block_delta':
        // AI 正在生成内容
        const currentMessages = [...this.messages.value]
        const lastMsg = currentMessages[currentMessages.length - 1]
        if (lastMsg && lastMsg.role === 'assistant') {
          lastMsg.content += message.text as string
          this.messages.value = currentMessages
        }
        break
        
      case 'message_stop':
        // AI 消息生成完成
        break
        
      case 'tool_use':
        // 开始工具调用
        const toolCall: ToolCall = {
          id: message.id as string,
          name: message.name as string,
          input: message.input as Record<string, unknown>,
          status: 'pending'
        }
        this.toolCalls.value = [...this.toolCalls.value, toolCall]
        break
        
      case 'tool_end':
        // 工具调用完成
        const toolCalls = [...this.toolCalls.value]
        const tool = toolCalls.find(t => t.id === message.id)
        if (tool) {
          tool.status = 'completed'
          tool.output = message.result
          this.toolCalls.value = toolCalls
        }
        break
        
      case 'tool_error':
        // 工具调用错误
        const errorToolCalls = [...this.toolCalls.value]
        const errorTool = errorToolCalls.find(t => t.id === message.id)
        if (errorTool) {
          errorTool.status = 'error'
          errorTool.output = { error: message.error }
          this.toolCalls.value = errorToolCalls
        }
        break
        
      case 'error':
        console.error('Server error:', message.message)
        break
    }
  }
  
  // 创建新会话
  createSession(title?: string, model?: string): void {
    this.send({
      type: 'create_session',
      title: title || '新对话',
      model: model || 'qwen-plus'
    })
  }
  
  // 加载会话
  loadSession(sessionId: string): void {
    this.send({
      type: 'load_session',
      sessionId
    })
  }
  
  // 获取会话列表
  listSessions(): void {
    this.send({ type: 'list_sessions' })
  }
  
  // 发送消息
  sendMessage(content: string, model?: string): void {
    this.send({
      type: 'user_message',
      content,
      model: model || this.currentSession.value?.model || 'qwen-plus'
    })
  }
  
  // 删除会话
  deleteSession(sessionId: string): void {
    this.send({
      type: 'delete_session',
      sessionId
    })
  }
  
  // 重命名会话
  renameSession(sessionId: string, title: string): void {
    this.send({
      type: 'rename_session',
      sessionId,
      title
    })
  }
  
  // 清除会话
  clearSession(sessionId?: string): void {
    this.send({
      type: 'clear_session',
      sessionId: sessionId || this.currentSession.value?.id
    })
  }
}

// 导出单例
export const wsClient = new WebSocketClient()
export default wsClient
