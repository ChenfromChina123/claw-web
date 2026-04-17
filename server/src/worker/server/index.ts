/**
 * Worker Internal API - 处理 Master 的内部 API 请求
 *
 * 暴露以下端点：
 * - POST /internal/exec - 执行命令
 * - POST /internal/pty/create - 创建 PTY
 * - POST /internal/pty/write - 写入 PTY
 * - POST /internal/pty/resize - 调整 PTY 大小
 * - POST /internal/pty/destroy - 销毁 PTY
 * - POST /internal/file/read - 读取文件
 * - POST /internal/file/write - 写入文件
 * - POST /internal/file/list - 列出目录
 * - GET /internal/health - 健康检查
 * - WS /internal/pty - PTY WebSocket（实时双向通信）
 */

import { workerPTYManager } from '../terminal/ptyManager'
import { workerSandbox } from '../sandbox'
import { validateMasterToken, generateRequestId } from '../../shared/utils'
import type { InternalAPIRequest, InternalAPIResponse } from '../../shared/types'

export class WorkerInternalAPI {
  private server: any

  async start(port = 4000): Promise<void> {
    const Bun = globalThis.Bun || await import('bun')
    const self = this
    
    this.server = Bun.serve({
      port,
      async fetch(req: Request, server): Promise<Response> {
        const url = new URL(req.url)
        
        // WebSocket 升级处理
        if (url.pathname === '/internal/pty' && req.headers.get('Upgrade') === 'websocket') {
          const token = req.headers.get('X-Master-Token')
          if (!validateMasterToken(token || '')) {
            return new Response('Unauthorized', { status: 403 })
          }

          const userId = req.headers.get('X-User-Id')
          if (!userId) {
            return new Response('User ID required', { status: 400 })
          }

          const success = server.upgrade(req, {
            data: {
              url: req.url,
              userId,
              token,
              sessions: new Set(),
            },
          })

          if (success) return
          return new Response('WebSocket upgrade failed', { status: 500 })
        }
        
        // HTTP 请求处理
        // 健康检查
        if (url.pathname === '/internal/health') {
          return Response.json({
            status: 'ok',
            role: 'worker',
            uptime: process.uptime(),
            ptySessions: workerPTYManager.getStats(),
          })
        }

        // 验证 Master Token
        const token = req.headers.get('X-Master-Token')
        if (!validateMasterToken(token || '')) {
          return Response.json({ 
            success: false, 
            error: 'Unauthorized' 
          }, { status: 403 })
        }

        const userId = req.headers.get('X-User-Id')
        if (!userId) {
          return Response.json({ 
            success: false, 
            error: 'User ID required' 
          }, { status: 400 })
        }

        let body: InternalAPIRequest | null = null
        try {
          body = await req.json()
        } catch {
          return Response.json({ 
            success: false, 
            error: 'Invalid JSON' 
          }, { status: 400 })
        }

        const response = await self.handleRequest(userId, body!)

        return Response.json(response, {
          headers: {
            'Content-Type': 'application/json',
          },
        })
      },

      websocket: {
        /**
         * 处理 WebSocket 连接
         * 用于 PTY 实时双向通信
         */
        open(ws) {
          const url = new URL(ws.data.url || '')
          const userId = ws.data.userId || ''
          
          if (url.pathname === '/internal/pty') {
            console.log(`[Worker WS] PTY 连接: userId=${userId}`)
            
            // 设置消息处理器
            ws.data.handlers = new Map()
            ws.data.sessions = new Set()
          }
        },

        /**
         * 处理 WebSocket 消息
         */
        async message(ws, message) {
          try {
            const data = typeof message === 'string' ? JSON.parse(message) : JSON.parse(new TextDecoder().decode(message as ArrayBuffer))
            const { type, requestId, sessionId, ...payload } = data
            
            console.log(`[Worker WS] 收到消息: type=${type}, requestId=${requestId}`)

            switch (type) {
              case 'create': {
                // 创建 PTY 会话
                const { cols, rows, cwd } = payload
                const userId = ws.data.userId
                
                const session = workerPTYManager.create(userId, { cols, rows, cwd })
                
                // 保存会话 ID
                if (!ws.data.sessions) ws.data.sessions = new Set()
                ws.data.sessions.add(session.id)

                // 注册 PTY 输出监听
                session.pty.onData((data: string) => {
                  ws.send(JSON.stringify({
                    type: 'output',
                    sessionId: session.id,
                    data,
                  }))
                })

                // 监听进程退出
                session.pty.onExit(({ exitCode }) => {
                  ws.send(JSON.stringify({
                    type: 'exit',
                    sessionId: session.id,
                    exitCode,
                  }))
                  ws.data.sessions?.delete(session.id)
                })

                // 返回创建成功
                ws.send(JSON.stringify({
                  type: 'created',
                  requestId,
                  sessionId: session.id,
                  pid: session.pty.pid,
                }))

                console.log(`[Worker WS] PTY 创建成功: sessionId=${session.id}, pid=${session.pty.pid}`)
                break
              }

              case 'input': {
                // 向 PTY 发送输入
                const success = workerPTYManager.write(sessionId, data)
                
                if (!success) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    requestId,
                    error: 'Failed to write to PTY',
                  }))
                }
                break
              }

              case 'resize': {
                // 调整 PTY 大小
                const { cols, rows } = payload
                const success = workerPTYManager.resize(sessionId, cols, rows)
                
                if (!success) {
                  ws.send(JSON.stringify({
                    type: 'error',
                    requestId,
                    error: 'Failed to resize PTY',
                  }))
                }
                break
              }

              case 'destroy': {
                // 销毁 PTY 会话
                const success = workerPTYManager.destroy(sessionId)
                
                if (success) {
                  ws.data.sessions?.delete(sessionId)
                }
                
                ws.send(JSON.stringify({
                  type: 'destroyed',
                  requestId,
                  sessionId,
                  success,
                }))
                break
              }

              case 'exec': {
                // 执行单条命令
                const { command, cwd } = payload
                const userId = ws.data.userId
                
                try {
                  const result = await workerSandbox.exec(command, { cwd })
                  
                  ws.send(JSON.stringify({
                    type: 'exec_result',
                    requestId,
                    success: result.exitCode === 0,
                    data: result,
                  }))
                } catch (error: any) {
                  ws.send(JSON.stringify({
                    type: 'exec_result',
                    requestId,
                    success: false,
                    error: error.message,
                  }))
                }
                break
              }

              default:
                console.warn(`[Worker WS] 未知消息类型: ${type}`)
                ws.send(JSON.stringify({
                  type: 'error',
                  requestId,
                  error: `Unknown message type: ${type}`,
                }))
            }
          } catch (error) {
            console.error('[Worker WS] 消息处理失败:', error)
            ws.send(JSON.stringify({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
            }))
          }
        },

