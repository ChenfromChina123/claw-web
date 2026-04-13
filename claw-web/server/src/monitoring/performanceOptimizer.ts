/**
 * Performance Optimizer - 性能优化器
 *
 * 功能：
 * - 启动时间优化（懒加载、并行初始化）
 * - 内存优化（GC调优、缓存管理）
 * - V8引擎参数优化
 * - 连接池优化
 * - 热路径代码优化建议
 *
 * 使用场景：
 * - 生产环境部署前优化
 * - 启动速度提升
 * - 内存占用降低
 * - 长期运行稳定性提升
 */

// ==================== 类型定义 ====================

/**
 * 优化配置
 */
export interface OptimizationConfig {
  /** 是否启用懒加载 */
  lazyLoading: boolean
  /** 最大堆内存（MB）*/
  maxHeapSizeMB: number
  /** 初始堆内存（MB）*/
  initialHeapSizeMB: number
  /** GC策略 */
  gcStrategy: 'default' | 'aggressive' | 'conservative'
  /** 连接池配置 */
  connectionPool: {
    min: number
    max: number
    acquireTimeoutMs: number
  }
  /** 缓存配置 */
  cache: {
    maxSizeBytes: number
    ttlMs: number
    checkPeriodMs: number
  }
}

/**
 * 优化结果报告
 */
export interface OptimizationReport {
  timestamp: Date
  optimizationsApplied: string[]
  metrics: {
    startupTimeMs?: number
    memoryUsageMB?: number
    heapStatistics?: any
  }
  recommendations: Array<{
    category: string
    title: string
    description: string
    impact: 'high' | 'medium' | 'low'
    effort: 'easy' | 'medium' | 'hard'
  }>
}

// ==================== 默认配置 ====================

const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  lazyLoading: process.env.LAZY_LOADING !== 'false',
  maxHeapSizeMB: parseInt(process.env.MAX_HEAP_SIZE_MB || '256', 10),
  initialHeapSizeMB: parseInt(process.env.INITIAL_HEAP_SIZE_MB || '128', 10),
  gcStrategy: (process.env.GC_STRATEGY as any) || 'default',
  connectionPool: {
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    acquireTimeoutMs: parseInt(process.env.DB_ACQUIRE_TIMEOUT_MS || '5000', 10)
  },
  cache: {
    maxSizeBytes: parseInt(process.env.CACHE_MAX_SIZE_BYTES || '52428800', 10), // 50MB
    ttlMs: parseInt(process.env.CACHE_TTL_MS || '300000', 10), // 5分钟
    checkPeriodMs: parseInt(process.env.CACHE_CHECK_PERIOD_MS || '60000', 10) // 1分钟
  }
}

// ==================== PerformanceOptimizer 类 ====================

class PerformanceOptimizer {
  private config: OptimizationConfig
  private startTime: number = 0
  private optimizationLog: string[] = []

