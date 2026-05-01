/**
 * 性能优化模块
 * 
 * 实现 Token 计数、上下文压缩、Prompt 缓存和 Auto-backup 功能
 */

import { EventEmitter } from 'events'
import type { MessageContent, MessageContentBlock, ImageContentBlock } from '../models/imageTypes'

// ==================== 图片 Token 估算 ====================

/**
 * 根据图片分辨率估算 Token 数量
 * 参考 OpenAI 公式: tokens = ceil(width/512) * ceil(height/512) * 170 + 85
 */
export function estimateImageTokens(width?: number, height?: number): number {
  if (!width || !height) return 170
  const tilesX = Math.ceil(width / 512)
  const tilesY = Math.ceil(height / 512)
  return tilesX * tilesY * 170 + 85
}

/**
 * 从消息内容中提取图片 ID
 */
function extractImageIdFromUrl(url: string): string {
  const match = url.match(/\/api\/chat\/images\/([^/?]+)/)
  return match ? match[1] : url
}

/**
 * 将消息内容转为纯文本（图片块替换为占位符）
 */
function contentToPlainText(content: MessageContent, imagePlaceholder: string = '[图片]'): string {
  if (typeof content === 'string') return content
  return content.map(block => {
    if (block.type === 'text') return block.text
    if (block.type === 'image') {
      const imgBlock = block as ImageContentBlock
      const imageId = extractImageIdFromUrl(imgBlock.source.url)
      return `${imagePlaceholder}:${imageId}`
    }
    if (block.type === 'tool_use') return `[工具调用: ${(block as any).name}]`
    if (block.type === 'tool_result') return `[工具结果: ${(block as any).tool_use_id}]`
    return ''
  }).filter(Boolean).join('\n')
}

/**
 * 估算消息内容的 Token 数量（支持图片）
 */
function estimateContentTokens(content: MessageContent, imageWidths?: Map<string, { width?: number; height?: number }>): number {
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4)
  }
  let total = 0
  for (const block of content) {
    if (block.type === 'text') {
      total += Math.ceil(block.text.length / 4)
    } else if (block.type === 'image') {
      const imgBlock = block as ImageContentBlock
      const imageId = extractImageIdFromUrl(imgBlock.source.url)
      const dims = imageWidths?.get(imageId)
      total += estimateImageTokens(dims?.width, dims?.height)
    } else if (block.type === 'tool_use') {
      total += 500
    } else if (block.type === 'tool_result') {
      total += Math.ceil(((block as any).content?.length || 0) / 4)
    }
  }
  return total
}

/**
 * 支持多模态内容的消息类型
 */
export interface MultimodalMessage {
  role: string
  content: MessageContent
}

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
   * 估算消息列表的 token 数量（仅支持纯文本消息）
   */
  estimateMessages(messages: Array<{ role: string; content: string }>): number {
    let total = 0

    for (const msg of messages) {
      total += this.estimate(msg.content)
      total += 4
    }

    total += 10

    return total
  }

  /**
   * 估算多模态消息列表的 token 数量（支持图片内容块）
   */
  estimateMultimodalMessages(
    messages: MultimodalMessage[],
    imageDimensions?: Map<string, { width?: number; height?: number }>
  ): number {
    let total = 0

    for (const msg of messages) {
      total += estimateContentTokens(msg.content, imageDimensions)
      total += 4
    }

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
  /** 压缩时保留最近几张图片（默认 2） */
  preserveRecentImages?: number
  /** 图片维度信息（用于精确估算图片 token） */
  imageDimensions?: Map<string, { width?: number; height?: number }>
}

/**
 * 压缩后的上下文
 */
export interface CompressedContext {
  /** 压缩后的消息（支持多模态） */
  messages: MultimodalMessage[]
  /** 压缩前 token 数 */
  originalTokenCount: number
  /** 压缩后 token 数 */
  compressedTokenCount: number
  /** 压缩比 */
  compressionRatio: number
  /** 摘要内容 (如果有) */
  summary?: string
  /** 被压缩掉的图片数量 */
  compressedImageCount?: number
}

