/**
 * Claude Code HAHA - WebSocket PTY Bridge
 * 
 * 将前端 xterm.js 连接到后端真实 PTY 会话的桥梁：
 * - 处理前端发来的 PTY 命令（创建会话、输入、调整大小等）
 * - 将 PTY 输出实时转发给前端
 * - 支持多会话管理
 */

import { v4 as uuidv4 } from 'uuid'
import { ptyManager, type PTYOutput, type PTYCreateOptions } from './ptyManager'
import { wsManager } from './wsBridge'

const PTY_ENABLED = process.env.PTY_ENABLED === 'true'

const errorIfDisabled = () => {
  if (!PTY_ENABLED) throw new Error('PTY 功能已禁用（PTY_ENABLED=false）')
}

// ==================== Message Types ====================

export type PTYMessageType =
  | 'pty_create'
  | 'pty_output'
  | 'pty_input'
  | 'pty_resize'
  | 'pty_destroy'
  | 'pty_list'
  | 'pty_execute'
  | 'pty_executed'

export interface PTYCreateMessage {
  type: 'pty_create'
  sessionId?: string  // 可选：如果提供则复用
  shell?: 'powershell' | 'cmd' | 'bash' | 'auto'
  cwd?: string
  cols?: number
  rows?: number
}

export interface PTYOutputMessage {
  type: 'pty_output'
  sessionId: string
  data: string
  outputType: 'stdout' | 'stderr' | 'exit'
  exitCode?: number
}

export interface PTYInputMessage {
  type: 'pty_input'
  sessionId: string
  data: string
}

export interface PTYResizeMessage {
  type: 'pty_resize'
  sessionId: string
  cols: number
  rows: number
}

export interface PTYDestroyMessage {
  type: 'pty_destroy'
  sessionId: string
}

export interface PTYListMessage {
  type: 'pty_list'
}

export interface PTYExecuteMessage {
  type: 'pty_execute'
  command: string
  cwd?: string
  shell?: string
  timeout?: number
}

export type PTYWebSocketMessage =
  | PTYCreateMessage
  | PTYOutputMessage
  | PTYInputMessage
  | PTYResizeMessage
  | PTYDestroyMessage
  | PTYListMessage
  | PTYExecuteMessage

// ==================== WebSocket PTY Bridge ====================

export class WebSocketPTYBridge {
  private static instance: WebSocketPTYBridge | null = null

  private constructor() {
    this.registerRPCMethods()
    console.log('[PTY Bridge] Initialized')
  }

  static getInstance(): WebSocketPTYBridge {
    if (!WebSocketPTYBridge.instance) {
      WebSocketPTYBridge.instance = new WebSocketPTYBridge()
    }
    return WebSocketPTYBridge.instance
  }

