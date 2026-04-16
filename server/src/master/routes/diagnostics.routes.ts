/**
 * 诊断路由 - 处理诊断相关 API
 */

import { performanceMonitor } from '../integration/performanceMonitor'
import { wsManager } from '../integration/wsBridge'
import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'
import { toolExecutor } from '../integration/enhancedToolExecutor'

/**
 * 处理诊断相关的 HTTP 请求
 */
export async function handleDiagnosticsRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  // ==================== 健康检查 ====================

  // GET /api/diagnostics/health - 获取系统健康状态
  if (path === '/api/diagnostics/health' && method === 'GET') {
    try {
      const dbConnected = true
      const healthStatus = performanceMonitor.getHealthStatus(dbConnected)
      
      // 更新 WebSocket 连接数
      const connections = wsManager.getAllConnections().size
      const sessions = wsManager.getActiveSessions().size
      performanceMonitor.setWebSocketStats(connections, sessions)
      
      const updatedHealthStatus = performanceMonitor.getHealthStatus(dbConnected)
      
      return createSuccessResponse(updatedHealthStatus)
    } catch (error) {
      const message = error instanceof Error ? error.message : '健康检查失败'
      return createErrorResponse('HEALTH_CHECK_FAILED', message, 500)
    }
  }

  // ==================== 组件信息 ====================

  // GET /api/diagnostics/components - 获取组件详细信息
  if (path === '/api/diagnostics/components' && method === 'GET') {
    try {
      const dbConnected = true
      const healthStatus = performanceMonitor.getHealthStatus(dbConnected)
      
      // 更新 WebSocket 连接数
      const connections = wsManager.getAllConnections().size
      const sessions = wsManager.getActiveSessions().size
      performanceMonitor.setWebSocketStats(connections, sessions)
      
      // 获取更新后的健康状态
      const updatedHealthStatus = performanceMonitor.getHealthStatus(dbConnected)
      
      // 获取性能指标
      const metrics = performanceMonitor.getMetrics()
      
      // 获取告警规则
      const rules = performanceMonitor.getAlertRules()
      
      // 获取未确认的告警
      const alerts = performanceMonitor.getAlerts(undefined, true)
      
      return createSuccessResponse({
        health: updatedHealthStatus,
        metrics: {
          uptime: metrics.uptime,
          memory: metrics.memory,
          cpu: metrics.cpu,
          requests: metrics.requests,
          tools: metrics.tools,
          connections: metrics.connections,
        },
        alerts: {
          rules: rules.length,
          active: alerts.length,
          details: alerts,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取组件信息失败'
      return createErrorResponse('COMPONENTS_INFO_FAILED', message, 500)
    }
  }

  return null
}

export default handleDiagnosticsRoutes