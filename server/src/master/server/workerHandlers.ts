/**
 * Worker 模式请求处理器
 *
 * 功能：
 * - 处理 Worker Internal API 请求
 * - Agent 执行（SSE 流式响应）
 * - PTY 终端操作
 * - 文件操作（读/写/列表）
 * - 命令执行
 */

import { v4 as uuidv4 } from 'uuid'
import type { Request, Response } from 'bun'
import { createSuccessResponse, createErrorResponse } from '../utils/response'
import { ptyManager } from '../integration/ptyManager'
import { executeAgentOnWorker } from './agentApi'

// ==================== Worker Agent 执行 ====================

/**
 * 处理 Worker Agent 执行请求（SSE 流式响应）
 */
export async function handleWorkerAgentExecute(req: Request): Promise<Response> {
  const { verifyMasterToken, extractUserFromMasterHeaders } = await import('./serverAuth')
  
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
 */
async function executeAgentOnWorkerInternal(
  userId: string,
  sessionId: string,
  message: string,
  context: any,
  sendEvent: (type: string, data: unknown) => void
): Promise<void> {
  try {
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

// ==================== Worker PTY 操作 ====================

/**
 * 处理 PTY 创建请求
 */
export async function handleWorkerPtyCreate(req: Request): Promise<Response> {
  const { verifyMasterToken, extractUserFromMasterHeaders } = await import('./serverAuth')
  
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

// ==================== Worker Internal API 路由处理 ====================

/**
 * Worker 模式 HTTP 主路由处理函数
 */
export async function handleWorkerRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // ========== Internal Health Check ==========
  if (path === '/internal/health' && method === 'GET') {
    return new Response(JSON.stringify({
      status: 'ok',
      role: 'worker',
      uptime: process.uptime(),
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // ========== Internal API 路由（需要 Master Token）==========
  if (path.startsWith('/internal/')) {
    const { verifyMasterToken } = await import('./serverAuth')
    
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

  // ========== 向后兼容的 API 路由 ==========

  // 健康检查
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

  // Agent 执行
  if (path === '/api/internal/agent/execute' && method === 'POST') {
    return await handleWorkerAgentExecute(req)
  }

  // PTY 创建
  if (path === '/api/internal/pty/create' && method === 'POST') {
    return await handleWorkerPtyCreate(req)
  }

  // LLM 聊天
  if (path === '/api/internal/llm/chat' && method === 'POST') {
    return await handleWorkerLLMChat(req)
  }

  return null
}

// ==================== Internal API 具体实现 ====================

/**
 * 处理 Internal Exec 请求
 */
async function handleInternalExec(req: Request, userId: string): Promise<Response> {
  try {
    const { command, cwd, env, timeout } = await req.json()

    if (!command) {
      return createErrorResponse('BAD_REQUEST', 'Command is required', 400)
    }

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
  const { verifyMasterToken } = await import('./serverAuth')
  
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
