/**
 * Claude Code HAHA - Deep React Integration Server
 * 
 * A comprehensive server that integrates the React frontend with backend services:
 * - WebSocket RPC bridge for real-time communication
 * - Enhanced tool execution system
 * - Session management with AI streaming
 * - MCP server integration
 * - Authentication with JWT
 * - File watching and sandbox isolation
 */

import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'
import { initDatabase, closePool } from './db/mysql'
import { SessionManager } from './services/sessionManager'
import { authService } from './services/authService'
import { githubAuthService } from './services/githubAuthService'
import { verifyToken, extractTokenFromHeader } from './services/jwtService'
import { wsManager } from './integration/wsBridge'
import { toolExecutor, EnhancedToolExecutor } from './integration/enhancedToolExecutor'
import { WebCommandBridge, parseUserInput } from './integrations/commandBridge'
import { WebMCPBridge } from './integrations/mcpBridge'
import { WebAgentRunner } from './integrations/agentRunner'
import { WebSessionBridge } from './integrations/sessionBridge'
import { appStateManager } from './integration/webStore'
import type { WebSocketMessage, RPCContext } from './integration/wsBridge'
import type { ToolExecutionContext } from './integration/enhancedToolExecutor'
import type { ConversationMessage, ToolCall, LoginRequest, RegisterRequest, ResetPasswordRequest } from './models/types'

const PORT = parseInt(process.env.PORT || '3000', 10)
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10)

// ==================== Types ====================

interface WebSocketData {
  connectionId: string
  userId: string | null
  sessionId: string | null
  token: string | null
  sendEvent: ((event: string, data: unknown) => void) | null
}

interface SessionConversationState {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  toolCalls: ToolCall[]
}

// ==================== Configuration ====================

const AVAILABLE_MODELS = [
  { id: 'qwen-plus', name: '通义千问 Plus', provider: 'aliyun', description: '最适合编程和复杂推理' },
  { id: 'qwen-turbo', name: '通义千问 Turbo', provider: 'aliyun', description: '快速响应，适合简单任务' },
  { id: 'qwen-max', name: '通义千问 Max', provider: 'aliyun', description: '最强能力，适合最复杂任务' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', description: 'Anthropic 最强编程模型' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', description: '最通用，最强推理能力' },
]

// ==================== Anthropic Client Factory ====================

function getAnthropicClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? undefined,
    authToken: process.env.ANTHROPIC_AUTH_TOKEN ?? undefined,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(300000), 10),
    maxRetries: 0,
  })
}

// ==================== Response Helpers ====================

function createSuccessResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}

