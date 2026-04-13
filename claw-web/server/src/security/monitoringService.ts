/**
 * 监控告警服务
 * 
 * 功能：
 * - 系统资源监控
 * - 项目状态监控
 * - 异常检测
 * - 告警通知
 * 
 * 使用场景：
 * - 监控项目运行状态
 * - 检测资源使用异常
 * - 发送告警通知
 * - 生成监控报告
 */

import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// ==================== 类型定义 ====================

/**
 * 监控指标
 */
export interface MonitoringMetric {
  name: string
  value: number
  unit: string
  timestamp: Date
  tags?: Record<string, string>
}

/**
 * 告警规则
 */
export interface AlertRule {
  id: string
  name: string
  metric: string
  condition: 'greater_than' | 'less_than' | 'equals'
  threshold: number
  duration: number // 持续时间（秒）
  severity: 'info' | 'warning' | 'critical'
  enabled: boolean
  actions: AlertAction[]
}

/**
 * 告警动作
 */
export interface AlertAction {
  type: 'email' | 'webhook' | 'log'
  config: Record<string, any>
}

/**
 * 告警事件
 */
export interface AlertEvent {
  id: string
  ruleId: string
  ruleName: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  metric: string
  value: number
  threshold: number
  timestamp: Date
  acknowledged: boolean
  acknowledgedAt?: Date
  acknowledgedBy?: string
}

/**
 * 系统状态
 */
export interface SystemStatus {
  cpu: {
    usage: number
    cores: number
  }
  memory: {
    total: number
    used: number
    free: number
    percentage: number
  }
  disk: {
    total: number
    used: number
    free: number
    percentage: number
  }
  network: {
    bytesIn: number
    bytesOut: number
  }
  uptime: number
}

// ==================== 监控告警服务 ====================

export class MonitoringService {
  private metrics: Map<string, MonitoringMetric[]>
  private alertRules: Map<string, AlertRule>
  private alertEvents: AlertEvent[]
  private monitoringInterval: NodeJS.Timeout | null

  constructor() {
    this.metrics = new Map()
    this.alertRules = new Map()
    this.alertEvents = []
    this.monitoringInterval = null
    
    this.initializeDefaultRules()
  }

  /**
   * 初始化默认告警规则
   */
  private initializeDefaultRules() {
    const defaultRules: AlertRule[] = [
      {
        id: 'cpu_high',
        name: 'CPU 使用率过高',
        metric: 'system.cpu.usage',
        condition: 'greater_than',
        threshold: 80,
        duration: 60,
        severity: 'warning',
        enabled: true,
        actions: [{ type: 'log', config: {} }]
      },
      {
        id: 'memory_high',
        name: '内存使用率过高',
        metric: 'system.memory.percentage',
        condition: 'greater_than',
        threshold: 85,
        duration: 60,
        severity: 'warning',
        enabled: true,
        actions: [{ type: 'log', config: {} }]
      },
      {
        id: 'disk_high',
        name: '磁盘使用率过高',
        metric: 'system.disk.percentage',
        condition: 'greater_than',
        threshold: 90,
        duration: 300,
        severity: 'critical',
        enabled: true,
        actions: [{ type: 'log', config: {} }]
      },
      {
        id: 'project_down',
        name: '项目意外停止',
        metric: 'project.status',
        condition: 'equals',
        threshold: 0, // 0 = stopped
        duration: 10,
        severity: 'critical',
        enabled: true,
        actions: [{ type: 'log', config: {} }]
      }
    ]

    defaultRules.forEach(rule => {
      this.alertRules.set(rule.id, rule)
    })
  }

  /**
   * 启动监控
   */
  startMonitoring(intervalMs: number = 60000) {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }

