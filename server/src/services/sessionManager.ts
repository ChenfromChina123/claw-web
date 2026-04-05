import { v4 as uuidv4 } from 'uuid'
import { UserRepository } from '../db/repositories/userRepository'
import { SessionRepository } from '../db/repositories/sessionRepository'
import { MessageRepository } from '../db/repositories/messageRepository'
import { ToolCallRepository } from '../db/repositories/toolCallRepository'
import type { Session, Message, ConversationMessage, ToolCall } from '../models/types'

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
   * @returns 创建的会话对象
   */
  async createSession(userId: string, title?: string, model?: string, force?: boolean): Promise<Session> {
    if (!force) {
      const emptySession = await this.sessionRepo.findEmptySessionByUserId(userId)
      if (emptySession) {
        console.log(`[SessionManager] User ${userId} has empty session, returning it instead of creating new one`)
        return emptySession
      }
    }

    const session = await this.sessionRepo.create(userId, title || '新对话', model || 'qwen-plus')

    this.sessions.set(session.id, {
      session,
      messages: [],
      toolCalls: [],
      dirty: true,
    })

    const userSessionList = this.userSessions.get(userId) || []
    userSessionList.unshift(session.id)
    this.userSessions.set(userId, userSessionList)

    return session
  }

  async loadSession(sessionId: string): Promise<InMemorySession | null> {
    const cached = this.sessions.get(sessionId)
    if (cached) {
      // getUserSessions 会先把会话放进缓存且 messages=[]、dirty=false，若直接 return 会永远读不到库里的历史消息
      if (!cached.dirty && (cached.messages.length === 0 && cached.toolCalls.length === 0 || cached.needsHydration)) {
        await this.hydrateSessionFromDb(sessionId, cached)
      }
      return cached
    }

    const session = await this.sessionRepo.findById(sessionId)
    if (!session) return null

    const dbMessages = await this.messageRepo.findBySessionId(sessionId)
    const dbToolCalls = await this.toolCallRepo.findBySessionId(sessionId)

    // 标准化 createdAt 为 ISO 字符串格式，确保与前端兼容
    const messages: Message[] = dbMessages.map(msg => {
      const normalized: Message = {
        id: msg.id,
        sessionId: msg.sessionId,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
        toolCalls: msg.toolCalls,
      }
      return normalized
    })

    const sessionData: InMemorySession = {
      session,
      messages,
      toolCalls: dbToolCalls,
      dirty: false,
    }

    this.sessions.set(sessionId, sessionData)

    const userSessionList = this.userSessions.get(session.userId) || []
    if (!userSessionList.includes(sessionId)) {
      userSessionList.unshift(sessionId)
      this.userSessions.set(session.userId, userSessionList)
    }

    // 添加数据完整性日志
    console.log(`[SessionManager] Loaded session ${sessionId}:`, {
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
      // 标准化 createdAt 为 ISO 字符串格式，确保与前端兼容
      cached.messages = dbMessages.map(msg => {
        const normalized: Message = {
          id: msg.id,
          sessionId: msg.sessionId,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
          toolCalls: msg.toolCalls,
        }
        return normalized
      })
      console.log(`[SessionManager] Hydrated ${dbMessages.length} messages for session ${sessionId}`)
    }
    const dbToolCalls = await this.toolCallRepo.findBySessionId(sessionId)
    if (dbToolCalls.length > 0) {
      cached.toolCalls = dbToolCalls
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

  addMessage(sessionId: string, role: 'user' | 'assistant', content: string | any[], toolCalls?: ToolCall[], externalId?: string): Message | null {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      console.error(`Session ${sessionId} not found in memory`)
      return null
    }

    // 如果提供了外部ID（来自前端），使用它；否则生成新的UUID
    const messageId = externalId || uuidv4()
    const message: Message = { id: messageId, sessionId, role, content, createdAt: new Date() }
    if (role === 'assistant' && toolCalls && toolCalls.length > 0) {
      message.toolCalls = toolCalls
    }
    sessionData.messages.push(message)
    sessionData.dirty = true

    this.scheduleSave(sessionId)
    
    return message
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
  updateMessage(sessionId: string, messageId: string, content: string | any[], toolCalls?: ToolCall[]): Message | null {
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

  async saveSession(sessionId: string): Promise<void> {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData || !sessionData.dirty) return

    console.log(`Saving session ${sessionId}, messages count: ${sessionData.messages.length}, toolCalls count: ${sessionData.toolCalls.length}`)

    await this.sessionRepo.touch(sessionId)

    // 策略：追加形式保存，保持原始ID
    console.log(`[SessionManager] Appending data for session ${sessionId}...`)

    // 1. 获取数据库中已有的消息ID
    const existingMessages = await this.messageRepo.findBySessionId(sessionId)
    const existingMessageIds = new Set(existingMessages.map(m => m.id))
    console.log(`[SessionManager] Existing message IDs in DB: ${Array.from(existingMessageIds).join(', ')}`)

    // 2. 保存新增的消息（保持原始ID）
    for (const msg of sessionData.messages) {
      if (!existingMessageIds.has(msg.id)) {
        console.log(`[SessionManager] Saving new message: ${msg.id}, role=${msg.role}`)
        await this.messageRepo.createWithId(msg.id, sessionId, msg.role, msg.content)
      } else {
        console.log(`[SessionManager] Message already exists: ${msg.id}, skipping`)
      }
    }

    // 3. 获取数据库中已有的工具调用ID
    const existingToolCalls = await this.toolCallRepo.findBySessionId(sessionId)
    const existingToolCallIds = new Set(existingToolCalls.map(t => t.id))
    console.log(`[SessionManager] Existing tool call IDs in DB: ${Array.from(existingToolCallIds).join(', ')}`)

    // 4. 保存新增的工具调用（保持原始ID）
    for (const toolCall of sessionData.toolCalls) {
      if (!existingToolCallIds.has(toolCall.id)) {
        console.log(`[SessionManager] Saving new tool call: ${toolCall.id}, toolName=${toolCall.toolName}`)
        await this.toolCallRepo.createWithId(
          toolCall.id,
          toolCall.messageId,
          sessionId,
          toolCall.toolName,
          toolCall.toolInput,
          toolCall.status,
          toolCall.toolOutput
        )
      } else {
        console.log(`[SessionManager] Tool call already exists: ${toolCall.id}, skipping`)
      }
    }

    sessionData.dirty = false
    console.log(`[SessionManager] Session ${sessionId} saved successfully!`)
  }

  async clearSession(sessionId: string): Promise<void> {
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
   * 调度保存会话
   * 注意：延迟设置为 500ms，避免频繁写入同时确保数据不会丢失过多
   * 如果需要立即保存，请直接调用 saveSession()
   */
  private scheduleSave(sessionId: string): void {
    const existingTimer = this.saveDebounceTimers.get(sessionId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(async () => {
      this.saveDebounceTimers.delete(sessionId)
      await this.saveSession(sessionId)
    }, 500)  // 从 2000ms 缩短到 500ms

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
}
