/**
 * Feature Flags 系统
 * 
 * 提供灵活的 Feature Flag 管理，支持：
 * - 特性开关控制
 * - 实验性功能启用
 * - A/B 测试支持
 * - 用户群体定向
 */

import { v4 as uuidv4 } from 'uuid'

// ==================== 类型定义 ====================

/**
 * Feature Flag 值类型
 */
export type FeatureFlagValue = boolean | string | number | object | null

/**
 * Feature Flag 类型
 */
export enum FeatureFlagType {
  BOOLEAN = 'boolean',
  STRING = 'string',
  NUMBER = 'number',
  JSON = 'json'
}

/**
 * Feature Flag 目标群体
 */
export interface FeatureFlagTarget {
  userIds?: string[]
  roles?: string[]
  sessions?: string[]
  percentage?: number
}

/**
 * Feature Flag 配置
 */
export interface FeatureFlagConfig {
  key: string
  description?: string
  defaultValue: FeatureFlagValue
  type: FeatureFlagType
  enabled?: boolean
  targets?: FeatureFlagTarget
  metadata?: Record<string, unknown>
  rolloutPercentage?: number
}

/**
 * Feature Flag 状态
 */
export interface FeatureFlagState {
  key: string
  value: FeatureFlagValue
  source: 'default' | 'override' | 'target' | 'rollout'
  timestamp: Date
  context?: {
    userId?: string
    role?: string
    sessionId?: string
  }
}

/**
 * Feature Flag 变更事件
 */
export interface FeatureFlagChangeEvent {
  key: string
  oldValue: FeatureFlagValue
  newValue: FeatureFlagValue
  source: 'default' | 'override' | 'target' | 'rollout' | 'deleted'
  timestamp: Date
}

/**
 * Feature Flag 评估上下文
 */
export interface FlagEvaluationContext {
  userId?: string
  role?: string
  sessionId?: string
  ip?: string
  userAgent?: string
  metadata?: Record<string, unknown>
}

// ==================== Feature Flag 定义 ====================

/**
 * 内置 Feature Flags 定义
 */
export const BUILTIN_FEATURE_FLAGS: FeatureFlagConfig[] = [
  {
    key: 'BUILTIN_EXPLORE_PLAN_AGENTS',
    description: '启用内置 Explore 和 Plan Agent',
    defaultValue: true,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'COORDINATOR_MODE',
    description: '启用 Agent 协调者模式',
    defaultValue: false,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'FORK_SUBAGENT',
    description: '启用 Fork 子代理功能',
    defaultValue: true,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'KAIROS',
    description: '启用 Kairos 时间感知功能',
    defaultValue: false,
    type: FeatureFlagType.BOOLEAN,
    enabled: false
  },
  {
    key: 'PROACTIVE',
    description: '启用主动 Agent 模式',
    defaultValue: false,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'VERIFICATION_AGENT',
    description: '启用验证 Agent',
    defaultValue: true,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'AGENT_MEMORY_SNAPSHOT',
    description: '启用 Agent 记忆快照',
    defaultValue: true,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'TRANSCRIPT_CLASSIFIER',
    description: '启用对话转录分类器',
    defaultValue: false,
    type: FeatureFlagType.BOOLEAN,
    enabled: false
  },
  {
    key: 'PROMPT_CACHE_BREAK_DETECTION',
    description: '启用 Prompt 缓存破坏检测',
    defaultValue: true,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'MONITOR_TOOL',
    description: '启用监控工具',
    defaultValue: true,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'AUTO_BACKGROUND',
    description: '启用自动后台执行',
    defaultValue: true,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'CONTEXT_ISOLATION',
    description: '启用上下文隔离',
    defaultValue: false,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'TOOL_WHITELIST',
    description: '启用工具白名单模式',
    defaultValue: false,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'MCP_VALIDATION',
    description: '启用 MCP 服务器验证',
    defaultValue: true,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'ERROR_RECOVERY',
    description: '启用错误恢复机制',
    defaultValue: true,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  },
  {
    key: 'PERFORMANCE_OPTIMIZATION',
    description: '启用性能优化',
    defaultValue: true,
    type: FeatureFlagType.BOOLEAN,
    enabled: true
  }
]

