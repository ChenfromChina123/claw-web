import { v4 as uuidv4 } from 'uuid'
import { UserRepository } from '../db/repositories/userRepository'
import { SessionRepository } from '../db/repositories/sessionRepository'
import { MessageRepository } from '../db/repositories/messageRepository'
import { ToolCallRepository } from '../db/repositories/toolCallRepository'
import type { Session, Message, ConversationMessage, ToolCall } from '../models/types'
import type { MessageContent, ImageAttachment } from '../models/imageTypes'
import { generateSessionTitleWithLLM } from './sessionTitleGenerator'
import { extractIdeUserDisplay } from '../utils/ideUserMessageMarkers'
import { buildCompleteSystemPrompt, getWebSearchPrompt } from '../prompts'
import { imageStorageService } from './imageStorageService'

export interface InMemorySession {
  session: Session
  messages: Message[]  // 使用完整 Message 类型
  toolCalls: ToolCall[]
  dirty: boolean
  /** 标记是否需要从数据库补充数据（由列表加载放入缓存时设置） */
  needsHydration?: boolean
}

export class SessionManager {
  private static instance: SessionManager

  private sessions: Map<string, InMemorySession> = new Map()
  private userSessions: Map<string, string[]> = new Map()

  private userRepo = new UserRepository()
  private sessionRepo = new SessionRepository()
  private messageRepo = new MessageRepository()
  private toolCallRepo = new ToolCallRepository()

  private saveDebounceTimers: Map<string, NodeJS.Timeout> = new Map()

  /** 会话标题更新回调 */
  private onSessionTitleUpdated: ((sessionId: string, title: string) => void) | null = null

  /** 标题生成序列号 Map，用于并行标题生成时只保留最新请求 */
  private titleGenSeq: Map<string, number> = new Map()

