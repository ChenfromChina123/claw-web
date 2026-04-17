/**
 * Claude Code HAHA - WebSocket PTY Bridge (Master 端转发层)
 * 
 * 职责：
 * - 接收前端 WebSocket PTY 请求
 * - 通过 WorkerForwarder 转发到 Worker 容器
 * - 将 Worker 的 PTY 输出实时转发回前端
 * - 维护 sessionId 映射（frontendSessionId ↔ workerSessionId）
 * 
 * 架构原则：
 * - Master 禁止创建本地 PTY（违反隔离架构）
 * - 所有 PTY 操作必须转发到 Worker 执行
 */

import { workerForwarder } from '../websocket/workerForwarder'
import { wsManager } from './wsBridge'
import { getContainerOrchestrator } from '../orchestrator/containerOrchestrator'

// ==================== 环境配置 ====================

const PTY_ENABLED = process.env.PTY_ENABLED === 'true'

const errorIfDisabled = () => {
  if (!PTY_ENABLED) throw new Error('PTY 功能已禁用（PTY_ENABLED=false）')
}

// ==================== 消息类型定义 ====================

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
  sessionId?: string
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

// ==================== 会话管理 ====================

/**
 * 前端 sessionId 与 Worker 容器的映射关系
 */
interface FrontendSessionMapping {
  frontendSessionId: string
  workerSessionId: string
  userId: string
  containerId: string
  hostPort: number
  shell: string
  cwd: string
  createdAt: number
  lastActiveAt: number
}

const sessionMappings = new Map<string, FrontendSessionMapping>()

/**
 * 获取用户的 Worker 容器信息（自动分配）
 */
async function getUserWorkerInfo(userId: string): Promise<{ containerId: string; hostPort: number }> {
  const orchestrator = getContainerOrchestrator()
  
  // 使用新的 getOrLoadUserMapping 方法，会自动从数据库加载
  let mapping = await orchestrator.getOrLoadUserMapping(userId)

  if (!mapping) {
    console.log(`[PTY Bridge] 用户 ${userId} 未分配容器，尝试从Docker扫描已运行容器...`)
    
    // 先尝试扫描Docker中已运行的用户容器
    const dockerScanResult = await orchestrator.scanAndRecoverUserContainer(userId)
    if (dockerScanResult) {
      mapping = dockerScanResult
      console.log(`[PTY Bridge] 从Docker恢复用户容器: ${mapping.container.containerId}`)
    } else {
      // Docker中也没有，触发容器调度
      console.log(`[PTY Bridge] 用户 ${userId} 在Docker中也未找到容器，自动触发容器调度...`)
      const assignResult = await orchestrator.assignContainerToUser(userId)
      if (!assignResult.success || !assignResult.data) {
        throw new Error(assignResult.error || '容器分配失败，请稍后重试')
      }
      mapping = assignResult.data
      console.log(`[PTY Bridge] 用户 ${userId} 容器分配成功: ${mapping.container.containerId}`)
    }
  }

  return {
    containerId: mapping.container.containerName,
    hostPort: mapping.container.hostPort,
  }
}

// ==================== WebSocket PTY Bridge ====================

export class WebSocketPTYBridge {
  private static instance: WebSocketPTYBridge | null = null

  private constructor() {
    this.registerRPCMethods()
    this.setupWorkerOutputForwarder()
    console.log('[PTY Bridge] Initialized (Worker Forwarding Mode)')
  }

  static getInstance(): WebSocketPTYBridge {
    if (!WebSocketPTYBridge.instance) {
      WebSocketPTYBridge.instance = new WebSocketPTYBridge()
    }
    return WebSocketPTYBridge.instance
  }

  /**
   * 设置 Worker 输出转发器
   * 监听 Worker 的 PTY 输出并转发到前端
   */
  private setupWorkerOutputForwarder(): void {
    // 这里需要为每个用户注册输出监听
    // 实际在 createSession 时动态注册
  }

