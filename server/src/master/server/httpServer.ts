/**
 * HTTP 服务器配置与启动
 * 
 * 支持 Master-Worker 双角色模式：
 * - Master: 负责认证、会话管理、数据库操作、容器调度、流式转发
 * - Worker: 纯沙箱，只执行 Agent 和工具，不连接数据库
 */

import { v4 as uuidv4 } from 'uuid'
import { initDatabase, closePool, isDatabaseAvailable } from '../db/mysql'
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
import { getContainerOrchestrator } from '../orchestrator/containerOrchestrator'
import { getSchedulingPolicy } from '../orchestrator/schedulingPolicy'
import { executeAgentOnWorker } from './agentApi'
import { SSEParser } from './sseParser'
import { DEFAULT_WORKER_PORT } from '../../shared/constants'

/**
 * 获取Worker端口（从环境变量或默认值）
 */
function getWorkerPort(): number {
  return parseInt(process.env.WORKER_PORT || String(DEFAULT_WORKER_PORT), 10)
}

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
const sseParser = new SSEParser()

// ==================== Master Token 验证 ====================

/**
 * 验证 Master 内部通信 Token
 * Worker 只信任来自 Master 的请求
 */
function verifyMasterToken(request: Request): boolean {
  const masterToken = request.headers.get('X-Master-Token')
  const expectedToken = process.env.MASTER_INTERNAL_TOKEN
  
  if (!expectedToken) {
    console.warn('[MasterToken] MASTER_INTERNAL_TOKEN not configured, rejecting all internal requests')
    return false
  }
  
  if (!masterToken) {
    console.warn('[MasterToken] Missing X-Master-Token header')
    return false
  }
  
  if (masterToken !== expectedToken) {
    console.warn('[MasterToken] Invalid X-Master-Token')
    return false
  }
  
  return true
}

/**
 * 提取用户身份信息（Worker 模式下从 Master 头部获取）
 */
function extractUserFromMasterHeaders(req: Request): { userId?: string; isAdmin?: boolean } | null {
  const userId = req.headers.get('X-User-Id')
  const isAdmin = req.headers.get('X-User-Admin') === 'true'
  
  if (!userId) {
    return null
  }
  
  return { userId, isAdmin }
}

/**
 * Worker 模式下的 Agent 执行处理器（SSE 流式响应）
 */
async function handleWorkerAgentExecute(req: Request): Promise<Response> {
  // 1. 验证 Master Token
  if (!verifyMasterToken(req)) {
    return createErrorResponse('UNAUTHORIZED', 'Invalid or missing Master token', 401)
  }
  
  // 2. 从 Master 头部获取用户信息
  const userInfo = extractUserFromMasterHeaders(req)
  if (!userInfo?.userId) {
    return createErrorResponse('BAD_REQUEST', 'Missing X-User-Id header', 400)
  }
  
  // 3. 解析请求体
  let body: any
  try {
    body = await req.json()
  } catch {
    return createErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400)
  }
  
  const { sessionId, message, context } = body
  
  if (!sessionId || !message) {
    return createErrorResponse('BAD_REQUEST', 'Missing sessionId or message', 400)
  }
  
  // 4. 创建 SSE 流
  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (type: string, data: unknown) => {
        const payload = `data: ${JSON.stringify({ type, data })}\n\n`
        try {
          controller.enqueue(new TextEncoder().encode(payload))
        } catch (e) {
          console.error('[WorkerAgent] Failed to enqueue event:', e)
        }
      }
      
      // 执行 Agent（这里需要导入 Agent 执行器）
      executeAgentOnWorkerInternal(
        userInfo.userId!,
        sessionId,
        message,
        context || {},
        sendEvent
      ).catch(error => {
        console.error('[WorkerAgent] Execution error:', error)
        sendEvent('error', { message: error.message })
        controller.close()
      })
    }
  })
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

/**
 * Worker 内部 Agent 执行逻辑
 * 这里调用实际的 Agent 执行器
 */
