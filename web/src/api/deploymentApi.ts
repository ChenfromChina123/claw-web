/**
 * 项目部署 API 服务
 * 
 * 提供的接口：
 * - 创建项目部署
 * - 获取项目列表
 * - 获取项目详情
 * - 启动/停止/重启项目
 * - 删除项目
 * - 获取项目日志
 * - 获取项目状态
 */

import client from './client'
import type { ApiResponse } from './unwrapApiResponse'

// ==================== 类型定义 ====================

/**
 * 项目类型
 */
export type ProjectType = 'nodejs' | 'python' | 'static' | 'custom'

/**
 * 项目状态
 */
export type ProjectStatus = 'running' | 'stopped' | 'error' | 'building'

/**
 * 进程管理器类型
 */
export type ProcessManager = 'pm2' | 'supervisor'

/**
 * 项目部署信息
 */
export interface ProjectDeployment {
  projectId: string
  userId: string
  workerContainerId: string
  workerPort: number
  internalPort: number
  name: string
  type: ProjectType
  status: ProjectStatus
  domain?: string
  sourcePath: string
  buildCommand?: string
  startCommand: string
  envVars: Record<string, string>
  processManager: ProcessManager
  autoRestart: boolean
  createdAt: string
  updatedAt: string
}

/**
 * 创建部署请求
 */
export interface CreateDeploymentRequest {
  name: string
  type: ProjectType
  sourceType: 'upload' | 'git' | 'template'
  sourceUrl?: string
  sourceCode?: string
  buildCommand?: string
  startCommand: string
  envVars?: Record<string, string>
  memoryLimit?: string
  autoRestart?: boolean
}

/**
 * 项目状态信息
 */
export interface ProjectStatus {
  running: boolean
  pid?: number
  memory?: number
  cpu?: number
  uptime?: number
  status?: string
  port?: number
}

/**
 * 项目日志
 */
export interface ProjectLogs {
  stdout: string
  stderr: string
}

// ==================== API 函数 ====================

/**
 * 创建新项目部署
 */
export async function createDeployment(
  data: CreateDeploymentRequest
): Promise<ApiResponse<ProjectDeployment>> {
  const response = await client.post('/api/deployments', data)
  return response.data
}

/**
 * 获取用户所有项目
 */
export async function getDeployments(): Promise<ApiResponse<{
  total: number
  projects: ProjectDeployment[]
}>> {
  const response = await client.get('/api/deployments')
  return response.data
}

/**
 * 获取项目详情
 */
export async function getDeployment(
  projectId: string
): Promise<ApiResponse<ProjectDeployment>> {
  const response = await client.get(`/api/deployments/${projectId}`)
  return response.data
}

/**
 * 启动项目
 */
export async function startDeployment(
  projectId: string
): Promise<ApiResponse<void>> {
  const response = await client.post(`/api/deployments/${projectId}/start`)
  return response.data
}

/**
 * 停止项目
 */
export async function stopDeployment(
  projectId: string
): Promise<ApiResponse<void>> {
  const response = await client.post(`/api/deployments/${projectId}/stop`)
  return response.data
}

/**
 * 重启项目
 */
export async function restartDeployment(
  projectId: string
): Promise<ApiResponse<void>> {
  const response = await client.post(`/api/deployments/${projectId}/restart`)
  return response.data
}

/**
 * 删除项目
 */
export async function deleteDeployment(
  projectId: string
): Promise<ApiResponse<void>> {
  const response = await client.delete(`/api/deployments/${projectId}`)
  return response.data
}

/**
 * 获取项目日志
 */
export async function getDeploymentLogs(
  projectId: string,
  lines: number = 100
): Promise<ApiResponse<ProjectLogs>> {
  const response = await client.get(`/api/deployments/${projectId}/logs`, {
    params: { lines }
  })
  return response.data
}

/**
 * 获取项目状态
 */
export async function getDeploymentStatus(
  projectId: string
): Promise<ApiResponse<ProjectStatus>> {
  const response = await client.get(`/api/deployments/${projectId}/status`)
  return response.data
}

// ==================== 外部访问 API ====================

/**
 * 为项目分配域名
 */
export async function assignDomain(
  projectId: string,
  customDomain?: string
): Promise<ApiResponse<any>> {
  const response = await client.post('/api/external-access/domain', {
    projectId,
    customDomain
  })
  return response.data
}

/**
 * 验证域名所有权
 */
export async function verifyDomain(
  domain: string,
  method: 'dns' | 'http' = 'dns'
): Promise<ApiResponse<any>> {
  const response = await client.post('/api/external-access/domain/verify', {
    domain,
    method
  })
  return response.data
}

/**
 * 申请 SSL 证书
 */
export async function requestSSLCertificate(data: {
  domain: string
  email: string
  staging?: boolean
  wildcard?: boolean
}): Promise<ApiResponse<any>> {
  const response = await client.post('/api/external-access/ssl', data)
  return response.data
}

/**
 * 创建内网穿透隧道
 */
export async function createTunnel(data: {
  projectId: string
  type: 'cloudflare' | 'cpolar' | 'frp'
  localPort: number
  subdomain?: string
  customDomain?: string
}): Promise<ApiResponse<any>> {
  const response = await client.post('/api/external-access/tunnel', data)
  return response.data
}

/**
 * 配置反向代理
 */
export async function configureProxy(data: {
  projectId: string
  domain: string
  workerPort: number
  internalPort: number
  sslEnabled?: boolean
}): Promise<ApiResponse<any>> {
  const response = await client.post('/api/external-access/proxy', data)
  return response.data
}
