/**
 * 性能监控和日志系统
 * 
 * 功能：
 * - 性能指标收集
 * - 请求追踪
 * - 错误日志
 * - 实时状态监控
 */

import { v4 as uuidv4 } from 'uuid'
import * as os from 'os'

// ==================== Types ====================

export interface Metric {
  name: string
  value: number
  unit: string
  timestamp: number
  tags?: Record<string, string>
}

export interface RequestTrace {
  id: string
  method: string
  path: string
  statusCode?: number
  duration: number
  timestamp: number
  userId?: string
  sessionId?: string
  requestSize?: number
  responseSize?: number
  error?: string
}

export interface LogEntry {
  id: string
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  message: string
  timestamp: number
  source?: string
  data?: unknown
  userId?: string
  requestId?: string
}

export interface PerformanceMetrics {
  uptime: number
  memory: {
    heapUsed: number
    heapTotal: number
    external: number
    rss: number
  }
  cpu: {
    usage: number
    cores: number
  }
  requests: {
    total: number
    success: number
    failed: number
    avgDuration: number
  }
  tools: {
    total: number
    success: number
    failed: number
    avgDuration: number
  }
  connections: {
    websocket: number
    activeSessions: number
  }
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  timestamp: string
  uptime: number
  components: {
    database: {
      status: 'healthy' | 'unhealthy'
      connected: boolean
    }
    websocket: {
      status: 'healthy' | 'degraded'
      connections: number
      activeSessions: number
    }
    memory: {
      status: 'healthy' | 'degraded' | 'unhealthy'
      usagePercent: number
      heapUsed: number
      heapTotal: number
    }
    cpu: {
      status: 'healthy' | 'degraded'
      usagePercent: number
      cores: number
    }
  }
}

export interface AlertRule {
  id: string
  name: string
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
  metric: string
  threshold: number
  enabled: boolean
  cooldown: number // ms
  lastTriggered?: number
}

export interface Alert {
  id: string
  ruleId: string
  ruleName: string
  metric: string
  value: number
  threshold: number
  timestamp: number
  acknowledged: boolean
}

// ==================== Metrics Collector ====================

class MetricsCollector {
  private metrics: Map<string, Metric[]> = new Map()
  private maxMetricsPerName = 1000
  private retentionPeriod = 3600000 // 1 hour

  record(name: string, value: number, unit = '', tags?: Record<string, string>): void {
    const metric: Metric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      tags,
    }

    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }

    const metrics = this.metrics.get(name)!
    metrics.push(metric)

    // 清理过期数据
    const cutoff = Date.now() - this.retentionPeriod
    while (metrics.length > 0 && metrics[0].timestamp < cutoff) {
      metrics.shift()
    }

    // 限制数量
    while (metrics.length > this.maxMetricsPerName) {
      metrics.shift()
    }
  }

  get(name: string, limit?: number): Metric[] {
    const metrics = this.metrics.get(name) || []
    return limit ? metrics.slice(-limit) : [...metrics]
  }

  getLatest(name: string): Metric | undefined {
    const metrics = this.metrics.get(name)
    return metrics?.[metrics.length - 1]
  }

  getStats(name: string): { min: number; max: number; avg: number; count: number } | null {
    const metrics = this.metrics.get(name)
    if (!metrics || metrics.length === 0) return null

    const values = metrics.map(m => m.value)
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length,
    }
  }

  clear(): void {
    this.metrics.clear()
  }
}

// ==================== Request Tracer ====================

class RequestTracer {
  private traces: RequestTrace[] = []
  private activeRequests: Map<string, number> = new Map()
  private maxTraces = 1000

  startRequest(method: string, path: string, userId?: string, sessionId?: string): string {
    const id = uuidv4()
    this.activeRequests.set(id, Date.now())
    return id
  }

  endRequest(
    id: string,
    statusCode?: number,
    requestSize?: number,
    responseSize?: number,
    error?: string
  ): void {
    const startTime = this.activeRequests.get(id)
    if (startTime) {
      const duration = Date.now() - startTime
      this.activeRequests.delete(id)

      const trace: RequestTrace = {
        id,
        method: '',
        path: '',
        statusCode,
        duration,
        timestamp: Date.now(),
        requestSize,
        responseSize,
        error,
      }

      this.traces.push(trace)

      // 限制数量
      while (this.traces.length > this.maxTraces) {
        this.traces.shift()
      }
    }
  }

