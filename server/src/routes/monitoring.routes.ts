/**
 * 监控路由 - 处理监控相关 API
 */

import { performanceMonitor } from '../integration/performanceMonitor'
import { wsManager } from '../integration/wsBridge'
import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'

/**
 * 处理监控相关的 HTTP 请求
 */
export async function handleMonitoringRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  // ==================== 指标和日志 ====================

  // GET /api/monitoring/metrics - 获取性能指标
  if (path === '/api/monitoring/metrics' && method === 'GET') {
    return createSuccessResponse(performanceMonitor.getMetrics())
  }

  // GET /api/monitoring/logs - 获取日志
  if (path === '/api/monitoring/logs' && method === 'GET') {
    const limit = parseInt(url.searchParams.get('limit') || '100', 10)
    const level = url.searchParams.get('level') as 'debug' | 'info' | 'warn' | 'error' | 'fatal' | undefined
    const logs = performanceMonitor.getLogs(limit, level)
    return createSuccessResponse({ logs, count: logs.length })
  }

  // ==================== 告警管理 ====================

  // GET /api/monitoring/alerts - 获取告警
  if (path === '/api/monitoring/alerts' && method === 'GET') {
    const unacknowledgedOnly = url.searchParams.get('unacknowledged') === 'true'
    const alerts = performanceMonitor.getAlerts(undefined, unacknowledgedOnly)
    return createSuccessResponse({ alerts, count: alerts.length })
  }

  // POST /api/monitoring/alerts/acknowledge - 确认告警
  if (path === '/api/monitoring/alerts/acknowledge' && method === 'POST') {
    try {
      const body = await req.json() as { alertId: string }
      const success = performanceMonitor.acknowledgeAlert(body.alertId)
      return createSuccessResponse({ success, message: success ? 'Alert acknowledged' : 'Alert not found' })
    } catch {
      return createErrorResponse('INVALID_REQUEST', 'Failed to acknowledge alert', 400)
    }
  }

  // ==================== 告警规则 ====================

  // GET /api/monitoring/rules - 获取告警规则
  if (path === '/api/monitoring/rules' && method === 'GET') {
    const rules = performanceMonitor.getAlertRules()
    return createSuccessResponse({ rules, count: rules.length })
  }

  // POST /api/monitoring/rules - 添加告警规则
  if (path === '/api/monitoring/rules' && method === 'POST') {
    try {
      const body = await req.json() as {
        name: string
        condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
        metric: string
        threshold: number
        enabled?: boolean
        cooldown?: number
      }
      const rule = performanceMonitor.addAlertRule({
        name: body.name,
        condition: body.condition,
        metric: body.metric,
        threshold: body.threshold,
        enabled: body.enabled ?? true,
        cooldown: body.cooldown ?? 60000,
      })
      return createSuccessResponse({ rule })
    } catch {
      return createErrorResponse('INVALID_REQUEST', 'Failed to add alert rule', 400)
    }
  }

  // POST /api/monitoring/record - 记录指标
  if (path === '/api/monitoring/record' && method === 'POST') {
    try {
      const body = await req.json() as {
        name: string
        value: number
        unit?: string
        tags?: Record<string, string>
      }
      performanceMonitor.recordMetric(body.name, body.value, body.unit, body.tags)
      return createSuccessResponse({ recorded: true })
    } catch {
      return createErrorResponse('INVALID_REQUEST', 'Failed to record metric', 400)
    }
  }

  return null
}

export default handleMonitoringRoutes