/**
 * 上下文压缩器（支持多模态消息）
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
      preserveRecentImages: config.preserveRecentImages ?? 2,
      imageDimensions: config.imageDimensions,
    }
  }

  /**
   * 压缩上下文（支持多模态消息）
   */
  compress(
    messages: MultimodalMessage[],
    targetTokens?: number
  ): CompressedContext {
    const target = targetTokens || this.config.targetTokens!
    const originalTokenCount = this.estimator.estimateMultimodalMessages(
      messages, this.config.imageDimensions
    )

    if (originalTokenCount <= target) {
      return {
        messages,
        originalTokenCount,
        compressedTokenCount: originalTokenCount,
        compressionRatio: 1.0,
        compressedImageCount: 0,
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
   * 摘要压缩（支持多模态）
   */
  private compressWithSummary(
    messages: MultimodalMessage[],
    targetTokens: number
  ): CompressedContext {
    const recentCount = Math.min(this.config.preserveRecent!, messages.length)
    const recentMessages = messages.slice(-recentCount)
    const olderMessages = messages.slice(0, -recentCount)

    const summary = this.generateSummary(olderMessages)
    const summaryTokens = this.estimator.estimate(summary)

    const compressed: CompressedContext = {
      messages: [
        { role: 'system', content: `【对话摘要】\n${summary}` },
        ...recentMessages,
      ],
      originalTokenCount: this.estimator.estimateMultimodalMessages(messages, this.config.imageDimensions),
      compressedTokenCount: summaryTokens + this.estimator.estimateMultimodalMessages(recentMessages, this.config.imageDimensions),
      compressionRatio: 0,
      compressedImageCount: this.countImages(olderMessages),
    }

    compressed.compressionRatio = compressed.originalTokenCount > 0
      ? compressed.compressedTokenCount / compressed.originalTokenCount
      : 1

    return compressed
  }

  /**
   * 剪枝压缩（支持多模态）
   */
  private compressWithPrune(
    messages: MultimodalMessage[],
    targetTokens: number
  ): CompressedContext {
    const result: MultimodalMessage[] = []
    let currentTokens = 0
    let compressedImageCount = 0

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const msgTokens = estimateContentTokens(msg.content, this.config.imageDimensions) + 4

      if (currentTokens + msgTokens <= targetTokens) {
        result.unshift(msg)
        currentTokens += msgTokens
      } else {
        compressedImageCount += this.countImages([msg])
      }
    }

    if (currentTokens > targetTokens) {
      for (let i = 0; i < result.length; i++) {
        currentTokens -= estimateContentTokens(result[i].content, this.config.imageDimensions) + 4
        if (currentTokens <= targetTokens) {
          break
        }
        compressedImageCount += this.countImages([result[0]])
        result.shift()
      }
    }

    return {
      messages: result,
      originalTokenCount: this.estimator.estimateMultimodalMessages(messages, this.config.imageDimensions),
      compressedTokenCount: currentTokens,
      compressionRatio: currentTokens / this.estimator.estimateMultimodalMessages(messages, this.config.imageDimensions),
      compressedImageCount,
    }
  }

  /**
   * 混合压缩（支持多模态）
   */
  private compressWithHybrid(
    messages: MultimodalMessage[],
    targetTokens: number
  ): CompressedContext {
    const summaryResult = this.compressWithSummary(messages, targetTokens)

    if (summaryResult.compressedTokenCount > targetTokens) {
      return this.compressWithPrune(messages, targetTokens)
    }

    return summaryResult
  }

  /**
   * 生成摘要 (简化版本，支持多模态)
   */
  private generateSummary(messages: MultimodalMessage[]): string {
    if (messages.length === 0) {
      return '无历史对话'
    }

    const userMessages = messages.filter(m => m.role === 'user')
    const assistantMessages = messages.filter(m => m.role === 'assistant')
    const imageCount = this.countImages(messages)

    const keywords: string[] = []
    for (const msg of userMessages.slice(0, 3)) {
      const text = contentToPlainText(msg.content, '[图片]')
      const words = text.slice(0, 50)
      if (words) keywords.push(words)
    }

    const imageInfo = imageCount > 0 ? `\n- 包含 ${imageCount} 张图片（已压缩）` : ''

    return `
对话历史摘要：
- 用户共发送 ${userMessages.length} 条消息
- 助手共回复 ${assistantMessages.length} 条消息
- 最近讨论主题：${keywords.join('; ') || '无'}${imageInfo}
`.trim()
  }

  /**
   * 统计消息中的图片数量
   */
  private countImages(messages: MultimodalMessage[]): number {
    let count = 0
    for (const msg of messages) {
      if (typeof msg.content !== 'string') {
        for (const block of msg.content) {
          if (block.type === 'image') count++
        }
      }
    }
    return count
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
  estimateImageTokens,
  contentToPlainText,
}

export type { MultimodalMessage }

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