  getTraces(limit?: number): RequestTrace[] {
    return limit ? this.traces.slice(-limit) : [...this.traces]
  }

  getStats(): { total: number; success: number; failed: number; avgDuration: number } {
    const total = this.traces.length
    const success = this.traces.filter(t => t.statusCode && t.statusCode < 400).length
    const failed = this.traces.filter(t => t.statusCode && t.statusCode >= 400).length
    const avgDuration = total > 0
      ? this.traces.reduce((sum, t) => sum + t.duration, 0) / total
      : 0

    return { total, success, failed, avgDuration }
  }
}

// ==================== Logger ====================

class Logger {
  private logs: LogEntry[] = []
  private maxLogs = 5000
  private listeners: ((entry: LogEntry) => void)[] = []
  private minLevel: LogEntry['level'] = 'info'

  constructor(minLevel: LogEntry['level'] = 'info') {
    this.minLevel = minLevel
  }

  private log(level: LogEntry['level'], message: string, source?: string, data?: unknown): void {
    const entry: LogEntry = {
      id: uuidv4(),
      level,
      message,
      timestamp: Date.now(),
      source,
      data,
    }

    this.logs.push(entry)

    // 限制数量
    while (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // 通知监听器
    for (const listener of this.listeners) {
      listener(entry)
    }

    // 控制台输出
    const timestamp = new Date(entry.timestamp).toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}]${source ? ` [${source}]` : ''}`
    
    switch (level) {
      case 'debug':
        console.debug(prefix, message, data || '')
        break
      case 'info':
        console.info(prefix, message, data || '')
        break
      case 'warn':
        console.warn(prefix, message, data || '')
        break
      case 'error':
      case 'fatal':
        console.error(prefix, message, data || '')
        break
    }
  }

  debug(message: string, source?: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      this.log('debug', message, source, data)
    }
  }

  info(message: string, source?: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      this.log('info', message, source, data)
    }
  }

  warn(message: string, source?: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      this.log('warn', message, source, data)
    }
  }

  error(message: string, source?: string, data?: unknown): void {
    if (this.shouldLog('error')) {
      this.log('error', message, source, data)
    }
  }

  fatal(message: string, source?: string, data?: unknown): void {
    this.log('fatal', message, source, data)
  }

  private shouldLog(level: LogEntry['level']): boolean {
    const levels: Record<LogEntry['level'], number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4,
    }
    return levels[level] >= levels[this.minLevel]
  }

  getLogs(limit?: number, level?: LogEntry['level']): LogEntry[] {
    let logs = this.logs
    if (level) {
      logs = logs.filter(l => l.level === level)
    }
    return limit ? logs.slice(-limit) : [...logs]
  }

  clear(): void {
    this.logs = []
  }

  subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index >= 0) {
        this.listeners.splice(index, 1)
      }
    }
  }
}

// ==================== Alert Manager ====================

class AlertManager {
  private rules: AlertRule[] = []
  private alerts: Alert[] = []
  private maxAlerts = 100

  addRule(rule: Omit<AlertRule, 'id'>): AlertRule {
    const newRule: AlertRule = {
      ...rule,
      id: uuidv4(),
    }
    this.rules.push(newRule)
    return newRule
  }

  removeRule(ruleId: string): boolean {
    const index = this.rules.findIndex(r => r.id === ruleId)
    if (index >= 0) {
      this.rules.splice(index, 1)
      return true
    }
    return false
  }

  enableRule(ruleId: string, enabled: boolean): boolean {
    const rule = this.rules.find(r => r.id === ruleId)
    if (rule) {
      rule.enabled = enabled
      return true
    }
    return false
  }

  checkMetric(metric: string, value: number): Alert | null {
    for (const rule of this.rules) {
      if (!rule.enabled || rule.metric !== metric) continue

      // 检查冷却时间
      if (rule.lastTriggered && Date.now() - rule.lastTriggered < rule.cooldown) {
        continue
      }

      // 检查条件
      let triggered = false
      switch (rule.condition) {
        case 'gt':
          triggered = value > rule.threshold
          break
        case 'lt':
          triggered = value < rule.threshold
          break
        case 'eq':
          triggered = value === rule.threshold
          break
        case 'gte':
          triggered = value >= rule.threshold
          break
        case 'lte':
          triggered = value <= rule.threshold
          break
      }

      if (triggered) {
        rule.lastTriggered = Date.now()
        const alert: Alert = {
          id: uuidv4(),
          ruleId: rule.id,
          ruleName: rule.name,
          metric,
          value,
          threshold: rule.threshold,
          timestamp: Date.now(),
          acknowledged: false,
        }
        this.alerts.push(alert)

        // 限制警报数量
        while (this.alerts.length > this.maxAlerts) {
          this.alerts.shift()
        }

        return alert
      }
    }
    return null
  }

  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId)
    if (alert) {
      alert.acknowledged = true
      return true
    }
    return false
  }

  getAlerts(limit?: number, unacknowledgedOnly = false): Alert[] {
    let alerts = this.alerts
    if (unacknowledgedOnly) {
      alerts = alerts.filter(a => !a.acknowledged)
    }
    return limit ? alerts.slice(-limit) : [...alerts]
  }

  getRules(): AlertRule[] {
    return [...this.rules]
  }
}

// ==================== Performance Monitor ====================

class PerformanceMonitor {
  private metricsCollector = new MetricsCollector()
  private requestTracer = new RequestTracer()
  private logger = new Logger()
  private alertManager = new AlertManager()
  private startTime = Date.now()
  private toolMetrics = {
    total: 0,
    success: 0,
    failed: 0,
    totalDuration: 0,
  }
  private listeners: ((metrics: PerformanceMetrics) => void)[] = []
  private updateInterval: ReturnType<typeof setInterval> | null = null
  private previousCpuUsage = 0
  private previousCpuTime = 0
  private websocketConnections = 0
  private activeSessions = 0

  constructor() {
    // 添加默认告警规则
    this.alertManager.addRule({
      name: 'High Memory Usage',
      condition: 'gt',
      metric: 'memory.heapUsed',
      threshold: 500 * 1024 * 1024, // 500MB
      enabled: true,
      cooldown: 60000,
    })

    this.alertManager.addRule({
      name: 'Slow Request',
      condition: 'gt',
      metric: 'request.duration',
      threshold: 5000, // 5s
      enabled: true,
      cooldown: 30000,
    })

    this.alertManager.addRule({
      name: 'High Error Rate',
      condition: 'gt',
      metric: 'requests.failed.rate',
      threshold: 0.1, // 10%
      enabled: true,
      cooldown: 120000,
    })
  }

  // 记录请求
  recordRequest(method: string, path: string): string {
    return this.requestTracer.startRequest(method, path)
  }

  endRequest(
    traceId: string,
    statusCode?: number,
    requestSize?: number,
    responseSize?: number,
    error?: string
  ): void {
    this.requestTracer.endRequest(traceId, statusCode, requestSize, responseSize, error)
    
    const stats = this.requestTracer.getStats()
    this.metricsCollector.record('requests.total', stats.total)
    this.metricsCollector.record('requests.success', stats.success)
    this.metricsCollector.record('requests.failed', stats.failed)
    this.metricsCollector.record('requests.duration', stats.avgDuration, 'ms')
  }

  // 记录工具执行
  recordToolExecution(name: string, duration: number, success: boolean): void {
    this.toolMetrics.total++
    this.toolMetrics.totalDuration += duration
    if (success) {
      this.toolMetrics.success++
    } else {
      this.toolMetrics.failed++
    }

    this.metricsCollector.record('tools.total', this.toolMetrics.total)
    this.metricsCollector.record('tools.success', this.toolMetrics.success)
    this.metricsCollector.record('tools.failed', this.toolMetrics.failed)
    this.metricsCollector.record('tools.duration', duration, 'ms')
    this.metricsCollector.record(`tool.${name}.duration`, duration, 'ms')

    // 检查告警
    this.alertManager.checkMetric('tools.duration', duration)
  }

  // 记录内存使用
  recordMemory(): void {
    const mem = process.memoryUsage()
    this.metricsCollector.record('memory.heapUsed', mem.heapUsed, 'bytes')
    this.metricsCollector.record('memory.heapTotal', mem.heapTotal, 'bytes')
    this.metricsCollector.record('memory.external', mem.external, 'bytes')
    this.metricsCollector.record('memory.rss', mem.rss, 'bytes')

    // 检查内存告警
    this.alertManager.checkMetric('memory.heapUsed', mem.heapUsed)
  }

  // 记录 WebSocket 连接
  recordWebSocketConnection(count: number): void {
    this.websocketConnections = count
    this.metricsCollector.record('websocket.connections', count)
  }

  // 记录活跃会话
  recordActiveSessions(count: number): void {
    this.activeSessions = count
    this.metricsCollector.record('sessions.active', count)
  }

  // 设置 WebSocket 连接数（供外部调用）
  setWebSocketStats(connections: number, sessions: number): void {
    this.websocketConnections = connections
    this.activeSessions = sessions
  }

  // 日志
  log = {
    debug: (message: string, source?: string, data?: unknown) => this.logger.debug(message, source, data),
    info: (message: string, source?: string, data?: unknown) => this.logger.info(message, source, data),
    warn: (message: string, source?: string, data?: unknown) => this.logger.warn(message, source, data),
    error: (message: string, source?: string, data?: unknown) => this.logger.error(message, source, data),
    fatal: (message: string, source?: string, data?: unknown) => this.logger.fatal(message, source, data),
  }

  // 获取性能指标
  getMetrics(): PerformanceMetrics {
    const mem = process.memoryUsage()
    const requestStats = this.requestTracer.getStats()

    return {
      uptime: Date.now() - this.startTime,
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        rss: mem.rss,
      },
      cpu: {
        usage: 0, // 需要实现 CPU 监控
        cores: require('os').cpus().length,
      },
      requests: {
        total: requestStats.total,
        success: requestStats.success,
        failed: requestStats.failed,
        avgDuration: requestStats.avgDuration,
      },
      tools: {
        total: this.toolMetrics.total,
        success: this.toolMetrics.success,
        failed: this.toolMetrics.failed,
        avgDuration: this.toolMetrics.total > 0
          ? this.toolMetrics.totalDuration / this.toolMetrics.total
          : 0,
      },
      connections: {
        websocket: 0, // 需要从 wsBridge 获取
        activeSessions: 0, // 需要从 sessionManager 获取
      },
    }
  }

  // 获取指标详情
  getMetricDetails(name: string) {
    return this.metricsCollector.getStats(name)
  }

  // 获取日志
  getLogs(limit?: number, level?: LogEntry['level']) {
    return this.logger.getLogs(limit, level)
  }

  // 订阅日志
  subscribeToLogs(listener: (entry: LogEntry) => void): () => void {
    return this.logger.subscribe(listener)
  }

  // 获取告警
  getAlerts(unacknowledgedOnly = false) {
    return this.alertManager.getAlerts(undefined, unacknowledgedOnly)
  }

  // 确认告警
  acknowledgeAlert(alertId: string) {
    return this.alertManager.acknowledgeAlert(alertId)
  }

  // 获取告警规则
  getAlertRules() {
    return this.alertManager.getRules()
  }

  // 添加告警规则
  addAlertRule(rule: Omit<AlertRule, 'id'>) {
    return this.alertManager.addRule(rule)
  }

  // 订阅性能指标更新
  subscribeToMetrics(listener: (metrics: PerformanceMetrics) => void): () => void {
    this.listeners.push(listener)
    return () => {
      const index = this.listeners.indexOf(listener)
      if (index >= 0) {
        this.listeners.splice(index, 1)
      }
    }
  }

  // 启动定期更新
  startPeriodicUpdates(intervalMs = 5000): void {
    if (this.updateInterval) return

    this.updateInterval = setInterval(() => {
      this.recordMemory()
      const metrics = this.getMetrics()
      for (const listener of this.listeners) {
        listener(metrics)
      }
    }, intervalMs)
  }

  // 停止定期更新
  stopPeriodicUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
  }

  // 导出数据
  export(): {
    metrics: PerformanceMetrics
    logs: LogEntry[]
    alerts: Alert[]
  } {
    return {
      metrics: this.getMetrics(),
      logs: this.logger.getLogs(),
      alerts: this.alertManager.getAlerts(),
    }
  }
}

// 导出单例
export const performanceMonitor = new PerformanceMonitor()

// 便捷函数
export const metrics = performanceMonitor.metricsCollector
export const tracer = performanceMonitor.requestTracer
export const logger = performanceMonitor.log
export const alerts = performanceMonitor.alertManager

export default PerformanceMonitor