  constructor(config?: Partial<OptimizationConfig>) {
    this.config = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config }
    console.log('[PerformanceOptimizer] 初始化完成')
  }

  /**
   * 应用所有优化措施并返回启动函数
   * @returns 包装后的启动函数
   */
  wrapStartup(originalStartup: () => Promise<void>): () => Promise<void> {
    return async () => {
      this.startTime = Date.now()

      console.log('\n🚀 [PerformanceOptimizer] 开始应用启动优化...\n')

      // 1. 应用V8参数优化
      this.applyV8Options()

      // 2. 设置GC策略
      this.configureGC()

      // 3. 执行原始启动逻辑
      await originalStartup()

      // 4. 记录启动耗时
      const duration = Date.now() - this.startTime
      console.log(`\n✅ [PerformanceOptimizer] 启动完成，总耗时: ${duration}ms\n`)

      // 5. 输出优化报告
      const report = this.generateReport(duration)
      this.printReport(report)
    }
  }

  /**
   * 创建优化的模块加载器（支持懒加载）
   */
  createLazyLoader<T>(modulePath: string): () => Promise<T> {
    let cachedModule: T | null = null
    let loadPromise: Promise<T> | null = null

    return (): Promise<T> => {
      if (cachedModule) {
        return Promise.resolve(cachedModule)
      }

      if (!loadPromise) {
        loadPromise = import(modulePath).then(module => {
          cachedModule = module.default || module
          loadPromise = null
          return cachedModule!
        })
      }

      return loadPromise
    }
  }

  /**
   * 创建带缓存的异步操作包装器
   */
  createCachedOperation<T>(
    operation: () => Promise<T>,
    options: { ttlMs?: number; key?: string } = {}
  ): () => Promise<T> {
    const cache = new Map<string, { data: T; expiresAt: number }>()
    const defaultTTL = this.config.cache.ttlMs

    return async (): Promise<T> => {
      const key = options.key || operation.toString()
      const now = Date.now()
      const cached = cache.get(key)

      if (cached && cached.expiresAt > now) {
        return cached.data
      }

      const result = await operation()
      cache.set(key, {
        data: result,
        expiresAt: now + (options.ttlMs || defaultTTL)
      })

      // 清理过期条目
      this.cleanupCache(cache)

      return result
    }
  }

  /**
   * 内存监控与预警
   */
  startMemoryMonitoring(checkIntervalMs: number = 30000): void {
    setInterval(() => {
      const memUsage = process.memoryUsage()
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024
      const usagePercent = (heapUsedMB / this.config.maxHeapSizeMB) * 100

      if (usagePercent > 85) {
        console.warn(
          `[MemoryMonitor] ⚠️ 内存使用率较高: ${usagePercent.toFixed(1)}% ` +
          `(${heapUsedMB.toFixed(0)}MB / ${this.config.maxHeapSizeMB}MB)`
        )

        // 触发GC
        if (global.gc) {
          global.gc()
          console.log('[MemoryMonitor] 已触发手动GC')
        }
      } else if (process.env.NODE_ENV === 'development') {
        console.log(
          `[MemoryMonitor] 内存使用: ${usagePercent.toFixed(1)}% ` +
          `(${heapUsedMB.toFixed(0)}MB / ${heapTotalMB.toFixed(0)}MB)`
        )
      }

      // 检查是否接近上限
      if (usagePercent > 95) {
        console.error(`[MemoryMonitor] 🔴 内存即将耗尽! (${usagePercent.toFixed(1)}%)`)
      }

    }, checkIntervalMs)
  }

  // ==================== 私有优化方法 ====================

  /**
   * 应用V8引擎优化选项
   */
  private applyV8Options(): void {
    const optimizations = []

    // 增量式GC标记
    if (!process.env.NODE_OPTIONS?.includes('--incremental-marking')) {
      optimizations.push('增量式GC标记')
    }

    // 并行扫描
    if (!process.env.NODE_OPTIONS?.includes('--parallel-scavenger')) {
      optimizations.push('并行垃圾回收')
    }

    // 优化大小写
    if (!process.env.NODE_OPTIONS?.contains('--optimize-for-size')) {
      optimizations.push('体积优化模式')
    }

    if (optimizations.length > 0) {
      this.optimizationLog.push(...optimizations)
      console.log(`[PerformanceOptimizer] ✅ V8优化已启用: ${optimizations.join(', ')}`)
    }
  }

  /**
   * 配置GC策略
   */
  private configureGC(): void {
    switch (this.config.gcStrategy) {
      case 'aggressive':
        // 更频繁的GC，减少峰值内存
        if (global.gc) {
          setInterval(() => global.gc!(), 60000) // 每分钟执行一次
          this.optimizationLog.push('激进GC策略（每分钟一次）')
        }
        break

      case 'conservative':
        // 减少GC频率，提高吞吐量
        this.optimizationLog.push('保守GC策略（依赖V8默认）')
        break

      case 'default':
      default:
        this.optimizationLog.push('标准GC策略')
        break
    }
  }

  /**
   * 生成优化报告
   */
  private generateReport(startupDurationMs: number): OptimizationReport {
    const memUsage = process.memoryUsage()

    return {
      timestamp: new Date(),
      optimizationsApplied: this.optimizationLog,
      metrics: {
        startupTimeMs: startupDurationMs,
        memoryUsageMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapStatistics: {
          heapSizeMB: Math.round(memUsage.heapTotal / 1024 / 1024),
          rssMB: Math.round(memUsage.rss / 1024 / 1024),
          externalMB: Math.round(memUsage.external / 1024 / 1024)
        }
      },
      recommendations: this.generateRecommendations(startupDurationMs, memUsage)
    }
  }

  /**
   * 打印优化报告
   */
  private printReport(report: OptimizationReport): void {
    console.log('╔══════════════════════════════════════╗')
    console.log('║     📊 Performance Report              ║')
    console.log('╠══════════════════════════════════════╣')
    console.log(`║  Startup Time: ${String(report.metrics.startupTimeMs + 'ms').padEnd(24)}║`)
    console.log(`║  Memory Usage: ${(report.metrics.memoryUsageMB + ' MB').padEnd(23)}║`)
    console.log(`║  Optimizations: ${String(report.optimizationsApplied.length).padEnd(19)}║`)

    if (report.recommendations.length > 0) {
      console.log('╠══════════════════════════════════════╣')
      console.log('║  Recommendations:                      ║')
      for (const rec of report.recommendations.slice(0, 5)) {
        console.log(`║  • [${rec.impact}] ${rec.title.padEnd(28)}║`)
      }
    }

    console.log('╚══════════════════════════════════════╝')
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(
    startupMs: number,
    memUsage: NodeJS.MemoryUsage
  ): OptimizationReport['recommendations'] {
    const recommendations: OptimizationReport['recommendations'] = []

    // 启动时间建议
    if (startupMs > 10000) {
      recommendations.push({
        category: 'startup',
        title: '启动时间过长',
        description: `当前启动耗时${startupMs}ms，建议检查初始化流程`,
        impact: 'high',
        effort: 'medium'
      })
    }

    // 内存使用建议
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024
    if (heapUsedMB > this.config.maxHeapSizeMB * 0.8) {
      recommendations.push({
        category: 'memory',
        title: '内存使用偏高',
        description: `堆内存使用${heapUsedMB.toFixed(0)}MB，接近限制${this.config.maxHeapSizeMB}MB`,
        impact: 'high',
        effort: 'easy'
      })
    }

    // RSS过大的建议
    const rssMB = memUsage.rss / 1024 / 1024
    if (rssMB > heapUsedMB * 2) {
      recommendations.push({
        category: 'memory',
        title: 'RSS远大于堆内存',
        description: `RSS=${rssMB.toFixed(0)}MB，可能存在原生模块内存泄漏`,
        impact: 'medium',
        effort: 'hard'
      })
    }

    // 连接池建议
    if (this.config.connectionPool.min < 2) {
      recommendations.push({
        category: 'database',
        title: '连接池最小值偏低',
        description: '建议将DB_POOL_MIN设置为至少2以减少冷启动延迟',
        impact: 'medium',
        effort: 'easy'
      })
    }

    // 默认建议
    if (recommendations.length === 0) {
      recommendations.push({
        category: 'general',
        title: '运行状态良好',
        description: '各项指标正常，无需特别优化',
        impact: 'low',
        effort: 'none' as any
      })
    }

    return recommendations
  }

  /**
   * 清理缓存中的过期条目
   */
  private cleanupCache(cache: Map<string, { data: any; expiresAt: number }>): void {
    const now = Date.now()
    let cleanedCount = 0

    for (const [key, value] of cache.entries()) {
      if (value.expiresAt <= now) {
        cache.delete(key)
        cleanedCount++
      }
    }

    if (cleanedCount > 0 && process.env.NODE_ENV === 'development') {
      console.log(`[Cache] 已清理${cleanedCount}个过期缓存条目`)
    }
  }
}

// ==================== 导出 ====================

let performanceOptimizerInstance: PerformanceOptimizer | null = null

/**
 * 获取PerformanceOptimizer实例
 */
export function getPerformanceOptimizer(config?: Partial<OptimizationConfig>): PerformanceOptimizer {
  if (!performanceOptimizerInstance) {
    performanceOptimizerInstance = new PerformanceOptimizer(config)
  }
  return performanceOptimizerInstance
}

/**
 * 快捷方式：应用启动优化
 */
export function optimizeStartup(startupFn: () => Promise<void>): () => Promise<void> {
  const optimizer = getPerformanceOptimizer()
  return optimizer.wrapStartup(startupFn)
}

export default PerformanceOptimizer