function createErrorResponse(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

// ==================== Auth Middleware ====================

async function authMiddleware(request: Request): Promise<{ userId: string | null; isAdmin: boolean | null }> {
  const authHeader = request.headers.get('Authorization')
  const token = await extractTokenFromHeader(authHeader)

  if (!token) {
    return { userId: null, isAdmin: null }
  }

  const payload = await verifyToken(token)
  if (!payload) {
    return { userId: null, isAdmin: null }
  }

  return { userId: payload.userId, isAdmin: payload.isAdmin || null }
}

// ==================== Event Sender Factory ====================

function createEventSender(ws: unknown): (event: string, data: unknown) => void {
  return (event: string, data: unknown) => {
    try {
      const socket = ws as { send?: (data: string) => void; readyState?: number }
      if (socket.send && socket.readyState === 1) {
        const payload = JSON.stringify({ type: 'event', event, data, timestamp: Date.now() })
        socket.send(payload)
      }
    } catch (error) {
      console.error('Failed to send event:', error)
    }
  }
}

// ==================== Session Conversation Manager ====================

class SessionConversationManager {
  private toolExecutor: EnhancedToolExecutor
  private commandBridge: WebCommandBridge
  private mcpBridge: WebMCPBridge
  private agentRunner: WebAgentRunner
  private sessionBridge: WebSessionBridge

  constructor() {
    this.toolExecutor = toolExecutor
    this.commandBridge = new WebCommandBridge()
    this.mcpBridge = new WebMCPBridge()
    this.agentRunner = new WebAgentRunner()
    this.sessionBridge = new WebSessionBridge()
  }

  async processMessage(
    sessionId: string,
    userMessage: string,
    model: string,
    sessionManager: SessionManager,
    sendEvent: (event: string, data: unknown) => void
  ): Promise<void> {
    // Check if input is a command
    const parsed = parseUserInput(userMessage)
    if (parsed.isCommand && parsed.command) {
      const result = await this.commandBridge.executeCommand(parsed.command, sendEvent)
      sendEvent('command_result', result)
      return
    }

    // Add user message to session
    sessionManager.addMessage(sessionId, 'user', userMessage)

    const sessionData = sessionManager.getInMemorySession(sessionId)
    if (!sessionData) {
      sendEvent('error', { message: 'Session not found' })
      return
    }

    const messages = sessionData.messages
    const client = getAnthropicClient()

    console.log(`[${sessionId}] Starting streaming with model: ${model}`)
    console.log(`[${sessionId}] Total messages in history: ${messages.length}`)

    try {
      let maxIterations = 10
      let iteration = 0

      while (iteration < maxIterations) {
        iteration++
        console.log(`[${sessionId}] API iteration ${iteration}, messages: ${messages.length}`)

        sendEvent('message_start', { iteration })

        const stream = client.messages.stream({
          model,
          max_tokens: 4096,
          messages: messages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          })),
          tools: this.toolExecutor.getAnthropicTools() as Anthropic.Tool[],
        })

        let assistantText = ''
        let pendingToolCalls: Array<{ id: string; name: string; input: string }> = []
        let currentTextBlock = ''
        let executedToolCalls: ToolCall[] = []

        for await (const event of stream) {
          console.log(`[${sessionId}] Stream event: ${event.type}`)

          switch (event.type) {
            case 'content_block_start':
              if (event.content_block.type === 'tool_use') {
                const toolId = event.content_block.id || uuidv4()
                const toolName = event.content_block.name || ''
                console.log(`[${sessionId}] Tool use started: ${toolName}`)
                pendingToolCalls.push({ id: toolId, name: toolName, input: '' })
                sendEvent('tool_use', { id: toolId, name: toolName })
              } else if (event.content_block.type === 'text') {
                currentTextBlock = ''
              }
              break

            case 'content_block_delta':
              if (event.delta.type === 'text_delta') {
                currentTextBlock += event.delta.text
                assistantText += event.delta.text
                sendEvent('content_block_delta', { text: event.delta.text })
              } else if (event.delta.type === 'input_json_delta') {
                if (pendingToolCalls.length > 0) {
                  const lastTool = pendingToolCalls[pendingToolCalls.length - 1]
                  lastTool.input += event.delta.partial_json
                  sendEvent('tool_input_delta', { id: lastTool.id, partial_json: event.delta.partial_json })
                }
              }
              break

            case 'content_block_stop':
              break

            case 'message_delta':
              if (event.delta.stop_reason) {
                sendEvent('message_stop', { stop_reason: event.delta.stop_reason, iteration })
              }
              break

            case 'message_stop':
              console.log(`[${sessionId}] Message stream completed, processing ${pendingToolCalls.length} tool calls`)
              
              executedToolCalls = []

              for (const tool of pendingToolCalls) {
                const toolInput = tool.input ? JSON.parse(tool.input) : {}
                sendEvent('tool_start', { name: tool.name, input: toolInput })

                const toolCall: ToolCall = {
                  id: tool.id,
                  messageId: '',
                  sessionId,
                  toolName: tool.name,
                  toolInput,
                  toolOutput: null,
                  status: 'pending',
                  createdAt: new Date(),
                }

                try {
                  const result = await this.toolExecutor.execute(tool.name, toolInput, sendEvent)

                  toolCall.toolOutput = result.result as Record<string, unknown>
                  toolCall.status = result.success ? 'completed' : 'error'

                  sessionManager.addToolCall(sessionId, toolCall)
                  sessionManager.addMessage(sessionId, 'user', JSON.stringify({
                    tool_use_id: tool.id,
                    name: tool.name,
                    result: result.result,
                    error: result.error,
                  }))

                  console.log(`[${sessionId}] Tool ${tool.name} completed`)
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error)
                  console.error(`[${sessionId}] Tool ${tool.name} error:`, errorMessage)

                  toolCall.toolOutput = { error: errorMessage }
                  toolCall.status = 'error'

                  sessionManager.addToolCall(sessionId, toolCall)
                  sessionManager.addMessage(sessionId, 'user', JSON.stringify({
                    tool_use_id: tool.id,
                    name: tool.name,
                    error: errorMessage,
                  }))
                }

                executedToolCalls.push(toolCall)
              }

              pendingToolCalls = []
              break
          }
        }

        if (assistantText) {
          sessionManager.addMessage(sessionId, 'assistant', assistantText, executedToolCalls)
        }

        const finalSession = sessionManager.getInMemorySession(sessionId)
        if (!finalSession) break

        const lastMsg = finalSession.messages[finalSession.messages.length - 1]
        if (lastMsg?.role !== 'assistant' || !lastMsg.toolCalls || lastMsg.toolCalls.length === 0) {
          console.log(`[${sessionId}] Conversation completed, total messages: ${finalSession.messages.length}`)
          sendEvent('conversation_end', { totalMessages: finalSession.messages.length })
          break
        }

        const lastTool = lastMsg.toolCalls[lastMsg.toolCalls.length - 1]
        if (lastTool.status !== 'pending' && iteration < maxIterations) {
          console.log(`[${sessionId}] Tool was used, continuing with ${finalSession.messages.length} messages...`)
          continue
        }

        console.log(`[${sessionId}] Conversation completed`)
        break
      }

      if (iteration >= maxIterations) {
        console.log(`[${sessionId}] Max iterations reached`)
        sendEvent('max_iterations_reached', { iterations: iteration })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[${sessionId}] API call error:`, errorMessage)
      sendEvent('error', { message: errorMessage })
    }
  }
}

const sessionConversationManager = new SessionConversationManager()
const sessionManager = SessionManager.getInstance()

// ==================== Auth Route Handler ====================

async function handleAuthRoutes(path: string, method: string, request: Request): Promise<Response> {
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (path === '/api/auth/register/send-code' && method === 'POST') {
    try {
      const body = await request.json() as { email: string }
      const email = body.email
      await authService.sendRegisterCode(email)
      return createSuccessResponse({ message: '验证码已发送到您的邮箱' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送验证码失败'
      return createErrorResponse('SEND_CODE_FAILED', message, 400)
    }
  }

  if (path === '/api/auth/register' && method === 'POST') {
    try {
      const body = await request.json() as RegisterRequest
      const registerRequest: RegisterRequest = {
        email: body.email,
        username: body.username,
        password: body.password,
        code: body.code,
      }
      const result = await authService.register(registerRequest)
      return createSuccessResponse(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : '注册失败'
      return createErrorResponse('REGISTER_FAILED', message, 400)
    }
  }

  if (path === '/api/auth/login' && method === 'POST') {
    try {
      const body = await request.json() as LoginRequest
      const loginRequest: LoginRequest = {
        email: body.email,
        password: body.password,
      }
      const result = await authService.login(loginRequest)
      return createSuccessResponse(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败'
      return createErrorResponse('LOGIN_FAILED', message, 401)
    }
  }

  if (path === '/api/auth/forgot-password/send-code' && method === 'POST') {
    try {
      const body = await request.json() as { email: string }
      const email = body.email
      await authService.sendForgotPasswordCode(email)
      return createSuccessResponse({ message: '验证码已发送到您的邮箱' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送验证码失败'
      return createErrorResponse('SEND_CODE_FAILED', message, 400)
    }
  }

  if (path === '/api/auth/forgot-password' && method === 'POST') {
    try {
      const body = await request.json() as ResetPasswordRequest
      const resetRequest: ResetPasswordRequest = {
        email: body.email,
        code: body.code,
        newPassword: body.newPassword,
      }
      await authService.resetPassword(resetRequest)
      return createSuccessResponse({ message: '密码重置成功' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '重置密码失败'
      return createErrorResponse('RESET_PASSWORD_FAILED', message, 400)
    }
  }

  if (path === '/api/auth/me' && method === 'GET') {
    const auth = await authMiddleware(request)
    if (!auth.userId) {
      return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
    }
    const user = await authService.getUserById(auth.userId)
    if (!user) {
      return createErrorResponse('USER_NOT_FOUND', '用户不存在', 404)
    }
    return createSuccessResponse(user)
  }

  // GitHub OAuth 登录
  if (path === '/api/auth/github' && method === 'GET') {
    const authUrl = githubAuthService.getAuthUrl()
    return new Response(null, {
      status: 302,
      headers: {
        'Location': authUrl,
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  // GitHub OAuth 回调
  if (path === '/api/auth/github/callback' && method === 'GET') {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    if (error) {
      // 重定向到前端登录页面，并带上错误信息
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${frontendUrl}/login?error=${encodeURIComponent(errorDescription || error)}`,
        },
      })
    }

    if (!code) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${frontendUrl}/login?error=${encodeURIComponent('未收到授权码')}`,
        },
      })
    }

    try {
      const result = await githubAuthService.handleCallback(code)
      // 重定向到前端，带上token
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
      const redirectUrl = `${frontendUrl}/oauth/callback?token=${encodeURIComponent(result.accessToken)}&userId=${encodeURIComponent(result.userId)}&username=${encodeURIComponent(result.username)}&email=${encodeURIComponent(result.email)}&avatar=${encodeURIComponent(result.avatar || '')}`
      return new Response(null, {
        status: 302,
        headers: {
          'Location': redirectUrl,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub登录失败'
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${frontendUrl}/login?error=${encodeURIComponent(message)}`,
        },
      })
    }
  }

  return createErrorResponse('NOT_FOUND', `Route ${path} not found`, 404)
}

