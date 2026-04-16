/**
 * 管理员权限验证中间件
 * 
 * 统一的管理员权限检查逻辑，避免各路由文件中重复实现
 * 使用方式：
 * const adminAuth = await requireAdminAuth(req)
 * console.log(adminAuth.userId) // 用户 ID
 * console.log(adminAuth.isAdmin) // 是否为管理员
 */

import { verifyToken } from '../services/jwtService'
import { getPool } from '../db/mysql'
import { createErrorResponse } from '../utils/response'

/**
 * 管理员认证结果
 */
export interface AdminAuthResult {
  /** 用户 ID */
  userId: string
  /** 是否为管理员 */
  isAdmin: boolean
}

/**
 * 验证用户认证并检查管理员权限
 * 
 * @param req - 请求对象
 * @returns 管理员认证结果或错误响应
 */
export async function requireAdminAuth(req: Request): Promise<AdminAuthResult | Response> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return createErrorResponse('UNAUTHORIZED', '未提供认证令牌', 401)
  }

  const token = authHeader.substring(7)
  const payload = await verifyToken(token)

  if (!payload || !payload.userId) {
    return createErrorResponse('UNAUTHORIZED', '无效的认证令牌', 401)
  }

  // 检查是否是管理员
  const pool = getPool()
  const [rows] = await pool.query(
    'SELECT is_admin FROM users WHERE id = ?',
    [payload.userId]
  ) as [any[], unknown]

  if (rows.length === 0 || !rows[0].is_admin) {
    return createErrorResponse('FORBIDDEN', '需要管理员权限', 403)
  }

  return {
    userId: payload.userId,
    isAdmin: true
  }
}

/**
 * 仅验证用户认证（不检查管理员权限）
 * 
 * @param req - 请求对象
 * @returns 用户 ID 或错误响应
 */
export async function requireAuth(req: Request): Promise<string | Response> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return createErrorResponse('UNAUTHORIZED', '未提供认证令牌', 401)
  }

  const token = authHeader.substring(7)
  const payload = await verifyToken(token)

  if (!payload || !payload.userId) {
    return createErrorResponse('UNAUTHORIZED', '无效的认证令牌', 401)
  }

  return payload.userId
}
