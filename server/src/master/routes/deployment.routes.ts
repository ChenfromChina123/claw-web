/**
 * 项目部署 API 路由
 * 
 * 提供的端点：
 * - POST /api/deployments - 创建新项目部署
 * - GET /api/deployments - 获取用户所有项目
 * - GET /api/deployments/:projectId - 获取项目详情
 * - PUT /api/deployments/:projectId - 更新项目配置
 * - DELETE /api/deployments/:projectId - 删除项目
 * - POST /api/deployments/:projectId/start - 启动项目
 * - POST /api/deployments/:projectId/stop - 停止项目
 * - POST /api/deployments/:projectId/restart - 重启项目
 * - GET /api/deployments/:projectId/logs - 获取项目日志
 * - GET /api/deployments/:projectId/status - 获取项目状态
 */

import { Router, type Request, type Response } from 'express'
import { getProjectDeploymentService, type DeploymentRequest } from '../services/projectDeploymentService'
import { verifyToken } from '../utils/auth'
import { createSuccessResponse, createErrorResponse } from '../utils/response'

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

// ==================== 路由定义 ====================

/**
 * POST /api/deployments
 * 创建新项目部署
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const deploymentService = getProjectDeploymentService()

    // 构建部署请求
    const request: DeploymentRequest = {
      userId: user.userId,
      name: req.body.name,
      type: req.body.type || 'nodejs',
      sourceType: req.body.sourceType || 'upload',
      sourceUrl: req.body.sourceUrl,
      sourceCode: req.body.sourceCode,
      buildCommand: req.body.buildCommand,
      startCommand: req.body.startCommand,
      envVars: req.body.envVars,
      memoryLimit: req.body.memoryLimit,
      autoRestart: req.body.autoRestart ?? true
    }

    // 验证必填字段
    if (!request.name || !request.startCommand) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段：name, startCommand'
      })
    }

    // 创建部署
    const deployment = await deploymentService.createProject(request)

    res.json({
      success: true,
      data: deployment,
      message: '项目部署成功'
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 创建部署失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '创建部署失败'
    })
  }
})

/**
 * GET /api/deployments
 * 获取用户所有项目
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const deploymentService = getProjectDeploymentService()

    const projects = await deploymentService.listUserProjects(user.userId)

    res.json({
      success: true,
      data: {
        total: projects.length,
        projects
      }
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 获取项目列表失败:', error)
    res.status(500).json({
      success: false,
      error: '获取项目列表失败'
    })
  }
})

/**
 * GET /api/deployments/:projectId
 * 获取项目详情
 */
router.get('/:projectId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { projectId } = req.params

    // TODO: 从数据库获取项目详情
    res.json({
      success: true,
      data: {
        projectId,
        message: '功能开发中'
      }
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 获取项目详情失败:', error)
    res.status(500).json({
      success: false,
      error: '获取项目详情失败'
    })
  }
})

/**
 * POST /api/deployments/:projectId/start
 * 启动项目
 */
router.post('/:projectId/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { projectId } = req.params
    const deploymentService = getProjectDeploymentService()

    await deploymentService.startProject(projectId, user.userId)

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
 * POST /api/deployments/:projectId/stop
 * 停止项目
 */
router.post('/:projectId/stop', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { projectId } = req.params
    const deploymentService = getProjectDeploymentService()

    await deploymentService.stopProject(projectId, user.userId)

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
 * POST /api/deployments/:projectId/restart
 * 重启项目
 */
router.post('/:projectId/restart', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { projectId } = req.params
    const deploymentService = getProjectDeploymentService()

    await deploymentService.stopProject(projectId, user.userId)
    await deploymentService.startProject(projectId, user.userId)

    res.json({
      success: true,
      message: '项目已重启'
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 重启项目失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '重启项目失败'
    })
  }
})

/**
 * DELETE /api/deployments/:projectId
 * 删除项目
 */
router.delete('/:projectId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { projectId } = req.params
    const deploymentService = getProjectDeploymentService()

    await deploymentService.deleteProject(projectId, user.userId)

    res.json({
      success: true,
      message: '项目已删除'
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 删除项目失败:', error)
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '删除项目失败'
    })
  }
})

/**
 * GET /api/deployments/:projectId/logs
 * 获取项目日志
 */
router.get('/:projectId/logs', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { projectId } = req.params
    const lines = parseInt(req.query.lines as string) || 100
    const deploymentService = getProjectDeploymentService()

    const logs = await deploymentService.getProjectLogs(projectId, user.userId, lines)

    res.json({
      success: true,
      data: logs
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 获取日志失败:', error)
    res.status(500).json({
      success: false,
      error: '获取日志失败'
    })
  }
})

/**
 * GET /api/deployments/:projectId/status
 * 获取项目状态
 */
router.get('/:projectId/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { projectId } = req.params
    const deploymentService = getProjectDeploymentService()

    const status = await deploymentService.getProjectStatus(projectId, user.userId)

    res.json({
      success: true,
      data: status
    })
  } catch (error) {
    console.error('[DeploymentRoutes] 获取状态失败:', error)
    res.status(500).json({
      success: false,
      error: '获取状态失败'
    })
  }
})

export default router
