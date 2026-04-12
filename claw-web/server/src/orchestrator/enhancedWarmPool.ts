/**
 * EnhancedWarmPoolManager - 增强型热容器池管理器
 *
 * 功能：
 * - 动态扩缩容（根据负载自动调整池大小）
 * - 优先级队列（VIP用户优先获取）
 * - 预测性预热（基于历史数据预测需求峰值）
 * - 容器健康度评分（综合多维度指标）
 * - 资源优化回收策略
 *
 * 与ContainerOrchestrator的关系：
 * - 本模块是Orchestrator的内部组件
 * - 负责更精细化的热池管理逻辑
 * - Orchestrator调用本模块的方法进行池操作
 */

import { ContainerInstance, type PoolConfig } from './containerOrchestrator'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// ==================== 类型定义 ====================

/**
 * 容器健康评分
 */
export interface ContainerHealthScore {
  /** 容器ID */
  containerId: string
  /** 综合评分 (0-100) */
  score: number
  /** 健康等级 */
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  /** 各项指标 */
  metrics: {
    uptimeMinutes: number
    memoryUtilization: number
    responseTimeMs: number
    errorRate: number
    lastHealthCheckAge: number
  }
  /** 评估时间 */
  assessedAt: Date
}

/**
 * 池扩缩容事件
 */
export interface PoolScalingEvent {
  type: 'scale_up' | 'scale_down'
  previousSize: number
  newSize: number
  reason: string
  triggeredBy: 'auto' | 'manual' | 'scheduled'
  timestamp: Date
}

/**
 * 需求预测结果
 */
export interface DemandPrediction {
  /** 预测时间窗口 */
  timeWindow: {
    start: Date
    end: Date
  }
  /** 预测的平均并发用户数 */
  predictedAvgUsers: number
  /** 预测的峰值用户数 */
  predictedPeakUsers: number
  /** 建议的最小池大小 */
  recommendedMinPoolSize: number
  /** 置信度 (0-1) */
  confidence: number
  /** 基于的历史数据点数 */
  dataPointsUsed: number
}

// ==================== EnhancedWarmPoolManager 类 ====================

class EnhancedWarmPoolManager {
  private config: Required<PoolConfig>
  private healthScores: Map<string, ContainerHealthScore> = new Map()
  private scalingHistory: PoolScalingEvent[] = []
  private demandHistory: Array<{ timestamp: Date; activeUsers: number }> = []
  private autoScalingEnabled: boolean = true
  private predictivePrewarmEnabled: boolean = true

  constructor(config: Required<PoolConfig>) {
    this.config = config
    console.log('[EnhancedWarmPool] 初始化完成')
  }

