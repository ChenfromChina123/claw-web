/**
 * Worker Internal API - 处理 Master 的内部 API 请求
 *
 * 使用 Node.js 原生 http + ws 模块（兼容 Node.js 运行时）
 * 支持 PTY 功能（node-pty 需要 Node.js 环境）
 */

import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { workerPTYManager } from '../terminal/ptyManager'
import { workerSandbox } from '../sandbox'
import { getWorkerDeploymentManager } from '../deployment'
import { validateMasterToken, generateRequestId } from '../../shared/utils'
import type { InternalAPIRequest, InternalAPIResponse } from '../../shared/types'

export class WorkerInternalAPI {
  private server: http.Server | null = null
  private wss: WebSocketServer | null = null

  async start(port = 4000): Promise<void> {
    const self = this

    // 创建 HTTP 服务器
    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`)

      // 设置 CORS 头
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Master-Token, X-User-Id')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      // 健康检查
      if (url.pathname === '/internal/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          status: 'ok',
          role: 'worker',
          uptime: process.uptime(),
          ptySessions: workerPTYManager.getStats(),
        }))
        return
      }

      // 验证 Master Token
      const token = req.headers['x-master-token']
      if (!validateMasterToken(token || '')) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Unauthorized' }))
        return
      }

      const userId = req.headers['x-user-id'] as string
      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'User ID required' }))
        return
      }

      // 读取请求体
      let body: InternalAPIRequest | null = null
      try {
        body = await self.readBody(req)
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }))
        return
      }

      const response = await self.handleRequest(userId, body!)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(response))
    })

    // 创建 WebSocket 服务器
    this.wss = new WebSocketServer({ server: this.server, path: '/internal/pty' })

    this.wss.on('connection', (ws: WebSocket, req) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`)
      const token = req.headers['x-master-token']
      const userId = req.headers['x-user-id'] as string

      // 验证 Token
      if (!validateMasterToken(token || '')) {
        ws.close(4401, 'Unauthorized')
        return
      }

      if (!userId) {
        ws.close(4400, 'User ID required')
        return
      }

      console.log(`[Worker WS] PTY 连接: userId=${userId}`)

