/**
 * 后台任务路由 - 处理任务查询和管理 API
 */

import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'
import { getBackgroundTaskManager, TaskStatus } from '../services/backgroundTaskManager'
import type { Request } from 'express'

/**
 * 处理后台任务相关的 HTTP 请求
 */
export async function handleTasksRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const path = url.pathname
  const method = req.method

  if (req.method === 'OPTIONS') {
    if (path.startsWith('/api/tasks')) {
      return createCorsPreflightResponse()
    }
  }

  // GET /api/tasks - 列出后台任务
  if (path === '/api/tasks' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const taskManager = getBackgroundTaskManager()
      let tasks = taskManager.getAllTasks()

      const status = url.searchParams.get('status')
      if (status) {
        tasks = tasks.filter(t => t.status === status)
      }

      const limit = parseInt(url.searchParams.get('limit') || '50', 10)
      const offset = parseInt(url.searchParams.get('offset') || '0', 10)

      const userTasks = tasks.filter(task => {
        const meta = task.metadata as Record<string, unknown> | undefined
        return meta?.userId === auth.userId
      })

      const total = userTasks.length
      const paginated = userTasks.slice(offset, offset + limit).map(task => ({
        taskId: task.id,
        taskName: task.name,
        description: task.description || '',
        status: task.status,
        priority: task.priority,
        progress: task.progress,
        result: task.result ? JSON.stringify(task.result) : null,
        error: task.error || null,
        parentTaskId: task.parentTaskId || null,
        agentId: task.agentId || null,
        sessionId: (task.metadata as Record<string, unknown>)?.sessionId as string || null,
        createdAt: task.createdAt instanceof Date ? task.createdAt.getTime() : new Date(task.createdAt).getTime(),
        startedAt: task.startedAt instanceof Date ? task.startedAt.getTime() : task.startedAt ? new Date(task.startedAt).getTime() : null,
        completedAt: task.completedAt instanceof Date ? task.completedAt.getTime() : task.completedAt ? new Date(task.completedAt).getTime() : null,
      }))

      return createSuccessResponse({ tasks: paginated, total })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取任务列表失败'
      return createErrorResponse('GET_TASKS_FAILED', message, 500)
    }
  }

  // GET /api/tasks/:id/status - 获取单个任务状态
  const taskStatusMatch = path.match(/^\/api\/tasks\/([^\/]+)\/status$/)
  if (taskStatusMatch && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const taskId = taskStatusMatch[1]
      const taskManager = getBackgroundTaskManager()
      const task = taskManager.getAllTasks().find(t => t.id === taskId)

      if (!task) {
        return createErrorResponse('TASK_NOT_FOUND', '任务不存在', 404)
      }

      return createSuccessResponse({
        taskId: task.id,
        taskName: task.name,
        description: task.description || '',
        status: task.status,
        priority: task.priority,
        progress: task.progress,
        result: task.result ? JSON.stringify(task.result) : null,
        error: task.error || null,
        sessionId: (task.metadata as Record<string, unknown>)?.sessionId as string || null,
        createdAt: task.createdAt instanceof Date ? task.createdAt.getTime() : new Date(task.createdAt).getTime(),
        startedAt: task.startedAt instanceof Date ? task.startedAt.getTime() : task.startedAt ? new Date(task.startedAt).getTime() : null,
        completedAt: task.completedAt instanceof Date ? task.completedAt.getTime() : task.completedAt ? new Date(task.completedAt).getTime() : null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取任务状态失败'
      return createErrorResponse('GET_TASK_STATUS_FAILED', message, 500)
    }
  }

  // POST /api/tasks/:id/cancel - 取消任务
  const taskCancelMatch = path.match(/^\/api\/tasks\/([^\/]+)\/cancel$/)
  if (taskCancelMatch && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const taskId = taskCancelMatch[1]
      const taskManager = getBackgroundTaskManager()
      const success = taskManager.cancelTask(taskId)

      if (!success) {
        return createErrorResponse('TASK_CANCEL_FAILED', '无法取消任务（任务可能已完成或不存在）', 400)
      }

      return createSuccessResponse({ success: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : '取消任务失败'
      return createErrorResponse('CANCEL_TASK_FAILED', message, 500)
    }
  }

  // GET /api/tasks/:id/trace - 获取任务追踪信息
  const taskTraceMatch = path.match(/^\/api\/tasks\/([^\/]+)\/trace$/)
  if (taskTraceMatch && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const taskId = taskTraceMatch[1]
      const taskManager = getBackgroundTaskManager()
      const task = taskManager.getAllTasks().find(t => t.id === taskId)

      if (!task) {
        return createErrorResponse('TASK_NOT_FOUND', '任务不存在', 404)
      }

      const traceId = (task.metadata as Record<string, unknown>)?.traceId as string | undefined
      return createSuccessResponse(traceId ? { traceId } : null)
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取任务追踪失败'
      return createErrorResponse('GET_TASK_TRACE_FAILED', message, 500)
    }
  }

  return null
}

export default handleTasksRoutes