  /**
   * 计算容器的综合健康评分
   * @param container 容器实例
   * @returns 健康评分对象
   */
  async calculateHealthScore(container: ContainerInstance): Promise<ContainerHealthScore> {
    const now = new Date()
    const uptimeMinutes = (now.getTime() - container.createdAt.getTime()) / 1000 / 60

    // 1. 运行时间评分 (0-25分)
    let uptimeScore: number
    if (uptimeMinutes < 5) {
      uptimeScore = 10  // 新启动，可能还不稳定
    } else if (uptimeMinutes < 60) {
      uptimeScore = 20  // 较新但已稳定
    } else if (uptimeMinutes < 1440) {  // < 24小时
      uptimeScore = 25  // 最佳状态
    } else {
      uptimeScore = 15  // 运行较久，可能有内存碎片
    }

    // 2. 内存使用评分 (0-25分)
    const memoryUsage = container.resourceUsage?.memoryMB || 128
    const maxMemory = 256  // Worker容器最大内存
    const memoryUtilization = memoryUsage / maxMemory

    let memoryScore: number
    if (memoryUtilization < 0.5) {
      memoryScore = 25  // 内存充裕
    } else if (memoryUtilization < 0.75) {
      memoryScore = 20  // 正常使用
    } else if (memoryUtilization < 0.9) {
      memoryScore = 10  // 使用率较高
    } else {
      memoryScore = 0   // 接近上限
    }

    // 3. 响应时间评分 (0-25分)
    // 模拟：实际应通过探针测量
    const responseTimeMs = this.simulateResponseTime(container)
    let responseScore: number
    if (responseTimeMs < 100) {
      responseScore = 25  // 极快
    } else if (responseTimeMs < 300) {
      responseScore = 20  // 快速
    } else if (responseTimeMs < 800) {
      responseScore = 10  // 可接受
    } else {
      responseScore = 0   // 过慢
    }

    // 4. 错误率评分 (0-25分)
    const errorRate = this.simulateErrorRate(container)
    let errorScore: number
    if (errorRate === 0) {
      errorScore = 25  // 无错误
    } else if (errorRate < 0.01) {
      errorScore = 20  // 极少错误
    } else if (errorRate < 0.05) {
      errorScore = 10  // 少量错误
    } else {
      errorScore = 0   // 错误率高
    }

    // 综合评分
    const totalScore = uptimeScore + memoryScore + responseScore + errorScore

    // 健康等级判定
    let level: ContainerHealthScore['level']
    if (totalScore >= 90) {
      level = 'excellent'
    } else if (totalScore >= 70) {
      level = 'good'
    } else if (totalScore >= 50) {
      level = 'fair'
    } else if (totalScore >= 30) {
      level = 'poor'
    } else {
      level = 'critical'
    }

    const score: ContainerHealthScore = {
      containerId: container.containerId,
      score: totalScore,
      level,
      metrics: {
        uptimeMinutes: Math.round(uptimeMinutes * 100) / 100,
        memoryUtilization: Math.round(memoryUtilization * 10000) / 100,
        responseTimeMs: Math.round(responseTimeMs),
        errorRate: Math.round(errorRate * 10000) / 100,
        lastHealthCheckAge: 0  // 即时检查
      },
      assessedAt: now
    }

    // 缓存评分
    this.healthScores.set(container.containerId, score)

    return score
  }

  /**
   * 根据优先级从热池选择最佳容器
   * @param availableContainers 可用容器列表
   * @param userTier 用户等级（可选）
   * @returns 最优容器，如果没有则返回null
   */
  selectBestContainer(
    availableContainers: ContainerInstance[],
    userTier?: string
  ): ContainerInstance | null {
    if (availableContainers.length === 0) {
      return null
    }

    // 如果只有一个，直接返回
    if (availableContainers.length === 1) {
      return availableContainers[0]
    }

    // 对所有可用容器计算或获取健康评分
    const scoredContainers = await Promise.all(
      availableContainers.map(async (container) => {
        let score = this.healthScores.get(container.containerId)
        if (!score || Date.now() - score.assessedAt.getTime() > 60000) {
          score = await this.calculateHealthScore(container)
        }
        return { container, score: score.score }
      })
    )

    // 按分数排序（高分在前）
    scoredContainers.sort((a, b) => b.score - a.score)

    // VIP用户获得最高分的容器
    // 其他用户也按分数分配，但可以加入随机性避免热点
    if (userTier === 'vip') {
      return scoredContainers[0].container
    }

    // 对于非VIP，从前3个中随机选择一个（负载均衡）
    const topCandidates = scoredContainers.slice(0, Math.min(3, scoredContainers.length))
    const randomIndex = Math.floor(Math.random() * topCandidates.length)

    return topCandidates[randomIndex].container
  }

