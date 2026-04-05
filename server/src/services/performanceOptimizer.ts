/**
 * 性能优化模块
 * 
 * 实现 Token 计数、上下文压缩、Prompt 缓存和 Auto-backup 功能
 */

import { EventEmitter } from 'events'

// ==================== Token 计数 ====================

/**
 * Token 估算配置
 */
export interface TokenEstimatorConfig {
  /** 平均字符数/token */
  avgCharsPerToken?: number
  /** 语言权重 (用于调整估算) */
  languageWeights?: Record<string, number>
}

/**
 * Token 估算器
 */
export class TokenEstimator {
  private config: Required<TokenEstimatorConfig>
  private avgCharsPerToken: number
  private languageWeights: Record<string, number>

  constructor(config: TokenEstimatorConfig = {}) {
    this.config = {
      avgCharsPerToken: config.avgCharsPerToken || 4,
      languageWeights: config.languageWeights || {
        english: 1.0,
        chinese: 1.5,
        japanese: 1.4,
        code: 0.75,
      },
    }
    this.avgCharsPerToken = this.config.avgCharsPerToken
    this.languageWeights = this.config.languageWeights
  }

  /**
   * 估算 token 数量
   */
  estimate(text: string, language?: string): number {
    if (!text) return 0

    const length = text.length
    const weight = language
      ? this.languageWeights[language] || 1.0
      : this.detectLanguageWeight(text)

    return Math.ceil(length / this.avgCharsPerToken / weight)
  }

  /**
   * 估算消息列表的 token 数量
   */
  estimateMessages(messages: Array<{ role: string; content: string }>): number {
    let total = 0

    for (const msg of messages) {
      total += this.estimate(msg.content)
      // 角色标记约消耗 4-5 tokens
      total += 4
    }

    // 系统消息开销
    total += 10

    return total
  }

  /**
   * 检测语言权重
   */
  private detectLanguageWeight(text: string): number {
    // 简单检测：计算中文字符比例
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const totalChars = text.length

    if (totalChars === 0) return 1.0

    const chineseRatio = chineseChars / totalChars

    if (chineseRatio > 0.3) {
      return this.languageWeights['chinese']
    }

    // 简单检测代码
    const codePatterns = [/\{/, /\};/, /function/, /class /, /import /, /export /]
    const hasCode = codePatterns.some(p => p.test(text))
    if (hasCode) {
      return this.languageWeights['code']
    }

    return 1.0
  }

  /**
   * 获取配置
   */
  getConfig(): Required<TokenEstimatorConfig> {
    return { ...this.config }
  }
}

// ==================== 上下文压缩 ====================

/**
 * 压缩策略
 */
export enum CompressionStrategy {
  /** 摘要压缩 */
  SUMMARY = 'summary',
  /** 剪枝压缩 */
  PRUNE = 'prune',
  /** 混合压缩 */
  HYBRID = 'hybrid',
}

/**
 * 压缩配置
 */
export interface CompressionConfig {
  /** 压缩策略 */
  strategy: CompressionStrategy
  /** 目标 token 数量 */
  targetTokens?: number
  /** 是否保留最新消息 */
  preserveRecent?: number
  /** 摘要 prompt */
  summaryPrompt?: string
}

/**
 * 压缩后的上下文
 */
export interface CompressedContext {
  /** 压缩后的消息 */
  messages: Array<{ role: string; content: string }>
  /** 压缩前 token 数 */
  originalTokenCount: number
  /** 压缩后 token 数 */
  compressedTokenCount: number
  /** 压缩比 */
  compressionRatio: number
  /** 摘要内容 (如果有) */
  summary?: string
}

/**
 * 上下文压缩器
 */
export class ContextCompressor {
  private estimator: TokenEstimator
  private config: CompressionConfig

  constructor(config: CompressionConfig) {
    this.estimator = new TokenEstimator()
    this.config = {
      strategy: config.strategy,
      targetTokens: config.targetTokens || 4000,
      preserveRecent: config.preserveRecent ?? 5,
      summaryPrompt: config.summaryPrompt || '请简要总结以下对话的要点：',
    }
  }

  /**
   * 压缩上下文
   */
  compress(
    messages: Array<{ role: string; content: string }>,
    targetTokens?: number
  ): CompressedContext {
    const target = targetTokens || this.config.targetTokens!
    const originalTokenCount = this.estimator.estimateMessages(messages)

    // 如果不需要压缩，直接返回
    if (originalTokenCount <= target) {
      return {
        messages,
        originalTokenCount,
        compressedTokenCount: originalTokenCount,
        compressionRatio: 1.0,
      }
    }

    switch (this.config.strategy) {
      case CompressionStrategy.SUMMARY:
        return this.compressWithSummary(messages, target)

      case CompressionStrategy.PRUNE:
        return this.compressWithPrune(messages, target)

      case CompressionStrategy.HYBRID:
        return this.compressWithHybrid(messages, target)

      default:
        return this.compressWithPrune(messages, target)
    }
  }

