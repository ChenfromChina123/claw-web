/**
 * Agent Push Service
 *
 * 管理 Agent 向用户主动推送消息的逻辑
 * 支持推送类型：
 * - credential: 账号密码等凭证信息
 * - notification: 普通通知
 * - alert: 警告信息
 * - info: 一般信息
 */

import { randomUUID } from 'crypto'
import type { AgentPushMessage, AgentPushMessageParams } from '../../shared/types'
import { getNotificationService, NotificationType, NotificationChannel } from './notificationService'
import { wsManager } from '../integration/wsBridge'

/**
 * Agent 推送服务类
 */
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

    // 存储消息
    this.notifications.set(id, pushMessage)

    // 通过 WebSocket 推送给指定用户
    await this.pushToUser(params.userId, pushMessage)

    // 记录日志
    console.log(`[AgentPushService] Push sent: ${id} to user ${params.userId}, category: ${params.category}`)

    return id
  }

  /**
   * 推送凭证信息给用户
   * 用于发送账号密码等敏感信息
   *
   * @param userId 用户ID
   * @param sessionId 会话ID
   * @param credentials 凭证信息
   * @returns 消息ID
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
      expiresInMinutes: 30, // 凭证信息30分钟后过期
    })
  }

  /**
   * 推送一般通知
   *
   * @param userId 用户ID
   * @param sessionId 会话ID
   * @param notification 通知内容
   * @returns 消息ID
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
   *
   * @param userId 用户ID
   * @param sessionId 会话ID
   * @param alert 警告内容
   * @returns 消息ID
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
   *
   * @param userId 用户ID
   * @param sessionId 会话ID
   * @param info 信息内容
   * @returns 消息ID
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
   *
   * @param userId 用户ID
   * @param message 推送消息
   */
  private async pushToUser(userId: string, message: AgentPushMessage): Promise<void> {
    // 获取用户的所有连接
    const connections = wsManager.getAllConnections()
    let sent = false

    for (const [connectionId, wsData] of connections) {
      if (wsData.userId === userId) {
        // 发送 agent_push 事件
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
      console.warn(`[AgentPushService] User ${userId} is not online, push queued`)
      // TODO: 可以实现离线消息队列
    }

    // 同时通过 NotificationService 发送（支持推送通知到移动端）
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
   * 获取推送消息
   *
   * @param id 消息ID
   * @returns 推送消息或 undefined
   */
  getPushMessage(id: string): AgentPushMessage | undefined {
    const message = this.notifications.get(id)
    if (!message) return undefined

    // 检查是否过期
    if (message.expiresAt && new Date() > message.expiresAt) {
      this.notifications.delete(id)
      return undefined
    }

    return message
  }

  /**
   * 获取用户的所有推送消息
   *
   * @param userId 用户ID
   * @param options 查询选项
   * @returns 推送消息列表
   */
  getUserPushMessages(
    userId: string,
    options?: {
      category?: 'credential' | 'notification' | 'alert' | 'info'
      unreadOnly?: boolean
      limit?: number
    }
  ): AgentPushMessage[] {
    let messages = Array.from(this.notifications.values())
      .filter(msg => msg.userId === userId)

    // 过滤过期消息
    const now = new Date()
    messages = messages.filter(msg => !msg.expiresAt || msg.expiresAt > now)

    // 按类别过滤
    if (options?.category) {
      messages = messages.filter(msg => msg.category === options.category)
    }

    // 按时间倒序
    messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    // 限制数量
    if (options?.limit) {
      messages = messages.slice(0, options.limit)
    }

    return messages
  }

  /**
   * 删除推送消息
   *
   * @param id 消息ID
   * @returns 是否成功删除
   */
  deletePushMessage(id: string): boolean {
    return this.notifications.delete(id)
  }

  /**
   * 清理过期消息
   */
  cleanup(): void {
    const now = new Date()
    let count = 0

    for (const [id, message] of this.notifications) {
      if (message.expiresAt && message.expiresAt < now) {
        this.notifications.delete(id)
        count++
      }
    }

    if (count > 0) {
      console.log(`[AgentPushService] Cleaned up ${count} expired messages`)
    }
  }
}

// 导出单例
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
