import { logForDebugging } from './debug.js'
import { logError } from './log.js'
import type { CacheStatistics } from './cacheOptimizer.js'

/**
 * 缓存性能等级
 */
enum CachePerformanceLevel {
  EXCELLENT = 'excellent',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  CRITICAL = 'critical',
}

/**
 * 自适应配置
 */
interface AdaptiveConfig {
  minSize: number
  maxSize: number
  initialSize: number
  growthFactor: number
  shrinkFactor: number
  sampleWindow: number // 采样窗口（请求数）
  adjustmentThreshold: number // 调整阈值（命中率变化百分比）
}

/**
 * 默认自适应配置
 */
const DEFAULT_ADAPTIVE_CONFIG: AdaptiveConfig = {
  minSize: 50,
  maxSize: 500,
  initialSize: 200,
  growthFactor: 1.5,
  shrinkFactor: 0.75,
  sampleWindow: 100,
  adjustmentThreshold: 0.05,
}

/**
 * 缓存大小历史记录
 */
interface SizeHistoryEntry {
  timestamp: number
  size: number
  hitRate: number
  reason: string
}

/**
 * 智能缓存大小自适应管理器
 * 根据实际使用情况动态调整缓存大小
 */
export class AdaptiveCacheSizeManager {
  private config: AdaptiveConfig
  private currentSize: number
  private sizeHistory: SizeHistoryEntry[]
  private hitRateHistory: number[]
  private lastAdjustmentTime: number
  private adjustmentCount: number
  private totalGrowths: number
  private totalShrinks: number

  constructor(config: Partial<AdaptiveConfig> = {}) {
    this.config = { ...DEFAULT_ADAPTIVE_CONFIG, ...config }
    this.currentSize = this.config.initialSize
    this.sizeHistory = []
    this.hitRateHistory = []
    this.lastAdjustmentTime = Date.now()
    this.adjustmentCount = 0
    this.totalGrowths = 0
    this.totalShrinks = 0

    logForDebugging(
      `[ADAPTIVE CACHE] Initialized with size ${this.currentSize}, range [${this.config.minSize}, ${this.config.maxSize}]`,
    )
  }

  /**
   * 获取当前推荐的缓存大小
   */
  getCurrentSize(): number {
    return this.currentSize
  }

  /**
   * 记录采样数据并评估是否需要调整
   */
  recordSample(stats: CacheStatistics): {
    adjusted: boolean
    newSize: number | null
    reason: string | null
  } {
    this.hitRateHistory.push(stats.hitRate)

    if (this.hitRateHistory.length > this.config.sampleWindow) {
      this.hitRateHistory.shift()
    }

    if (this.hitRateHistory.length < this.config.sampleWindow) {
      return { adjusted: false, newSize: null, reason: null }
    }

    const adjustment = this.evaluateAndAdjust(stats)

    if (adjustment.adjusted) {
      this.recordAdjustment(adjustment.newSize!, adjustment.reason!)
    }

    return adjustment
  }

  /**
   * 评估并决定是否调整大小
   */
  private evaluateAndAdjust(
    stats: CacheStatistics,
  ): { adjusted: boolean; newSize: number | null; reason: string | null } {
    if (Date.now() - this.lastAdjustmentTime < 60000) {
      return { adjusted: false, newSize: null, reason: null }
    }

    const avgHitRate =
      this.hitRateHistory.reduce((a, b) => a + b, 0) /
      this.hitRateHistory.length
    const recentHitRate =
      this.hitRateHistory.slice(-20).reduce((a, b) => a + b, 0) /
      Math.min(20, this.hitRateHistory.length)
    const hitRateChange = recentHitRate - avgHitRate

    const performanceLevel = this.evaluatePerformanceLevel(avgHitRate)
    const utilization = stats.size / stats.maxSize

    let newSize: number | null = null
    let reason: string | null = null

    switch (performanceLevel) {
      case CachePerformanceLevel.EXCELLENT:
        if (utilization > 0.9 && this.currentSize < this.config.maxSize) {
          newSize = Math.min(
            Math.floor(this.currentSize * this.config.growthFactor),
            this.config.maxSize,
          )
          reason = `Excellent performance (${(avgHitRate * 100).toFixed(1)}% hit rate), high utilization (${(utilization * 100).toFixed(1)}%), growing cache`
        }
        break

      case CachePerformanceLevel.GOOD:
        if (hitRateChange < -this.config.adjustmentThreshold && utilization > 0.7) {
          newSize = Math.min(
            Math.floor(this.currentSize * this.config.growthFactor),
            this.config.maxSize,
          )
          reason = `Good but declining hit rate (${(recentHitRate * 100).toFixed(1)}%), increasing cache to stabilize`
        }
        break

      case CachePerformanceLevel.FAIR:
        if (utilization < 0.5 && this.currentSize > this.config.minSize) {
          newSize = Math.max(
            Math.floor(this.currentSize * this.config.shrinkFactor),
            this.config.minSize,
          )
          reason = `Fair performance (${(avgHitRate * 100).toFixed(1)}% hit rate), low utilization (${(utilization * 100).toFixed(1)}%), shrinking cache`
        } else if (utilization > 0.85 && this.currentSize < this.config.maxSize) {
          newSize = Math.min(
            Math.floor(this.currentSize * this.config.growthFactor),
            this.config.maxSize,
          )
          reason = `Fair performance with high utilization, growing cache`
        }
        break

      case CachePerformanceLevel.POOR:
        if (this.currentSize < this.config.maxSize) {
          newSize = Math.min(
            Math.floor(this.currentSize * this.config.growthFactor * 1.2),
            this.config.maxSize,
          )
          reason = `Poor performance (${(avgHitRate * 100).toFixed(1)}% hit rate), aggressively growing cache`
        }
        break

      case CachePerformanceLevel.CRITICAL:
        if (this.currentSize < this.config.maxSize) {
          newSize = Math.min(
            Math.floor(this.currentSize * this.config.growthFactor * 1.5),
            this.config.maxSize,
          )
          reason = `Critical performance (${(avgHitRate * 100).toFixed(1)}% hit rate), emergency cache growth`
        }
        break
    }

    if (newSize !== null && newSize !== this.currentSize) {
      return { adjusted: true, newSize, reason }
    }

    return { adjusted: false, newSize: null, reason: null }
  }

