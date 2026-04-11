/**
 * 会话管理桥接 - 增强现有的 sessionManager
 * 
 * 这个模块扩展了会话管理功能，包括：
 * - 多会话支持
 * - 会话历史
 * - 会话导出
 * - 会话分享
 */

import { v4 as uuidv4 } from 'uuid'

// 会话配置
export interface SessionConfig {
  model: string
  temperature: number
  maxTokens: number
  systemPrompt?: string
}

// 会话元数据
export interface SessionMetadata {
  id: string
  title: string
  userId: string
  model: string
  createdAt: Date
  updatedAt: Date
  messageCount: number
  tokenUsage: {
    input: number
    output: number
  }
}

// WebSocket 事件发送函数类型
export type EventSender = (event: string, data: unknown) => void

/**
 * Web 会话管理器 - 桥接会话系统
 */
export class WebSessionBridge {
  private projectRoot: string
  private sessions: Map<string, SessionMetadata> = new Map()
  
  constructor() {
    this.projectRoot = this.getProjectRoot()
  }
  
  private getProjectRoot(): string {
    const currentDir = process.cwd()
    return currentDir.replace(/\\server\\src$/i, '').replace(/\/server\/src$/, '')
  }
  
  /**
   * 创建新会话
   */
  createSession(userId: string, title?: string, model?: string): SessionMetadata {
    const session: SessionMetadata = {
      id: uuidv4(),
      title: title || '新对话',
      userId,
      model: model || 'qwen-plus',
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 0,
      tokenUsage: { input: 0, output: 0 },
    }
    
    this.sessions.set(session.id, session)
    return session
  }
  
  /**
   * 获取会话
   */
  getSession(sessionId: string): SessionMetadata | undefined {
    return this.sessions.get(sessionId)
  }
  
  /**
   * 获取用户的所有会话
   */
  getUserSessions(userId: string): SessionMetadata[] {
    return Array.from(this.sessions.values())
      .filter(s => s.userId === userId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  }
  
  /**
   * 更新会话
   */
  updateSession(sessionId: string, updates: Partial<SessionMetadata>): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      Object.assign(session, updates, { updatedAt: new Date() })
    }
  }
  
  /**
   * 删除会话
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId)
  }
  
  /**
   * 更新 Token 使用量
   */
  updateTokenUsage(sessionId: string, inputTokens: number, outputTokens: number): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.tokenUsage.input += inputTokens
      session.tokenUsage.output += outputTokens
      session.messageCount++
      session.updatedAt = new Date()
    }
  }
  
  /**
   * 导出会话为指定格式
   */
  exportSession(
    sessionId: string, 
    messages: Array<{ role: string; content: string; createdAt?: Date }>,
    format: 'json' | 'markdown' | 'text'
  ): string {
    const session = this.sessions.get(sessionId)
    
    if (!session) {
      throw new Error('Session not found')
    }
    
    switch (format) {
      case 'json':
        return JSON.stringify({
          session,
          messages,
        }, null, 2)
        
      case 'markdown':
        let md = `# ${session.title}\n\n`
        md += `**创建时间**: ${session.createdAt.toISOString()}\n`
        md += `**模型**: ${session.model}\n\n`
        md += `---\n\n`
        for (const msg of messages) {
          const role = msg.role === 'user' ? '**用户**' : '**助手**'
          md += `## ${role}\n\n${msg.content}\n\n`
        }
        return md
        
      case 'text':
        let txt = `${session.title}\n${'='.repeat(session.title.length)}\n\n`
        for (const msg of messages) {
          txt += `[${msg.role.toUpperCase()}]\n${msg.content}\n\n`
        }
        return txt
        
      default:
        throw new Error(`Unknown format: ${format}`)
    }
  }
  
  /**
   * 获取会话统计
   */
  getSessionStats(sessionId: string): {
    messageCount: number
    totalTokens: number
    estimatedCost: number
  } | null {
    const session = this.sessions.get(sessionId)
    
    if (!session) {
      return null
    }
    
    const totalTokens = session.tokenUsage.input + session.tokenUsage.output
    // 估算成本 (假设每 1M tokens $1)
    const estimatedCost = (totalTokens / 1_000_000) * 1
    
    return {
      messageCount: session.messageCount,
      totalTokens,
      estimatedCost,
    }
  }
  
  /**
   * 清理旧会话
   */
  cleanupOldSessions(daysOld: number = 30): number {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysOld)
    
    let deleted = 0
    for (const [id, session] of this.sessions) {
      if (session.updatedAt < cutoff) {
        this.sessions.delete(id)
        deleted++
      }
    }
    
    return deleted
  }
}

export default WebSessionBridge