        /**
         * 处理 WebSocket 连接关闭
         */
        close(ws) {
          // 清理该连接的所有 PTY 会话
          if (ws.data.sessions) {
            for (const sessionId of ws.data.sessions) {
              workerPTYManager.destroy(sessionId)
            }
          }
          
          console.log(`[Worker WS] 连接关闭: userId=${ws.data.userId}`)
        },
      },
    })

    console.log(`[Worker] Internal API listening on port ${port}`)
  }

  private async handleRequest(userId: string, req: InternalAPIRequest): Promise<InternalAPIResponse> {
    const { type, payload } = req

    try {
      switch (type) {
        case 'exec': {
          const { command, cwd, env, timeout } = payload as any
          const result = await workerSandbox.exec(command, { cwd, env, timeout })
          return {
            requestId: req.requestId,
            success: result.exitCode === 0,
            data: result,
          }
        }

        case 'pty_create': {
          const { cols, rows, cwd } = payload as any
          const session = workerPTYManager.create(userId, { cols, rows, cwd })
          return {
            requestId: req.requestId,
            success: true,
            data: { sessionId: session.id, pid: session.pty.pid },
          }
        }

        case 'pty_write': {
          const { sessionId, data } = payload as any
          const success = workerPTYManager.write(sessionId, data)
          return {
            requestId: req.requestId,
            success,
            data: { written: success },
          }
        }

        case 'pty_resize': {
          const { sessionId, cols, rows } = payload as any
          const success = workerPTYManager.resize(sessionId, cols, rows)
          return {
            requestId: req.requestId,
            success,
            data: { resized: success },
          }
        }

        case 'pty_destroy': {
          const { sessionId } = payload as any
          const success = workerPTYManager.destroy(sessionId)
          return {
            requestId: req.requestId,
            success,
          }
        }

        case 'file_read': {
          const { path, encoding } = payload as any
          const result = await workerSandbox.readFile(path, encoding)
          return {
            requestId: req.requestId,
            success: !result.error,
            data: result,
            error: result.error,
          }
        }

        case 'file_write': {
          const { path, content, encoding } = payload as any
          const result = await workerSandbox.writeFile(path, content)
          return {
            requestId: req.requestId,
            success: result.success,
            error: result.error,
          }
        }

        case 'file_list': {
          const { path } = payload as any
          const result = await workerSandbox.listDir(path)
          return {
            requestId: req.requestId,
            success: !result.error,
            data: result,
            error: result.error,
          }
        }

        default:
          return {
            requestId: req.requestId,
            success: false,
            error: `Unknown request type: ${type}`,
          }
      }
    } catch (error: any) {
      return {
        requestId: req.requestId,
        success: false,
        error: error.message,
      }
    }
  }

  stop(): void {
    if (this.server) {
      this.server.stop()
    }
    workerPTYManager.destroyAll()
  }
}

export const workerInternalAPI = new WorkerInternalAPI()
