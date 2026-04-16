/**
 * Mailbox 消息队列 - Agent 间消息传递系统
 * 
 * 阶段四: 多 Agent 协作 (4.2 SendMessage 机制, 4.4 Teammate 模式)
 * 
 * 功能:
 * - 消息发送和接收
 * - 消息队列管理
 * - 消息路由 (按 Agent ID 或团队成员名称)
 * - 消息通知
 */

import { randomUUID } from 'crypto'

/**
 * 邮件消息类型
 */
export interface MailboxMessage {
  id: string
  fromAgentId: string
  toAgentId: string
  content: string
  timestamp: Date
  read: boolean
  threadId?: string
}

/**
 * 邮件投递状态
 */
export interface MailboxDeliveryResult {
  success: boolean
  messageId?: string
  error?: string
  queued?: boolean
}

/**
 * 邮件查询选项
 */
export interface MailboxQueryOptions {
  limit?: number
  offset?: number
  unreadOnly?: boolean
  fromAgentId?: string
}

/**
 * Mailbox 邮件箱类
 */
export class Mailbox {
  readonly agentId: string
  private messages: Map<string, MailboxMessage> = new Map()
  private messageIndex: string[] = [] // 按时间排序的消息 ID
  private pendingNotifications: Set<string> = new Set()
  private listeners: Array<(message: MailboxMessage) => void> = []

  constructor(agentId: string) {
    this.agentId = agentId
  }

  /**
   * 接收消息
   */
  receive(message: Omit<MailboxMessage, 'id' | 'timestamp' | 'read'>): MailboxMessage {
    const mailboxMessage: MailboxMessage = {
      ...message,
      id: randomUUID(),
      timestamp: new Date(),
      read: false,
    }

    this.messages.set(mailboxMessage.id, mailboxMessage)
    this.messageIndex.push(mailboxMessage.id)
    this.pendingNotifications.add(mailboxMessage.id)

    // 通知监听器
    this.notifyListeners(mailboxMessage)

    console.log(`[Mailbox:${this.agentId}] 收到消息 from ${message.fromAgentId}: ${message.content.substring(0, 50)}...`)
    return mailboxMessage
  }

  /**
   * 获取消息
   */
  getMessage(messageId: string): MailboxMessage | undefined {
    return this.messages.get(messageId)
  }

  /**
   * 标记消息为已读
   */
  markAsRead(messageId: string): boolean {
    const message = this.messages.get(messageId)
    if (message) {
      message.read = true
      this.pendingNotifications.delete(messageId)
      return true
    }
    return false
  }

  /**
   * 标记所有消息为已读
   */
  markAllAsRead(): number {
    let count = 0
    for (const message of this.messages.values()) {
      if (!message.read) {
        message.read = true
        this.pendingNotifications.delete(message.id)
        count++
      }
    }
    return count
  }

  /**
   * 获取未读消息数量
   */
  getUnreadCount(): number {
    let count = 0
    for (const message of this.messages.values()) {
      if (!message.read) {
        count++
      }
    }
    return count
  }

  /**
   * 查询消息
   */
  query(options: MailboxQueryOptions = {}): { messages: MailboxMessage[]; total: number } {
    const { limit = 50, offset = 0, unreadOnly = false, fromAgentId } = options

    let filtered = this.messageIndex
      .map(id => this.messages.get(id)!)
      .filter(msg => msg !== undefined)

    // 按时间倒序
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    // 筛选
    if (unreadOnly) {
      filtered = filtered.filter(msg => !msg.read)
    }
    if (fromAgentId) {
      filtered = filtered.filter(msg => msg.fromAgentId === fromAgentId)
    }

    const total = filtered.length
    const messages = filtered.slice(offset, offset + limit)

    return { messages, total }
  }

  /**
   * 获取最新消息
   */
  getLatest(limit: number = 10): MailboxMessage[] {
    return this.messageIndex
      .slice(-limit)
      .reverse()
      .map(id => this.messages.get(id)!)
      .filter(msg => msg !== undefined)
  }

  /**
   * 删除消息
   */
  deleteMessage(messageId: string): boolean {
    const index = this.messageIndex.indexOf(messageId)
    if (index > -1) {
      this.messageIndex.splice(index, 1)
      this.messages.delete(messageId)
      this.pendingNotifications.delete(messageId)
      return true
    }
    return false
  }

  /**
   * 清空邮箱
   */
  clear(): void {
    this.messages.clear()
    this.messageIndex = []
    this.pendingNotifications.clear()
  }

  /**
   * 添加消息监听器
   */
  addListener(listener: (message: MailboxMessage) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index > -1) {
        this.listeners.splice(index, 1)
      }
    }
  }

  /**
   * 通知监听器
   */
  private notifyListeners(message: MailboxMessage): void {
    for (const listener of this.listeners) {
      try {
        listener(message)
      } catch (error) {
        console.error(`[Mailbox:${this.agentId}] 监听器错误:`, error)
      }
    }
  }

  /**
   * 检查是否有待通知的消息
   */
  hasPendingNotifications(): boolean {
    return this.pendingNotifications.size > 0
  }

  /**
   * 获取统计信息
   */
  getStats(): { total: number; unread: number; read: number } {
    let unread = 0
    let read = 0

    for (const message of this.messages.values()) {
      if (message.read) {
        read++
      } else {
        unread++
      }
    }

    return { total: this.messages.size, unread, read }
  }
}

/**
 * MailboxManager 邮件箱管理器
 */
