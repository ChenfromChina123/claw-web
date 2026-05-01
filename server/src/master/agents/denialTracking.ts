/**
 * Denial Tracking - 自适应降级机制
 *
 * 监控权限拒绝的频率，当连续拒绝次数超过阈值时
 * 自动降级到更安全的决策模式（如从自动拒绝降级到用户确认）
 *
 * 设计参考 Claude Code 的 Denial Tracking 机制：
 * - 连续被拒 3 次 → 降级到用户确认
 * - 总共被拒 20 次 → 降级到用户确认
 */

export interface DenialTrackingState {
  consecutiveDenials: number
  totalDenials: number
  lastDeniedTool?: string
  lastDeniedReason?: string
}

export const DENIAL_LIMITS = {
  maxConsecutive: 3,
  maxTotal: 20,
}

export function createDenialState(): DenialTrackingState {
  return {
    consecutiveDenials: 0,
    totalDenials: 0,
  }
}

/**
 * 记录一次拒绝
 */
export function recordDenial(
  state: DenialTrackingState,
  toolName?: string,
  reason?: string
): DenialTrackingState {
  return {
    ...state,
    consecutiveDenials: state.consecutiveDenials + 1,
    totalDenials: state.totalDenials + 1,
    lastDeniedTool: toolName,
    lastDeniedReason: reason,
  }
}

/**
 * 记录一次成功执行（重置连续拒绝计数）
 */
export function recordSuccess(state: DenialTrackingState): DenialTrackingState {
  if (state.consecutiveDenials === 0) return state
  return { ...state, consecutiveDenials: 0 }
}

/**
 * 判断是否应该降级到用户确认模式
 */
export function shouldFallbackToPrompting(state: DenialTrackingState): boolean {
  return (
    state.consecutiveDenials >= DENIAL_LIMITS.maxConsecutive ||
    state.totalDenials >= DENIAL_LIMITS.maxTotal
  )
}

/**
 * 获取降级原因描述
 */
export function getFallbackReason(state: DenialTrackingState): string | null {
  if (state.consecutiveDenials >= DENIAL_LIMITS.maxConsecutive) {
    return `连续 ${state.consecutiveDenials} 次工具调用被拒绝，可能存在误判，建议人工确认`
  }
  if (state.totalDenials >= DENIAL_LIMITS.maxTotal) {
    return `累计 ${state.totalDenials} 次工具调用被拒绝，建议人工确认`
  }
  return null
}
