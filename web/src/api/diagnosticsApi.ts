/**
 * 诊断 API 客户端
 * 
 * 提供系统健康状态和组件详细信息的 API 调用
 */

import apiClient from './client'
import { unwrapApiData } from './unwrapApiResponse'

/**
 * 组件健康状态
 */
export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  [key: string]: any
}

/**
 * 工具注册中心健康状态
 */
export interface ToolRegistryHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  toolCount: number
  sources: {
    builtin: number
    cli: number
    mcp: number
    custom: number
  }
}

/**
 * MCP 桥接健康状态
 */
export interface MCPBridgeHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  serverCount: number
  activeConnections: number
}

/**
 * CLI 工具加载器健康状态
 */
export interface CLIToolLoaderHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  loadedTools: number
  lastScan: string
}

/**
 * Skills 加载器健康状态
 */
export interface SkillLoaderHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  skillCount: number
  categories: Record<string, number>
}

/**
 * 性能监控器健康状态
 */
export interface PerformanceMonitorHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  memoryUsage: string
  cpuUsage: string
  wsConnections: number
}

/**
 * 健康检查响应数据
 */
export interface HealthStatusResponse {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  components: {
    toolRegistry: ToolRegistryHealth
    mcpBridge: MCPBridgeHealth
    cliToolLoader: CLIToolLoaderHealth
    skillLoader: SkillLoaderHealth
    performanceMonitor: PerformanceMonitorHealth
  }
  timestamp: string
}

/**
 * 组件详细信息响应数据
 */
export interface ComponentsDetailResponse {
  toolRegistry: {
    totalTools: number
    byCategory: Record<string, any[]>
    historySize: number
  }
  mcpBridge: {
    servers: any[]
    totalTools: number
  }
  cliToolLoader: {
    loadedTools: number
    lastScan: string
    errors: any[]
  }
  skillLoader: {
    loadedSkills: number
    byCategory: Record<string, any[]>
  }
  performanceMonitor: {
    metrics: any
    alerts: any[]
  }
  websocket: {
    totalConnections: number
    activeSessions: number
  }
  timestamp: string
}

/**
 * 获取系统健康状态
 */
export async function getHealthStatus(): Promise<HealthStatusResponse> {
  const response = await apiClient.get('/diagnostics/health')
  return unwrapApiData<HealthStatusResponse>(response)
}

/**
 * 获取组件详细信息
 */
export async function getComponentsDetail(): Promise<ComponentsDetailResponse> {
  const response = await apiClient.get('/diagnostics/components')
  return unwrapApiData<ComponentsDetailResponse>(response)
}

export default {
  getHealthStatus,
  getComponentsDetail,
}
