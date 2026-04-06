import { v4 as uuidv4 } from 'uuid'
import { UserRepository } from '../db/repositories/userRepository'
import { SessionRepository } from '../db/repositories/sessionRepository'
import { MessageRepository } from '../db/repositories/messageRepository'
import { ToolCallRepository } from '../db/repositories/toolCallRepository'
import type { Session, Message, ConversationMessage, ToolCall } from '../models/types'
import { generateSessionTitleWithLLM, isFirstMessage, generateSimpleTitle } from './sessionTitleGenerator'

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

  /** 定时同步间隔定时器（每5分钟同步一次脏会话） */
  private syncIntervalTimer: NodeJS.Timeout | null = null
  
  /** 每日同步定时器（每天凌晨3点同步所有会话） */
  private dailySyncTimer: NodeJS.Timeout | null = null

  /** 同步间隔时间（毫秒）- 默认5分钟 */
  private readonly SYNC_INTERVAL_MS = 5 * 60 * 1000

  /** 每日同步时间（小时）- 默认凌晨3点 */
  private readonly DAILY_SYNC_HOUR = 3

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
    
    // 如果是用户消息且当前标题还是默认的"新对话"，就并行生成会话标题
    console.log(`[SessionManager] addMessage: role=${role}, session.title="${sessionData.session.title}", sessionId=${sessionId}`)
    if (role === 'user') {
      if (sessionData.session.title === '新对话') {
        console.log(`[SessionManager] Detected first user message, generating title for session ${sessionId}`)
        this.generateAndUpdateSessionTitle(sessionId, content)
      } else {
        console.log(`[SessionManager] Session title is already set to "${sessionData.session.title}", skipping title generation`)
      }
    }
    
    return message
  }

  /**
   * 基于用户第一条消息生成会话标题并更新
   * @param sessionId 会话ID
   * @param userContent 用户消息内容
   */
  private async generateAndUpdateSessionTitle(sessionId: string, userContent: string | any[]): Promise<void> {
    try {
      console.log(`[SessionManager] generateAndUpdateSessionTitle called for session ${sessionId}`)
      
      // 将内容转换为字符串
      const contentString = typeof userContent === 'string' 
        ? userContent 
        : JSON.stringify(userContent)
      
      console.log(`[SessionManager] Content string: "${contentString.substring(0, 50)}..."`)
      
      // 检查当前会话状态
      const sessionData = this.sessions.get(sessionId)
      console.log(`[SessionManager] sessionData exists: ${!!sessionData}, current title: "${sessionData?.session?.title}"`)
      
      if (!sessionData || sessionData.session.title !== '新对话') {
        console.log(`[SessionManager] Skipping title update: session not found or title already set`)
        return
      }
      
      // 使用 LLM 生成标题
      console.log(`[SessionManager] Calling LLM to generate title...`)
      let title = await generateSessionTitleWithLLM(contentString)
      console.log(`[SessionManager] LLM generated title: "${title}"`)
      
      // 如果 LLM 返回了默认标题，强制使用简单规则重新生成
      if (title === '新对话') {
        console.log(`[SessionManager] LLM returned default title, falling back to simple rule`)
        title = generateSimpleTitle(contentString)
        console.log(`[SessionManager] Simple rule generated title: "${title}"`)
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
        console.log(`[SessionManager] onSessionTitleUpdated callback is not set`)
      }
    } catch (error) {
      console.error(`[SessionManager] Failed to generate/update session title:`, error)
      // 标题生成失败不影响主要功能，静默处理
    }
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

    console.log(`Saving session ${sessionId}, messages count: ${sessionData.messages.length}, toolCalls count: ${sessionData.toolCalls.length}`)

    await this.sessionRepo.touch(sessionId)

    // 策略：保存新增消息 + 更新已存在消息的内容
    console.log(`[SessionManager] Saving/updating data for session ${sessionId}...`)

    // 1. 获取数据库中已有的消息
    const existingMessages = await this.messageRepo.findBySessionId(sessionId)
    const existingMessageMap = new Map(existingMessages.map(m => [m.id, m]))
    console.log(`[SessionManager] Existing messages in DB: ${Array.from(existingMessageMap.keys()).join(', ')}`)

    // 2. 处理所有消息
    for (const msg of sessionData.messages) {
      if (!existingMessageMap.has(msg.id)) {
        // 新增消息
        console.log(`[SessionManager] Saving new message: ${msg.id}, role=${msg.role}`)
        await this.messageRepo.createWithId(msg.id, sessionId, msg.role, msg.content)
      } else {
        // 检查内容是否有变化
        const existingMsg = existingMessageMap.get(msg.id)!
        if (!this.isContentEqual(existingMsg.content, msg.content)) {
          console.log(`[SessionManager] Updating message content: ${msg.id}, role=${msg.role}`)
          await this.messageRepo.updateContent(msg.id, msg.content)
        } else {
          console.log(`[SessionManager] Message content unchanged: ${msg.id}, skipping`)
        }
      }
    }

    // 3. 获取数据库中已有的工具调用
    const existingToolCalls = await this.toolCallRepo.findBySessionId(sessionId)
    const existingToolCallMap = new Map(existingToolCalls.map(t => [t.id, t]))
    console.log(`[SessionManager] Existing tool calls in DB: ${Array.from(existingToolCallMap.keys()).join(', ')}`)

    // 4. 处理所有工具调用
    for (const toolCall of sessionData.toolCalls) {
      if (!existingToolCallMap.has(toolCall.id)) {
        // 新增工具调用
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
        // 检查是否有变化（状态或输出）
        const existingTc = existingToolCallMap.get(toolCall.id)!
        const statusChanged = existingTc.status !== toolCall.status
        const outputChanged = JSON.stringify(existingTc.toolOutput) !== JSON.stringify(toolCall.toolOutput)
        
        if (statusChanged || outputChanged) {
          console.log(`[SessionManager] Updating tool call: ${toolCall.id}, status=${toolCall.status}`)
          await this.toolCallRepo.updateOutput(toolCall.id, toolCall.toolOutput || {}, toolCall.status)
        } else {
          console.log(`[SessionManager] Tool call unchanged: ${toolCall.id}, skipping`)
        }
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

  /**
   * 启动定时同步任务
   * 包括：每5分钟同步脏会话 + 每日凌晨3点同步所有会话
   */
  startSyncScheduler(): void {
    console.log('[SessionManager] Starting sync scheduler...')
    
    // 1. 启动间隔同步（每5分钟同步脏会话）
    this.syncIntervalTimer = setInterval(async () => {
      try {
        await this.syncDirtySessions()
      } catch (error) {
        console.error('[SessionManager] Interval sync error:', error)
      }
    }, this.SYNC_INTERVAL_MS)
    
    console.log(`[SessionManager] Interval sync started: every ${this.SYNC_INTERVAL_MS / 1000 / 60} minutes`)
    
    // 2. 启动每日同步（每天凌晨3点同步所有会话）
    this.scheduleDailySync()
  }

  /**
   * 停止定时同步任务
   */
  stopSyncScheduler(): void {
    console.log('[SessionManager] Stopping sync scheduler...')
    
    if (this.syncIntervalTimer) {
      clearInterval(this.syncIntervalTimer)
      this.syncIntervalTimer = null
      console.log('[SessionManager] Interval sync stopped')
    }
    
    if (this.dailySyncTimer) {
      clearTimeout(this.dailySyncTimer)
      this.dailySyncTimer = null
      console.log('[SessionManager] Daily sync stopped')
    }
  }

  /**
   * 同步所有脏会话到数据库
   */
  private async syncDirtySessions(): Promise<void> {
    const dirtySessionIds = Array.from(this.sessions.entries())
      .filter(([_, data]) => data.dirty)
      .map(([id, _]) => id)

    if (dirtySessionIds.length === 0) {
      console.log('[SessionManager] No dirty sessions to sync')
      return
    }

    console.log(`[SessionManager] Syncing ${dirtySessionIds.length} dirty sessions...`)
    
    for (const sessionId of dirtySessionIds) {
      try {
        await this.forceSaveSession(sessionId)
        console.log(`[SessionManager] Synced session ${sessionId}`)
      } catch (error) {
        console.error(`[SessionManager] Failed to sync session ${sessionId}:`, error)
      }
    }
    
    console.log(`[SessionManager] Sync completed: ${dirtySessionIds.length} sessions processed`)
  }

  /**
   * 同步所有会话到数据库（包括非脏会话，确保数据完整性）
   */
  async syncAllSessions(): Promise<void> {
    const allSessionIds = Array.from(this.sessions.keys())
    
    console.log(`[SessionManager] Starting full sync of ${allSessionIds.length} sessions...`)
    
    let syncedCount = 0
    let errorCount = 0
    
    for (const sessionId of allSessionIds) {
      try {
        const sessionData = this.sessions.get(sessionId)
        if (sessionData && sessionData.dirty) {
          await this.forceSaveSession(sessionId)
          syncedCount++
        }
      } catch (error) {
        console.error(`[SessionManager] Failed to sync session ${sessionId}:`, error)
        errorCount++
      }
    }
    
    console.log(`[SessionManager] Full sync completed: ${syncedCount} synced, ${errorCount} errors`)
  }

  /**
   * 调度每日同步任务
   */
  private scheduleDailySync(): void {
    const now = new Date()
    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + (now.getHours() >= this.DAILY_SYNC_HOUR ? 1 : 0),
      this.DAILY_SYNC_HOUR,
      0,
      0,
      0
    )
    
    const delay = target.getTime() - now.getTime()
    
    console.log(`[SessionManager] Daily sync scheduled at ${target.toLocaleString('zh-CN')} (in ${Math.round(delay / 1000 / 60)} minutes)`)
    
    this.dailySyncTimer = setTimeout(async () => {
      try {
        console.log('[SessionManager] Starting daily sync...')
        await this.syncAllSessions()
      } catch (error) {
        console.error('[SessionManager] Daily sync error:', error)
      } finally {
        // 重新调度下一次每日同步
        this.scheduleDailySync()
      }
    }, delay)
  }

  /**
   * 获取同步状态统计
   */
  getSyncStats(): {
    totalSessions: number
    dirtySessions: number
    memoryUsage: NodeJS.MemoryUsage
    nextDailySync: Date | null
  } {
    const dirtyCount = Array.from(this.sessions.values()).filter(s => s.dirty).length
    
    let nextDailySync: Date | null = null
    if (this.dailySyncTimer) {
      const now = new Date()
      nextDailySync = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + (now.getHours() >= this.DAILY_SYNC_HOUR ? 1 : 0),
        this.DAILY_SYNC_HOUR,
        0,
        0,
        0
      )
    }
    
    return {
      totalSessions: this.sessions.size,
      dirtySessions: dirtyCount,
      memoryUsage: process.memoryUsage(),
      nextDailySync
    }
  }
}
