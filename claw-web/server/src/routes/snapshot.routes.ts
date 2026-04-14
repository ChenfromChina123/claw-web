/**
 * 快照管理 API 路由
 *
 * 提供的端点：
 * - GET /api/snapshots - 获取用户快照列表
 * - GET /api/snapshots/:snapshotId - 获取快照详情
 * - POST /api/snapshots - 创建新快照
 * - DELETE /api/snapshots/:snapshotId - 删除快照
 * - POST /api/snapshots/:snapshotId/restore - 恢复快照
 */

import type { Request, Response } from 'express'
import { getWorkSnapshotService, type SnapshotType, type CreateSnapshotOptions } from '../services/workSnapshotService'
import { createSuccessResponse, createErrorResponse } from '../utils/response'
import { verifyToken } from '../utils/auth'

/**
 * 处理快照相关的 HTTP 请求
 */
export async function handleSnapshotRoutes(req: Request): Promise<Response | null> {
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

  // 获取用户快照列表
  // GET /api/snapshots
  if (path === '/api/snapshots' && method === 'GET') {
    return handleGetSnapshots(req)
  }

  // 创建新快照
  // POST /api/snapshots
  if (path === '/api/snapshots' && method === 'POST') {
    return handleCreateSnapshot(req)
  }

  // 获取快照详情
  // GET /api/snapshots/:snapshotId
  const detailMatch = path.match(/^\/api\/snapshots\/([^/]+)$/)
  if (detailMatch && method === 'GET') {
    return handleGetSnapshotDetail(req, detailMatch[1])
  }

  // 删除快照
  // DELETE /api/snapshots/:snapshotId
  if (detailMatch && method === 'DELETE') {
    return handleDeleteSnapshot(req, detailMatch[1])
  }

  // 恢复快照
  // POST /api/snapshots/:snapshotId/restore
  const restoreMatch = path.match(/^\/api\/snapshots\/([^/]+)\/restore$/)
  if (restoreMatch && method === 'POST') {
    return handleRestoreSnapshot(req, restoreMatch[1])
  }

  return null
}

/**
 * 获取用户快照列表
 */
async function handleGetSnapshots(req: Request): Promise<Response> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('UNAUTHORIZED', '未提供认证令牌', 401)
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
      return createErrorResponse('UNAUTHORIZED', '无效的认证令牌', 401)
    }

    const snapshotService = getWorkSnapshotService()
    const limit = parseInt(req.query.limit as string) || 50
    const snapshots = await snapshotService.getSnapshotsByUser(payload.userId, limit)

    return createSuccessResponse({
      snapshots,
      count: snapshots.length
    })
  } catch (error) {
    console.error('[SnapshotRoutes] 获取快照列表失败:', error)
    return createErrorResponse('GET_SNAPSHOTS_FAILED', '获取快照列表失败', 500)
  }
}

/**
 * 创建新快照
 */
async function handleCreateSnapshot(req: Request): Promise<Response> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('UNAUTHORIZED', '未提供认证令牌', 401)
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
      return createErrorResponse('UNAUTHORIZED', '无效的认证令牌', 401)
    }

    const body = await req.json()
    const {
      sessionId,
      containerId,
      snapshotType = 'checkpoint',
      workspacePath,
      includeProcessState = true,
      includeGitState = true,
      includeExecutionState = true
    } = body

    if (!sessionId) {
      return createErrorResponse('MISSING_SESSION_ID', '缺少 sessionId 参数', 400)
    }

    const options: CreateSnapshotOptions = {
      userId: payload.userId,
      sessionId,
      containerId,
      snapshotType: snapshotType as SnapshotType,
      workspacePath,
      includeProcessState,
      includeGitState,
      includeExecutionState
    }

    const snapshotService = getWorkSnapshotService()
    const snapshot = await snapshotService.createSnapshot(options)

    return createSuccessResponse({
      snapshot,
      message: '快照创建成功'
    })
  } catch (error) {
    console.error('[SnapshotRoutes] 创建快照失败:', error)
    return createErrorResponse('CREATE_SNAPSHOT_FAILED', '创建快照失败', 500)
  }
}

/**
 * 获取快照详情
 */
async function handleGetSnapshotDetail(req: Request, snapshotId: string): Promise<Response> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('UNAUTHORIZED', '未提供认证令牌', 401)
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
      return createErrorResponse('UNAUTHORIZED', '无效的认证令牌', 401)
    }

    const snapshotService = getWorkSnapshotService()
    const snapshot = await snapshotService.getSnapshot(snapshotId)

    if (!snapshot) {
      return createErrorResponse('NOT_FOUND', '快照不存在', 404)
    }

    // 验证所有权
    if (snapshot.userId !== payload.userId) {
      return createErrorResponse('FORBIDDEN', '无权访问此快照', 403)
    }

    return createSuccessResponse({ snapshot })
  } catch (error) {
    console.error('[SnapshotRoutes] 获取快照详情失败:', error)
    return createErrorResponse('GET_SNAPSHOT_FAILED', '获取快照详情失败', 500)
  }
}

/**
 * 删除快照
 */
async function handleDeleteSnapshot(req: Request, snapshotId: string): Promise<Response> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('UNAUTHORIZED', '未提供认证令牌', 401)
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
      return createErrorResponse('UNAUTHORIZED', '无效的认证令牌', 401)
    }

    const snapshotService = getWorkSnapshotService()

    // 验证所有权
    const snapshot = await snapshotService.getSnapshot(snapshotId)
    if (!snapshot) {
      return createErrorResponse('NOT_FOUND', '快照不存在', 404)
    }

    if (snapshot.userId !== payload.userId) {
      return createErrorResponse('FORBIDDEN', '无权删除此快照', 403)
    }

    await snapshotService.deleteSnapshot(snapshotId)

    return createSuccessResponse({
      message: '快照删除成功'
    })
  } catch (error) {
    console.error('[SnapshotRoutes] 删除快照失败:', error)
    return createErrorResponse('DELETE_SNAPSHOT_FAILED', '删除快照失败', 500)
  }
}

/**
 * 恢复快照
 */
async function handleRestoreSnapshot(req: Request, snapshotId: string): Promise<Response> {
  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return createErrorResponse('UNAUTHORIZED', '未提供认证令牌', 401)
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
      return createErrorResponse('UNAUTHORIZED', '无效的认证令牌', 401)
    }

    const snapshotService = getWorkSnapshotService()

    // 验证快照
    const validation = await snapshotService.validateSnapshot(snapshotId)
    if (!validation.valid) {
      return createErrorResponse('INVALID_SNAPSHOT', validation.reason || '快照无效', 400)
    }

    const snapshot = await snapshotService.getSnapshot(snapshotId)
    if (!snapshot) {
      return createErrorResponse('NOT_FOUND', '快照不存在', 404)
    }

    // 验证所有权
    if (snapshot.userId !== payload.userId) {
      return createErrorResponse('FORBIDDEN', '无权恢复此快照', 403)
    }

    // TODO: 实现实际的恢复逻辑
    // 1. 创建新容器或分配现有容器
    // 2. 解压/同步文件到新容器
    // 3. 恢复进程状态
    // 4. 通知用户

    return createSuccessResponse({
      message: '快照恢复功能开发中',
      snapshot
    })
  } catch (error) {
    console.error('[SnapshotRoutes] 恢复快照失败:', error)
    return createErrorResponse('RESTORE_SNAPSHOT_FAILED', '恢复快照失败', 500)
  }
}

export default handleSnapshotRoutes
