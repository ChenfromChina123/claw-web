/**
 * 性能监控 API 服务
 *
 * 提供系统性能监控相关的 API 调用
 */

import { request } from './request'

/**
 * 系统健康状态
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded'
  components: {
    database: { status: string; message: string }
    docker: { status: string; message: string }
    disk: { status: string; message: string; usage?: number }
  }
  timestamp: string
}

/**
 * 资源使用情况
 */
export interface ResourceUsage {
  cpu: {
    usagePercent: number
    coreCount: number
    model: string
    loadAverage: number[]
  }
  memory: {
    totalBytes: number
    usedBytes: number
    freeBytes: number
    usagePercent: string
  }
  process: {
    count: number
  }
  timestamp: string
}

/**
 * 容器信息
 */
export interface ContainerInfo {
  id: string
  name: string
  status: string
  state: string
  image: string
  created: string
  ports: string
  cpu?: string
  memUsage?: string
  memPerc?: string
}

/**
 * 容器状态
 */
export interface ContainerStatus {
  containers: ContainerInfo[]
  total: number
  running: number
  stopped: number
  timestamp: string
}

/**
 * 性能统计
 */
export interface PerformanceStats {
  database: {
    queries: number
    connections: number
    slowQueries: number
  }
  containers: {
    running: number
  }
  system: {
    loadAverage: number[]
    cpuCount: number
  }
  timestamp: string
}

/**
 * 获取系统健康状态
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const response = await request.get<HealthStatus>('/api/monitoring/health')
  return response.data
}

/**
 * 获取资源使用情况
 */
export async function getResourceUsage(): Promise<ResourceUsage> {
  const response = await request.get<ResourceUsage>('/api/monitoring/resources')
  return response.data
}

/**
 * 获取容器状态
 */
export async function getContainerStatus(): Promise<ContainerStatus> {
  const response = await request.get<ContainerStatus>('/api/monitoring/containers')
  return response.data
}

/**
 * 获取性能统计
 */
export async function getPerformanceStats(): Promise<PerformanceStats> {
  const response = await request.get<PerformanceStats>('/api/monitoring/performance')
  return response.data
}

/**
 * 格式化字节数为可读字符串
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 格式化百分比
 */
export function formatPercent(value: string | number): string {
  if (typeof value === 'string') return value
  return value.toFixed(1) + '%'
}
