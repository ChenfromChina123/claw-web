/**
 * 会话路由 - 处理会话管理相关 API
 */

import { SessionManager } from '../services/sessionManager'
import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'
import { sessionOpenFilesRepository } from '../db/repositories/sessionOpenFilesRepository'
import type { RegisterRequest } from '../models/types'

const sessionManager = SessionManager.getInstance()

/**
 * 处理会话相关的 HTTP 请求
 */
export async function handleSessionRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  // ==================== 会话列表 ====================

  // GET /api/sessions - 获取用户会话列表
  if (path === '/api/sessions' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const sessions = await sessionManager.getUserSessions(auth.userId)
      // 直接返回会话列表数组，与 Android 端 ApiResponse<List<Session>> 兼容
      return createSuccessResponse(sessions)
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取会话列表失败'
      return createErrorResponse('GET_SESSIONS_FAILED', message, 500)
    }
  }

  // POST /api/sessions - 创建新会话
  if (path === '/api/sessions' && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const body = await req.json() as { title?: string; model?: string }
      const title = body.title || '新对话'
      const model = body.model || 'qwen-plus'
      const session = await sessionManager.createSession(auth.userId, title, model)
      return createSuccessResponse(session)
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建会话失败'
      return createErrorResponse('CREATE_SESSION_FAILED', message, 500)
    }
  }

  // ==================== 单个会话操作 ====================

  // 匹配 /api/sessions/:id
  const sessionIdMatch = path.match(/^\/api\/sessions\/([^\/]+)$/)

  // GET /api/sessions/:id - 加载会话详情
  if (sessionIdMatch && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const sessionId = sessionIdMatch[1]
      const sessionData = await sessionManager.loadSession(sessionId)
      if (!sessionData) {
        return createErrorResponse('SESSION_NOT_FOUND', '会话不存在', 404)
      }
      
      // 将 content 数组转换为字符串，确保与 Android 端 Message.content 类型兼容
      const messages = sessionData.messages.map(msg => ({
        ...msg,
        content: Array.isArray(msg.content) ? JSON.stringify(msg.content) : msg.content,
      }))
      
      return createSuccessResponse({
        session: sessionData.session,
        messages,
        toolCalls: sessionData.toolCalls,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载会话失败'
      return createErrorResponse('LOAD_SESSION_FAILED', message, 500)
    }
  }

  // PUT /api/sessions/:id - 更新会话信息
  if (sessionIdMatch && method === 'PUT') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const sessionId = sessionIdMatch[1]
      const body = await req.json() as { title?: string; model?: string; isPinned?: boolean }
      const updates: { title?: string; model?: string; isPinned?: boolean } = {}
      if (body.title !== undefined) updates.title = body.title
      if (body.model !== undefined) updates.model = body.model
      if (body.isPinned !== undefined) updates.isPinned = body.isPinned

      const session = await sessionManager.updateSession(sessionId, updates)
      if (!session) {
        return createErrorResponse('SESSION_NOT_FOUND', '会话不存在', 404)
      }
      return createSuccessResponse(session)
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新会话失败'
      return createErrorResponse('UPDATE_SESSION_FAILED', message, 500)
    }
  }

  // DELETE /api/sessions/:id - 删除会话
  if (sessionIdMatch && method === 'DELETE') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const sessionId = sessionIdMatch[1]
      await sessionManager.deleteSession(sessionId, auth.userId)
      return createSuccessResponse({ message: 'Session deleted' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除会话失败'
      const code = message.includes('not found') ? 'SESSION_NOT_FOUND' : message.includes('Forbidden') ? 'FORBIDDEN' : 'DELETE_SESSION_FAILED'
      const status = message.includes('Forbidden') ? 403 : message.includes('not found') ? 404 : 500
      return createErrorResponse(code, message, status)
    }
  }

  // ==================== 清空会话 ====================

  // POST /api/sessions/:id/clear - 清空会话消息
  const clearSessionMatch = path.match(/^\/api\/sessions\/([^\/]+)\/clear$/)
  if (clearSessionMatch && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const sessionId = clearSessionMatch[1]
      await sessionManager.clearSession(sessionId)
      return createSuccessResponse({ message: 'Session cleared' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '清空会话失败'
      return createErrorResponse('CLEAR_SESSION_FAILED', message, 500)
    }
  }

  // ==================== 会话已打开文件 ====================

  // GET /api/sessions/:id/open-files - 获取会话已打开的文件
  const getOpenFilesMatch = path.match(/^\/api\/sessions\/([^\/]+)\/open-files$/)
  if (getOpenFilesMatch && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const sessionId = getOpenFilesMatch[1]
      const record = await sessionOpenFilesRepository.findBySessionId(sessionId)
      if (!record) {
        return createSuccessResponse({ openFilePaths: [], activeFilePath: null })
      }
      return createSuccessResponse({
        openFilePaths: record.openFilePaths,
        activeFilePath: record.activeFilePath,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取已打开文件失败'
      return createErrorResponse('GET_OPEN_FILES_FAILED', message, 500)
    }
  }

  // PUT /api/sessions/:id/open-files - 保存会话已打开的文件
  const saveOpenFilesMatch = path.match(/^\/api\/sessions\/([^\/]+)\/open-files$/)
  if (saveOpenFilesMatch && method === 'PUT') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const sessionId = saveOpenFilesMatch[1]
      const body = await req.json() as { openFilePaths: string[]; activeFilePath: string | null }
      if (!Array.isArray(body.openFilePaths)) {
        return createErrorResponse('INVALID_PARAMS', 'openFilePaths 必须是数组', 400)
      }
      await sessionOpenFilesRepository.upsert(sessionId, body.openFilePaths, body.activeFilePath)
      return createSuccessResponse({ message: 'Open files saved' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存已打开文件失败'
      return createErrorResponse('SAVE_OPEN_FILES_FAILED', message, 500)
    }
  }

  // DELETE /api/sessions/:id/open-files - 删除会话已打开的文件记录
  const deleteOpenFilesMatch = path.match(/^\/api\/sessions\/([^\/]+)\/open-files$/)
  if (deleteOpenFilesMatch && method === 'DELETE') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const sessionId = deleteOpenFilesMatch[1]
      await sessionOpenFilesRepository.delete(sessionId)
      return createSuccessResponse({ message: 'Open files deleted' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除已打开文件记录失败'
      return createErrorResponse('DELETE_OPEN_FILES_FAILED', message, 500)
    }
  }

  // ==================== 消息搜索 ====================

  // GET /api/sessions/messages/search - 搜索消息
  if (path === '/api/sessions/messages/search' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const url = new URL(req.url)
      const searchParams = url.searchParams

      const keyword = searchParams.get('keyword') || undefined
      const sessionId = searchParams.get('sessionId') || undefined
      const startDate = searchParams.get('startDate') || undefined
      const endDate = searchParams.get('endDate') || undefined
      const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined
      const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined

      // 验证参数
      if (!keyword && !sessionId && !startDate && !endDate) {
        return createErrorResponse('INVALID_PARAMS', '请至少提供一个搜索条件', 400)
      }

      const results = await sessionManager.searchMessages(auth.userId, {
        keyword,
        sessionId,
        startDate,
        endDate,
        limit,
        offset,
      })

      return createSuccessResponse({
        results,
        total: results.length > 0 ? results[0].total : 0,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '搜索消息失败'
      return createErrorResponse('SEARCH_MESSAGES_FAILED', message, 500)
    }
  }

  // 不匹配任何路由，返回 null
  return null
}

export default handleSessionRoutes