async function executeAgentOnWorkerInternal(
  userId: string,
  sessionId: string,
  message: string,
  context: any,
  sendEvent: (type: string, data: unknown) => void
): Promise<void> {
  try {
    // 导入 Agent 执行器
    const { getAgentExecutor } = await import('../agents/executor')
    const executor = getAgentExecutor()
    
    await executor.execute({
      userId,
      sessionId,
      message,
      messages: context.messages || [],
      tools: context.tools || [],
      quota: context.quota,
      onEvent: sendEvent,
    })
  } catch (error) {
    console.error('[WorkerAgent] Executor error:', error)
    sendEvent('error', { message: error instanceof Error ? error.message : 'Unknown error' })
  }
}

/**
 * Worker 模式下的文件操作处理器
 */
async function handleWorkerFileOperation(req: Request, path: string): Promise<Response> {
  if (!verifyMasterToken(req)) {
    return createErrorResponse('UNAUTHORIZED', 'Invalid or missing Master token', 401)
  }
  
  const userInfo = extractUserFromMasterHeaders(req)
  if (!userInfo?.userId) {
    return createErrorResponse('BAD_REQUEST', 'Missing X-User-Id header', 400)
  }
  
  // 文件操作逻辑...
  // 这里可以复用现有的文件操作路由
  return createErrorResponse('NOT_IMPLEMENTED', 'File operations on Worker not implemented', 501)
}

/**
 * Worker 模式下的 PTY 创建处理器
 */
async function handleWorkerPtyCreate(req: Request): Promise<Response> {
  if (!verifyMasterToken(req)) {
    return createErrorResponse('UNAUTHORIZED', 'Invalid or missing Master token', 401)
  }
  
  const userInfo = extractUserFromMasterHeaders(req)
  if (!userInfo?.userId) {
    return createErrorResponse('BAD_REQUEST', 'Missing X-User-Id header', 400)
  }
  
  let body: any
  try {
    body = await req.json()
  } catch {
    return createErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400)
  }
  
  const { sessionId, shell, cwd } = body
  
  try {
    const ptySession = await ptyManager.createSession(
      sessionId || uuidv4(),
      shell || '/bin/bash',
      cwd || '/app'
    )
    
    return createSuccessResponse({
      sessionId: ptySession.sessionId,
      pid: ptySession.pid,
    })
  } catch (error) {
    console.error('[WorkerPTY] Create error:', error)
    return createErrorResponse('PTY_ERROR', error instanceof Error ? error.message : 'Failed to create PTY', 500)
  }
}

/**
 * Worker 模式 HTTP 处理函数
 */
