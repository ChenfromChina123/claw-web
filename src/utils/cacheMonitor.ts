import { logForDebugging } from './debug.js'
import type { CacheStatistics } from './cacheOptimizer.js'

/**
 * 缓存事件类型
 */
export enum CacheEventType {
  HIT = 'hit',
  MISS = 'miss',
  EVICTION = 'eviction',
  PREHEAT = 'preheat',
  CLEAR = 'clear',
  SIZE_CHANGE = 'size_change',
}

/**
 * 缓存事件数据
 */
export interface CacheEvent {
  type: CacheEventType
  cacheName: string
  timestamp: number
  key?: string
  dataSize?: number
  hitRate?: number
  metadata?: Record<string, unknown>
}

/**
 * 缓存监控监听器类型
 */
type CacheMonitorListener = (event: CacheEvent) => void

/**
 * 全局缓存监控器
 * 提供实时的缓存性能监控和告警功能
 */
class GlobalCacheMonitor {
  private listeners: Set<CacheMonitorListener>
  private eventHistory: CacheEvent[]
  private maxHistorySize: number
  private cacheRegistry: Map<string, CacheStatistics>
  private alertThresholds: {
    lowHitRate: number
    highEvictionRate: number
    largeSizeWarning: number
  }
  private isMonitoring: boolean

  constructor() {
    this.listeners = new Set()
    this.eventHistory = []
    this.maxHistorySize = 10000
    this.cacheRegistry = new Map()
    this.alertThresholds = {
      lowHitRate: 0.5,
      highEvictionRate: 10,
      largeSizeWarning: 0.8,
    }
    this.isMonitoring = false

    this.startMonitoring()
  }

  /**
   * 启动监控
   */
  private startMonitoring(): void {
    if (this.isMonitoring) return
    this.isMonitoring = true

    setInterval(() => {
      try {
        this.checkAlerts()
        this.cleanupOldEvents()
      } catch (error) {
        console.error('[CACHE MONITOR] Monitoring error:', error)
      }
    }, 30000)
  }

  /**
   * 注册缓存实例
   */
  registerCache(cacheName: string): void {
    if (!this.cacheRegistry.has(cacheName)) {
      this.cacheRegistry.set(cacheName, {
        totalHits: 0,
        totalMisses: 0,
        hitRate: 0,
        avgAccessTimeMs: 0,
        lastAccessTime: null,
        size: 0,
        maxSize: 0,
        evictionCount: 0,
      })

      logForDebugging(`[CACHE MONITOR] Registered cache: ${cacheName}`)
    }
  }

  /**
   * 更新缓存统计信息
   */
  updateCacheStats(cacheName: string, stats: CacheStatistics): void {
    this.cacheRegistry.set(cacheName, stats)
  }

  /**
   * 记录缓存事件
   */
  recordEvent(event: CacheEvent): void {
    this.eventHistory.push(event)

    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift()
    }

