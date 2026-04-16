/**
 * User Tier Management Routes - 用户等级管理路由
 *
 * 功能：
 * - 用户等级查询与更新
 * - 硬件资源配额查询
 * - 自定义配额设置
 * - 用户资源使用统计
 */

import type { Request, Response } from 'express'
import { getHardwareResourceManager, UserTier } from '../config/hardwareResourceConfig'
import { getPool } from '../db/mysql'
import { verifyToken } from '../services/jwtService'
import { createSuccessResponse, createErrorResponse } from '../utils/response'

/**
 * 处理用户等级相关的 HTTP 请求
 */
export async function handleUserTierRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    })
  }

  // 获取所有用户等级的硬件配额配置
  // GET /api/tier/quotas
  if (path === '/api/tier/quotas' && method === 'GET') {
    try {
      const hardwareManager = getHardwareResourceManager()
      const quotas = hardwareManager.getAllQuotas()
      return createSuccessResponse(quotas)
    } catch (error) {
      console.error('[UserTierRoutes] 获取配额配置失败:', error)
      return createErrorResponse('GET_QUOTAS_FAILED', '获取配额配置失败', 500)
    }
  }

  // 获取当前用户的等级和配额信息
  // GET /api/tier/my-quota
  if (path === '/api/tier/my-quota' && method === 'GET') {
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

      const pool = getPool()
      const [rows] = await pool.query(
        'SELECT id, username, tier, custom_quota FROM users WHERE id = ?',
        [payload.userId]
      ) as [any[], unknown]

      if (rows.length === 0) {
        return createErrorResponse('NOT_FOUND', '用户不存在', 404)
      }

      const user = rows[0]
      const tier = user.tier || UserTier.FREE
      const hardwareManager = getHardwareResourceManager()
      const quota = hardwareManager.getUserQuota(payload.userId, tier as UserTier)

      return createSuccessResponse({
        userId: user.id,
        username: user.username,
        tier: tier,
        quota: quota,
        hasCustomQuota: !!user.custom_quota
      })
    } catch (error) {
      console.error('[UserTierRoutes] 获取用户配额失败:', error)
      return createErrorResponse('GET_QUOTA_FAILED', '获取用户配额失败', 500)
    }
  }

  // 更新用户等级（管理员权限）
  // PUT /api/tier/update/:userId
  const updateTierMatch = path.match(/^\/api\/tier\/update\/([^/]+)$/)
  if (updateTierMatch && method === 'PUT') {
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

      const pool = getPool()
      const [adminRows] = await pool.query(
        'SELECT is_admin FROM users WHERE id = ?',
        [payload.userId]
      ) as [any[], unknown]

      if (adminRows.length === 0 || !adminRows[0].is_admin) {
        return createErrorResponse('FORBIDDEN', '需要管理员权限', 403)
      }

      const userId = updateTierMatch[1]
      const body = await req.json()
      const { tier, subscriptionExpiresAt } = body

      if (!Object.values(UserTier).includes(tier)) {
        return createErrorResponse('INVALID_TIER', '无效的用户等级', 400)
      }

      await pool.query(
        'UPDATE users SET tier = ?, subscription_expires_at = ?, updated_at = NOW() WHERE id = ?',
        [tier, subscriptionExpiresAt || null, userId]
      )

      console.log(`[UserTierRoutes] 管理员 ${payload.userId} 已将用户 ${userId} 等级更新为 ${tier}`)

      return createSuccessResponse({ message: '用户等级更新成功' })
    } catch (error) {
      console.error('[UserTierRoutes] 更新用户等级失败:', error)
      return createErrorResponse('UPDATE_TIER_FAILED', '更新用户等级失败', 500)
    }
  }

  // 设置用户自定义配额（管理员权限）
  // PUT /api/tier/custom-quota/:userId
  const customQuotaMatch = path.match(/^\/api\/tier\/custom-quota\/([^/]+)$/)
  if (customQuotaMatch && method === 'PUT') {
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

      const pool = getPool()
      const [adminRows] = await pool.query(
        'SELECT is_admin FROM users WHERE id = ?',
        [payload.userId]
      ) as [any[], unknown]

      if (adminRows.length === 0 || !adminRows[0].is_admin) {
        return createErrorResponse('FORBIDDEN', '需要管理员权限', 403)
      }

      const userId = customQuotaMatch[1]
      const customQuota = await req.json()

      const hardwareManager = getHardwareResourceManager()
      hardwareManager.setUserQuota(userId, customQuota)

      await pool.query(
        'UPDATE users SET custom_quota = ?, updated_at = NOW() WHERE id = ?',
        [JSON.stringify(customQuota), userId]
      )

      console.log(`[UserTierRoutes] 管理员 ${payload.userId} 已为用户 ${userId} 设置自定义配额`)

      return createSuccessResponse({ message: '自定义配额设置成功' })
    } catch (error) {
      console.error('[UserTierRoutes] 设置自定义配额失败:', error)
      return createErrorResponse('SET_CUSTOM_QUOTA_FAILED', '设置自定义配额失败', 500)
    }
  }

  // 获取用户资源使用统计
  // GET /api/tier/usage-stats/:userId
  const usageStatsMatch = path.match(/^\/api\/tier\/usage-stats\/([^/]+)$/)
  if (usageStatsMatch && method === 'GET') {
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

      const userId = usageStatsMatch[1]

      const pool = getPool()
      const [userRows] = await pool.query(
        'SELECT tier FROM users WHERE id = ?',
        [userId]
      ) as [any[], unknown]

      if (userRows.length === 0) {
        return createErrorResponse('NOT_FOUND', '用户不存在', 404)
      }

      const tier = userRows[0].tier || UserTier.FREE
      const hardwareManager = getHardwareResourceManager()
      const quota = hardwareManager.getUserQuota(userId, tier as UserTier)

      const usageStats = {
        cpuUsage: 0.25,
        memoryUsageMB: 128,
        storageUsageMB: 50,
        sessionCount: 2,
        ptyCount: 1,
        fileCount: 100
      }

      const stats = hardwareManager.getResourceUsageStats(userId, tier as UserTier, usageStats)

      return createSuccessResponse(stats)
    } catch (error) {
      console.error('[UserTierRoutes] 获取资源使用统计失败:', error)
      return createErrorResponse('GET_USAGE_STATS_FAILED', '获取资源使用统计失败', 500)
    }
  }

  // 获取所有用户等级列表（管理员权限）
  // GET /api/tier/users
  if (path === '/api/tier/users' && method === 'GET') {
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

      const pool = getPool()
      const [adminRows] = await pool.query(
        'SELECT is_admin FROM users WHERE id = ?',
        [payload.userId]
      ) as [any[], unknown]

      if (adminRows.length === 0 || !adminRows[0].is_admin) {
        return createErrorResponse('FORBIDDEN', '需要管理员权限', 403)
      }

      const [users] = await pool.query(
        'SELECT id, username, email, tier, subscription_expires_at, created_at, last_login FROM users ORDER BY created_at DESC'
      ) as [any[], unknown]

      return createSuccessResponse(users)
    } catch (error) {
      console.error('[UserTierRoutes] 获取用户列表失败:', error)
      return createErrorResponse('GET_USERS_FAILED', '获取用户列表失败', 500)
    }
  }

  return null
}

export default handleUserTierRoutes
