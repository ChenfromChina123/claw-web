import { getAgentColorMap } from '../../bootstrap/state.js'
import type { Theme } from '../../utils/theme.js'

/**
 * 代理颜色名称类型定义
 */
export type AgentColorName =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'pink'
  | 'cyan'

/**
 * 代理颜色名称常量数组
 */
export const AGENT_COLORS: readonly AgentColorName[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'pink',
  'cyan',
] as const

/**
 * 代理颜色到主题颜色的映射
 */
export const AGENT_COLOR_TO_THEME_COLOR = {
  red: 'red_FOR_SUBAGENTS_ONLY',
  blue: 'blue_FOR_SUBAGENTS_ONLY',
  green: 'green_FOR_SUBAGENTS_ONLY',
  yellow: 'yellow_FOR_SUBAGENTS_ONLY',
  purple: 'purple_FOR_SUBAGENTS_ONLY',
  orange: 'orange_FOR_SUBAGENTS_ONLY',
  pink: 'pink_FOR_SUBAGENTS_ONLY',
  cyan: 'cyan_FOR_SUBAGENTS_ONLY',
} as const satisfies Record<AgentColorName, keyof Theme>

/**
 * 获取代理类型的颜色对应的主题颜色键
 * @param agentType 代理类型名称
 * @returns 主题颜色键或 undefined（如果是通用代理）
 */
export function getAgentColor(agentType: string): keyof Theme | undefined {
  if (agentType === 'general-purpose') {
    return undefined
  }

  const agentColorMap = getAgentColorMap()

  // 检查颜色是否已分配
  const existingColor = agentColorMap.get(agentType)
  if (existingColor && AGENT_COLORS.includes(existingColor)) {
    return AGENT_COLOR_TO_THEME_COLOR[existingColor]
  }

  return undefined
}

/**
 * 为代理类型设置颜色
 * @param agentType 代理类型名称
 * @param color 颜色名称或 undefined（清除颜色）
 */
export function setAgentColor(
  agentType: string,
  color: AgentColorName | undefined,
): void {
  const agentColorMap = getAgentColorMap()

  if (!color) {
    agentColorMap.delete(agentType)
    return
  }

  if (AGENT_COLORS.includes(color)) {
    agentColorMap.set(agentType, color)
  }
}
