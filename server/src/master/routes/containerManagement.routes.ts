/**
 * Container Management Routes - 容器管理API路由
 *
 * 提供的端点：
 * - GET /api/containers/stats - 获取容器池统计信息
 * - GET /api/containers/users - 获取所有用户-容器映射
 * - POST /api/containers/assign - 手动为用户分配容器
 * - DELETE /api/containers/:userId/release - 释放用户容器
 * - GET /api/containers/:userId/status - 查询用户容器状态
 * - POST /api/containers/prewarm - 预热新容器
 *
 * 使用场景：
 * - 运维监控面板
 * - 管理员手动管理
 * - 调试和诊断
 */

import { Router, type Request, type Response } from 'express'
import { getContainerOrchestrator } from '../orchestrator/containerOrchestrator'
import { getUserContainerMapper } from '../orchestrator/userContainerMapper'
import { verifyToken } from '../utils/auth'

const router = Router()

// ==================== 中间件：认证检查 ====================

/**
 * 认证中间件（简化版）
 */
async function authMiddleware(req: Request, res: Response, next: Function) {
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

    if (!payload) {
      return res.status(401).json({
        success: false,
        error: '无效或过期的认证令牌'
      })
    }

    // 将用户信息附加到请求对象
    (req as any).user = payload
    next()

  } catch (error) {
    console.error('[ContainerRoutes] 认证中间件错误:', error)
    return res.status(500).json({
      success: false,
      error: '服务器内部错误'
    })
  }
}

// ==================== 路由定义 ====================

/**
 * GET /api/containers/stats
 * 获取容器池统计信息（需要管理员权限）
 */
router.get('/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user

    // 只有管理员可以查看全局统计
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: '需要管理员权限'
      })
    }

    const orchestrator = getContainerOrchestrator()
    const mapper = getUserContainerMapper()

    const poolStats = orchestrator.getPoolStats()
    const mappingStats = mapper.getStats()

    res.json({
      success: true,
      data: {
        pool: poolStats,
        mappings: mappingStats,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('[ContainerRoutes] 获取统计信息失败:', error)
    res.status(500).json({
      success: false,
      error: '获取统计信息失败'
    })
  }
})

/**
 * GET /api/containers/users
 * 获取所有活跃的用户-容器映射列表（需要管理员权限）
 */
router.get('/users', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user

    // 只有管理员可以查看所有用户
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: '需要管理员权限'
      })
    }

    const mapper = getUserContainerMapper()
    const allMappings = mapper.getAllMappings()

    // 返回脱敏后的信息（不包含敏感数据）
    const sanitizedMappings = allMappings.map(mapping => ({
      userId: mapping.userId,
      containerId: mapping.container.containerId,
      containerName: mapping.container.containerName,
      status: mapping.container.status,
      sessionCount: mapping.sessionCount,
      assignedAt: mapping.assignedAt,
      lastActivityAt: mapping.lastActivityAt
    }))

    res.json({
      success: true,
      data: {
        total: sanitizedMappings.length,
        users: sanitizedMappings
      }
    })

  } catch (error) {
    console.error('[ContainerRoutes] 获取用户列表失败:', error)
    res.status(500).json({
      success: false,
      error: '获取用户列表失败'
    })
  }
})

/**
 * POST /api/containers/assign
 * 为指定用户分配容器（管理员功能）
 */
router.post('/assign', authMiddleware, async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user
    const { targetUserId, username } = req.body

    // 只有管理员可以为其他用户分配容器
    if (adminUser.role !== 'admin' && adminUser.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: '需要管理员权限'
      })
    }

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: '缺少目标用户ID (targetUserId)'
      })
    }

    const orchestrator = getContainerOrchestrator()
    const result = await orchestrator.assignContainerToUser(targetUserId, username)

    if (!result.success) {
      return res.status(400).json(result)
    }

    // 更新映射管理器
    const mapper = getUserContainerMapper()
    if (result.data) {
      mapper.setMapping(targetUserId, result.data)
    }

    res.json({
      success: true,
      message: `成功为用户 ${targetUserId} 分配容器`,
      data: {
        containerId: result.data?.container.containerId,
        port: result.data?.container.hostPort
      }
    })

  } catch (error) {
    console.error('[ContainerRoutes] 分配容器失败:', error)
    res.status(500).json({
      success: false,
      error: '分配容器失败'
    })
  }
})

