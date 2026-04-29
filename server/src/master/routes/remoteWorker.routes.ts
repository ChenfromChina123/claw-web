/**
 * 远程 Worker 管理 API 路由
 *
 * 提供的端点：
 * - POST /api/admin/remote-workers/precheck - 环境预检查
 * - POST /api/admin/remote-workers/deploy - 部署远程 Worker
 * - GET /api/admin/remote-workers - 获取所有远程 Worker 列表
 * - GET /api/admin/remote-workers/:id - 获取远程 Worker 详情
 * - GET /api/admin/remote-workers/:id/status - 获取部署状态
 * - DELETE /api/admin/remote-workers/:id - 移除远程 Worker
 *
 * @module RemoteWorkerRoutes
 */

import type { Request, Response } from 'express'
import { createSuccessResponse, createErrorResponse } from '../utils/response'
import { verifyToken } from '../utils/auth'
import { getPool } from '../db/mysql'
import { environmentChecker } from '../orchestrator/environmentChecker'
import { getRemoteWorkerDeployer } from '../orchestrator/remoteWorkerDeployer'
import { getRemoteWorkerRegistry } from '../orchestrator/remoteWorkerRegistry'

/**
 * 处理远程 Worker 管理相关的 HTTP 请求
 */
export async function handleRemoteWorkerRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  }

  // 只处理 /api/admin/remote-workers 路径
  if (!path.startsWith('/api/admin/remote-workers')) {
    return null
  }

  // 验证管理员权限
  const authResult = await verifyAdminPermission(req)
  if (authResult.error) {
    return authResult.error
  }

  // 环境预检查
  // POST /api/admin/remote-workers/precheck
  if (path === '/api/admin/remote-workers/precheck' && method === 'POST') {
    return handlePrecheck(req)
  }

  // 部署远程 Worker
  // POST /api/admin/remote-workers/deploy
  if (path === '/api/admin/remote-workers/deploy' && method === 'POST') {
    return handleDeploy(req)
  }

  // 获取所有远程 Worker 列表
  // GET /api/admin/remote-workers
  if (path === '/api/admin/remote-workers' && method === 'GET') {
    return handleGetWorkers(req)
  }

  // 获取远程 Worker 详情
  // GET /api/admin/remote-workers/:id
  const detailMatch = path.match(/^\/api\/admin\/remote-workers\/([^/]+)$/)
  if (detailMatch && method === 'GET') {
    return handleGetWorkerDetail(req, detailMatch[1])
  }

  // 获取部署状态
  // GET /api/admin/remote-workers/:id/status
  const statusMatch = path.match(/^\/api\/admin\/remote-workers\/([^/]+)\/status$/)
  if (statusMatch && method === 'GET') {
    return handleGetWorkerStatus(req, statusMatch[1])
  }

  // 移除远程 Worker
  // DELETE /api/admin/remote-workers/:id
  if (detailMatch && method === 'DELETE') {
    return handleRemoveWorker(req, detailMatch[1])
  }

  return null
}

/**
 * 验证管理员权限
 */
async function verifyAdminPermission(req: Request): Promise<{ userId?: string; error?: Response }> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: createErrorResponse('UNAUTHORIZED', '未提供认证令牌', 401) }
  }

  const token = authHeader.substring(7)
  const payload = await verifyToken(token)

  if (!payload || !payload.userId) {
    return { error: createErrorResponse('UNAUTHORIZED', '无效的认证令牌', 401) }
  }

  // 检查管理员权限
  const pool = getPool()
  const [rows] = await pool.query(
    'SELECT is_admin FROM users WHERE id = ?',
    [payload.userId]
  ) as [any[], unknown]

  if (rows.length === 0 || !rows[0].is_admin) {
    return { error: createErrorResponse('FORBIDDEN', '需要管理员权限', 403) }
  }

  return { userId: payload.userId }
}

/**
 * 处理环境预检查请求
 */
async function handlePrecheck(req: Request): Promise<Response> {
  try {
    const body = await req.json()
    const { host, port, username, password, workerPort } = body

    // 参数验证
    if (!host || !username || !password) {
      return createErrorResponse('BAD_REQUEST', '缺少必要参数: host, username, password', 400)
    }

    const sshPort = port || 22
    const targetWorkerPort = workerPort || 4000

    console.log(`[RemoteWorkerRoutes] 执行环境预检查: ${username}@${host}:${sshPort}`)

    // 执行环境检查
    const result = await environmentChecker.checkEnvironment(
      host,
      sshPort,
      username,
      password,
      targetWorkerPort
    )

    return createSuccessResponse({
      passed: result.passed,
      checks: result.checks
    })
  } catch (error) {
    console.error('[RemoteWorkerRoutes] 环境预检查失败:', error)
    return createErrorResponse(
      'PRECHECK_FAILED',
      error instanceof Error ? error.message : '环境预检查失败',
      500
    )
  }
}

/**
 * 处理部署请求
 */
