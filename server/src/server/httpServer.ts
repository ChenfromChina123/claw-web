/**
 * HTTP 服务器配置与启动
 */

import { v4 as uuidv4 } from 'uuid'
import { initDatabase, closePool } from '../db/mysql'
import { SessionManager } from '../services/sessionManager'
import { getAgentStatusService, createAgentStatusService, setAgentStatusService } from '../services/agentStatusService'
import { getWorkflowEventService } from '../services/workflowEventService'
import { getWorkspaceManager } from '../services/workspaceManager'
import { wsManager } from '../integration/wsBridge'
import { wsPTYBridge } from '../integration/wsPTYBridge'
import { ptyManager } from '../integration/ptyManager'
import { handleRequest } from '../routes'
import { handleWebSocketOpen, handleWebSocketMessage, handleWebSocketClose } from '../websocket'
import { createSuccessResponse, createErrorResponse } from '../utils/response'
import { PORT, AVAILABLE_MODELS } from '../utils/constants'
import type { WebSocketData } from '../types'

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

const sessionManager = SessionManager.getInstance()

/**
 * 注册 WebSocket RPC 方法
 */
function initializeRPCMethods(): void {
  // RPC 方法已在各模块中通过 wsManager.routeIncomingMessage 处理
  console.log('[RPC] RPC methods initialized')
}

/**
 * 启动 HTTP 服务器
 */