/**
 * DELETE /api/containers/:userId/release
 * 释放用户的容器（管理员功能或用户自己）
 */
router.delete('/:userId/release', authMiddleware, async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user
    const targetUserId = req.params.userId

    // 用户只能释放自己的容器，管理员可以释放任何人的
    if (currentUser.userId !== targetUserId &&
        currentUser.role !== 'admin' &&
        currentUser.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: '无权操作其他用户的容器'
      })
    }

    const orchestrator = getContainerOrchestrator()
    const mapper = getUserContainerMapper()

    // 从映射中移除
    mapper.removeMapping(targetUserId)

    // 释放容器
    const result = await orchestrator.releaseUserContainer(targetUserId)

    if (!result.success) {
      return res.status(400).json(result)
    }

    res.json({
      success: true,
      message: `成功释放用户 ${targetUserId} 的容器`
    })

  } catch (error) {
    console.error('[ContainerRoutes] 释放容器失败:', error)
    res.status(500).json({
      success: false,
      error: '释放容器失败'
    })
  }
})

/**
 * GET /api/containers/:userId/status
 * 查询特定用户的容器状态
 */
router.get('/:userId/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const currentUser = (req as any).user
    const targetUserId = req.params.userId

    // 用户只能查看自己的状态，管理员可以查看所有
    if (currentUser.userId !== targetUserId &&
        currentUser.role !== 'admin' &&
        currentUser.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: '无权查看其他用户的容器状态'
      })
    }

    const mapper = getUserContainerMapper()
    const mapping = mapper.getMapping(targetUserId)

    if (!mapping) {
      return res.json({
        success: true,
        data: {
          hasContainer: false,
          message: '该用户当前没有分配的容器'
        }
      })
    }

    const orchestrator = getContainerOrchestrator()
    const isHealthy = await orchestrator.checkContainerHealth(mapping.container.containerId)

    res.json({
      success: true,
      data: {
        hasContainer: true,
        containerId: mapping.container.containerId,
        containerName: mapping.container.containerName,
        port: mapping.container.hostPort,
        status: mapping.container.status,
        isHealthy,
        sessionCount: mapping.sessionCount,
        assignedAt: mapping.assignedAt,
        lastActivityAt: mapping.lastActivityAt,
        uptime: Date.now() - mapping.assignedAt.getTime()
      }
    })

  } catch (error) {
    console.error('[ContainerRoutes] 查询容器状态失败:', error)
    res.status(500).json({
      success: false,
      error: '查询容器状态失败'
    })
  }
})

/**
 * POST /api/containers/prewarm
 * 手动触发预热一个新容器（管理员功能）
 */
router.post('/prewarm', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user

    // 只有管理员可以手动预热容器
    if (user.role !== 'admin' && user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: '需要管理员权限'
      })
    }

    const orchestrator = getContainerOrchestrator()
    const container = await orchestrator.prewarmContainer()

    if (!container) {
      return res.status(503).json({
        success: false,
        error: '无法创建新的预热容器（可能已达上限）',
        code: 'POOL_FULL'
      })
    }

    res.json({
      success: true,
      message: '成功预热新容器',
      data: {
        containerId: container.containerId,
        containerName: container.containerName,
        port: container.hostPort
      }
    })

  } catch (error) {
    console.error('[ContainerRoutes] 预热容器失败:', error)
    res.status(500).json({
      success: false,
      error: '预热容器失败'
    })
  }
})

export default router
