/**
 * Worker Forwarder - Master 端的 Worker 连接管理器
 *
 * 职责：
 * -管理与 Worker 容器的 WebSocket 连接
 * - 转发用户输入到 Worker
 * - 转发 Worker 输出到用户
 * - 维护 sessionId -> workerConnection 映射
 * - 用户在线时保持 Worker 连接（支持 Agent 操作）
 */

import { WebSocket } from 'ws'
import { validateMasterToken, getMasterInternalToken, getWorkerInternalPort, generateRequestId, DEFAULT_WORKER_PORT } from '../../shared'
import type { InternalAPIRequest, InternalAPIResponse } from '../../shared/types'
import { getContainerOrchestrator } from '../orchestrator/containerOrchestrator'

/**
 * 获取Worker端口（从环境变量或默认值）
 */
function getWorkerPort(): number {
  return parseInt(process.env.WORKER_PORT || String(DEFAULT_WORKER_PORT), 10)
}

/**
 * 心跳配置（支持持久连接模式）
 *
 * 设计原则：
 * - 长连接场景下，心跳主要用于检测网络异常，而非空闲管理
 * - 超时时间应远大于正常空闲时长（如 10 分钟以上）
 * - 可通过环境变量 WORKER_HEARTBEAT_TIMEOUT_MS 自定义
 */
const HEARTBEAT_INTERVAL = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || '30000', 10)  // 30秒心跳间隔
const HEARTBEAT_TIMEOUT = parseInt(process.env.WORKER_HEARTBEAT_TIMEOUT_MS || '600000', 10)    // 10分钟超时（原60s太短）

/**
 * 用户活跃状态自动保持配置
 */
const USER_ACTIVE_TIMEOUT_MS = parseInt(process.env.USER_ACTIVE_TIMEOUT_MS || '300000', 10)  // 5分钟无活动视为离线
const CONNECTION_KEEPALIVE_INTERVAL_MS = parseInt(process.env.CONNECTION_KEEPALIVE_INTERVAL_MS || '60000', 10)  // 1分钟检查一次连接

export interface WorkerConnection {
  ws: WebSocket
  userId: string
  containerId: string
  hostPort: number
  sessionMappings: Map<string, string>
  lastPong: number
  heartbeatTimer: NodeJS.Timeout | null
  frontendWs: WebSocket | null // 前端 WebSocket 连接
  outputCallbacks: Map<string, (frontendSessionId: string, data: string) => void>
}

/**
 * 用户活跃状态跟踪
 */
interface UserActivity {
  userId: string
  lastActiveAt: number
  isOnline: boolean
  keepAliveTimer: NodeJS.Timeout | null
}

export class WorkerForwarder {
  private connections: Map<string, WorkerConnection> = new Map()
  private userConnections: Map<string, string> = new Map()
  private userActivities: Map<string, UserActivity> = new Map()
  private activeToolExecutions: Map<string, number> = new Map()

