/**
 * 认证中间件工具函数
 * 
 * 架构说明：
 * - Master 容器：处理所有认证，验证 JWT token
 * - Worker 容器：信任来自 Master 的请求（通过 X-Proxy-Origin 头部识别）
 */

import { verifyToken, extractTokenFromHeader } from '../services/jwtService'

export { verifyToken }

export interface AuthResult {
  userId: string | null
  isAdmin: boolean | null
}

// 容器角色
const CONTAINER_ROLE = process.env.CONTAINER_ROLE || 'master'

/**
 * 检查请求是否来自 Master 容器（通过代理）
 * Master 在代理请求时会添加 X-Proxy-Origin: claw-web-master 头部
 */
function isRequestFromMaster(request: Request): boolean {
  const proxyOrigin = request.headers.get('X-Proxy-Origin')
  return proxyOrigin === 'claw-web-master'
}

/**
 * 从请求中提取用户ID（由 Master 容器在代理时添加）
 */
function extractUserFromProxyHeader(request: Request): { userId: string | null; isAdmin: boolean | null } {
  const userId = request.headers.get('X-User-Id')
  const isAdmin = request.headers.get('X-User-Admin')
  return {
    userId: userId || null,
    isAdmin: isAdmin === 'true'
  }
}

/**
 * 认证中间件：验证请求的 JWT token
 * 
 * 在 Worker 模式下：
 * - 如果请求来自 Master（通过 X-Proxy-Origin 识别），直接信任 Master 传递的用户信息
 * - 否则进行本地 token 验证（用于直接访问 Worker 的场景）
 * 
 * 在 Master 模式下：
 * - 始终验证 JWT token
 */
export async function authMiddleware(request: Request): Promise<AuthResult> {
  // Worker 模式下，信任来自 Master 的请求
  if (CONTAINER_ROLE === 'worker' && isRequestFromMaster(request)) {
    const proxyUser = extractUserFromProxyHeader(request)
    if (proxyUser.userId) {
      return proxyUser
    }
    // 如果 Master 没有传递用户信息，回退到本地验证
  }

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