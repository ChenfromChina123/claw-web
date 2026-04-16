/**
 * Performance Benchmark Tool - 性能基准测试工具
 *
 * 功能：
 * - 模拟多用户并发访问
 * - 测量响应时间分布（P50/P95/P99）
 * - 吞吐量测量（RPS - Requests Per Second）
 * - 错误率统计
 * - 资源使用监控（CPU/内存）
 * - 生成性能报告
 *
 * 使用场景：
 * - 容量规划（确定系统承载能力）
 * - 回归测试（版本间性能对比）
 * - 压力测试（发现性能瓶颈）
 * - SLA验证（确认满足服务等级协议）
 */

import { performance } from 'perf_hooks'
import { getContainerOrchestrator } from '../orchestrator/containerOrchestrator'
import { getUserContainerMapper } from '../orchestrator/userContainerMapper'
import { getSchedulingPolicy, UserTier } from '../orchestrator/schedulingPolicy'
import { getUserRateLimiter } from '../middleware/rateLimiter'

// ==================== 类型定义 ====================

/**
 * 压测配置
 */
export interface BenchmarkConfig {
  /** 并发用户数 */
  concurrentUsers: number
  /** 每个用户的请求数 */
  requestsPerUser: number
  /** 请求间隔（毫秒）*/
  requestIntervalMs: number
  /** 预热阶段请求数（不计入统计）*/
  warmupRequests: number
  /** 目标端点URL */
  targetUrl: string
  /** HTTP方法 */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** 请求体（POST/PUT时使用）*/
  body?: any
  /** 自定义headers */
  headers?: Record<string, string>
  /** 是否启用详细日志 */
  verbose: boolean
}

/**
 * 单次请求结果
 */
export interface RequestResult {
  /** 请求序号 */
  requestId: number
  /** 用户ID（模拟）*/
  userId: string
  /** 是否成功 */
  success: boolean
  /** 响应时间（毫秒）*/
  responseTimeMs: number
  /** HTTP状态码 */
  statusCode?: number
  /** 错误信息 */
  error?: string
  /** 时间戳 */
  timestamp: Date
}

/**
 * 基准测试结果
 */
export interface BenchmarkResult {
  /** 测试配置摘要 */
  config: {
    totalUsers: number
    totalRequests: number
    durationMs: number
    startedAt: Date
    completedAt: Date
  }
  /** 总体统计 */
  summary: {
    totalRequests: number
    successfulRequests: number
    failedRequests: number
    errorRate: number
    throughputRps: number  // 每秒处理请求数
  }
  /** 响应时间统计 */
  responseTime: {
    avgMs: number
    minMs: number
    maxMs: number
    p50Ms: number   // 中位数
    p90Ms: number
    p95Ms: number
    p99Ms: number
    stdDevMs: number  // 标准差
  }
  /** 按用户统计 */
  perUserStats: Array<{
    userId: string
    totalRequests: number
    avgResponseTimeMs: number
    errorCount: number
  }>
  /** 系统资源快照 */
  systemResources: {
    memoryUsageMB: number
    cpuUsagePercent: number
    activeContainers: number
    queueLength: number
  }
  /** 详细结果列表（可选，verbose模式）*/
  details?: RequestResult[]
  /** 评级 */
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F'
  /** 建议 */
  recommendations: string[]
}

// ==================== PerformanceBenchmark 类 ====================

class PerformanceBenchmark {
  private results: RequestResult[] = []
  private startTime: number = 0
  private endTime: number = 0

  /**
   * 执行基准测试
   * @param config 测试配置
   * @returns 完整的测试报告
   */
  async runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult> {
    console.log('\n========================================')
    console.log('  🚀 Performance Benchmark Starting')
    console.log('========================================')
    console.log(`  并发用户: ${config.concurrentUsers}`)
    console.log(`  每用户请求: ${config.requestsPerUser}`)
    console.log(`  目标端点: ${config.targetUrl}`)
    console.log('========================================\n')

    this.results = []
    this.startTime = performance.now()

    // 1. 预热阶段
    if (config.warmupRequests > 0) {
      console.log(`🔥 预热阶段：发送 ${config.warmupRequests} 个请求...`)
      for (let i = 0; i < config.warmupRequests; i++) {
        try {
          await fetch(config.targetUrl, { method: config.method })
        } catch (e) {
          // 忽略预热错误
        }
      }
      console.log('✅ 预热完成\n')
    }

    // 2. 正式测试阶段
    const userPromises: Promise<void>[] = []

    for (let userIndex = 0; userIndex < config.concurrentUsers; userIndex++) {
      const userId = `bench-user-${userIndex + 1}`

      const userPromise = this.simulateUserLoad(
        userId,
        userIndex * config.requestsPerUser + 1,
        config
      )

      userPromises.push(userPromise)
    }

    // 等待所有用户完成
    await Promise.all(userPromises)

    this.endTime = performance.now()

    // 3. 生成报告
    const report = this.generateReport(config)

    this.printReport(report)

    return report
  }

