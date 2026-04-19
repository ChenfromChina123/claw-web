import { logForDebugging } from './debug.js'
import { logError } from './log.js'

/**
 * 缓存性能统计接口
 */
export interface CacheStatistics {
  totalHits: number
  totalMisses: number
  hitRate: number
  avgAccessTimeMs: number
  lastAccessTime: number | null
  size: number
  maxSize: number
  evictionCount: number
}

/**
 * 缓存配置接口
 */
export interface CacheConfig {
  maxSize: number
  enablePreheat: boolean
  preheatThreshold: number // 当命中率低于此值时触发预热
  statsCollectionInterval: number // 统计收集间隔（毫秒）
}

/**
 * 默认缓存配置
 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: 200,
  enablePreheat: true,
  preheatThreshold: 0.7, // 70% 命中率阈值
  statsCollectionInterval: 60000, // 1 分钟
}

/**
 * 智能缓存管理器
 * 提供缓存统计、自适应大小管理、预热等功能
 */
export class SmartCacheManager<T> {
  private cache: Map<string, T>
  private accessTimes: Map<string, number>
  private stats: CacheStatistics
  private config: CacheConfig
  private accessTimeHistory: number[]
  private preheatQueue: Set<string>
  private isPreheating: boolean

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config }
    this.cache = new Map()
    this.accessTimes = new Map()
    this.preheatQueue = new Set()
    this.isPreheating = false
    this.accessTimeHistory = []
    this.stats = this.initializeStats()

    if (this.config.enablePreheat) {
      this.startStatsCollection()
    }
  }

  /**
   * 初始化统计信息
   */
  private initializeStats(): CacheStatistics {
    return {
      totalHits: 0,
      totalMisses: 0,
      hitRate: 0,
      avgAccessTimeMs: 0,
      lastAccessTime: null,
      size: 0,
      maxSize: this.config.maxSize,
      evictionCount: 0,
    }
  }

  /**
   * 获取缓存值（带统计）
   */
  get(key: string): T | undefined {
    const startTime = performance.now()
    const value = this.cache.get(key)
    const accessTime = performance.now() - startTime

    this.recordAccess(accessTime)

    if (value !== undefined) {
      this.stats.totalHits++
      this.accessTimes.set(key, Date.now())
      return value
    }

    this.stats.totalMisses++
    this.maybeTriggerPreheat(key)
    return undefined
  }

  /**
   * 设置缓存值（带 LRU 驱逐）
   */
  set(key: string, value: T): void {
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU()
    }

    this.cache.set(key, value)
    this.accessTimes.set(key, Date.now())
    this.stats.size = this.cache.size
  }

  /**
   * 检查键是否存在
   */
  has(key: string): boolean {
    return this.cache.has(key)
  }

  /**
   * 删除缓存项
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key)
    this.accessTimes.delete(key)
    this.stats.size = this.cache.size
    return deleted
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear()
    this.accessTimes.clear()
    this.stats = this.initializeStats()
  }

  /**
   * 获取当前缓存大小
   */
  size(): number {
    return this.cache.size
  }

  /**
   * 获取缓存统计信息
   */
  getStatistics(): CacheStatistics {
    this.updateHitRate()
    return { ...this.stats }
  }

  /**
   * 记录访问时间
   */
  private recordAccess(accessTimeMs: number): void {
    this.stats.lastAccessTime = Date.now()
    this.accessTimeHistory.push(accessTimeMs)

    if (this.accessTimeHistory.length > 1000) {
      this.accessTimeHistory.shift()
    }

    this.stats.avgAccessTimeMs =
      this.accessTimeHistory.reduce((a, b) => a + b, 0) /
      this.accessTimeHistory.length
  }

  /**
   * 更新命中率
   */
  private updateHitRate(): void {
    const total = this.stats.totalHits + this.stats.totalMisses
    this.stats.hitRate = total > 0 ? this.stats.totalHits / total : 0
  }

  /**
   * LRU 驱逐策略
   */
  private evictLRU(): void {
    let lruKey: string | null = null
    let lruTime = Infinity

    for (const [key, time] of this.accessTimes.entries()) {
      if (time < lruTime) {
        lruTime = time
        lruKey = key
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey)
      this.accessTimes.delete(lruKey)
      this.stats.evictionCount++
      this.stats.size = this.cache.size

      logForDebugging(
        `[CACHE] LRU evicted key: ${lruKey}, eviction count: ${this.stats.evictionCount}`,
      )
    }
  }

  /**
   * 触发预热检查
   */
  private maybeTriggerPreheat(missedKey: string): void {
    if (!this.config.enablePreheat || this.isPreheating) return

    this.updateHitRate()
    if (this.stats.hitRate < this.config.preheatThreshold) {
      this.preheatQueue.add(missedKey)
      this.schedulePreheat()
    }
  }

  /**
   * 安排预热任务
   */
  private schedulePreheat(): void {
    if (this.isPreheating || this.preheatQueue.size === 0) return

    this.isPreheating = true

    setTimeout(() => {
      try {
        this.executePreheat()
      } catch (error) {
        logError(error)
      } finally {
        this.isPreheating = false
      }
    }, 100)
  }

  /**
   * 执行预热（子类可重写）
   */
  protected executePreheat(): void {
    const keysToPreheat = Array.from(this.preheatQueue)
    this.preheatQueue.clear()

    logForDebugging(
      `[CACHE] Preheating ${keysToPreheat.length} keys, current hit rate: ${(this.stats.hitRate * 100).toFixed(1)}%`,
    )
  }

  /**
   * 启动统计收集定时器
   */
  private startStatsCollection(): void {
    setInterval(() => {
      try {
        this.logPeriodicStats()
      } catch (error) {
        logError(error)
      }
    }, this.config.statsCollectionInterval)
  }

  /**
   * 定期输出统计日志
   */
  private logPeriodicStats(): void {
    this.updateHitRate()

    if (this.stats.totalHits + this.stats.totalMisses > 0) {
      logForDebugging(
        `[CACHE STATS] Hit rate: ${(this.stats.hitRate * 100).toFixed(1)}%, ` +
          `Hits: ${this.stats.totalHits}, Misses: ${this.stats.totalMisses}, ` +
          `Size: ${this.stats.size}/${this.stats.maxSize}, ` +
          `Evictions: ${this.stats.evictionCount}, ` +
          `Avg access time: ${this.stats.avgAccessTimeMs.toFixed(2)}ms`,
      )
    }
  }

  /**
   * 获取所有键（用于调试）
   */
  keys(): string[] {
    return Array.from(this.cache.keys())
  }

  /**
   * 导出缓存状态（用于调试和监控）
   */
  exportState(): {
    cache: Map<string, T>
    statistics: CacheStatistics
    config: CacheConfig
  } {
    return {
      cache: new Map(this.cache),
      statistics: this.getStatistics(),
      config: { ...this.config },
    }
  }
}
