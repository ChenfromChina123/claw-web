/**
 * Tungsten Tool - 远程功能占位符
 * 
 * 注意: 这个工具在本地恢复构建中不可用。
 * 在完整版本中，Tungsten 提供了远程 API 调用和状态同步功能。
 */

import { z } from 'zod/v4'

const inputSchema = z.object({}).passthrough()

// 会话状态跟踪
interface TungstenSession {
  agentId: string
  createdAt: Date
  lastActivity: Date
  endpoint?: string
}

const tungstenSessions = new Map<string, TungstenSession>()

/**
 * 获取活跃的 Tungsten 会话数
 */
export function getTungstenSessionCount(): number {
  return tungstenSessions.size
}

/**
 * 获取所有 Tungsten 会话
 */
export function getTungstenSessions(): TungstenSession[] {
  return Array.from(tungstenSessions.values())
}

/**
 * 清除使用了 Tungsten 的会话记录
 * 
 * 用于资源清理和会话管理。
 * 当会话结束时调用此函数以释放相关资源。
 */
export function clearSessionsWithTungstenUsage(): void {
  const clearedCount = tungstenSessions.size
  tungstenSessions.clear()
  console.log(`[TungstenTool] 已清除 ${clearedCount} 个 Tungsten 会话记录`)
}

/**
 * 重置初始化状态
 * 
 * 用于测试或重新初始化场景。
 * 调用后会清除所有会话状态和缓存。
 */
export function resetInitializationState(): void {
  // 清除所有会话
  tungstenSessions.clear()
  
  // 重置可能的缓存
  console.log('[TungstenTool] 初始化状态已重置')
}

/**
 * 注册一个 Tungsten 会话（内部使用）
 */
export function registerTungstenSession(agentId: string, endpoint?: string): string {
  const sessionId = `tungsten_${agentId}_${Date.now()}`
  tungstenSessions.set(sessionId, {
    agentId,
    createdAt: new Date(),
    lastActivity: new Date(),
    endpoint,
  })
  return sessionId
}

/**
 * 更新会话最后活动时间（内部使用）
 */
export function touchTungstenSession(sessionId: string): void {
  const session = tungstenSessions.get(sessionId)
  if (session) {
    session.lastActivity = new Date()
  }
}

export const TungstenTool = {
  name: 'tungsten',
  aliases: [],
  maxResultSizeChars: 0,
  inputSchema,
  async description() {
    return 'Unavailable in this local recovery build. Tungsten provides remote API calls and state synchronization in the full version.'
  },
  async prompt() {
    return 'TungstenTool is unavailable in this local recovery build. In the full version, this tool provides:\n- Remote API calls\n- State synchronization across instances\n- Distributed session management'
  },
  async call() {
    return {
      data: {
        success: false,
        error: 'TungstenTool is unavailable in this local recovery build.',
        sessions: getTungstenSessionCount(),
        hint: 'To enable Tungsten features, deploy with remote support.',
      },
    }
  },
  isConcurrencySafe() {
    return true
  },
  isEnabled() {
    return false
  },
  isReadOnly() {
    return true
  },
  async checkPermissions() {
    return {
      behavior: 'deny' as const,
      message: 'TungstenTool is unavailable in this local recovery build.',
    }
  },
}
