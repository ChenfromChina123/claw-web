/**
 * Claude Code HAHA - PTY Session Manager (Master 端纯转发层)
 *
 * 职责：
 * - 提供与旧版兼容的 API 接口
 * - 清理连接断开时的会话
 * - 不再直接创建 PTY（违反架构隔离原则）
 *
 * 架构原则：
 * - Master 禁止创建 PTY（违反隔离架构）
 * - 所有 PTY 创建/写入/销毁必须通过 wsPTYBridge → WorkerForwarder → Worker
 * - 此模块仅用于 wsBridge 的连接清理回调兼容
 */

// ==================== PTY Manager (Master 端纯转发层) ====================

// 懒加载 wsPTYBridge 以避免循环依赖
const getWsPTYBridge = () => {
  const { wsPTYBridge } = require('./wsPTYBridge')
  return wsPTYBridge
}

export interface PTYSession {
  id: string
  connectionId: string
  userId: string | null
  cwd: string
  shell: string
  createdAt: number
  lastActiveAt: number
  cols: number
  rows: number
  isAlive: boolean
}

export interface PTYCreateOptions {
  connectionId: string
  userId?: string
  shell?: 'powershell' | 'cmd' | 'bash' | 'auto'
  cwd?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
  enableIsolation?: boolean
  userRoot?: string
  strictMode?: boolean
}

export interface PTYOutput {
  sessionId: string
  data: string
  type: 'stdout' | 'stderr' | 'exit'
  exitCode?: number
}

type PTYEventCallback = (output: PTYOutput) => void

// ==================== PTY Session Manager (Pure Proxy Layer) ====================

export class PTYSessionManager {
  /**
   * 创建新的 PTY 会话
   * @deprecated 此方法已废弃，应该使用 wsPTYBridge 通过 WorkerForwarder 转发到 Worker
   */
  createSession(options: PTYCreateOptions): PTYSession {
    console.warn('[PTY] createSession 已废弃：请使用 wsPTYBridge 通过 WorkerForwarder 转发到 Worker')
    throw new Error('Master 禁止直接创建 PTY，请使用 wsPTYBridge.createPTY() 转发到 Worker')
  }

  /**
   * 处理 PTY 输出
   * @deprecated 不再使用
   */
  private handleOutput(sessionId: string, type: 'stdout' | 'stderr' | 'exit', data: string, exitCode?: number): void {
    // 此方法不再使用
  }

  /**
   * 发送输入到 PTY
   * @deprecated 请使用 wsPTYBridge 转发到 Worker
   */
  write(sessionId: string, data: string): boolean {
    console.warn('[PTY] write 已废弃：请使用 wsPTYBridge 转发到 Worker')
    return false
  }

  /**
   * 调整终端尺寸
   * @deprecated 请使用 wsPTYBridge 转发到 Worker
   */
  resize(sessionId: string, cols: number, rows: number): boolean {
    console.warn('[PTY] resize 已废弃：请使用 wsPTYBridge 转发到 Worker')
    return false
  }

  /**
   * 获取会话
   * @deprecated 请使用 wsPTYBridge 管理会话
   */
  getSession(sessionId: string): PTYSession | undefined {
    console.warn('[PTY] getSession 已废弃：请使用 wsPTYBridge 管理会话')
    return undefined
  }

  /**
   * 获取连接的所有会话
   * @deprecated 请使用 wsPTYBridge 管理会话
   */
  getConnectionSessions(connectionId: string): PTYSession[] {
    console.warn('[PTY] getConnectionSessions 已废弃：请使用 wsPTYBridge 管理会话')
    return []
  }

  /**
   * 获取用户的所有会话
   * @deprecated 请使用 wsPTYBridge 管理会话
   */
  getSessionsForUser(userId: string): PTYSession[] {
    console.warn('[PTY] getSessionsForUser 已废弃：请使用 wsPTYBridge 管理会话')
    return []
  }

  /**
   * 校验会话是否属于指定用户
   * @deprecated 请使用 wsPTYBridge 管理会话
   */
  sessionBelongsToUser(sessionId: string, userId: string): boolean {
    console.warn('[PTY] sessionBelongsToUser 已废弃：请使用 wsPTYBridge 管理会话')
    return false
  }

  /**
   * 销毁会话
   * @deprecated 请使用 wsPTYBridge 转发到 Worker 销毁
   */
  destroySession(sessionId: string): boolean {
    console.warn('[PTY] destroySession 已废弃：请使用 wsPTYBridge 转发到 Worker 销毁')
    return false
  }

  /**
   * 销毁连接的所有会话
   * 此方法保留用于 wsBridge 的连接清理回调
   */
  destroyConnectionSessions(connectionId: string): number {
    // 通知 wsPTYBridge 清理该连接的会话
    getWsPTYBridge().cleanupConnection(connectionId)
    console.log(`[PTY] 清理连接 ${connectionId} 的所有会话`)
    return 0
  }

  /**
   * 注册输出回调
   * @deprecated 请使用 wsPTYBridge 管理输出转发
   */
  onOutput(sessionId: string, callback: PTYEventCallback): void {
    console.warn('[PTY] onOutput 已废弃：请使用 wsPTYBridge 管理输出转发')
  }

  /**
   * 取消注册输出回调
   * @deprecated 请使用 wsPTYBridge 管理输出转发
   */
  offOutput(sessionId: string): void {
    console.warn('[PTY] offOutput 已废弃：请使用 wsPTYBridge 管理输出转发')
  }

  /**
   * 执行单条命令
   * @deprecated 请使用 wsPTYBridge 转发到 Worker 执行
   */
  async executeCommand(
    command: string,
    options: { cwd?: string; shell?: string; timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    console.warn('[PTY] executeCommand 已废弃：请使用 wsPTYBridge 转发到 Worker 执行')
    throw new Error('Master 禁止直接执行命令，请使用 wsPTYBridge.executeCommand() 转发到 Worker')
  }

  /**
   * 清理空闲会话
   * @deprecated 不再使用
   */
  private cleanupIdleSessions(): void {
    // 不再需要清理空闲会话
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalSessions: number
    aliveSessions: number
    connections: number
    secureTerminals: number
    activeUsers: number
  } {
    return {
      totalSessions: 0,
      aliveSessions: 0,
      connections: 0,
      secureTerminals: 0,
      activeUsers: 0,
    }
  }

  /**
   * 获取审计日志
   */
  getAuditLog(options?: { sessionId?: string; userId?: string; limit?: number }): any[] {
    return []
  }

  /**
   * 关闭并清理所有会话
   */
  shutdown(): void {
    console.log('[PTY] Shutting down PTY manager (pure proxy mode)...')
    console.log('[PTY] PTY manager shutdown complete')
  }
}

// ==================== Singleton Instance ====================

export const ptyManager = new PTYSessionManager()