  /**
   * 动态调整热池大小
   * @param currentSize 当前池大小
   * @param activeUserCount 当前活跃用户数
   * @returns 是否需要调整及调整建议
   */
  evaluateScalingNeed(
    currentSize: number,
    activeUserCount: number
  ): {
    shouldScale: boolean
    action: 'scale_up' | 'scale_down' | 'maintain'
    targetSize: number
    reason: string
    urgency: 'low' | 'medium' | 'high'
  } {
    if (!this.autoScalingEnabled) {
      return {
        shouldScale: false,
        action: 'maintain',
        targetSize: currentSize,
        reason: '自动扩缩容已禁用',
        urgency: 'low'
      }
    }

    // 记录需求数据用于预测
    this.recordDemand(activeUserCount)

    // 基于活跃用户数计算建议大小
    // 公式：目标大小 = 活跃用户数 * 1.2（20%缓冲）+ 最小预留(2)
    const calculatedTarget = Math.ceil(activeUserCount * 1.2) + 2

    // 限制在配置范围内
    const targetSize = Math.max(
      this.config.minPoolSize,
      Math.min(this.config.maxPoolSize, calculatedTarget)
    )

    // 判断是否需要调整
    const sizeDifference = targetSize - currentSize
    const differencePercent = Math.abs(sizeDifference / currentSize) * 100

    if (sizeDifference > 2 && differencePercent > 30) {
      // 需要大幅扩容
      return {
        shouldScale: true,
        action: 'scale_up',
        targetSize,
        reason: `活跃用户增长，当前${currentSize}个，需要${targetSize}个`,
        urgency: sizeDifference > 5 ? 'high' : 'medium'
      }
    } else if (sizeDifference < -2 && differencePercent > 30 && currentSize > this.config.minPoolSize) {
      // 需要缩容
      return {
        shouldScale: true,
        action: 'scale_down',
        targetSize,
        reason: `活跃用户减少，可从${currentSize}缩减至${targetSize}`,
        urgency: 'low'
      }
    }

    // 维持当前大小
    return {
      shouldScale: false,
      action: 'maintain',
      targetSize: currentSize,
      reason: `当前池大小${currentSize}合适`,
      urgency: 'low'
    }
  }

  /**
   * 执行扩缩容操作
   * @param action 操作类型
   * @param targetSize 目标大小
   * @param prewarmFunction 预热函数回调
   * @returns 操作结果
   */
  async executeScaling(
    action: 'scale_up' | 'scale_down',
    targetSize: number,
    prewarmFunction: () => Promise<ContainerInstance | null>,
    destroyFunction: (containerId: string) => Promise<boolean>,
    getCurrentPoolSize: () => number
  ): Promise<{
    success: boolean
    actualChange: number
    newSize: number
    event?: PoolScalingEvent
  }> {
    const currentSize = getCurrentPoolSize()
    const change = targetSize - currentSize

    if (change === 0) {
      return { success: true, actualChange: 0, newSize: currentSize }
    }

    try {
      let actualChange = 0

      if (action === 'scale_up') {
        // 扩容：创建新容器
        for (let i = 0; i < change; i++) {
          const result = await prewarmFunction()
          if (result) {
            actualChange++
          } else {
            console.warn(`[EnhancedWarmPool] 扩容第${i + 1}/${change}个容器失败`)
            break
          }
        }
      } else {
        // 缩容：销毁多余容器（实际由调用方决定销毁哪些）
        // 这里只记录建议，具体销毁由外部执行
        actualChange = -Math.min(Math.abs(change), currentSize - this.config.minPoolSize)
      }

      const event: PoolScalingEvent = {
        type: action,
        previousSize: currentSize,
        newSize: currentSize + actualChange,
        reason: `动态${action === 'scale_up' ? '扩容' : '缩容'}：目标${targetSize}`,
        triggeredBy: 'auto',
        timestamp: new Date()
      }

      this.scalingHistory.push(event)

      console.log(
        `[EnhancedWarmPool] ${action === 'scale_up' ? '扩容' : '缩容'}完成: ` +
        `${currentSize} -> ${currentSize + actualChange} (变化${actualChange})`
      )

      return {
        success: true,
        actualChange,
        newSize: currentSize + actualChange,
        event
      }

    } catch (error) {
      console.error(`[EnhancedWarmPool] ${action}失败:`, error)
      return {
        success: false,
        actualChange: 0,
        newSize: currentSize
      }
    }
  }

