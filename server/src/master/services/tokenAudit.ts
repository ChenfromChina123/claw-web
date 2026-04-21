/**
 * Token 审核服务
 * 
 * 参考 Claude Code 实现：
 * - src/utils/analyzeContext.ts
 * - src/utils/context.ts
 * - src/constants/toolLimits.ts
 * 
 * 功能：
 * - Token 使用量估算和限制检查
 * - 上下文窗口管理
 * - 防止 Token 超限导致 LLM 调用失败
 */

import { estimateTokens, estimateMessagesTokens, TOOL_RESULT_LIMITS } from '../utils/fileLimits'

// ==================== Token 审核配置 ====================

export interface TokenAuditConfig {
  /** 最大输入 Token 数 */
  maxInputTokens: number
  /** 最大输出 Token 数 */
  maxOutputTokens: number
  /** 最大上下文窗口 */
  maxContextTokens: number
  /** 最大工具结果 Token 数 */
  maxToolResultTokens: number
  /** 警告阈值 (0-1) */
  warnAtPercent: number
  /** 严重警告阈值 (0-1) */
  criticalAtPercent: number
}

export const DEFAULT_TOKEN_AUDIT_CONFIG: TokenAuditConfig = {
  maxInputTokens: 150_000,        // 预留 50K 给输出
  maxOutputTokens: 8_192,         // 默认输出限制
  maxContextTokens: 200_000,       // Claude 默认上下文
  maxToolResultTokens: 100_000,    // 100K tokens ≈ 400KB
  warnAtPercent: 0.8,             // 80%
  criticalAtPercent: 0.95,        // 95%
}

// ==================== Token 使用量类型 ====================

export interface TokenUsage {
  /** 输入 Token 数 */
  inputTokens: number
  /** 输出 Token 数 */
  outputTokens: number
  /** 工具调用 Token 数 */
  toolCallTokens: number
  /** 工具结果 Token 数 */
  toolResultTokens: number
  /** 附件 Token 数 */
  attachmentTokens: number
  /** 总 Token 数 */
  totalTokens: number
}

export interface TokenCheckResult {
  /** 是否通过检查 */
  passed: boolean
  /** 失败的检查项 */
  failures: TokenCheckFailure[]
  /** 警告信息 */
  warnings: TokenWarning[]
  /** 各检查项使用百分比 */
  percentages: Record<string, number>
  /** 剩余可用 Token */
  remainingTokens: number
}

export interface TokenCheckFailure {
  /** 检查项名称 */
  name: string
  /** 限制值 */
  limit: number
  /** 实际使用 */
  used: number
  /** 超出量 */
  exceededBy: number
}

export interface TokenWarning {
  /** 检查项名称 */
  name: string
  /** 限制值 */
  limit: number
  /** 实际使用 */
  used: number
  /** 百分比 */
  percentage: number
  /** 严重程度 */
  severity: 'warning' | 'critical'
}

// ==================== Token 预算类型 ====================

export interface TokenBudget {
  /** 用户 ID */
  userId: string
  /** 总预算 */
  totalBudget: number
  /** 已使用 */
  usedTokens: number
  /** 重置时间 */
  resetAt: Date
  /** 最后更新时间 */
  lastUpdated: Date
}

// ==================== Token 审核服务类 ====================

export class TokenAuditService {
  private config: TokenAuditConfig
  private budgets: Map<string, TokenBudget> = new Map()
  private usageHistory: Map<string, TokenUsage[]> = new Map()
  private maxHistorySize = 100

  constructor(config: Partial<TokenAuditConfig> = {}) {
    this.config = { ...DEFAULT_TOKEN_AUDIT_CONFIG, ...config }
  }

  /**
   * 估算消息列表的 Token 数
   */
  estimateMessagesTokens(messages: Array<{ role: string; content: unknown }>): number {
    return estimateMessagesTokens(messages)
  }

  /**
   * 估算单个文本的 Token 数
   */
  estimateTextTokens(text: string): number {
    return estimateTokens(text)
  }

