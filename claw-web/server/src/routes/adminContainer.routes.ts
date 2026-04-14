/**
 * 容器管理 API 路由
 *
 * 提供的端点：
 * - GET /api/admin/containers - 获取所有容器列表
 * - GET /api/admin/containers/:id - 获取容器详情
 * - POST /api/admin/containers/:id/start - 启动容器
 * - POST /api/admin/containers/:id/stop - 停止容器
 * - POST /api/admin/containers/:id/restart - 重启容器
 * - DELETE /api/admin/containers/:id - 删除容器
 * - POST /api/admin/containers/prune - 清理未使用容器
 * - GET /api/admin/pool/stats - 获取容器池统计
 */

import type { Request, Response } from 'express'
import { createSuccessResponse, createErrorResponse } from '../utils/response'
import { verifyToken } from '../utils/auth'
import { getPool } from '../db/mysql'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * 处理容器管理相关的 HTTP 请求
 */
export async function handleAdminContainerRoutes(req: Request): Promise<Response | null> {
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

  // 验证管理员权限
  const authResult = await verifyAdminPermission(req)
  if (authResult.error) {
    return authResult.error
  }

  // 获取所有容器列表
  // GET /api/admin/containers
  if (path === '/api/admin/containers' && method === 'GET') {
    return handleGetContainers(req)
  }

  // 获取容器池统计
  // GET /api/admin/pool/stats
  if (path === '/api/admin/pool/stats' && method === 'GET') {
    return handleGetPoolStats(req)
  }

  // 获取容器详情
  // GET /api/admin/containers/:id
  const detailMatch = path.match(/^\/api\/admin\/containers\/([^/]+)$/)
  if (detailMatch && method === 'GET') {
    return handleGetContainerDetail(req, detailMatch[1])
  }

  // 启动容器
  // POST /api/admin/containers/:id/start
  const startMatch = path.match(/^\/api\/admin\/containers\/([^/]+)\/start$/)
  if (startMatch && method === 'POST') {
    return handleStartContainer(req, startMatch[1])
  }

  // 停止容器
  // POST /api/admin/containers/:id/stop
  const stopMatch = path.match(/^\/api\/admin\/containers\/([^/]+)\/stop$/)
  if (stopMatch && method === 'POST') {
    return handleStopContainer(req, stopMatch[1])
  }

  // 重启容器
  // POST /api/admin/containers/:id/restart
  const restartMatch = path.match(/^\/api\/admin\/containers\/([^/]+)\/restart$/)
  if (restartMatch && method === 'POST') {
    return handleRestartContainer(req, restartMatch[1])
  }

  // 删除容器
  // DELETE /api/admin/containers/:id
  if (detailMatch && method === 'DELETE') {
    return handleDeleteContainer(req, detailMatch[1])
  }

  // 清理未使用容器
  // POST /api/admin/containers/prune
  if (path === '/api/admin/containers/prune' && method === 'POST') {
    return handlePruneContainers(req)
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
 * 获取所有容器列表
 */
async function handleGetContainers(req: Request): Promise<Response> {
  try {
    const all = req.query.all === 'true'

    let cmd = 'docker ps'
    if (all) {
      cmd = 'docker ps -a'
    }

    const { stdout } = await execAsync(
      `${cmd} --format "{{.ID}}|{{.Names}}|{{.Status}}|{{.State}}|{{.Image}}|{{.CreatedAt}}|{{.Ports}}|{{.Networks}}"`,
      { timeout: 10000 }
    )

    const containers = stdout.trim().split('\n').filter(Boolean).map(line => {
      const [id, names, status, state, image, createdAt, ports, networks] = line.split('|')
      return {
        id,
        name: names,
        status,
        state,
        image,
        createdAt,
        ports: ports || '',
        networks: networks || ''
      }
    })

    return createSuccessResponse({
      containers,
      total: containers.length,
      running: containers.filter(c => c.state === 'running').length,
      stopped: containers.filter(c => c.state !== 'running').length
    })
  } catch (error) {
    console.error('[AdminContainerRoutes] 获取容器列表失败:', error)
    return createErrorResponse('GET_CONTAINERS_FAILED', '获取容器列表失败', 500)
  }
}

/**
 * 获取容器详情
 */
async function handleGetContainerDetail(req: Request, containerId: string): Promise<Response> {
  try {
    const { stdout } = await execAsync(
      `docker inspect ${containerId} --format "{{json .}}"`,
      { timeout: 10000 }
    )

    const inspect = JSON.parse(stdout)

    // 获取资源使用情况
    let stats = null
    try {
      const statsOutput = await execAsync(
        `docker stats ${containerId} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}"`,
        { timeout: 5000 }
      )
      const [cpuPerc, memUsage, memPerc, netIO, blockIO] = statsOutput.stdout.trim().split('|')
      stats = { cpuPerc, memUsage, memPerc, netIO, blockIO }
    } catch {
      // stats 可能获取失败，忽略
    }

    const details = {
      id: inspect.Id,
      name: inspect.Name.replace('/', ''),
      state: inspect.State,
      image: inspect.Config.Image,
      created: inspect.Created,
      ports: inspect.NetworkSettings.Ports,
      mounts: inspect.Mounts,
      env: inspect.Config.Env?.slice(0, 10), // 只返回前10个环境变量
      networks: Object.keys(inspect.NetworkSettings.Networks || {}),
      volumes: inspect.Config.Volumes,
      stats
    }

    return createSuccessResponse(details)
  } catch (error) {
    console.error('[AdminContainerRoutes] 获取容器详情失败:', error)
    return createErrorResponse('GET_CONTAINER_DETAIL_FAILED', '获取容器详情失败', 500)
  }
}

/**
 * 启动容器
 */
async function handleStartContainer(req: Request, containerId: string): Promise<Response> {
  try {
    await execAsync(`docker start ${containerId}`, { timeout: 30000 })
    console.log(`[AdminContainerRoutes] 容器已启动: ${containerId}`)
    return createSuccessResponse({ message: '容器启动成功', containerId })
  } catch (error) {
    console.error('[AdminContainerRoutes] 启动容器失败:', error)
    return createErrorResponse('START_CONTAINER_FAILED', '启动容器失败', 500)
  }
}

/**
 * 停止容器
 */
async function handleStopContainer(req: Request, containerId: string): Promise<Response> {
  try {
    await execAsync(`docker stop -t 10 ${containerId}`, { timeout: 30000 })
    console.log(`[AdminContainerRoutes] 容器已停止: ${containerId}`)
    return createSuccessResponse({ message: '容器停止成功', containerId })
  } catch (error) {
    console.error('[AdminContainerRoutes] 停止容器失败:', error)
    return createErrorResponse('STOP_CONTAINER_FAILED', '停止容器失败', 500)
  }
}

/**
 * 重启容器
 */
async function handleRestartContainer(req: Request, containerId: string): Promise<Response> {
  try {
    await execAsync(`docker restart -t 10 ${containerId}`, { timeout: 60000 })
    console.log(`[AdminContainerRoutes] 容器已重启: ${containerId}`)
    return createSuccessResponse({ message: '容器重启成功', containerId })
  } catch (error) {
    console.error('[AdminContainerRoutes] 重启容器失败:', error)
    return createErrorResponse('RESTART_CONTAINER_FAILED', '重启容器失败', 500)
  }
}

/**
 * 删除容器
 */
async function handleDeleteContainer(req: Request, containerId: string): Promise<Response> {
  try {
    // 先尝试停止
    try {
      await execAsync(`docker stop -t 5 ${containerId}`, { timeout: 15000 })
    } catch {
      // 停止失败可能是因为已经停止，忽略
    }

    // 删除容器
    await execAsync(`docker rm -f ${containerId}`, { timeout: 30000 })
    console.log(`[AdminContainerRoutes] 容器已删除: ${containerId}`)
    return createSuccessResponse({ message: '容器删除成功', containerId })
  } catch (error) {
    console.error('[AdminContainerRoutes] 删除容器失败:', error)
    return createErrorResponse('DELETE_CONTAINER_FAILED', '删除容器失败', 500)
  }
}

/**
 * 清理未使用容器
 */
async function handlePruneContainers(req: Request): Promise<Response> {
  try {
    const { stdout } = await execAsync(
      'docker container prune -f --filter "until=1h"',
      { timeout: 60000 }
    )

    const lines = stdout.trim().split('\n')
    let spaceReclaimed = 0
    let containersRemoved = 0

    for (const line of lines) {
      if (line.includes('Total reclaimed space')) {
        const match = line.match(/(\d+\.?\d*)\s*([A-Z]+B)/)
        if (match) {
          const size = parseFloat(match[1])
          const unit = match[2]
          // 转换为字节
          if (unit === 'MB') spaceReclaimed = size * 1024 * 1024
          else if (unit === 'GB') spaceReclaimed = size * 1024 * 1024 * 1024
          else if (unit === 'KB') spaceReclaimed = size * 1024
          else if (unit === 'B') spaceReclaimed = size
        }
      }
      if (line.includes('Deleted:')) {
        containersRemoved = line.split(' ').length - 1
      }
    }

    return createSuccessResponse({
      message: '清理完成',
      spaceReclaimed,
      containersRemoved
    })
  } catch (error) {
    console.error('[AdminContainerRoutes] 清理容器失败:', error)
    return createErrorResponse('PRUNE_CONTAINERS_FAILED', '清理容器失败', 500)
  }
}

/**
 * 获取容器池统计
 */
async function handleGetPoolStats(req: Request): Promise<Response> {
  try {
    // 获取Docker系统信息
    let dockerInfo = null
    try {
      const { stdout } = await execAsync('docker info --format "{{json .}}"', { timeout: 10000 })
      dockerInfo = JSON.parse(stdout)
    } catch {
      // 忽略
    }

    // 获取容器统计
    const [containers, images, volumes] = await Promise.all([
      execAsync('docker ps -a --format "{{.ID}}"').then(r => r.stdout.trim().split('\n').filter(Boolean).length).catch(() => 0),
      execAsync('docker images -q').then(r => r.stdout.trim().split('\n').filter(Boolean).length).catch(() => 0),
      execAsync('docker volume ls -q').then(r => r.stdout.trim().split('\n').filter(Boolean).length).catch(() => 0)
    ])

    // 获取worker容器数量
    const workerContainers = await execAsync('docker ps -a --filter "name=claude-worker" --format "{{.ID}}"')
      .then(r => r.stdout.trim().split('\n').filter(Boolean).length)
      .catch(() => 0)

    return createSuccessResponse({
      containers: {
        total: containers,
        workerContainers
      },
      images,
      volumes,
      dockerVersion: dockerInfo?.ServerVersion || 'unknown',
      dockerStatus: dockerInfo?.ServerErrors?.length ? 'error' : 'running'
    })
  } catch (error) {
    console.error('[AdminContainerRoutes] 获取池统计失败:', error)
    return createErrorResponse('GET_POOL_STATS_FAILED', '获取池统计失败', 500)
  }
}

export default handleAdminContainerRoutes