// ==================== Main Server ====================

async function startServer() {
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

  // Initialize WebSocket RPC methods
  initializeRPCMethods()

  // Start HTTP server
  const server = Bun.serve({
    port: PORT,
    async fetch(req, server) {
      const url = new URL(req.url)
      const path = url.pathname
      const method = req.method

      // Auth routes
      if (path.startsWith('/api/auth/')) {
        return handleAuthRoutes(path, method, req)
      }

      // WebSocket upgrade
      if (path === '/ws') {
        const success = server.upgrade(req, {
          data: {
            connectionId: uuidv4(),
            userId: null,
            sessionId: null,
            token: null,
            sendEvent: null,
          },
        })

        if (!success) {
          return new Response('WebSocket upgrade failed', { status: 500 })
        }
        return
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

      // List available models
      if (path === '/api/models' && method === 'GET') {
        return createSuccessResponse({ models: AVAILABLE_MODELS })
      }

      // Get available tools
      if (path === '/api/tools' && method === 'GET') {
        return createSuccessResponse({
          tools: toolExecutor.getAllTools().map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            category: t.category,
          })),
        })
      }

      // Get MCP servers
      if (path === '/api/mcp/servers' && method === 'GET') {
        const mcpBridge = new WebMCPBridge()
        return createSuccessResponse({ servers: mcpBridge.getServers() })
      }

      // Get commands
      if (path === '/api/commands' && method === 'GET') {
        const commandBridge = new WebCommandBridge()
        return createSuccessResponse({ commands: commandBridge.getCommandsList() })
      }

      // ==================== Session API Routes ====================

      // GET /api/sessions - 获取用户会话列表
      if (path === '/api/sessions' && method === 'GET') {
        const auth = await authMiddleware(req)
        if (!auth.userId) {
          return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
        }
        try {
          const sessions = await sessionManager.getUserSessions(auth.userId)
          return createSuccessResponse({ sessions })
        } catch (error) {
          const message = error instanceof Error ? error.message : '获取会话列表失败'
          return createErrorResponse('GET_SESSIONS_FAILED', message, 500)
        }
      }

      // POST /api/sessions - 创建新会话
      if (path === '/api/sessions' && method === 'POST') {
        const auth = await authMiddleware(req)
        if (!auth.userId) {
          return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
        }
        try {
          const body = await req.json() as { title?: string; model?: string }
          const title = body.title || '新对话'
          const model = body.model || 'qwen-plus'
          const session = await sessionManager.createSession(auth.userId, title, model)
          return createSuccessResponse(session)
        } catch (error) {
          const message = error instanceof Error ? error.message : '创建会话失败'
          return createErrorResponse('CREATE_SESSION_FAILED', message, 500)
        }
      }

      // GET /api/sessions/:id - 加载会话详情
      const loadSessionMatch = path.match(/^\/api\/sessions\/([^\/]+)$/)
      if (loadSessionMatch && method === 'GET') {
        const auth = await authMiddleware(req)
        if (!auth.userId) {
          return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
        }
        const sessionId = loadSessionMatch[1]
        try {
          const sessionData = await sessionManager.loadSession(sessionId)
          if (!sessionData) {
            return createErrorResponse('SESSION_NOT_FOUND', '会话不存在', 404)
          }
          return createSuccessResponse({
            session: sessionData.session,
            messages: sessionData.messages,
            toolCalls: sessionData.toolCalls,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '加载会话失败'
          return createErrorResponse('LOAD_SESSION_FAILED', message, 500)
        }
      }

      // PUT /api/sessions/:id - 更新会话信息
      const updateSessionMatch = path.match(/^\/api\/sessions\/([^\/]+)$/)
      if (updateSessionMatch && method === 'PUT') {
        const auth = await authMiddleware(req)
        if (!auth.userId) {
          return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
        }
        const sessionId = updateSessionMatch[1]
        try {
          const body = await req.json() as { title?: string; model?: string; isPinned?: boolean }
          const updates: { title?: string; model?: string; isPinned?: boolean } = {}
          if (body.title !== undefined) updates.title = body.title
          if (body.model !== undefined) updates.model = body.model
          if (body.isPinned !== undefined) updates.isPinned = body.isPinned

          const session = await sessionManager.updateSession(sessionId, updates)
          if (!session) {
            return createErrorResponse('SESSION_NOT_FOUND', '会话不存在', 404)
          }
          return createSuccessResponse(session)
        } catch (error) {
          const message = error instanceof Error ? error.message : '更新会话失败'
          return createErrorResponse('UPDATE_SESSION_FAILED', message, 500)
        }
      }

      // DELETE /api/sessions/:id - 删除会话
      const deleteSessionMatch = path.match(/^\/api\/sessions\/([^\/]+)$/)
      if (deleteSessionMatch && method === 'DELETE') {
        const auth = await authMiddleware(req)
        if (!auth.userId) {
          return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
        }
        const sessionId = deleteSessionMatch[1]
        try {
          await sessionManager.deleteSession(sessionId)
          return createSuccessResponse({ message: 'Session deleted' })
        } catch (error) {
          const message = error instanceof Error ? error.message : '删除会话失败'
          return createErrorResponse('DELETE_SESSION_FAILED', message, 500)
        }
      }

      // POST /api/sessions/:id/clear - 清空会话消息
      const clearSessionMatch = path.match(/^\/api\/sessions\/([^\/]+)\/clear$/)
      if (clearSessionMatch && method === 'POST') {
        const auth = await authMiddleware(req)
        if (!auth.userId) {
          return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
        }
        const sessionId = clearSessionMatch[1]
        try {
          await sessionManager.clearSession(sessionId)
          return createSuccessResponse({ message: 'Session cleared' })
        } catch (error) {
          const message = error instanceof Error ? error.message : '清空会话失败'
          return createErrorResponse('CLEAR_SESSION_FAILED', message, 500)
        }
      }

      // Get server info
      if (path === '/api/info' && method === 'GET') {
        return createSuccessResponse({
          name: 'Claude Code HAHA',
          version: '1.0.0',
          description: 'Deep React Integration Server',
          features: {
            tools: toolExecutor.getAllTools().length,
            models: AVAILABLE_MODELS.length,
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

      return createErrorResponse('NOT_FOUND', `Route ${path} not found`, 404)
    },

    websocket: {
      open(ws) {
        const wsData = ws.data as WebSocketData
        console.log(`[WS] Client connected: ${wsData.connectionId}`)
        
        // Add to WebSocket manager
        wsManager.addConnection(ws, wsData.connectionId)
        
        // Set up event sender
        wsData.sendEvent = createEventSender(ws)

        ws.send(JSON.stringify({
          type: 'connected',
          connectionId: wsData.connectionId,
          timestamp: Date.now(),
        }))
      },

      async message(ws, data) {
        const wsData = ws.data as WebSocketData
        
        try {
          const message: WebSocketMessage = JSON.parse(data.toString())
          console.log(`[WS] Message from ${wsData.connectionId}:`, message.type)

          const originalSendEvent = wsData.sendEvent
          const sendEvent = (event: string, eventData: unknown) => {
            if (originalSendEvent) {
              originalSendEvent(event, { ...eventData as object, sessionId: wsData.sessionId })
            }
          }

          switch (message.type) {
            case 'rpc_call':
              // Handled by wsManager
              break

            case 'ping':
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
              break

            case 'register' as any:
              {
                const userId = message.userId as string || uuidv4()
                const username = message.username as string || `user_${userId.slice(0, 8)}`
                wsData.userId = userId

                sessionManager.getOrCreateUser(userId, username).then(user => {
                  wsData.userId = user.id
                  console.log(`[WS] User registered: ${user.id} (${user.username})`)
                  ws.send(JSON.stringify({ type: 'registered', userId: user.id, username: user.username }))
                }).catch(err => {
                  console.error('[WS] Failed to register user:', err)
                  ws.send(JSON.stringify({ type: 'error', message: 'Failed to register user' }))
                })
              }
              break

            case 'login' as any:
              {
                const token = message.token as string
                if (token) {
                  wsData.token = token
                  verifyToken(token).then(payload => {
                    if (payload) {
                      wsData.userId = payload.userId
                      console.log(`[WS] User logged in via token: ${payload.userId}`)
                      ws.send(JSON.stringify({ type: 'logged_in', userId: payload.userId }))
                    } else {
                      ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }))
                    }
                  })
                }
              }
              break

            case 'create_session':
              {
                const userId = wsData.userId
                if (!userId) {
                  sendEvent('error', { message: 'User not registered' })
                  break
                }

                const title = message.title as string || '新对话'
                const model = message.model as string || 'qwen-plus'
                const force = message.force as boolean || false

                // 如果不是强制创建，检查用户是否有空会话
                if (!force) {
                  sessionManager.hasEmptySession(userId).then(hasEmpty => {
                    if (hasEmpty) {
                      ws.send(JSON.stringify({ type: 'error', message: '您已有空会话,请先使用现有会话' }))
                      return
                    }

                    sessionManager.createSession(userId, title, model).then(session => {
                      wsData.sessionId = session.id
                      console.log(`[WS] Session created: ${session.id} for user ${userId}`)
                      ws.send(JSON.stringify({ type: 'session_created', session }))
                    }).catch(err => {
                      console.error('[WS] Failed to create session:', err)
                      sendEvent('error', { message: 'Failed to create session' })
                    })
                  }).catch(err => {
                    console.error('[WS] Failed to check empty session:', err)
                    sendEvent('error', { message: 'Failed to check empty session' })
                  })
                } else {
                  // 强制创建，跳过验证
                  sessionManager.createSession(userId, title, model, true).then(session => {
                    wsData.sessionId = session.id
                    console.log(`[WS] Session created (forced): ${session.id} for user ${userId}`)
                    ws.send(JSON.stringify({ type: 'session_created', session }))
                  }).catch(err => {
                    console.error('[WS] Failed to create session:', err)
                    sendEvent('error', { message: 'Failed to create session' })
                  })
                }
              }
              break

            case 'load_session':
              {
                const sessionId = message.sessionId as string

                sessionManager.loadSession(sessionId).then(sessionData => {
                  if (!sessionData) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }))
                    return
                  }

                  wsData.sessionId = sessionId
                  console.log(`[WS] Session loaded: ${sessionId}`)

                  ws.send(JSON.stringify({
                    type: 'session_loaded',
                    session: sessionData.session,
                    messages: sessionData.messages,
                    toolCalls: sessionData.toolCalls,
                  }))
                }).catch(err => {
                  console.error('[WS] Failed to load session:', err)
                  sendEvent('error', { message: 'Failed to load session' })
                })
              }
              break

            case 'list_sessions':
              {
                const userId = wsData.userId
                if (!userId) {
                  sendEvent('error', { message: 'User not registered' })
                  break
                }

                sessionManager.getUserSessions(userId).then(sessions => {
                  ws.send(JSON.stringify({ type: 'session_list', sessions }))
                }).catch(err => {
                  console.error('[WS] Failed to list sessions:', err)
                  sendEvent('error', { message: 'Failed to list sessions' })
                })
              }
              break

            case 'user_message':
              {
                const sessionId = message.sessionId as string || wsData.sessionId
                if (!sessionId) {
                  sendEvent('error', { message: 'No active session' })
                  break
                }

                const content = message.content as string
                const model = (message.model as string) || 'qwen-plus'

                console.log(`[WS] Processing message for session ${sessionId}:`, content.substring(0, 100))

                sessionConversationManager.processMessage(
                  sessionId,
                  content,
                  model,
                  sessionManager,
                  sendEvent
                ).catch(err => {
                  console.error('[WS] processMessage error:', err)
                  sendEvent('error', { message: 'Failed to process message' })
                })
              }
              break

            case 'delete_session':
              {
                const sessionId = message.sessionId as string
                sessionManager.deleteSession(sessionId).then(() => {
                  ws.send(JSON.stringify({ type: 'session_deleted', sessionId }))
                  if (wsData.sessionId === sessionId) {
                    wsData.sessionId = null
                  }
                }).catch(err => {
                  console.error('[WS] Failed to delete session:', err)
                  sendEvent('error', { message: 'Failed to delete session' })
                })
              }
              break

            case 'rename_session':
              {
                const sessionId = message.sessionId as string
                const title = message.title as string
                sessionManager.renameSession(sessionId, title).then(() => {
                  ws.send(JSON.stringify({ type: 'session_renamed', sessionId, title }))
                }).catch(err => {
                  console.error('[WS] Failed to rename session:', err)
                  sendEvent('error', { message: 'Failed to rename session' })
                })
              }
              break

            case 'clear_session':
              {
                const sessionId = message.sessionId as string || wsData.sessionId
                if (!sessionId) {
                  sendEvent('error', { message: 'No active session' })
                  break
                }

                sessionManager.clearSession(sessionId).then(() => {
                  ws.send(JSON.stringify({ type: 'session_cleared', sessionId }))
                }).catch(err => {
                  console.error('[WS] Failed to clear session:', err)
                  sendEvent('error', { message: 'Failed to clear session' })
                })
              }
              break

            case 'get_tools' as any:
              sendEvent('tools', {
                tools: toolExecutor.getAllTools().map(t => ({
                  name: t.name,
                  description: t.description,
                  inputSchema: t.inputSchema,
                  category: t.category,
                })),
              })
              break

            case 'execute_command' as any:
              {
                const commandBridge = new WebCommandBridge()
                const command = message.command as string
                if (!command) {
                  sendEvent('error', { message: 'Command is required' })
                  break
                }
                
                const result = await commandBridge.executeCommand(command, sendEvent)
                ws.send(JSON.stringify({ type: 'command_result', result }))
              }
              break

            case 'validate_user' as any:
              {
                const userId = message.userId as string
                const username = message.username as string

                sessionManager.getOrCreateUser(userId, username).then(user => {
                  wsData.userId = user.id
                  console.log(`[WS] User validated: ${user.id} (${user.username})`)
                  ws.send(JSON.stringify({ type: 'user_validated', userId: user.id, username: user.username }))
                }).catch(err => {
                  console.error('[WS] Failed to validate user:', err)
                  ws.send(JSON.stringify({ type: 'user_invalid' }))
                })
              }
              break

            case 'get_models' as any:
              ws.send(JSON.stringify({ type: 'models', models: AVAILABLE_MODELS }))
              break

            case 'get_status' as any:
              {
                const status = {
                  type: 'status',
                  uptime: process.uptime(),
                  memory: process.memoryUsage(),
                  connections: wsManager.getAllConnections().size,
                  sessions: wsManager.getActiveSessions().size,
                  models: AVAILABLE_MODELS,
                }
                ws.send(JSON.stringify(status))
              }
              break

            default:
              sendEvent('error', { message: `Unknown message type: ${message.type}` })
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.error('[WS] Message handling error:', errorMessage)
          ws.send(JSON.stringify({ type: 'error', message: errorMessage }))
        }
      },

      close(ws) {
        const wsData = ws.data as WebSocketData
        console.log(`[WS] Client disconnected: ${wsData.connectionId}`)
        
        // Save session on close
        if (wsData.sessionId) {
          sessionManager.saveSession(wsData.sessionId).catch(err => {
            console.error('[WS] Failed to save session on close:', err)
          })
        }
        
        // Remove from WebSocket manager
        wsManager.removeConnection(wsData.connectionId)
      },
    },
  })

  console.log(`\n${'='.repeat(60)}`)
  console.log('  Server Status')
  console.log(`${'='.repeat(60)}`)
  console.log(`\n[HTTP] REST API:     http://localhost:${PORT}/api/*`)
  console.log(`[WS]   WebSocket:    ws://localhost:${PORT}/ws`)
  console.log(`\n[API]  Auth Endpoints:`)
  console.log(`       POST /api/auth/register/send-code  - 发送注册验证码`)
  console.log(`       POST /api/auth/register            - 用户注册`)
  console.log(`       POST /api/auth/login               - 用户登录`)
  console.log(`       POST /api/auth/forgot-password/send-code  - 发送重置密码验证码`)
  console.log(`       POST /api/auth/forgot-password     - 重置密码`)
  console.log(`       GET  /api/auth/me                  - 获取当前用户信息`)
  console.log(`       GET  /api/auth/github              - GitHub OAuth登录`)
  console.log(`       GET  /api/auth/github/callback     - GitHub OAuth回调`)
  console.log(`\n[API]  Info Endpoints:`)
  console.log(`       GET  /api/health       - 健康检查`)
  console.log(`       GET  /api/models       - 可用模型列表`)
  console.log(`       GET  /api/tools        - 可用工具列表`)
  console.log(`       GET  /api/mcp/servers  - MCP 服务器列表`)
  console.log(`       GET  /api/commands     - 命令列表`)
  console.log(`       GET  /api/info         - 服务器信息`)
  console.log(`\n[API]  Session Endpoints:`)
  console.log(`       GET    /api/sessions         - 获取用户会话列表`)
  console.log(`       POST   /api/sessions         - 创建新会话`)
  console.log(`       GET    /api/sessions/:id     - 加载会话详情`)
  console.log(`       PUT    /api/sessions/:id     - 更新会话信息`)
  console.log(`       DELETE /api/sessions/:id     - 删除会话`)
  console.log(`       POST   /api/sessions/:id/clear - 清空会话消息`)
  console.log(`\n[WS]   WebSocket Events:`)
  console.log(`       create_session, load_session, list_sessions`)
  console.log(`       user_message, delete_session, rename_session`)
  console.log(`       clear_session, get_tools, execute_command`)
  console.log(`       get_models, get_status, rpc_call`)
  console.log(`\n${'='.repeat(60)}\n`)
}