  /**
   * 摘要压缩
   */
  private compressWithSummary(
    messages: Array<{ role: string; content: string }>,
    targetTokens: number
  ): CompressedContext {
    // 保留最近的 N 条消息
    const recentCount = Math.min(this.config.preserveRecent!, messages.length)
    const recentMessages = messages.slice(-recentCount)
    const olderMessages = messages.slice(0, -recentCount)

    // 对旧消息生成摘要 (这里简化处理，实际可能需要调用 LLM)
    const summary = this.generateSummary(olderMessages)
    const summaryTokens = this.estimator.estimate(summary)

    // 构建压缩后的消息
    const compressed: CompressedContext = {
      messages: [
        { role: 'system', content: `【对话摘要】\n${summary}` },
        ...recentMessages,
      ],
      originalTokenCount: this.estimator.estimateMessages(messages),
      compressedTokenCount: summaryTokens + this.estimator.estimateMessages(recentMessages),
      compressionRatio: 0,
    }

    compressed.compressionRatio = compressed.originalTokenCount > 0
      ? compressed.compressedTokenCount / compressed.originalTokenCount
      : 1

    return compressed
  }

  /**
   * 剪枝压缩
   */
  private compressWithPrune(
    messages: Array<{ role: string; content: string }>,
    targetTokens: number
  ): CompressedContext {
    const result: Array<{ role: string; content: string }> = []
    let currentTokens = 0

    // 从最新消息开始添加
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const msgTokens = this.estimator.estimate(msg.content) + 4

      if (currentTokens + msgTokens <= targetTokens) {
        result.unshift(msg)
        currentTokens += msgTokens
      } else {
        break
      }
    }

    // 如果仍然超限，截断旧消息
    if (currentTokens > targetTokens) {
      const truncateIndex = 0
      for (let i = 0; i < result.length; i++) {
        currentTokens -= this.estimator.estimate(result[i].content) + 4
        if (currentTokens <= targetTokens) {
          break
        }
        result.shift()
      }
    }

    return {
      messages: result,
      originalTokenCount: this.estimator.estimateMessages(messages),
      compressedTokenCount: currentTokens,
      compressionRatio: currentTokens / this.estimator.estimateMessages(messages),
    }
  }

  /**
   * 混合压缩
   */
  private compressWithHybrid(
    messages: Array<{ role: string; content: string }>,
    targetTokens: number
  ): CompressedContext {
    // 先尝试摘要压缩
    const summaryResult = this.compressWithSummary(messages, targetTokens)

    // 如果摘要压缩后仍然超限，使用剪枝
    if (summaryResult.compressedTokenCount > targetTokens) {
      return this.compressWithPrune(messages, targetTokens)
    }

    return summaryResult
  }

  /**
   * 生成摘要 (简化版本)
   */
  private generateSummary(messages: Array<{ role: string; content: string }>): string {
    if (messages.length === 0) {
      return '无历史对话'
    }

    // 简单摘要：统计消息数量和主要主题
    const userMessages = messages.filter(m => m.role === 'user')
    const assistantMessages = messages.filter(m => m.role === 'assistant')

    // 提取前几条用户消息的关键词
    const keywords: string[] = []
    for (const msg of userMessages.slice(0, 3)) {
      const words = msg.content.slice(0, 50)
      if (words) keywords.push(words)
    }

    return `
对话历史摘要：
- 用户共发送 ${userMessages.length} 条消息
- 助手共回复 ${assistantMessages.length} 条消息
- 最近讨论主题：${keywords.join('; ') || '无'}
`.trim()
  }
}

// ==================== Prompt 缓存 ====================

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  key: string
  value: T
  createdAt: number
  accessCount: number
  lastAccessedAt: number
  size: number
}

/**
 * Prompt 缓存配置
 */
export interface PromptCacheConfig {
  /** 最大缓存数量 */
  maxSize?: number
  /** TTL (毫秒) */
  ttl?: number
  /** 缓存大小限制 (bytes) */
  sizeLimit?: number
}

/**
 * Prompt 缓存
 */
export class PromptCache extends EventEmitter {
  private cache: Map<string, CacheEntry<string>> = new Map()
  private config: Required<PromptCacheConfig>
  private estimator: TokenEstimator

  constructor(config: PromptCacheConfig = {}) {
    super()

    this.config = {
      maxSize: config.maxSize || 100,
      ttl: config.ttl || 3600000, // 1小时
      sizeLimit: config.sizeLimit || 10 * 1024 * 1024, // 10MB
    }

    this.estimator = new TokenEstimator()
  }

  /**
   * 生成缓存键
   */
  generateKey(agentType: string, systemPrompt: string, params?: Record<string, unknown>): string {
    const parts = [agentType, systemPrompt]

    if (params) {
      parts.push(JSON.stringify(params))
    }

    return this.hashString(parts.join('|'))
  }