export async function startServer(): Promise<void> {
  console.log('='.repeat(60))
  console.log('  Claude Code HAHA - Deep React Integration Server')
  console.log('='.repeat(60))
  
  // Initialize database
  try {
    console.log('\n[DB] Initializing database...')
    await initDatabase()
    console.log('[DB] Database initialized successfully')
  } catch (error) {
    console.warn('[DB] Failed to initialize database:', error)
    console.warn('[DB] Server will start without database connection')
  }

  // Initialize Agent persistence service
  try {
    console.log('\n[AgentPersistence] Initializing Agent persistence service...')
    const { getAgentPersistenceService } = await import('../agents/agentPersistence')
    await getAgentPersistenceService().initialize()
    console.log('[AgentPersistence] Agent persistence service initialized')
  } catch (error) {
    console.warn('[AgentPersistence] Failed to initialize Agent persistence service:', error)
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
    console.warn('[AgentStatusService] Failed to initialize Agent status service:', error)
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
    console.warn('[WorkflowEventService] Failed to initialize Workflow Event service:', error)
  }

  // 设置会话标题更新回调
  try {
    console.log('\n[SessionTitle] Setting up session title update callback...')
    sessionManager.setOnSessionTitleUpdated((sessionId: string, title: string) => {
      const message = JSON.stringify({
        type: 'session_title_updated',
        sessionId,
        title,
      })

      let sentCount = 0
      for (const [, connection] of wsManager.getAllConnections()) {
        if (connection.isConnected()) {
          connection.send(JSON.parse(message))
          sentCount++
        }
      }

      if (sentCount > 0) {
        console.log(`[SessionTitle] 广播会话标题更新到 ${sentCount} 个客户端: sessionId=${sessionId}, title="${title}"`)
      }
    })
    console.log('[SessionTitle] Session title update callback set up successfully')
  } catch (error) {
    console.warn('[SessionTitle] Failed to set up session title update callback:', error)
  }

  // Initialize WebSocket RPC methods
  initializeRPCMethods()

  // Initialize PTY Bridge
  console.log('[PTY] Initializing PTY Bridge...')
  wsPTYBridge
  console.log('[PTY] PTY Bridge initialized')

  // Start HTTP server
  const server = Bun.serve({
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
        return
      }

      // 处理 HTTP 请求
      const response = await handleRequest(req)
      if (response !== null) {
        return response
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

      // Health check
      if (path === '/api/health' && method === 'GET') {
        return createSuccessResponse({
          status: 'healthy',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          dbConnected: true,
          connections: wsManager.getAllConnections().size,
        })
      }

      // Get server info
      if (path === '/api/info' && method === 'GET') {
        return createSuccessResponse({
          name: 'Claude Code HAHA',
          version: '1.0.0',
          description: 'Deep React Integration Server',
          features: {
            websocket: true,
            mcp: true,
            auth: true,
          },
          endpoints: {
            api: `http://localhost:${PORT}/api`,
            websocket: `ws://localhost:${PORT}/ws`,
          },
        })
      }

      // Get available models
      if (path === '/api/models' && method === 'GET') {
        return createSuccessResponse({
          models: AVAILABLE_MODELS,
          count: AVAILABLE_MODELS.length,
        })
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

  printServerStatus()
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
  console.log(`\n[API]  Auth Endpoints:`)
  console.log(`       POST /api/auth/register/send-code  - 发送注册验证码`)
  console.log(`       POST /api/auth/register            - 用户注册`)
  console.log(`       POST /api/auth/login               - 用户登录`)
  console.log(`       GET  /api/auth/me                  - 获取当前用户信息`)
  console.log(`\n[API]  Info Endpoints:`)
  console.log(`       GET  /api/health       - 健康检查`)
  console.log(`       GET  /api/info         - 服务器信息`)
  console.log(`\n[API]  More endpoints:`)
  console.log(`       GET  /api/models       - 可用模型列表`)
  console.log(`       GET  /api/tools        - 可用工具列表`)
  console.log(`       GET  /api/mcp/servers  - MCP 服务器列表`)
  console.log(`       GET  /api/commands     - 命令列表`)
  console.log(`\n[API]  Session Endpoints:`)
  console.log(`       GET    /api/sessions         - 获取用户会话列表`)
  console.log(`       POST   /api/sessions         - 创建新会话`)
  console.log(`       GET    /api/sessions/:id     - 加载会话详情`)
  console.log(`       PUT    /api/sessions/:id     - 更新会话信息`)
  console.log(`       DELETE /api/sessions/:id     - 删除会话`)
  console.log(`\n[API]  Tools Endpoints:`)
  console.log(`       GET    /api/tools            - 获取工具列表`)
  console.log(`       POST   /api/tools/execute     - 执行工具`)
  console.log(`\n[API]  Monitoring Endpoints:`)
  console.log(`       GET    /api/monitoring/metrics        - 获取性能指标`)
  console.log(`       GET    /api/monitoring/logs           - 获取日志`)
  console.log(`       GET    /api/monitoring/alerts         - 获取告警`)
  console.log(`\n[API]  Diagnostics Endpoints:`)
  console.log(`       GET    /api/diagnostics/health        - 健康检查`)
  console.log(`       GET    /api/diagnostics/components   - 组件详情`)
  console.log(`\n[API]  Agent Workdir Endpoints:`)
  console.log(`       GET    /api/agent/workdir/list      - 获取目录列表`)
  console.log(`       GET    /api/agent/workdir/content   - 获取文件内容`)
  console.log(`       POST   /api/agent/workdir/save      - 保存文件`)
  console.log(`       POST   /api/agent/workdir/create    - 创建文件/目录`)
  console.log(`       GET    /api/agent/workdir/download  - 下载文件`)
  console.log(`\n[API]  Userdir Endpoints:`)
  console.log(`       GET    /api/agent/userdir/info      - 获取用户目录信息`)
  console.log(`       GET    /api/agent/userdir/list      - 获取用户目录列表`)
  console.log(`       GET    /api/agent/userdir/skills    - 获取已安装 skills`)
  console.log(`       POST   /api/agent/userdir/skills/install - 安装 skill`)
  console.log(`\n[API]  Workspace Endpoints:`)
  console.log(`       POST   /api/workspace/:sessionId/upload - 上传文件`)
  console.log(`       GET    /api/workspace/:sessionId/files - 文件列表`)
  console.log(`       DELETE /api/workspace/:sessionId/files/:filename - 删除文件`)
}

// 设置关闭处理器
process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down...')
  
  // 保存所有 dirty sessions
  await sessionManager.saveAllDirtySessions()
  
  // 保存所有 Agent 状态
  try {
    const { getAgentPersistenceService } = await import('../agents/agentPersistence')
    await getAgentPersistenceService().forceSaveAll()
  } catch (error) {
    console.error('[Server] Failed to save Agent state:', error)
  }
  
  // 关闭 PTY 管理器
  ptyManager.shutdown()
  
  // 关闭 WebSocket 管理器
  wsManager.shutdown()
  
  // 关闭数据库连接
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