// ==================== Feature Flag 管理器 ====================

/**
 * Feature Flag 管理器
 */
export class FeatureFlagManager {
  private flags: Map<string, FeatureFlagConfig> = new Map()
  private overrides: Map<string, FeatureFlagValue> = new Map()
  private history: FeatureFlagChangeEvent[] = []
  private maxHistorySize: number = 1000
  private listeners: Map<string, Set<(event: FeatureFlagChangeEvent) => void>> = new Map()
  private evaluationCache: Map<string, { value: FeatureFlagValue; expiry: number }> = new Map()
  private cacheTtlMs: number = 5000

  constructor(initialFlags?: FeatureFlagConfig[]) {
    // 注册内置 Flags
    for (const flag of BUILTIN_FEATURE_FLAGS) {
      this.register(flag)
    }

    // 注册额外的初始 Flags
    if (initialFlags) {
      for (const flag of initialFlags) {
        this.register(flag)
      }
    }
  }

  // ==================== 注册与管理 ====================

  /**
   * 注册 Feature Flag
   */
  register(config: FeatureFlagConfig): void {
    this.flags.set(config.key, {
      enabled: true,
      ...config
    })
    this.emitChange({
      key: config.key,
      oldValue: undefined as unknown as FeatureFlagValue,
      newValue: config.defaultValue,
      source: 'default',
      timestamp: new Date()
    })
  }

  /**
   * 批量注册 Feature Flags
   */
  registerMany(configs: FeatureFlagConfig[]): void {
    for (const config of configs) {
      this.register(config)
    }
  }

  /**
   * 注销 Feature Flag
   */
  unregister(key: string): boolean {
    const flag = this.flags.get(key)
    if (flag) {
      this.flags.delete(key)
      this.overrides.delete(key)
      this.emitChange({
        key,
        oldValue: flag.defaultValue,
        newValue: undefined as unknown as FeatureFlagValue,
        source: 'deleted',
        timestamp: new Date()
      })
      return true
    }
    return false
  }

  /**
   * 检查 Flag 是否存在
   */
  has(key: string): boolean {
    return this.flags.has(key)
  }

  /**
   * 获取 Flag 配置
   */
  getConfig(key: string): FeatureFlagConfig | undefined {
    return this.flags.get(key)
  }

  /**
   * 获取所有 Flag 配置
   */
  getAllConfigs(): FeatureFlagConfig[] {
    return Array.from(this.flags.values())
  }

  // ==================== 值获取与设置 ====================

  /**
   * 获取 Flag 值
   */
  get(key: string, context?: FlagEvaluationContext): FeatureFlagValue {
    // 检查缓存
    const cacheKey = this.getCacheKey(key, context)
    const cached = this.evaluationCache.get(cacheKey)
    if (cached && cached.expiry > Date.now()) {
      return cached.value
    }

    const flag = this.flags.get(key)
    if (!flag) {
      return undefined as unknown as FeatureFlagValue
    }

    let value: FeatureFlagValue
    let source: FeatureFlagState['source'] = 'default'

    // 1. 检查是否覆盖
    if (this.overrides.has(key)) {
      value = this.overrides.get(key)!
      source = 'override'
    }
    // 2. 检查目标群体
    else if (flag.targets && context) {
      const targetedValue = this.evaluateTarget(flag, context)
      if (targetedValue !== undefined) {
        value = targetedValue
        source = 'target'
      } else {
        value = flag.defaultValue
      }
    }
    // 3. 检查百分比 rollout
    else if (flag.rolloutPercentage !== undefined && context?.sessionId) {
      const hash = this.hashSession(context.sessionId)
      const inRollout = (hash % 100) < flag.rolloutPercentage
      value = inRollout ? true : flag.defaultValue
      source = 'rollout'
    }
    // 4. 默认值
    else {
      value = flag.enabled ? flag.defaultValue : false
    }

    // 缓存结果
    this.evaluationCache.set(cacheKey, {
      value,
      expiry: Date.now() + this.cacheTtlMs
    })

    return value
  }

