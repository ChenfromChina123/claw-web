/**
 * 通知服务
 * 
 * 实现 WebSocket 推送、邮件通知、推送通知 (Firebase)、短信通知
 */

import { EventEmitter } from 'events'
import nodemailer from 'nodemailer'

// Firebase Admin SDK 类型声明
interface FirebaseAdmin {
  messaging(): {
    send(message: FirebaseMessage): Promise<string>
  }
}

interface FirebaseMessage {
  notification?: {
    title: string
    body: string
  }
  data?: Record<string, string>
  token?: string
  topic?: string
}

interface FirebaseApp {
  messaging(): FirebaseAdmin['messaging']
}

/**
 * 通知类型
 */
export enum NotificationType {
  TASK_STARTED = 'task_started',
  TASK_PROGRESS = 'task_progress',
  TASK_COMPLETED = 'task_completed',
  TASK_FAILED = 'task_failed',
  TASK_CANCELLED = 'task_cancelled',
  AGENT_STARTED = 'agent_started',
  AGENT_COMPLETED = 'agent_completed',
  AGENT_ERROR = 'agent_error',
  SYSTEM_MESSAGE = 'system_message',
}

/**
 * 通知渠道
 */
export enum NotificationChannel {
  WEBSOCKET = 'websocket',
  EMAIL = 'email',
  PUSH = 'push',
  SMS = 'sms',
}

/**
 * 通知接口
 */
export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  data?: Record<string, unknown>
  timestamp: Date
  read: boolean
  priority: 'low' | 'normal' | 'high' | 'urgent'
  channels: NotificationChannel[]
  recipientIds?: string[]
}

/**
 * 通知模板
 */
export interface NotificationTemplate {
  id: string
  type: NotificationType
  subject?: string
  titleTemplate: string
  messageTemplate: string
  channels: NotificationChannel[]
}

/**
 * 邮件配置
 */
export interface EmailConfig {
  host: string
  port: number
  secure: boolean
  auth: {
    user: string
    pass: string
  }
  from: string
}

/**
 * WebSocket 推送接口
 */
export interface WebSocketPush {
  type: string
  payload: unknown
  timestamp: string
}

/**
 * 通知服务配置
 */
export interface NotificationServiceConfig {
  /** 邮件配置 */
  email?: EmailConfig
  /** WebSocket 推送函数 */
  wsPush?: (clientId: string, message: WebSocketPush) => void
  /** Firebase 配置 */
  firebaseConfig?: {
    /** 服务账户密钥文件路径 */
    serviceAccountPath?: string
    /** Firebase 项目 ID */
    projectId?: string
  }
  /** 短信配置 (简单实现) */
  smsConfig?: {
    /** 接收短信的手机号列表 */
    recipients?: string[]
    /** 是否启用短信通知 */
    enabled?: boolean
  }
  /** 离线通知保留时间 (毫秒) */
  notificationTtl?: number
  /** 最大通知数 */
  maxNotifications?: number
}

/**
 * 通知服务
 */
export class NotificationService extends EventEmitter {
  private templates: Map<NotificationType, NotificationTemplate> = new Map()
  private notifications: Map<string, Notification> = new Map()
  private emailTransporter?: nodemailer.Transporter
  private firebaseApp?: FirebaseApp
  private firebaseInitialized = false
  private config: Required<NotificationServiceConfig>
  private cleanupInterval?: NodeJS.Timeout
  private smsRecipients: string[] = []
  private smsEnabled = false

  constructor(config: NotificationServiceConfig = {}) {
    super()

    this.config = {
      email: config.email || {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: '', pass: '' },
        from: 'noreply@example.com',
      },
      wsPush: config.wsPush || ((_, msg) => console.log('[WS Push]', JSON.stringify(msg))),
      notificationTtl: config.notificationTtl || 7 * 24 * 60 * 60 * 1000, // 7天
      maxNotifications: config.maxNotifications || 1000,
      firebaseConfig: config.firebaseConfig || {},
      smsConfig: config.smsConfig || {},
    }

    // 初始化邮件
    if (this.config.email.auth.user) {
      this.emailTransporter = nodemailer.createTransport({
        host: this.config.email.host,
        port: this.config.email.port,
        secure: this.config.email.secure,
        auth: this.config.email.auth,
      })
    }

