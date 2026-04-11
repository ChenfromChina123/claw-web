/**
 * 性能监控 API 接口
 * 提供 REST API 调用方式，与 WebSocket RPC 互补
 */

import apiClient from './client'
import { unwrapApiData } from './unwrapApiResponse'
import type { ApiResponse } from '@/types'

export interface MonitoringMetrics {
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

export interface LogEntry {
  id: string
  level: string
  message: string
  timestamp: number
  source?: string
}

export interface AlertEntry {
  id: string
  ruleName: string
  metric: string
  value: number
  threshold: number
  timestamp: number
  acknowledged: boolean
}

export interface MonitoringLogsResponse {
  data: LogEntry[]
  count: number
}

export interface MonitoringAlertsResponse {
  data: AlertEntry[]
  count: number
}

export interface AcknowledgeAlertRequest {
  alertId: string
}

export interface AcknowledgeAlertResponse {
  message: string
}

export const monitoringApi = {
  /**
   * 获取性能指标
   */
  async getMetrics(): Promise<MonitoringMetrics> {
    const { data } = await apiClient.get<ApiResponse<MonitoringMetrics>>('/monitoring/metrics')
    return unwrapApiData(data)
  },

  /**
   * 获取日志列表
   * @param limit 日志数量限制，默认 50
   */
  async getLogs(limit: number = 50): Promise<LogEntry[]> {
    const { data } = await apiClient.get<ApiResponse<LogEntry[]>>('/monitoring/logs', {
      params: { limit }
    })
    return unwrapApiData(data)
  },

  /**
   * 获取告警列表
   * @param unacknowledged 是否只获取未确认的告警
   */
  async getAlerts(unacknowledged: boolean = true): Promise<AlertEntry[]> {
    const { data } = await apiClient.get<ApiResponse<AlertEntry[]>>('/monitoring/alerts', {
      params: { unacknowledged }
    })
    return unwrapApiData(data)
  },

  /**
   * 确认告警
   * @param alertId 告警 ID
   */
  async acknowledgeAlert(alertId: string): Promise<AcknowledgeAlertResponse> {
    const { data } = await apiClient.post<ApiResponse<AcknowledgeAlertResponse>>(
      '/monitoring/alerts/acknowledge',
      { alertId }
    )
    return unwrapApiData(data)
  },
}

export default monitoringApi