  /**
   * 估算工具输入的 Token 数
   */
  estimateToolInputTokens(input: Record<string, unknown>): number {
    return estimateTokens(JSON.stringify(input))
  }

  /**
   * 检查 Token 使用量是否超过限制
   */
  checkLimit(usage: TokenUsage): TokenCheckResult {
    const checks = [
      { name: 'input', limit: this.config.maxInputTokens, used: usage.inputTokens },
      { name: 'output', limit: this.config.maxOutputTokens, used: usage.outputTokens },
      { name: 'total', limit: this.config.maxContextTokens, used: usage.totalTokens },
      { name: 'toolResult', limit: this.config.maxToolResultTokens, used: usage.toolResultTokens },
    ]

    const failures: TokenCheckFailure[] = []
    const warnings: TokenWarning[] = []
    const percentages: Record<string, number> = {}

    for (const check of checks) {
      const percentage = (check.used / check.limit) * 100
      percentages[check.name] = percentage

      if (check.used > check.limit) {
        failures.push({
          name: check.name,
          limit: check.limit,
          used: check.used,
          exceededBy: check.used - check.limit,
        })
      } else if (percentage >= this.config.criticalAtPercent * 100) {
        warnings.push({
          name: check.name,
          limit: check.limit,
          used: check.used,
          percentage,
          severity: 'critical',
        })
      } else if (percentage >= this.config.warnAtPercent * 100) {
        warnings.push({
          name: check.name,
          limit: check.limit,
          used: check.used,
          percentage,
          severity: 'warning',
        })
      }
    }

    const remainingTokens = Math.max(0, this.config.maxContextTokens - usage.totalTokens)

    return {
      passed: failures.length === 0,
      failures,
      warnings,
      percentages,
      remainingTokens,
    }
  }

  /**
   * 强制检查限制，超限时抛出错误
   */
  enforceLimit(usage: TokenUsage): void {
    const result = this.checkLimit(usage)
    
    if (!result.passed) {
      const details = result.failures
        .map(f => `${f.name}: ${f.used}/${f.limit} (超出 ${f.exceededBy})`)
        .join(', ')
      throw new TokenLimitExceededError(
        `Token 使用超限: ${details}`,
        result.failures
      )
    }
  }

  /**
   * 记录 Token 使用量
   */
  recordUsage(userId: string, usage: TokenUsage): void {
    // 记录历史
    const history = this.usageHistory.get(userId) || []
    history.push({ ...usage })
    
    if (history.length > this.maxHistorySize) {
      history.shift()
    }
    
    this.usageHistory.set(userId, history)
    
    // 更新预算
    const budget = this.budgets.get(userId)
    if (budget) {
      budget.usedTokens += usage.totalTokens
      budget.lastUpdated = new Date()
    }
    
    console.log(
      `[TokenAudit] 用户 ${userId}: ` +
      `input=${usage.inputTokens}, output=${usage.outputTokens}, ` +
      `toolResult=${usage.toolResultTokens}, total=${usage.totalTokens}`
    )
  }

  /**
   * 获取用户预算
   */
  getBudget(userId: string): TokenBudget | null {
    return this.budgets.get(userId) || null
  }

  /**
   * 设置用户预算
   */
  setBudget(budget: TokenBudget): void {
    this.budgets.set(budget.userId, { ...budget })
  }

  /**
   * 检查预算是否充足
   */
  checkBudget(userId: string, requiredTokens: number): {
    sufficient: boolean
    currentBudget: TokenBudget | null
    remaining: number
  } {
    const budget = this.budgets.get(userId)
    
    if (!budget) {
      return { sufficient: true, currentBudget: null, remaining: Infinity }
    }
    
    const remaining = budget.totalBudget - budget.usedTokens
    const now = new Date()
    
    // 检查是否需要重置
    if (now > budget.resetAt) {
      budget.usedTokens = 0
      budget.resetAt = this.getNextResetTime()
    }
    
    return {
      sufficient: remaining >= requiredTokens,
      currentBudget: budget,
      remaining: Math.max(0, remaining - requiredTokens),
    }
  }

