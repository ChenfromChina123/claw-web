/**
 * 容器管理 API 服务
 *
 * 提供容器管理相关的 API 调用（需要管理员权限）
 */

import apiClient from './client'
import { unwrapApiData } from './unwrapApiResponse'

/**
 * 容器信息
 */
export interface ContainerInfo {
  id: string
  name: string
  status: string
  state: string
  image: string
  createdAt: string
  ports: string
  networks: string
}

/**
 * 容器详情
 */
export interface ContainerDetail {
  id: string
  name: string
  state: any
  image: string
  created: string
  ports: any
  mounts: any[]
  env: string[]
  networks: string[]
  volumes: any
  stats?: {
    cpuPerc: string
    memUsage: string
    memPerc: string
    netIO: string
    blockIO: string
  }
}

/**
 * 容器列表响应
 */
export interface ContainerListResponse {
  containers: ContainerInfo[]
  total: number
  running: number
  stopped: number
}

/**
 * 容器池统计
 */
export interface PoolStats {
  containers: {
    total: number
    workerContainers: number
  }
  images: number
  volumes: number
  dockerVersion: string
  dockerStatus: string
}

/**
 * 操作结果
 */
export interface OperationResult {
  message: string
  containerId: string
}

/**
 * 清理结果
 */
export interface PruneResult {
  message: string
  spaceReclaimed: number
  containersRemoved: number
}

/**
 * 获取所有容器列表
 */
export async function getContainers(all: boolean = true): Promise<ContainerListResponse> {
  const response = await apiClient.get<ContainerListResponse>('/api/admin/containers', {
    params: { all }
  })
  return unwrapApiData(response.data)
}

/**
 * 获取容器详情
 */
export async function getContainerDetail(containerId: string): Promise<ContainerDetail> {
  const response = await apiClient.get<ContainerDetail>(`/api/admin/containers/${containerId}`)
  return unwrapApiData(response.data)
}

/**
 * 启动容器
 */
export async function startContainer(containerId: string): Promise<OperationResult> {
  const response = await apiClient.post<OperationResult>(`/api/admin/containers/${containerId}/start`)
  return unwrapApiData(response.data)
}

/**
 * 停止容器
 */
export async function stopContainer(containerId: string): Promise<OperationResult> {
  const response = await apiClient.post<OperationResult>(`/api/admin/containers/${containerId}/stop`)
  return unwrapApiData(response.data)
}

/**
 * 重启容器
 */
export async function restartContainer(containerId: string): Promise<OperationResult> {
  const response = await apiClient.post<OperationResult>(`/api/admin/containers/${containerId}/restart`)
  return unwrapApiData(response.data)
}

/**
 * 删除容器
 */
export async function deleteContainer(containerId: string): Promise<OperationResult> {
  const response = await apiClient.delete<OperationResult>(`/api/admin/containers/${containerId}`)
  return unwrapApiData(response.data)
}

/**
 * 清理未使用容器
 */
export async function pruneContainers(): Promise<PruneResult> {
  const response = await apiClient.post<PruneResult>('/api/admin/containers/prune')
  return unwrapApiData(response.data)
}

/**
 * 获取容器池统计
 */
export async function getPoolStats(): Promise<PoolStats> {
  const response = await apiClient.get<PoolStats>('/api/admin/pool/stats')
  return unwrapApiData(response.data)
}

/**
 * 格式化字节数
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