  /**
   * 基于历史数据预测未来需求
   * @param aheadMinutes 预测未来多少分钟
   * @returns 预测结果
   */
  predictDemand(aheadMinutes: number = 30): DemandPrediction {
    if (this.demandHistory.length < 10) {
      // 数据不足，返回保守估计
      return {
        timeWindow: {
          start: new Date(),
          end: new Date(Date.now() + aheadMinutes * 60 * 1000)
        },
        predictedAvgUsers: Math.ceil(this.config.minPoolSize / 1.2),
        predictedPeakUsers: this.config.maxPoolSize,
        recommendedMinPoolSize: this.config.minPoolSize,
        confidence: 0.3,
        dataPointsUsed: this.demandHistory.length
      }
    }

    // 使用简单的移动平均算法
    const recentData = this.demandHistory.slice(-60)  // 最近60个数据点
    const avgUsers = recentData.reduce((sum, d) => sum + d.activeUsers, 0) / recentData.length

    // 计算标准差（波动性）
    const variance = recentData.reduce((sum, d) =>
      sum + Math.pow(d.activeUsers - avgUsers, 2), 0
    ) / recentData.length
    const stdDev = Math.sqrt(variance)

    // 预测值 = 平均值 + 1个标准差（覆盖约84%的情况）
    const predictedPeak = Math.ceil(avgUsers + stdDev)
    const predictedAvg = Math.ceil(avgUsers)

    // 建议最小池大小（考虑缓冲）
    const recommendedMin = Math.max(
      this.config.minPoolSize,
      Math.min(this.config.maxPoolSize, Math.ceil(predictedPeak * 1.3))
    )

    // 置信度基于数据量
    const confidence = Math.min(0.95, this.demandHistory.length / 200)

    return {
      timeWindow: {
        start: new Date(),
        end: new Date(Date.now() + aheadMinutes * 60 * 1000)
      },
      predictedAvgUsers: predictedAvg,
      predictedPeakUsers: predictedPeak,
      recommendedMinPoolSize: recommendedMin,
      confidence: Math.round(confidence * 100) / 100,
      dataPointsUsed: recentData.length
    }
  }

  /**
   * 执行预测性预热
   * @param prewarmFunction 预热函数
   * @param getCurrentPoolSize 获取当前池大小函数
   */
  async executePredictivePrewarm(
    prewarmFunction: () => Promise<ContainerInstance | null>,
    getCurrentPoolSize: () => number
  ): Promise<{ created: number; skipped: number; reason?: string }> {
    if (!this.predictivePrewarmEnabled) {
      return { created: 0, skipped: 0, reason: '预测性预热已禁用' }
    }

    const prediction = this.predictDemand(30)
    const currentSize = getCurrentPoolSize()

    if (prediction.recommendedMinPoolSize <= currentSize) {
      return {
        created: 0,
        skipped: prediction.recommendedMinPoolSize - currentSize,
        reason: `当前池大小${currentSize}已满足预测需求${prediction.recommendedMinPoolSize}`
      }
    }

    const needToCreate = prediction.recommendedMinPoolSize - currentSize
    let created = 0

    console.log(
      `[EnhancedWarmPool] 预测性预热: 预测峰值${prediction.predictedPeakUsers}用户, ` +
      `建议池大小${prediction.recommendedMinPoolSize}, 当前${currentSize}, 需新增${needToCreate}`
    )

    for (let i = 0; i < needToCreate; i++) {
      const result = await prewarmFunction()
      if (result) {
        created++
      } else {
        break
      }
    }

    return { created, skipped: needToCreate - created }
  }

  /**
   * 获取池的健康报告
   * @returns 所有容器的健康状态汇总
   */
  getPoolHealthReport(): {
    totalContainers: number
    averageScore: number
    distribution: Record<string, number>
    recommendations: string[]
  } {
    const scores = Array.from(this.healthScores.values())

    if (scores.length === 0) {
      return {
        totalContainers: 0,
        averageScore: 0,
        distribution: {},
        recommendations: ['暂无健康数据']
      }
    }

    const averageScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length

    const distribution: Record<string, number> = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      critical: 0
    }

