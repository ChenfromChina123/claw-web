/**
 * Worker Forwarder - Master 端的 Worker 连接管理器
 *
 * 职责：
 * -管理与 Worker 容器的 WebSocket 连接
 * - 转发用户输入到 Worker
 * - 转发 Worker 输出到用户
 * - 维护 sessionId -> workerConnection 映射
 */

import { WebSocket } from 'ws'
import { validateMasterToken, getMasterInternalToken, getWorkerInternalPort, generateRequestId, DEFAULT_WORKER_PORT } from '../../shared'
import type { InternalAPIRequest, InternalAPIResponse } from '../../shared/types'

/**
 * 获取Worker端口（从环境变量或默认值）
 */
function getWorkerPort(): number {
  return parseInt(process.env.WORKER_PORT || String(DEFAULT_WORKER_PORT), 10)
}

const HEARTBEAT_INTERVAL = 30000 // 30秒心跳间隔
const HEARTBEAT_TIMEOUT = 60000 // 60秒超时

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

export class WorkerForwarder {
  private connections: Map<string, WorkerConnection> = new Map()
  private userConnections: Map<string, string> = new Map()

  async connectToWorker(userId: string, containerId: string, hostPort: number): Promise<WorkerConnection> {
    const connectionKey = `${userId}:${containerId}`

    const existing = this.connections.get(connectionKey)
    if (existing && existing.ws.readyState === WebSocket.OPEN) {
      return existing
    }

    const wsUrl = `ws://${containerId}:${getWorkerPort()}/internal/pty`
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

        // 预先注册全局 output 消息监听器（解决时序竞态问题）
        this.setupOutputListener(connection)

        // 启动心跳检测
        this.startHeartbeat(connectionKey)
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
      })
    })
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
   * 启动心跳检测
   */
  private startHeartbeat(connectionKey: string): void {
    const connection = this.connections.get(connectionKey)
    if (!connection) return

    connection.heartbeatTimer = setInterval(() => {
      if (Date.now() - connection.lastPong > HEARTBEAT_TIMEOUT) {
        console.warn(`[WorkerForwarder] Worker heartbeat timeout, closing connection`)
        connection.ws.close(4001, 'Heartbeat timeout')
        return
      }
      
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.ping()
      }
    }, HEARTBEAT_INTERVAL)
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