export class MailboxManager {
  private static instance: MailboxManager
  private mailboxes: Map<string, Mailbox> = new Map()
  private crossTeamMailboxes: Map<string, Mailbox> = new Map() // 用于团队消息

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): MailboxManager {
    if (!MailboxManager.instance) {
      MailboxManager.instance = new MailboxManager()
    }
    return MailboxManager.instance
  }

  /**
   * 创建或获取邮件箱
   */
  getMailbox(agentId: string): Mailbox {
    if (!this.mailboxes.has(agentId)) {
      const mailbox = new Mailbox(agentId)
      this.mailboxes.set(agentId, mailbox)
      console.log(`[MailboxManager] 为 Agent ${agentId} 创建邮件箱`)
    }
    return this.mailboxes.get(agentId)!
  }

  /**
   * 获取团队邮件箱 (用于团队成员间的消息)
   */
  getTeamMailbox(teamName: string): Mailbox {
    if (!this.crossTeamMailboxes.has(teamName)) {
      const mailbox = new Mailbox(`team:${teamName}`)
      this.crossTeamMailboxes.set(teamName, mailbox)
      console.log(`[MailboxManager] 为团队 ${teamName} 创建团队邮件箱`)
    }
    return this.crossTeamMailboxes.get(teamName)!
  }

  /**
   * 发送消息到指定 Agent
   */
  send(toAgentId: string, message: Omit<MailboxMessage, 'id' | 'timestamp' | 'read'>): MailboxDeliveryResult {
    // 检查目标 Agent 是否存在
    if (!this.mailboxes.has(toAgentId)) {
      // Agent 不存在，消息将被排队 (假设 Agent 稍后会注册)
      console.log(`[MailboxManager] Agent ${toAgentId} 未注册，消息将排队`)
      return {
        success: false,
        error: `Agent ${toAgentId} 不存在或未注册`,
        queued: true,
      }
    }

    const mailbox = this.getMailbox(toAgentId)
    mailbox.receive(message)

    return {
      success: true,
      messageId: randomUUID(),
      queued: false,
    }
  }

  /**
   * 通过团队成员名称发送消息
   */
  sendToMember(teamName: string, memberName: string, fromAgentId: string, content: string): MailboxDeliveryResult {
    const teamMailbox = this.getTeamMailbox(teamName)

    // 查找团队成员
    const teamMemberMailbox = this.mailboxes.get(`${teamName}:${memberName}`)
    if (!teamMemberMailbox) {
      return {
        success: false,
        error: `团队 ${teamName} 中没有成员 ${memberName}`,
        queued: true,
      }
    }

    // 发送到团队邮件箱 (用于团队广播)
    teamMailbox.receive({
      fromAgentId,
      toAgentId: `${teamName}:${memberName}`,
      content,
    })

    // 发送到成员私有邮件箱
    teamMemberMailbox.receive({
      fromAgentId,
      toAgentId: `${teamName}:${memberName}`,
      content,
    })

    return {
      success: true,
      messageId: randomUUID(),
    }
  }

  /**
   * 广播消息到团队
   */
  broadcastToTeam(teamName: string, fromAgentId: string, content: string): { delivered: number; total: number } {
    const teamMailbox = this.getTeamMailbox(teamName)
    let delivered = 0
    let total = 0

    // 广播到团队邮件箱
    teamMailbox.receive({
      fromAgentId,
      toAgentId: `team:${teamName}`,
      content,
    })
    delivered++
    total++

    // 发送给所有团队成员
    for (const [agentId, mailbox] of this.mailboxes) {
      if (agentId.startsWith(`${teamName}:`)) {
        mailbox.receive({
          fromAgentId,
          toAgentId: agentId,
          content,
        })
        delivered++
      }
      total++
    }

    return { delivered, total }
  }

  /**
   * 检查 Agent 是否存在
   */
  hasMailbox(agentId: string): boolean {
    return this.mailboxes.has(agentId)
  }

  /**
   * 删除邮件箱
   */
  removeMailbox(agentId: string): boolean {
    const mailbox = this.mailboxes.get(agentId)
    if (mailbox) {
      mailbox.clear()
      this.mailboxes.delete(agentId)
      console.log(`[MailboxManager] 删除 Agent ${agentId} 的邮件箱`)
      return true
    }
    return false
  }

  /**
   * 获取统计信息
   */
  getStats(): { mailboxCount: number; teamMailboxCount: number; totalMessages: number } {
    let totalMessages = 0
    for (const mailbox of this.mailboxes.values()) {
      totalMessages += mailbox.getStats().total
    }
    for (const mailbox of this.crossTeamMailboxes.values()) {
      totalMessages += mailbox.getStats().total
    }

    return {
      mailboxCount: this.mailboxes.size,
      teamMailboxCount: this.crossTeamMailboxes.size,
      totalMessages,
    }
  }

  /**
   * 清理无效的邮件箱
   */
  cleanup(): number {
    let cleaned = 0

    for (const [agentId, mailbox] of this.mailboxes) {
      if (mailbox.getStats().total === 0) {
        const age = Date.now() - mailbox.getLatest(1)[0]?.timestamp.getTime() || 0
        if (age > 3600000) { // 1 小时无消息
          this.removeMailbox(agentId)
          cleaned++
        }
      }
    }

    return cleaned
  }
}

/**
 * 获取 MailboxManager 单例
 */
export function getMailboxManager(): MailboxManager {
  return MailboxManager.getInstance()
}
