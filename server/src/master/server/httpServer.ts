/**
 * HTTP 服务器配置与启动（重构版）
 *
 * 功能：
 * - 协调 Master-Worker 双角色模式的服务器启动
 * - 管理服务初始化流程
 * - 处理请求路由分发
 *
 * 架构改进：
 * - 从 1250 行拆分为轻量级协调器 (~400 行)
 * - 认证逻辑委托给 serverAuth.ts
 * - Worker 请求处理委托给 workerHandlers.ts
 *
 * 子模块依赖：
 * - serverAuth.ts: 认证与用户身份提取
 * - workerHandlers.ts: Worker 模式处理器
 */

import { v4 as uuidv4 } from 'uuid'
import { initDatabase, closePool, isDatabaseAvailable } from '../db/mysql'
import { SessionManager } from '../services/sessionManager'
import { getAgentStatusService, createAgentStatusService, setAgentStatusService } from '../services/agentStatusService'
import { getWorkflowEventService } from '../services/workflowEventService'
import { wsManager } from '../integration/wsBridge'
import { wsPTYBridge } from '../integration/wsPTYBridge'
import { ptyManager } from '../integration/ptyManager'
import { handleRequest } from '../routes'
import { handleWebSocketOpen, handleWebSocketMessage, handleWebSocketClose } from '../websocket'
import { createSuccessResponse, createErrorResponse } from '../utils/response'
import { PORT, AVAILABLE_MODELS } from '../utils/constants'
import type { WebSocketData } from '../types'
import { getContainerOrchestrator } from '../orchestrator/containerOrchestrator'
import { getSchedulingPolicy } from '../orchestrator/schedulingPolicy'

// 导入子模块
import { verifyMasterToken, extractUserFromRequest } from './serverAuth'
import { handleWorkerRequest } from './workerHandlers'

// 导入所有需要初始化的服务
import '../services/sessionManager'
import '../integration/wsBridge'
import '../integration/enhancedToolExecutor'
import '../integration/performanceMonitor'
import '../integrations/commandBridge'
import '../integrations/mcpBridge'
import '../integrations/agentRunner'
import '../integrations/sessionBridge'
import '../integration/webStore'

// 插件系统
import { initializePluginSystem } from '../integrations/plugins'

const sessionManager = SessionManager.getInstance()

// ==================== 辅助函数 ====================

/**
 * 获取Worker端口（从环境变量或默认值）
 */
function getWorkerPort(): number {
  const { DEFAULT_WORKER_PORT } = require('../../shared/constants')
  return parseInt(process.env.WORKER_PORT || String(DEFAULT_WORKER_PORT), 10)
}

/**
 * 代理请求到 Worker 容器
 */
async function proxyToWorkerContainer(req: Request, containerName: string, path: string, userInfo?: { userId: string; isAdmin?: boolean }): Promise<Response> {
  const devWorkerHost = process.env.DEV_WORKER_HOST
  const devWorkerPort = process.env.DEV_WORKER_PORT
  
  let targetUrl: string
  let hostHeader: string
  
  if (devWorkerHost && devWorkerPort) {
    targetUrl = `http://${devWorkerHost}:${devWorkerPort}${path}`
    hostHeader = `${devWorkerHost}:${devWorkerPort}`
    console.log(`[RequestRouter] 开发模式：使用本地 Worker ${targetUrl}`)
  } else {
    targetUrl = `http://${containerName}:${getWorkerPort()}${path}`
    hostHeader = `${containerName}:${getWorkerPort()}`
  }
  
  const startTime = Date.now()
  
  try {
    const headers = new Headers(req.headers)
    headers.set('X-Forwarded-For', 'claw-web-master')
    headers.set('X-Proxy-Origin', 'claw-web-master')
    headers.set('Host', hostHeader)
    
    const masterToken = process.env.MASTER_INTERNAL_TOKEN
    if (masterToken) {
      headers.set('X-Master-Token', masterToken)
    }
    
    if (userInfo?.userId) {
      headers.set('X-User-Id', userInfo.userId)
      headers.set('X-User-Admin', userInfo.isAdmin ? 'true' : 'false')
    }
    
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    })
    
    const duration = Date.now() - startTime
    if (duration > 1000) {
      console.warn(`[RequestRouter] 慢请求警告: ${req.method} ${path} -> ${containerName} (${duration}ms)`)
    }
    
    return response
  } catch (error) {
    console.error(`[RequestRouter] 代理请求失败 (${targetUrl}):`, error)
    return createErrorResponse('PROXY_ERROR', '无法连接到Worker容器', 502)
  }
}

/**
 * 打印服务器状态信息
 */