// ==================== Initialize RPC Methods ====================

function initializeRPCMethods() {
  // System methods
  wsManager.registerMethod({
    name: 'system.ping',
    description: 'Ping the server',
    execute: async () => ({ pong: true, timestamp: Date.now() }),
  })

  wsManager.registerMethod({
    name: 'system.info',
    description: 'Get server information',
    execute: async () => ({
      version: '1.0.0',
      uptime: process.uptime(),
      platform: process.platform,
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      connections: wsManager.getAllConnections().size,
      registeredMethods: wsManager.getRegisteredMethods().length,
      tools: toolExecutor.getAllTools().length,
      models: AVAILABLE_MODELS.length,
    }),
  })

  wsManager.registerMethod({
    name: 'system.listMethods',
    description: 'List all registered RPC methods',
    execute: async () => {
      return wsManager.getRegisteredMethods().map((name) => ({ name }))
    },
  })

  // Tool execution methods
  wsManager.registerMethod({
    name: 'tool.execute',
    description: 'Execute a tool',
    params: {
      name: { type: 'string', required: true, description: 'Tool name' },
      input: { type: 'object', required: true, description: 'Tool input parameters' },
    },
    execute: async (params) => {
      const name = params.name as string
      const input = params.input as Record<string, unknown>
      return await toolExecutor.execute(name, input)
    },
  })

  wsManager.registerMethod({
    name: 'tool.list',
    description: 'List all available tools',
    execute: async () => {
      return toolExecutor.getAllTools().map(t => ({
        name: t.name,
        description: t.description,
        category: t.category,
      }))
    },
  })

  wsManager.registerMethod({
    name: 'tool.history',
    description: 'Get tool execution history',
    params: {
      limit: { type: 'number', description: 'Maximum number of results' },
    },
    execute: async (params) => {
      const limit = params.limit as number
      return toolExecutor.getHistory(limit)
    },
  })

  // Session methods
  wsManager.registerMethod({
    name: 'session.create',
    description: 'Create a new session',
    params: {
      title: { type: 'string', description: 'Session title' },
      model: { type: 'string', description: 'AI model to use' },
    },
    execute: async (params, context) => {
      const userId = context.userId
      if (!userId) {
        throw new Error('User not authenticated')
      }
      const title = params.title as string || '新对话'
      const model = params.model as string || 'qwen-plus'
      return await sessionManager.createSession(userId, title, model)
    },
  })

  wsManager.registerMethod({
    name: 'session.list',
    description: 'List user sessions',
    execute: async (_, context) => {
      const userId = context.userId
      if (!userId) {
        throw new Error('User not authenticated')
      }
      return await sessionManager.getUserSessions(userId)
    },
  })

  wsManager.registerMethod({
    name: 'session.load',
    description: 'Load a session with messages',
    params: {
      sessionId: { type: 'string', required: true, description: 'Session ID' },
    },
    execute: async (params) => {
      const sessionId = params.sessionId as string
      return await sessionManager.loadSession(sessionId)
    },
  })

  wsManager.registerMethod({
    name: 'session.delete',
    description: 'Delete a session',
    params: {
      sessionId: { type: 'string', required: true, description: 'Session ID' },
    },
    execute: async (params) => {
      const sessionId = params.sessionId as string
      return await sessionManager.deleteSession(sessionId)
    },
  })

  // Auth methods
  wsManager.registerMethod({
    name: 'auth.register',
    description: 'Register a new user',
    params: {
      email: { type: 'string', required: true },
      username: { type: 'string', required: true },
      password: { type: 'string', required: true },
      code: { type: 'string', required: true },
    },
    execute: async (params) => {
      return await authService.register(params as unknown as RegisterRequest)
    },
  })

  wsManager.registerMethod({
    name: 'auth.login',
    description: 'Login user',
    params: {
      email: { type: 'string', required: true },
      password: { type: 'string', required: true },
    },
    execute: async (params) => {
      return await authService.login(params as unknown as LoginRequest)
    },
  })

  wsManager.registerMethod({
    name: 'auth.sendCode',
    description: 'Send verification code',
    params: {
      email: { type: 'string', required: true },
      type: { type: 'string', description: 'Code type: register or forgot-password' },
    },
    execute: async (params) => {
      const email = params.email as string
      const type = params.type as string
      if (type === 'forgot-password') {
        await authService.sendForgotPasswordCode(email)
      } else {
        await authService.sendRegisterCode(email)
      }
      return { message: 'Verification code sent' }
    },
  })

  // Model methods
  wsManager.registerMethod({
    name: 'model.list',
    description: 'List available AI models',
    execute: async () => {
      return AVAILABLE_MODELS
    },
  })

  // MCP methods
  wsManager.registerMethod({
    name: 'mcp.listServers',
    description: 'List MCP servers',
    execute: async () => {
      const mcpBridge = new WebMCPBridge()
      return mcpBridge.getServers()
    },
  })

  wsManager.registerMethod({
    name: 'mcp.getStatus',
    description: 'Get MCP status',
    execute: async () => {
      const mcpBridge = new WebMCPBridge()
      return mcpBridge.getStatus()
    },
  })

  // Command methods
  wsManager.registerMethod({
    name: 'command.list',
    description: 'List available commands',
    execute: async () => {
      const commandBridge = new WebCommandBridge()
      return commandBridge.getCommandsList()
    },
  })

  wsManager.registerMethod({
    name: 'command.execute',
    description: 'Execute a command',
    params: {
      command: { type: 'string', required: true, description: 'Command string' },
    },
    execute: async (params, context) => {
      const commandBridge = new WebCommandBridge()
      const command = params.command as string
      return await commandBridge.executeCommand(command, context.sendEvent)
    },
  })
}

// ==================== Shutdown Handler ====================

process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down...')
  
  // Save all dirty sessions
  await sessionManager.saveAllDirtySessions()
  
  // Shutdown WebSocket manager
  wsManager.shutdown()
  
  // Close database pool
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

// ==================== Start Server ====================

startServer().catch((error) => {
  console.error('[Server] Failed to start:', error)
  process.exit(1)
})
