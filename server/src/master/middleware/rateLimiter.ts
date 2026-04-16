/**
 * RateLimiter & CircuitBreaker - 限流器和熔断器
 *
 * 功能：
 * - 令牌桶算法实现的请求频率限制
 * - 滑动窗口计数器
 * - 熔断器模式（状态机：关闭/打开/半开）
 * - 用户级别和全局级别的双重限制
 * - 优雅的降级与恢复机制
 *
 * 使用场景：
 * - API网关层保护后端服务
 * - 防止DDoS攻击和滥用
 * - 容错处理，避免级联故障
 */

// ==================== 类型定义 ====================

/**
 * 限流结果
 */
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTimeMs: number
  retryAfterMs?: number
}

/**
 * 熔断器状态
 */
export enum CircuitState {
  CLOSED = 'closed',     // 正常状态，允许请求通过
  OPEN = 'open',         // 熔断状态，拒绝所有请求
  HALF_OPEN = 'half_open' // 半开状态，允许少量试探请求
}

/**
 * 熔断结果
 */
export interface CircuitBreakerResult {
  allowed: boolean
  state: CircuitState
  reason?: string
}

/**
 * 限流配置
 */
export interface RateLimitConfig {
  /** 每秒请求数（RPS）*/
  requestsPerSecond: number
  /** 突发容量（最大令牌数）*/
  burstCapacity: number
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  /** 触发熔断的错误率阈值 (0-1) */
  errorThreshold: number
  /** 触发熔断的最小请求数（避免过早触发）*/
  minRequests: number
  /** 统计时间窗口（毫秒）*/
  windowDurationMs: number
  /** 熔断持续时间（毫秒）*/
  openDurationMs: number
  /** 半开状态允许的试探请求数*/
  halfOpenMaxRequests: number
  /** 半开状态的探测成功率阈值*/
  halfOpenSuccessThreshold: number
}

// ==================== RateLimiter 类 ====================

class TokenBucketRateLimiter {
  private maxTokens: number
  private tokens: number
  private refillRate: number  // 每毫秒补充的令牌数
  private lastRefillTime: number

  constructor(config: RateLimitConfig) {
    this.maxTokens = config.burstCapacity
    this.tokens = config.burstCapacity
    this.refillRate = config.requestsPerSecond / 1000  // 转换为每毫秒
    this.lastRefillTime = Date.now()
  }

  /**
   * 尝试获取一个令牌
   * @returns 是否成功获取
   */
  tryAcquire(): boolean {
    this.refill()

    if (this.tokens >= 1) {
      this.tokens -= 1
      return true
    }

    return false
  }

  /**
   * 获取当前剩余令牌数
   */
  getRemaining(): number {
    this.refill()
    return Math.floor(this.tokens)
  }

  /**
   * 计算下一个令牌可用的时间
   */
  getRetryAfterMs(): number {
    if (this.tokens >= 1) return 0

    const needed = 1 - this.tokens
    return Math.ceil(needed / this.refillRate)
  }

  /**
   * 补充令牌
   */
  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefillTime

    if (elapsed > 0) {
      const tokensToAdd = elapsed * this.refillRate
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd)
      this.lastRefillTime = now
    }
  }
}

// ==================== UserRateLimiter 类（用户级别限流）====================

