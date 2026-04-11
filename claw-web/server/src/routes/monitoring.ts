/**
 * 性能监控 API 路由
 */

import type { Context } from 'hono'
import { performanceMonitor } from '../integration/performanceMonitor'

// 获取性能指标
export async function getMetrics(c: Context) {
  try {
    const metrics = performanceMonitor.getMetrics()
    return c.json({ success: true, data: metrics })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
}

// 获取特定指标详情
export async function getMetricDetails(c: Context) {
  try {
    const name = c.req.query('name')
    if (!name) {
      return c.json({ success: false, error: 'Missing name parameter' }, 400)
    }

    const details = performanceMonitor.getMetricDetails(name)
    return c.json({ success: true, data: details })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
}

// 获取日志
export async function getLogs(c: Context) {
  try {
    const limit = parseInt(c.req.query('limit') || '100', 10)
    const level = c.req.query('level') as 'debug' | 'info' | 'warn' | 'error' | 'fatal' | undefined

    const logs = performanceMonitor.getLogs(limit, level)
    return c.json({ success: true, data: logs })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
}

// 获取告警
export async function getAlerts(c: Context) {
  try {
    const unacknowledgedOnly = c.req.query('unacknowledged') === 'true'
    const alerts = performanceMonitor.getAlerts(unacknowledgedOnly)
    return c.json({ success: true, data: alerts })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
}

// 确认告警
export async function acknowledgeAlert(c: Context) {
  try {
    const { alertId } = await c.req.json() as { alertId: string }
    if (!alertId) {
      return c.json({ success: false, error: 'Missing alertId' }, 400)
    }

    const success = performanceMonitor.acknowledgeAlert(alertId)
    return c.json({ success, message: success ? 'Alert acknowledged' : 'Alert not found' })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
}

// 获取告警规则
export async function getAlertRules(c: Context) {
  try {
    const rules = performanceMonitor.getAlertRules()
    return c.json({ success: true, data: rules })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
}

// 添加告警规则
export async function addAlertRule(c: Context) {
  try {
    const rule = await c.req.json() as {
      name: string
      condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
      metric: string
      threshold: number
      enabled?: boolean
      cooldown?: number
    }

    if (!rule.name || !rule.condition || !rule.metric || rule.threshold === undefined) {
      return c.json({ 
        success: false, 
        error: 'Missing required fields: name, condition, metric, threshold' 
      }, 400)
    }

    const newRule = performanceMonitor.addAlertRule({
      name: rule.name,
      condition: rule.condition,
      metric: rule.metric,
      threshold: rule.threshold,
      enabled: rule.enabled ?? true,
      cooldown: rule.cooldown ?? 60000,
    })

    return c.json({ success: true, data: newRule })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
}

// 导出监控数据
export async function exportMetrics(c: Context) {
  try {
    const data = performanceMonitor.export()
    return c.json({ success: true, data })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
}

// 记录自定义指标 (用于客户端上报)
export async function recordMetric(c: Context) {
  try {
    const body = await c.req.json() as {
      name: string
      value: number
      unit?: string
      tags?: Record<string, string>
    }

    if (!body.name || body.value === undefined) {
      return c.json({ 
        success: false, 
        error: 'Missing required fields: name, value' 
      }, 400)
    }

    performanceMonitor.metricsCollector.record(body.name, body.value, body.unit || '', body.tags)
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
}

// 记录工具执行
export async function recordToolExecution(c: Context) {
  try {
    const body = await c.req.json() as {
      name: string
      duration: number
      success: boolean
    }

    if (!body.name || body.duration === undefined || body.success === undefined) {
      return c.json({ 
        success: false, 
        error: 'Missing required fields: name, duration, success' 
      }, 400)
    }

    performanceMonitor.recordToolExecution(body.name, body.duration, body.success)
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500)
  }
}

export default {
  getMetrics,
  getMetricDetails,
  getLogs,
  getAlerts,
  acknowledgeAlert,
  getAlertRules,
  addAlertRule,
  exportMetrics,
  recordMetric,
  recordToolExecution,
}
