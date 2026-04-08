/**
 * usePTY.ts - 前端 PTY (Pseudo Terminal) 控制 hook
 * 
 * 功能：
 * - 通过 WebSocket 与后端 PTY 会话通信
 * - 支持创建/销毁 PTY 会话
 * - 支持输入/输出流
 * - 支持终端尺寸调整
 * - 支持 xterm.js 集成
 */

import { ref, shallowRef, onUnmounted } from 'vue'
import { wsClient } from './useWebSocket'
import { useAuthStore } from '@/stores/auth'

// ==================== Types ====================

export interface PTYSession {
  id: string
  shell: string
  cwd: string
  cols: number
  rows: number
  isAlive: boolean
}

export interface PTYOptions {
  shell?: 'powershell' | 'cmd' | 'bash' | 'auto'
  cwd?: string
  cols?: number
  rows?: number
  onOutput?: (data: string, type: 'stdout' | 'stderr' | 'exit', exitCode?: number) => void
}

export interface PTYStats {
  totalSessions: number
  aliveSessions: number
  connections: number
}

// ==================== usePTY Composable ====================

export function usePTY(options: PTYOptions = {}) {
  const sessionId = ref<string | null>(null)
  const isConnected = ref(false)
  const isConnecting = ref(false)
  const session = shallowRef<PTYSession | null>(null)
  const stats = ref<PTYStats | null>(null)
  const error = ref<string | null>(null)

  // ==================== Session Management ====================

  /**
   * 创建新的 PTY 会话
   */
  async function createSession(opts: PTYOptions = {}): Promise<string | null> {
    if (isConnecting.value) {
      console.warn('[PTY] Already connecting...')
      return null
    }

    isConnecting.value = true
    error.value = null

    try {
      // 等待 WebSocket 连接（与 Chat 共用单例，须带登录 token，避免子组件先于父组件连上导致匿名连接）
      if (!wsClient.isConnected.value) {
        const token = useAuthStore().token || undefined
        console.log('[PTY] WebSocket not connected, connecting...', token ? '(with token)' : '(anonymous)')
        await wsClient.connect(token)
      }

      const result = await wsClient.callRPC<{
        success: boolean
        sessionId: string
        shell: string
        cwd: string
        cols: number
        rows: number
      }>(
        'pty.create',
        {
          shell: opts.shell || options.shell || 'auto',
          cwd: opts.cwd || options.cwd,
          cols: opts.cols || options.cols || 120,
          rows: opts.rows || options.rows || 30,
        },
        60000
      )

      if (result.success) {
        sessionId.value = result.sessionId
        session.value = {
          id: result.sessionId,
          shell: result.shell,
          cwd: result.cwd,
          cols: result.cols,
          rows: result.rows,
          isAlive: true,
        }
        isConnected.value = true
        console.log(`[PTY] Session created: ${result.sessionId}`)
        return result.sessionId
      } else {
        throw new Error('Failed to create PTY session')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      error.value = message
      console.error('[PTY] Failed to create session:', message)
      return null
    } finally {
      isConnecting.value = false
    }
  }

  /**
   * 销毁 PTY 会话
   */
  async function destroySession(): Promise<boolean> {
    if (!sessionId.value) {
      console.warn('[PTY] No session to destroy')
      return false
    }

    try {
      const result = await wsClient.callRPC<{ success: boolean }>('pty.destroy', {
        sessionId: sessionId.value,
      })

      if (result.success) {
        console.log(`[PTY] Session destroyed: ${sessionId.value}`)
      }

      sessionId.value = null
      session.value = null
      isConnected.value = false
      return result.success
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      error.value = message
      console.error('[PTY] Failed to destroy session:', message)
      return false
    }
  }

  /**
   * 发送输入到 PTY
   */
  async function write(data: string): Promise<boolean> {
    if (!sessionId.value) {
      console.warn('[PTY] No session to write to')
      return false
    }

    try {
      const result = await wsClient.callRPC<{ success: boolean; bytesWritten: number }>('pty.write', {
        sessionId: sessionId.value,
        data,
      })
      return result.success
    } catch (err) {
      console.error('[PTY] Write error:', err)
      return false
    }
  }

  /**
   * 调整终端尺寸
   */
  async function resize(cols: number, rows: number): Promise<boolean> {
    if (!sessionId.value) {
      console.warn('[PTY] No session to resize')
      return false
    }

    try {
      const result = await wsClient.callRPC<{ success: boolean; cols: number; rows: number }>('pty.resize', {
        sessionId: sessionId.value,
        cols,
        rows,
      })

      if (result.success && session.value) {
        session.value.cols = result.cols
        session.value.rows = result.rows
      }

      return result.success
    } catch (err) {
      console.error('[PTY] Resize error:', err)
      return false
    }
  }

  /**
   * 执行单条命令（不保持会话）
   */
  async function executeCommand(
    command: string,
    opts: { cwd?: string; shell?: string; timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number } | null> {
    error.value = null

    try {
      const result = await wsClient.callRPC<{
        success: boolean
        stdout: string
        stderr: string
        exitCode: number
      }>('pty.execute', {
        command,
        cwd: opts.cwd || options.cwd,
        shell: opts.shell || options.shell,
        timeout: opts.timeout || 30000,
      })

      return {
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        exitCode: result.exitCode,
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      error.value = message
      console.error('[PTY] Execute error:', message)
      return null
    }
  }

  /**
   * 获取 PTY 统计
   */
  async function getStats(): Promise<PTYStats | null> {
    try {
      const result = await wsClient.callRPC<PTYStats>('pty.stats')
      stats.value = result
      return result
    } catch (err) {
      console.error('[PTY] Stats error:', err)
      return null
    }
  }

  /**
   * 列出当前会话
   */
  async function listSessions(): Promise<PTYSession[]> {
    try {
      const result = await wsClient.callRPC<{ sessions: PTYSession[] }>('pty.list')
      return result.sessions || []
    } catch (err) {
      console.error('[PTY] List sessions error:', err)
      return []
    }
  }

  // ==================== Event Handling ====================

  // 存储事件取消函数
  const eventUnsubscribers: (() => void)[] = []

  /**
   * 订阅 PTY 输出事件
   */
  function subscribeToOutput(): void {
    // 取消之前的订阅
    unsubscribeAll()

    if (!sessionId.value) return

    // 订阅 pty_output 事件
    const unsubOutput = wsClient.on('pty_output', (data: any) => {
      if (data && data.sessionId === sessionId.value) {
        const outputCallback = options.onOutput
        if (outputCallback) {
          outputCallback(data.data, data.outputType, data.exitCode)
        }
      }
    })
    eventUnsubscribers.push(unsubOutput)

    // 订阅执行开始事件
    const unsubStarted = wsClient.on('pty_execution_started', (data: any) => {
      console.log('[PTY] Execution started:', data.command)
    })
    eventUnsubscribers.push(unsubStarted)

    // 订阅执行完成事件
    const unsubCompleted = wsClient.on('pty_execution_completed', (data: any) => {
      console.log('[PTY] Execution completed:', data.command, 'exitCode:', data.exitCode)
    })
    eventUnsubscribers.push(unsubCompleted)

    // 订阅执行失败事件
    const unsubFailed = wsClient.on('pty_execution_failed', (data: any) => {
      console.error('[PTY] Execution failed:', data.command, data.error)
    })
    eventUnsubscribers.push(unsubFailed)
  }

  /**
   * 取消所有事件订阅
   */
  function unsubscribeAll(): void {
    for (const unsub of eventUnsubscribers) {
      unsub()
    }
    eventUnsubscribers.length = 0
  }

  // ==================== Cleanup ====================

  onUnmounted(() => {
    unsubscribeAll()
    // 可选：自动销毁会话
    // destroySession()
  })

  // ==================== Public API ====================

  return {
    // State
    sessionId,
    isConnected,
    isConnecting,
    session,
    stats,
    error,

    // Session management
    createSession,
    destroySession,

    // PTY operations
    write,
    resize,
    executeCommand,

    // Utility
    getStats,
    listSessions,
    subscribeToOutput,
    unsubscribeAll,
  }
}

// ==================== Convenience Function ====================

/**
 * 创建快速执行命令的辅助函数
 */
export async function runCommand(
  command: string,
  options: {
    cwd?: string
    shell?: 'powershell' | 'cmd' | 'bash' | 'auto'
    timeout?: number
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number; success: boolean }> {
  const pty = usePTY({
    cwd: options.cwd,
    shell: options.shell,
  })

  const result = await pty.executeCommand(command, {
    timeout: options.timeout,
  })

  await pty.destroySession()

  if (result) {
    return {
      ...result,
      success: result.exitCode === 0,
    }
  }

  return {
    stdout: '',
    stderr: pty.error.value || 'Unknown error',
    exitCode: -1,
    success: false,
  }
}