class UserRateLimiter {
  private limiters: Map<string, TokenBucketRateLimiter> = new Map()
  private globalLimiter: TokenBucketRateLimiter
  private defaultConfig: RateLimitConfig
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(defaultConfig: RateLimitConfig, globalConfig?: RateLimitConfig) {
    this.defaultConfig = defaultConfig
    this.globalLimiter = new TokenBucketRateLimiter(globalConfig || defaultConfig)

    // 定期清理不活跃用户的限流器
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000)
  }

  /**
   * 检查用户是否被允许发起请求
   * @param userId 用户ID
   * @param customConfig 可选的自定义配置（覆盖默认值）
   */
  checkRateLimit(userId: string, customConfig?: Partial<RateLimitConfig>): RateLimitResult {
    // 先检查全局限制
    const globalResult = this.globalLimiter.tryAcquire()
    if (!globalResult) {
      return {
        allowed: false,
        remaining: 0,
        resetTimeMs: Date.now() + this.globalLimiter.getRetryAfterMs(),
        retryAfterMs: this.globalLimiter.getRetryAfterMs()
      }
    }

    // 再检查用户级别限制
    let userLimiter = this.limiters.get(userId)

    if (!userLimiter) {
      userLimiter = new TokenBucketRateLimiter({
        ...this.defaultConfig,
        ...customConfig
      })
      this.limiters.set(userId, userLimiter)
    }

    const userAllowed = userLimiter.tryAcquire()

    if (!userAllowed) {
      return {
        allowed: false,
        remaining: 0,
        resetTimeMs: Date.now() + userLimiter.getRetryAfterMs(),
        retryAfterMs: userLimiter.getRetryAfterMs()
      }
    }

    return {
      allowed: true,
      remaining: userLimiter.getRemaining(),
      resetTimeMs: Date.now() + 1000  // 约1秒后会补充新令牌
    }
  }

  /**
   * 更新用户配置
   */
  updateConfig(userId: string, config: Partial<RateLimitConfig>): void {
    const existing = this.limiters.get(userId)
    if (existing) {
      // 创建新的limiter实例应用新配置
      this.limiters.set(userId, new TokenBucketRateLimiter({
        ...this.defaultConfig,
        ...config
      }))
    }
  }

  /**
   * 清理不活跃的用户限流器
   */
  private cleanup(): void {
    // 简单实现：如果用户数过多，清理一半最老的
    if (this.limiters.size > 10000) {
      let count = 0
      for (const [key] of this.limiters) {
        if (count < this.limiters.size / 2) {
          this.limiters.delete(key)
          count++
        } else {
          break
        }
      }
      console.log(`[UserRateLimiter] 已清理 ${count} 个过期限流器`)
    }
  }

  /**
   * 销毁（停止定时任务）
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.limiters.clear()
  }
}

// ==================== CircuitBreaker 类 ====================

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private config: Required<CircuitBreakerConfig>
  private failureCount: number = 0
  private successCount: number = 0
  private totalRequests: number = 0
  private windowStartTime: number = Date.now()
  private openStartTime: number | null = null
  private halfOpenRequests: number = 0

  constructor(config: Partial<CircuitBreakerConfig>) {
    this.config = {
      errorThreshold: config.errorThreshold || 0.5,
      minRequests: config.minRequests || 10,
      windowDurationMs: config.windowDurationMs || 60000,
      openDurationMs: config.openDurationMs || 30000,
      halfOpenMaxRequests: config.halfOpenMaxRequests || 3,
      halfOpenSuccessThreshold: config.halfOpenSuccessThreshold || 2
    }
  }

  /**
   * 执行受保护的操作
   * @param operation 要执行的操作
   * @returns 操作结果或错误信息
   */
  async execute<T>(operation: () => Promise<T>): Promise<{
    success: boolean
    data?: T
    error?: string
    circuitState: CircuitState
  }> {
    const canProceed = this.canProceed()

    if (!canProceed.allowed) {
      return {
        success: false,
        error: canProceed.reason || 'Circuit breaker is open',
        circuitState: this.state
      }
    }

    try {
      const result = await operation()
      this.recordSuccess()
      return { success: true, data: result, circuitState: this.state }

    } catch (error) {
      this.recordFailure()
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Operation failed',
        circuitState: this.state
      }
    }
  }

  /**
   * 检查是否允许执行操作（非阻塞检查）
   */
  canProceed(): CircuitBreakerResult {
    this.checkStateTransition()

    switch (this.state) {
      case CircuitState.CLOSED:
        return { allowed: true, state: this.state }

      case CircuitState.OPEN:
        return {
          allowed: false,
          state: this.state,
          reason: 'Circuit breaker is OPEN - service unavailable'
        }

      case CircuitState.HALF_OPEN:
        if (this.halfOpenRequests >= this.config.halfOpenMaxRequests) {
          return {
            allowed: false,
            state: this.state,
            reason: 'Half-open probe limit reached'
          }
        }
        this.halfOpenRequests++
        return { allowed: true, state: this.state }

      default:
        return { allowed: false, state: this.state, reason: 'Unknown state' }
    }
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitState {
    this.checkStateTransition()
    return this.state
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    state: CircuitState
    failureCount: number
    successCount: number
    totalRequests: number
    errorRate: number
    nextCheckIn?: number
  } {
    const errorRate = this.totalRequests > 0
      ? Math.round((this.failureCount / this.totalRequests) * 10000) / 100
      : 0

    let nextCheckIn: number | undefined
    if (this.state === CircuitState.OPEN && this.openStartTime) {
      nextCheckIn = Math.max(0,
        this.config.openDurationMs - (Date.now() - this.openStartTime)
      )
    }

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      errorRate,
      nextCheckIn
    }
  }

  /**
   * 手动重置为关闭状态
   */
  reset(): void {
    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.totalRequests = 0
    this.windowStartTime = Date.now()
    this.openStartTime = null
    this.halfOpenRequests = 0
  }

  // ==================== 私有方法 ====================

  /**
   * 记录成功调用
   */
  private recordSuccess(): void {
    this.successCount++
    this.totalRequests++

    // 在半开状态下，如果达到成功阈值，关闭熔断器
    if (
      this.state === CircuitState.HALF_OPEN &&
      this.successCount >= this.config.halfOpenSuccessThreshold
    ) {
      console.log('[CircuitBreaker] 半开状态探测成功，切换到CLOSED')
      this.reset()
    }
  }

  /**
   * 记录失败调用
   */
  private recordFailure(): void {
    this.failureCount++
    this.totalRequests++

    // 在半开状态下，任何失败都会重新打开熔断器
    if (this.state === CircuitState.HALF_OPEN) {
      console.warn('[CircuitBreaker] 半开状态探测失败，重新打开')
      this.transitionTo(CircuitState.OPEN)
      return
    }

    // 在关闭状态下，检查是否需要打开
    if (this.shouldOpen()) {
      console.warn(
        `[CircuitBreaker] 错误率过高 (${this.getCurrentErrorRate()}%), 打开熔断器`
      )
      this.transitionTo(CircuitState.OPEN)
    }
  }

  /**
   * 检查是否需要转换状态
   */
  private checkStateTransition(): void {
    if (this.state === CircuitState.OPEN) {
      // 检查是否应该进入半开状态
      if (this.openStartTime &&
          Date.now() - this.openStartTime >= this.config.openDurationMs) {
        console.log('[CircuitBreaker] 冷却期结束，进入HALF_OPEN状态')
        this.transitionTo(CircuitState.HALF_OPEN)
      }
    }

    // 检查统计窗口是否需要重置
    if (Date.now() - this.windowStartTime > this.config.windowDurationMs) {
      this.resetWindow()
    }
  }

  /**
   * 判断是否应该打开熔断器
   */
  private shouldOpen(): boolean {
    return (
      this.totalRequests >= this.config.minRequests &&
      this.getCurrentErrorRate() >= this.config.errorThreshold
    )
  }

  /**
   * 获取当前错误率
   */
  private getCurrentErrorRate(): number {
    return this.totalRequests > 0
      ? this.failureCount / this.totalRequests
      : 0
  }

  /**
   * 状态转换
   */
  private transitionTo(newState: CircuitState): void {
    console.log(`[CircuitBreaker] 状态转换: ${this.state} -> ${newState}`)
    this.state = newState

    if (newState === CircuitState.OPEN) {
      this.openStartTime = Date.now()
      this.halfOpenRequests = 0
    } else if (newState === CircuitState.HALF_OPEN) {
      this.openStartTime = null
      this.halfOpenRequests = 0
      this.resetWindow() // 重置统计以开始新的评估周期
    }
  }

  /**
   * 重置统计窗口
   */
  private resetWindow(): void {
    this.failureCount = 0
    this.successCount = 0
    this.totalRequests = 0
    this.windowStartTime = Date.now()
  }
}