async function handleDeploy(req: Request): Promise<Response> {
  try {
    const body = await req.json()
    const { host, port, username, password, workerPort, labels } = body

    // 参数验证
    if (!host || !username || !password) {
      return createErrorResponse('BAD_REQUEST', '缺少必要参数: host, username, password', 400)
    }

    const deployConfig = {
      host,
      sshPort: port || 22,
      username,
      password,
      workerPort: workerPort || 4000,
      labels
    }

    console.log(`[RemoteWorkerRoutes] 开始部署远程 Worker: ${username}@${host}`)

    // 先执行环境检查
    const envCheck = await environmentChecker.checkEnvironment(
      deployConfig.host,
      deployConfig.sshPort,
      deployConfig.username,
      deployConfig.password,
      deployConfig.workerPort
    )

    if (!envCheck.passed) {
      return createErrorResponse(
        'ENV_CHECK_FAILED',
        '环境检查未通过，无法部署',
        400,
        { checks: envCheck.checks }
      )
    }

    // 执行部署
    const deployer = getRemoteWorkerDeployer()
    const result = await deployer.deploy(deployConfig)

    return createSuccessResponse({
      workerId: result.workerId,
      status: result.status,
      host: result.host,
      port: result.port,
      progress: result.progress.map(p => ({
        step: p.step,
        status: p.status,
        message: p.message,
        timestamp: p.timestamp.toISOString()
      }))
    })
  } catch (error) {
    console.error('[RemoteWorkerRoutes] 部署失败:', error)
    return createErrorResponse(
      'DEPLOY_FAILED',
      error instanceof Error ? error.message : '部署失败',
      500
    )
  }
}

/**
 * 获取所有远程 Worker 列表
 */
async function handleGetWorkers(req: Request): Promise<Response> {
  try {
    const registry = getRemoteWorkerRegistry()
    const workers = registry.getAllWorkers()

    // 过滤敏感信息
    const sanitizedWorkers = workers.map(w => ({
      workerId: w.workerId,
      host: w.host,
      port: w.port,
      status: w.status,
      healthStatus: w.healthStatus,
      labels: w.labels,
      dockerVersion: w.dockerVersion,
      systemInfo: w.systemInfo,
      lastHeartbeatAt: w.lastHeartbeatAt?.toISOString(),
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString()
    }))

    const stats = registry.getStats()

    return createSuccessResponse({
      workers: sanitizedWorkers,
      stats
    })
  } catch (error) {
    console.error('[RemoteWorkerRoutes] 获取 Worker 列表失败:', error)
    return createErrorResponse('GET_WORKERS_FAILED', '获取 Worker 列表失败', 500)
  }
}

/**
 * 获取远程 Worker 详情
 */
async function handleGetWorkerDetail(req: Request, workerId: string): Promise<Response> {
  try {
    const registry = getRemoteWorkerRegistry()
    const worker = registry.getWorker(workerId)

    if (!worker) {
      return createErrorResponse('NOT_FOUND', 'Worker 不存在', 404)
    }

    return createSuccessResponse({
      workerId: worker.workerId,
      host: worker.host,
      port: worker.port,
      sshPort: worker.sshPort,
      sshUsername: worker.sshUsername,
      status: worker.status,
      healthStatus: worker.healthStatus,
      labels: worker.labels,
      dockerVersion: worker.dockerVersion,
      systemInfo: worker.systemInfo,
      lastHeartbeatAt: worker.lastHeartbeatAt?.toISOString(),
      createdAt: worker.createdAt.toISOString(),
      updatedAt: worker.updatedAt.toISOString()
    })
  } catch (error) {
    console.error('[RemoteWorkerRoutes] 获取 Worker 详情失败:', error)
    return createErrorResponse('GET_WORKER_FAILED', '获取 Worker 详情失败', 500)
  }
}

/**
 * 获取远程 Worker 部署状态
 */
async function handleGetWorkerStatus(req: Request, workerId: string): Promise<Response> {
  try {
    const registry = getRemoteWorkerRegistry()
    const worker = registry.getWorker(workerId)

    if (!worker) {
      return createErrorResponse('NOT_FOUND', 'Worker 不存在', 404)
    }

    // 从数据库获取部署日志
    const pool = getPool()
    const [logs] = await pool.query(
      'SELECT step, status, message, created_at FROM remote_worker_deploy_logs WHERE worker_id = ? ORDER BY created_at ASC',
      [workerId]
    ) as [any[], unknown]

    return createSuccessResponse({
      workerId: worker.workerId,
      status: worker.status,
      healthStatus: worker.healthStatus,
      host: worker.host,
      port: worker.port,
      lastHeartbeatAt: worker.lastHeartbeatAt?.toISOString(),
      progress: logs.map(log => ({
        step: log.step,
        status: log.status,
        message: log.message,
        timestamp: log.created_at
      }))
    })
  } catch (error) {
    console.error('[RemoteWorkerRoutes] 获取 Worker 状态失败:', error)
    return createErrorResponse('GET_STATUS_FAILED', '获取 Worker 状态失败', 500)
  }
}

/**
 * 移除远程 Worker
 */
async function handleRemoveWorker(req: Request, workerId: string): Promise<Response> {
  try {
    const registry = getRemoteWorkerRegistry()
    const worker = registry.getWorker(workerId)

    if (!worker) {
      return createErrorResponse('NOT_FOUND', 'Worker 不存在', 404)
    }

    // 更新状态为 removing
    await registry.updateWorkerStatus(workerId, 'removing', 'unknown')

    // 从注册表中移除
    await registry.removeWorker(workerId)

    console.log(`[RemoteWorkerRoutes] 远程 Worker 已移除: ${workerId}`)

    return createSuccessResponse({
      message: 'Worker 已移除',
      workerId
    })
  } catch (error) {
    console.error('[RemoteWorkerRoutes] 移除 Worker 失败:', error)
    return createErrorResponse('REMOVE_WORKER_FAILED', '移除 Worker 失败', 500)
  }
}

export default handleRemoteWorkerRoutes