    this.notifyListeners(event)
  }

  /**
   * 添加事件监听器
   */
  addListener(listener: CacheMonitorListener): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(event: CacheEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[CACHE MONITOR] Listener error:', error)
      }
    }
  }

  /**
   * 检查并触发告警
   */
  private checkAlerts(): void {
    for (const [cacheName, stats] of this.cacheRegistry.entries()) {
      this.checkLowHitRateAlert(cacheName, stats)
      this.checkHighEvictionAlert(cacheName, stats)
      this.checkSizeWarning(cacheName, stats)
    }
  }

  /**
   * 检查低命中率告警
   */
  private checkLowHitRateAlert(
    cacheName: string,
    stats: CacheStatistics,
  ): void {
    const totalOps = stats.totalHits + stats.totalMisses
    if (
      totalOps > 100 &&
      stats.hitRate < this.alertThresholds.lowHitRate
    ) {
      this.recordEvent({
        type: CacheEventType.MISS,
        cacheName,
        timestamp: Date.now(),
        metadata: {
          alertType: 'low_hit_rate',
          currentHitRate: stats.hitRate,
          threshold: this.alertThresholds.lowHitRate,
          message:
            `Cache ${cacheName} has low hit rate: ${(stats.hitRate * 100).toFixed(1)}%`,
        },
      })

      logForDebugging(
        `[CACHE MONITOR] ⚠️ Low hit rate alert: ${cacheName} at ${(stats.hitRate * 100).toFixed(1)}%`,
      )
    }
  }

  /**
   * 检查高驱逐率告警
   */
  private checkHighEvictionAlert(
    cacheName: string,
    stats: CacheStatistics,
  ): void {
    const timeSinceStart =
      stats.lastAccessTime
        ? Date.now() - (stats.lastAccessTime - 60000)
        : 60000
    const evictionRate =
      (stats.evictionCount / Math.max(timeSinceStart / 1000, 1)) * 1000

    if (
      evictionRate > this.alertThresholds.highEvictionRate &&
      stats.evictionCount > 50
    ) {
      this.recordEvent({
        type: CacheEventType.EVICTION,
        cacheName,
        timestamp: Date.now(),
        metadata: {
          alertType: 'high_eviction_rate',
          evictionRate: evictionRate.toFixed(2),
          threshold: this.alertThresholds.highEvictionRate,
          message:
            `Cache ${cacheName} has high eviction rate: ${evictionRate.toFixed(2)}/sec`,
        },
      })

      logForDebugging(
        `[CACHE MONITOR] ⚠️ High eviction rate alert: ${cacheName} at ${evictionRate.toFixed(2)}/sec`,
      )
    }
  }

  /**
   * 检查容量警告
   */
  private checkSizeWarning(
    cacheName: string,
    stats: CacheStatistics,
  ): void {
    if (stats.maxSize > 0) {
      const usageRatio = stats.size / stats.maxSize

      if (usageRatio > this.alertThresholds.largeSizeWarning) {
        this.recordEvent({
          type: CacheEventType.SIZE_CHANGE,
          cacheName,
          timestamp: Date.now(),
          metadata: {
            alertType: 'size_warning',
            usageRatio: usageRatio.toFixed(2),
            message:
              `Cache ${cacheName} is ${(usageRatio * 100).toFixed(1)}% full`,
          },
        })
      }
    }
  }

  /**
   * 清理过期事件
   */
  private cleanupOldEvents(): void {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    while (
      this.eventHistory.length > 0 &&
      this.eventHistory[0].timestamp < oneHourAgo
    ) {
      this.eventHistory.shift()
    }
  }

  /**
   * 获取所有缓存的统计摘要
   */
  getGlobalSummary(): {
    totalCaches: number
    totalHits: number
    totalMisses: number
    globalHitRate: number
    totalEvictions: number
    cacheDetails: Array<{
      name: string
      statistics: CacheStatistics
    }>
  } {
    let totalHits = 0
    let totalMisses = 0
    let totalEvictions = 0
    const cacheDetails: Array<{
      name: string
      statistics: CacheStatistics
    }> = []

    for (const [name, stats] of this.cacheRegistry.entries()) {
      totalHits += stats.totalHits
      totalMisses += stats.totalMisses
      totalEvictions += stats.evictionCount
      cacheDetails.push({ name, statistics: stats })
    }

    const totalOps = totalHits + totalMisses

    return {
      totalCaches: this.cacheRegistry.size,
      totalHits,
      totalMisses,
      globalHitRate: totalOps > 0 ? totalHits / totalOps : 0,
      totalEvictions,
      cacheDetails,
    }
  }

  /**
   * 获取最近的事件历史
   */
  getRecentEvents(
    limit: number = 100,
    filterType?: CacheEventType,
  ): CacheEvent[] {
    let events = [...this.eventHistory]

    if (filterType) {
      events = events.filter(e => e.type === filterType)
    }

    return events.slice(-limit)
  }

  /**
   * 导出完整报告（用于调试）
   */
  exportFullReport(): {
    summary: ReturnType<GlobalCacheMonitor['getGlobalSummary']>
    recentEvents: CacheEvent[]
    thresholds: typeof GlobalCacheMonitor.prototype.alertThresholds
    uptime: number
  } {
    const self = this
    return {
      summary: self.getGlobalSummary(),
      recentEvents: self.getRecentEvents(500),
      thresholds: { ...self.alertThresholds },
      uptime: process.uptime(),
    }
  }
}

/**
 * 全局缓存监控器实例
 */
export const cacheMonitor = new GlobalCacheMonitor()

/**
 * 便捷方法：记录缓存命中
 */
export function recordCacheHit(
  cacheName: string,
  key?: string,
): void {
  cacheMonitor.recordEvent({
    type: CacheEventType.HIT,
    cacheName,
    timestamp: Date.now(),
    key,
  })
}

/**
 * 便捷方法：记录缓存未命中
 */
export function recordCacheMiss(
  cacheName: string,
  key?: string,
): void {
  cacheMonitor.recordEvent({
    type: CacheEventType.MISS,
    cacheName,
    timestamp: Date.now(),
    key,
  })
}

/**
 * 便捷方法：记录缓存驱逐
 */
export function recordCacheEviction(
  cacheName: string,
  key: string,
): void {
  cacheMonitor.recordEvent({
    type: CacheEventType.EVICTION,
    cacheName,
    timestamp: Date.now(),
    key,
  })
}
