import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Session, Message, ToolCall } from '@/types'
import wsClient from '@/composables/useWebSocket'
import { useSettingsStore } from './settings'

/** 避免每次 connect() 重复注册 WS 监听，导致同一事件触发多次（重复 unshift 会话、错误 resolve loadSession 等） */
let wsListenersAttached = false

const LAST_SESSION_KEY = 'lastSessionId'

/**
 * 会话创建并发控制
 * 使用 Promise 单例模式确保同一时间只有一个创建请求
 * 所有并发的 createSession 调用将共享同一个 Promise
 */
let createSessionPromise: Promise<void> | null = null

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
  /** 追踪未发送消息的空会话 ID，防止在有空会话时创建新会话 */
  const pendingEmptySessionId = ref<string | null>(null)

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
      // 按 createdAt 排序消息，确保时间顺序正确
      const sortedMessages = (msg?.messages || []).sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime()
        const timeB = new Date(b.createdAt || 0).getTime()
        return timeA - timeB
      })
      messages.value = sortedMessages
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
      
      // 检查会话是否在列表中
      const existsInList = sessions.value.some(s => s.id === msg.sessionId)
      
      if (!existsInList) {
        // 会话不在列表中，将其添加到列表开头
        console.log('[ChatStore] 会话不在列表中，添加到列表:', msg.sessionId)
        const newSession = {
          id: msg.sessionId,
          title: msg.title,
          userId: '', // 未知用户ID
          model: '', // 未知模型
          isPinned: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        sessions.value = [newSession, ...sessions.value]
      } else {
        // 使用替换数组的方式确保触发响应式更新
        sessions.value = sessions.value.map(s => {
          if (s.id === msg.sessionId) {
            console.log('[ChatStore] 更新会话标题:', s.id, msg.title)
            return { ...s, title: msg.title }
          }
          return s
        })
      }
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
      // 按 createdAt 排序消息，确保时间顺序正确
      const sortedMessages = (msg.messages || []).sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime()
        const timeB = new Date(b.createdAt || 0).getTime()
        return timeA - timeB
      })
      messages.value = sortedMessages
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
      console.log('[Chat] Before push - messages count:', messages.value.length)

      // 确保助手消息总是在最后一条用户消息之后
      // 如果最后一条消息不是用户消息，可能是编辑重发场景，需要找到正确的插入位置
      const lastMsg = messages.value[messages.value.length - 1]
      let insertIndex = messages.value.length

      // 如果最后一条是助手消息，说明可能是新轮次，直接追加
      // 如果最后一条是用户消息，也直接追加（助手消息应该在用户消息之后）
      // 其他情况（如系统消息）也直接追加

      messages.value.push({
        id: messageId,
        sessionId: currentSessionId.value || '',
        role: 'assistant',
        type: 'text',
        content: '',
        createdAt: new Date().toISOString(),
      })
      console.log('[Chat] After push - messages count:', messages.value.length)
      console.log('[Chat] Last message:', messages.value[messages.value.length - 1])
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
      console.log('[Chat] Extracted chunk:', chunk)
      if (!chunk) {
        console.log('[Chat] Empty chunk, skipping')
        return
      }

      // 直接使用 messages ref，避免在事件处理中重新获取 store
      const lastIndex = messages.value.length - 1
      const lastMsg = messages.value[lastIndex]

      console.log('[Chat] Last message before update:', lastMsg)
      console.log('[Chat] lastIndex:', lastIndex)
      console.log('[Chat] messages.value exists:', !!messages.value)

      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.type === 'text') {
        const updatedMessages = [...messages.value]
        updatedMessages[lastIndex] = {
          ...lastMsg,
          content: lastMsg.content + chunk,
        }
        messages.value = updatedMessages
        console.log('[Chat] Updated message content:', messages.value[lastIndex].content)
      } else {
        console.log('[Chat] Cannot update: last message is not assistant text message')
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

    // 工作目录变更事件 - Agent 修改文件后通知前端刷新文件树
    wsClient.on('workdir_changed', (data: unknown) => {
      const msg = data as { sessionId?: string; toolName?: string; timestamp?: string }
      if (!msg?.sessionId) return

      // 只处理当前会话的文件变更
      if (msg.sessionId !== currentSessionId.value) return

      console.log('[ChatStore] Workdir changed by tool:', msg.toolName, 'at', msg.timestamp)

      // 触发全局事件，让 useAgentWorkdir 监听并刷新文件树
      window.dispatchEvent(new CustomEvent('workdir-changed', {
        detail: { sessionId: msg.sessionId, toolName: msg.toolName, timestamp: msg.timestamp }
      }))
    })
  }
  
  function disconnect() {
    console.log('[ChatStore] disconnect() called')
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
   * 创建新会话（带并发控制）
   * 使用 Promise 单例模式防止重复创建
   *
   * 实现原理：
   * - 维护模块级 createSessionPromise 变量
   * - 第一个调用者创建 Promise 并保存
   * - 后续调用者直接返回已存在的 Promise
   * - Promise 完成（无论成功失败）后自动清空
   *
   * @param title 会话标题
   * @param model 使用的模型
   * @param force 是否强制创建（跳过验证）
   * @returns Promise，在会话创建成功后 resolve
   */
  function createSession(title?: string, model?: string, force?: boolean): Promise<void> {
    const callStack = new Error().stack
    console.log('[ChatStore] createSession called:', { force, pendingEmptySessionId: pendingEmptySessionId.value, messagesLength: messages.value.length, sessionsCount: sessions.value.length, callStack: callStack?.split('\n').slice(1, 5) })

    // 如果已有正在进行的创建请求，直接返回该 Promise（实现并发控制）
    if (createSessionPromise) {
      console.log('[ChatStore] createSession: 已有进行中的创建请求，复用现有 Promise')
      return createSessionPromise
    }

    // 1. 首先检查是否存在未发送消息的空会话（最高优先级，force 参数对此无效）
    if (pendingEmptySessionId.value) {
      console.log('[ChatStore] createSession: 存在未发送消息的空会话，导航到该会话:', pendingEmptySessionId.value)
      return loadSession(pendingEmptySessionId.value)
    }

    // 2. 检查当前会话是否没有消息（避免创建多个空会话）
    // 注意：这个检查只在非强制模式下生效
    if (!force && messages.value.length === 0 && sessions.value.length > 0) {
      console.log('[ChatStore] createSession: 当前会话没有消息，拒绝创建 (force=false)')
      return Promise.reject(new Error('当前会话没有消息，无法创建新会话'))
    }

    // 3. 直接调用后端创建会话，后端会处理空会话检查
    // 后端逻辑：如果用户已有空会话，返回该空会话；否则创建新会话
    console.log('[ChatStore] createSession: 调用后端创建会话，后端会检查空会话...')

    // 创建新的 Promise 并保存到模块级变量
    createSessionPromise = new Promise<void>((resolve, reject) => {
      const timeout = 15000 // 15秒超时
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      let settled = false

      /**
       * 清理函数：确保资源释放和状态重置
       */
      const cleanup = (shouldReject?: boolean, error?: Error) => {
        if (settled) return
        settled = true

        // 清空全局 Promise（允许下次创建）
        createSessionPromise = null

        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }

        unsubscribe()

        if (shouldReject && error) {
          reject(error)
        } else if (!shouldReject) {
          resolve()
        }
      }

      // 监听会话创建成功事件
      const unsubscribe = wsClient.on('session_created', (data: unknown) => {
        console.log('[ChatStore] createSession: 收到 session_created 事件:', JSON.stringify(data))
        const msg = data as { session?: { id?: string } }
        if (msg?.session?.id) {
          pendingEmptySessionId.value = msg.session.id
          console.log('[ChatStore] createSession: 标记空会话 pendingEmptySessionId =', msg.session.id)
        } else {
          console.warn('[ChatStore] createSession: session_created 事件没有 session.id!')
        }
        cleanup(false)
      })

      // 设置超时
      timeoutId = setTimeout(() => {
        console.warn('[ChatStore] createSession: 创建超时（15秒）')
        cleanup(true, new Error('创建会话超时'))
      }, timeout)

      // 发送创建请求
      wsClient.createSession(title, model, force)
    }).finally(() => {
      // 确保 finally 中也清理（防止异常情况导致内存泄漏）
      if (createSessionPromise) {
        createSessionPromise = null
      }
    })

    return createSessionPromise
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

        // 检查是否有空会话（没有任何用户消息的会话）
        // 如果有未发送消息的空会话，设置 pendingEmptySessionId
        if (!pendingEmptySessionId.value && sessions.value.length > 0) {
          // 查找最新创建的会话（假设按创建时间排序）
          const latestSession = sessions.value[0]
          if (latestSession && (!latestSession as any).lastMessageTime) {
            // 如果最新会话没有最后消息时间，它可能是空会话
            // 但我们不能确定，所以需要后端支持来确认
            console.log('[ChatStore] 会话列表加载完成，最新会话:', latestSession.id, latestSession.title)
          }
        }

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
    console.log('[ChatStore] sendMessage called:', {
      content,
      contentLength: content.length,
      contentChars: [...content].map(c => c.charCodeAt(0)),
      hasNewlines: content.includes('\n'),
      newlinesCount: (content.match(/\n/g) || []).length,
      model,
      currentSessionId: currentSessionId.value
    })

    // 检查是否有当前会话
    if (!currentSessionId.value) {
      console.error('[ChatStore] Cannot send message: no current session')
      return
    }

    // 发送消息后，清除空会话标记
    const sendingSessionId = currentSessionId.value
    if (pendingEmptySessionId.value === sendingSessionId) {
      console.log('[ChatStore] sendMessage: 清除空会话标记 pendingEmptySessionId')
      pendingEmptySessionId.value = null
    }

    // 立即在前端添加用户消息，提供更好的用户体验
    const userMessageId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    console.log('[ChatStore] Adding user message:', {
      userMessageId,
      content,
      contentLength: content.length,
      contentChars: [...content].map(c => c.charCodeAt(0)),
      hasNewlines: content.includes('\n'),
      newlinesCount: (content.match(/\n/g) || []).length,
      sessionId: currentSessionId.value
    })
    messages.value.push({
      id: userMessageId,
      sessionId: currentSessionId.value,
      role: 'user',
      type: 'text',
      content: content,
      createdAt: new Date().toISOString(),
    })
    console.log('[ChatStore] User message added, total messages:', messages.value.length)

    // 获取 Agent 配置
    const settingsStore = useSettingsStore()
    const agentOptions = {
      maxIterations: settingsStore.agent.maxIterations,
      debugMode: settingsStore.agent.debugMode,
      timeout: settingsStore.agent.timeout,
    }
    console.log('[ChatStore] Agent options:', agentOptions)

    // 同时发送消息给后端，传入 sessionId 确保消息能正确路由
    console.log('[ChatStore] Calling wsClient.sendMessage')
    wsClient.sendMessage(content, currentSessionId.value, model, agentOptions)
  }
  
  function deleteSession(sessionId: string) {
    console.log('[ChatStore] deleteSession called, id:', sessionId, 'isConnected:', isConnected.value)
    // 如果删除的是待处理的空会话，清除标记
    if (pendingEmptySessionId.value === sessionId) {
      console.log('[ChatStore] deleteSession: 删除空会话，清除 pendingEmptySessionId')
      pendingEmptySessionId.value = null
    }
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