function printServerStatus(): void {
  console.log(`\n${'='.repeat(60)}`)
  console.log('  Server Status')
  console.log(`${'='.repeat(60)}`)
  console.log(`\n[HTTP] REST API:     http://localhost:${PORT}/api/*`)
  console.log(`[WS]   WebSocket:    ws://localhost:${PORT}/ws`)
  
  // 简化的状态输出（详细端点列表可移至文档）
  console.log(`\n[API] 主要端点:`)
  console.log(`       GET  /api/health       - 健康检查`)
  console.log(`       GET  /api/info         - 服务器信息`)
  console.log(`       GET  /api/models       - 可用模型列表`)
}

// ==================== 主服务器启动函数 ====================

/**
 * 启动 HTTP 服务器
 */
export async function startServer(): Promise<void> {
  console.log('='.repeat(60))
  console.log('  Claude Code HAHA - Deep React Integration Server')
  console.log('='.repeat(60))
  
  const containerRole = process.env.CONTAINER_ROLE || 'master'
  console.log(`[Server] Container role: ${containerRole}`)
  
  // ========== Worker 模式启动 ==========
  if (containerRole === 'worker') {
    await startWorkerMode()
    return
  }

  // ========== Master 模式初始化 ==========
  await initializeMasterServices(containerRole)

  // ========== 启动 HTTP 服务器 ==========
  startMasterHTTPServer(containerRole)
  
  printServerStatus()
}

/**
 * 初始化 Master 服务
 */
async function initializeMasterServices(containerRole: string): Promise<void> {
  // Initialize database
  try {
    console.log('\n[DB] Initializing database...')
    await initDatabase()
    console.log('[DB] Database initialized successfully')
  } catch (error) {
    console.warn('[DB] Failed to initialize database:', error)
  }

  // Initialize Agent persistence service
  try {
    console.log('\n[AgentPersistence] Initializing Agent persistence service...')
    const { getAgentPersistenceService } = await import('../agents/agentPersistence')
    await getAgentPersistenceService().initialize()
    console.log('[AgentPersistence] Agent persistence service initialized')
  } catch (error) {
    console.warn('[AgentPersistence] Failed to initialize:', error)
  }

  // Initialize Agent status service
  try {
    console.log('\n[AgentStatusService] Initializing Agent status service...')
    
    const wsPushFn = (clientId: string, data: { type: string; payload: unknown; timestamp: string }) => {
      const message = {
        type: 'event',
        event: data.type,
        data: data.payload,
        timestamp: new Date(data.timestamp).getTime(),
      } as any
      
      let sentCount = 0
      for (const [, connection] of wsManager.getAllConnections()) {
        if (connection.isConnected()) {
          connection.send(message)
          sentCount++
        }
      }
      
      if (sentCount > 0) {
        console.log(`[AgentStatusService] 广播 ${data.type} 到 ${sentCount} 个客户端`)
      }
    }
    
    const agentStatusService = createAgentStatusService({ wsPush: wsPushFn })
    setAgentStatusService(agentStatusService)
    
    agentStatusService.startAutoRefresh()
    console.log('[AgentStatusService] Agent status service initialized')
  } catch (error) {
    console.warn('[AgentStatusService] Failed to initialize:', error)
  }

  // Initialize Workflow Event Service
  try {
    console.log('\n[WorkflowEventService] Initializing Workflow Event service...')
    const workflowEventService = getWorkflowEventService()
    
    workflowEventService.setPushFn((event) => {
      const message = JSON.stringify({
        type: 'event',
        event: 'workflow_event',
        data: event,
        timestamp: new Date(event.timestamp).getTime(),
      })
      
      let sentCount = 0
      for (const [, connection] of wsManager.getAllConnections()) {
        if (connection.isConnected()) {
          connection.send(JSON.parse(message))
          sentCount++
        }
      }
      
      if (sentCount > 0) {
        console.log(`[WorkflowEventService] 广播 ${event.type} 到 ${sentCount} 个客户端`)
      }
    })
    
    console.log('[WorkflowEventService] Workflow Event service initialized')
  } catch (error) {
    console.warn('[WorkflowEventService] Failed to initialize:', error)
  }

  // 设置会话标题更新回调
  try {
    sessionManager.setOnSessionTitleUpdated((sessionId: string, title: string) => {
      const message = JSON.stringify({
        type: 'session_title_updated',
        sessionId,
        title,
      })

      const allConnections = wsManager.getAllConnections()
      console.log(`[SessionTitle] Total connections in manager: ${allConnections.size}`)

      let sentCount = 0
      for (const [connId, connection] of allConnections) {
        console.log(`[SessionTitle] Connection ${connId}: isConnected=${connection.isConnected()}`)
        if (connection.isConnected()) {
          connection.send(JSON.parse(message))
          sentCount++
        }
      }

      console.log(`[SessionTitle] 广播会话标题更新: sentCount=${sentCount}, sessionId=${sessionId}, title=${title}`)
    })
  } catch (error) {
    console.warn('[SessionTitle] Failed to setup callback:', error)
  }

  // Initialize Plugin System
  try {
    console.log('\n[Plugin] Initializing plugin system...')
    await initializePluginSystem()
    console.log('[Plugin] Plugin system initialized')
  } catch (error) {
    console.warn('[Plugin] Failed to initialize plugin system:', error)
  }

  // Initialize Container Orchestrator
  if (containerRole !== 'worker') {
    try {
      console.log('\n[ContainerOrchestrator] Initializing container orchestrator...')
      const orchestrator = getContainerOrchestrator()
      const initResult = await orchestrator.initialize()
      if (initResult.success) {
        console.log('[ContainerOrchestrator] Container orchestrator initialized successfully')
      } else {
        console.warn('[ContainerOrchestrator] Failed to initialize:', initResult.error)
      }
    } catch (error) {
      console.warn('[ContainerOrchestrator] Failed to initialize:', error)
    }
  }

  // Initialize PTY Bridge
  console.log('[PTY] Initializing PTY Bridge...')
  wsPTYBridge
  console.log('[PTY] PTY Bridge initialized')

  console.log('\n[RPC] RPC methods initialized')
}