    // 初始化 Firebase
    if (this.config.firebaseConfig?.serviceAccountPath) {
      this.initializeFirebase(this.config.firebaseConfig.serviceAccountPath)
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      this.initializeFirebase(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
    } else if (process.env.FIREBASE_PROJECT_ID) {
      // 尝试使用环境变量中的项目配置
      console.log('[NotificationService] Firebase 配置: 使用项目 ID', process.env.FIREBASE_PROJECT_ID)
      this.firebaseInitialized = true // 标记为已初始化，等待实际发送时才加载
    }

    // 初始化短信配置
    if (this.config.smsConfig) {
      this.smsRecipients = this.config.smsConfig.recipients || []
      this.smsEnabled = this.config.smsConfig.enabled ?? false
    } else if (process.env.SMS_ENABLED === 'true') {
      this.smsEnabled = true
      this.smsRecipients = (process.env.SMS_RECIPIENTS || '').split(',').filter(Boolean)
    }

    // 加载默认模板
    this.loadDefaultTemplates()

    // 启动清理定时器
    this.startCleanupTimer()
  }

  /**
   * 初始化 Firebase Admin SDK
   */
  private async initializeFirebase(serviceAccountPath: string): Promise<void> {
    try {
      // 动态导入 firebase-admin
      const { default: admin } = await import('firebase-admin')
      
      // 检查是否已初始化
      if (admin.apps.length === 0) {
        // 使用服务账户密钥文件
        if (serviceAccountPath && require('fs').existsSync(serviceAccountPath)) {
          const serviceAccount = require(serviceAccountPath)
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          })
        } else {
          // 尝试使用环境变量中的凭证
          const credentials = process.env.FIREBASE_SERVICE_ACCOUNT
          if (credentials) {
            const serviceAccount = JSON.parse(credentials)
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
            })
          } else {
            console.warn('[NotificationService] Firebase 初始化失败: 找不到服务账户配置')
            return
          }
        }
      }
      
      this.firebaseApp = admin as unknown as FirebaseApp
      this.firebaseInitialized = true
      console.log('[NotificationService] Firebase 推送服务已初始化')
    } catch (error) {
      console.error('[NotificationService] Firebase 初始化错误:', error)
      this.firebaseInitialized = false
    }
  }

  /**
   * 加载默认通知模板
   */
  private loadDefaultTemplates(): void {
    const defaultTemplates: NotificationTemplate[] = [
      {
        id: 'task_started',
        type: NotificationType.TASK_STARTED,
        titleTemplate: '任务已开始',
        messageTemplate: '任务 "${data.taskName}" 已开始执行',
        channels: [NotificationChannel.WEBSOCKET],
      },
      {
        id: 'task_progress',
        type: NotificationType.TASK_PROGRESS,
        titleTemplate: '任务进度更新',
        messageTemplate: '任务 "${data.taskName}" 进度: ${data.progress}%',
        channels: [NotificationChannel.WEBSOCKET],
      },
      {
        id: 'task_completed',
        type: NotificationType.TASK_COMPLETED,
        titleTemplate: '任务已完成',
        messageTemplate: '任务 "${data.taskName}" 已完成，耗时 ${data.duration}ms',
        channels: [NotificationChannel.WEBSOCKET, NotificationChannel.EMAIL],
      },
      {
        id: 'task_failed',
        type: NotificationType.TASK_FAILED,
        titleTemplate: '任务失败',
        messageTemplate: '任务 "${data.taskName}" 执行失败: ${data.error}',
        channels: [NotificationChannel.WEBSOCKET, NotificationChannel.EMAIL],
      },
      {
        id: 'task_cancelled',
        type: NotificationType.TASK_CANCELLED,
        titleTemplate: '任务已取消',
        messageTemplate: '任务 "${data.taskName}" 已被取消',
        channels: [NotificationChannel.WEBSOCKET],
      },
      {
        id: 'agent_started',
        type: NotificationType.AGENT_STARTED,
        titleTemplate: 'Agent 已启动',
        messageTemplate: 'Agent "${data.agentType}" 已启动执行',
        channels: [NotificationChannel.WEBSOCKET],
      },
      {
        id: 'agent_completed',
        type: NotificationType.AGENT_COMPLETED,
        titleTemplate: 'Agent 已完成',
        messageTemplate: 'Agent "${data.agentType}" 已完成执行',
        channels: [NotificationChannel.WEBSOCKET],
      },
      {
        id: 'agent_error',
        type: NotificationType.AGENT_ERROR,
        titleTemplate: 'Agent 执行错误',
        messageTemplate: 'Agent "${data.agentType}" 执行出错: ${data.error}',
        channels: [NotificationChannel.WEBSOCKET, NotificationChannel.EMAIL],
      },
    ]

    for (const template of defaultTemplates) {
      this.templates.set(template.type, template)
    }
  }

  /**
   * 注册通知模板
   */
  registerTemplate(template: NotificationTemplate): void {
    this.templates.set(template.type, template)
  }

  /**
   * 发送通知
   */
  async notify(params: {
    type: NotificationType
    title?: string
    message: string
    data?: Record<string, unknown>
    priority?: 'low' | 'normal' | 'high' | 'urgent'
    channels?: NotificationChannel[]
    recipientIds?: string[]
  }): Promise<string> {
    const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    const notification: Notification = {
      id,
      type: params.type,
      title: params.title || this.templates.get(params.type)?.titleTemplate || params.type,
      message: params.message,
      data: params.data,
      timestamp: new Date(),
      read: false,
      priority: params.priority || 'normal',
      channels: params.channels || this.templates.get(params.type)?.channels || [NotificationChannel.WEBSOCKET],
      recipientIds: params.recipientIds,
    }

    this.notifications.set(id, notification)

    // 触发事件
    this.emit('notification', notification)

    // 通过各渠道发送
    await this.sendThroughChannels(notification)

    return id
  }

  /**
   * 通过各渠道发送通知
   */
  private async sendThroughChannels(notification: Notification): Promise<void> {
    for (const channel of notification.channels) {
      try {
        switch (channel) {
          case NotificationChannel.WEBSOCKET:
            await this.sendWebSocket(notification)
            break
          case NotificationChannel.EMAIL:
            await this.sendEmail(notification)
            break
          case NotificationChannel.PUSH:
            await this.sendPush(notification)
            break
          case NotificationChannel.SMS:
            await this.sendSMS(notification)
            break
        }
      } catch (error) {
        console.error(`[NotificationService] Failed to send via ${channel}:`, error)
      }
    }
  }

  /**
   * 通过 WebSocket 发送
   */
  private async sendWebSocket(notification: Notification): Promise<void> {
    const push: WebSocketPush = {
      type: notification.type,
      payload: {
        id: notification.id,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        priority: notification.priority,
      },
      timestamp: notification.timestamp.toISOString(),
    }

    this.config.wsPush('broadcast', push)
    this.emit('websocket_sent', notification)
  }

  /**
   * 通过邮件发送
   */
  private async sendEmail(notification: Notification): Promise<void> {
    if (!this.emailTransporter) {
      console.warn('[NotificationService] Email transporter not configured')
      return
    }

    const template = this.templates.get(notification.type)
    const subject = template?.subject || notification.title

    try {
      await this.emailTransporter.sendMail({
        from: this.config.email.from,
        to: notification.recipientIds?.join(', ') || 'default@example.com',
        subject,
        text: notification.message,
        html: `<p>${notification.message}</p>`,
      })

      this.emit('email_sent', notification)
    } catch (error) {
      console.error('[NotificationService] Email send error:', error)
    }
  }

  /**
   * 通过推送服务发送 (Firebase Cloud Messaging)
   */
  private async sendPush(notification: Notification): Promise<void> {
    // 检查 Firebase 是否已初始化
    if (!this.firebaseInitialized) {
      console.warn('[NotificationService] Firebase 未初始化，推送通知将记录到日志')
      console.log('[NotificationService] Push notification:', {
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        data: notification.data,
      })
      return
    }

    // 延迟初始化 Firebase（如果需要）
    if (!this.firebaseApp && process.env.FIREBASE_PROJECT_ID) {
      try {
        await this.initializeFirebase(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '')
      } catch (error) {
        console.error('[NotificationService] Firebase 延迟初始化失败:', error)
        return
      }
    }

    if (!this.firebaseApp) {
      console.warn('[NotificationService] Firebase 应用未初始化，跳过推送')
      return
    }

    try {
      const message: FirebaseMessage = {
        notification: {
          title: notification.title,
          body: notification.message,
        },
        data: notification.data ? Object.fromEntries(
          Object.entries(notification.data).map(([k, v]) => [k, String(v)])
        ) : undefined,
      }

      // 如果有指定的接收者，使用 device token
      if (notification.recipientIds && notification.recipientIds.length > 0) {
        // 假设 recipientIds 是 FCM device tokens
        const results: string[] = []
        for (const token of notification.recipientIds) {
          try {
            const messageId = await this.firebaseApp.messaging().send({
              ...message,
              token,
            })
            results.push(messageId)
          } catch (error) {
            console.error(`[NotificationService] 推送发送到 token ${token} 失败:`, error)
          }
        }
        console.log(`[NotificationService] Firebase 推送已发送: ${results.length} 个设备`)
      } else {
        // 使用默认主题广播
        const messageId = await this.firebaseApp.messaging().send({
          ...message,
          topic: 'notifications',
        })
        console.log(`[NotificationService] Firebase 推送已发送: ${messageId}`)
      }

      this.emit('push_sent', notification)
    } catch (error) {
      console.error('[NotificationService] Firebase 推送发送失败:', error)
    }
  }

  /**
   * 通过短信发送 (简单实现 - 记录到日志)
   * 
   * 如需实际短信功能，可以使用以下任一服务：
   * - Twilio: npm install twilio
   * - 阿里云短信: npm install @alicloud/dysmsapi20170525
   */
  private async sendSMS(notification: Notification): Promise<void> {
    if (!this.smsEnabled) {
      console.log('[NotificationService] SMS 功能未启用，跳过短信通知')
      return
    }

    const recipients = this.smsRecipients.length > 0 
      ? this.smsRecipients 
      : process.env.SMS_RECIPIENTS?.split(',').filter(Boolean) || []

    if (recipients.length === 0) {
      console.warn('[NotificationService] 没有配置短信接收者，跳过短信')
      return
    }

    // 格式化短信内容（限制长度）
    const smsContent = `[${notification.title}] ${notification.message}`.substring(0, 160)

    console.log('[NotificationService] === 短信通知 (模拟) ===')
    console.log(`[NotificationService] 接收者: ${recipients.join(', ')}`)
    console.log(`[NotificationService] 内容: ${smsContent}`)
    console.log('[NotificationService] ===============================')

    // 如需实际发送短信，取消注释以下代码并配置 Twilio 或其他服务：
    /*
    // Twilio 实现示例
    // const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    // for (const phone of recipients) {
    //   await twilio.messages.create({
    //     body: smsContent,
    //     from: process.env.TWILIO_PHONE_NUMBER,
    //     to: phone,
    //   })
    // }
    */

    this.emit('sms_sent', notification)
  }

  /**
   * 获取通知
   */
  getNotification(id: string): Notification | undefined {
    return this.notifications.get(id)
  }

  /**
   * 获取所有通知
   */
  getAllNotifications(options?: {
    unreadOnly?: boolean
    type?: NotificationType
    limit?: number
    offset?: number
  }): Notification[] {
    let notifications = Array.from(this.notifications.values())

    if (options?.unreadOnly) {
      notifications = notifications.filter(n => !n.read)
    }

    if (options?.type) {
      notifications = notifications.filter(n => n.type === options.type)
    }

    // 按时间倒序
    notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    const offset = options?.offset || 0
    const limit = options?.limit || 50
    return notifications.slice(offset, offset + limit)
  }

  /**
   * 标记通知已读
   */
  markAsRead(id: string): boolean {
    const notification = this.notifications.get(id)
    if (!notification) return false

    notification.read = true
    return true
  }

  /**
   * 批量标记已读
   */
  markAllAsRead(ids?: string[]): number {
    let count = 0
    const toMark = ids || Array.from(this.notifications.keys())

    for (const id of toMark) {
      if (this.markAsRead(id)) {
        count++
      }
    }

    return count
  }

  /**
   * 删除通知
   */
  deleteNotification(id: string): boolean {
    return this.notifications.delete(id)
  }

  /**
   * 获取未读数量
   */
  getUnreadCount(): number {
    return Array.from(this.notifications.values()).filter(n => !n.read).length
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number
    unread: number
    byType: Record<NotificationType, number>
  } {
    const notifications = Array.from(this.notifications.values())
    const byType: Record<NotificationType, number> = {} as Record<NotificationType, number>

    for (const notif of notifications) {
      byType[notif.type] = (byType[notif.type] || 0) + 1
    }

    return {
      total: notifications.length,
      unread: this.getUnreadCount(),
      byType,
    }
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 3600000) // 每小时清理一次
  }

  /**
   * 清理过期通知
   */
  private cleanup(): void {
    const now = Date.now()
    const ttl = this.config.notificationTtl

    for (const [id, notification] of this.notifications) {
      if (now - notification.timestamp.getTime() > ttl) {
        this.notifications.delete(id)
      }
    }

    // 限制最大通知数
    if (this.notifications.size > this.config.maxNotifications) {
      const sorted = Array.from(this.notifications.values())
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

      const toDelete = sorted.slice(0, this.notifications.size - this.config.maxNotifications)
      for (const notif of toDelete) {
        this.notifications.delete(notif.id)
      }
    }
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.notifications.clear()
    this.templates.clear()
  }
}

// 导出单例
let instance: NotificationService | null = null

export function getNotificationService(): NotificationService {
  if (!instance) {
    instance = new NotificationService()
  }
  return instance
}

export function createNotificationService(config?: NotificationServiceConfig): NotificationService {
  if (instance) {
    instance.destroy()
  }
  instance = new NotificationService(config)
  return instance
}
