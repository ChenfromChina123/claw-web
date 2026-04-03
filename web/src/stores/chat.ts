import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Session, Message, ToolCall } from '@/types'
import wsClient from '@/composables/useWebSocket'

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<Session[]>([])
  const currentSessionId = ref<string | null>(null)
  const messages = ref<Message[]>([])
  const toolCalls = ref<ToolCall[]>([])
  const isLoading = ref(false)
  const isConnected = ref(false)
  
  const currentSession = computed(() => {
    return sessions.value.find(s => s.id === currentSessionId.value)
  })
  
  async function connect(token?: string) {
    // 在连接之前设置事件监听器，避免错过事件
    setupEventListeners()
    
    try {
      await wsClient.connect(token)
      isConnected.value = true
    } catch (error) {
      console.error('[Chat] 连接失败:', error)
      isConnected.value = false
      throw error
    }
  }
  
  /**
   * 设置所有事件监听器
   */
  function setupEventListeners() {
    wsClient.on('session_list', (data: unknown) => {
      if (!data) return
      const msg = data as { sessions?: Session[] }
      sessions.value = msg?.sessions || []
    })
    
    wsClient.on('session_created', (data: unknown) => {
      if (!data) return
      const msg = data as { session?: Session }
      const session = msg?.session || (data as Session)
      if (!session || !session.id) return
      sessions.value = sessions.value || []
      sessions.value.unshift(session)
      currentSessionId.value = session.id
      messages.value = []
      toolCalls.value = []
    })
    
    wsClient.on('session_loaded', (data: unknown) => {
      const msg = data as { session: Session; messages: Message[]; toolCalls: ToolCall[] }
      currentSessionId.value = msg.session.id
      messages.value = msg.messages || []
      toolCalls.value = msg.toolCalls || []
    })
    
    wsClient.on('session_deleted', (data: unknown) => {
      const msg = data as { sessionId: string }
      sessions.value = sessions.value.filter(s => s.id !== msg.sessionId)
      if (currentSessionId.value === msg.sessionId) {
        currentSessionId.value = sessions.value[0]?.id || null
      }
    })
    
    wsClient.on('session_cleared', () => {
      messages.value = []
      toolCalls.value = []
    })
    
    /**
     * 处理消息开始事件
     */
    wsClient.on('message_start', (data: unknown) => {
      console.log('[Chat] message_start event received:', data)
      isLoading.value = true
      // 添加空的 assistant 消息
      const sessionId = currentSessionId.value || ''
      messages.value.push({
        id: Date.now().toString(),
        sessionId,
        role: 'assistant',
        type: 'text',
        content: '',
        createdAt: new Date().toISOString(),
      })
    })
    
    /**
     * 处理内容增量更新事件
     * 使用响应式更新确保界面实时刷新
     */
    wsClient.on('content_block_delta', (data: unknown) => {
      console.log('[Chat] content_block_delta event received:', data)
      // 后端发送的消息格式：{ type: 'event', event: 'content_block_delta', data: { text: '...' } }
      const message = data as { type: string; event: string; data: { text: string; sessionId?: string } }
      const msg = message.data
      const lastIndex = messages.value.length - 1
      const lastMsg = messages.value[lastIndex]
      
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.type === 'text') {
        // 创建新数组以触发响应式更新
        const updatedMessages = [...messages.value]
        updatedMessages[lastIndex] = {
          ...lastMsg,
          content: lastMsg.content + msg.text
        }
        messages.value = updatedMessages
        console.log('[Chat] Updated message content:', updatedMessages[lastIndex].content)
      }
    })
    
    /**
     * 处理消息停止事件
     */
    wsClient.on('message_stop', () => {
      isLoading.value = false
    })
    
    wsClient.on('tool_use', (data: unknown) => {
      // 后端发送的消息格式：{ type: 'event', event: 'tool_use', data: { id: '...', name: '...', input: {...} } }
      const message = data as { type: string; event: string; data: { id: string; name: string; input: Record<string, unknown> } }
      const msg = message.data
      const sessionId = currentSessionId.value || ''
      toolCalls.value.push({
        id: msg.id,
        messageId: Date.now().toString(),
        sessionId,
        toolName: msg.name,
        toolInput: msg.input,
        toolOutput: null,
        status: 'pending',
        createdAt: new Date().toISOString()
      })
    })
    
    wsClient.on('tool_end', (data: unknown) => {
      // 后端发送的消息格式：{ type: 'event', event: 'tool_end', data: { id: '...', result: {...} } }
      const message = data as { type: string; event: string; data: { id: string; result: unknown } }
      const msg = message.data
      const tool = toolCalls.value.find(t => t.id === msg.id)
      if (tool) {
        tool.status = 'completed'
        tool.toolOutput = msg.result as Record<string, unknown>
      }
    })
    
    wsClient.on('tool_error', (data: unknown) => {
      // 后端发送的消息格式：{ type: 'event', event: 'tool_error', data: { id: '...', error: '...' } }
      const message = data as { type: string; event: string; data: { id: string; error: string } }
      const msg = message.data
      const tool = toolCalls.value.find(t => t.id === msg.id)
      if (tool) {
        tool.status = 'error'
        tool.toolOutput = { error: msg.error }
      }
    })
  }
  
  function disconnect() {
    wsClient.disconnect()
    isConnected.value = false
  }
  
  /**
   * 创建新会话
   * @param title 会话标题
   * @param model 使用的模型
   * @param force 是否强制创建（跳过验证）
   * @returns Promise，在会话创建成功后 resolve
   * @throws 如果当前会话没有消息且未强制创建，抛出错误
   */
  function createSession(title?: string, model?: string, force?: boolean): Promise<void> {
    // 如果不是强制创建，检查当前会话是否有消息
    if (!force && messages.value.length === 0) {
      return Promise.reject(new Error('当前会话没有消息，无法创建新会话'))
    }
    
    return new Promise((resolve, reject) => {
      const timeout = 10000
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      let resolved = false
      
      const unsubscribe = wsClient.on('session_created', () => {
        if (resolved) return
        resolved = true
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        unsubscribe()
        resolve()
      })
      
      timeoutId = setTimeout(() => {
        if (resolved) return
        resolved = true
        unsubscribe()
        reject(new Error('创建会话超时'))
      }, timeout)
      
      wsClient.createSession(title, model, force)
    })
  }
  
  /**
   * 加载指定会话
   * @param sessionId 会话 ID
   * @returns Promise，在会话加载成功后 resolve
   */
  function loadSession(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = 10000
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      let resolved = false
      
      const unsubscribe = wsClient.on('session_loaded', () => {
        if (resolved) return
        resolved = true
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        unsubscribe()
        resolve()
      })
      
      timeoutId = setTimeout(() => {
        if (resolved) return
        resolved = true
        unsubscribe()
        reject(new Error('加载会话超时'))
      }, timeout)
      
      wsClient.loadSession(sessionId)
    })
  }
  
  /**
   * 获取会话列表
   * @returns Promise，在会话列表返回后 resolve
   */
  function listSessions(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = 10000
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      let resolved = false
      
      const unsubscribe = wsClient.on('session_list', () => {
        if (resolved) return
        resolved = true
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        unsubscribe()
        resolve()
      })
      
      timeoutId = setTimeout(() => {
        if (resolved) return
        resolved = true
        unsubscribe()
        reject(new Error('获取会话列表超时'))
      }, timeout)
      
      wsClient.listSessions()
    })
  }
  
  function sendMessage(content: string, model?: string) {
    // 添加用户消息
    const sessionId = currentSessionId.value || ''
    messages.value.push({
      id: Date.now().toString(),
      sessionId,
      role: 'user',
      type: 'text',
      content,
      createdAt: new Date().toISOString(),
    })
    
    wsClient.sendMessage(content, model)
  }
  
  function deleteSession(sessionId: string) {
    wsClient.deleteSession(sessionId)
  }
  
  function renameSession(sessionId: string, title: string) {
    wsClient.renameSession(sessionId, title)
    const session = sessions.value.find(s => s.id === sessionId)
    if (session) {
      session.title = title
    }
  }
  
  function clearSession() {
    wsClient.clearSession()
  }
  
  return {
    sessions,
    currentSessionId,
    currentSession,
    messages,
    toolCalls,
    isLoading,
    isConnected,
    connect,
    disconnect,
    createSession,
    loadSession,
    listSessions,
    sendMessage,
    deleteSession,
    renameSession,
    clearSession
  }
})