  /**
   * 评估性能等级
   */
  private evaluatePerformanceLevel(hitRate: number): CachePerformanceLevel {
    if (hitRate >= 0.95) return CachePerformanceLevel.EXCELLENT
    if (hitRate >= 0.85) return CachePerformanceLevel.GOOD
    if (hitRate >= 0.7) return CachePerformanceLevel.FAIR
    if (hitRate >= 0.5) return CachePerformanceLevel.POOR
    return CachePerformanceLevel.CRITICAL
  }

  /**
   * 记录调整历史
   */
  private recordAdjustment(newSize: number, reason: string): void {
    const oldSize = this.currentSize
    this.currentSize = newSize
    this.lastAdjustmentTime = Date.now()
    this.adjustmentCount++

    if (newSize > oldSize) {
      this.totalGrowths++
    } else {
      this.totalShrinks++
    }

    this.sizeHistory.push({
      timestamp: Date.now(),
      size: newSize,
      hitRate:
        this.hitRateHistory.length > 0
          ? this.hitRateHistory[this.hitRateHistory.length - 1]
          : 0,
      reason,
    })

    if (this.sizeHistory.length > 1000) {
      this.sizeHistory.shift()
    }

    logForDebugging(
      `[ADAPTIVE CACHE] Size adjusted: ${oldSize} -> ${newSize} (${newSize > oldSize ? '+' : ''}${newSize - oldSize}), reason: ${reason}`,
    )
  }

  /**
   * 重置为初始大小
   */
  reset(): void {
    this.currentSize = this.config.initialSize
    this.sizeHistory = []
    this.hitRateHistory = []
    this.lastAdjustmentTime = Date.now()
    this.adjustmentCount = 0
    this.totalGrowths = 0
    this.totalShrinks = 0

    logForDebugging('[ADAPTIVE CACHE] Reset to initial configuration')
  }

  /**
   * 调整配置参数
   */
  updateConfig(newConfig: Partial<AdaptiveConfig>): void {
    this.config = { ...this.config, ...newConfig }

    logForDebugging('[ADAPTIVE CACHE] Configuration updated')
  }

  /**
   * 获取调整统计信息
   */
  getAdjustmentStats(): {
    currentSize: number
    totalAdjustments: number
    totalGrowths: number
    totalShrinks: number
    avgSize: number
    sizeVariance: number
    recentHistory: SizeHistoryEntry[]
  } {
    if (this.sizeHistory.length === 0) {
      return {
        currentSize: this.currentSize,
        totalAdjustments: this.adjustmentCount,
        totalGrowths: this.totalGrowths,
        totalShrinks: this.totalShrinks,
        avgSize: this.currentSize,
        sizeVariance: 0,
        recentHistory: [],
      }
    }

    const sizes = this.sizeHistory.map(h => h.size)
    const avgSize =
      sizes.reduce((a, b) => a + b, 0) / sizes.length
    const variance =
      sizes.reduce((sum, size) => sum + Math.pow(size - avgSize, 2), 0) /
      sizes.length

    return {
      currentSize: this.currentSize,
      totalAdjustments: this.adjustmentCount,
      totalGrowths: this.totalGrowths,
      totalShrinks: this.totalShrinks,
      avgSize: Math.round(avgSize),
      sizeVariance: Math.round(variance),
      recentHistory: this.sizeHistory.slice(-10),
    }
  }

  /**
   * 导出完整状态（用于调试）
   */
  exportState(): {
    config: AdaptiveConfig
    currentSize: number
    stats: ReturnType<AdaptiveCacheSizeManager['getAdjustmentStats']>
    history: SizeHistoryEntry[]
  } {
    return {
      config: { ...this.config },
      currentSize: this.currentSize,
      stats: this.getAdjustmentStats(),
      history: [...this.sizeHistory],
    }
  }
}

/**
 * 全局自适应缓存大小管理器实例
 */
export const adaptiveCacheManager = new AdaptiveCacheSizeManager()

/**
 * 获取当前推荐的全局缓存大小
 */
export function getRecommendedCacheSize(): number {
  return adaptiveCacheManager.getCurrentSize()
}

/**
 * 记录采样数据并获取可能的调整建议
 */
export function recordCacheSample(
  stats: CacheStatistics,
): ReturnType<AdaptiveCacheSizeManager['recordSample']> {
  try {
    return adaptiveCacheManager.recordSample(stats)
  } catch (error) {
    logError(error)
    return { adjusted: false, newSize: null, reason: null }
  }
}