  /**
   * 模拟单个用户的负载
   */
  private async simulateUserLoad(
    userId: string,
    startRequestId: number,
    config: BenchmarkConfig
  ): Promise<void> {
    for (let reqIndex = 0; reqIndex < config.requestsPerUser; reqIndex++) {
      const requestId = startRequestId + reqIndex

      // 限流检查（模拟真实场景）
      const rateLimiter = getUserRateLimiter()
      const rateLimitResult = rateLimiter.checkRateLimit(userId)

      if (!rateLimitResult.allowed && config.verbose) {
        console.warn(`  [${userId}] 请求 #${reqId} 被限流`)
        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, rateLimitResult.retryAfterMs || 100))
      }

      // 发送请求并计时
      const result = await this.measureRequest(requestId, userId, config)
      this.results.push(result)

      // 请求间隔
      if (config.requestIntervalMs > 0 && reqIndex < config.requestsPerUser - 1) {
        await new Promise(resolve => setTimeout(resolve, config.requestIntervalMs))
      }
    }
  }

  /**
   * 测量单次请求
   */
  private async measureRequest(
    requestId: number,
    userId: string,
    config: BenchmarkConfig
  ): Promise<RequestResult> {
    const startTime = performance.now()

    try {
      const fetchOptions: RequestInit = {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers
        },
        signal: AbortSignal.timeout(10000) // 10秒超时
      }

      if (config.body && (config.method === 'POST' || config.method === 'PUT')) {
        fetchOptions.body = JSON.stringify(config.body)
      }

      const response = await fetch(config.targetUrl, fetchOptions)
      const endTime = performance.now()

      return {
        requestId,
        userId,
        success: response.ok,
        responseTimeMs: Math.round((endTime - startTime) * 100) / 100,
        statusCode: response.status,
        timestamp: new Date()
      }

    } catch (error) {
      const endTime = performance.now()

      return {
        requestId,
        userId,
        success: false,
        responseTimeMs: Math.round((endTime - startTime) * 100) / 100,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      }
    }
  }

  /**
   * 生成完整报告
   */
  private generateReport(config: BenchmarkConfig): BenchmarkResult {
    const totalDurationMs = this.endTime - this.startTime
    const successfulResults = this.results.filter(r => r.success)
    const failedResults = this.results.filter(r => !r.success)

    // 计算响应时间统计
    const responseTimes = successfulResults.map(r => r.responseTimeMs).sort((a, b) => a - b)

    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
      : 0

    const minResponseTime = responseTimes.length > 0 ? responseTimes[0] : 0
    const maxResponseTime = responseTimes.length > 0 ? responseTimes[responseTimes.length - 1] : 0

    const p50 = this.percentile(responseTimes, 50)
    const p90 = this.percentile(responseTimes, 90)
    const p95 = this.percentile(responseTimes, 95)
    const p99 = this.percentile(responseTimes, 99)

    const stdDev = this.calculateStdDev(responseTimes, avgResponseTime)

    // 计算吞吐量
    const throughputRps = this.results.length / (totalDurationMs / 1000)

    // 按用户统计
    const userStatsMap = new Map<string, {
      totalRequests: number
      totalTime: number
      errorCount: number
    }>()

    for (const result of this.results) {
      let stats = userStatsMap.get(result.userId)
      if (!stats) {
        stats = { totalRequests: 0, totalTime: 0, errorCount: 0 }
        userStatsMap.set(result.userId, stats)
      }

      stats.totalRequests++
      stats.totalTime += result.responseTimeMs
      if (!result.success) stats.errorCount++
    }

    const perUserStats = Array.from(userStatsMap.entries()).map(([userId, stats]) => ({
      userId,
      totalRequests: stats.totalRequests,
      avgResponseTimeMs: Math.round(stats.totalTime / stats.totalRequests * 100) / 100,
      errorCount: stats.errorCount
    }))

    // 系统资源快照
    try {
      var orchestrator = getContainerOrchestrator()
      var mapper = getUserContainerMapper()
      var schedulingPolicy = getSchedulingPolicy()
      var poolStats = orchestrator.getPoolStatus()
      var mappingStats = mapper.getStats()
      var queueStatus = schedulingPolicy.getQueueStatus()
    } catch (e) {
      var poolStats = { totalContainers: 0, idleContainers: 0, activeUsers: 0, poolUtilization: 0 }
      var mappingStats = { activeUsers: 0 }
      var queueStatus = { length: 0 }
    }

    // 评级
    const grade = this.calculateGrade(avgResponseTime, p95, failedResults.length / this.results.length)

    // 生成建议
    const recommendations = this.generateRecommendations(
      avgResponseTime,
      p99,
      failedResults.length / this.results.length,
      throughputRps
    )

    return {
      config: {
        totalUsers: config.concurrentUsers,
        totalRequests: this.results.length,
        durationMs: Math.round(totalDurationMs),
        startedAt: new Date(this.startTime),
        completedAt: new Date(this.endTime)
      },
      summary: {
        totalRequests: this.results.length,
        successfulRequests: successfulResults.length,
        failedRequests: failedResults.length,
        errorRate: Math.round(failedResults.length / this.results.length * 10000) / 100,
        throughputRps: Math.round(throughputRps * 100) / 100
      },
      responseTime: {
        avgMs: Math.round(avgResponseTime * 100) / 100,
        minMs: minResponseTime,
        maxMs: maxResponseTime,
        p50Ms: Math.round(p50 * 100) / 100,
        p90Ms: Math.round(p90 * 100) / 100,
        p95Ms: Math.round(p95 * 100) / 100,
        p99Ms: Math.round(p99 * 100) / 100,
        stdDevMs: Math.round(stdDev * 100) / 100
      },
      perUserStats,
      systemResources: {
        memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        cpuUsagePercent: 0,  // Node.js中难以精确获取
        activeContainers: mappingStats.activeUsers || poolStats.activeUsers,
        queueLength: queueStatus.length
      },
      details: config.verbose ? this.results : undefined,
      grade,
      recommendations
    }
  }

  /**
   * 打印报告到控制台
   */
  private printReport(report: BenchmarkResult): void {
    console.log('\n╔════════════════════════════════════════════╗')
    console.log('║       📊 PERFORMANCE BENCHMARK REPORT         ║')
    console.log('╠════════════════════════════════════════════╣')
    console.log(`║  Grade: ${report.grade.padEnd(42)}║`)
    console.log('╠════════════════════════════════════════════╣')
    console.log(`║  Total Requests:     ${String(report.summary.totalRequests).padStart(6)}${''.padEnd(24)}║`)
    console.log(`║  Successful:         ${String(report.summary.successfulRequests).padStart(6)}${''.padEnd(24)}║`)
    console.log(`║  Failed:             ${String(report.summary.failedRequests).padStart(6)}${''.padEnd(24)}║`)
    console.log(`║  Error Rate:          ${(report.summary.errorRate + '%').padStart(7)}${''.padEnd(23)}║`)
    console.log(`║  Throughput:          ${(report.summary.throughputRps + ' req/s').padStart(11)}${''.padEnd(20)}║`)
    console.log('╠════════════════════════════════════════════╣')
    console.log('║  Response Times (ms):                        ║')
    console.log(`║    Average:           ${String(report.responseTime.avgMs).padStart(8)}${''.padEnd(26)}║`)
    console.log(`║    P50 (Median):       ${String(report.responseTime.p50Ms).padStart(8)}${''.padEnd(26)}║`)
    console.log(`║    P90:                ${String(report.responseTime.p90Ms).padStart(8)}${''.padEnd(26)}║`)
    console.log(`║    P95:                ${String(report.responseTime.p95Ms).padStart(8)}${''.padEnd(26)}║`)
    console.log(`║    P99:                ${String(report.responseTime.p99Ms).padStart(8)}${''.padEnd(26)}║`)
    console.log('╠════════════════════════════════════════════╣')
    console.log('║  System Resources:                             ║')
    console.log(`║    Memory Usage:      ${String(report.systemResources.memoryUsageMB + ' MB').padStart(10)}${''.padEnd(25)}║`)
    console.log(`║    Active Containers: ${String(report.systemResources.activeContainers).padStart(8)}${''.padEnd(27)}║`)
    console.log(`║    Queue Length:      ${String(report.systemResources.queueLength).padStart(9)}${''.padEnd(26)}║`)
    console.log('╚════════════════════════════════════════════╝\n')

    if (report.recommendations.length > 0) {
      console.log('💡 Recommendations:')
      for (const rec of report.recommendations) {
        console.log(`   • ${rec}`)
      }
      console.log('')
    }
  }

  /**
   * 计算百分位数
   */
  private percentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0

    const index = (percentile / 100) * (sortedArray.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    const weight = index - lower

    if (upper >= sortedArray.length) {
      return sortedArray[sortedArray.length - 1]
    }

    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight
  }

  /**
   * 计算标准差
   */
  private calculateStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0

    const squaredDifferences = values.map(v => Math.pow(v - mean, 2))
    const variance = squaredDifferences.reduce((sum, d) => sum + d, 0) / values.length

    return Math.sqrt(variance)
  }

  /**
   * 计算评级
   */
  private calculateGrade(
    avgResponseTime: number,
    p95ResponseTime: number,
    errorRate: number
  ): BenchmarkResult['grade'] {
    // 综合评分（满分100）
    let score = 100

    // 响应时间扣分（目标：<200ms平均，<500ms P95）
    if (avgResponseTime > 500) score -= 30
    else if (avgResponseTime > 300) score -= 20
    else if (avgResponseTime > 200) score -= 10

    if (p95ResponseTime > 1000) score -= 20
    else if (p95ResponseTime > 800) score -= 15
    else if (p95ResponseTime > 500) score -= 10

    // 错误率扣分
    if (errorRate > 5) score -= 30
    else if (errorRate > 1) score -= 15
    else if (errorRate > 0.5) score -= 5

    // 转换为评级
    if (score >= 95) return 'A+'
    if (score >= 85) return 'A'
    if (score >= 70) return 'B'
    if (score >= 55) return 'C'
    if (score >= 40) return 'D'
    return 'F'
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(
    avgResponseTime: number,
    p99ResponseTime: number,
    errorRate: number,
    throughput: number
  ): string[] {
    const recommendations: string[] = []

    if (avgResponseTime > 300) {
      recommendations.push('响应时间偏高，建议优化数据库查询或增加缓存层')
    }

    if (p99ResponseTime > 1000) {
      recommendations.push('存在慢请求尾端（P99>1s），建议排查长尾请求原因')
    }

    if (errorRate > 1) {
      recommendations.push('错误率超过1%，建议检查熔断器状态和后端服务健康度')
    }

    if (throughput < 50) {
      recommendations.push('吞吐量较低，考虑增加Worker容器池大小或优化调度算法')
    }

    if (recommendations.length === 0) {
      recommendations.push('性能表现优秀，无需特别优化')
    }

    return recommendations
  }
}

// ==================== 导出 ====================

/**
 * 运行快速基准测试（使用默认配置）
 */
export async function runQuickBenchmark(targetUrl: string = 'http://localhost:3000/api/health'): Promise<BenchmarkResult> {
  const benchmark = new PerformanceBenchmark()

  return benchmark.runBenchmark({
    concurrentUsers: 10,
    requestsPerUser: 20,
    requestIntervalMs: 100,
    warmupRequests: 5,
    targetUrl,
    method: 'GET',
    verbose: false
  })
}

/**
 * 运行压力测试（高并发）
 */
export async function runStressTest(targetUrl: string = 'http://localhost:3000/api/health'): Promise<BenchmarkResult> {
  const benchmark = new PerformanceBenchmark()

  return benchmark.runBenchmark({
    concurrentUsers: 50,
    requestsPerUser: 50,
    requestIntervalMs: 50,
    warmupRequests: 10,
    targetUrl,
    method: 'GET',
    verbose: false
  })
}

export default PerformanceBenchmark
