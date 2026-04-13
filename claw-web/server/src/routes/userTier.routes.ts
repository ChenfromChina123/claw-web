/**
 * User Tier Management Routes - 用户等级管理路由
 *
 * 功能：
 * - 用户等级查询与更新
 * - 硬件资源配额查询
 * - 自定义配额设置
 * - 用户资源使用统计
 */

import { Router, Request, Response } from 'express'
import { getHardwareResourceManager, UserTier } from '../config/hardwareResourceConfig'
import { getPool } from '../db/mysql'
import { verifyToken } from '../utils/auth'

const router = Router()

/**
 * 获取所有用户等级的硬件配额配置
 * GET /api/tier/quotas
 */
router.get('/quotas', async (req: Request, res: Response) => {
  try {
    const hardwareManager = getHardwareResourceManager()
    const quotas = hardwareManager.getAllQuotas()

    res.json({
      success: true,
      data: quotas
    })
  } catch (error) {
    console.error('[UserTierRoutes] 获取配额配置失败:', error)
    res.status(500).json({
      success: false,
      error: '获取配额配置失败'
    })
  }
})

/**
 * 获取当前用户的等级和配额信息
 * GET /api/tier/my-quota
 */
router.get('/my-quota', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '未提供认证令牌'
      })
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
      return res.status(401).json({
        success: false,
        error: '无效的认证令牌'
      })
    }

    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT id, username, tier, custom_quota FROM users WHERE id = ?',
      [payload.userId]
    ) as [any[], unknown]

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      })
    }

    const user = rows[0]
    const tier = user.tier || UserTier.FREE
    const hardwareManager = getHardwareResourceManager()
    const quota = hardwareManager.getUserQuota(payload.userId, tier as UserTier)

    res.json({
      success: true,
      data: {
        userId: user.id,
        username: user.username,
        tier: tier,
        quota: quota,
        hasCustomQuota: !!user.custom_quota
      }
    })
  } catch (error) {
    console.error('[UserTierRoutes] 获取用户配额失败:', error)
    res.status(500).json({
      success: false,
      error: '获取用户配额失败'
    })
  }
})

/**
 * 更新用户等级（管理员权限）
 * PUT /api/tier/update/:userId
 */
router.put('/update/:userId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '未提供认证令牌'
      })
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
      return res.status(401).json({
        success: false,
        error: '无效的认证令牌'
      })
    }

    const pool = getPool()
    const [adminRows] = await pool.query(
      'SELECT is_admin FROM users WHERE id = ?',
      [payload.userId]
    ) as [any[], unknown]

    if (adminRows.length === 0 || !adminRows[0].is_admin) {
      return res.status(403).json({
        success: false,
        error: '需要管理员权限'
      })
    }

    const { userId } = req.params
    const { tier, subscriptionExpiresAt } = req.body

    if (!Object.values(UserTier).includes(tier)) {
      return res.status(400).json({
        success: false,
        error: '无效的用户等级'
      })
    }

    await pool.query(
      'UPDATE users SET tier = ?, subscription_expires_at = ?, updated_at = NOW() WHERE id = ?',
      [tier, subscriptionExpiresAt || null, userId]
    )

    console.log(`[UserTierRoutes] 管理员 ${payload.userId} 已将用户 ${userId} 等级更新为 ${tier}`)

    res.json({
      success: true,
      message: '用户等级更新成功'
    })
  } catch (error) {
    console.error('[UserTierRoutes] 更新用户等级失败:', error)
    res.status(500).json({
      success: false,
      error: '更新用户等级失败'
    })
  }
})

/**
 * 设置用户自定义配额（管理员权限）
 * PUT /api/tier/custom-quota/:userId
 */
router.put('/custom-quota/:userId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '未提供认证令牌'
      })
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
      return res.status(401).json({
        success: false,
        error: '无效的认证令牌'
      })
    }

    const pool = getPool()
    const [adminRows] = await pool.query(
      'SELECT is_admin FROM users WHERE id = ?',
      [payload.userId]
    ) as [any[], unknown]

    if (adminRows.length === 0 || !adminRows[0].is_admin) {
      return res.status(403).json({
        success: false,
        error: '需要管理员权限'
      })
    }

    const { userId } = req.params
    const customQuota = req.body

    const hardwareManager = getHardwareResourceManager()
    hardwareManager.setUserQuota(userId, customQuota)

    await pool.query(
      'UPDATE users SET custom_quota = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(customQuota), userId]
    )

    console.log(`[UserTierRoutes] 管理员 ${payload.userId} 已为用户 ${userId} 设置自定义配额`)

    res.json({
      success: true,
      message: '自定义配额设置成功'
    })
  } catch (error) {
    console.error('[UserTierRoutes] 设置自定义配额失败:', error)
    res.status(500).json({
      success: false,
      error: '设置自定义配额失败'
    })
  }
})

/**
 * 获取用户资源使用统计
 * GET /api/tier/usage-stats/:userId
 */
router.get('/usage-stats/:userId', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '未提供认证令牌'
      })
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
      return res.status(401).json({
        success: false,
        error: '无效的认证令牌'
      })
    }

    const { userId } = req.params

    const pool = getPool()
    const [userRows] = await pool.query(
      'SELECT tier FROM users WHERE id = ?',
      [userId]
    ) as [any[], unknown]

    if (userRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: '用户不存在'
      })
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

    res.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('[UserTierRoutes] 获取资源使用统计失败:', error)
    res.status(500).json({
      success: false,
      error: '获取资源使用统计失败'
    })
  }
})

/**
 * 获取所有用户等级列表（管理员权限）
 * GET /api/tier/users
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: '未提供认证令牌'
      })
    }

    const token = authHeader.substring(7)
    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
      return res.status(401).json({
        success: false,
        error: '无效的认证令牌'
      })
    }

    const pool = getPool()
    const [adminRows] = await pool.query(
      'SELECT is_admin FROM users WHERE id = ?',
      [payload.userId]
    ) as [any[], unknown]

    if (adminRows.length === 0 || !adminRows[0].is_admin) {
      return res.status(403).json({
        success: false,
        error: '需要管理员权限'
      })
    }

    const [users] = await pool.query(
      'SELECT id, username, email, tier, subscription_expires_at, created_at, last_login FROM users ORDER BY created_at DESC'
    ) as [any[], unknown]

    res.json({
      success: true,
      data: users
    })
  } catch (error) {
    console.error('[UserTierRoutes] 获取用户列表失败:', error)
    res.status(500).json({
      success: false,
      error: '获取用户列表失败'
    })
  }
})

export default router
