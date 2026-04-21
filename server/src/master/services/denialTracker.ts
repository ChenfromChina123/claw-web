/**
 * 拒绝跟踪服务
 * 
 * 参考 Claude Code 实现：
 * - src/utils/permissions/denialTracking.ts
 * - src/utils/permissions/classifierDecision.ts
 * 
 * 功能：
 * - 跟踪工具调用的拒绝次数
 * - 防止无限拒绝循环
 * - 自动切换到询问模式
 */

import { getPermissionPipeline, type PermissionBehavior } from './permissionPipeline'

// ==================== 拒绝跟踪配置 ====================

export interface DenialTrackingConfig {
  /** 最大连续拒绝次数 */
  maxConsecutiveDenials: number
  /** 最大总拒绝次数 */
  maxTotalDenials: number
  /** 重置窗口时间（毫秒） */
  resetWindowMs: number
  /** 超过限制后切换到询问模式 */
  fallbackToAskingOnLimit: boolean
}

export const DEFAULT_DENIAL_TRACKING_CONFIG: DenialTrackingConfig = {
  maxConsecutiveDenials: 5,
  maxTotalDenials: 15,
  resetWindowMs: 5 * 60 * 1000,  // 5 分钟
  fallbackToAskingOnLimit: true,
}

// ==================== 拒绝跟踪状态 ====================

export interface DenialTrackingState {
  /** 会话 ID */
  sessionId: string
  /** 连续拒绝次数 */
  consecutiveDenials: number
  /** 总拒绝次数 */
  totalDenials: number
  /** 上次拒绝时间 */
  lastDenialTime: number
  /** 成功次数 */
  successCount: number
  /** 上次成功时间 */
  lastSuccessTime: number
  /** 是否已触发回退模式 */
  hasFallbackTriggered: boolean
  /** 创建时间 */
  createdAt: number
}

// ==================== 拒绝记录 ====================

export interface DenialRecord {
  /** 工具名称 */
  toolName: string
  /** 拒绝时间 */
  timestamp: number
  /** 拒绝原因 */
  reason: string
  /** 会话 ID */
  sessionId: string
}

// ==================== 回退决策 ====================

export interface FallbackDecision {
  /** 是否触发回退 */
  shouldFallback: boolean
  /** 当前状态 */
  state: DenialTrackingState
  /** 原因 */
  reason?: string
  /** 建议的行为 */
  suggestedBehavior: PermissionBehavior
}

// ==================== 拒绝跟踪器类 ====================

export class DenialTracker {
  private config: DenialTrackingConfig
  private states: Map<string, DenialTrackingState> = new Map()
  private denialHistory: DenialRecord[] = []
  private maxHistorySize = 500
  private listeners: Array<(state: DenialTrackingState, sessionId: string) => void> = []

  constructor(config: Partial<DenialTrackingConfig> = {}) {
    this.config = { ...DEFAULT_DENIAL_TRACKING_CONFIG, ...config }
  }

  /**
   * 获取会话的跟踪状态
   */
  getState(sessionId: string): DenialTrackingState {
    return this.states.get(sessionId) || this.createInitialState(sessionId)
  }

  /**
   * 记录拒绝
   */
  recordDenial(
    sessionId: string,
    toolName: string,
    reason: string = 'Unknown'
  ): DenialTrackingState {
    let state = this.getState(sessionId)
    
    // 检查是否需要重置
    if (this.shouldReset(state)) {
      state = this.resetState(state)
    }
    
    // 更新状态
    state.consecutiveDenials++
    state.totalDenials++
    state.lastDenialTime = Date.now()
    
    // 保存状态
    this.states.set(sessionId, state)
    
    // 记录历史
    this.denialHistory.push({
      toolName,
      timestamp: Date.now(),
      reason,
      sessionId,
    })
    
    // 限制历史大小
    if (this.denialHistory.length > this.maxHistorySize) {
      this.denialHistory = this.denialHistory.slice(-this.maxHistorySize)
    }
    
    // 检查是否超过限制
    const fallbackDecision = this.checkFallback(state)
    if (fallbackDecision.shouldFallback) {
      console.warn(
        `[DenialTracker] 会话 ${sessionId} 拒绝次数超限: ` +
        `连续=${state.consecutiveDenials}, 总计=${state.totalDenials}`
      )
    }
    
    // 通知监听器
    this.notifyListeners(state, sessionId)
    
    return state
  }

  /**
   * 记录成功
   */
  recordSuccess(sessionId: string): DenialTrackingState {
    let state = this.getState(sessionId)
    
    state.consecutiveDenials = 0
    state.successCount++
    state.lastSuccessTime = Date.now()
    
    // 如果之前触发了回退，保持状态
    // 等待用户明确允许后才重置
    
    this.states.set(sessionId, state)
    
    this.notifyListeners(state, sessionId)
    
    return state
  }

  /**
   * 检查是否应该回退到询问模式
   */
  checkFallback(state: DenialTrackingState): FallbackDecision {
    const consecutiveExceeded = state.consecutiveDenials >= this.config.maxConsecutiveDenials
    const totalExceeded = state.totalDenials >= this.config.maxTotalDenials
    
    if (consecutiveExceeded || totalExceeded) {
      return {
        shouldFallback: true,
        state,
        reason: consecutiveExceeded
          ? `连续拒绝次数 ${state.consecutiveDenials} 超过限制 ${this.config.maxConsecutiveDenials}`
          : `总拒绝次数 ${state.totalDenials} 超过限制 ${this.config.maxTotalDenials}`,
        suggestedBehavior: 'ask',
      }
    }
    
    return {
      shouldFallback: false,
      state,
      suggestedBehavior: 'allow',
    }
  }

