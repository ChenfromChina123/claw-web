import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Session, Message, ToolCall } from '@/types'
import wsClient from '@/composables/useWebSocket'

/** 避免每次 connect() 重复注册 WS 监听，导致同一事件触发多次（重复 unshift 会话、错误 resolve loadSession 等） */
let wsListenersAttached = false

const LAST_SESSION_KEY = 'lastSessionId'

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<Session[]>([])
  // 从 localStorage 恢复上次选中的会话 ID，服务重启后自动恢复
  const currentSessionId = ref<string | null>(localStorage.getItem(LAST_SESSION_KEY))
  const messages = ref<Message[]>([])
  const toolCalls = ref<ToolCall[]>([])
  const isLoading = ref(false)
  const isConnected = ref(false)
  /** 当前正在流式输出的助手消息 id，用于将 toolCall 归属到对应轮次 */
  const currentStreamingAssistantId = ref<string | null>(null)

  // 监听会话切换，自动持久化到 localStorage
  watch(currentSessionId, (newId) => {
    if (newId) {
      localStorage.setItem(LAST_SESSION_KEY, newId)
    } else {
      localStorage.removeItem(LAST_SESSION_KEY)
    }
  })

  const currentSession = computed(() => {
    return sessions.value.find(s => s.id === currentSessionId.value)
  })
  
  async function connect(token?: string) {
    console.log('[ChatStore] 开始连接 WebSocket...')
    // 在连接之前设置事件监听器，避免错过事件
    setupEventListeners()
    
    try {
      await wsClient.connect(token)
      isConnected.value = true
      console.log('[ChatStore] WebSocket 连接成功')
    } catch (error) {
      console.error('[ChatStore] 连接失败:', error)
      isConnected.value = false
      throw error
    }
  }
  
  /**
   * 设置所有事件监听器
   */
  function setupEventListeners() {
    if (wsListenersAttached) return
    wsListenersAttached = true

    wsClient.on('session_list', (data: unknown) => {
      if (!data) return
      const msg = data as { sessions?: Session[] }
      console.log('[ChatStore] 监听到 session_list 事件，sessions:', msg.sessions)
      sessions.value = msg?.sessions || []
    })

    wsClient.on('master_session', (data: unknown) => {
      if (!data) return
      const session = data as Session
      if (!session || !session.id) return
      console.log('[ChatStore] 监听到 master_session 事件:', session)
      sessions.value = sessions.value || []
      // 如果主会话已存在，更新它；否则添加到最前面
      const existingIndex = sessions.value.findIndex((s) => s.id === session.id)
      if (existingIndex !== -1) {
        sessions.value[existingIndex] = session
      } else {
        sessions.value.unshift(session)
      }
    })

    wsClient.on('session_created', (data: unknown) => {
      if (!data) return
      const msg = data as { session?: Session }
      const session = msg?.session || (data as Session)
      if (!session || !session.id) return
      sessions.value = sessions.value || []
      if (!sessions.value.some((s) => s.id === session.id)) {
        sessions.value.unshift(session)
      }
      currentSessionId.value = session.id
      messages.value = []
      toolCalls.value = []
    })
    
    wsClient.on('session_loaded', (data: unknown) => {
      if (!data) return
      const msg = data as { session?: Session; messages?: Message[]; toolCalls?: ToolCall[] }
      const session = msg?.session
      if (!session || !session.id) return
      
      // 防止竞态条件：只处理当前正在加载的会话
      const targetSessionId = session.id
      if (targetSessionId !== currentSessionId.value) {
        console.warn('[ChatStore] session_loaded: ignoring event for session', targetSessionId, 'current:', currentSessionId.value)
        return
      }
      
      console.log('[ChatStore] 会话加载完成，sessionId:', session.id, 'messages:', msg.messages?.length, 'toolCalls:', msg.toolCalls?.length)
      messages.value = msg?.messages || []
      toolCalls.value = msg?.toolCalls || []
    })
    
    wsClient.on('session_deleted', async (data: unknown) => {
      console.log('[ChatStore] session_deleted 事件收到:', data)
      if (!data) return
      const msg = data as { sessionId?: string }
      if (!msg?.sessionId) return
      const deletedId = msg.sessionId
      console.log('[ChatStore] 要删除的会话ID:', deletedId)
      const wasCurrent = currentSessionId.value === deletedId
      console.log('[ChatStore] 是否是当前会话:', wasCurrent)
      sessions.value = (sessions.value || []).filter((s) => s.id !== deletedId)
      console.log('[ChatStore] 更新后的会话列表:', sessions.value)
      if (wasCurrent) {
        const nextId = sessions.value[0]?.id ?? null
        currentSessionId.value = nextId
        if (nextId) {
          try {
            await loadSession(nextId)
          } catch (e) {
            console.error('[ChatStore] 删除后加载下一会话失败:', e)
            messages.value = []
            toolCalls.value = []
          }
        } else {
          messages.value = []
          toolCalls.value = []
        }
      }
    })

    wsClient.on('session_renamed', (data: unknown) => {
      const msg = data as { sessionId?: string; title?: string }
      console.log('[ChatStore] 收到 session_renamed 事件:', msg)
      if (!msg?.sessionId || msg.title === undefined) return
      
      // 使用替换数组的方式确保触发响应式更新
      sessions.value = sessions.value.map(s => {
        if (s.id === msg.sessionId) {
          console.log('[ChatStore] 更新会话标题:', s.id, msg.title)
          return { ...s, title: msg.title }
        }
        return s
      })
    })
    
    wsClient.on('session_title_updated', (data: unknown) => {
      const msg = data as { sessionId?: string; title?: string }
      console.log('[ChatStore] 收到 session_title_updated 事件:', msg)
      if (!msg?.sessionId || msg.title === undefined) return
      
      // 使用替换数组的方式确保触发响应式更新
      sessions.value = sessions.value.map(s => {
        if (s.id === msg.sessionId) {
          console.log('[ChatStore] 更新会话标题:', s.id, msg.title)
          return { ...s, title: msg.title }
        }
        return s
      })
    })
    
    wsClient.on('session_cleared', () => {
      messages.value = []
      toolCalls.value = []
    })

    wsClient.on('session_rolled_back', (data: unknown) => {
      if (!data) return
      const msg = data as { session?: Session; messages?: Message[]; toolCalls?: ToolCall[] }
      const session = msg?.session
      if (!session || !session.id) return
      if (session.id !== currentSessionId.value) {
        console.warn('[ChatStore] session_rolled_back: ignoring other session', session.id)
        return
      }
      messages.value = msg.messages || []
      toolCalls.value = msg.toolCalls || []
      isLoading.value = false
      currentStreamingAssistantId.value = null
    })
    
    /**
     * 处理消息开始事件 - 后端会发送完整的消息ID
     */
    wsClient.on('message_start', (data: unknown) => {
      console.log('[Chat] message_start event received:', data)
      isLoading.value = true
      const payload = data as { messageId?: string; iteration?: number }
      const messageId = payload?.messageId || ''
      currentStreamingAssistantId.value = messageId
      messages.value.push({
        id: messageId,
        sessionId: currentSessionId.value || '',
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
      // WS 已解包为 payload：{ text }（见服务端 createEventSender）
      const payload = data as { text?: string; delta?: string }
      const chunk =
        typeof payload?.text === 'string'
          ? payload.text
          : typeof payload?.delta === 'string'
            ? payload.delta
            : ''
      if (!chunk) return

      const lastIndex = messages.value.length - 1
      const lastMsg = messages.value[lastIndex]

      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.type === 'text') {
        const updatedMessages = [...messages.value]
        updatedMessages[lastIndex] = {
          ...lastMsg,
          content: lastMsg.content + chunk,
        }
        messages.value = updatedMessages
      }
    })
    
    /**
     * 处理消息停止事件
     */
    wsClient.on('message_stop', () => {
      isLoading.value = false
      currentStreamingAssistantId.value = null
    })
    
    wsClient.on('tool_use', (data: unknown) => {
      console.log('[ChatStore] tool_use event:', data)
      const msg = data as {
        id: string
        name: string
        input?: Record<string, unknown>
      }
      if (!msg?.id || !msg?.name) return
      const sessionId = currentSessionId.value || ''
      toolCalls.value.push({
        id: msg.id,
        messageId: currentStreamingAssistantId.value || '',
        sessionId,
        toolName: msg.name,
        toolInput: msg.input ?? {},
        toolOutput: null,
        status: 'pending',
        createdAt: new Date().toISOString(),
      })
    })

    wsClient.on('tool_start', (data: unknown) => {
      console.log('[ChatStore] tool_start event:', data)
      const msg = data as { id: string; name: string }
      if (!msg?.id) return

      const tool = toolCalls.value.find(t => t.id === msg.id)
      if (tool) {
        tool.status = 'executing'
        toolCalls.value = [...toolCalls.value]
      }
    })
    
    wsClient.on('tool_end', (data: unknown) => {
      console.log('[ChatStore] tool_end event:', data)
      const msg = data as {
        id: string
        result?: unknown
        success?: boolean
        duration?: number
      }
      if (!msg?.id) return

      const tool = toolCalls.value.find(t => t.id === msg.id)
      if (tool) {
        tool.status = 'completed'

        if (msg.result !== null && msg.result !== undefined) {
          if (typeof msg.result === 'object' && !Array.isArray(msg.result)) {
            tool.toolOutput = msg.result as Record<string, unknown>
          } else {
            tool.toolOutput = { value: msg.result }
          }
        } else {
          tool.toolOutput = { success: true, duration: msg.duration }
        }

        toolCalls.value = [...toolCalls.value]
      }
    })

    wsClient.on('tool_error', (data: unknown) => {
      console.log('[ChatStore] tool_error event:', data)
      const msg = data as {
        id: string
        error: string
        errorType?: string
        duration?: number
      }
      if (!msg?.id) return

      const tool = toolCalls.value.find(t => t.id === msg.id)
      if (tool) {
        tool.status = 'error'

        tool.toolOutput = {
          error: msg.error,
          errorType: msg.errorType || 'UNKNOWN',
          duration: msg.duration,
          timestamp: new Date().toISOString(),
        }

        toolCalls.value = [...toolCalls.value]

        console.error('[ChatStore] Tool execution failed:', msg.errorType, '-', msg.error)
      }
    })

    // 会话保存完成事件
    wsClient.on('session_saved', (data: unknown) => {
      const msg = data as { sessionId?: string; messageCount?: number }
      if (msg?.sessionId) {
        console.log('[ChatStore] Session saved:', msg.sessionId, 'messages:', msg.messageCount)
      }
    })

    // 消息保存确认事件
    wsClient.on('message_saved', (data: unknown) => {
      const msg = data as { sessionId?: string; messageId?: string; role?: string }
      if (!msg?.sessionId || !msg?.messageId || !msg?.role) return
      
      // 只处理当前会话的消息
      if (msg.sessionId !== currentSessionId.value) return
      
      console.log('[ChatStore] Message saved:', msg.role, msg.messageId)
      
      // 如果是用户消息且还没有在UI中（正常流程），不应该出现这种情况
      // 如果是助手消息，也已经通过 message_start 添加到UI了
      // 这里主要用于日志记录，不需要额外操作
    })
  }
  
  function disconnect() {
    wsClient.disconnect()
    isConnected.value = false
  }
  
  /**
   * 加载指定会话
   * @param sessionId 会话 ID
   * @returns Promise，在会话加载成功后 resolve
   */
  function loadSession(sessionId: string): Promise<void> {
    // 先设置当前会话ID，防止竞态条件
    currentSessionId.value = sessionId
    // 清空当前消息，避免看到旧会话的数据
    messages.value = []
    toolCalls.value = []
    
    return new Promise((resolve, reject) => {
      const timeout = 10000
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      let resolved = false

      const unsubscribe = wsClient.on('session_loaded', (data: unknown) => {
        const msg = data as { session?: Session }
        if (msg?.session?.id !== sessionId) return
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
   * 获取会话列表
   * @returns Promise，在会话列表返回后 resolve
   */
  function listSessions(): Promise<void> {
    console.log('[ChatStore] 发送 list_sessions 请求...')
    return new Promise((resolve, reject) => {
      const timeout = 10000
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      let resolved = false

      const unsubscribe = wsClient.on('session_list', (data: unknown) => {
        if (resolved) return
        resolved = true
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        unsubscribe()
        console.log('[ChatStore] 收到 session_list 事件，data:', data)
        if (!data) {
          sessions.value = []
          resolve()
          return
        }
        const msg = data as { sessions?: Session[] } | Session[]
        sessions.value = Array.isArray(msg) ? msg : msg.sessions ?? []
        console.log('[ChatStore] 会话列表更新，数量:', sessions.value.length)

        // 同时请求主会话
        wsClient.send({ type: 'get_master_session' })

        resolve()
      })

      timeoutId = setTimeout(() => {
        if (resolved) return
        resolved = true
        unsubscribe()
        console.error('[ChatStore] 获取会话列表超时')
        reject(new Error('获取会话列表超时'))
      }, timeout)

      wsClient.listSessions()
    })
  }
  
  function sendMessage(content: string, model?: string) {
    // 检查是否有当前会话
    if (!currentSessionId.value) {
      console.error('[ChatStore] Cannot send message: no current session')
      return
    }

    // 立即在前端添加用户消息，提供更好的用户体验
    const userMessageId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    messages.value.push({
      id: userMessageId,
      sessionId: currentSessionId.value,
      role: 'user',
      type: 'text',
      content: content,
      createdAt: new Date().toISOString(),
    })

    // 同时发送消息给后端，传入 sessionId 确保消息能正确路由
    wsClient.sendMessage(content, currentSessionId.value, model)
  }
  
  function deleteSession(sessionId: string) {
    console.log('[ChatStore] deleteSession called, id:', sessionId, 'isConnected:', isConnected.value)
    wsClient.deleteSession(sessionId)
  }
  
  function renameSession(sessionId: string, title: string) {
    console.log('[ChatStore] renameSession called, id:', sessionId, 'title:', title, 'isConnected:', isConnected.value)
    wsClient.renameSession(sessionId, title)
    const session = sessions.value.find(s => s.id === sessionId)
    if (session) {
      session.title = title
    }
  }
  
  function clearSession() {
    wsClient.clearSession()
  }

  /**
   * 从某条用户消息起回滚（删除该条及之后所有消息与关联工具调用）
   */
  async function rollbackToUserMessage(anchorMessageId: string): Promise<void> {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      throw new Error('请先选择会话')
    }
    if (!anchorMessageId) {
      throw new Error('缺少消息锚点')
    }

    void interruptGeneration()

    return new Promise((resolve, reject) => {
      const timeoutMs = 20000
      let done = false
      let unsub: (() => void) | null = null

      const timeoutId = setTimeout(() => {
        if (done) return
        done = true
        unsub?.()
        reject(new Error('回滚超时，请重试'))
      }, timeoutMs)

      unsub = wsClient.on('session_rolled_back', (data: unknown) => {
        if (done) return
        const msg = data as { session?: Session }
        if (msg?.session?.id !== sessionId) return
        done = true
        clearTimeout(timeoutId)
        unsub?.()
        resolve()
      })

      wsClient.rollbackSession(sessionId, anchorMessageId)
    })
  }

  /**
   * 中断当前正在进行的生成
   * 前端立即更新状态，后端异步处理中断指令
   */
  async function interruptGeneration(): Promise<void> {
    // 立即将 isLoading 设为 false（WS 的 message_stop 可能延迟到达）
    isLoading.value = false

    // 标记所有正在执行或等待的工具调用为中断状态
    const interrupted = toolCalls.value.filter(
      t => t.status === 'executing' || t.status === 'pending',
    )
    if (interrupted.length > 0) {
      toolCalls.value = toolCalls.value.map(t => {
        if (t.status === 'executing' || t.status === 'pending') {
          return {
            ...t,
            status: 'error' as const,
            toolOutput: {
              error: '用户主动停止生成',
              errorType: 'USER_STOPPED',
              timestamp: new Date().toISOString(),
            },
          }
        }
        return t
      })
    }

    // 必须带会话 ID：wsClient.currentSession 常与 Pinia 不同步
    wsClient.interruptGeneration(currentSessionId.value)
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
    clearSession,
    interruptGeneration,
    rollbackToUserMessage,
  }
})