  /**
   * 获取使用历史
   */
  getUsageHistory(userId: string, limit: number = 10): TokenUsage[] {
    const history = this.usageHistory.get(userId) || []
    return history.slice(-limit)
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalUsers: number
    activeUsers: number
    averageUsage: number
  } {
    const users = Array.from(this.usageHistory.keys())
    const now = Date.now()
    const oneHourAgo = now - 60 * 60 * 1000
    
    let activeUsers = 0
    let totalUsage = 0
    
    for (const userId of users) {
      const history = this.usageHistory.get(userId)
      if (history && history.length > 0) {
        const lastUsage = history[history.length - 1]
        totalUsage += lastUsage.totalTokens
        
        if (lastUsage.totalTokens > 0) {
          activeUsers++
        }
      }
    }
    
    return {
      totalUsers: users.length,
      activeUsers,
      averageUsage: activeUsers > 0 ? totalUsage / activeUsers : 0,
    }
  }

  /**
   * 获取下次重置时间
   */
  private getNextResetTime(): Date {
    const now = new Date()
    const nextHour = new Date(now)
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0)
    return nextHour
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TokenAuditConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): TokenAuditConfig {
    return { ...this.config }
  }
}

// ==================== Token 限制错误 ====================

export class TokenLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly failures: TokenCheckFailure[]
  ) {
    super(message)
    this.name = 'TokenLimitExceededError'
  }
}

// ==================== Token 警告错误 ====================

export class TokenWarningError extends Error {
  constructor(
    message: string,
    public readonly warnings: TokenWarning[]
  ) {
    super(message)
    this.name = 'TokenWarningError'
  }
}

// ==================== 上下文分析 ====================

export interface ContextAnalysis {
  /** 总 Token 数 */
  totalTokens: number
  /** 最大上下文窗口 */
  maxTokens: number
  /** 使用百分比 */
  percentage: number
  /** 各部分 Token 分布 */
  breakdown: {
    inputTokens: number
    toolCallTokens: number
    toolResultTokens: number
    attachmentTokens: number
  }
  /** 是否需要压缩 */
  needsCompaction: boolean
  /** 建议的操作 */
  suggestions: string[]
}

/**
 * 分析上下文使用情况
 */
export function analyzeContext(usage: TokenUsage, maxTokens: number = 200_000): ContextAnalysis {
  const percentage = (usage.totalTokens / maxTokens) * 100
  const needsCompaction = percentage >= 80
  
  const suggestions: string[] = []
  
  if (percentage >= 95) {
    suggestions.push('上下文使用率超过 95%，建议立即压缩或清理历史消息')
  } else if (percentage >= 80) {
    suggestions.push('上下文使用率超过 80%，建议考虑压缩历史')
  }
  
  // 检查工具结果占比
  if (usage.toolResultTokens > usage.totalTokens * 0.5) {
    suggestions.push('工具结果占用过多 Token，建议启用结果截断')
  }
  
  // 检查输入占比
  if (usage.inputTokens > maxTokens * 0.8) {
    suggestions.push('输入内容较大，建议减少系统提示词或历史消息')
  }
  
  return {
    totalTokens: usage.totalTokens,
    maxTokens,
    percentage,
    breakdown: {
      inputTokens: usage.inputTokens,
      toolCallTokens: usage.toolCallTokens,
      toolResultTokens: usage.toolResultTokens,
      attachmentTokens: usage.attachmentTokens,
    },
    needsCompaction,
    suggestions,
  }
}

// ==================== 单例导出 ====================

let tokenAuditInstance: TokenAuditService | null = null

export function getTokenAuditService(): TokenAuditService {
  if (!tokenAuditInstance) {
    tokenAuditInstance = new TokenAuditService()
  }
  return tokenAuditInstance
}

export default TokenAuditService
