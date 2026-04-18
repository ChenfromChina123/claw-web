/**
 * HTTP 服务器认证模块
 *
 * 功能：
 * - Master Token 验证（Worker 只信任来自 Master 的请求）
 * - 用户身份信息提取（JWT 解码、Header 提取）
 * - 统一的认证工具函数
 */

import type { Request } from 'bun'

// ==================== Master Token 验证 ====================

/**
 * 验证 Master 内部通信 Token
 * Worker 只信任来自 Master 的请求
 */
export function verifyMasterToken(request: Request): boolean {
  const masterToken = request.headers.get('X-Master-Token')
  const expectedToken = process.env.MASTER_INTERNAL_TOKEN
  
  if (!expectedToken) {
    console.warn('[MasterToken] MASTER_INTERNAL_TOKEN not configured, rejecting all internal requests')
    return false
  }
  
  if (!masterToken) {
    console.warn('[MasterToken] Missing X-Master-Token header')
    return false
  }
  
  if (masterToken !== expectedToken) {
    console.warn('[MasterToken] Invalid X-Master-Token')
    return false
  }
  
  return true
}

/**
 * 从 Master 请求头中提取用户身份信息
 * Worker 模式下使用此方法获取用户信息
 */
export function extractUserFromMasterHeaders(req: Request): { userId?: string; isAdmin?: boolean } | null {
  const userId = req.headers.get('X-User-Id')
  const isAdmin = req.headers.get('X-User-Admin') === 'true'
  
  if (!userId) {
    return null
  }
  
  return { userId, isAdmin }
}

/**
 * 从请求中提取用户身份信息（支持多种方式）
 * 优先级：Authorization Header > URL Query Parameters
 */
export function extractUserFromRequest(req: Request): { userId?: string; username?: string; role?: string } | null {
  // 方式1: 从 Authorization header 提取 JWT
  const authHeader = req.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    try {
      const payload = decodeJWTPayload(token)
      return {
        userId: payload.userId || payload.sub,
        username: payload.username || payload.email,
        role: payload.role
      }
    } catch {
      // JWT 解码失败，继续尝试其他方式
    }
  }
  
  // 方式2: 从 URL 查询参数提取（用于 WebSocket 等场景）
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (userId) {
    return {
      userId,
      username: url.searchParams.get('username') || undefined,
      role: url.searchParams.get('role') || undefined
    }
  }
  
  return null
}

/**
 * 解码 JWT Payload（不验证签名）
 * 仅用于提取用户信息，不用于安全验证
 */
function decodeJWTPayload(token: string): any {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format')
    }
    
    const payload = parts[1]
    // Base64URL 解码
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)
  } catch (error) {
    console.error('[JWT] 解码失败:', error)
    return {}
  }
}