async function handleWorkerRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // ========== 新增：Worker Internal API（深度拆分架构）==========

  // 0. Worker Internal Health Check
  if (path === '/internal/health' && method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok',
      role: 'worker',
      uptime: process.uptime(),
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // Worker Internal API 路由（需要 Master Token）
  if (path.startsWith('/internal/')) {
    if (!verifyMasterToken(req)) {
      return createErrorResponse('UNAUTHORIZED', 'Invalid or missing Master token', 403)
    }

    const userId = req.headers.get('X-User-Id')
    if (!userId) {
      return createErrorResponse('BAD_REQUEST', 'X-User-Id header required', 400)
    }

    // /internal/exec - 执行命令
    if (path === '/internal/exec' && method === 'POST') {
      return await handleInternalExec(req, userId)
    }

    // /internal/pty/* - PTY 操作
    if (path === '/internal/pty/create' && method === 'POST') {
      return await handleInternalPtyCreate(req, userId)
    }
    if (path === '/internal/pty/write' && method === 'POST') {
      return await handleInternalPtyWrite(req, userId)
    }
    if (path === '/internal/pty/resize' && method === 'POST') {
      return await handleInternalPtyResize(req, userId)
    }
    if (path === '/internal/pty/destroy' && method === 'POST') {
      return await handleInternalPtyDestroy(req, userId)
    }

    // /internal/file/* - 文件操作
    if (path === '/internal/file/read' && method === 'POST') {
      return await handleInternalFileRead(req, userId)
    }
    if (path === '/internal/file/write' && method === 'POST') {
      return await handleInternalFileWrite(req, userId)
    }
    if (path === '/internal/file/list' && method === 'POST') {
      return await handleInternalFileList(req, userId)
    }
  }

  // ========== 原有 Worker API（保持向后兼容）==========

  // 1. 健康检查
  if (path === '/api/health' && method === 'GET') {
    return new Response(JSON.stringify({
      success: true,
      data: {
        status: 'healthy',
        role: 'worker',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // 2. Agent 执行（主入口）
  if (path === '/api/internal/agent/execute' && method === 'POST') {
    return await handleWorkerAgentExecute(req)
  }

  // 3. PTY 创建
  if (path === '/api/internal/pty/create' && method === 'POST') {
    return await handleWorkerPtyCreate(req)
  }

  // 4. 文件操作
  if (path.startsWith('/api/internal/files/')) {
    return await handleWorkerFileOperation(req, path)
  }

  // 5. 工具执行
  if (path === '/api/internal/tools/execute' && method === 'POST') {
    if (!verifyMasterToken(req)) {
      return createErrorResponse('UNAUTHORIZED', 'Invalid or missing Master token', 401)
    }
    // 工具执行逻辑...
    return createErrorResponse('NOT_IMPLEMENTED', 'Tool execution not implemented', 501)
  }

  // 6. LLM 聊天（Worker 调用 Master 的 LLM 服务）
  if (path === '/api/internal/llm/chat' && method === 'POST') {
    return await handleWorkerLLMChat(req)
  }

  return null
}

/**
 * 处理 Internal Exec 请求
 */
async function handleInternalExec(req: Request, userId: string): Promise<Response> {
  try {
    const { command, cwd, env, timeout } = await req.json()

    if (!command) {
      return createErrorResponse('BAD_REQUEST', 'Command is required', 400)
    }

    // 使用 Worker SandBox 执行命令
    const { workerSandbox } = await import('../worker/sandbox')
    const result = await workerSandbox.exec(command, { cwd, env, timeout })

    return new Response(JSON.stringify({
      success: result.exitCode === 0,
      data: result,
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message, 500)
  }
}

/**
 * 处理 Internal PTY 创建请求
 */
async function handleInternalPtyCreate(req: Request, userId: string): Promise<Response> {
  try {
    const { cols, rows, cwd } = await req.json()

    const { workerPTYManager } = await import('../worker/terminal/ptyManager')
    const session = workerPTYManager.create(userId, { cols, rows, cwd })

    return new Response(JSON.stringify({
      success: true,
      data: { sessionId: session.id, pid: session.pty.pid },
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message, 500)
  }
}

/**
 * 处理 Internal PTY 写入请求
 */
async function handleInternalPtyWrite(req: Request, userId: string): Promise<Response> {
  try {
    const { sessionId, data } = await req.json()

    const { workerPTYManager } = await import('../worker/terminal/ptyManager')
    const success = workerPTYManager.write(sessionId, data)

    return new Response(JSON.stringify({ success }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message, 500)
  }
}

/**
 * 处理 Internal PTY 调整大小请求
 */
async function handleInternalPtyResize(req: Request, userId: string): Promise<Response> {
  try {
    const { sessionId, cols, rows } = await req.json()

    const { workerPTYManager } = await import('../worker/terminal/ptyManager')
    const success = workerPTYManager.resize(sessionId, cols, rows)

    return new Response(JSON.stringify({ success }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message, 500)
  }
}

/**
 * 处理 Internal PTY 销毁请求
 */
async function handleInternalPtyDestroy(req: Request, userId: string): Promise<Response> {
  try {
    const { sessionId } = await req.json()

    const { workerPTYManager } = await import('../worker/terminal/ptyManager')
    const success = workerPTYManager.destroy(sessionId)

    return new Response(JSON.stringify({ success }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message, 500)
  }
}

/**
 * 处理 Internal 文件读取请求
 */
async function handleInternalFileRead(req: Request, userId: string): Promise<Response> {
  try {
    const { path, encoding } = await req.json()

    const { workerSandbox } = await import('../worker/sandbox')
    const result = await workerSandbox.readFile(path, encoding || 'utf8')

    return new Response(JSON.stringify({
      success: !result.error,
      data: result,
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message, 500)
  }
}

/**
 * 处理 Internal 文件写入请求
 */
async function handleInternalFileWrite(req: Request, userId: string): Promise<Response> {
  try {
    const { path, content } = await req.json()

    const { workerSandbox } = await import('../worker/sandbox')
    const result = await workerSandbox.writeFile(path, content)

    return new Response(JSON.stringify({
      success: result.success,
      error: result.error,
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message, 500)
  }
}

/**
 * 处理 Internal 文件列表请求
 */
async function handleInternalFileList(req: Request, userId: string): Promise<Response> {
  try {
    const { path } = await req.json()

    const { workerSandbox } = await import('../worker/sandbox')
    const result = await workerSandbox.listDir(path)

    return new Response(JSON.stringify({
      success: !result.error,
      data: result,
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error: any) {
    return createErrorResponse('INTERNAL_ERROR', error.message, 500)
  }
}

/**
 * 处理 Worker 的 LLM 聊天请求
 * Worker 通过此接口调用 Master 的 LLM 服务
 */
async function handleWorkerLLMChat(req: Request): Promise<Response> {
  // 验证 Master Token
  if (!verifyMasterToken(req)) {
    return createErrorResponse('UNAUTHORIZED', 'Invalid or missing Master token', 401)
  }

  try {
    const body = await req.json()
    const { messages, options, tools } = body

    console.log('[Master LLM] 收到 Worker LLM 请求:', { 
      messageCount: messages?.length,
      model: options?.model,
      toolCount: tools?.length 
    })

    // 调用 LLM 服务
    const { llmService } = await import('../services/llmService')
    const response = await llmService.chat(messages, options, tools)

    console.log('[Master LLM] LLM 响应成功:', {
      contentLength: response.content?.length,
      toolCallsCount: response.toolCalls?.length
    })

    return new Response(JSON.stringify({
      success: true,
      data: response
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('[Master LLM] LLM 调用失败:', error)
    return createErrorResponse(
      'LLM_ERROR',
      error instanceof Error ? error.message : 'LLM service error',
      500
    )
  }
}

/**
 * 注册 WebSocket RPC 方法
 */
function initializeRPCMethods(): void {
  // RPC 方法已在各模块中通过 wsManager.routeIncomingMessage 处理
  console.log('[RPC] RPC methods initialized')
}

/**
 * 从请求中提取用户身份信息
 */
function extractUserFromRequest(req: Request): { userId?: string; username?: string; role?: string } | null {
  // 从 Authorization header 提取
  const authHeader = req.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    try {
      const payload = decodeJWTPayload(token)
      return {
        userId: payload.userId || payload.sub,
        username: payload.username || payload.email,
        role: payload.role
      }
    } catch {
      // 解码失败
    }
  }
  
  // 从 URL 查询参数提取（用于 WebSocket 等场景）
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (userId) {
    return {
      userId,
      username: url.searchParams.get('username') || undefined,
      role: url.searchParams.get('role') || undefined
    }
  }
  
  return null
}

/**
 * 解码 JWT Payload（不验证签名）
 */
function decodeJWTPayload(token: string): any {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format')
    }
    const payload = parts[1]
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)
  } catch (error) {
    console.error('[JWT] 解码失败:', error)
    return {}
  }
}

/**
 * 代理请求到 Worker 容器
 * 使用 Docker 网络内部通信（通过容器名称）
 * 
 * 架构说明：
 * - Master 负责认证，将用户信息通过头部传递给 Worker
 * - Worker 信任来自 Master 的请求，不再重复验证 token
 * - 使用 X-Master-Token 进行内部 API 认证
 * 
 * 开发环境配置：
 * - 设置 DEV_WORKER_HOST 和 DEV_WORKER_PORT 环境变量来使用本地 Worker
 * - 例如：DEV_WORKER_HOST=localhost DEV_WORKER_PORT=3001
 */
async function proxyToWorkerContainer(req: Request, containerName: string, path: string, userInfo?: { userId: string; isAdmin?: boolean }): Promise<Response> {
  // 检查是否为开发环境配置
  const devWorkerHost = process.env.DEV_WORKER_HOST
  const devWorkerPort = process.env.DEV_WORKER_PORT
  
  let targetUrl: string
  let hostHeader: string
  
  if (devWorkerHost && devWorkerPort) {
    // 开发环境：使用配置的本地 Worker 地址
    targetUrl = `http://${devWorkerHost}:${devWorkerPort}${path}`
    hostHeader = `${devWorkerHost}:${devWorkerPort}`
    console.log(`[RequestRouter] 开发模式：使用本地 Worker ${targetUrl}`)
  } else {
    // 生产环境：使用 Docker 网络，通过容器名称访问
    targetUrl = `http://${containerName}:${getWorkerPort()}${path}`
    hostHeader = `${containerName}:${getWorkerPort()}`
  }
  
  const startTime = Date.now()
  
  try {
    // 复制请求头
    const headers = new Headers(req.headers)
    headers.set('X-Forwarded-For', 'claw-web-master')
    headers.set('X-Proxy-Origin', 'claw-web-master')
    headers.set('Host', hostHeader)
    
    // 设置 Master 内部通信 Token（Worker 只信任带有此 Token 的请求）
    const masterToken = process.env.MASTER_INTERNAL_TOKEN
    if (masterToken) {
      headers.set('X-Master-Token', masterToken)
    }
    
    // 将认证后的用户信息传递给 Worker
    if (userInfo?.userId) {
      headers.set('X-User-Id', userInfo.userId)
      headers.set('X-User-Admin', userInfo.isAdmin ? 'true' : 'false')
    }
    
    // 转发请求
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
 * 启动 HTTP 服务器
 */
export async function startServer(): Promise<void> {
  console.log('='.repeat(60))
  console.log('  Claude Code HAHA - Deep React Integration Server')
  console.log('='.repeat(60))
  
  // 获取容器角色（在整个函数中使用）
  const containerRole = process.env.CONTAINER_ROLE || 'master'
  console.log(`[Server] Container role: ${containerRole}`)
  
  // ========== Worker 模式启动 ==========
  if (containerRole === 'worker') {
    await startWorkerMode()
    return
  }
  // ========== Worker 模式启动结束 ==========

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

  // Initialize Plugin System
  try {
    console.log('\n[Plugin] Initializing plugin system...')
    await initializePluginSystem()
    console.log('[Plugin] Plugin system initialized')
  } catch (error) {
    console.warn('[Plugin] Failed to initialize plugin system:', error)
  }

  // Initialize Container Orchestrator (only for master/orchestrator roles)
  if (containerRole !== 'worker') {
    try {
      console.log('\n[ContainerOrchestrator] Initializing container orchestrator...')
      const { getContainerOrchestrator } = await import('../orchestrator/containerOrchestrator')
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
  } else {
    console.log('\n[ContainerOrchestrator] Skipping orchestrator initialization (worker mode)')
  }

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
      // 简单的健康检查端点（不需要认证，在路由处理之前）
      if (path === '/api/health' && method === 'GET') {
        return new Response(JSON.stringify({
          success: true,
          data: {
            status: 'healthy',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            role: process.env.CONTAINER_ROLE || 'unknown'
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // 先尝试本地路由处理（Master 本地 API）
      const localResponse = await handleRequest(req)
      if (localResponse !== null) {
        return localResponse
      }

      // ========== Internal API 转发（开发环境支持）==========
      // /internal/* 路径直接转发到 Worker，用于开发环境测试
      // 这些请求需要包含 X-Master-Token 和 X-User-Id 头部
      if (containerRole !== 'worker' && path.startsWith('/internal/')) {
        const masterToken = req.headers.get('X-Master-Token')
        const userId = req.headers.get('X-User-Id')
        
        if (!masterToken || !userId) {
          return createErrorResponse('UNAUTHORIZED', 'Missing X-Master-Token or X-User-Id header', 401)
        }
        
        // 开发环境：使用 DEV_WORKER_HOST/DEV_WORKER_PORT
        // 生产环境：使用容器编排器分配的 Worker
        const devWorkerHost = process.env.DEV_WORKER_HOST
        const devWorkerPort = process.env.DEV_WORKER_PORT
        
        if (devWorkerHost && devWorkerPort) {
          console.log(`[RequestRouter] 开发模式：转发 ${path} 到本地 Worker ${devWorkerHost}:${devWorkerPort}`)
          return await proxyToWorkerContainer(req, 'dev-worker', path, {
            userId,
            isAdmin: false
          })
        }
      }

      // ========== 容器路由逻辑 ==========
      // 只在 Master 角色下启用容器路由
      // 排除需要在 Master 本地处理的路径：
      // - 认证相关路径
      // - Agent 执行相关路径（LLM 调用在 Master 中进行）
      // - 会话管理路径
      // - 技能管理路径
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
      ]
      const isMasterOnlyPath = masterOnlyPaths.some(masterPath => path.startsWith(masterPath))
      
      // Agent 消息发送也在 Master 中处理
      const isAgentMessagePath = path.match(/^\/api\/agents\/[^\/]+\/message$/)
      
      console.log(`[RequestRouter] path=${path}, isMasterOnlyPath=${isMasterOnlyPath}, containerRole=${containerRole}`)
      
      if (containerRole !== 'worker' && !isMasterOnlyPath && !isAgentMessagePath) {
        try {
          // 从请求中提取并验证用户身份（Master 负责所有认证）
          const { authMiddleware } = await import('../utils/auth')
          const auth = await authMiddleware(req)
          
          console.log(`[RequestRouter] auth result: userId=${auth.userId}, isAdmin=${auth.isAdmin}`)
          
          if (auth.userId) {
            // 获取容器编排器
            const orchestrator = getContainerOrchestrator()
            let mapping = orchestrator.getUserMapping(auth.userId)
            
            console.log(`[RequestRouter] userMapping: ${mapping ? mapping.container.containerName : 'null'}`)
            
            // 如果没有容器映射，触发调度分配
            if (!mapping) {
              console.log(`[RequestRouter] 用户 ${auth.userId} 无容器，开始调度...`)
              const schedulingPolicy = getSchedulingPolicy()
              const scheduleResult = await schedulingPolicy.scheduleContainer(
                auth.userId,
                undefined,
                { role: auth.isAdmin ? 'admin' : 'user' }
              )
              
              if (scheduleResult.success && scheduleResult.mapping) {
                mapping = scheduleResult.mapping
                console.log(`[RequestRouter] 成功为用户 ${auth.userId} 分配容器: ${mapping.container.containerName} (${scheduleResult.strategy})`)
              } else {
                console.warn(`[RequestRouter] 为用户 ${auth.userId} 分配容器失败: ${scheduleResult.error}`)
              }
            }
            
            // 如果有容器映射，代理请求到 Worker 容器
            // 将认证后的用户信息传递给 Worker，Worker 不再重复验证
            if (mapping) {
              console.log(`[RequestRouter] 代理请求到 Worker: ${mapping.container.containerName}`)
              return await proxyToWorkerContainer(req, mapping.container.containerName, path, {
                userId: auth.userId,
                isAdmin: auth.isAdmin || false
              })
            }
          }
        } catch (error) {
          console.error('[RequestRouter] 容器路由失败:', error)
          // 路由失败时继续本地处理
        }
      }
      // ========== 容器路由逻辑结束 ==========

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
          dbConnected: isDatabaseAvailable(),
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
 * Worker 模式启动
 * Worker 是纯沙箱，只初始化必要的组件
 */
async function startWorkerMode(): Promise<void> {
  console.log('='.repeat(60))
  console.log('  Worker Mode - Sandbox Execution Environment')
  console.log('='.repeat(60))
  
  console.log('\n[Worker] Running in sandbox mode')
  console.log('[Worker] Database connection disabled - Master handles all DB operations')
  console.log('[Worker] All requests must include valid X-Master-Token')
  
  // 初始化 PTY Bridge（Worker 也需要支持终端操作）
  console.log('\n[PTY] Initializing PTY Bridge...')
  wsPTYBridge
  console.log('[PTY] PTY Bridge initialized')
  
  // Start HTTP server in Worker mode
  const server = Bun.serve({
    port: PORT,
    hostname: '0.0.0.0',
    async fetch(req) {
      // Worker 模式下使用简化的路由处理
      const response = await handleWorkerRequest(req)
      if (response !== null) {
        return response
      }
      
      // 404 for unmatched routes
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
  console.log(`\n[Worker] Internal API Endpoints:`)
  console.log(`       POST /api/internal/agent/execute - Agent execution (Master only)`)
  console.log(`       POST /api/internal/pty/create    - PTY creation (Master only)`)
  console.log(`       POST /api/internal/files/*      - File operations (Master only)`)
  console.log(`       POST /api/internal/tools/execute - Tool execution (Master only)`)
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
  console.log(`       POST   /api/agent/workdir/upload    - 上传文件`)
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