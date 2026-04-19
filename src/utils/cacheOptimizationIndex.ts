import { SmartCacheManager } from './cacheOptimizer.js'
import { getEnhancedToolSchemaCache } from './enhancedToolSchemaCache.js'
import {
  cacheMonitor,
  recordCacheHit,
  recordCacheMiss,
  recordCacheEviction,
} from './cacheMonitor.js'
import { adaptiveCacheManager, recordCacheSample } from './adaptiveCacheSize.ts'
import { logForDebugging } from './debug.js'
import type { CacheStatistics } from './cacheOptimizer.js'

/**
 * 缓存优化器统一接口
 * 整合所有缓存优化功能，提供一站式管理
 */
export class CacheOptimizer {
  private toolSchemaCache: ReturnType<typeof getEnhancedToolSchemaCache>
  private isInitialized: boolean

  constructor() {
    this.toolSchemaCache = getEnhancedToolSchemaCache()
    this.isInitialized = false
  }

  /**
   * 初始化缓存优化系统
   */
  initialize(): void {
    if (this.isInitialized) return

    cacheMonitor.registerCache('tool_schema')
    cacheMonitor.registerCache('memoize_lru')
    cacheMonitor.registerCache('file_read')
    cacheMonitor.registerCache('shell_prefix')

    this.isInitialized = true

    logForDebugging(
      '[CACHE OPTIMIZER] Initialized with monitoring, adaptive sizing, and smart management',
    )
  }

  /**
   * 获取全局缓存健康报告
   */
  getHealthReport(): {
    overallStatus: 'healthy' | 'warning' | 'critical'
    toolSchemaStats: ReturnType<
      (typeof this.toolSchemaCache)['getUsageReport']
    >
    globalSummary: ReturnType<(typeof cacheMonitor)['getGlobalSummary']>
    adaptiveStats: ReturnType<
      (typeof adaptiveCacheManager)['getAdjustmentStats']
    >
    recommendations: string[]
  } {
    if (!this.isInitialized) {
      this.initialize()
    }

    const toolSchemaStats = this.toolSchemaCache.getUsageReport()
    const globalSummary = cacheMonitor.getGlobalSummary()
    const adaptiveStats = adaptiveCacheManager.getAdjustmentStats()

    const recommendations: string[] = []
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy'

    if (globalSummary.globalHitRate < 0.7) {
      overallStatus = 'warning'
      recommendations.push(
        '全局缓存命中率偏低，建议检查缓存配置或增加缓存大小',
      )
    }

    if (toolSchemaStats.statistics.hitRate < 0.75) {
      overallStatus = overallStatus === 'critical' ? 'critical' : 'warning'
      recommendations.push(
        '工具 Schema 缓存命中率不足，建议启用预热或调整失效策略',
      )
    }

    if (
      adaptiveStats.totalAdjustments > 10 &&
      adaptiveStats.sizeVariance > 10000
    ) {
      overallStatus = overallStatus === 'critical' ? 'critical' : 'warning'
      recommendations.push(
        '缓存大小频繁波动，建议固定大小或调整自适应参数',
      )
    }

    if (globalSummary.globalHitRate < 0.5) {
      overallStatus = 'critical'
      recommendations.unshift(
        '🚨 缓存性能严重不足，需要立即关注！',
      )
    }

    return {
      overallStatus,
      toolSchemaStats,
      globalSummary,
      adaptiveStats,
      recommendations,
    }
  }

  /**
   * 执行完整的缓存优化流程
   */
  async optimize(): Promise<{
    actionsTaken: string[]
    improvements: Record<string, number>
  }> {
    if (!this.isInitialized) {
      this.initialize()
    }

    const actionsTaken: string[] = []
    const improvements: Record<string, number> = {}

    try {
      const healthReport = this.getHealthReport()

      if (healthReport.overallStatus !== 'healthy') {
        actions.push(
          `检测到 ${healthReport.overallStatus} 状态，开始执行优化...`,
        )

        if (healthReport.toolSchemaStats.statistics.hitRate < 0.8) {
          this.toolSchemaCache.cleanExpiredEntries(15 * 60 * 1000)
          actions.push('✓ 清理过期工具 Schema 条目')
          improvements['schema_cleanup'] = 1
        }
      }

      const sampleResult = recordCacheSample(healthReport.toolSchemaStats.statistics)
      if (sampleResult.adjusted) {
        actions.push(
          `✓ 自适应调整缓存大小: ${sampleResult.newSize}`,
        )
        improvements['size_adjusted'] = sampleResult.newSize ?? 0
      }

      logForDebugging(
        `[CACHE OPTIMIZER] Optimization complete: ${actionsTaken.length} actions taken`,
      )

      return { actionsTaken, improvements }
    } catch (error) {
      logForDebugging(`[CACHE OPTIMIZER] Optimization error: ${error}`)
      throw error
    }
  }

  /**
   * 导出完整的状态报告（用于调试）
   */
  exportFullState(): {
    timestamp: number
    toolSchemaCache: ReturnType<
      (typeof this.toolSchemaCache)['exportState']
    >
    monitorReport: ReturnType<(typeof cacheMonitor)['exportFullReport']>
    adaptiveState: ReturnType<
      (typeof adaptiveCacheManager)['exportState']
    >
  } {
    return {
      timestamp: Date.now(),
      toolSchemaCache: this.toolSchemaCache.exportState(),
      monitorReport: cacheMonitor.exportFullReport(),
      adaptiveState: adaptiveCacheManager.exportState(),
    }
  }
}

/**
 * 全局缓存优化器实例
 */
export const cacheOptimizer = new CacheOptimizer()

/**
 * 初始化缓存优化系统（应用启动时调用）
 */
export function initializeCacheOptimization(): void {
  cacheOptimizer.initialize()
}

/**
 * 获取缓存健康报告
 */
export function getCacheHealthReport(): ReturnType<
  CacheOptimizer['getHealthReport']
> {
  return cacheOptimizer.getHealthReport()
}

/**
 * 执行缓存优化
 */
export async function runCacheOptimization(): Promise<
  ReturnType<CacheOptimizer['optimize']>
> {
  return cacheOptimizer.optimize()
}
