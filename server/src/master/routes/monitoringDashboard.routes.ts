/**
 * Monitoring Dashboard Routes - 资源监控仪表盘API
 *
 * 提供的端点：
 * - GET /api/monitoring/metrics - Prometheus格式指标
 * - GET /api/monitoring/dashboard - 仪表盘数据
 * - GET /api/monitoring/alerts - 告警列表
 * - GET /api/monitoring/history/:metric - 历史趋势
 *
 * 使用场景：
 * - Grafana集成
 * - 运维监控面板
 * - 性能分析
 * - 容量规划
 */

import { Router, type Request, type Response } from 'express'
import { getContainerOrchestrator } from '../orchestrator/containerOrchestrator'
import { getUserContainerMapper } from '../orchestrator/userContainerMapper'
import { getSchedulingPolicy, UserTier } from '../orchestrator/schedulingPolicy'
import { getEnhancedWarmPoolManager } from '../orchestrator/enhancedWarmPool'

const router = Router()

// ==================== 中间件：认证 ====================

/**
 * 简单认证中间件
 */
function requireAuth(req: Request, res: Response, next: Function) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未授权' })
  }
  next()
}

// ==================== 路由定义 ====================

/**
 * GET /api/monitoring/metrics
 * Prometheus格式的指标导出端点
 */
router.get('/metrics', (req: Request, res: Response) => {
  try {
    const orchestrator = getContainerOrchestrator()
    const mapper = getUserContainerMapper()
    const poolStats = orchestrator.getPoolStatus()
    const mappingStats = mapper.getStats()
    const schedulingPolicy = getSchedulingPolicy()
    const queueStatus = schedulingPolicy.getQueueStatus()

    // 构建Prometheus格式指标
    const metrics: string[] = []

    // 基础指标
    metrics.push(
      `# HELP claw_web_total_users Total number of mapped users`,
      `# TYPE claw_web_total_users gauge`,
      `claw_web_total_users ${mappingStats.totalUsers}`,
      ``,

      `# HELP claw_web_active_users Number of active users (last 5 minutes)`,
      `# TYPE claw_web_active_users gauge`,
      `claw_web_active_users ${mappingStats.activeUsers}`,
      ``,

      `# HELP claw_web_pool_size Current warm pool size`,
      `# TYPE claw_web_pool_size gauge`,
      `claw_web_pool_size ${poolStats.totalContainers}`,
      ``,

      `# HELP claw_web_idle_containers Number of idle containers in pool`,
      `# TYPE claw_web_idle_containers gauge`,
      `claw_web_idle_containers ${poolStats.idleContainers}`,
      ``,

      `# HELP claw_web_queue_length Number of requests waiting in queue`,
      `# TYPE claw_web_queue_length gauge`,
      `claw_web_queue_length ${queueStatus.length}`,
      ``,

      // 按用户等级分布
      ...Object.entries(queueStatus.byTier).map(([tier, count]) =>
        [
          `# HELP claw_web_users_by_tier Users count by tier`,
          `# TYPE claw_web_users_by_tier gauge`,
          `claw_web_users_by_tier{tier="${tier}"} ${count}`,
          ``
        ].join('\n')
      ),

      // 会话统计
      `# HELP claw_web_avg_sessions Average sessions per user`,
      `# TYPE claw_web_avg_sessions gauge`,
      `claw_web_avg_sessions ${mappingStats.avgSessionCount}`,
      ``,

      // 时间戳
      `# HELP claw_web_last_export_time Unix timestamp of last export`,
      `# TYPE claw_web_last_export_time gauge`,
      `claw_web_last_export_time ${Math.floor(Date.now() / 1000)}`
    )

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    res.send(metrics.join('\n'))

  } catch (error) {
    console.error('[MonitoringRoutes] 导出指标失败:', error)
    res.status(500).json({
      success: false,
      error: '导出指标失败'
    })
  }
})

/**
 * GET /api/monitoring/dashboard
 * 返回仪表盘所需的综合数据
 */