  /**
   * 根据拒绝状态决定权限行为
   */
  decideBehavior(sessionId: string, baseBehavior: PermissionBehavior): {
    behavior: PermissionBehavior
    reason: string
    fromFallback: boolean
  } {
    const state = this.getState(sessionId)
    const fallbackDecision = this.checkFallback(state)
    
    if (fallbackDecision.shouldFallback && this.config.fallbackToAskingOnLimit) {
      // 超过限制，切换到询问模式
      return {
        behavior: 'ask',
        reason: `拒绝次数超限，切换到询问模式: ${fallbackDecision.reason}`,
        fromFallback: true,
      }
    }
    
    return {
      behavior: baseBehavior,
      reason: '正常权限决策',
      fromFallback: false,
    }
  }

  /**
   * 清除会话状态
   */
  clearSession(sessionId: string): void {
    this.states.delete(sessionId)
  }

  /**
   * 重置会话状态
   */
  resetSession(sessionId: string): DenialTrackingState {
    const state = this.createInitialState(sessionId)
    this.states.set(sessionId, state)
    return state
  }

  /**
   * 获取会话的拒绝历史
   */
  getDenialHistory(sessionId?: string, limit: number = 50): DenialRecord[] {
    if (sessionId) {
      return this.denialHistory
        .filter(r => r.sessionId === sessionId)
        .slice(-limit)
    }
    return this.denialHistory.slice(-limit)
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalSessions: number
    activeSessions: number
    totalDenials: number
    averageDenials: number
    mostDeniedTools: Array<{ tool: string; count: number }>
  } {
    const sessions = Array.from(this.states.entries())
    let totalDenials = 0
    const toolCounts: Record<string, number> = {}
    
    for (const [, state] of sessions) {
      totalDenials += state.totalDenials
    }
    
    for (const record of this.denialHistory) {
      toolCounts[record.toolName] = (toolCounts[record.toolName] || 0) + 1
    }
    
    const mostDeniedTools = Object.entries(toolCounts)
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
    
    return {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(([, s]) => s.totalDenials > 0).length,
      totalDenials,
      averageDenials: sessions.length > 0 ? totalDenials / sessions.length : 0,
      mostDeniedTools,
    }
  }

  /**
   * 添加状态变更监听器
   */
  addListener(listener: (state: DenialTrackingState, sessionId: string) => void): void {
    this.listeners.push(listener)
  }

  /**
   * 移除监听器
   */
  removeListener(listener: (state: DenialTrackingState, sessionId: string) => void): void {
    const index = this.listeners.indexOf(listener)
    if (index !== -1) {
      this.listeners.splice(index, 1)
    }
  }

  /**
   * 创建初始状态
   */
  private createInitialState(sessionId: string): DenialTrackingState {
    return {
      sessionId,
      consecutiveDenials: 0,
      totalDenials: 0,
      lastDenialTime: 0,
      successCount: 0,
      lastSuccessTime: Date.now(),
      hasFallbackTriggered: false,
      createdAt: Date.now(),
    }
  }

  /**
   * 检查是否应该重置状态
   */
  private shouldReset(state: DenialTrackingState): boolean {
    if (state.lastDenialTime === 0) return false
    
    const now = Date.now()
    const timeSinceLastDenial = now - state.lastDenialTime
    
    return timeSinceLastDenial > this.config.resetWindowMs
  }

  /**
   * 重置状态
   */
  private resetState(state: DenialTrackingState): DenialTrackingState {
    return {
      ...state,
      consecutiveDenials: 0,
      lastDenialTime: 0,
      hasFallbackTriggered: false,
    }
  }

  /**
   * 通知监听器
   */
  private notifyListeners(state: DenialTrackingState, sessionId: string): void {
    for (const listener of this.listeners) {
      try {
        listener(state, sessionId)
      } catch (error) {
        console.error('[DenialTracker] 监听器执行失败:', error)
      }
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<DenialTrackingConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前配置
   */
  getConfig(): DenialTrackingConfig {
    return { ...this.config }
  }
}

// ==================== 拒绝决策辅助函数 ====================

/**
 * 集成到权限决策流程
 */
export function integratedDenialCheck(
  denialTracker: DenialTracker,
  sessionId: string,
  toolName: string,
  permissionResult: { behavior: PermissionBehavior; reason?: string }
): {
  behavior: PermissionBehavior
  reason: string
  recorded: boolean
  fromDenialTracker: boolean
} {
  if (permissionResult.behavior === 'deny') {
    const state = denialTracker.recordDenial(sessionId, toolName, permissionResult.reason)
    const fallbackDecision = denialTracker.checkFallback(state)
    
    if (fallbackDecision.shouldFallback) {
      return {
        behavior: 'ask',
        reason: `拒绝次数过多 (${state.consecutiveDenials}/${DEFAULT_DENIAL_TRACKING_CONFIG.maxConsecutiveDenials})，切换到询问模式`,
        recorded: true,
        fromDenialTracker: true,
      }
    }
  } else if (permissionResult.behavior === 'allow') {
    denialTracker.recordSuccess(sessionId)
  }
  
  return {
    behavior: permissionResult.behavior,
    reason: permissionResult.reason || '',
    recorded: false,
    fromDenialTracker: false,
  }
}

// ==================== 单例导出 ====================

let denialTrackerInstance: DenialTracker | null = null

export function getDenialTracker(): DenialTracker {
  if (!denialTrackerInstance) {
    denialTrackerInstance = new DenialTracker()
  }
  return denialTrackerInstance
}

export default DenialTracker