    console.log(`[MonitoringService] 启动监控，间隔: ${intervalMs}ms`)

    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics()
      await this.checkAlertRules()
    }, intervalMs)

    // 立即执行一次
    this.collectMetrics()
  }

  /**
   * 停止监控
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
      console.log('[MonitoringService] 监控已停止')
    }
  }

  /**
   * 收集系统指标
   */
  async collectMetrics() {
    try {
      const systemStatus = await this.getSystemStatus()

      // 记录 CPU 使用率
      this.recordMetric({
        name: 'system.cpu.usage',
        value: systemStatus.cpu.usage,
        unit: 'percent',
        timestamp: new Date()
      })

      // 记录内存使用率
      this.recordMetric({
        name: 'system.memory.percentage',
        value: systemStatus.memory.percentage,
        unit: 'percent',
        timestamp: new Date()
      })

      // 记录磁盘使用率
      this.recordMetric({
        name: 'system.disk.percentage',
        value: systemStatus.disk.percentage,
        unit: 'percent',
        timestamp: new Date()
      })

      console.log('[MonitoringService] 指标收集完成')
    } catch (error) {
      console.error('[MonitoringService] 指标收集失败:', error)
    }
  }

  /**
   * 获取系统状态
   */
  async getSystemStatus(): Promise<SystemStatus> {
    try {
      // CPU 使用率
      const { stdout: cpuUsage } = await execAsync(
        "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1 || echo 0"
      )

      // 内存信息
      const { stdout: memInfo } = await execAsync('free -m | grep Mem')
      const memParts = memInfo.trim().split(/\s+/)
      const memTotal = parseInt(memParts[1])
      const memUsed = parseInt(memParts[2])
      const memFree = parseInt(memParts[3])

      // 磁盘信息
      const { stdout: diskInfo } = await execAsync("df -m / | tail -1 | awk '{print $2,$3,$4}'")
      const diskParts = diskInfo.trim().split(/\s+/)
      const diskTotal = parseInt(diskParts[0])
      const diskUsed = parseInt(diskParts[1])
      const diskFree = parseInt(diskParts[2])

      // 网络信息
      const { stdout: netInfo } = await execAsync(
        "cat /proc/net/dev | grep -E 'eth0|ens|wlan' | awk '{print $2,$10}' || echo '0 0'"
      )
      const netParts = netInfo.trim().split(/\s+/)
      const bytesIn = parseInt(netParts[0]) || 0
      const bytesOut = parseInt(netParts[1]) || 0

      // 系统运行时间
      const { stdout: uptimeStr } = await execAsync('cat /proc/uptime | cut -d. -f1')
      const uptime = parseInt(uptimeStr.trim())

      return {
        cpu: {
          usage: parseFloat(cpuUsage.trim()) || 0,
          cores: 1 // TODO: 获取实际核心数
        },
        memory: {
          total: memTotal,
          used: memUsed,
          free: memFree,
          percentage: memTotal > 0 ? (memUsed / memTotal) * 100 : 0
        },
        disk: {
          total: diskTotal,
          used: diskUsed,
          free: diskFree,
          percentage: diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0
        },
        network: {
          bytesIn,
          bytesOut
        },
        uptime
      }
    } catch (error) {
      console.error('[MonitoringService] 获取系统状态失败:', error)
      
      // 返回默认值
      return {
        cpu: { usage: 0, cores: 1 },
        memory: { total: 0, used: 0, free: 0, percentage: 0 },
        disk: { total: 0, used: 0, free: 0, percentage: 0 },
        network: { bytesIn: 0, bytesOut: 0 },
        uptime: 0
      }
    }
  }

  /**
   * 记录指标
   */
  recordMetric(metric: MonitoringMetric) {
    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, [])
    }

    const metrics = this.metrics.get(metric.name)!
    metrics.push(metric)

    // 只保留最近 1000 条记录
    if (metrics.length > 1000) {
      metrics.shift()
    }
  }

  /**
   * 检查告警规则
   */
  async checkAlertRules() {
    for (const [ruleId, rule] of this.alertRules) {
      if (!rule.enabled) continue

      const metrics = this.metrics.get(rule.metric)
      if (!metrics || metrics.length === 0) continue

      const latestMetric = metrics[metrics.length - 1]
      const shouldAlert = this.evaluateCondition(
        latestMetric.value,
        rule.condition,
        rule.threshold
      )

      if (shouldAlert) {
        await this.triggerAlert(rule, latestMetric.value)
      }
    }
  }

  /**
   * 评估条件
   */
  private evaluateCondition(
    value: number,
    condition: AlertRule['condition'],
    threshold: number
  ): boolean {
    switch (condition) {
      case 'greater_than':
        return value > threshold
      case 'less_than':
        return value < threshold
      case 'equals':
        return value === threshold
      default:
        return false
    }
  }

  /**
   * 触发告警
   */
  private async triggerAlert(rule: AlertRule, value: number) {
    const event: AlertEvent = {
      id: `${rule.id}-${Date.now()}`,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message: `${rule.name}: 当前值 ${value}, 阈值 ${rule.threshold}`,
      metric: rule.metric,
      value,
      threshold: rule.threshold,
      timestamp: new Date(),
      acknowledged: false
    }

    this.alertEvents.push(event)

    // 执行告警动作
    for (const action of rule.actions) {
      await this.executeAlertAction(action, event)
    }

    console.log(`[MonitoringService] 告警触发: ${rule.name}`)
  }

  /**
   * 执行告警动作
   */
  private async executeAlertAction(action: AlertAction, event: AlertEvent) {
    switch (action.type) {
      case 'log':
        console.log(`[ALERT][${event.severity.toUpperCase()}] ${event.message}`)
        break

      case 'email':
        // TODO: 发送邮件
        console.log(`[MonitoringService] 发送邮件告警: ${event.message}`)
        break

      case 'webhook':
        // TODO: 调用 Webhook
        console.log(`[MonitoringService] 调用 Webhook: ${event.message}`)
        break
    }
  }

  /**
   * 确认告警
   */
  acknowledgeAlert(eventId: string, userId: string): boolean {
    const event = this.alertEvents.find(e => e.id === eventId)
    if (event && !event.acknowledged) {
      event.acknowledged = true
      event.acknowledgedAt = new Date()
      event.acknowledgedBy = userId
      return true
    }
    return false
  }

  /**
   * 获取告警事件
   */
  getAlertEvents(limit: number = 100): AlertEvent[] {
    return this.alertEvents.slice(-limit)
  }

  /**
   * 获取指标历史
   */
  getMetricHistory(name: string, limit: number = 100): MonitoringMetric[] {
    const metrics = this.metrics.get(name) || []
    return metrics.slice(-limit)
  }
}

// ==================== 单例实例 ====================

let monitoringService: MonitoringService | null = null

/**
 * 获取监控服务实例
 */
export function getMonitoringService(): MonitoringService {
  if (!monitoringService) {
    monitoringService = new MonitoringService()
  }
  return monitoringService
}