/**
 * 启动 Master HTTP 服务器
 */
function startMasterHTTPServer(containerRole: string): void {
  Bun.serve({
    port: PORT,
    async fetch(req, server) {
      const url = new URL(req.url)
      const path = url.pathname
      const method = req.method

      // WebSocket upgrade
      if (path === '/ws') {
        const success = server.upgrade(req, {
          data: {
            connectionId: uuidv4(),
            userId: null,
            sessionId: null,
            token: null,
            sendEvent: null,
          } as WebSocketData,
        })

        if (!success) {
          return new Response('WebSocket upgrade failed', { status: 500 })
        }
        return undefined as any
      }

      // 健康检查端点
      if (path === '/api/health' && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          data: {
            status: 'healthy',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            role: containerRole
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // 本地路由处理
      const localResponse = await handleRequest(req)
      if (localResponse !== null) {
        return localResponse
      }

      // Internal API 转发（开发环境支持）
      if (containerRole !== 'worker' && path.startsWith('/internal/')) {
        const masterToken = req.headers.get('X-Master-Token')
        const userId = req.headers.get('X-User-Id')
        
        if (!masterToken || !userId) {
          return createErrorResponse('UNAUTHORIZED', 'Missing X-Master-Token or X-User-Id header', 401)
        }
        
        const devWorkerHost = process.env.DEV_WORKER_HOST
        const devWorkerPort = process.env.DEV_WORKER_PORT
        
        if (devWorkerHost && devWorkerPort) {
          return await proxyToWorkerContainer(req, 'dev-worker', path, { userId, isAdmin: false })
        }
      }

      // 部署路由处理
      if (path.startsWith('/api/deployments') && containerRole !== 'worker') {
        const { deploymentRoutes } = await import('../routes')
        // 创建模拟的请求和响应对象
        const expressReq: any = {
          ...req,
          params: {},
          query: Object.fromEntries(url.searchParams),
          body: await req.json().catch(() => ({}))
        }
        
        // 从路径中提取参数
        const pathMatch = path.match(/\/api\/deployments\/(?:([^\/]+)(?:\/(\w+))?)?/)
        if (pathMatch) {
          expressReq.params.id = pathMatch[1]
          expressReq.params.action = pathMatch[2]
        }
        
        // 添加认证信息
        const authHeader = req.headers.get('authorization')
        if (authHeader) {
          expressReq.headers = { authorization: authHeader }
        }
        
        // 使用 Promise 包装 Express 路由处理
        const result = await new Promise<Response>((resolve) => {
          const expressRes: any = {
            status: (code: number) => ({
              json: (data: any) => resolve(new Response(JSON.stringify(data), {
                status: code,
                headers: { 'Content-Type': 'application/json' }
              }))
            }),
            json: (data: any) => resolve(new Response(JSON.stringify(data), {
              headers: { 'Content-Type': 'application/json' }
            }))
          }
          
          deploymentRoutes(expressReq, expressRes, () => {
            resolve(createErrorResponse('NOT_FOUND', 'Deployment route not found', 404))
          })
        })
        
        return result
      }

      // 容器路由逻辑
      if (containerRole !== 'worker') {
        const masterOnlyPaths = [
          '/api/auth/login',
          '/api/auth/register', 
          '/api/auth/me',
          '/api/auth/refresh',
          '/api/agents/execute',
          '/api/agents/orchestration',
          '/api/sessions',
          '/api/skills',
          '/api/prompt-templates',
          '/api/mcp',
          '/api/tools',
          '/api/deployments',
        ]
        const isMasterOnlyPath = masterOnlyPaths.some(masterPath => path.startsWith(masterPath))
        const isAgentMessagePath = path.match(/^\/api\/agents\/[^\/]+\/message$/)
        
        if (!isMasterOnlyPath && !isAgentMessagePath) {
          try {
            const { authMiddleware } = await import('../utils/auth')
            const auth = await authMiddleware(req)
            
            if (auth.userId) {
              const orchestrator = getContainerOrchestrator()
              let mapping = orchestrator.getUserMapping(auth.userId)
              
              if (!mapping) {
                const schedulingPolicy = getSchedulingPolicy()
                const scheduleResult = await schedulingPolicy.scheduleContainer(
                  auth.userId,
                  undefined,
                  { role: auth.isAdmin ? 'admin' : 'user' }
                )
                
                if (scheduleResult.success && scheduleResult.mapping) {
                  mapping = scheduleResult.mapping
                }
              }
              
              if (mapping) {
                return await proxyToWorkerContainer(req, mapping.container.containerName, path, {
                  userId: auth.userId,
                  isAdmin: auth.isAdmin || false
                })
              }
            }
          } catch (error) {
            console.error('[RequestRouter] 容器路由失败:', error)
          }
        }
      }

      // CORS preflight
      if (method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        })
      }

      // 其他 API 端点
      if (path === '/api/info' && method === 'GET') {
        return createSuccessResponse({
          name: 'Claude Code HAHA',
          version: '1.0.0',
          description: 'Deep React Integration Server',
          features: { websocket: true, mcp: true, auth: true },
          endpoints: {
            api: `http://localhost:${PORT}/api`,
            websocket: `ws://localhost:${PORT}/ws`,
          },
        })
      }

      if (path === '/api/models' && method === 'GET') {
        return createSuccessResponse({ models: AVAILABLE_MODELS, count: AVAILABLE_MODELS.length })
      }

      // 404
      return createErrorResponse('NOT_FOUND', `Route ${path} not found`, 404)
    },

    websocket: {
      open(ws) {
        const wsData = ws.data as WebSocketData
        handleWebSocketOpen(ws, wsData)
      },

      async message(ws, data) {
        const wsData = ws.data as WebSocketData
        await handleWebSocketMessage(ws, wsData, data)
      },

      close(ws) {
        const wsData = ws.data as WebSocketData
        handleWebSocketClose(ws, wsData)
      },
    },
  })
}