    for (const score of scores) {
      distribution[score.level]++
    }

    // 生成建议
    const recommendations: string[] = []

    if (distribution.critical > 0) {
      recommendations.push(`发现${distribution.critical}个严重不健康的容器，建议立即检查`)
    }

    if (distribution.poor > scores.length * 0.3) {
      recommendations.push('超过30%容器健康状况较差，建议排查原因')
    }

    if (averageScore < 60) {
      recommendations.push(`平均健康分${averageScore.toFixed(1)}偏低，建议关注资源使用情况`)
    }

    if (averageScore >= 85) {
      recommendations.push('容器池整体健康状态良好')
    }

    return {
      totalContainers: scores.length,
      averageScore: Math.round(averageScore * 100) / 100,
      distribution,
      recommendations
    }
  }

  /**
   * 获取扩缩容历史
   * @param limit 返回最近多少条记录
   */
  getScalingHistory(limit: number = 20): PoolScalingEvent[] {
    return this.scalingHistory.slice(-limit)
  }

  /**
   * 启用/禁用自动扩缩容
   */
  setAutoScaling(enabled: boolean): void {
    this.autoScalingEnabled = enabled
    console.log(`[EnhancedWarmPool] 自动扩缩容: ${enabled ? '已启用' : '已禁用'}`)
  }

  /**
   * 启用/禁用预测性预热
   */
  setPredictivePrewarm(enabled: boolean): void {
    this.predictivePrewarmEnabled = enabled
    console.log(`[EnhancedWarmPool] 预测性预热: ${enabled ? '已启用' : '已禁用'}`)
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 模拟响应时间（实际应通过探针测量）
   */
  private simulateResponseTime(container: ContainerInstance): number {
    // 基于容器年龄和状态的简单模拟
    const ageMinutes = (Date.now() - container.createdAt.getTime()) / 60000

    if (ageMinutes < 2) {
      return 500 + Math.random() * 500  // 启动初期较慢
    }

    const baseResponse = 50 + Math.random() * 150

    // 根据状态调整
    switch (container.status) {
      case 'idle':
        return baseResponse  // 空闲时响应快
      case 'assigned':
        return baseResponse + 50  // 有负载时稍慢
      case 'error':
        return 2000 + Math.random() * 3000  // 错误时很慢
      default:
        return baseResponse
    }
  }

  /**
   * 模拟错误率（实际应统计）
   */
  private simulateErrorRate(container: ContainerInstance): number {
    if (container.status === 'error') {
      return 0.5 + Math.random() * 0.5  // 50-100%错误率
    }

    if (container.status === 'creating') {
      return Math.random() * 0.1  // 创建中可能有少量错误
    }

    // 正常情况下极低错误率
    return Math.random() * 0.01  // 0-1%
  }

  /**
   * 记录需求数据点
   */
  private recordDemand(activeUsers: number): void {
    this.demandHistory.push({
      timestamp: new Date(),
      activeUsers
    })

    // 只保留最近24小时的数据（假设每分钟记录一次，最多1440条）
    if (this.demandHistory.length > 1440) {
      this.demandHistory.shift()
    }
  }
}

// ==================== 单例模式 ====================

let enhancedWarmPoolManager: EnhancedWarmPoolManager | null = null

/**
 * 获取EnhancedWarmPoolManager单例实例
 * @param config 池配置
 * @return 管理器实例
 */
export function getEnhancedWarmPoolManager(config: Required<PoolConfig>): EnhancedWarmPoolManager {
  if (!enhancedWarmPoolManager) {
    enhancedWarmPoolManager = new EnhancedWarmPoolManager(config)
  }
  return enhancedWarmPoolManager
}

export default EnhancedWarmPoolManager
