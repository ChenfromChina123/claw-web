/**
 * 推送消息路由 - 处理 Agent 推送消息的 REST API
 */

import { getAgentPushService } from '../services/agentPushService'
import { getPushMessageRepository } from '../db/repositories/pushMessageRepository'
import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'

export async function handlePushRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  if (!path.startsWith('/api/push')) return null

  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  const auth = await authMiddleware(req)
  if (!auth.userId) {
    return createErrorResponse('UNAUTHORIZED', '需要登录', 401)
  }

  const userId = auth.userId

  if (path === '/api/push/messages' && method === 'GET') {
    try {
      const category = url.searchParams.get('category') ?? undefined
      const unreadOnly = url.searchParams.get('unreadOnly') !== 'false'
      const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)

      const pushService = getAgentPushService()
      const messages = await pushService.getUserPushMessages(userId, {
        category: category as any,
        unreadOnly,
        limit: Math.min(limit, 100),
      })

      return createSuccessResponse(messages)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '获取推送消息失败'
      return createErrorResponse('GET_PUSH_MESSAGES_FAILED', msg, 500)
    }
  }

  if (path === '/api/push/messages/unread-count' && method === 'GET') {
    try {
      const repo = getPushMessageRepository()
      const count = await repo.getUnreadCount(userId)
      return createSuccessResponse(count)
    } catch (error) {
      return createErrorResponse('GET_UNREAD_COUNT_FAILED', '获取未读数量失败', 500)
    }
  }

  const readMatch = path.match(/^\/api\/push\/messages\/([^/]+)\/read$/)
  if (readMatch && method === 'POST') {
    try {
      const messageId = readMatch[1]
      const pushService = getAgentPushService()
      const success = await pushService.markAsRead(messageId)
      return createSuccessResponse(success)
    } catch (error) {
      return createErrorResponse('MARK_READ_FAILED', '标记已读失败', 500)
    }
  }

  const deleteMatch = path.match(/^\/api\/push\/messages\/([^/]+)$/)
  if (deleteMatch && method === 'DELETE') {
    try {
      const messageId = deleteMatch[1]
      const pushService = getAgentPushService()
      const success = await pushService.deletePushMessage(messageId)
      return createSuccessResponse(success)
    } catch (error) {
      return createErrorResponse('DELETE_PUSH_MESSAGE_FAILED', '删除推送消息失败', 500)
    }
  }

  return null
}

export default handlePushRoutes