  /**
   * 注册 PTY 相关的 RPC 方法
   */
  private registerRPCMethods(): void {
    // 创建 PTY 会话
    wsManager.registerMethod({
      name: 'pty.create',
      description: 'Create a new PTY session',
      params: {
        shell: { type: 'string', required: false, description: 'Shell type: powershell, cmd, bash, auto' },
        cwd: { type: 'string', required: false, description: 'Working directory' },
        cols: { type: 'number', required: false, description: 'Terminal columns' },
        rows: { type: 'number', required: false, description: 'Terminal rows' },
      },
      execute: async (params, context) => {
        errorIfDisabled()
        const options: PTYCreateOptions = {
          connectionId: context.getConnectionId(),
          userId: context.userId ?? undefined,
          shell: params.shell as PTYCreateOptions['shell'] || 'auto',
          cwd: params.cwd as string,
          cols: params.cols as number,
          rows: params.rows as number,
        }

        const session = ptyManager.createSession(options)

        // 注册输出回调
        ptyManager.onOutput(session.id, (output: PTYOutput) => {
          const message = {
            type: 'pty_output' as const,
            sessionId: session.id,
            data: output.data,
            outputType: output.type,
            exitCode: output.exitCode,
          }

          // 发送输出到对应连接
          const connection = wsManager.getConnection(context.getConnectionId())
          if (connection) {
            connection.send({
              type: 'event',
              event: 'pty_output',
              data: message,
            } as any)
          }
        })

        return {
          success: true,
          sessionId: session.id,
          shell: session.shell,
          cwd: session.cwd,
          cols: session.cols,
          rows: session.rows,
          userId: session.userId,
        }
      },
    })

    // 发送输入到 PTY
    wsManager.registerMethod({
      name: 'pty.write',
      description: 'Write input to PTY session',
      params: {
        sessionId: { type: 'string', required: true, description: 'Session ID' },
        data: { type: 'string', required: true, description: 'Input data' },
      },
      execute: async (params, context) => {
        errorIfDisabled()
        const { sessionId, data } = params

        console.log(`[PTY Bridge] write called: sessionId=${sessionId}, data=${JSON.stringify(data)}`)

        // 归属校验：防止跨用户操作
        if (context.userId && !ptyManager.sessionBelongsToUser(sessionId as string, context.userId)) {
          console.warn(`[PTY] User ${context.userId} attempted to write to session ${sessionId} owned by another user`)
          return { success: false, sessionId, bytesWritten: 0, error: 'Session not found or access denied' }
        }

        const success = ptyManager.write(sessionId as string, data as string)
        console.log(`[PTY Bridge] write result: success=${success}`)
        
        return {
          success,
          sessionId,
          bytesWritten: success ? (data as string).length : 0,
        }
      },
    })

    // 调整终端大小
    wsManager.registerMethod({
      name: 'pty.resize',
      description: 'Resize PTY terminal',
      params: {
        sessionId: { type: 'string', required: true, description: 'Session ID' },
        cols: { type: 'number', required: true, description: 'Terminal columns' },
        rows: { type: 'number', required: true, description: 'Terminal rows' },
      },
      execute: async (params) => {
        errorIfDisabled()
        const { sessionId, cols, rows } = params

        // 先检查会话是否存在且存活
        const session = ptyManager.getSession(sessionId as string)
        if (!session || !session.isAlive) {
          return {
            success: false,
            sessionId,
            error: 'Session already terminated',
          }
        }

        const success = ptyManager.resize(sessionId as string, cols as number, rows as number)

        return {
          success,
          sessionId,
          cols,
          rows,
        }
      },
    })

    // 销毁 PTY 会话
    wsManager.registerMethod({
      name: 'pty.destroy',
      description: 'Destroy PTY session',
      params: {
        sessionId: { type: 'string', required: true, description: 'Session ID' },
      },
      execute: async (params, context) => {
        errorIfDisabled()
        const { sessionId } = params

        // 归属校验
        if (context.userId && !ptyManager.sessionBelongsToUser(sessionId as string, context.userId)) {
          console.warn(`[PTY] User ${context.userId} attempted to destroy session ${sessionId} owned by another user`)
          return { success: false, sessionId, error: 'Session not found or access denied' }
        }

        const success = ptyManager.destroySession(sessionId as string)
        
        return {
          success,
          sessionId,
        }
      },
    })

    // 列出 PTY 会话（当前连接）
    wsManager.registerMethod({
      name: 'pty.list',
      description: 'List PTY sessions for current connection',
      execute: async (_, context) => {
        errorIfDisabled()
        const sessions = ptyManager.getConnectionSessions(context.getConnectionId())
        
        return {
          sessions: sessions.map(s => ({
            id: s.id,
            shell: s.shell,
            cwd: s.cwd,
            cols: s.cols,
            rows: s.rows,
            isAlive: s.isAlive,
            userId: s.userId,
            createdAt: s.createdAt,
            lastActiveAt: s.lastActiveAt,
          })),
          count: sessions.length,
        }
      },
    })

    // 列出当前用户的所有 PTY 会话（跨连接，用于 Agent 终端工具）
    wsManager.registerMethod({
      name: 'pty.listMine',
      description: 'List all PTY sessions for current user (cross-connection)',
      execute: async (_, context) => {
        errorIfDisabled()
        if (!context.userId) {
          return { sessions: [], count: 0, error: 'Not authenticated' }
        }
        const sessions = ptyManager.getSessionsForUser(context.userId)
        
        return {
          sessions: sessions.map(s => ({
            id: s.id,
            shell: s.shell,
            cwd: s.cwd,
            cols: s.cols,
            rows: s.rows,
            isAlive: s.isAlive,
            connectionId: s.connectionId,
            createdAt: s.createdAt,
            lastActiveAt: s.lastActiveAt,
          })),
          count: sessions.length,
        }
      },
    })

    // 执行单条命令（不保持会话）
    wsManager.registerMethod({
      name: 'pty.execute',
      description: 'Execute a single command in PTY (no session maintained)',
      params: {
        command: { type: 'string', required: true, description: 'Command to execute' },
        cwd: { type: 'string', required: false, description: 'Working directory' },
        shell: { type: 'string', required: false, description: 'Shell type' },
        timeout: { type: 'number', required: false, description: 'Timeout in ms' },
      },
      execute: async (params, context) => {
        errorIfDisabled()
        const { command, cwd, shell, timeout } = params

        // 发送开始事件
        context.sendEvent('pty_execution_started', {
          command,
          cwd,
          shell,
        })

        try {
          const result = await ptyManager.executeCommand(command as string, {
            cwd: cwd as string,
            shell: shell as string,
            timeout: timeout as number,
          })

          // 发送完成事件
          context.sendEvent('pty_execution_completed', {
            command,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            duration: Date.now(),
          })

          return {
            success: result.exitCode === 0,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          
          // 发送错误事件
          context.sendEvent('pty_execution_failed', {
            command,
            error: errorMessage,
          })

          return {
            success: false,
            stdout: '',
            stderr: errorMessage,
            exitCode: -1,
          }
        }
      },
    })

    // 获取 PTY 统计
    wsManager.registerMethod({
      name: 'pty.stats',
      description: 'Get PTY statistics',
      execute: async () => {
        errorIfDisabled()
        return ptyManager.getStats()
      },
    })
  }

  /**
   * 处理连接断开，清理该连接的所有会话
   */
  cleanupConnection(connectionId: string): void {
    const count = ptyManager.destroyConnectionSessions(connectionId)
    if (count > 0) {
      console.log(`[PTY Bridge] Cleaned up ${count} sessions for connection ${connectionId}`)
    }
  }
}

// ==================== Singleton Instance ====================

export const wsPTYBridge = WebSocketPTYBridge.getInstance()
