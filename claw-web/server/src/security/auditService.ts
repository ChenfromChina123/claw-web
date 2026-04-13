/**
 * 审计日志服务
 * 
 * 功能：
 * - 操作审计记录
 * - 安全事件追踪
 * - 合规性报告
 * - 日志查询和分析
 * 
 * 使用场景：
 * - 记录用户操作
 * - 追踪安全事件
 * - 生成审计报告
 * - 合规性检查
 */

// ==================== 类型定义 ====================

/**
 * 审计事件类型
 */
export type AuditEventType = 
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  | 'project.create'
  | 'project.delete'
  | 'project.start'
  | 'project.stop'
  | 'domain.create'
  | 'domain.delete'
  | 'ssl.create'
  | 'ssl.delete'
  | 'tunnel.create'
  | 'tunnel.delete'
  | 'resource.access'
  | 'permission.grant'
  | 'permission.revoke'
  | 'config.change'
  | 'security.alert'

/**
 * 审计日志级别
 */
export type AuditLogLevel = 'info' | 'warning' | 'error' | 'critical'

/**
 * 审计日志条目
 */
export interface AuditLogEntry {
  id: string
  timestamp: Date
  eventType: AuditEventType
  level: AuditLogLevel
  userId?: string
  userName?: string
  ipAddress?: string
  userAgent?: string
  resource?: string
  resourceId?: string
  action: string
  details?: Record<string, any>
  success: boolean
  errorMessage?: string
  duration?: number // 操作耗时（毫秒）
}

/**
 * 审计日志查询选项
 */
export interface AuditLogQuery {
  userId?: string
  eventType?: AuditEventType
  level?: AuditLogLevel
  resource?: string
  resourceId?: string
  success?: boolean
  startTime?: Date
  endTime?: Date
  limit?: number
  offset?: number
}

/**
 * 审计统计信息
 */
export interface AuditStatistics {
  totalEvents: number
  eventsByType: Record<AuditEventType, number>
  eventsByLevel: Record<AuditLogLevel, number>
  eventsByUser: Record<string, number>
  failedEvents: number
  averageDuration: number
}

// ==================== 审计日志服务 ====================

export class AuditService {
  private logs: AuditLogEntry[]
  private maxLogs: number

  constructor(maxLogs: number = 10000) {
    this.logs = []
    this.maxLogs = maxLogs
  }

