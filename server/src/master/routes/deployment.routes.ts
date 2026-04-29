/**
 * 项目部署 API 路由
 *
 * 提供的端点：
 * - POST /api/deployments - 创建部署
 * - GET /api/deployments - 列出租户部署
 * - GET /api/deployments/:id - 获取部署详情
 * - POST /api/deployments/:id/start - 启动项目
 * - POST /api/deployments/:id/stop - 停止项目
 * - DELETE /api/deployments/:id - 删除部署
 * - GET /api/deployments/:id/logs - 获取日志
 * - POST /api/deployments/:id/external-access - 开启外部访问
 * - DELETE /api/deployments/:id/external-access - 关闭外部访问
 */

import { Router, type Request, type Response } from 'express'
import { getProjectDeploymentService } from '../services/projectDeploymentService'
import { verifyToken } from '../utils/auth'

const router = Router()

// ==================== 中间件：认证检查 ====================

/**
 * 认证中间件
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

    ;(req as any).user = payload
    next()
  } catch (error) {
    console.error('[DeploymentRoutes] 认证中间件错误:', error)
    return res.status(500).json({
      success: false,
      error: '服务器内部错误'
    })
  }
}

// ==================== 部署管理路由 ====================

/**
 * POST /api/deployments
 * 创建部署
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const {
      name,
      type,
      sourceType,
      sourceUrl,
      buildCommand,
      startCommand,
      envVars,
      memoryLimit,
      autoRestart,
      enableExternalAccess
    } = req.body

    // 验证必填字段
    if (!name || !type || !sourceType || !startCommand) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段：name, type, sourceType, startCommand'
      })
    }

    const deploymentService = getProjectDeploymentService()

    const deployment = await deploymentService.createProject({
      userId: user.userId,
      name,
      type,
      sourceType,
      sourceUrl,
      buildCommand,
      startCommand,
      envVars,
      memoryLimit,
      autoRestart,
      enableExternalAccess
    })

    res.json({
      success: true,
      data: deployment,
      message: '项目部署成功'
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 创建部署失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '部署失败'
    })
  }
})

/**
 * GET /api/deployments
 * 列出租户部署
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user

    const deploymentService = getProjectDeploymentService()
    const deployments = await deploymentService.listUserProjects(user.userId)

    res.json({
      success: true,
      data: {
        total: deployments.length,
        deployments
      }
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 获取部署列表失败:', error)
    res.status(500).json({
      success: false,
      error: '获取部署列表失败'
    })
  }
})

/**
 * GET /api/deployments/:id
 * 获取部署详情
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { id } = req.params

    const deploymentService = getProjectDeploymentService()
    const status = await deploymentService.getProjectStatus(id, user.userId)

    res.json({
      success: true,
      data: status
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 获取部署详情失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取部署详情失败'
    })
  }
})

/**
 * POST /api/deployments/:id/start
 * 启动项目
 */
router.post('/:id/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { id } = req.params

    const deploymentService = getProjectDeploymentService()
    await deploymentService.startProject(id, user.userId)

    res.json({
      success: true,
      message: '项目已启动'
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 启动项目失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '启动项目失败'
    })
  }
})

/**
 * POST /api/deployments/:id/stop
 * 停止项目
 */
router.post('/:id/stop', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { id } = req.params

    const deploymentService = getProjectDeploymentService()
    await deploymentService.stopProject(id, user.userId)

    res.json({
      success: true,
      message: '项目已停止'
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 停止项目失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '停止项目失败'
    })
  }
})

/**
 * DELETE /api/deployments/:id
 * 删除部署
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { id } = req.params

    const deploymentService = getProjectDeploymentService()
    await deploymentService.deleteProject(id, user.userId)

    res.json({
      success: true,
      message: '部署已删除'
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 删除部署失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '删除部署失败'
    })
  }
})

/**
 * GET /api/deployments/:id/logs
 * 获取项目日志
 */
router.get('/:id/logs', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { id } = req.params
    const lines = parseInt(req.query.lines as string) || 100

    const deploymentService = getProjectDeploymentService()
    const logs = await deploymentService.getProjectLogs(id, user.userId, lines)

    res.json({
      success: true,
      data: logs
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 获取日志失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取日志失败'
    })
  }
})

// ==================== 外部访问路由 ====================

/**
 * POST /api/deployments/:id/external-access
 * 开启外部访问
 */
router.post('/:id/external-access', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { id } = req.params

    const deploymentService = getProjectDeploymentService()
    const result = await deploymentService.enableExternalAccess(id, user.userId)

    res.json({
      success: true,
      data: result,
      message: '外部访问已开启'
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 开启外部访问失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '开启外部访问失败'
    })
  }
})

/**
 * DELETE /api/deployments/:id/external-access
 * 关闭外部访问
 */
router.delete('/:id/external-access', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { id } = req.params

    const deploymentService = getProjectDeploymentService()
    await deploymentService.disableExternalAccess(id, user.userId)

    res.json({
      success: true,
      message: '外部访问已关闭'
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 关闭外部访问失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '关闭外部访问失败'
    })
  }
})

export default router