router.get('/dashboard', requireAuth, async (req: Request, res: Response) => {
  try {
    const orchestrator = getContainerOrchestrator()
    const mapper = getUserContainerMapper()
    const schedulingPolicy = getSchedulingPolicy()

    // 收集各模块数据
    const poolStats = orchestrator.getPoolStatus()
    const mappingStats = mapper.getStats()
    const queueStatus = schedulingPolicy.getQueueStatus()
    const tierConfigs = schedulingPolicy.getTierConfig() as Record<UserTier, any>

    // 计算系统健康度评分 (0-100)
    const healthScore = calculateSystemHealth(poolStats, mappingStats, queueStatus)

    // 构建响应数据
    const dashboardData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalUsers: mappingStats.totalUsers,
        activeUsers: mappingStats.activeUsers,
        poolUtilization: poolStats.poolUtilization,
        healthScore,
        status: healthScore >= 80 ? 'healthy' : healthScore >= 60 ? 'warning' : 'critical'
      },
      pool: {
        totalContainers: poolStats.totalContainers,
        idleContainers: poolStats.idleContainers,
        activeContainers: poolStats.activeUsers,
        utilizationPercent: Math.round(poolStats.poolUtilization * 100) / 100
      },
      users: {
        byTier: Object.entries(mappingStats.ageDistribution || {}).map(([range, count]) => ({
          range,
          count
        })),
        avgSessionsPerUser: mappingStats.avgSessionCount,
        maxSessionUser: mappingStats.maxSessionUser
      },
      queue: {
        length: queueStatus.length,
        oldestWaitTimeMs: queueStatus.oldestWaitTimeMs,
        byTier: queueStatus.byTier
      },
      tiers: Object.entries(tierConfigs).map(([tier, config]) => ({
        tier,
        maxSessions: config.maxSessions,
        storageQuotaMB: config.storageQuotaMB,
        priority: config.priority
      })),
      alerts: generateAlerts(poolStats, mappingStats, queueStatus),
      recommendations: generateRecommendations(poolStats, mappingStats, queueStatus)
    }

    res.json({
      success: true,
      data: dashboardData
    })

  } catch (error) {
    console.error('[MonitoringRoutes] 获取仪表盘数据失败:', error)
    res.status(500).json({
      success: false,
      error: '获取仪表盘数据失败'
    })
  }
})

/**
 * GET /api/monitoring/alerts
 * 获取当前活跃的告警
 */
router.get('/alerts', requireAuth, (req: Request, res: Response) => {
  try {
    const orchestrator = getContainerOrchestrator()
    const mapper = getUserContainerMapper()
    const schedulingPolicy = getSchedulingPolicy()

    const poolStats = orchestrator.getPoolStatus()
    const mappingStats = mapper.getStats()
    const queueStatus = schedulingPolicy.getQueueStatus()

    const alerts = generateAlerts(poolStats, mappingStats, queueStatus)

    res.json({
      success: true,
      data: {
        totalAlerts: alerts.length,
        criticalCount: alerts.filter(a => a.severity === 'critical').length,
        warningCount: alerts.filter(a => a.severity === 'warning').length,
        infoCount: alerts.filter(a => a.severity === 'info').length,
        alerts
      }
    })

  } catch (error) {
    console.error('[MonitoringRoutes] 获取告警失败:', error)
    res.status(500).json({
      success: false,
      error: '获取告警失败'
    })
  }
})

/**
 * GET /api/monitoring/history/:metric
 * 获取指定指标的历史数据
 */
router.get('/history/:metric', requireAuth, (req: Request, res: Response) => {
  try {
    const metric = req.params.metric
    const hours = parseInt(req.query.hours as string) || 24
    const interval = parseInt(req.query.interval as string) || 5 // 分钟

    // 验证指标名称
    const validMetrics = ['active_users', 'pool_size', 'queue_length', 'health_score']
    if (!validMetrics.includes(metric)) {
      return res.status(400).json({
        success: false,
        error: `无效的指标名称。有效值: ${validMetrics.join(', ')}`
      })
    }

    // 生成模拟历史数据（实际应从时序数据库查询）
    const historyData = generateMockHistoryData(metric, hours, interval)

    res.json({
      success: true,
      data: {
        metric,
        timeRange: {
          start: new Date(Date.now() - hours * 3600000).toISOString(),
          end: new Date().toISOString(),
          intervalMinutes: interval
        },
        points: historyData.length,
        data: historyData
      }
    })

  } catch (error) {
    console.error('[MonitoringRoutes] 获取历史数据失败:', error)
    res.status(500).json({
      success: false,
      error: '获取历史数据失败'
    })
  }
})

// ==================== 辅助函数 ====================

/**
 * 计算系统综合健康评分
 */