  /**
   * 获取布尔值
   */
  isEnabled(key: string, context?: FlagEvaluationContext): boolean {
    const value = this.get(key, context)
    return value === true
  }

  /**
   * 设置覆盖值
   */
  setOverride(key: string, value: FeatureFlagValue): boolean {
    const flag = this.flags.get(key)
    if (!flag) {
      return false
    }

    const oldValue = this.overrides.has(key) ? this.overrides.get(key) : flag.defaultValue
    this.overrides.set(key, value)

    // 清除相关缓存
    this.clearCache(key)

    this.emitChange({
      key,
      oldValue,
      newValue: value,
      source: 'override',
      timestamp: new Date()
    })

    return true
  }

  /**
   * 清除覆盖值
   */
  clearOverride(key: string): boolean {
    if (!this.overrides.has(key)) {
      return false
    }

    const flag = this.flags.get(key)
    const oldValue = this.overrides.get(key)

    this.overrides.delete(key)
    this.clearCache(key)

    if (flag) {
      this.emitChange({
        key,
        oldValue,
        newValue: flag.defaultValue,
        source: 'default',
        timestamp: new Date()
      })
    }

    return true
  }

  /**
   * 清除所有覆盖值
   */
  clearAllOverrides(): void {
    const keys = Array.from(this.overrides.keys())
    for (const key of keys) {
      this.clearOverride(key)
    }
  }

  // ==================== 事件系统 ====================

