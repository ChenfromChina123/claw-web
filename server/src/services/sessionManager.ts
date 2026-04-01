import { UserRepository } from '../db/repositories/userRepository'
import { SessionRepository } from '../db/repositories/sessionRepository'
import { MessageRepository } from '../db/repositories/messageRepository'
import { ToolCallRepository } from '../db/repositories/toolCallRepository'
import type { Session, Message, ConversationMessage, ToolCall } from '../models/types'

interface InMemorySession {
  session: Session
  messages: ConversationMessage[]
  toolCalls: ToolCall[]
  dirty: boolean
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

  async createSession(userId: string, title?: string, model?: string): Promise<Session> {
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
      return cached
    }

    const session = await this.sessionRepo.findById(sessionId)
    if (!session) return null

    const dbMessages = await this.messageRepo.findBySessionId(sessionId)
    const dbToolCalls = await this.toolCallRepo.findBySessionId(sessionId)

    const messages: ConversationMessage[] = dbMessages.map(m => ({
      role: m.role,
      content: m.content,
    }))

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

    return sessionData
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
        })
      }
    }

    return sessions
  }

  getInMemorySession(sessionId: string): InMemorySession | undefined {
    return this.sessions.get(sessionId)
  }

  addMessage(sessionId: string, role: 'user' | 'assistant', content: string): void {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData) {
      console.error(`Session ${sessionId} not found in memory`)
      return
    }

    sessionData.messages.push({ role, content })
    sessionData.dirty = true

    this.scheduleSave(sessionId)
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

  async deleteSession(sessionId: string): Promise<void> {
    const sessionData = this.sessions.get(sessionId)
    if (sessionData) {
      await this.sessionRepo.delete(sessionId)
      this.sessions.delete(sessionId)

      const userSessionList = this.userSessions.get(sessionData.session.userId) || []
      const updatedList = userSessionList.filter(id => id !== sessionId)
      this.userSessions.set(sessionData.session.userId, updatedList)
    }
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    await this.sessionRepo.updateTitle(sessionId, title)

    const sessionData = this.sessions.get(sessionId)
    if (sessionData) {
      sessionData.session.title = title
    }
  }

  async saveSession(sessionId: string): Promise<void> {
    const sessionData = this.sessions.get(sessionId)
    if (!sessionData || !sessionData.dirty) return

    console.log(`Saving session ${sessionId}, messages count: ${sessionData.messages.length}`)

    await this.sessionRepo.touch(sessionId)

    const existingMessages = await this.messageRepo.findBySessionId(sessionId)
    const existingMessageCount = existingMessages.length

    if (sessionData.messages.length > existingMessageCount) {
      const newMessages = sessionData.messages.slice(existingMessageCount)
      for (const msg of newMessages) {
        await this.messageRepo.create(sessionId, msg.role, msg.content)
      }
    }

    for (const toolCall of sessionData.toolCalls) {
      if (!toolCall.id || !toolCall.messageId) continue

      const existingToolCalls = await this.toolCallRepo.findByMessageId(toolCall.messageId)
      const exists = existingToolCalls.some(tc => tc.id === toolCall.id)
      if (!exists) {
        await this.toolCallRepo.create(
          toolCall.messageId,
          sessionId,
          toolCall.toolName,
          toolCall.toolInput,
          toolCall.status
        )
        if (toolCall.toolOutput) {
          await this.toolCallRepo.updateOutput(toolCall.id, toolCall.toolOutput, toolCall.status as 'completed' | 'error')
        }
      }
    }

    sessionData.dirty = false
    console.log(`Session ${sessionId} saved successfully`)
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

  private scheduleSave(sessionId: string): void {
    const existingTimer = this.saveDebounceTimers.get(sessionId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(async () => {
      this.saveDebounceTimers.delete(sessionId)
      await this.saveSession(sessionId)
    }, 2000)

    this.saveDebounceTimers.set(sessionId, timer)
  }

  async saveAllDirtySessions(): Promise<void> {
    const dirtySessionIds = Array.from(this.sessions.entries())
      .filter(([_, data]) => data.dirty)
      .map(([id, _]) => id)

    console.log(`Saving ${dirtySessionIds.length} dirty sessions`)

    for (const sessionId of dirtySessionIds) {
      await this.saveSession(sessionId)
    }
  }
}