  async connectToWorker(userId: string, containerId: string, hostPort: number): Promise<WorkerConnection> {
    const connectionKey = `${userId}:${containerId}`

    const existing = this.connections.get(connectionKey)
    if (existing && existing.ws.readyState === WebSocket.OPEN) {
      // 更新用户活跃状态
      this.updateUserActivity(userId)
      return existing
    }

    // 修复：使用 localhost:hostPort 连接 Worker，而不是容器名
    // 因为 Docker 端口映射是通过主机的 hostPort 暴露的
    const wsUrl = `ws://localhost:${hostPort}/internal/pty`
    const token = getMasterInternalToken()

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          'X-Master-Token': token,
          'X-User-Id': userId,
        },
      })

      ws.on('open', () => {
        const connection: WorkerConnection = {
          ws,
          userId,
          containerId,
          hostPort,
          sessionMappings: new Map(),
          lastPong: Date.now(),
          heartbeatTimer: null,
          frontendWs: null,
          outputCallbacks: new Map(),
        }
        this.connections.set(connectionKey, connection)
        this.userConnections.set(userId, connectionKey)
        console.log(`[WorkerForwarder] Connected to Worker ${containerId} for user ${userId}`)

        ws.on('pong', () => {
          connection.lastPong = Date.now()
        })

        // 预先注册全局 output 消息监听器（解决时序竞态问题）
        this.setupOutputListener(connection)

        // 启动心跳检测
        this.startHeartbeat(connectionKey)

        // 更新用户活跃状态并启动保持连接
        this.updateUserActivity(userId)
        this.startUserKeepAlive(userId)

        resolve(connection)
      })

      ws.on('error', (error) => {
        console.error(`[WorkerForwarder] Error connecting to Worker ${containerId}:`, error.message)
        this.connections.delete(connectionKey)
        this.userConnections.delete(userId)
        reject(error)
      })

      ws.on('close', (code, reason) => {
        console.log(`[WorkerForwarder] Connection to Worker ${containerId} closed: ${code} ${reason}`)
        this.stopHeartbeat(connectionKey)

        // 通知前端 Worker 已断开
        const connection = this.connections.get(connectionKey)
        if (connection?.frontendWs && connection.frontendWs.readyState === WebSocket.OPEN) {
          connection.frontendWs.send(JSON.stringify({
            type: 'worker_disconnected',
            containerId,
            code,
            reason: reason.toString(),
          }))
        }

        this.connections.delete(connectionKey)
        this.userConnections.delete(userId)

        // 如果用户仍然在线，尝试自动重连
        const activity = this.userActivities.get(userId)
        if (activity?.isOnline) {
          console.log(`[WorkerForwarder] 用户 ${userId} 仍然在线，尝试自动重连 Worker...`)
          this.attemptReconnectForUser(userId)
        }
      })
    })
  }

  /**
   * 确保用户有活跃的 Worker 连接
   * 在用户执行工具或发送消息前调用
   */
  async ensureUserWorkerConnection(userId: string): Promise<WorkerConnection | null> {
    // 更新用户活跃状态
    this.updateUserActivity(userId)

    const connectionKey = this.userConnections.get(userId)
    if (connectionKey) {
      const existing = this.connections.get(connectionKey)
      if (existing && existing.ws.readyState === WebSocket.OPEN) {
        return existing
      }
    }

    // 没有活跃连接，尝试建立
    console.log(`[WorkerForwarder] 用户 ${userId} 没有活跃 Worker 连接，尝试建立...`)

    try {
      const orchestrator = getContainerOrchestrator()
      let mapping = orchestrator.getUserMapping(userId)

      if (!mapping) {
        mapping = await orchestrator.getOrLoadUserMapping(userId)
      }

      if (!mapping) {
        const assignResult = await orchestrator.assignContainerToUser(userId)
        if (!assignResult.success || !assignResult.data) {
          console.error(`[WorkerForwarder] 无法为用户 ${userId} 分配容器: ${assignResult.error}`)
          return null
        }
        mapping = assignResult.data
      }

      // 如果容器处于暂停状态，恢复它
      if (mapping.container.status === 'paused') {
        console.log(`[WorkerForwarder] 用户 ${userId} 的容器处于暂停状态，正在恢复...`)
        const assignResult = await orchestrator.assignContainerToUser(userId)
        if (!assignResult.success || !assignResult.data) {
          console.error(`[WorkerForwarder] 无法恢复用户 ${userId} 的容器: ${assignResult.error}`)
          return null
        }
        mapping = assignResult.data
      }

      return await this.connectToWorker(
        userId,
        mapping.container.containerName,
        mapping.container.hostPort
      )
    } catch (error) {
      console.error(`[WorkerForwarder] 确保用户 ${userId} Worker 连接失败:`, error)
      return null
    }
  }

  /**
   * 更新用户活跃状态
   */
  updateUserActivity(userId: string): void {
    const now = Date.now()
    const activity = this.userActivities.get(userId)

    if (activity) {
      activity.lastActiveAt = now
      activity.isOnline = true
    } else {
      this.userActivities.set(userId, {
        userId,
        lastActiveAt: now,
        isOnline: true,
        keepAliveTimer: null,
      })
    }
  }

  /**
   * 启动用户连接保持机制
   * 定期检查用户是否在线，如果在线则保持 Worker 连接
   */
  private startUserKeepAlive(userId: string): void {
    const activity = this.userActivities.get(userId)
    if (!activity || activity.keepAliveTimer) return

    activity.keepAliveTimer = setInterval(async () => {
      const now = Date.now()
      const timeSinceLastActivity = now - activity.lastActiveAt

      // 检查用户是否已离线
      if (timeSinceLastActivity > USER_ACTIVE_TIMEOUT_MS) {
        console.log(`[WorkerForwarder] 用户 ${userId} 超过 ${Math.round(timeSinceLastActivity / 1000)}s 无活动，标记为离线`)
        activity.isOnline = false

        // 停止保持连接定时器
        if (activity.keepAliveTimer) {
          clearInterval(activity.keepAliveTimer)
          activity.keepAliveTimer = null
        }

        // 断开 Worker 连接（让容器可以进入休眠）
        this.disconnect(userId)
        return
      }

      // 用户仍然在线，确保 Worker 连接
      if (activity.isOnline) {
        const connectionKey = this.userConnections.get(userId)
        if (!connectionKey) {
          console.log(`[WorkerForwarder] 用户 ${userId} 在线但无 Worker 连接，尝试自动连接...`)
          await this.attemptReconnectForUser(userId)
        } else {
          const connection = this.connections.get(connectionKey)
          if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
            console.log(`[WorkerForwarder] 用户 ${userId} 的 Worker 连接已断开，尝试自动重连...`)
            await this.attemptReconnectForUser(userId)
          }
        }
      }
    }, CONNECTION_KEEPALIVE_INTERVAL_MS)

    console.log(`[WorkerForwarder] 启动用户 ${userId} 的连接保持机制`)
  }

  /**
   * 为用户尝试重连 Worker
   */
  private async attemptReconnectForUser(userId: string): Promise<void> {
    try {
      const orchestrator = getContainerOrchestrator()
      let mapping = orchestrator.getUserMapping(userId)

      if (!mapping) {
        mapping = await orchestrator.getOrLoadUserMapping(userId)
      }

      if (!mapping) {
        console.warn(`[WorkerForwarder] 无法为用户 ${userId} 找到容器映射，跳过重连`)
        return
      }

      // 恢复容器（如果是暂停状态）
      if (mapping.container.status === 'paused') {
        console.log(`[WorkerForwarder] 重连前恢复用户 ${userId} 的暂停容器...`)
        const assignResult = await orchestrator.assignContainerToUser(userId)
        if (!assignResult.success || !assignResult.data) {
          console.error(`[WorkerForwarder] 恢复容器失败: ${assignResult.error}`)
          return
        }
        mapping = assignResult.data
      }

      await this.connectToWorker(
        userId,
        mapping.container.containerName,
        mapping.container.hostPort
      )

      console.log(`[WorkerForwarder] 用户 ${userId} Worker 自动重连成功`)
    } catch (error) {
      console.error(`[WorkerForwarder] 用户 ${userId} Worker 自动重连失败:`, error)
    }
  }

  /**
   * 设置用户离线状态
   * 当用户主动断开或超时时调用
   */
  setUserOffline(userId: string): void {
    const activity = this.userActivities.get(userId)
    if (activity) {
      activity.isOnline = false
      if (activity.keepAliveTimer) {
        clearInterval(activity.keepAliveTimer)
        activity.keepAliveTimer = null
      }
    }

    // 断开 Worker 连接
    this.disconnect(userId)
    console.log(`[WorkerForwarder] 用户 ${userId} 已设置为离线，Worker 连接已断开`)
  }

  async createPTY(userId: string, containerId: string, hostPort: number, options: { cols: number; rows: number; cwd?: string }): Promise<{ frontendSessionId: string; workerSessionId: string }> {
    const connection = await this.connectToWorker(userId, containerId, hostPort)
    const frontendSessionId = generateRequestId()

    return new Promise((resolve, reject) => {
      const requestId = generateRequestId()

      const messageHandler = (data: any) => {
        try {
          const response = JSON.parse(data.toString())
          if (response.requestId === requestId && response.type === 'created') {
            connection.ws.off('message', messageHandler)
            connection.sessionMappings.set(frontendSessionId, response.sessionId)
            resolve({
              frontendSessionId,
              workerSessionId: response.sessionId,
            })
          }
        } catch {
        }
      }

      connection.ws.on('message', messageHandler)

      connection.ws.send(JSON.stringify({
        type: 'create',
        requestId,
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd || '/workspace',
      }))

      setTimeout(() => {
        connection.ws.off('message', messageHandler)
        reject(new Error('PTY creation timeout'))
      }, 10000)
    })
  }

  async execOnWorker(userId: string, containerId: string, hostPort: number, command: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const connection = await this.connectToWorker(userId, containerId, hostPort)
    const requestId = generateRequestId()

    return new Promise((resolve, reject) => {
      const messageHandler = (data: any) => {
        try {
          const response = JSON.parse(data.toString())
          if (response.requestId === requestId) {
            connection.ws.off('message', messageHandler)
            if (response.success) {
              resolve(response.data)
            } else {
              reject(new Error(response.error))
            }
          }
        } catch {
        }
      }

      connection.ws.on('message', messageHandler)

      connection.ws.send(JSON.stringify({
        type: 'exec',
        requestId,
        command,
        cwd,
      }))

      setTimeout(() => {
        connection.ws.off('message', messageHandler)
        reject(new Error('Exec timeout'))
      }, 30000)
    })
  }

  writeToPTY(userId: string, containerId: string, frontendSessionId: string, data: string): boolean {
    const connectionKey = this.userConnections.get(userId)
    if (!connectionKey) return false

    const connection = this.connections.get(connectionKey)
    if (!connection) return false

    const workerSessionId = connection.sessionMappings.get(frontendSessionId)
    if (!workerSessionId) return false

    connection.ws.send(JSON.stringify({
      type: 'input',
      sessionId: workerSessionId,
      data,
    }))

    return true
  }

  resizePTY(userId: string, containerId: string, frontendSessionId: string, cols: number, rows: number): boolean {
    const connectionKey = this.userConnections.get(userId)
    if (!connectionKey) return false

    const connection = this.connections.get(connectionKey)
    if (!connection) return false

    const workerSessionId = connection.sessionMappings.get(frontendSessionId)
    if (!workerSessionId) return false

    connection.ws.send(JSON.stringify({
      type: 'resize',
      sessionId: workerSessionId,
      cols,
      rows,
    }))

    return true
  }

  destroyPTY(userId: string, containerId: string, frontendSessionId: string): boolean {
    const connectionKey = this.userConnections.get(userId)
    if (!connectionKey) return false

    const connection = this.connections.get(connectionKey)
    if (!connection) return false

    const workerSessionId = connection.sessionMappings.get(frontendSessionId)
    if (!workerSessionId) return false

    connection.ws.send(JSON.stringify({
      type: 'destroy',
      sessionId: workerSessionId,
    }))

    connection.sessionMappings.delete(frontendSessionId)
    return true
  }

  /**
   * 在连接建立时预先设置全局输出监听器
   * 解决 PTY 创建时序竞态问题：shell 初始输出可能在 onWorkerMessage 注册前到达
   */
  private setupOutputListener(connection: WorkerConnection): void {
    connection.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())

        // 处理 Worker 的 output 消息（PTY 输出数据）
        if (message.type === 'output' && message.sessionId) {
          console.log(`[WorkerForwarder] 收到 Worker output: workerSessionId=${message.sessionId}, data长度=${message.data?.length || 0}`)

          // 查找 workerSessionId 对应的 frontendSessionId
          for (const [frontendId, workerId] of connection.sessionMappings.entries()) {
            if (workerId === message.sessionId) {
              console.log(`[WorkerForwarder] 匹配到 frontendSessionId=${frontendId}, 回调数=${connection.outputCallbacks.size}`)
              // 调用所有注册的回调
              for (const callback of connection.outputCallbacks.values()) {
                callback(frontendId, message.data)
              }
              break
            }
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    })
  }

  /**
   * 注册 Worker 输出回调（替代旧的 onWorkerMessage）
   * 回调会在 setupOutputListener 中被调用，确保不丢失任何输出
   */
  onWorkerMessage(userId: string, callback: (frontendSessionId: string, data: string) => void): void {
    const connectionKey = this.userConnections.get(userId)
    if (!connectionKey) return

    const connection = this.connections.get(connectionKey)
    if (!connection) return

    // 使用唯一 ID 注册回调，避免重复
    const callbackId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    connection.outputCallbacks.set(callbackId, callback)

    console.log(`[WorkerForwarder] 注册输出回调: ${callbackId}, 当前回调数: ${connection.outputCallbacks.size}`)
  }

  /**
   * 移除 Worker 输出回调
   */
  removeOutputCallback(userId: string, callbackId?: string): void {
    const connectionKey = this.userConnections.get(userId)
    if (!connectionKey) return

    const connection = this.connections.get(connectionKey)
    if (!connection) return

    if (callbackId) {
      connection.outputCallbacks.delete(callbackId)
    } else {
      // 清除所有回调
      connection.outputCallbacks.clear()
    }
  }

  disconnect(userId: string): void {
    const connectionKey = this.userConnections.get(userId)
    if (!connectionKey) return

    const connection = this.connections.get(connectionKey)
    if (connection) {
      connection.ws.close()
      this.connections.delete(connectionKey)
    }
    this.userConnections.delete(userId)
  }

  disconnectAll(): void {
    for (const connection of this.connections.values()) {
      connection.ws.close()
      this.stopHeartbeat(`${connection.userId}:${connection.containerId}`)
    }
    this.connections.clear()
    this.userConnections.clear()
  }

  /**
   * 启动心跳检测（支持持久连接模式）
   *
   * 改进点：
   * - 超时后不立即断开，而是先尝试重连
   * - 记录断连原因，便于排查
   * - 支持配置化超时时间
   */
  private startHeartbeat(connectionKey: string): void {
    const connection = this.connections.get(connectionKey)
    if (!connection) return

    // 清除可能存在的旧定时器
    this.stopHeartbeat(connectionKey)

    connection.heartbeatTimer = setInterval(() => {
      const now = Date.now()
      const elapsed = now - connection.lastPong

      if (elapsed > HEARTBEAT_TIMEOUT) {
        const activeCount = this.activeToolExecutions.get(connection.userId) || 0
        if (activeCount > 0) {
          console.warn(
            `[WorkerForwarder] Worker heartbeat timeout after ${Math.round(elapsed / 1000)}s, ` +
            `but ${activeCount} tool(s) still executing for user ${connection.userId}, skipping reconnect`
          )
          connection.lastPong = now
          return
        }

        console.warn(
          `[WorkerForwarder] Worker heartbeat timeout after ${Math.round(elapsed / 1000)}s, ` +
          `attempting reconnect for user ${connection.userId}...`
        )

        this.attemptReconnect(connectionKey, connection)

        return
      }

      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.ping()
      }
    }, HEARTBEAT_INTERVAL)
  }

  /**
   * 尝试重新连接 Worker（断连恢复机制）
   *
   * 设计原则：
   * - 保持 sessionId 映射，避免 PTY 会话丢失
   * - 自动重连最多 3 次，超过后通知前端
   * - 重连成功后恢复心跳检测
   */
  private async attemptReconnect(
    connectionKey: string,
    oldConnection: WorkerConnection,
    retryCount: number = 0
  ): Promise<void> {
    const MAX_RETRIES = 3
    const RETRY_DELAY_MS = 5000

    if (retryCount >= MAX_RETRIES) {
      console.error(
        `[WorkerForwarder] Failed to reconnect to Worker after ${MAX_RETRIES} attempts, ` +
        `closing connection for user ${oldConnection.userId}`
      )
      oldConnection.ws.close(4002, `Reconnect failed after ${MAX_RETRIES} attempts`)
      return
    }

    console.log(
      `[WorkerForwarder] Reconnect attempt ${retryCount + 1}/${MAX_RETRIES} for user ${oldConnection.userId}...`
    )

    // 等待一段时间再重试
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))

    try {
      // 关闭旧连接
      if (oldConnection.ws.readyState === WebSocket.OPEN) {
        oldConnection.ws.close()
      }

      // 创建新连接
      const newConnection = await this.connectToWorker(
        oldConnection.userId,
        oldConnection.containerId,
        oldConnection.hostPort
      )

      // 迁移 session 映射到新连接（关键：保持 PTY 会话！）
      for (const [frontendId, workerId] of oldConnection.sessionMappings.entries()) {
        newConnection.sessionMappings.set(frontendId, workerId)
      }

      // 迁移输出回调
      for (const [callbackId, callback] of oldConnection.outputCallbacks.entries()) {
        newConnection.outputCallbacks.set(callbackId, callback)
      }

      // 迁移前端连接引用
      newConnection.frontendWs = oldConnection.frontendWs

      console.log(`[WorkerForwarder] Successfully reconnected to Worker for user ${oldConnection.userId}`)

      // 通知前端重连成功
      if (newConnection.frontendWs && newConnection.frontendWs.readyState === WebSocket.OPEN) {
        newConnection.frontendWs.send(JSON.stringify({
          type: 'worker_reconnected',
          containerId: oldConnection.containerId,
          timestamp: Date.now(),
        }))
      }
    } catch (error) {
      console.warn(
        `[WorkerForwarder] Reconnect attempt ${retryCount + 1} failed:`,
        error instanceof Error ? error.message : error
      )

      // 递归重试
      await this.attemptReconnect(connectionKey, oldConnection, retryCount + 1)
    }
  }

  /**
   * 停止心跳检测
   */
  private stopHeartbeat(connectionKey: string): void {
    const connection = this.connections.get(connectionKey)
    if (connection?.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer)
      connection.heartbeatTimer = null
    }
  }

  /**
   * 增加用户活跃工具执行计数
   */
  incrementActiveToolExecution(userId: string): void {
    const count = this.activeToolExecutions.get(userId) || 0
    this.activeToolExecutions.set(userId, count + 1)
  }

  /**
   * 减少用户活跃工具执行计数
   */
  decrementActiveToolExecution(userId: string): void {
    const count = this.activeToolExecutions.get(userId) || 0
    if (count <= 1) {
      this.activeToolExecutions.delete(userId)
    } else {
      this.activeToolExecutions.set(userId, count - 1)
    }
  }

  /**
   * 设置前端 WebSocket 连接（用于断连通知）
   */
  setFrontendConnection(userId: string, frontendWs: WebSocket): void {
    const connectionKey = this.userConnections.get(userId)
    if (!connectionKey) return

    const connection = this.connections.get(connectionKey)
    if (connection) {
      connection.frontendWs = frontendWs
    }
  }

  getConnectionStatus(): { total: number; byUser: Record<string, number> } {
    const byUser: Record<string, number> = {}
    for (const connection of this.connections.values()) {
      byUser[connection.userId] = (byUser[connection.userId] || 0) + 1
    }
    return {
      total: this.connections.size,
      byUser,
    }
  }

  /**
   * 获取特定用户的工作进程连接
   */
  getConnection(userId: string): WorkerConnection | undefined {
    const connectionKey = this.userConnections.get(userId)
    if (!connectionKey) return undefined
    return this.connections.get(connectionKey)
  }
}

export const workerForwarder = new WorkerForwarder()
