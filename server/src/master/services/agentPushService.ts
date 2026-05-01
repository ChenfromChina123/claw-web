/**
 * Agent Push Service
 *
 * 管理 Agent 向用户主动推送消息的逻辑
 * 支持推送类型：
 * - credential: 账号密码等凭证信息
 * - notification: 普通通知
 * - alert: 警告信息
 * - info: 一般信息
 *
 * 持久化：推送消息同时写入数据库，支持离线消息补发
 */

import { randomUUID } from 'crypto'
import type { AgentPushMessage, AgentPushMessageParams } from '../../shared/types'
import { getNotificationService, NotificationType, NotificationChannel } from './notificationService'
import { wsManager } from '../integration/wsBridge'
import { getPushMessageRepository } from '../db/repositories/pushMessageRepository'

export class AgentPushService {
  private notifications: Map<string, AgentPushMessage> = new Map()

  /**
   * 发送 Agent 推送消息
   * 核心方法，用于向用户推送各种类型的消息
   *
   * @param params 推送消息参数
   * @returns 消息ID
   */
  async sendPush(params: AgentPushMessageParams): Promise<string> {
    const id = `push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date()
    const expiresAt = params.expiresInMinutes
      ? new Date(now.getTime() + params.expiresInMinutes * 60 * 1000)
      : undefined

    const pushMessage: AgentPushMessage = {
      id,
      type: 'agent_push',
      category: params.category,
      title: params.title,
      content: params.content,
      sensitiveData: params.sensitiveData,
      sessionId: params.sessionId,
      userId: params.userId,
      timestamp: now,
      expiresAt,
      priority: params.priority || 'normal',
    }

    this.notifications.set(id, pushMessage)

    this.persistAsync(pushMessage)

    await this.pushToUser(params.userId, pushMessage)

    console.log(`[AgentPushService] Push sent: ${id} to user ${params.userId}, category: ${params.category}`)

    return id
  }

  /**
   * 异步持久化推送消息到数据库
   */
  private persistAsync(message: AgentPushMessage): void {
    const repo = getPushMessageRepository()
    repo.create({
      ...message,
      isRead: false,
    }).catch(err => {
      console.error(`[AgentPushService] Failed to persist push message ${message.id}:`, err)
    })
  }

  /**
   * 推送凭证信息给用户
   */
  async pushCredentials(
    userId: string,
    sessionId: string,
    credentials: {
      username: string
      password: string
      service?: string
      note?: string
    }
  ): Promise<string> {
    const content = credentials.service
      ? `为您生成的 ${credentials.service} 账号信息`
      : '为您生成的账号信息'

    const note = credentials.note ? `\n备注: ${credentials.note}` : ''

    return this.sendPush({
      userId,
      sessionId,
      category: 'credential',
      title: credentials.service ? `${credentials.service} 账号信息` : '账号信息',
      content: `${content}${note}`,
      sensitiveData: {
        username: credentials.username,
        password: credentials.password,
      },
      priority: 'high',
      expiresInMinutes: 30,
    })
  }

  /**
   * 推送一般通知
   */
  async pushNotification(
    userId: string,
    sessionId: string,
    notification: {
      title: string
      content: string
      priority?: 'low' | 'normal' | 'high' | 'urgent'
    }
  ): Promise<string> {
    return this.sendPush({
      userId,
      sessionId,
      category: 'notification',
      title: notification.title,
      content: notification.content,
      priority: notification.priority || 'normal',
    })
  }

  /**
   * 推送警告信息
   */
  async pushAlert(
    userId: string,
    sessionId: string,
    alert: {
      title: string
      content: string
      actionRequired?: boolean
    }
  ): Promise<string> {
    return this.sendPush({
      userId,
      sessionId,
      category: 'alert',
      title: alert.title,
      content: alert.content,
      priority: alert.actionRequired ? 'urgent' : 'high',
    })
  }

  /**
   * 推送一般信息
   */
  async pushInfo(
    userId: string,
    sessionId: string,
    info: {
      title: string
      content: string
    }
  ): Promise<string> {
    return this.sendPush({
      userId,
      sessionId,
      category: 'info',
      title: info.title,
      content: info.content,
      priority: 'low',
    })
  }

  /**
   * 通过 WebSocket 推送给指定用户
   */
  private async pushToUser(userId: string, message: AgentPushMessage): Promise<void> {
    const connections = wsManager.getAllConnections()
    let sent = false

    for (const [connectionId, wsData] of connections) {
      if (wsData.userId === userId) {
        wsManager.sendToConnection(connectionId, {
          type: 'event',
          event: 'agent_push',
          data: {
            id: message.id,
            type: message.type,
            category: message.category,
            title: message.title,
            content: message.content,
            sensitiveData: message.sensitiveData,
            sessionId: message.sessionId,
            timestamp: message.timestamp.toISOString(),
            expiresAt: message.expiresAt?.toISOString(),
            priority: message.priority,
          },
          timestamp: Date.now(),
        })
        sent = true
      }
    }

    if (!sent) {
      console.log(`[AgentPushService] User ${userId} is offline, push persisted for later delivery`)
    }

    const notificationService = getNotificationService()
    await notificationService.notify({
      type: NotificationType.SYSTEM_MESSAGE,
      title: message.title,
      message: message.content,
      data: {
        pushId: message.id,
        category: message.category,
        sessionId: message.sessionId,
        priority: message.priority,
      },
      priority: message.priority,
      channels: [NotificationChannel.WEBSOCKET, NotificationChannel.PUSH],
      recipientIds: [userId],
    })
  }

  /**
   * 用户上线时补发未读推送消息
   */
  async deliverOfflineMessages(userId: string): Promise<number> {
    const repo = getPushMessageRepository()
    const unreadMessages = await repo.findByUserId(userId, { unreadOnly: true, limit: 50 })

    let delivered = 0
    for (const message of unreadMessages) {
      const connections = wsManager.getAllConnections()
      for (const [connectionId, wsData] of connections) {
        if (wsData.userId === userId) {
          wsManager.sendToConnection(connectionId, {
            type: 'event',
            event: 'agent_push',
            data: {
              id: message.id,
              type: message.type,
              category: message.category,
              title: message.title,
              content: message.content,
              sensitiveData: message.sensitiveData,
              sessionId: message.sessionId,
              timestamp: new Date(message.timestamp).toISOString(),
              expiresAt: message.expiresAt ? new Date(message.expiresAt).toISOString() : undefined,
              priority: message.priority,
            },
            timestamp: Date.now(),
          })
        }
      }
      delivered++
    }

    if (delivered > 0) {
      console.log(`[AgentPushService] Delivered ${delivered} offline messages to user ${userId}`)
    }

    return delivered
  }

  /**
   * 获取推送消息
   */
  getPushMessage(id: string): AgentPushMessage | undefined {
    const message = this.notifications.get(id)
    if (!message) return undefined

    if (message.expiresAt && new Date() > message.expiresAt) {
      this.notifications.delete(id)
      return undefined
    }

    return message
  }

  /**
   * 获取用户的所有推送消息（优先从数据库查询）
   */
  async getUserPushMessages(
    userId: string,
    options?: {
      category?: 'credential' | 'notification' | 'alert' | 'info'
      unreadOnly?: boolean
      limit?: number
    }
  ): Promise<AgentPushMessage[]> {
    try {
      const repo = getPushMessageRepository()
      return await repo.findByUserId(userId, options)
    } catch {
      return this.getUserPushMessagesFromMemory(userId, options)
    }
  }

  /**
   * 从内存获取推送消息（降级方案）
   */
  private getUserPushMessagesFromMemory(
    userId: string,
    options?: {
      category?: 'credential' | 'notification' | 'alert' | 'info'
      unreadOnly?: boolean
      limit?: number
    }
  ): AgentPushMessage[] {
    let messages = Array.from(this.notifications.values())
      .filter(msg => msg.userId === userId)

    const now = new Date()
    messages = messages.filter(msg => !msg.expiresAt || msg.expiresAt > now)

    if (options?.category) {
      messages = messages.filter(msg => msg.category === options.category)
    }

    messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    if (options?.limit) {
      messages = messages.slice(0, options.limit)
    }

    return messages
  }

  /**
   * 标记推送消息为已读
   */
  async markAsRead(id: string): Promise<boolean> {
    try {
      const repo = getPushMessageRepository()
      return await repo.markAsRead(id)
    } catch {
      return false
    }
  }

  /**
   * 删除推送消息
   */
  async deletePushMessage(id: string): Promise<boolean> {
    this.notifications.delete(id)
    try {
      const repo = getPushMessageRepository()
      return await repo.deleteById(id)
    } catch {
      return false
    }
  }

  /**
   * 清理过期消息
   */
  async cleanup(): Promise<void> {
    const now = new Date()
    let memCount = 0

    for (const [id, message] of this.notifications) {
      if (message.expiresAt && message.expiresAt < now) {
        this.notifications.delete(id)
        memCount++
      }
    }

    let dbCount = 0
    try {
      const repo = getPushMessageRepository()
      dbCount = await repo.cleanupExpired()
    } catch {
      // 数据库清理失败不影响内存清理
    }

    const total = memCount + dbCount
    if (total > 0) {
      console.log(`[AgentPushService] Cleaned up ${memCount} memory + ${dbCount} DB expired messages`)
    }
  }
}

let instance: AgentPushService | null = null

export function getAgentPushService(): AgentPushService {
  if (!instance) {
    instance = new AgentPushService()
  }
  return instance
}

export function createAgentPushService(): AgentPushService {
  instance = new AgentPushService()
  return instance
}