  /**
   * 监听 Flag 变更
   */
  on(key: string, callback: (event: FeatureFlagChangeEvent) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set())
    }
    this.listeners.get(key)!.add(callback)
    return () => { this.listeners.get(key)?.delete(callback) }
  }

  /**
   * 监听所有变更
   */
  onAny(callback: (event: FeatureFlagChangeEvent) => void): () => void {
    return this.on('*', callback)
  }

  /**
   * 触发变更事件
   */
  private emitChange(event: FeatureFlagChangeEvent): void {
    // 添加到历史
    this.history.unshift(event)
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize)
    }

    // 触发特定 Flag 监听器
    this.listeners.get(event.key)?.forEach(cb => {
      try {
        cb(event)
      } catch (error) {
        console.error(`[FeatureFlags] 监听器执行失败:`, error)
      }
    })

    // 触发通配符监听器
    this.listeners.get('*')?.forEach(cb => {
      try {
        cb(event)
      } catch (error) {
        console.error(`[FeatureFlags] 通配符监听器执行失败:`, error)
      }
    })
  }

  // ==================== 工具方法 ====================

  /**
   * 获取变更历史
   */
  getHistory(key?: string, limit: number = 50): FeatureFlagChangeEvent[] {
    const history = key
      ? this.history.filter(h => h.key === key)
      : this.history
    return history.slice(0, limit)
  }

  /**
   * 清除变更历史
   */
  clearHistory(): void {
    this.history = []
  }

  /**
   * 清除评估缓存
   */
  clearCache(key?: string): void {
    if (key) {
      const prefix = `${key}:`
      for (const k of this.evaluationCache.keys()) {
        if (k.startsWith(prefix)) {
          this.evaluationCache.delete(k)
        }
      }
    } else {
      this.evaluationCache.clear()
    }
  }

  /**
   * 获取当前状态
   */
  getState(key: string, context?: FlagEvaluationContext): FeatureFlagState | undefined {
    const flag = this.flags.get(key)
    if (!flag) {
      return undefined
    }

    let value: FeatureFlagValue
    let source: FeatureFlagState['source']

    if (this.overrides.has(key)) {
      value = this.overrides.get(key)!
      source = 'override'
    } else {
      value = this.get(key, context)
      source = 'target'
    }

    return {
      key,
      value,
      source,
      timestamp: new Date(),
      context: context ? {
        userId: context.userId,
        role: context.role,
        sessionId: context.sessionId
      } : undefined
    }
  }

  /**
   * 获取所有状态
   */
  getAllStates(context?: FlagEvaluationContext): FeatureFlagState[] {
    return Array.from(this.flags.keys()).map(key => this.getState(key, context)!)
  }

  /**
   * 导出配置
   */
  export(): {
    flags: FeatureFlagConfig[]
    overrides: Record<string, FeatureFlagValue>
  } {
    return {
      flags: this.getAllConfigs(),
      overrides: Object.fromEntries(this.overrides)
    }
  }

  /**
   * 导入配置
   */
  import(config: {
    flags?: FeatureFlagConfig[]
    overrides?: Record<string, FeatureFlagValue>
  }): void {
    if (config.flags) {
      for (const flag of config.flags) {
        this.register(flag)
      }
    }

    if (config.overrides) {
      for (const [key, value] of Object.entries(config.overrides)) {
        this.setOverride(key, value)
      }
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 评估目标群体
   */
  private evaluateTarget(
    flag: FeatureFlagConfig,
    context: FlagEvaluationContext
  ): FeatureFlagValue | undefined {
    if (!flag.targets) {
      return undefined
    }

    const targets = flag.targets

    // 检查用户 ID
    if (targets.userIds?.length && context.userId) {
      if (targets.userIds.includes(context.userId)) {
        return flag.defaultValue
      }
    }

    // 检查角色
    if (targets.roles?.length && context.role) {
      if (targets.roles.includes(context.role)) {
        return flag.defaultValue
      }
    }

    // 检查会话
    if (targets.sessions?.length && context.sessionId) {
      if (targets.sessions.includes(context.sessionId)) {
        return flag.defaultValue
      }
    }

    // 检查百分比
    if (targets.percentage !== undefined && context.sessionId) {
      const hash = this.hashSession(context.sessionId)
      if ((hash % 100) < targets.percentage) {
        return flag.defaultValue
      }
    }

    return undefined
  }

  /**
   * 获取缓存键
   */
  private getCacheKey(key: string, context?: FlagEvaluationContext): string {
    if (!context) {
      return key
    }
    return `${key}:${context.userId || ''}:${context.sessionId || ''}`
  }

  /**
   * 会话哈希
   */
  private hashSession(sessionId: string): number {
    let hash = 0
    for (let i = 0; i < sessionId.length; i++) {
      const char = sessionId.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash)
  }
}

// ==================== 全局实例 ====================

let featureFlagManager: FeatureFlagManager | null = null

export function getFeatureFlagManager(): FeatureFlagManager {
  if (!featureFlagManager) {
    featureFlagManager = new FeatureFlagManager()
  }
  return featureFlagManager
}

export function initializeFeatureFlags(configs?: FeatureFlagConfig[]): FeatureFlagManager {
  featureFlagManager = new FeatureFlagManager(configs)
  return featureFlagManager
}

// ==================== 便捷函数 ====================

/**
 * 检查特性是否启用
 */
export function isFeatureEnabled(key: string, context?: FlagEvaluationContext): boolean {
  return getFeatureFlagManager().isEnabled(key, context)
}

/**
 * 获取特性值
 */
export function getFeatureValue<T = FeatureFlagValue>(key: string, context?: FlagEvaluationContext): T {
  return getFeatureFlagManager().get(key, context) as T
}

/**
 * 设置特性覆盖值
 */
export function setFeatureOverride(key: string, value: FeatureFlagValue): boolean {
  return getFeatureFlagManager().setOverride(key, value)
}

/**
 * 清除特性覆盖值
 */
export function clearFeatureOverride(key: string): boolean {
  return getFeatureFlagManager().clearOverride(key)
}

// ==================== 导出 ====================

export type {
  FeatureFlagConfig,
  FeatureFlagState,
  FeatureFlagChangeEvent,
  FeatureFlagTarget,
  FlagEvaluationContext
}