      // 存储数据到 ws 实例
      ;(ws as any).data = {
        url: req.url,
        userId,
        token,
        sessions: new Set<string>(),
      }

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString())
          await self.handleWSMessage(ws, message)
        } catch (error) {
          console.error('[Worker WS] 消息处理失败:', error)
          ws.send(JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          }))
        }
      })

      ws.on('close', () => {
        // 清理该连接的所有 PTY 会话
        const sessions = (ws as any).data?.sessions as Set<string>
        if (sessions) {
          for (const sessionId of sessions) {
            workerPTYManager.destroy(sessionId)
          }
        }
        console.log(`[Worker WS] 连接关闭: userId=${userId}`)
      })
    })

    // 启动监听
    return new Promise((resolve) => {
      this.server!.listen(port, () => {
        console.log(`[Worker] Internal API listening on port ${port}`)
        resolve(undefined)
      })
    })
  }

  /**
   * 处理 WebSocket 消息
   */
  private async handleWSMessage(ws: WebSocket, data: any): Promise<void> {
    const { type, requestId, sessionId, ...payload } = data

    console.log(`[Worker WS] 收到消息: type=${type}, requestId=${requestId}`)

    switch (type) {
      case 'create': {
        const { cols, rows, cwd } = payload
        const userId = (ws as any).data.userId

        const session = workerPTYManager.create(userId, { cols, rows, cwd })

        if (!(ws as any).data.sessions) (ws as any).data.sessions = new Set()
        ;(ws as any).data.sessions.add(session.id)

        session.pty.onData((ptyData: string) => {
          console.log(`[Worker WS] PTY 输出: sessionId=${session.id}, data=${JSON.stringify(ptyData.substring(0, 100))}`)
          ws.send(JSON.stringify({ type: 'output', sessionId: session.id, data: ptyData }))
        })

        session.pty.onExit(({ exitCode }: { exitCode: number }) => {
          ws.send(JSON.stringify({ type: 'exit', sessionId: session.id, exitCode }))
          ;(ws as any).data.sessions?.delete(session.id)
        })

        ws.send(JSON.stringify({ type: 'created', requestId, sessionId: session.id, pid: session.pty.pid }))
        console.log(`[Worker WS] PTY 创建成功: sessionId=${session.id}, pid=${session.pty.pid}`)
        break
      }

      case 'input': {
        const success = workerPTYManager.write(sessionId, payload.data)
        if (!success) {
          ws.send(JSON.stringify({ type: 'error', requestId, error: 'Failed to write to PTY' }))
        }
        break
      }

      case 'resize': {
        const { cols, rows } = payload
        const success = workerPTYManager.resize(sessionId, cols, rows)
        if (!success) {
          ws.send(JSON.stringify({ type: 'error', requestId, error: 'Failed to resize PTY' }))
        }
        break
      }

      case 'destroy': {
        const success = workerPTYManager.destroy(sessionId)
        if (success) {
          ;(ws as any).data.sessions?.delete(sessionId)
        }
        ws.send(JSON.stringify({ type: 'destroyed', requestId, sessionId, success }))
        break
      }

      case 'exec': {
        const { command, cwd } = payload
        try {
          const result = await workerSandbox.exec(command, { cwd })
          ws.send(JSON.stringify({ type: 'exec_result', requestId, success: result.exitCode === 0, data: result }))
        } catch (error: any) {
          ws.send(JSON.stringify({ type: 'exec_result', requestId, success: false, error: error.message }))
        }
        break
      }

      default:
        console.warn(`[Worker WS] 未知消息类型: ${type}`)
        ws.send(JSON.stringify({ type: 'error', requestId, error: `Unknown message type: ${type}` }))
    }
  }

  /**
   * 读取请求体
   */
  private readBody(req: http.IncomingMessage): Promise<InternalAPIRequest> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (e) {
          reject(e)
        }
      })
      req.on('error', reject)
    })
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(userId: string, req: InternalAPIRequest): Promise<InternalAPIResponse> {
    const { type, payload } = req

    try {
      switch (type) {
        case 'exec': {
          const { command, cwd, env, timeout } = payload as any
          const result = await workerSandbox.exec(command, { cwd, env, timeout })
          return { requestId: req.requestId, success: result.exitCode === 0, data: result }
        }

        case 'pty_create': {
          const { cols, rows, cwd } = payload as any
          const session = workerPTYManager.create(userId, { cols, rows, cwd })
          return { requestId: req.requestId, success: true, data: { sessionId: session.id, pid: session.pty.pid } }
        }

        case 'pty_write': {
          const { sessionId, data } = payload as any
          const success = workerPTYManager.write(sessionId, data)
          return { requestId: req.requestId, success, data: { written: success } }
        }

        case 'pty_resize': {
          const { sessionId, cols, rows } = payload as any
          const success = workerPTYManager.resize(sessionId, cols, rows)
          return { requestId: req.requestId, success, data: { resized: success } }
        }

        case 'pty_destroy': {
          const { sessionId } = payload as any
          const success = workerPTYManager.destroy(sessionId)
          return { requestId: req.requestId, success }
        }

        case 'file_read': {
          const { path, encoding } = payload as any
          const result = await workerSandbox.readFile(path, encoding)
          return { requestId: req.requestId, success: !result.error, data: result, error: result.error }
        }

        case 'file_write': {
          const { path, content, encoding } = payload as any
          const result = await workerSandbox.writeFile(path, content)
          return { requestId: req.requestId, success: result.success, error: result.error }
        }

        case 'file_list': {
          const { path } = payload as any
          const result = await workerSandbox.listDir(path)
          return { requestId: req.requestId, success: !result.error, data: result, error: result.error }
        }

        case 'tool_exec': {
          const { toolName, toolInput, cwd, timeout } = payload as any
          const result = await workerSandbox.execTool(toolName, toolInput, { cwd, timeout })
          return {
            requestId: req.requestId,
            success: result.success,
            data: { result: result.result, output: result.output },
            error: result.error,
          }
        }

        case 'deploy': {
          const { config } = payload as any
          const deploymentManager = getWorkerDeploymentManager()
          const result = await deploymentManager.deployProject(config)
          return { requestId: req.requestId, success: result.success, data: result, error: result.error }
        }

        case 'deploy_stop': {
          const { projectId, processManager } = payload as any
          const deploymentManager = getWorkerDeploymentManager()
          const success = await deploymentManager.stopProject(projectId, processManager)
          return { requestId: req.requestId, success, data: { stopped: success } }
        }

        case 'deploy_restart': {
          const { projectId, processManager } = payload as any
          const deploymentManager = getWorkerDeploymentManager()
          const success = await deploymentManager.restartProject(projectId, processManager)
          return { requestId: req.requestId, success, data: { restarted: success } }
        }

        case 'deploy_status': {
          const { projectId, processManager } = payload as any
          const deploymentManager = getWorkerDeploymentManager()
          const status = await deploymentManager.getProjectStatus(projectId, processManager)
          return { requestId: req.requestId, success: true, data: status }
        }

        case 'deploy_logs': {
          const { projectId, lines } = payload as any
          const deploymentManager = getWorkerDeploymentManager()
          const logs = await deploymentManager.getProjectLogs(projectId, lines)
          return { requestId: req.requestId, success: true, data: logs }
        }

        case 'deploy_list': {
          const deploymentManager = getWorkerDeploymentManager()
          const projects = await deploymentManager.listProjects()
          return { requestId: req.requestId, success: true, data: { projects } }
        }

        default:
          return { requestId: req.requestId, success: false, error: `Unknown request type: ${type}` }
      }
    } catch (error: any) {
      return { requestId: req.requestId, success: false, error: error.message }
    }
  }

  stop(): void {
    this.wss?.close()
    this.server?.close()
    workerPTYManager.destroyAll()
  }
}

export const workerInternalAPI = new WorkerInternalAPI()