/**
 * Worker 模式启动
 */
async function startWorkerMode(): Promise<void> {
  console.log('='.repeat(60))
  console.log('  Worker Mode - Sandbox Execution Environment')
  console.log('='.repeat(60))
  
  console.log('\n[Worker] Running in sandbox mode')
  console.log('[Worker] All requests must include valid X-Master-Token')
  
  // 初始化 PTY Bridge
  console.log('\n[PTY] Initializing PTY Bridge...')
  wsPTYBridge
  
  // Start HTTP server in Worker mode
  Bun.serve({
    port: PORT,
    hostname: '0.0.0.0',
    async fetch(req) {
      const response = await handleWorkerRequest(req)
      if (response !== null) {
        return response
      }
      
      return createErrorResponse('NOT_FOUND', 'Route not found in Worker mode', 404)
    },
    
    websocket: {
      open(ws) {
        const wsData = ws.data as WebSocketData
        handleWebSocketOpen(ws, wsData)
      },
      
      async message(ws, data) {
        const wsData = ws.data as WebSocketData
        await handleWebSocketMessage(ws, wsData, data)
      },
      
      close(ws) {
        const wsData = ws.data as WebSocketData
        handleWebSocketClose(ws, wsData)
      },
    },
  })
  
  console.log(`\n${'='.repeat(60)}`)
  console.log('  Worker Mode Started')
  console.log(`${'='.repeat(60)}`)
  console.log(`\n[HTTP] Worker API:      http://localhost:${PORT}/api/*`)
  console.log(`[WS]   WebSocket:        ws://localhost:${PORT}/ws`)
}

// ==================== 进程事件处理 ====================

process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down...')
  
  await sessionManager.saveAllDirtySessions()
  
  try {
    const { getAgentPersistenceService } = await import('../agents/agentPersistence')
    await getAgentPersistenceService().forceSaveAll()
  } catch (error) {
    console.error('[Server] Failed to save Agent state:', error)
  }
  
  ptyManager.shutdown()
  wsManager.shutdown()
  await closePool()
  
  console.log('[Server] Shutdown complete')
  process.exit(0)
})

process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason)
})

export default { startServer }