function calculateSystemHealth(
  poolStats: any,
  mappingStats: any,
  queueStatus: any
): number {
  let score = 100

  // 池利用率扣分
  if (poolStats.poolUtilization > 90) {
    score -= 20
  } else if (poolStats.poolUtilization > 75) {
    score -= 10
  }

  // 空闲容器不足扣分
  if (poolStats.idleContainers < 3 && poolStats.activeUsers > 10) {
    score -= 15
  }

  // 排队长度扣分
  if (queueStatus.length > 20) {
    score -= 25
  } else if (queueStatus.length > 10) {
    score -= 15
  } else if (queueStatus.length > 5) {
    score -= 5
  }

  // 用户活动比例加分
  const activeRatio = mappingStats.activeUsers / Math.max(mappingStats.totalUsers, 1)
  if (activeRatio > 0.8) {
    score += 5  // 高活跃度说明系统受欢迎
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * 生成告警列表
 */
function generateAlerts(
  poolStats: any,
  mappingStats: any,
  queueStatus: any
): Array<{
  id: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  timestamp: string
}> {
  const alerts = []
  const now = new Date().toISOString()

  // 危急告警
  if (poolStats.poolUtilization >= 95) {
    alerts.push({
      id: 'pool_exhausted',
      severity: 'critical',
      title: '容器池即将耗尽',
      message: `池利用率已达${poolStats.poolUtilization.toFixed(1)}%，需要立即扩容`,
      timestamp: now
    })
  }

  if (queueStatus.length > 30) {
    alerts.push({
      id: 'queue_overflow',
      severity: 'critical',
      title: '请求队列过长',
      message: `当前有${queueStatus.length}个请求在排队等待，最长等待${Math.round((queueStatus.oldestWaitTimeMs || 0) / 1000)}秒`,
      timestamp: now
    })
  }

  // 警告级别
  if (poolStats.poolUtilization >= 80 && poolStats.poolUtilization < 95) {
    alerts.push({
      id: 'pool_high_utilization',
      severity: 'warning',
      title: '容器池使用率较高',
      message: `池利用率为${poolStats.poolUtilization.toFixed(1)}%，建议关注`,
      timestamp: now
    })
  }

  if (poolStats.idleContainers < 3 && mappingStats.activeUsers > 5) {
    alerts.push({
      id: 'low_idle_containers',
      severity: 'warning',
      title: '空闲容器不足',
      message: `仅剩${poolStats.idleContainers}个空闲容器，但活跃用户较多`,
      timestamp: now
    })
  }

  if (queueStatus.length > 10) {
    alerts.push({
      id: 'queue_warning',
      severity: 'warning',
      title: '存在排队等待',
      message: `${queueStatus.length}个请求正在排队，可能影响用户体验`,
      timestamp: now
    })
  }

  // 信息提示
  if (alerts.length === 0) {
    alerts.push({
      id: 'system_healthy',
      severity: 'info',
      title: '系统运行正常',
      message: `所有指标正常：${mappingStats.activeUsers}个活跃用户，${poolStats.idleContainers}个空闲容器`,
      timestamp: now
    })
  }

  return alerts
}

/**
 * 生成优化建议
 */
function generateRecommendations(
  poolStats: any,
  mappingStats: any,
  queueStatus: any
): string[] {
  const recommendations: string[] = []

  if (poolStats.poolUtilization > 85) {
    recommendations.push('建议增加容器池最小大小或启用自动扩缩容')
  }

  if (poolStats.idleContainers < 5 && mappingStats.activeUsers > 20) {
    recommendations.push('建议预热更多容器以应对高峰期')
  }

  if (queueStatus.length > 15) {
    recommendations.push('考虑升级服务器配置或优化调度算法')
  }

  if (mappingStats.avgSessionCount > 8) {
    recommendations.push('部分用户会话数偏高，建议检查是否存在异常行为')
  }

  if (recommendations.length === 0) {
    recommendations.push('当前运行状态良好，无需特别关注')
  }

  return recommendations
}

/**
 * 生成模拟历史数据
 */
function generateMockHistoryData(
  metric: string,
  hours: number,
  intervalMinutes: number
): Array<{ timestamp: string; value: number }> {
  const points = []
  const now = Date.now()
  const totalPoints = (hours * 60) / intervalMinutes

  for (let i = totalPoints; i >= 0; i--) {
    const timestamp = new Date(now - i * intervalMinutes * 60000)

    // 根据不同指标生成不同的模拟模式
    let baseValue: number
    let variance: number

    switch (metric) {
      case 'active_users':
        baseValue = 50 + Math.sin(i / 20) * 30  // 波动模式
        variance = 10
        break
      case 'pool_size':
        baseValue = 10
        variance = 2
        break
      case 'queue_length':
        baseValue = Math.max(0, 5 + Math.random() * 10 - i * 0.1)  // 趋势下降
        variance = 3
        break
      case 'health_score':
        baseValue = 85 + Math.random() * 10
        variance = 5
        break
      default:
        baseValue = 50
        variance = 10
    }

    const value = Math.round((baseValue + (Math.random() - 0.5) * variance) * 100) / 100

    points.push({
      timestamp: timestamp.toISOString(),
      value: Math.max(0, value)
    })
  }

  return points
}

export default router
