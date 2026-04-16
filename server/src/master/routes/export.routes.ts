/**
 * 导出与分享路由 - 处理消息导出和会话分享相关 API
 */

import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'
import { sharedSessionRepository } from '../db/repositories/sharedSessionRepository'
import { sessionManager } from '../services/sessionManager'
import type { Request } from 'express'

/**
 * 处理导出与分享相关的 HTTP 请求
 */
export async function handleExportRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  // ==================== 导出功能 ====================

  // POST /api/export/markdown - 导出会话为 Markdown
  if (path === '/api/export/markdown' && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const body = await req.json() as { sessionId?: string; messageIds?: string[] }
      const sessionId = body.sessionId

      if (!sessionId) {
        return createErrorResponse('INVALID_PARAMS', '缺少 sessionId 参数', 400)
      }

      // 加载会话数据
      const sessionData = await sessionManager.loadSession(sessionId)
      if (!sessionData) {
        return createErrorResponse('SESSION_NOT_FOUND', '会话不存在', 404)
      }

      // 生成 Markdown 内容
      const markdown = generateMarkdown(sessionData.session.title, sessionData.messages)

      return new Response(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="conversation-${sessionId.slice(0, 8)}.md"`,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败'
      return createErrorResponse('EXPORT_FAILED', message, 500)
    }
  }

  // POST /api/export/html - 导出会话为 HTML
  if (path === '/api/export/html' && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const body = await req.json() as { sessionId?: string; messageIds?: string[] }
      const sessionId = body.sessionId

      if (!sessionId) {
        return createErrorResponse('INVALID_PARAMS', '缺少 sessionId 参数', 400)
      }

      // 加载会话数据
      const sessionData = await sessionManager.loadSession(sessionId)
      if (!sessionData) {
        return createErrorResponse('SESSION_NOT_FOUND', '会话不存在', 404)
      }

      // 生成 HTML 内容
      const html = generateHtml(sessionData.session.title, sessionData.messages)

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="conversation-${sessionId.slice(0, 8)}.html"`,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败'
      return createErrorResponse('EXPORT_FAILED', message, 500)
    }
  }

  // POST /api/export/json - 导出会话为 JSON
  if (path === '/api/export/json' && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const body = await req.json() as { sessionId?: string; messageIds?: string[] }
      const sessionId = body.sessionId

      if (!sessionId) {
        return createErrorResponse('INVALID_PARAMS', '缺少 sessionId 参数', 400)
      }

      // 加载会话数据
      const sessionData = await sessionManager.loadSession(sessionId)
      if (!sessionData) {
        return createErrorResponse('SESSION_NOT_FOUND', '会话不存在', 404)
      }

      // 生成 JSON 内容
      const jsonData = {
        title: sessionData.session.title,
        sessionId: sessionData.session.id,
        exportedAt: new Date().toISOString(),
        messages: sessionData.messages.map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          createdAt: msg.createdAt,
        })),
      }

      return new Response(JSON.stringify(jsonData, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="conversation-${sessionId.slice(0, 8)}.json"`,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败'
      return createErrorResponse('EXPORT_FAILED', message, 500)
    }
  }

  // ==================== 分享功能 ====================

  // POST /api/share - 创建分享链接
  if (path === '/api/share' && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const body = await req.json() as {
        sessionId?: string
        title?: string
        expiresInHours?: number // 可选过期时间（小时），不提供则永不过期
      }
      const sessionId = body.sessionId

      if (!sessionId) {
        return createErrorResponse('INVALID_PARAMS', '缺少 sessionId 参数', 400)
      }

      // 计算过期时间
      let expiresAt: Date | null = null
      if (body.expiresInHours && body.expiresInHours > 0) {
        expiresAt = new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000)
      }

      // 创建分享记录
      const sharedSession = await sharedSessionRepository.create(
        sessionId,
        auth.userId,
        body.title || '分享对话',
        expiresAt
      )

      // 生成分享链接
      const baseUrl = process.env.SHARE_BASE_URL || `${req.protocol}://${req.get('host')}`
      const shareUrl = `${baseUrl}/shared/${sharedSession.shareCode}`

      return createSuccessResponse({
        shareId: sharedSession.id,
        shareCode: sharedSession.shareCode,
        shareUrl,
        expiresAt: sharedSession.expiresAt,
        viewCount: sharedSession.viewCount,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建分享失败'
      return createErrorResponse('CREATE_SHARE_FAILED', message, 500)
    }
  }

  // GET /api/share/:shareCode - 获取分享内容（无需登录）
  if (path.match(/^\/api\/share\/([^\/]+)$/) && method === 'GET') {
    try {
      const shareCode = path.match(/^\/api\/share\/([^\/]+)$/)?.[1]
      if (!shareCode) {
        return createErrorResponse('INVALID_PARAMS', '缺少分享码', 400)
      }

      // 查找分享
      const sharedSession = await sharedSessionRepository.findByShareCode(shareCode)
      if (!sharedSession) {
        return createErrorResponse('SHARE_NOT_FOUND', '分享不存在或已失效', 404)
      }

      // 检查是否过期
      if (sharedSessionRepository.isExpired(sharedSession)) {
        return createErrorResponse('SHARE_EXPIRED', '分享已过期', 410)
      }

      // 增加浏览次数
      await sharedSessionRepository.incrementViewCount(sharedSession.id)

      // 加载会话数据
      const sessionData = await sessionManager.loadSession(sharedSession.sessionId)
      if (!sessionData) {
        return createErrorResponse('SESSION_NOT_FOUND', '会话不存在', 404)
      }

      return createSuccessResponse({
        title: sharedSession.title,
        session: sessionData.session,
        messages: sessionData.messages,
        viewCount: sharedSession.viewCount + 1,
        createdAt: sharedSession.createdAt,
        expiresAt: sharedSession.expiresAt,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取分享失败'
      return createErrorResponse('GET_SHARE_FAILED', message, 500)
    }
  }

  // DELETE /api/share/:shareId - 删除分享
  if (path.match(/^\/api\/share\/([^\/]+)$/) && method === 'DELETE') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const shareId = path.match(/^\/api\/share\/([^\/]+)$/)?.[1]
      if (!shareId) {
        return createErrorResponse('INVALID_PARAMS', '缺少分享ID', 400)
      }

      await sharedSessionRepository.delete(shareId)
      return createSuccessResponse({ message: '分享已删除' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除分享失败'
      return createErrorResponse('DELETE_SHARE_FAILED', message, 500)
    }
  }

  // GET /api/share/user/list - 获取用户的分享列表
  if (path === '/api/share/user/list' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const sharedSessions = await sharedSessionRepository.findByUserId(auth.userId)

      // 处理过期状态
      const result = sharedSessions.map(share => ({
        id: share.id,
        shareCode: share.shareCode,
        sessionId: share.sessionId,
        title: share.title,
        expiresAt: share.expiresAt,
        viewCount: share.viewCount,
        createdAt: share.createdAt,
        isExpired: sharedSessionRepository.isExpired(share),
      }))

      return createSuccessResponse({ shares: result })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取分享列表失败'
      return createErrorResponse('GET_SHARES_FAILED', message, 500)
    }
  }

  // 不匹配任何路由，返回 null
  return null
}

/**
 * 生成 Markdown 格式的会话内容
 */
function generateMarkdown(title: string, messages: any[]): string {
  const lines: string[] = [
    `# ${title}`,
    '',
    `> 导出时间: ${new Date().toLocaleString('zh-CN')}`,
    '',
    '---',
    '',
  ]

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? '👤 用户' : '🤖 助手'
    const time = new Date(msg.createdAt).toLocaleString('zh-CN')

    lines.push(`## ${roleLabel} - ${time}`)
    lines.push('')

    let content = msg.content
    if (typeof content === 'object') {
      content = JSON.stringify(content, null, 2)
    }

    lines.push(content)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 生成 HTML 格式的会话内容
 */
function generateHtml(title: string, messages: any[]): string {
  const messageHtml = messages.map(msg => {
    const roleLabel = msg.role === 'user' ? '用户' : '助手'
    const roleClass = msg.role === 'user' ? 'user' : 'assistant'
    const time = new Date(msg.createdAt).toLocaleString('zh-CN')

    let content = msg.content
    if (typeof content === 'object') {
      content = JSON.stringify(content, null, 2)
    }
    // 简单转义 HTML
    content = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')

    return `
      <div class="message ${roleClass}">
        <div class="message-header">
          <span class="role">${roleLabel}</span>
          <span class="time">${time}</span>
        </div>
        <div class="message-content">${content}</div>
      </div>
    `
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; max-width: 900px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 10px; color: #fff; }
    .meta { text-align: center; color: #888; margin-bottom: 30px; font-size: 14px; }
    .message { background: rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .message.user { background: rgba(99, 102, 241, 0.2); border-left: 3px solid #6366f1; }
    .message.assistant { background: rgba(16, 185, 129, 0.2); border-left: 3px solid #10b981; }
    .message-header { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; }
    .role { font-weight: 600; }
    .message.user .role { color: #818cf8; }
    .message.assistant .role { color: #34d399; }
    .time { color: #888; }
    .message-content { line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="meta">导出时间: ${new Date().toLocaleString('zh-CN')}</p>
  ${messageHtml}
</body>
</html>`
}

export default handleExportRoutes