  /**
   * 设置会话标题更新回调
   */
  setOnSessionTitleUpdated(callback: (sessionId: string, title: string) => void): void {
    this.onSessionTitleUpdated = callback
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager()
    }
    return SessionManager.instance
  }

  async getOrCreateUser(userId: string, username?: string): Promise<{ id: string; username: string }> {
    let user = await this.userRepo.findById(userId)
    if (!user) {
      user = await this.userRepo.create(username || `user_${userId.slice(0, 8)}`)
    }
    return { id: user.id, username: user.username }
  }

  /**
   * 检查用户是否有空会话(没有消息的会话)
   * @param userId 用户ID
   * @returns 如果有空会话返回true,否则返回false
   */
  async hasEmptySession(userId: string): Promise<boolean> {
    const emptySession = await this.sessionRepo.findEmptySessionByUserId(userId)
    return emptySession !== null
  }

  /**
   * 创建新会话
   * @param userId 用户ID
   * @param title 会话标题
   * @param model 使用的模型
   * @param force 是否强制创建(忽略空会话检查)
   * @returns 创建的会话对象，包含 isNew 字段标识是否是新创建的
   */
  async createSession(userId: string, title?: string, model?: string, force?: boolean): Promise<Session & { isNew: boolean }> {
    let isNew = true
    
    let session: Session
    if (!force) {
      // 使用原子操作查找或创建空会话
      session = await this.sessionRepo.findOrCreateEmptySession(userId, title || '新对话', model || 'qwen-plus')
      // 如果 findOrCreateEmptySession 返回的会话不是新创建的，isNew 为 false
      // 但由于 findOrCreateEmptySession 内部保证了原子性，这里我们通过检查来判断
      const emptySession = await this.sessionRepo.findEmptySessionByUserId(userId)
      if (emptySession && emptySession.id === session.id) {
        isNew = false
        console.log(`[SessionManager] 返回已有空会话 ${session.id}，跳过创建`)
      }
    } else {
      session = await this.sessionRepo.create(userId, title || '新对话', model || 'qwen-plus')
    }

    // 只有新创建的会话才需要添加到内存缓存
    if (isNew) {
      this.sessions.set(session.id, {
        session,
        messages: [],
        toolCalls: [],
        dirty: true,
      })

      const userSessionList = this.userSessions.get(userId) || []
      userSessionList.unshift(session.id)
      this.userSessions.set(userId, userSessionList)
    }

    return { ...session, isNew }
  }

  async loadSession(sessionId: string): Promise<InMemorySession | null> {
    console.log(`[SessionManager] loadSession called for session ${sessionId}`)

    // 无论是否有缓存，都从数据库重新加载完整数据
    // 这样可以确保始终获取到最新、最完整的数据
    const session = await this.sessionRepo.findById(sessionId)
    if (!session) {
      console.warn(`[SessionManager] Session ${sessionId} not found in database`)
      return null
    }

    const dbMessages = await this.messageRepo.findBySessionId(sessionId)
    const dbToolCalls = await this.toolCallRepo.findBySessionId(sessionId)

    console.log(`[SessionManager] Retrieved from DB - messages: ${dbMessages.length}, toolCalls: ${dbToolCalls.length}`)

    // 保留完整消息（包括 tool_result），用于AI上下文
    // 前端负责过滤显示的消息
    console.log(`[SessionManager] Keeping all messages including tool_result for AI context`)

    // 标准化 createdAt 为 ISO 字符串格式，确保与前端兼容
    // 同时包含 sequence 字段用于确保消息顺序
    const messages: Message[] = dbMessages.map(msg => {
      const normalized: Message = {
        id: msg.id,
        sessionId: msg.sessionId,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
        sequence: msg.sequence,
        toolCalls: msg.toolCalls,
      }
      return normalized
    })

    // 验证并修复 toolCalls 的 messageId 关联
    // 如果 toolCall 的 messageId 不存在于当前会话的消息中，
    // 尝试将其关联到最近的助手消息（通常是产生该工具调用的消息）
    const messageIdSet = new Set(messages.map(m => m.id))
    const fixedToolCalls = dbToolCalls.map(tc => {
      if (!tc.messageId || !messageIdSet.has(tc.messageId)) {
        // 找到该 toolCall 创建时间之前的最近一条助手消息
        const tcTime = new Date(tc.createdAt || 0).getTime()
        const candidateMessages = messages.filter(m => {
          if (m.role !== 'assistant') return false
          const msgTime = new Date(m.createdAt || 0).getTime()
          return msgTime <= tcTime || Math.abs(msgTime - tcTime) < 60000 // 1分钟容差
        })
        // 选择时间最接近的助手消息
        let closestMessage = candidateMessages[candidateMessages.length - 1]
        if (!closestMessage && messages.length > 0) {
          // 如果没有找到，使用最后一条助手消息
          const assistantMessages = messages.filter(m => m.role === 'assistant')
          closestMessage = assistantMessages[assistantMessages.length - 1]
        }
        if (closestMessage) {
          console.log(`[SessionManager] Fixed toolCall ${tc.id} messageId: ${tc.messageId} -> ${closestMessage.id}`)
          return { ...tc, messageId: closestMessage.id }
        }
      }
      return tc
    })

    const sessionData: InMemorySession = {
      session,
      messages,
      toolCalls: fixedToolCalls,
      dirty: false,
      needsHydration: false,
    }

    // 更新缓存（覆盖现有缓存，确保数据一致性）
    this.sessions.set(sessionId, sessionData)

    const userSessionList = this.userSessions.get(session.userId) || []
    if (!userSessionList.includes(sessionId)) {
      userSessionList.unshift(sessionId)
      this.userSessions.set(session.userId, userSessionList)
    }

    // 添加数据完整性日志
    console.log(`[SessionManager] Loaded session ${sessionId} successfully:`, {
      messageCount: messages.length,
      toolCallCount: dbToolCalls.length,
      dirty: false
    })

    return sessionData
  }

  /** 从数据库填充仅由列表接口放入缓存、尚未加载过消息的会话 */
  private async hydrateSessionFromDb(sessionId: string, cached: InMemorySession): Promise<void> {
    console.log(`[SessionManager] Hydrating session ${sessionId} from DB...`)
    const dbMessages = await this.messageRepo.findBySessionId(sessionId)
    if (dbMessages.length > 0) {
      // 保留完整消息（包括 tool_result），用于AI上下文
      // 前端负责过滤显示的消息
      console.log(`[SessionManager] Hydrated ${dbMessages.length} messages for session ${sessionId} (including tool_result)`)

      // 标准化 createdAt 为 ISO 字符串格式，确保与前端兼容
      // 同时包含 sequence 字段用于确保消息顺序
      cached.messages = dbMessages.map(msg => {
        const normalized: Message = {
          id: msg.id,
          sessionId: msg.sessionId,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
          sequence: msg.sequence,
          toolCalls: msg.toolCalls,
        }
        return normalized
      })
    }
    const dbToolCalls = await this.toolCallRepo.findBySessionId(sessionId)
    if (dbToolCalls.length > 0) {
      // 验证并修复 toolCalls 的 messageId 关联
      const messageIdSet = new Set(cached.messages.map(m => m.id))
      cached.toolCalls = dbToolCalls.map(tc => {
        if (!tc.messageId || !messageIdSet.has(tc.messageId)) {
          const tcTime = new Date(tc.createdAt || 0).getTime()
          const candidateMessages = cached.messages.filter(m => {
            if (m.role !== 'assistant') return false
            const msgTime = new Date(m.createdAt || 0).getTime()
            return msgTime <= tcTime || Math.abs(msgTime - tcTime) < 60000
          })
          let closestMessage = candidateMessages[candidateMessages.length - 1]
          if (!closestMessage && cached.messages.length > 0) {
            const assistantMessages = cached.messages.filter(m => m.role === 'assistant')
            closestMessage = assistantMessages[assistantMessages.length - 1]
          }
          if (closestMessage) {
            console.log(`[SessionManager] Fixed toolCall ${tc.id} messageId: ${tc.messageId} -> ${closestMessage.id}`)
            return { ...tc, messageId: closestMessage.id }
          }
        }
        return tc
      })
      console.log(`[SessionManager] Hydrated ${dbToolCalls.length} toolCalls for session ${sessionId}`)
    }
    // 清除 hydration 标记
    cached.needsHydration = false
  }

  async getUserSessions(userId: string): Promise<Session[]> {
    const sessions = await this.sessionRepo.findByUserId(userId)

    for (const session of sessions) {
      if (!this.sessions.has(session.id)) {
        this.sessions.set(session.id, {
          session,
          messages: [],
          toolCalls: [],
          dirty: false,
          needsHydration: true,  // 标记需要从数据库补充数据
        })
      }
    }

    return sessions
  }

  getInMemorySession(sessionId: string): InMemorySession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * 获取用于AI上下文的完整消息列表（包括 tool_result 消息）
   * 这个方法从数据库加载完整的消息，不过滤 tool_result，确保AI获得完整上下文
   * @param sessionId 会话ID
   * @returns 完整的消息列表
   */
  async getMessagesForAI(sessionId: string): Promise<Message[]> {
    // 从数据库加载完整消息（包括 tool_result）
    const dbMessages = await this.messageRepo.findBySessionId(sessionId)
    
    // 标准化 createdAt 为 ISO 字符串格式
    const messages: Message[] = dbMessages.map(msg => ({
      id: msg.id,
      sessionId: msg.sessionId,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
      sequence: msg.sequence,
      toolCalls: msg.toolCalls,
    }))
    
    console.log(`[SessionManager] getMessagesForAI: loaded ${messages.length} messages for session ${sessionId} (including tool_result)`)
    
    return messages
  }

  /**
   * 切换会话前强制保存当前会话
   * @param currentSessionId 当前会话ID
   * @param newSessionId 新会话ID
   */
  async switchSession(currentSessionId: string, newSessionId: string): Promise<void> {
    if (currentSessionId && this.sessions.has(currentSessionId)) {
      const sessionData = this.sessions.get(currentSessionId)
      if (sessionData && sessionData.dirty) {
        console.log(`[SwitchSession] Saving dirty session ${currentSessionId} before switching`)
        // 使用强制保存，确保数据立即落库
        await this.forceSaveSession(currentSessionId)
      }
    }
  }

  addMessage(sessionId: string, role: 'user' | 'assistant', content: MessageContent, imageAttachments?: ImageAttachment[], externalId?: string): Message | null {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      console.error(`Session ${sessionId} not found in memory`)
      return null
    }

    const messageId = externalId || uuidv4()
    const message: Message = { id: messageId, sessionId, role, content, createdAt: new Date() }
    if (imageAttachments && imageAttachments.length > 0) {
      message.attachments = imageAttachments
    }
    sessionData.messages.push(message)
    sessionData.dirty = true

    this.scheduleSave(sessionId)

    // 如果是用户的第一条消息，就并行生成会话标题，并标记会话为非空
    console.log(`[SessionManager] addMessage: role=${role}, session.title="${sessionData.session.title}", messages.length=${sessionData.messages.length}, sessionId=${sessionId}`)
    console.log(`[SessionManager] addMessage content detail:`, {
      contentType: typeof content,
      contentLength: typeof content === 'string' ? content.length : Array.isArray(content) ? content.length : 'N/A',
      contentPreview: typeof content === 'string' ? content.substring(0, 100) : JSON.stringify(content).substring(0, 100),
      hasNewlines: typeof content === 'string' ? content.includes('\n') : false,
      newlinesCount: typeof content === 'string' ? (content.match(/\n/g) || []).length : 0,
    })
    if (role === 'user' && sessionData.messages.length === 1) {
      // 标记会话为非空（这样下次就不会再复用这个会话了）
      this.sessionRepo.markAsNonEmpty(sessionId).catch(err => {
        console.warn(`[SessionManager] Failed to mark session ${sessionId} as non-empty:`, err)
      })
      
      // 使用序列号机制，支持并行生成，只保留最新请求的结果
      const currentSeq = (this.titleGenSeq.get(sessionId) || 0) + 1
      this.titleGenSeq.set(sessionId, currentSeq)
      console.log(`[SessionManager] Detected first user message, generating title for session ${sessionId} (seq=${currentSeq})`)
      console.log(`[SessionManager] Title gen content:`, {
        originalContent: typeof content === 'string' ? content : JSON.stringify(content),
        originalLength: typeof content === 'string' ? content.length : 0,
      })
      this.generateAndUpdateSessionTitle(sessionId, content, currentSeq)
    } else if (role === 'user') {
      console.log(`[SessionManager] Not the first user message (count=${sessionData.messages.length}), skipping title generation`)
    }

    return message
  }

  /**
   * 基于用户第一条消息生成会话标题并更新
   * @param sessionId 会话ID
   * @param userContent 用户消息内容
   * @param genSeq 当前的生成序列号，用于并行场景下只保留最新请求的结果
   */
  private async generateAndUpdateSessionTitle(sessionId: string, userContent: string | any[], genSeq: number): Promise<void> {
    const startTime = Date.now()
    try {
      console.log(`[SessionManager] generateAndUpdateSessionTitle called for session ${sessionId} (seq=${genSeq})`)

      // 将内容转换为字符串（IDE 双轨消息仅取展示层生成标题）
      const contentString = typeof userContent === 'string'
        ? extractIdeUserDisplay(userContent)
        : JSON.stringify(userContent)

      console.log(`[SessionManager] Content string: "${contentString.substring(0, 50)}..."`)

      // 检查当前会话状态
      const sessionData = this.sessions.get(sessionId)
      console.log(`[SessionManager] sessionData exists: ${!!sessionData}, current title: "${sessionData?.session?.title}"`)

      if (!sessionData || sessionData.session.title !== '新对话') {
        console.log(`[SessionManager] Skipping title update: session not found or title already set to "${sessionData?.session?.title}"`)
        return
      }

      // 检查序列号是否仍是最新的，只有最新请求才能更新标题
      const currentSeq = this.titleGenSeq.get(sessionId)
      if (currentSeq !== genSeq) {
        console.log(`[SessionManager] Title generation seq mismatch (expected=${genSeq}, current=${currentSeq}), discarding result`)
        return
      }

      // 使用 LLM 生成标题
      console.log(`[SessionManager] Calling LLM to generate title...`)
      let title = await generateSessionTitleWithLLM(contentString)
      console.log(`[SessionManager] LLM generated title: "${title}"`)

      // LLM 生成失败时，使用内容前30字符作为兜底标题
      if (!title || title === '新对话') {
        console.log(`[SessionManager] LLM failed to generate valid title, falling back to content preview`)
        title = contentString.substring(0, 30)
      }

      // 再次检查序列号（LLM 调用后可能已有新的请求）
      const finalSeq = this.titleGenSeq.get(sessionId)
      if (finalSeq !== genSeq) {
        console.log(`[SessionManager] Title generation seq mismatch after LLM call (expected=${genSeq}, current=${finalSeq}), discarding result`)
        return
      }

      // 强制更新标题，只要是第一个消息！
      console.log(`[SessionManager] Updating title for session ${sessionId}: "${title}"`)

      // 更新内存中的会话
      sessionData.session.title = title

      // 异步更新数据库
      await this.sessionRepo.updateTitle(sessionId, title)
      console.log(`[SessionManager] Title saved to database`)

      // 通知前端会话标题已更新
      if (this.onSessionTitleUpdated) {
        console.log(`[SessionManager] Calling onSessionTitleUpdated callback`)
        this.onSessionTitleUpdated(sessionId, title)
      } else {
        console.warn(`[SessionManager] onSessionTitleUpdated callback is not set, title updated but frontend not notified!`)
      }

      const duration = Date.now() - startTime
      console.log(`[SessionManager] ✅ Title generation completed successfully in ${duration}ms for session ${sessionId}: "${title}"`)
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`[SessionManager] ❌ Failed to generate/update session title after ${duration}ms:`, error)
      console.error(`[SessionManager] Error details:`, {
        sessionId,
        errorName: error instanceof Error ? error.name : 'Unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      })
      // 标题生成失败不影响主要功能，但记录详细的错误信息以便排查
    }
  }

  /**
   * 过滤掉内部的 tool_result 消息
   * 这些消息是工具调用的返回值，用于 AI 上下文，但不应显示给用户
   * @param messages 原始消息列表
   * @returns 过滤后的可见消息列表
   */
  private filterVisibleMessages(messages: Message[]): Message[] {
    return messages.filter(msg => {
      // 如果内容是数组，检查是否包含 tool_result 类型的块
      if (Array.isArray(msg.content)) {
        const hasToolResult = msg.content.some(
          (block: any) => block && block.type === 'tool_result'
        )
        if (hasToolResult) {
          console.log(`[SessionManager] Filtering out tool_result message: ${msg.id}`)
          return false
        }
      }
      return true
    })
  }

  /**
   * 添加工具结果到会话 (in-memory) - 使用正确的 Anthropic 格式
   * 工具结果应该以特定的内容块格式添加，而不是简单的字符串消息
   */
  addToolResultMessage(
    sessionId: string,
    toolUseId: string,
    toolName: string,
    result?: unknown,
    error?: string
  ): Message | null {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      console.error(`Session ${sessionId} not found in memory`)
      return null
    }

    // 构建 Anthropic 格式的工具结果内容
    const content = [
      {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content: error 
          ? JSON.stringify({ error: error })
          : JSON.stringify(result)
      }
    ]

    const message: Message = {
      id: uuidv4(),
      sessionId,
      role: 'user',  // Anthropic API 要求工具结果用 user 角色，但内容是 tool_result 格式
      content,
      createdAt: new Date()
    }

    sessionData.messages.push(message)
    sessionData.dirty = true

    this.scheduleSave(sessionId)
    
    console.debug(`[SessionManager] Added tool result message for tool ${toolName} (${toolUseId}) to session ${sessionId}`)
    return message
  }

  /**
   * 更新内存中的消息内容
   */
  updateMessage(sessionId: string, messageId: string, content: MessageContent, toolCalls?: ToolCall[]): Message | null {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      console.error(`Session ${sessionId} not found in memory`)
      return null
    }

    const message = sessionData.messages.find(m => m.id === messageId)
    if (!message) {
      console.error(`Message ${messageId} not found in session ${sessionId}`)
      return null
    }

    message.content = content
    if (toolCalls) {
      message.toolCalls = toolCalls
    }
    sessionData.dirty = true

    this.scheduleSave(sessionId)

    return message
  }

  addToolCall(sessionId: string, toolCall: ToolCall): void {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      console.error(`Session ${sessionId} not found in memory`)
      return
    }

    sessionData.toolCalls.push(toolCall)
    sessionData.dirty = true

    this.scheduleSave(sessionId)
  }

  updateToolCall(sessionId: string, toolCallId: string, output: Record<string, unknown>, status: 'completed' | 'error'): void {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) return

    const toolCall = sessionData.toolCalls.find(tc => tc.id === toolCallId)
    if (toolCall) {
      toolCall.toolOutput = output
      toolCall.status = status
      sessionData.dirty = true
      this.scheduleSave(sessionId)
    }
  }

  /**
   * 删除会话（始终落库；不再依赖内存缓存，否则仅 DB 有记录时会「删不掉」）
   * @param requestingUserId 若传入则校验归属，防止跨用户删除
   */
  async deleteSession(sessionId: string, requestingUserId?: string): Promise<void> {
    const existing = await this.sessionRepo.findById(sessionId)
    if (!existing) {
      throw new Error('Session not found')
    }
    if (requestingUserId && existing.userId !== requestingUserId) {
      throw new Error('Forbidden: cannot delete another user\'s session')
    }

    await imageStorageService.deleteImagesBySession(sessionId).catch(err => {
      console.warn('[SessionManager] 清理会话图片失败:', err)
    })
    await this.messageRepo.deleteBySessionId(sessionId)
    await this.toolCallRepo.deleteBySessionId(sessionId)
    await this.sessionRepo.delete(sessionId)

    this.sessions.delete(sessionId)

    const userSessionList = this.userSessions.get(existing.userId) || []
    this.userSessions.set(
      existing.userId,
      userSessionList.filter((id) => id !== sessionId)
    )
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    await this.sessionRepo.updateTitle(sessionId, title)

    const sessionData = this.sessions.get(sessionId)
    if (sessionData) {
      sessionData.session.title = title
    }
  }

  async updateSession(sessionId: string, updates: { title?: string; model?: string; isPinned?: boolean }): Promise<Session | null> {
    const session = await this.sessionRepo.update(sessionId, updates)

    if (session) {
      const sessionData = this.sessions.get(sessionId)
      if (sessionData) {
        sessionData.session = session
      }
    }

    return session
  }

  /**
   * 比较两个内容是否相等（处理字符串和数组两种情况）
   */
  private isContentEqual(content1: string | any[], content2: string | any[]): boolean {
    if (typeof content1 === 'string' && typeof content2 === 'string') {
      return content1 === content2
    }
    // 如果一个是字符串，一个是数组，肯定不相等
    if (typeof content1 !== typeof content2) {
      return false
    }
    // 两个都是数组，比较 JSON 字符串
    return JSON.stringify(content1) === JSON.stringify(content2)
  }

  async saveSession(sessionId: string): Promise<void> {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData || !sessionData.dirty) return

    const startTime = Date.now()
    let newMessagesCount = 0
    let updatedMessagesCount = 0
    let newToolCallsCount = 0
    let updatedToolCallsCount = 0

    await this.sessionRepo.touch(sessionId)

    // 1. 获取数据库中已有的消息
    const existingMessages = await this.messageRepo.findBySessionId(sessionId)
    const existingMessageMap = new Map(existingMessages.map(m => [m.id, m]))

    // 2. 处理所有消息
    for (const msg of sessionData.messages) {
      if (!existingMessageMap.has(msg.id)) {
        // 新增消息
        await this.messageRepo.createWithId(msg.id, sessionId, msg.role, msg.content)
        newMessagesCount++
      } else {
        // 检查内容是否有变化
        const existingMsg = existingMessageMap.get(msg.id)!
        if (!this.isContentEqual(existingMsg.content, msg.content)) {
          await this.messageRepo.updateContent(msg.id, msg.content)
          updatedMessagesCount++
        }
      }
    }

    // 3. 获取数据库中已有的工具调用
    const existingToolCalls = await this.toolCallRepo.findBySessionId(sessionId)
    const existingToolCallMap = new Map(existingToolCalls.map(t => [t.id, t]))

    // 4. 处理所有工具调用
    for (const toolCall of sessionData.toolCalls) {
      let effectiveStatus = toolCall.status
      if (toolCall.toolOutput !== null && toolCall.toolOutput !== undefined) {
        if (effectiveStatus === 'pending' || effectiveStatus === 'executing') {
          const output = toolCall.toolOutput as Record<string, unknown>
          effectiveStatus = output?.error ? 'error' : 'completed'
          console.warn(
            `[SessionManager] Tool call ${toolCall.id} has output but status was '${toolCall.status}', ` +
            `correcting to '${effectiveStatus}'`)
        }
      }

      if (!existingToolCallMap.has(toolCall.id)) {
        await this.toolCallRepo.createWithId(
          toolCall.id,
          toolCall.messageId,
          sessionId,
          toolCall.toolName,
          toolCall.toolInput,
          effectiveStatus,
          toolCall.toolOutput
        )
        newToolCallsCount++
      } else {
        const existingTc = existingToolCallMap.get(toolCall.id)!
        const statusChanged = existingTc.status !== effectiveStatus
        const outputChanged = JSON.stringify(existingTc.toolOutput) !== JSON.stringify(toolCall.toolOutput)
        
        if (statusChanged || outputChanged) {
          await this.toolCallRepo.updateOutput(toolCall.id, toolCall.toolOutput || {}, effectiveStatus)
          updatedToolCallsCount++
        }
      }
    }

    sessionData.dirty = false
    const duration = Date.now() - startTime
    console.log(
      `[SessionManager] Session ${sessionId} saved in ${duration}ms: ` +
      `messages +${newMessagesCount}/~${updatedMessagesCount}, ` +
      `toolCalls +${newToolCallsCount}/~${updatedToolCallsCount}`
    )
  }

  async clearSession(sessionId: string): Promise<void> {
    await imageStorageService.deleteImagesBySession(sessionId).catch(err => {
      console.warn('[SessionManager] 清理会话图片失败:', err)
    })
    await this.messageRepo.deleteBySessionId(sessionId)
    await this.toolCallRepo.deleteBySessionId(sessionId)

    const sessionData = this.sessions.get(sessionId)
    if (sessionData) {
      sessionData.messages = []
      sessionData.toolCalls = []
      sessionData.dirty = true
    }
  }

  /**
   * 从指定用户消息起截断会话（含该条及之后全部消息），并同步删除库内记录与关联 tool_calls。
   * 用于 IDE/聊天时间线回滚。
   */
  async rollbackToUserMessage(
    sessionId: string,
    userId: string,
    anchorMessageId: string,
  ): Promise<InMemorySession> {
    const sessionRow = await this.sessionRepo.findById(sessionId)
    if (!sessionRow) {
      throw new Error('Session not found')
    }
    if (sessionRow.userId !== userId) {
      throw new Error('Forbidden: cannot rollback another user\'s session')
    }

    let sessionData = this.sessions.get(sessionId)
    if (!sessionData || sessionData.needsHydration) {
      const loaded = await this.loadSession(sessionId)
      if (!loaded) {
        throw new Error('Session not found')
      }
      sessionData = loaded
    }

    const msgs = sessionData.messages
    const anchorIndex = msgs.findIndex((m) => m.id === anchorMessageId)
    if (anchorIndex < 0) {
      throw new Error('Message not found in session')
    }
    const anchor = msgs[anchorIndex]
    if (anchor.role !== 'user') {
      throw new Error('Rollback anchor must be a user message')
    }
    const content = anchor.content
    if (Array.isArray(content) && content.some((b: any) => b && b.type === 'tool_result')) {
      throw new Error('Cannot use tool-result message as rollback anchor')
    }

    const removed = msgs.slice(anchorIndex)
    const removedIds = removed.map((m) => m.id)
    const assistantRemovedIds = removed.filter((m) => m.role === 'assistant').map((m) => m.id)

    await this.messageRepo.deleteByIdsForSession(sessionId, removedIds)
    await this.toolCallRepo.deleteByMessageIds(assistantRemovedIds)

    sessionData.messages = msgs.slice(0, anchorIndex)
    const keptIds = new Set(sessionData.messages.map((m) => m.id))
    sessionData.toolCalls = sessionData.toolCalls.filter((tc) => keptIds.has(tc.messageId))
    sessionData.dirty = false

    return sessionData
  }

  /**
   * 保存会话到数据库（带防抖）
   * 避免频繁保存导致重复日志和数据库压力
   */
  private scheduleSave(sessionId: string): void {
    // 清除已有的定时器
    const existingTimer = this.saveDebounceTimers.get(sessionId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // 设置新的防抖定时器（500ms）
    const timer = setTimeout(() => {
      this.saveDebounceTimers.delete(sessionId)
      this.saveSession(sessionId).catch(error => {
        console.error(`[SessionManager] Failed to save session ${sessionId}:`, error)
      })
    }, 500)

    this.saveDebounceTimers.set(sessionId, timer)
  }

  /**
   * 强制立即保存会话（不等待 debounce）
   * 用于确保关键操作（如切换会话、发送消息后立即断开）不丢失数据
   */
  async forceSaveSession(sessionId: string): Promise<void> {
    const existingTimer = this.saveDebounceTimers.get(sessionId)
    if (existingTimer) {
      clearTimeout(existingTimer)
      this.saveDebounceTimers.delete(sessionId)
    }
    await this.saveSession(sessionId)
  }

  /**
   * 搜索消息
   * @param userId 用户 ID
   * @param options 搜索选项
   * @returns 搜索到的消息列表，包含所属会话信息
   */
  async searchMessages(
    userId: string,
    options: {
      keyword?: string
      sessionId?: string
      startDate?: string
      endDate?: string
      limit?: number
      offset?: number
    }
  ): Promise<{ message: Message; sessionTitle: string; total: number }[]> {
    return this.messageRepo.searchMessages(userId, options)
  }

  async saveAllDirtySessions(): Promise<void> {
    const dirtySessionIds = Array.from(this.sessions.entries())
      .filter(([_, data]) => data.dirty)
      .map(([id, _]) => id)

    console.log(`[SessionManager] Saving ${dirtySessionIds.length} dirty sessions on shutdown`)

    // 依次保存所有脏会话，使用强制保存
    for (const sessionId of dirtySessionIds) {
      try {
        await this.forceSaveSession(sessionId)
        console.log(`[SessionManager] Successfully saved session ${sessionId}`)
      } catch (error) {
        console.error(`[SessionManager] Failed to save session ${sessionId}:`, error)
      }
    }
  }

  /**
   * 为 Agent 执行准备上下文
   * 
   * Master 专用方法，用于构建 Agent 执行所需的上下文
   */
  async prepareAgentContext(sessionId: string, userId: string): Promise<{
    sessionId: string
    userId: string
    messages: Message[]
    tools: any[]
    quota: any
    systemPrompt: string
  } | null> {
    const session = await this.sessionRepo.findById(sessionId)
    if (!session || session.userId !== userId) {
      console.error(`[SessionManager] Session not found or access denied: ${sessionId}`)
      return null
    }

    // 获取消息
    const messages = await this.messageRepo.findBySessionId(sessionId)
    const visibleMessages = this.filterVisibleMessages(messages)

    // 获取工具调用
    const toolCalls = await this.toolCallRepo.findBySessionId(sessionId)

    // 获取用户配额
    let quota = {}
    try {
      const { getQuotaService } = await import('../security/quotaService')
      const quotaService = getQuotaService()
      quota = await quotaService.getUserQuota(userId)
    } catch (error) {
      console.warn('[SessionManager] 获取用户配额失败:', error)
    }

    // 获取可用工具
    const { getAgentTools } = await import('../tools')
    const tools = getAgentTools()

    // 构建系统提示词 - 复用项目已有的提示词系统
    const systemPrompt = await this.buildSystemPromptWithTools(quota, tools)

    return {
      sessionId,
      userId,
      messages: visibleMessages,
      tools,
      quota,
      systemPrompt,
    }
  }

  /**
   * 保存 Agent 执行结果
   * 
   * Master 专用方法，用于保存 Agent 执行的结果
   */
  async saveAgentResult(
    sessionId: string,
    userMessage: Message,
    assistantMessage: Message,
    toolCalls: ToolCall[]
  ): Promise<void> {
    // 确保会话在缓存中
    let sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      sessionData = await this.loadSession(sessionId)
      if (!sessionData) {
        throw new Error('Session not found')
      }
    }

    // 添加用户消息
    this.addMessage(
      sessionId,
      'user',
      userMessage.content,
      undefined,
      userMessage.id
    )

    // 添加助手消息
    this.addMessage(
      sessionId,
      'assistant',
      assistantMessage.content,
      undefined,
      assistantMessage.id
    )

    // 添加工具调用
    for (const toolCall of toolCalls) {
      this.addToolCall(sessionId, toolCall)
    }

    // 强制保存
    await this.forceSaveSession(sessionId)

    console.log(`[SessionManager] 保存执行结果: session=${sessionId}, messages=2, toolCalls=${toolCalls.length}`)
  }

  /**
   * 构建系统提示词 - 复用项目已有的完整提示词系统
   *
   * 功能：
   * - 使用 buildCompleteSystemPrompt 构建完整的系统提示词
   * - 注入可用工具列表和网络搜索指导
   * - 确保 AI 知道可以使用 WebSearch、WebFetch、HttpRequest 等工具
   *
   * @param quota 用户配额
   * @param tools 可用工具列表
   * @returns 完整的系统提示词字符串
   */
  private async buildSystemPromptWithTools(quota: any, tools: any[]): Promise<string> {
    try {
      // 收集已启用的工具名称
      const enabledTools = new Set<string>()
      for (const tool of tools) {
        if (tool && tool.name) {
          enabledTools.add(tool.name)
        }
      }

      // 使用项目已有的 buildCompleteSystemPrompt 构建完整提示词
      const promptSections = await buildCompleteSystemPrompt({
        enabledTools,
        injectRules: true,
      })

      // 添加工具使用指导
      const toolGuidance = this.buildToolGuidance(tools)

      // 添加网络搜索专用指导
      const webSearchGuidance = this.buildWebSearchGuidance()

      // 组装最终提示词
      const finalPrompt = [
        ...promptSections,
        toolGuidance,
        webSearchGuidance,
      ].join('\n\n')

      return finalPrompt
    } catch (error) {
      console.error('[SessionManager] 构建系统提示词失败:', error)
      // 降级到简单提示词
      return this.buildFallbackSystemPrompt(tools)
    }
  }

  /**
   * 构建工具使用指导
   *
   * @param tools 可用工具列表
   * @returns 工具使用指导文本
   */
  private buildToolGuidance(tools: any[]): string {
    const toolList = tools
      .filter((t) => t && t.name && t.description)
      .map((t) => `- **${t.name}**: ${t.description}`)
      .join('\n')

    return `## 可用工具

${toolList || '暂无可用工具'}

请根据用户的需求，合理使用工具来完成任务。`
  }

  /**
   * 构建网络搜索专用指导
   *
   * @returns 网络搜索指导文本
   */
  private buildWebSearchGuidance(): string {
    return `## 网络搜索工具（重要）

你拥有以下网络搜索工具，可以实时访问互联网获取最新信息：

- **WebSearch**: 使用 DuckDuckGo 搜索引擎搜索网络内容
- **WebFetch**: 获取指定网页的详细内容
- **HttpRequest**: 发送自定义 HTTP 请求

**重要提示**：
- 当用户询问需要实时信息、最新数据、新闻、天气、股价等内容时，**必须**使用 WebSearch 工具
- 不要说你无法访问互联网或你的知识已过时 — 你拥有 WebSearch 工具可以实时搜索
- 搜索后请在回复末尾包含 "Sources:" 部分，列出使用的搜索结果 URL
- 使用当前年份确保搜索结果的时效性

${getWebSearchPrompt()}`
  }

  /**
   * 降级系统提示词（当完整提示词构建失败时使用）
   *
   * @param tools 可用工具列表
   * @returns 简单的系统提示词
   */
  private buildFallbackSystemPrompt(tools: any[]): string {
    const toolList = tools
      .filter((t) => t && t.name)
      .map((t) => `- ${t.name}: ${t.description || ''}`)
      .join('\n')

    return `你是一个智能助手，可以帮助用户完成各种任务。

当前可用工具：
${toolList}

**网络搜索**：当需要实时信息时，请使用 WebSearch 工具搜索网络内容。

请根据用户的需求，合理使用工具来完成任务。`
  }
}

/**
 * 获取会话管理器单例实例
 */
export function getSessionManager(): SessionManager {
  return SessionManager.getInstance()
}