// ==================== 单例模式 ====================

let userRateLimiter: UserRateLimiter | null = null
const circuitBreakers: Map<string, CircuitBreaker> = new Map()

/**
 * 获取UserRateLimiter实例
 */
export function getUserRateLimiter(
  defaultConfig?: Partial<RateLimitConfig>,
  globalConfig?: Partial<RateLimitConfig>
): UserRateLimiter {
  if (!userRateLimiter) {
    userRateLimiter = new UserRateLimiter(
      {
        requestsPerSecond: defaultConfig?.requestsPerSecond || 10,
        burstCapacity: defaultConfig?.burstCapacity || 20
      },
      globalConfig ? {
        requestsPerSecond: globalConfig.requestsPerSecond || 50,
        burstCapacity: globalConfig.burstCapacity || 100
      } : undefined
    )
  }
  return userRateLimiter
}

/**
 * 获取或创建CircuitBreaker实例
 * @param name 熔断器名称（通常对应服务名）
 * @param config 配置选项
 */
export function getCircuitBreaker(
  name: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  let cb = circuitBreakers.get(name)

  if (!cb) {
    cb = new CircuitBreaker(config || {})
    circuitBreakers.set(name, cb)
  }

  return cb
}

export { TokenBucketRateLimiter, UserRateLimiter, CircuitBreaker }
