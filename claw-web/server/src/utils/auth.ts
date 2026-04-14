/**
 * 认证中间件工具函数
 */

import { verifyToken, extractTokenFromHeader } from '../services/jwtService'

export { verifyToken }

export interface AuthResult {
  userId: string | null
  isAdmin: boolean | null
}

/**
 * 认证中间件：验证请求的 JWT token
 */
export async function authMiddleware(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization')
  const token = await extractTokenFromHeader(authHeader)

  if (!token) {
    return { userId: null, isAdmin: null }
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return { userId: null, isAdmin: null }
  }

  return { userId: payload.userId, isAdmin: payload.isAdmin || null }
}

/**
 * 验证认证并返回用户ID，如果未认证则抛出错误
 */
export async function requireAuth(request: Request): Promise<string> {
  const auth = await authMiddleware(request)
  if (!auth.userId) {
    throw new Error('UNAUTHORIZED')
  }
  return auth.userId
}

/**
 * 验证认证并返回用户ID和管理员状态
 */
export async function requireAuthWithAdmin(request: Request): Promise<{ userId: string; isAdmin: boolean }> {
  const auth = await authMiddleware(request)
  if (!auth.userId) {
    throw new Error('UNAUTHORIZED')
  }
  return { userId: auth.userId, isAdmin: auth.isAdmin ?? false }
}