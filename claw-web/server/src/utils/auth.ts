/**
 * 认证中间件工具函数
 * 
 * 架构说明：
 * - Master 容器：处理所有认证，验证 JWT token
 * - Worker 容器：完全不参与认证，只信任来自 Master 的请求
 *   - 通过 X-Proxy-Origin 头部识别 Master 请求
 *   - 从 X-User-Id / X-User-Admin 头部获取用户信息
 *   - 非来自 Master 的请求直接拒绝（Worker 不对外暴露）
 */

import { verifyToken, extractTokenFromHeader } from '../services/jwtService'

export { verifyToken }

export interface AuthResult {
  userId: string | null
  isAdmin: boolean | null
}

const CONTAINER_ROLE = process.env.CONTAINER_ROLE || 'master'

/**
 * 检查请求是否来自 Master 容器（通过代理）
 */
function isRequestFromMaster(request: Request): boolean {
  const proxyOrigin = request.headers.get('X-Proxy-Origin')
  return proxyOrigin === 'claw-web-master'
}

/**
 * 从请求中提取 Master 传递的用户信息
 */
function extractUserFromProxyHeader(request: Request): AuthResult {
  const userId = request.headers.get('X-User-Id')
  const isAdmin = request.headers.get('X-User-Admin')
  return {
    userId: userId || null,
    isAdmin: isAdmin === 'true'
  }
}

/**
 * 认证中间件
 * 
 * Master 模式：验证 JWT token
 * Worker 模式：只信任 Master 传递的用户信息，不做任何 token 验证
 */
export async function authMiddleware(request: Request): Promise<AuthResult> {
  // Worker 模式：完全不参与认证，只信任 Master 传递的用户信息
  if (CONTAINER_ROLE === 'worker') {
    if (isRequestFromMaster(request)) {
      return extractUserFromProxyHeader(request)
    }
    // Worker 不对外暴露，非 Master 请求直接返回未认证
    console.warn('[Auth] Worker 收到非 Master 请求，拒绝访问')
    return { userId: null, isAdmin: null }
  }

  // Master 模式：验证 JWT token
  const authHeader = request.headers.get('Authorization')
  console.log('[Auth] Request URL:', request.url)
  console.log('[Auth] Authorization header:', authHeader ? `exists: "${authHeader.substring(0, 50)}..."` : 'missing')
  
  const token = await extractTokenFromHeader(authHeader)
  console.log('[Auth] extractTokenFromHeader result:', token ? `token length: ${token.length}` : 'null')

  if (!token) {
    console.warn('[Auth] No token extracted from header')
    return { userId: null, isAdmin: null }
  }

  const payload = await verifyToken(token)
  console.log('[Auth] verifyToken result:', payload ? `userId: ${payload.userId}` : 'null')
  
  if (!payload) {
    console.warn('[Auth] Token verification failed')
    return { userId: null, isAdmin: null }
  }

  console.log('[Auth] Token verified for user:', payload.userId)
  return { userId: payload.userId, isAdmin: payload.isAdmin || null }
}

/**
 * 验证认证并返回用户ID
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
