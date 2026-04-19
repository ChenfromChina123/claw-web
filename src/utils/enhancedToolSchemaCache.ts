import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { SmartCacheManager } from './cacheOptimizer.js'
import { logForDebugging } from './debug.js'

/**
 * 带缓存的工具 Schema 类型
 */
type CachedSchema = BetaTool & {
  strict?: boolean
  eager_input_streaming?: boolean
}

/**
 * 增强版工具 Schema 缓存管理器
 * 添加了统计、预热和智能失效功能
 */
class EnhancedToolSchemaCache extends SmartCacheManager<CachedSchema> {
  private versionMap: Map<string, number>
  private sessionStartTime: number

  constructor() {
    super({
      maxSize: 100,
      enablePreheat: true,
      preheatThreshold: 0.75,
      statsCollectionInterval: 120000,
    })

    this.versionMap = new Map()
    this.sessionStartTime = Date.now()

    logForDebugging(
      '[TOOL SCHEMA CACHE] Enhanced cache initialized with smart management',
    )
  }

  /**
   * 获取或设置工具 Schema（带版本控制）
   */
  getOrSet(
    toolId: string,
    schema: CachedSchema,
    version?: number,
  ): CachedSchema {
    const cached = this.get(toolId)

    if (cached) {
      const cachedVersion = this.versionMap.get(toolId) ?? 0
      const newVersion = version ?? 1

      if (cachedVersion >= newVersion) {
        return cached
      }

      logForDebugging(
        `[TOOL SCHEMA CACHE] Version mismatch for ${toolId}: ${cachedVersion} -> ${newVersion}, updating cache`,
      )
    }

    this.set(toolId, schema)
    if (version !== undefined) {
      this.versionMap.set(toolId, version)
    }

    return schema
  }

  /**
   * 批量预热常用工具 Schema
   */
  preheatCommonTools(tools: Array<{ id: string; schema: CachedSchema }>): void {
    const preheatStart = performance.now()

    for (const { id, schema } of tools) {
      if (!this.has(id)) {
        this.set(id, schema)
      }
    }

    const preheatTime = performance.now() - preheatStart

    logForDebugging(
      `[TOOL SCHEMA CACHE] Preheated ${tools.length} tools in ${preheatTime.toFixed(2)}ms`,
    )
  }

  /**
   * 清理过期条目（基于会话时间）
   */
  cleanExpiredEntries(maxAgeMs: number = 30 * 60 * 1000): void {
    const now = Date.now()
    let cleanedCount = 0

    for (const [key, accessTime] of this.accessTimes.entries()) {
      if (now - accessTime > maxAgeMs) {
        this.delete(key)
        this.versionMap.delete(key)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      logForDebugging(
        `[TOOL SCHEMA CACHE] Cleaned ${cleanedCount} expired entries`,
      )
    }
  }

  /**
   * 获取缓存使用情况报告
   */
  getUsageReport(): {
    statistics: ReturnType<this['getStatistics']>
    toolCount: number
    versionedTools: number
    sessionDuration: number
    memoryEstimate: string
  } {
    const stats = this.getStatistics()
    const sessionDuration = Date.now() - this.sessionStartTime

    const memoryBytes =
      this.size() * 1024 + Object.keys(stats).length * 100
    const memoryMB = (memoryBytes / (1024 * 1024)).toFixed(2)

    return {
      statistics: stats,
      toolCount: this.size(),
      versionedTools: this.versionMap.size,
      sessionDuration,
      memoryEstimate: `${memoryMB} MB`,
    }
  }
}

/**
 * 全局增强版工具 Schema 缓存实例
 */
const ENHANCED_TOOL_SCHEMA_CACHE = new EnhancedToolSchemaCache()

/**
 * 定期清理过期条目（每 10 分钟）
 */
setInterval(() => {
  try {
    ENHANCED_TOOL_SCHEMA_CACHE.cleanExpiredEntries()
  } catch (error) {
    console.error('[TOOL SCHEMA CACHE] Cleanup error:', error)
  }
}, 10 * 60 * 1000)

/**
 * 获取增强版工具 Schema 缓存实例
 */
export function getEnhancedToolSchemaCache(): EnhancedToolSchemaCache {
  return ENHANCED_TOOL_SCHEMA_CACHE
}

/**
 * 获取或设置工具 Schema（带版本控制）
 */
export function getOrSetToolSchema(
  toolId: string,
  schema: CachedSchema,
  version?: number,
): CachedSchema {
  return ENHANCED_TOOL_SCHEMA_CACHE.getOrSet(toolId, schema, version)
}

/**
 * 批量预热工具 Schema
 */
export function preheatToolSchemas(
  tools: Array<{ id: string; schema: CachedSchema }>,
): void {
  ENHANCED_TOOL_SCHEMA_CACHE.preheatCommonTools(tools)
}

/**
 * 清理过期工具 Schema
 */
export function cleanExpiredToolSchemas(maxAgeMs?: number): void {
  ENHANCED_TOOL_SCHEMA_CACHE.cleanExpiredEntries(maxAgeMs)
}

/**
 * 获取工具 Schema 使用报告
 */
export function getToolSchemaUsageReport(): ReturnType<
  EnhancedToolSchemaCache['getUsageReport']
> {
  return ENHANCED_TOOL_SCHEMA_CACHE.getUsageReport()
}

/**
 * 清空所有工具 Schema 缓存（向后兼容）
 */
export function clearToolSchemaCache(): void {
  ENHANCED_TOOL_SCHEMA_CACHE.clear()
  logForDebugging('[TOOL SCHEMA CACHE] Cache cleared')
}