  /**
   * 简单哈希
   */
  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * 获取缓存
   */
  get(key: string): { hit: boolean; value?: string; responseTime?: number } {
    const entry = this.cache.get(key)

    if (!entry) {
      return { hit: false }
    }

    // 检查 TTL
    if (Date.now() - entry.createdAt > this.config.ttl) {
      this.cache.delete(key)
      return { hit: false }
    }

    // 更新访问统计
    entry.accessCount++
    entry.lastAccessedAt = Date.now()

    return { hit: true, value: entry.value }
  }

  /**
   * 设置缓存
   */
  set(key: string, value: string): void {
    // 如果缓存已满，执行清理
    if (this.cache.size >= this.config.maxSize) {
      this.evict()
    }

    const entry: CacheEntry<string> = {
      key,
      value,
      createdAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: Date.now(),
      size: value.length,
    }

    this.cache.set(key, entry)
    this.emit('cache_set', { key, size: entry.size })
  }

  /**
   * 驱逐最少使用的条目
   */
  private evict(): void {
    let oldestEntry: CacheEntry<string> | null = null
    let oldestKey: string | null = null

    for (const [key, entry] of this.cache) {
      if (!oldestEntry || entry.lastAccessedAt < oldestEntry.lastAccessedAt) {
        oldestEntry = entry
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey)
      this.emit('cache_evict', { key: oldestKey })
    }
  }

  /**
   * 获取缓存统计
   */
  getStats(): {
    size: number
    maxSize: number
    totalAccessCount: number
    hitRate: number
    entries: Array<{ key: string; accessCount: number; age: number }>
  } {
    let totalAccessCount = 0
    const entries: Array<{ key: string; accessCount: number; age: number }> = []

    for (const entry of this.cache.values()) {
      totalAccessCount += entry.accessCount
      entries.push({
        key: entry.key,
        accessCount: entry.accessCount,
        age: Date.now() - entry.createdAt,
      })
    }

    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      totalAccessCount,
      hitRate: 0, // 需要记录请求数来计算
      entries: entries.sort((a, b) => b.accessCount - a.accessCount),
    }
  }

  /**
   * 清除缓存
   */
  clear(): void {
    this.cache.clear()
    this.emit('cache_clear')
  }
}

// ==================== Auto-backup ====================

/**
 * Auto-backup 配置
 */
export interface AutoBackupConfig {
  /** 自动后台化的 token 阈值 */
  tokenThreshold?: number
  /** 自动后台化的文件数阈值 */
  fileThreshold?: number
  /** 是否启用 */
  enabled?: boolean
}

/**
 * Auto-backup 服务
 */
export class AutoBackupService extends EventEmitter {
  private config: Required<AutoBackupConfig>
  private estimator: TokenEstimator

  constructor(config: AutoBackupConfig = {}) {
    super()

    this.config = {
      tokenThreshold: config.tokenThreshold || 10000,
      fileThreshold: config.fileThreshold || 100,
      enabled: config.enabled ?? true,
    }

    this.estimator = new TokenEstimator()
  }

  /**
   * 检查是否需要自动后台化
   */
  shouldAutoBackground(params: {
    taskDescription?: string
    fileCount?: number
    estimatedTokens?: number
  }): { should: boolean; reason: string } {
    if (!this.config.enabled) {
      return { should: false, reason: 'Auto-backup is disabled' }
    }

    if (params.estimatedTokens && params.estimatedTokens > this.config.tokenThreshold) {
      return {
        should: true,
        reason: `Estimated tokens (${params.estimatedTokens}) exceeds threshold (${this.config.tokenThreshold})`,
      }
    }

    if (params.fileCount && params.fileCount > this.config.fileThreshold) {
      return {
        should: true,
        reason: `File count (${params.fileCount}) exceeds threshold (${this.config.fileThreshold})`,
      }
    }

    // 检查任务描述中的关键词
    const keywords = ['分析', '扫描', '处理', '批量', '大规模', '10000']
    if (params.taskDescription) {
      for (const keyword of keywords) {
        if (params.taskDescription.includes(keyword)) {
          return {
            should: true,
            reason: `Task contains keyword: ${keyword}`,
          }
        }
      }
    }

    return { should: false, reason: 'Task is within normal scope' }
  }

  /**
   * 获取配置
   */
  getConfig(): Required<AutoBackupConfig> {
    return { ...this.config }
  }
}

// ==================== 导出 ====================

export {
  TokenEstimator,
  ContextCompressor,
  PromptCache,
  AutoBackupService,
}

export function createTokenEstimator(config?: TokenEstimatorConfig): TokenEstimator {
  return new TokenEstimator(config)
}

export function createContextCompressor(config: CompressionConfig): ContextCompressor {
  return new ContextCompressor(config)
}

export function createPromptCache(config?: PromptCacheConfig): PromptCache {
  return new PromptCache(config)
}

export function createAutoBackupService(config?: AutoBackupConfig): AutoBackupService {
  return new AutoBackupService(config)
}