  /**
   * 注册 PTY 相关的 RPC 方法
   */
  private registerRPCMethods(): void {
    // 创建 PTY 会话
    wsManager.registerMethod({
      name: 'pty.create',
      description: '在 Worker 容器中创建新的 PTY 会话',
      params: {
        shell: { type: 'string', required: false, description: 'Shell 类型: powershell, cmd, bash, auto' },
        cwd: { type: 'string', required: false, description: '工作目录' },
        cols: { type: 'number', required: false, description: '终端列数' },
        rows: { type: 'number', required: false, description: '终端行数' },
      },
      execute: async (params, context) => {
        errorIfDisabled()
        
        const userId = context.userId
        if (!userId) {
          throw new Error('未认证用户，请先登录')
        }

        const connectionId = context.getConnectionId()
        const cols = (params.cols as number) || 120
        const rows = (params.rows as number) || 30
        const shell = (params.shell as string) || 'auto'
        const cwd = (params.cwd as string) || '/workspace'

        try {
          // 获取用户的 Worker 容器
          const { containerId, hostPort } = await getUserWorkerInfo(userId)
          
          console.log(`[PTY Bridge] 创建 PTY: userId=${userId}, container=${containerId}`)

          // 通过 WorkerForwarder 在 Worker 上创建 PTY
          const { frontendSessionId, workerSessionId } = await workerForwarder.createPTY(
            userId,
            containerId,
            hostPort,
            { cols, rows, cwd }
          )

          // 保存映射关系
          const mapping: FrontendSessionMapping = {
            frontendSessionId,
            workerSessionId,
            userId,
            containerId,
            hostPort,
            shell,
            cwd,
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
          }
          sessionMappings.set(frontendSessionId, mapping)

          // 注册 Worker 输出转发到前端
          this.registerOutputForwarding(frontendSessionId, connectionId)

          return {
            success: true,
            sessionId: frontendSessionId,
            shell,
            cwd,
            cols,
            rows,
            userId,
          }
        } catch (error) {
          console.error('[PTY Bridge] 创建 PTY 失败:', error)
          throw error
        }
      },
    })

    // 发送输入到 PTY
    wsManager.registerMethod({
      name: 'pty.write',
      description: '向 PTY 会话发送输入',
      params: {
        sessionId: { type: 'string', required: true, description: '前端 Session ID' },
        data: { type: 'string', required: true, description: '输入数据' },
      },
      execute: async (params, context) => {
        errorIfDisabled()
        
        const userId = context.userId
        if (!userId) {
          throw new Error('未认证用户')
        }

        const frontendSessionId = params.sessionId as string
        const data = params.data as string

        console.log(`[PTY Bridge] write: sessionId=${frontendSessionId}, data.length=${data.length}`)

        // 归属校验
        const mapping = sessionMappings.get(frontendSessionId)
        if (!mapping || mapping.userId !== userId) {
          console.warn(`[PTY] 用户 ${userId} 尝试写入未授权的 session ${frontendSessionId}`)
          return { success: false, sessionId: frontendSessionId, bytesWritten: 0, error: 'Session not found or access denied' }
        }

        // 更新活跃时间
        mapping.lastActiveAt = Date.now()

        // 通过 WorkerForwarder 写入
        const success = workerForwarder.writeToPTY(
          mapping.userId,
          mapping.containerId,
          frontendSessionId,
          data
        )

        return {
          success,
          sessionId: frontendSessionId,
          bytesWritten: success ? data.length : 0,
        }
      },
    })

    // 调整终端大小
    wsManager.registerMethod({
      name: 'pty.resize',
      description: '调整 PTY 终端大小',
      params: {
        sessionId: { type: 'string', required: true, description: '前端 Session ID' },
        cols: { type: 'number', required: true, description: '终端列数' },
        rows: { type: 'number', required: true, description: '终端行数' },
      },
      execute: async (params, context) => {
        errorIfDisabled()
        
        const userId = context.userId
        if (!userId) {
          throw new Error('未认证用户')
        }

        const frontendSessionId = params.sessionId as string
        const cols = params.cols as number
        const rows = params.rows as number

        const mapping = sessionMappings.get(frontendSessionId)
        if (!mapping || mapping.userId !== userId) {
          return { success: false, sessionId: frontendSessionId, error: 'Session not found or access denied' }
        }

        mapping.lastActiveAt = Date.now()

        const success = workerForwarder.resizePTY(
          mapping.userId,
          mapping.containerId,
          frontendSessionId,
          cols,
          rows
        )

        return { success, sessionId: frontendSessionId, cols, rows }
      },
    })

    // 销毁 PTY 会话
    wsManager.registerMethod({
      name: 'pty.destroy',
      description: '销毁 PTY 会话',
      params: {
        sessionId: { type: 'string', required: true, description: '前端 Session ID' },
      },
      execute: async (params, context) => {
        errorIfDisabled()
        
        const userId = context.userId
        if (!userId) {
          throw new Error('未认证用户')
        }

        const frontendSessionId = params.sessionId as string

        const mapping = sessionMappings.get(frontendSessionId)
        if (!mapping || mapping.userId !== userId) {
          return { success: false, sessionId: frontendSessionId, error: 'Session not found or access denied' }
        }

        // 通知 Worker 销毁
        workerForwarder.destroyPTY(
          mapping.userId,
          mapping.containerId,
          frontendSessionId
        )

        // 清理映射
        sessionMappings.delete(frontendSessionId)

        return { success: true, sessionId: frontendSessionId }
      },
    })

    // 列出 PTY 会话
    wsManager.registerMethod({
      name: 'pty.list',
      description: '列出当前用户的所有 PTY 会话',
      execute: async (_, context) => {
        errorIfDisabled()
        
        const userId = context.userId
        if (!userId) {
          return { sessions: [], count: 0 }
        }

        const sessions = Array.from(sessionMappings.values())
          .filter(m => m.userId === userId)
          .map(m => ({
            id: m.frontendSessionId,
            shell: m.shell,
            cwd: m.cwd,
            cols: 120,
            rows: 30,
            isAlive: true,
            userId: m.userId,
            containerId: m.containerId,
            createdAt: m.createdAt,
            lastActiveAt: m.lastActiveAt,
          }))

        return { sessions, count: sessions.length }
      },
    })

    // 执行单条命令（转发到 Worker）
    wsManager.registerMethod({
      name: 'pty.execute',
      description: '在 Worker 中执行单条命令（不保持会话）',
      params: {
        command: { type: 'string', required: true, description: '要执行的命令' },
        cwd: { type: 'string', required: false, description: '工作目录' },
        shell: { type: 'string', required: false, description: 'Shell 类型' },
        timeout: { type: 'number', required: false, description: '超时时间（毫秒）' },
      },
      execute: async (params, context) => {
        errorIfDisabled()
        
        const userId = context.userId
        if (!userId) {
          throw new Error('未认证用户')
        }

        const command = params.command as string
        const cwd = params.cwd as string | undefined
        const shell = params.shell as string | undefined

        console.log(`[PTY Bridge] 执行命令: userId=${userId}, command=${command}`)

        try {
          const { containerId, hostPort } = await getUserWorkerInfo(userId)

          // 发送到 Worker 执行
          const result = await workerForwarder.execOnWorker(
            userId,
            containerId,
            hostPort,
            command,
            cwd
          )

          return {
            success: result.exitCode === 0,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
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
      description: '获取 PTY 统计信息',
      execute: async () => {
        errorIfDisabled()
        return {
          totalSessions: sessionMappings.size,
          activeConnections: workerForwarder.getConnectionStatus(),
        }
      },
    })
  }

  /**
   * 注册 Worker 输出转发到前端
   */
  private registerOutputForwarding(frontendSessionId: string, connectionId: string): void {
    // 获取映射信息
    const mapping = sessionMappings.get(frontendSessionId)
    if (!mapping) return

    // 监听 Worker 输出
    workerForwarder.onWorkerMessage(mapping.userId, (receivedSessionId, data) => {
      if (receivedSessionId === frontendSessionId) {
        // 更新活跃时间
        mapping.lastActiveAt = Date.now()

        // 转发到前端 WebSocket
        const connection = wsManager.getConnection(connectionId)
        if (connection && connection.isConnected()) {
          connection.send({
            type: 'event',
            event: 'pty_output',
            data: {
              type: 'pty_output',
              sessionId: frontendSessionId,
              data: data,
              outputType: 'stdout',
            },
          } as any)
        }
      }
    })
  }

  /**
   * 清理连接的所有会话（连接断开时调用）
   */
  cleanupConnection(connectionId: string): void {
    // 获取该连接的用户 ID
    const connection = wsManager.getConnection(connectionId)
    if (!connection || !connection.userId) return
    
    const userId = connection.userId
    
    // 找出该用户的所有 session 并清理
    const sessionsToRemove: string[] = []
    
    for (const [frontendId, mapping] of sessionMappings.entries()) {
      if (mapping.userId === userId) {
        sessionsToRemove.push(frontendId)
      }
    }

    for (const frontendId of sessionsToRemove) {
      const mapping = sessionMappings.get(frontendId)
      if (mapping) {
        workerForwarder.destroyPTY(mapping.userId, mapping.containerId, frontendId)
        sessionMappings.delete(frontendId)
      }
    }

    if (sessionsToRemove.length > 0) {
      console.log(`[PTY Bridge] 清理了 ${sessionsToRemove.length} 个会话 (connection=${connectionId}, userId=${userId})`)
    }
  }
}

// ==================== 单例实例 ====================

export const wsPTYBridge = WebSocketPTYBridge.getInstance()