  /**
   * 记录审计日志
   */
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const logEntry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      ...entry
    }

    this.logs.push(logEntry)

    // 限制日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // 输出到控制台
    this.logToConsole(logEntry)

    // TODO: 保存到数据库
    // await this.saveToDatabase(logEntry)

    return logEntry
  }

  /**
   * 记录用户登录
   */
  async logUserLogin(
    userId: string,
    userName: string,
    ipAddress: string,
    userAgent: string,
    success: boolean
  ): Promise<AuditLogEntry> {
    return await this.log({
      eventType: 'user.login',
      level: success ? 'info' : 'warning',
      userId,
      userName,
      ipAddress,
      userAgent,
      action: '用户登录',
      success,
      errorMessage: success ? undefined : '登录失败'
    })
  }

  /**
   * 记录项目操作
   */
  async logProjectOperation(
    userId: string,
    userName: string,
    action: string,
    projectId: string,
    success: boolean,
    details?: Record<string, any>
  ): Promise<AuditLogEntry> {
    const eventTypeMap: Record<string, AuditEventType> = {
      '创建项目': 'project.create',
      '删除项目': 'project.delete',
      '启动项目': 'project.start',
      '停止项目': 'project.stop'
    }

    return await this.log({
      eventType: eventTypeMap[action] || 'project.create',
      level: success ? 'info' : 'error',
      userId,
      userName,
      resource: 'project',
      resourceId: projectId,
      action,
      success,
      details,
      errorMessage: success ? undefined : `${action}失败`
    })
  }

  /**
   * 记录资源访问
   */
  async logResourceAccess(
    userId: string,
    userName: string,
    resource: string,
    resourceId: string,
    action: string,
    success: boolean,
    ipAddress?: string
  ): Promise<AuditLogEntry> {
    return await this.log({
      eventType: 'resource.access',
      level: success ? 'info' : 'warning',
      userId,
      userName,
      ipAddress,
      resource,
      resourceId,
      action,
      success,
      errorMessage: success ? undefined : '访问被拒绝'
    })
  }

  /**
   * 记录安全事件
   */
  async logSecurityEvent(
    level: AuditLogLevel,
    action: string,
    details: Record<string, any>,
    userId?: string
  ): Promise<AuditLogEntry> {
    return await this.log({
      eventType: 'security.alert',
      level,
      userId,
      action,
      success: false,
      details
    })
  }

  /**
   * 查询审计日志
   */
  async queryLogs(options: AuditLogQuery): Promise<AuditLogEntry[]> {
    let filteredLogs = [...this.logs]

    // 应用过滤条件
    if (options.userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === options.userId)
    }

    if (options.eventType) {
      filteredLogs = filteredLogs.filter(log => log.eventType === options.eventType)
    }

    if (options.level) {
      filteredLogs = filteredLogs.filter(log => log.level === options.level)
    }

    if (options.resource) {
      filteredLogs = filteredLogs.filter(log => log.resource === options.resource)
    }

    if (options.resourceId) {
      filteredLogs = filteredLogs.filter(log => log.resourceId === options.resourceId)
    }

    if (options.success !== undefined) {
      filteredLogs = filteredLogs.filter(log => log.success === options.success)
    }

    if (options.startTime) {
      filteredLogs = filteredLogs.filter(log => log.timestamp >= options.startTime!)
    }

    if (options.endTime) {
      filteredLogs = filteredLogs.filter(log => log.timestamp <= options.endTime!)
    }

    // 排序（最新的在前）
    filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    // 分页
    const offset = options.offset || 0
    const limit = options.limit || 100

    return filteredLogs.slice(offset, offset + limit)
  }

  /**
   * 获取审计统计信息
   */
  async getStatistics(startTime?: Date, endTime?: Date): Promise<AuditStatistics> {
    let filteredLogs = [...this.logs]

    if (startTime) {
      filteredLogs = filteredLogs.filter(log => log.timestamp >= startTime)
    }

    if (endTime) {
      filteredLogs = filteredLogs.filter(log => log.timestamp <= endTime)
    }

    const eventsByType: Record<string, number> = {}
    const eventsByLevel: Record<string, number> = {}
    const eventsByUser: Record<string, number> = {}
    let failedEvents = 0
    let totalDuration = 0
    let durationCount = 0

    for (const log of filteredLogs) {
      // 按类型统计
      eventsByType[log.eventType] = (eventsByType[log.eventType] || 0) + 1

      // 按级别统计
      eventsByLevel[log.level] = (eventsByLevel[log.level] || 0) + 1

      // 按用户统计
      if (log.userId) {
        eventsByUser[log.userId] = (eventsByUser[log.userId] || 0) + 1
      }

      // 失败事件
      if (!log.success) {
        failedEvents++
      }

      // 平均耗时
      if (log.duration) {
        totalDuration += log.duration
        durationCount++
      }
    }

    return {
      totalEvents: filteredLogs.length,
      eventsByType: eventsByType as Record<AuditEventType, number>,
      eventsByLevel: eventsByLevel as Record<AuditLogLevel, number>,
      eventsByUser,
      failedEvents,
      averageDuration: durationCount > 0 ? totalDuration / durationCount : 0
    }
  }

  /**
   * 清理过期日志
   */
  async cleanOldLogs(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

    const initialLength = this.logs.length
    this.logs = this.logs.filter(log => log.timestamp >= cutoffDate)

    const deletedCount = initialLength - this.logs.length
    console.log(`[AuditService] 清理了 ${deletedCount} 条过期日志`)

    return deletedCount
  }

  /**
   * 生成审计报告
   */
  async generateReport(
    startTime: Date,
    endTime: Date
  ): Promise<{
    period: { start: Date; end: Date }
    statistics: AuditStatistics
    topUsers: Array<{ userId: string; count: number }>
    topEvents: Array<{ eventType: AuditEventType; count: number }>
    failedOperations: AuditLogEntry[]
  }> {
    const statistics = await this.getStatistics(startTime, endTime)

    // 获取活跃用户
    const topUsers = Object.entries(statistics.eventsByUser)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // 获取高频事件
    const topEvents = Object.entries(statistics.eventsByType)
      .map(([eventType, count]) => ({ eventType: eventType as AuditEventType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // 获取失败操作
    const failedOperations = await this.queryLogs({
      startTime,
      endTime,
      success: false,
      limit: 50
    })

    return {
      period: { start: startTime, end: endTime },
      statistics,
      topUsers,
      topEvents,
      failedOperations
    }
  }

  /**
   * 输出到控制台
   */
  private logToConsole(entry: AuditLogEntry) {
    const levelColors = {
      info: '\x1b[36m',    // 青色
      warning: '\x1b[33m', // 黄色
      error: '\x1b[31m',   // 红色
      critical: '\x1b[35m' // 紫色
    }

    const reset = '\x1b[0m'
    const color = levelColors[entry.level]

    console.log(
      `${color}[AUDIT][${entry.level.toUpperCase()}]${reset} ` +
      `${entry.timestamp.toISOString()} ` +
      `${entry.eventType} ` +
      `${entry.action} ` +
      `用户: ${entry.userName || '未知'} ` +
      `结果: ${entry.success ? '成功' : '失败'}`
    )
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
}

// ==================== 单例实例 ====================

let auditService: AuditService | null = null

/**
 * 获取审计服务实例
 */
export function getAuditService(): AuditService {
  if (!auditService) {
    auditService = new AuditService()
  }
  return auditService
}
