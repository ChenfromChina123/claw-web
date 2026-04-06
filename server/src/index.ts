/**
 * Claude Code  - Deep React Integration Server
 * 
 * A comprehensive server that integrates the React frontend with backend services:
 * - WebSocket RPC bridge for real-time communication
 * - Enhanced tool execution system
 * - Session management with AI streaming
 * - MCP server integration
 * - Authentication with JWT
 * - File watching and sandbox isolation
 */

// Bun 原生支持 .env 文件，不需要 dotenv
// 调试：检查环境变量是否被加载
console.log('[Env] Checking environment variables...')
console.log('[Env] ANTHROPIC_AUTH_TOKEN exists:', !!process.env.ANTHROPIC_AUTH_TOKEN)
console.log('[Env] ANTHROPIC_AUTH_TOKEN length:', process.env.ANTHROPIC_AUTH_TOKEN?.length)
console.log('[Env] ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL)

import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'
import { initDatabase, closePool } from './db/mysql'
import { SessionManager } from './services/sessionManager'
import { authService } from './services/authService'
import { githubAuthService } from './services/githubAuthService'
import { verifyToken, extractTokenFromHeader } from './services/jwtService'
import { wsManager } from './integration/wsBridge'
import { toolExecutor, EnhancedToolExecutor, backgroundTaskManager } from './integration/enhancedToolExecutor'
import { performanceMonitor } from './integration/performanceMonitor'
import { WebCommandBridge, parseUserInput } from './integrations/commandBridge'
import { WebMCPBridge } from './integrations/mcpBridge'
import { WebAgentRunner } from './integrations/agentRunner'
import { WebSessionBridge } from './integrations/sessionBridge'
import { appStateManager } from './integration/webStore'
import type { WebSocketMessage, RPCContext } from './integration/wsBridge'
import type { ToolExecutionContext } from './integration/enhancedToolExecutor'
import type { ConversationMessage, ToolCall, LoginRequest, RegisterRequest, ResetPasswordRequest } from './models/types'
import { getBuiltInAgents, agentManager, initializeDemoOrchestration, engineExecuteAgent } from './agents'
import { TaskStatus, TaskPriority, type BackgroundTask } from './services/backgroundTaskManager'
import { getAgentStatusService, createAgentStatusService, setAgentStatusService } from './services/agentStatusService'
import { getWorkflowEventService } from './services/workflowEventService'
import { getWorkspaceManager } from './services/workspaceManager'

const PORT = parseInt(process.env.PORT || '3000', 10)
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10)

// ==================== Types ====================

export interface WebSocketData {
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

// MCP Bridge 全局实例
let mcpBridgeInstance: WebMCPBridge | null = null

function getMCPBridge(): WebMCPBridge {
  if (!mcpBridgeInstance) {
    mcpBridgeInstance = new WebMCPBridge()
  }
  return mcpBridgeInstance
}

const AVAILABLE_MODELS = [
  { id: 'qwen-plus', name: '通义千问 Plus', provider: 'aliyun', description: '最适合编程和复杂推理' },
  { id: 'qwen-turbo', name: '通义千问 Turbo', provider: 'aliyun', description: '快速响应，适合简单任务' },
  { id: 'qwen-max', name: '通义千问 Max', provider: 'aliyun', description: '最强能力，适合最复杂任务' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', description: 'Anthropic 最强编程模型' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', description: '最通用，最强推理能力' },
]

// ==================== Anthropic Client Factory ====================

function getAnthropicClient(): Anthropic {
  console.log('[getAnthropicClient] Creating client...')
  console.log('[getAnthropicClient] ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'exists' : 'not set')
  console.log('[getAnthropicClient] ANTHROPIC_AUTH_TOKEN:', process.env.ANTHROPIC_AUTH_TOKEN ? 'exists' : 'not set')
  console.log('[getAnthropicClient] ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL)
  
  // ✅ 修复：只传有值的字段，不传递 undefined
  const clientOptions: ConstructorParameters<typeof Anthropic>[0] = {
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(300000), 10),
    maxRetries: 0,
  }

  // 只在有值时才加入配置，彻底避免鉴权错误
  if (process.env.ANTHROPIC_API_KEY) clientOptions.apiKey = process.env.ANTHROPIC_API_KEY
  if (process.env.ANTHROPIC_AUTH_TOKEN) clientOptions.authToken = process.env.ANTHROPIC_AUTH_TOKEN
  if (process.env.ANTHROPIC_BASE_URL) clientOptions.baseURL = process.env.ANTHROPIC_BASE_URL

  return new Anthropic(clientOptions)
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
  private agentRunner: WebAgentRunner
  private sessionBridge: WebSessionBridge
  private isolationManager: any = null
  private workspaceManager = getWorkspaceManager()

  constructor() {
    this.toolExecutor = toolExecutor
    this.commandBridge = new WebCommandBridge()
    this.agentRunner = new WebAgentRunner()
    this.sessionBridge = new WebSessionBridge()
  }

  /**
   * 初始化会话的工作目录（Workspace）
   */
  private async initializeSessionWorkspace(sessionId: string, userId: string): Promise<void> {
    try {
      const workspace = await this.workspaceManager.createWorkspace(userId, sessionId)
      console.log(`[SessionWorkspace] Workspace initialized for session ${sessionId}:`, workspace.path)
    } catch (error) {
      console.error(`[SessionWorkspace] Failed to initialize workspace for session ${sessionId}:`, error)
      // 不抛出错误，允许在没有工作目录的情况下继续
    }
  }

  /**
   * 初始化会话的隔离上下文（沙箱/Worktree）
   */
  private async initializeSessionIsolation(sessionId: string, userId: string): Promise<void> {
    try {
      // 动态导入以避免循环依赖
      const { getIsolationManager, IsolationMode } = await import('./agents/contextIsolation')
      this.isolationManager = getIsolationManager()

      // 检查是否已有隔离上下文
      const contexts = this.isolationManager.getContextsByUser(userId)
      const existingContext = contexts.find(ctx => ctx.name === `session_${sessionId}`)

      if (existingContext) {
        console.log(`[SessionIsolation] Reusing existing isolation context: ${existingContext.isolationId}`)
        return
      }

      // 创建新的隔离上下文
      const isolationId = await this.isolationManager.create({
        isolationId: `iso_${userId}_${sessionId}`,
        userId,
        mode: IsolationMode.WORKTREE,
        name: `session_${sessionId}`,
        description: `Isolation context for session ${sessionId}`,
        workingDirectory: process.cwd().replace(/\\server\\src$/i, '').replace(/\/server\/src$/, ''),
        cleanupPolicy: 'delayed',
      })

      const context = this.isolationManager.getContext(isolationId)
      console.log(`[SessionIsolation] Created isolation context for session ${sessionId}:`, context)
    } catch (error) {
      console.error(`[SessionIsolation] Failed to initialize isolation for session ${sessionId}:`, error)
      // 不抛出错误，允许在没有隔离的情况下继续
    }
  }

  /**
   * 获取会话的隔离上下文 ID
   */
  private getSessionIsolationId(sessionId: string, userId: string): string | undefined {
    if (!this.isolationManager) return undefined
    
    const contexts = this.isolationManager.getContextsByUser(userId)
    const context = contexts.find(ctx => ctx.name === `session_${sessionId}`)
    return context?.isolationId
  }

  /**
   * 处理用户消息并启动 Agent Loop
   * 使用清晰的迭代结构处理工具调用循环
   */
  async processMessage(
    sessionId: string,
    userMessage: string,
    model: string,
    sessionManager: SessionManager,
    sendEvent: (event: string, data: unknown) => void
  ): Promise<void> {
    // 0. 获取用户 ID
    const sessionDataTemp = sessionManager.getInMemorySession(sessionId)
    const userId = sessionDataTemp?.session.userId
    
    console.log(`[SessionConversationManager] processMessage called: sessionId=${sessionId}, userId=${userId}, isolationManager=${!!this.isolationManager}`)

    // 1. 初始化隔离上下文（如果是第一次处理消息）
    if (userId && !this.isolationManager) {
      console.log(`[SessionIsolation] Initializing isolation context for session ${sessionId}, userId=${userId}`)
      await this.initializeSessionIsolation(sessionId, userId)
    } else if (!userId) {
      console.warn(`[SessionIsolation] Cannot initialize: userId is missing`)
    } else if (this.isolationManager) {
      console.log(`[SessionIsolation] Isolation manager already initialized`)
    }

    // 1.1 初始化工作目录（Workspace）
    if (userId) {
      console.log(`[SessionWorkspace] Initializing workspace for session ${sessionId}, userId=${userId}`)
      await this.initializeSessionWorkspace(sessionId, userId)
    }

    // 2. 检查是否为命令
    const parsed = parseUserInput(userMessage)
    if (parsed.isCommand && parsed.command) {
      const result = await this.commandBridge.executeCommand(parsed.command, sendEvent)
      sendEvent('command_result', result)
      return
    }

    // 3. 保存用户消息到 session
    const savedUserMessage = sessionManager.addMessage(sessionId, 'user', userMessage)

    const sessionData = sessionManager.getInMemorySession(sessionId)
    if (!sessionData) {
      sendEvent('error', { message: 'Session not found' })
      return
    }

    // 4. 发送 message_saved 事件
    if (savedUserMessage) {
      sendEvent('message_saved', {
        sessionId,
        messageId: savedUserMessage.id,
        role: 'user',
      })
    }

    console.log(`[${sessionId}] Starting Agent Loop with model: ${model}`)
    console.log(`[${sessionId}] Total messages in history: ${sessionData.messages.length}`)
    if (userId) {
      const isolationId = this.getSessionIsolationId(sessionId, userId)
      console.log(`[${sessionId}] Using isolation context: ${isolationId || 'none'}`)
    }

    try {
      // 4. 进入 Agent Loop (最多10次迭代)
      const maxIterations = 10
      let actualIterations = 0
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        actualIterations = iteration + 1
        console.log(`[${sessionId}] Agent Loop iteration ${actualIterations}/${maxIterations}`)

        // 4.1 创建助手消息占位符
        const assistantMessage = sessionManager.addMessage(sessionId, 'assistant', '')
        if (!assistantMessage) {
          console.error(`[${sessionId}] Failed to create assistant message`)
          sendEvent('error', { message: 'Failed to create assistant message' })
          return
        }
        const assistantMessageId = assistantMessage.id

        // 4.2 发送 message_start 事件
        sendEvent('message_start', { 
          messageId: assistantMessageId, 
          iteration: actualIterations
        })

        // 4.3 调用 AI API (streaming)
        console.log(`[${sessionId}] Calling AI API for iteration ${actualIterations}...`)
        const streamResult = await this.callAIWithStream(
          sessionId, 
          model, 
          sessionManager, 
          sendEvent
        )
        console.log(`[${sessionId}] AI response received, text length: ${streamResult.text?.length || 0}, toolCalls: ${streamResult.toolCalls?.length || 0}`)

        // 4.4 如果有工具调用
        if (streamResult.toolCalls && streamResult.toolCalls.length > 0) {
          console.log(`[${sessionId}] AI requested ${streamResult.toolCalls.length} tool(s)`)
          
          // 执行所有工具调用（包含完整的事件序列）
          console.log(`[${sessionId}] Starting tool execution...`)
          await this.executeToolCalls(
            sessionId, 
            streamResult.toolCalls, 
            assistantMessageId,
            sessionManager, 
            sendEvent
          )
          console.log(`[${sessionId}] Tool execution completed`)
          
          // 更新助手消息内容（包含文本和工具调用信息）
          if (streamResult.text || streamResult.toolCalls.length > 0) {
            // 构建 Anthropic 格式的内容数组
            const content: any[] = []
            if (streamResult.text) {
              content.push({
                type: 'text',
                text: streamResult.text
              })
            }
            for (const tc of streamResult.toolCalls) {
              let toolInput = tc.input || '{}'
              // 安全解析 JSON - 如果已经是对象就直接使用
              if (typeof toolInput === 'string') {
                try {
                  toolInput = JSON.parse(toolInput)
                } catch (e) {
                  console.warn(`[${sessionId}] Failed to parse tool input, using as string:`, toolInput)
                }
              }
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input: toolInput
              })
            }
            
            sessionManager.updateMessage(
              sessionId, 
              assistantMessageId, 
              content, 
              streamResult.toolCalls.map(tc => ({
                id: tc.id,
                messageId: assistantMessageId,
                sessionId,
                toolName: tc.name,
                toolInput: tc.input,
                toolOutput: null,
                status: 'pending' as const,
                createdAt: new Date(),
              }))
            )
          }
          
          // 继续下一轮迭代（将工具结果作为上下文）
          console.log(`[${sessionId}] Tool execution completed, continuing to next iteration...`)
          continue
        }

        // 4.5 无工具调用（纯文本回复）- 更新消息并结束循环
        console.log(`[${sessionId}] No tool calls requested, ending conversation`)
        if (streamResult.text) {
          sessionManager.updateMessage(sessionId, assistantMessageId, streamResult.text, [])
        }

        // 发送结束事件
        sendEvent('message_stop', { stop_reason: 'end_turn', iteration: actualIterations })
        
        // 通知前端助手消息已保存
        sendEvent('message_saved', {
          sessionId,
          messageId: assistantMessageId,
          role: 'assistant',
        })
        
        const finalSession = sessionManager.getInMemorySession(sessionId)
        sendEvent('conversation_end', { 
          totalMessages: finalSession?.messages?.length || 0 
        })
        
        console.log(`[${sessionId}] Conversation completed at iteration ${actualIterations}`)
        break
      }

      // 5. 检查是否达到最大迭代次数
      if (actualIterations >= maxIterations) {
        console.warn(`[${sessionId}] Max iterations (${maxIterations}) reached`)
        sendEvent('max_iterations_reached', { iterations: maxIterations })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[${sessionId}] Agent Loop error:`, errorMessage)
      sendEvent('error', { message: errorMessage })
    }
  }

  /**
   * 调用 AI API 并处理流式响应
   * 返回结构化的结果对象，包含文本和工具调用
   */
  private async callAIWithStream(
    sessionId: string,
    model: string,
    sessionManager: SessionManager,
    sendEvent: (event: string, data: unknown) => void
  ): Promise<{ text: string; toolCalls: Array<{id: string; name: string; input: any}> }> {
    const messages = sessionManager.getInMemorySession(sessionId)?.messages || []
    const client = getAnthropicClient()

    let assistantText = ''
    let pendingToolCalls: Array<{ id: string; name: string; input: string }> = []

    console.log(`[${sessionId}] Calling AI API with ${messages.length} messages`)

    // 获取工作区信息并注入到系统提示中
    let systemPrompt = ''
    try {
      const workspaceSummary = await this.workspaceManager.getWorkspaceSummaryForContext(sessionId)
      if (workspaceSummary) {
        systemPrompt = workspaceSummary
        console.log(`[${sessionId}] Workspace info injected into context`)
      }
    } catch (error) {
      console.warn(`[${sessionId}] Failed to get workspace summary:`, error)
    }

    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPrompt || undefined,
      tools: this.toolExecutor.getAnthropicTools() as Anthropic.Tool[],
      messages: messages.map(m => {
        // 如果 content 已经是数组，直接使用；否则用字符串格式
        const content = Array.isArray(m.content) 
          ? m.content 
          : m.content
        
        return {
          role: m.role as 'user' | 'assistant',
          content: content,
        }
      }),
    })

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_start':
          if (event.content_block.type === 'tool_use') {
            const toolId = event.content_block.id || uuidv4()
            const toolName = event.content_block.name || ''
            console.log(`[${sessionId}] Tool use started: ${toolName}`)
            pendingToolCalls.push({ id: toolId, name: toolName, input: '' })
            
            // 发送 tool_use 事件（AI 决策使用工具）
            sendEvent('tool_use', { id: toolId, name: toolName })
          }
          break

        case 'content_block_delta':
          if (event.delta.type === 'text_delta') {
            assistantText += event.delta.text
            sendEvent('content_block_delta', { text: event.delta.text })
          } else if (event.delta.type === 'input_json_delta') {
            if (pendingToolCalls.length > 0) {
              const lastTool = pendingToolCalls[pendingToolCalls.length - 1]
              lastTool.input += event.delta.partial_json
              sendEvent('tool_input_delta', { 
                id: lastTool.id, 
                partial_json: event.delta.partial_json 
              })
            }
          }
          break

        case 'content_block_stop':
          break

        case 'message_delta':
          if (event.delta.stop_reason) {
            console.log(`[${sessionId}] Stream stop reason: ${event.delta.stop_reason}`)
          }
          break

        case 'message_stop':
          console.log(`[${sessionId}] Message stream completed`)
          break
      }
    }

    return {
      text: assistantText,
      toolCalls: pendingToolCalls.map(tc => ({
        id: tc.id,
        name: tc.name,
        input: tc.input ? JSON.parse(tc.input) : {},
      }))
    }
  }

  /**
   * 执行工具调用并发送完整的事件序列
   * 关键修复：确保每个工具调用都发送 tool_start/tool_end/tool_error 事件
   */
  private async executeToolCalls(
    sessionId: string,
    toolCalls: Array<{id: string; name: string; input: any}>,
    messageId: string,
    sessionManager: SessionManager,
    sendEvent: (event: string, data: unknown) => void
  ): Promise<void> {
    for (const tool of toolCalls) {
      console.log(`[${sessionId}] Executing tool: ${tool.name}`)

      // 发送 tool_start 事件（开始执行）
      sendEvent('tool_start', { 
        id: tool.id, 
        name: tool.name, 
        input: tool.input,
        sessionId 
      })

      const startTime = Date.now()
      const toolCall: ToolCall = {
        id: tool.id,
        messageId: messageId,
        sessionId,
        toolName: tool.name,
        toolInput: tool.input,
        toolOutput: null,
        status: 'executing',
        createdAt: new Date(),
      }

      try {
        // 设置超时保护（30秒）
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tool execution timeout')), 30000)
        )

        // 无感沙箱：在执行前自动设置工作目录
        let workspaceDir = ''
        try {
          workspaceDir = await this.workspaceManager.getRealWorkingDirectory(sessionId)
        } catch (e) {
          console.warn(`[${sessionId}] 获取工作目录失败:`, e)
        }

        // 如果有工作目录，临时更新工具执行的上下文
        if (workspaceDir) {
          this.toolExecutor.setContext({
            ...this.toolExecutor.getContext(),
            projectRoot: workspaceDir,
            workingDirectory: workspaceDir,
            sessionId: sessionId
          })
        }

        const result = await Promise.race([
          this.toolExecutor.execute(tool.name, tool.input, sendEvent, tool.id),
          timeoutPromise
        ]) as { success: boolean; result?: unknown; error?: string }

        const duration = Date.now() - startTime

        // 更新工具状态
        toolCall.toolOutput = result.result as Record<string, unknown>
        toolCall.status = result.success ? 'completed' : 'error'
        toolCall.completedAt = new Date()

        // 保存到 session
        sessionManager.addToolCall(sessionId, toolCall)
        sessionManager.addToolResultMessage(
          sessionId,
          tool.id,
          tool.name,
          result.result,
          result.error
        )

        // 发送 tool_end 事件（成功完成）
        sendEvent('tool_end', {
          id: tool.id,
          name: tool.name,
          success: true,
          result: result.result,
          duration,
        })

        console.log(`[${sessionId}] Tool ${tool.name} completed in ${duration}ms`)

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const duration = Date.now() - startTime

        // 更新工具状态为错误
        toolCall.toolOutput = { error: errorMessage }
        toolCall.status = 'error'
        toolCall.completedAt = new Date()

        // 保存错误状态到 session
        sessionManager.addToolCall(sessionId, toolCall)
        sessionManager.addToolResultMessage(
          sessionId,
          tool.id,
          tool.name,
          undefined,
          errorMessage
        )

        // 发送 tool_error 事件
        sendEvent('tool_error', {
          id: tool.id,
          name: tool.name,
          error: errorMessage,
          errorType: this.classifyErrorType(error),
          duration,
        })

        console.error(`[${sessionId}] Tool ${tool.name} error after ${duration}ms:`, errorMessage)
      }
    }
  }

  /**
   * 分类错误类型，便于前端展示友好的提示
   */
  private classifyErrorType(error: unknown): string {
    const msg = error instanceof Error ? error.message : String(error)
    
    if (msg.includes('ENOENT') || msg.includes('not found')) return 'NOT_FOUND'
    if (msg.includes('EACCES') || msg.includes('permission')) return 'PERMISSION'
    if (msg.includes('timeout') || msg.includes('TIMEOUT')) return 'TIMEOUT'
    if (msg.includes('syntax') || msg.includes('parse')) return 'INVALID_INPUT'
    
    return 'UNKNOWN'
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

  // Initialize Agent persistence service (恢复之前的 Agent 状态)
  try {
    console.log('\n[AgentPersistence] Initializing Agent persistence service...')
    const { getAgentPersistenceService } = await import('./agents/agentPersistence')
    await getAgentPersistenceService().initialize()
    console.log('[AgentPersistence] Agent persistence service initialized')
  } catch (error) {
    console.warn('[AgentPersistence] Failed to initialize Agent persistence service:', error)
    console.warn('[AgentPersistence] Agent state will not be persisted')
  }

  // Initialize Agent status service (用于前端 AgentStatusPanel 实时推送)
  try {
    console.log('\n[AgentStatusService] Initializing Agent status service...')
    
    // 创建 WebSocket 推送函数
    const wsPushFn = (clientId: string, data: { type: string; payload: unknown; timestamp: string }) => {
      const message = {
        type: 'event',
        event: data.type,
        data: data.payload,
        timestamp: new Date(data.timestamp).getTime(),
      } as any
      
      // 广播到所有连接的客户端
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
    
    // 重新初始化 AgentStatusService 并传入推送函数
    const agentStatusService = createAgentStatusService({ wsPush: wsPushFn })
    setAgentStatusService(agentStatusService)
    
    agentStatusService.startAutoRefresh()
    console.log('[AgentStatusService] Agent status service initialized')
  } catch (error) {
    console.warn('[AgentStatusService] Failed to initialize Agent status service:', error)
    console.warn('[AgentStatusService] Agent status will not be pushed to frontend')
  }

  // Initialize Workflow Event Service (用于前端工作流可视化实时推送)
  try {
    console.log('\n[WorkflowEventService] Initializing Workflow Event service...')
    const workflowEventService = getWorkflowEventService()
    
    // 配置 WebSocket 推送函数
    workflowEventService.setPushFn((event) => {
      const message = JSON.stringify({
        type: 'event',
        event: 'workflow_event',
        data: event,
        timestamp: new Date(event.timestamp).getTime(),
      })
      
      // 广播到所有连接的客户端
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
    console.warn('[WorkflowEventService] Workflow events will not be pushed to frontend')
  }

  // 设置会话标题更新回调（用于新对话第一个消息时生成并推送标题）
  try {
    console.log('\n[SessionTitle] Setting up session title update callback...')
    sessionManager.setOnSessionTitleUpdated((sessionId: string, title: string) => {
      const message = JSON.stringify({
        type: 'session_renamed',
        sessionId,
        title,
      })
      
      // 广播到所有连接的客户端
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
    console.log('[SessionTitle] Session title update callback set up')
  } catch (error) {
    console.warn('[SessionTitle] Failed to set up session title update callback:', error)
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
          } as any,
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

      // ==================== Diagnostics API Routes ====================

      // GET /api/diagnostics/health - 获取系统健康状态
      if (path === '/api/diagnostics/health' && method === 'GET') {
        try {
          // 获取性能监控器的健康状态
          const dbConnected = true // 实际应该检查数据库连接
          const healthStatus = performanceMonitor.getHealthStatus(dbConnected)
          
          // 添加工具注册中心状态
          const toolRegistryHealth = {
            status: 'healthy' as const,
            toolCount: toolExecutor.getAllTools().length,
            sources: {
              builtin: toolExecutor.getToolsByCategory('file').length + toolExecutor.getToolsByCategory('shell').length + toolExecutor.getToolsByCategory('web').length,
              cli: 0, // 实际应该从 CLI Tool Loader 获取
              mcp: 0, // 实际应该从 MCP Bridge 获取
              custom: 0,
            },
          }
          
          // 添加 MCP 桥接状态
          const mcpBridgeHealth = {
            status: 'healthy' as const,
            serverCount: 0, // 实际应该从 MCP Bridge 获取
            activeConnections: 0,
          }
          
          // 添加 CLI Tool Loader 状态
          const cliToolLoaderHealth = {
            status: 'healthy' as const,
            loadedTools: 0, // 实际应该从 CLI Tool Loader 获取
            lastScan: new Date().toISOString(),
          }
          
          // 添加 Skill Loader 状态
          const skillLoaderHealth = {
            status: 'healthy' as const,
            skillCount: 0, // 实际应该从 Skill Loader 获取
            categories: {},
          }
          
          return createSuccessResponse({
            overall: healthStatus.status,
            components: {
              toolRegistry: toolRegistryHealth,
              mcpBridge: mcpBridgeHealth,
              cliToolLoader: cliToolLoaderHealth,
              skillLoader: skillLoaderHealth,
              performanceMonitor: {
                status: healthStatus.components.memory.status === 'healthy' && healthStatus.components.cpu.status === 'healthy' ? 'healthy' : 'degraded',
                memoryUsage: `${healthStatus.components.memory.usagePercent}%`,
                cpuUsage: `${healthStatus.components.cpu.usagePercent}%`,
                wsConnections: healthStatus.components.websocket.connections,
              },
            },
            timestamp: new Date().toISOString(),
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '健康检查失败'
          return createErrorResponse('HEALTH_CHECK_FAILED', message, 500)
        }
      }

      // GET /api/diagnostics/components - 获取组件详细信息
      if (path === '/api/diagnostics/components' && method === 'GET') {
        try {
          const metrics = performanceMonitor.getMetrics()
          
          return createSuccessResponse({
            toolRegistry: {
              totalTools: toolExecutor.getAllTools().length,
              byCategory: ['file', 'shell', 'web', 'system', 'ai', 'mcp', 'agent', 'plan'].reduce((acc, cat) => {
                acc[cat] = toolExecutor.getToolsByCategory(cat).length
                return acc
              }, {} as Record<string, number>),
              historySize: toolExecutor.getHistory().length,
            },
            mcpBridge: {
              // 实际应该从 MCP Bridge 获取详细状态
              servers: [],
              totalTools: 0,
            },
            cliToolLoader: {
              loadedTools: 0,
              lastScan: new Date().toISOString(),
              errors: [],
            },
            skillLoader: {
              loadedSkills: 0,
              byCategory: {},
            },
            performanceMonitor: {
              metrics,
              alerts: performanceMonitor.getAlerts(10),
            },
            websocket: {
              totalConnections: wsManager.getAllConnections().size,
              activeSessions: wsManager.getActiveSessions().size,
            },
            timestamp: new Date().toISOString(),
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '获取组件信息失败'
          return createErrorResponse('COMPONENTS_INFO_FAILED', message, 500)
        }
      }

      // List available models
      if (path === '/api/models' && method === 'GET') {
        return createSuccessResponse({ models: AVAILABLE_MODELS })
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
          await sessionManager.deleteSession(sessionId, auth.userId)
          return createSuccessResponse({ message: 'Session deleted' })
        } catch (error) {
          const message = error instanceof Error ? error.message : '删除会话失败'
          const code =
            message.includes('not found') ? 'SESSION_NOT_FOUND' : message.includes('Forbidden') ? 'FORBIDDEN' : 'DELETE_SESSION_FAILED'
          const status = message.includes('Forbidden') ? 403 : message.includes('not found') ? 404 : 500
          return createErrorResponse(code, message, status)
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

      // ==================== Tools API ====================

      // GET /api/tools - 获取所有工具列表
      if (path === '/api/tools' && method === 'GET') {
        const category = url.searchParams.get('category')
        const tools = category
          ? toolExecutor.getToolsByCategory(category)
          : toolExecutor.getAllTools()

        return createSuccessResponse({
          tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            category: t.category,
            permissions: t.permissions,
          })),
          categories: ['file', 'shell', 'web', 'system', 'ai', 'mcp'],
          total: tools.length,
        })
      }

      // GET /api/tools/:name - 获取特定工具详情
      if (path.startsWith('/api/tools/') && method === 'GET') {
        const toolName = path.replace('/api/tools/', '')
        const tool = toolExecutor.getTool(toolName)

        if (!tool) {
          return createErrorResponse('TOOL_NOT_FOUND', `Tool '${toolName}' not found`, 404)
        }

        return createSuccessResponse({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          category: tool.category,
          permissions: tool.permissions,
        })
      }

      // POST /api/tools/execute - 执行工具
      if (path === '/api/tools/execute' && method === 'POST') {
        try {
          const body = await req.json() as {
            toolName: string
            toolInput: Record<string, unknown>
            sessionId?: string
            context?: Record<string, unknown>
          }

          const { toolName, toolInput, sessionId, context } = body

          if (!toolName || !toolInput) {
            return createErrorResponse('INVALID_PARAMS', 'toolName and toolInput are required', 400)
          }

          const result = await toolExecutor.execute(toolName, toolInput)

          return createSuccessResponse({
            success: result.success,
            result: result.result,
            error: result.error,
            output: result.output,
            metadata: result.metadata,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Tool execution failed'
          return createErrorResponse('TOOL_EXECUTION_FAILED', message, 500)
        }
      }

      // GET /api/tools/history - 获取工具执行历史
      if (path === '/api/tools/history' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '50', 10)
        const history = toolExecutor.getHistory(limit)

        return createSuccessResponse({
          history,
          count: history.length,
        })
      }

      // POST /api/tools/history/clear - 清空工具执行历史
      if (path === '/api/tools/history/clear' && method === 'POST') {
        toolExecutor.clearHistory()
        return createSuccessResponse({ message: 'Tool history cleared' })
      }

      // POST /api/tools/validate - 验证工具输入
      if (path === '/api/tools/validate' && method === 'POST') {
        try {
          const body = await req.json() as {
            toolName: string
            toolInput: Record<string, unknown>
          }

          const { toolName, toolInput } = body
          const tool = toolExecutor.getTool(toolName)

          if (!tool) {
            return createSuccessResponse({
              valid: false,
              errors: [`Tool '${toolName}' not found`],
            })
          }

          const required = tool.inputSchema.required || []
          const missing: string[] = []

          for (const field of required) {
            if (toolInput[field] === undefined || toolInput[field] === null) {
              missing.push(field)
            }
          }

          return createSuccessResponse({
            valid: missing.length === 0,
            errors: missing.length > 0 ? [`Missing required fields: ${missing.join(', ')}`] : [],
            tool: {
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Validation failed'
          return createErrorResponse('VALIDATION_FAILED', message, 500)
        }
      }

      // ==================== Background Tasks API ====================

      // GET /api/tasks - 获取所有后台任务
      if (path === '/api/tasks' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '50', 10)
        const offset = parseInt(url.searchParams.get('offset') || '0', 10)
        const status = url.searchParams.get('status') || undefined

        // 从后台任务管理器获取任务
        let allTasks = backgroundTaskManager.getAllTasks()

        // 按状态筛选
        if (status) {
          allTasks = allTasks.filter(t => t.status.toLowerCase() === status.toLowerCase())
        }

        // 分页
        const tasks = allTasks.slice(offset, offset + limit)

        // 转换为前端期望的格式
        const formattedTasks = tasks.map(t => ({
          taskId: t.id,
          name: t.name,
          description: t.description,
          status: t.status.toUpperCase(),
          progress: t.progress,
          result: t.result,
          error: t.error,
          createdAt: t.createdAt.getTime(),
          startedAt: t.startedAt?.getTime(),
          completedAt: t.completedAt?.getTime(),
          metadata: t.metadata,
        }))

        return createSuccessResponse({
          tasks: formattedTasks,
          total: allTasks.length,
          limit,
          offset,
          status,
        })
      }

      // GET /api/tasks/:taskId/status - 获取特定任务状态
      const taskStatusMatch = path.match(/^\/api\/tasks\/([^\/]+)\/status$/)
      if (taskStatusMatch && method === 'GET') {
        const taskId = taskStatusMatch[1]
        return createErrorResponse('TASK_NOT_FOUND', `Task '${taskId}' not found`, 404)
      }

      // ==================== Agents API ====================

      // GET /api/agents - 获取所有可用 Agent 列表
      if (path === '/api/agents' && method === 'GET') {
        const agents = getBuiltInAgents()
        return createSuccessResponse({
          agents: agents.map(agent => ({
            agentType: agent.agentType,
            name: agent.agentType,
            description: agent.description || agent.whenToUse,
            whenToUse: agent.whenToUse,
            icon: agent.icon,
            color: agent.color,
            isReadOnly: agent.isReadOnly,
            model: agent.model,
            source: agent.source
          })),
          count: agents.length
        })
      }

      // GET /api/agents/:type - 获取特定 Agent 详情
      if (path.startsWith('/api/agents/') && method === 'GET') {
        const agentType = path.replace('/api/agents/', '')
        
        // 排除特殊路由
        if (agentType === 'isolation' || agentType.startsWith('isolation/') ||
            agentType === 'orchestration' || agentType.startsWith('orchestration/') ||
            agentType === 'execute' || agentType === 'active') {
          // 让其他路由处理
        } else {
          const agents = getBuiltInAgents()
          const agent = agents.find(a => a.agentType === agentType)
          
          if (!agent) {
            return createErrorResponse('AGENT_NOT_FOUND', `Agent '${agentType}' not found`, 404)
          }
          
          return createSuccessResponse({
            agentType: agent.agentType,
            name: agent.agentType,
            description: agent.description || agent.whenToUse,
            whenToUse: agent.whenToUse,
            icon: agent.icon,
            color: agent.color,
            isReadOnly: agent.isReadOnly,
            model: agent.model,
            source: agent.source,
            tools: agent.tools,
            disallowedTools: agent.disallowedTools
          })
        }
      }

      // GET /api/agents/orchestration/state - 获取多 Agent 协调状态
      if (path === '/api/agents/orchestration/state' && method === 'GET') {
        const state = agentManager.getOrchestrationState()
        return createSuccessResponse(state)
      }

      // POST /api/agents/orchestration/init - 初始化多 Agent 协调
      if (path === '/api/agents/orchestration/init' && method === 'POST') {
        try {
          const body = await req.json() as {
            orchestratorType?: string
            subAgentTypes?: string[]
          }
          
          let state
          if (body.orchestratorType && body.subAgentTypes) {
            agentManager.resetOrchestration()
            agentManager.initializeOrchestration(
              body.orchestratorType,
              body.subAgentTypes
            )
            state = agentManager.getOrchestrationState()
          } else {
            state = initializeDemoOrchestration()
          }
          
          return createSuccessResponse(state)
        } catch (error) {
          const message = error instanceof Error ? error.message : '初始化协调失败'
          return createErrorResponse('ORCHESTRATION_INIT_FAILED', message, 500)
        }
      }

      // POST /api/agents/execute - 执行 Agent 任务
      if (path === '/api/agents/execute' && method === 'POST') {
        try {
          const body = await req.json() as {
            agentId: string
            sessionId: string
            task: string
            prompt: string
            tools: string[]
            maxTurns?: number
          }
          
          const result = await engineExecuteAgent(body, (state) => {
            // 可以在这里通过 WebSocket 发送状态更新
          })
          
          return createSuccessResponse(result)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Agent 执行失败'
          return createErrorResponse('AGENT_EXECUTE_FAILED', message, 500)
        }
      }

      // ==================== Isolation API ====================

      const isolationMatch = path.match(/^\/api\/agents\/isolation(\/([^\/]+)(\/(execute))?)?$/)
      
      // POST /api/agents/isolation - 创建隔离上下文
      if (path === '/api/agents/isolation' && method === 'POST') {
        try {
          const auth = await authMiddleware(req)
          if (!auth.userId) {
            return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
          }

          const body = await req.json() as {
            name: string
            mode: 'worktree' | 'remote'
            description?: string
            worktree?: {
              mainRepoPath: string
              worktreeName?: string
              branchName?: string
            }
            remote?: {
              type: 'ssh' | 'docker'
              connection: Record<string, unknown>
            }
          }

          const { name, mode, description, worktree, remote } = body

          if (!name || !mode) {
            return createErrorResponse('INVALID_PARAMS', '缺少必需参数: name, mode', 400)
          }

          const { getIsolationManager, IsolationMode: ContextIsolationMode } = await import('./agents/contextIsolation')
          const manager = getIsolationManager()
          
          const isolationId = await manager.create({
            isolationId: `iso_${auth.userId}_${Date.now()}`,
            userId: auth.userId,
            mode: mode === 'worktree' ? ContextIsolationMode.WORKTREE : ContextIsolationMode.REMOTE,
            name,
            description,
            workingDirectory: mode === 'worktree' && worktree 
              ? worktree.mainRepoPath 
              : mode === 'remote' && remote?.connection 
                ? `/remote/${(remote.connection as any).host || 'unknown'}` 
                : '/tmp',
            cleanupPolicy: 'delayed',
            worktree: mode === 'worktree' ? worktree : undefined,
            remote: mode === 'remote' ? remote : undefined
          })

          const context = manager.getContext(isolationId)
          return createSuccessResponse({ context })
        } catch (error) {
          const message = error instanceof Error ? error.message : '创建隔离上下文失败'
          return createErrorResponse('ISOLATION_CREATE_FAILED', message, 500)
        }
      }

      // GET /api/agents/isolation - 获取当前用户的隔离上下文列表
      if (path === '/api/agents/isolation' && method === 'GET') {
        try {
          const auth = await authMiddleware(req)
          if (!auth.userId) {
            return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
          }

          const { getIsolationManager } = await import('./agents/contextIsolation')
          const manager = getIsolationManager()
          const contexts = manager.getContextsByUser(auth.userId)
          
          return createSuccessResponse({ contexts })
        } catch (error) {
          const message = error instanceof Error ? error.message : '获取隔离上下文失败'
          return createErrorResponse('ISOLATION_LIST_FAILED', message, 500)
        }
      }

      // GET /api/agents/isolation/:isolationId - 获取隔离上下文详情
      if (isolationMatch && isolationMatch[2] && !isolationMatch[4] && method === 'GET') {
        try {
          const auth = await authMiddleware(req)
          if (!auth.userId) {
            return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
          }

          const isolationId = isolationMatch[2]
          const { getIsolationManager } = await import('./agents/contextIsolation')
          const manager = getIsolationManager()
          
          if (!manager.validateUserAccess(isolationId, auth.userId)) {
            return createErrorResponse('FORBIDDEN', '无权访问此隔离上下文', 403)
          }

          const context = manager.getContext(isolationId)
          if (!context) {
            return createErrorResponse('NOT_FOUND', `隔离上下文 ${isolationId} 不存在`, 404)
          }

          return createSuccessResponse({ context })
        } catch (error) {
          const message = error instanceof Error ? error.message : '获取隔离上下文失败'
          return createErrorResponse('ISOLATION_GET_FAILED', message, 500)
        }
      }

      // POST /api/agents/isolation/:isolationId/execute - 在隔离上下文中执行命令
      if (isolationMatch && isolationMatch[2] && isolationMatch[4] === 'execute' && method === 'POST') {
        try {
          const auth = await authMiddleware(req)
          if (!auth.userId) {
            return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
          }

          const isolationId = isolationMatch[2]
          const body = await req.json() as {
            command: string
            args?: string[]
            cwd?: string
            env?: Record<string, string>
            timeout?: number
          }

          const { command, args, cwd, env, timeout } = body

          if (!command) {
            return createErrorResponse('INVALID_PARAMS', '缺少必需参数: command', 400)
          }

          const { getIsolationManager } = await import('./agents/contextIsolation')
          const manager = getIsolationManager()
          
          if (!manager.validateUserAccess(isolationId, auth.userId)) {
            return createErrorResponse('FORBIDDEN', '无权访问此隔离上下文', 403)
          }

          const result = await manager.execute({
            isolationId,
            command,
            args,
            cwd,
            env,
            timeout
          })

          return createSuccessResponse({ result })
        } catch (error) {
          const message = error instanceof Error ? error.message : '执行命令失败'
          return createErrorResponse('ISOLATION_EXECUTE_FAILED', message, 500)
        }
      }

      // DELETE /api/agents/isolation/:isolationId - 销毁隔离上下文
      if (isolationMatch && isolationMatch[2] && !isolationMatch[4] && method === 'DELETE') {
        try {
          const auth = await authMiddleware(req)
          if (!auth.userId) {
            return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
          }

          const isolationId = isolationMatch[2]
          const { getIsolationManager } = await import('./agents/contextIsolation')
          const manager = getIsolationManager()
          
          if (!manager.validateUserAccess(isolationId, auth.userId)) {
            return createErrorResponse('FORBIDDEN', '无权访问此隔离上下文', 403)
          }

          await manager.destroy(isolationId)
          return createSuccessResponse({ success: true })
        } catch (error) {
          const message = error instanceof Error ? error.message : '销毁隔离上下文失败'
          return createErrorResponse('ISOLATION_DESTROY_FAILED', message, 500)
        }
      }

      // ==================== Workspace API ====================

      // POST /api/workspace/:sessionId/upload - 上传文件到工作区
      const workspaceUploadMatch = path.match(/^\/api\/workspace\/([^\/]+)\/upload$/)
      if (workspaceUploadMatch && method === 'POST') {
        try {
          const auth = await authMiddleware(req)
          if (!auth.userId) {
            return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
          }

          const sessionId = workspaceUploadMatch[1]
          
          // 解析 multipart/form-data
          const contentType = req.headers.get('content-type') || ''
          if (!contentType.includes('multipart/form-data')) {
            return createErrorResponse('INVALID_CONTENT_TYPE', '需要 multipart/form-data 格式', 400)
          }

          // 使用 Bun 的内置文件处理
          const formData = await req.formData()
          const file = formData.get('file') as File | null
          
          if (!file) {
            return createErrorResponse('NO_FILE', '未找到上传的文件', 400)
          }

          // 转换为 Buffer
          const arrayBuffer = await file.arrayBuffer()
          const buffer = Buffer.from(arrayBuffer)

          // 上传到工作区
          const workspaceManager = getWorkspaceManager()
          const result = await workspaceManager.uploadFile(
            sessionId,
            buffer,
            file.name,
            file.type || 'application/octet-stream'
          )

          if (!result.success) {
            return createErrorResponse('UPLOAD_FAILED', result.error || '文件上传失败', 400)
          }

          return createSuccessResponse({
            success: true,
            fileId: result.fileId,
            filename: result.filename,
            originalName: result.originalName,
            path: result.path,
            size: result.size,
            message: '文件上传成功'
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '文件上传失败'
          return createErrorResponse('UPLOAD_ERROR', message, 500)
        }
      }

      // GET /api/workspace/:sessionId/files - 获取工作区文件列表
      const workspaceFilesMatch = path.match(/^\/api\/workspace\/([^\/]+)\/files$/)
      if (workspaceFilesMatch && method === 'GET') {
        try {
          const auth = await authMiddleware(req)
          if (!auth.userId) {
            return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
          }

          const sessionId = workspaceFilesMatch[1]
          const workspaceManager = getWorkspaceManager()
          const files = await workspaceManager.listFiles(sessionId)

          return createSuccessResponse({
            files,
            count: files.length,
            sessionId
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '获取文件列表失败'
          return createErrorResponse('LIST_FILES_FAILED', message, 500)
        }
      }

      // DELETE /api/workspace/:sessionId/files/:filename - 删除工作区中的文件
      const workspaceDeleteMatch = path.match(/^\/api\/workspace\/([^\/]+)\/files\/([^\/]+)$/)
      if (workspaceDeleteMatch && method === 'DELETE') {
        try {
          const auth = await authMiddleware(req)
          if (!auth.userId) {
            return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
          }

          const sessionId = workspaceDeleteMatch[1]
          const filename = decodeURIComponent(workspaceDeleteMatch[2])
          const workspaceManager = getWorkspaceManager()
          const success = await workspaceManager.deleteFile(sessionId, filename)

          if (!success) {
            return createErrorResponse('DELETE_FAILED', '文件删除失败或文件不存在', 404)
          }

          return createSuccessResponse({ 
            success: true, 
            message: '文件删除成功' 
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '文件删除失败'
          return createErrorResponse('DELETE_ERROR', message, 500)
        }
      }

      // GET /api/workspace/:sessionId/info - 获取工作区信息
      const workspaceInfoMatch = path.match(/^\/api\/workspace\/([^\/]+)$/i)
      if (workspaceInfoMatch && method === 'GET') {
        try {
          const auth = await authMiddleware(req)
          if (!auth.userId) {
            return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
          }

          const sessionId = workspaceInfoMatch[1]
          const workspaceManager = getWorkspaceManager()
          const workspace = await workspaceManager.getWorkspace(sessionId)

          if (!workspace) {
            return createErrorResponse('NOT_FOUND', '工作区不存在', 404)
          }

          return createSuccessResponse({ workspace })
        } catch (error) {
          const message = error instanceof Error ? error.message : '获取工作区信息失败'
          return createErrorResponse('INFO_FAILED', message, 500)
        }
      }

      // DELETE /api/workspace/:sessionId - 清空工作区
      if (workspaceInfoMatch && method === 'DELETE') {
        try {
          const auth = await authMiddleware(req)
          if (!auth.userId) {
            return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
          }

          const sessionId = workspaceInfoMatch[1]
          const workspaceManager = getWorkspaceManager()
          const success = await workspaceManager.clearWorkspace(sessionId)

          if (!success) {
            return createErrorResponse('CLEAR_FAILED', '工作区清空失败或不存在', 404)
          }

          return createSuccessResponse({ 
            success: true, 
            message: '工作区已清空' 
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : '清空工作区失败'
          return createErrorResponse('CLEAR_ERROR', message, 500)
        }
      }

      // ==================== Models API ====================

      // GET /api/models - 获取可用模型列表
      if (path === '/api/models' && method === 'GET') {
        return createSuccessResponse({
          models: AVAILABLE_MODELS,
          default: AVAILABLE_MODELS[0],
        })
      }

      // ==================== MCP API ====================

      // GET /api/mcp/servers - 获取 MCP 服务器列表
      if (path === '/api/mcp/servers' && method === 'GET') {
        const servers = getMCPBridge().getServers()
        const serverRuntimes = (getMCPBridge() as any).serverRuntimes

        return createSuccessResponse({
          servers: servers.map(s => {
            const runtime = serverRuntimes?.get(s.id)
            return {
              id: s.id,
              name: s.name,
              command: s.command,
              args: s.args,
              enabled: s.enabled,
              status: runtime?.status || 'disconnected',
              tools: runtime?.tools?.length || 0,
            }
          }),
          count: servers.length,
        })
      }

      // POST /api/mcp/servers - 添加 MCP 服务器
      if (path === '/api/mcp/servers' && method === 'POST') {
        try {
          const body = await req.json() as {
            name: string
            command: string
            args?: string[]
            env?: Record<string, string>
            transport?: 'stdio' | 'websocket' | 'sse' | 'streamable-http'
            url?: string
          }

          const { name, command, args, env, transport, url } = body

          if (!name || !command) {
            return createErrorResponse('INVALID_PARAMS', 'name and command are required', 400)
          }

          const server = getMCPBridge().addServer({
            name,
            command,
            args: args || [],
            env: env || {},
            enabled: true,
            transport: transport || 'stdio',
            url,
          })

          return createSuccessResponse({
            success: true,
            server: {
              id: server.id,
              name: server.name,
              command: server.command,
              enabled: server.enabled,
            },
            message: `MCP server '${name}' added successfully`,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to add MCP server'
          return createErrorResponse('MCP_ADD_FAILED', message, 500)
        }
      }

      // DELETE /api/mcp/servers/:id - 移除 MCP 服务器
      if (path.startsWith('/api/mcp/servers/') && method === 'DELETE') {
        const serverId = path.replace('/api/mcp/servers/', '')
        const removed = getMCPBridge().removeServer(serverId)

        if (!removed) {
          return createErrorResponse('SERVER_NOT_FOUND', `Server not found: ${serverId}`, 404)
        }

        return createSuccessResponse({
          success: true,
          message: 'Server removed successfully',
        })
      }

      // PUT /api/mcp/servers/:id/toggle - 启用/禁用 MCP 服务器
      if (path.match(/^\/api\/mcp\/servers\/[^/]+\/toggle$/) && method === 'PUT') {
        try {
          const serverId = path.split('/')[4]
          const body = await req.json() as { enabled: boolean }

          const success = getMCPBridge().toggleServer(serverId, body.enabled)

          if (!success) {
            return createErrorResponse('SERVER_NOT_FOUND', `Server not found: ${serverId}`, 404)
          }

          return createSuccessResponse({
            success: true,
            enabled: body.enabled,
            message: body.enabled ? 'Server enabled' : 'Server disabled',
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to toggle server'
          return createErrorResponse('TOGGLE_FAILED', message, 500)
        }
      }

      // GET /api/mcp/servers/:id/test - 测试 MCP 服务器连接
      if (path.match(/^\/api\/mcp\/servers\/[^/]+\/test$/) && method === 'POST') {
        const serverId = path.split('/')[4]
        const result = await getMCPBridge().testConnection(serverId)

        return createSuccessResponse(result)
      }

      // GET /api/mcp/tools - 获取 MCP 工具列表
      if (path === '/api/mcp/tools' && method === 'GET') {
        const serverId = url.searchParams.get('serverId') || undefined
        const serverName = url.searchParams.get('serverName') || undefined

        let tools = getMCPBridge().getAllTools()

        if (serverId) {
          tools = tools.filter(t => t.serverId === serverId)
        }
        if (serverName) {
          tools = tools.filter(t => t.serverName === serverName)
        }

        return createSuccessResponse({
          tools: tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            serverId: t.serverId,
            serverName: t.serverName,
          })),
          count: tools.length,
          serverId,
          serverName,
        })
      }

      // POST /api/mcp/call - 调用 MCP 工具
      if (path === '/api/mcp/call' && method === 'POST') {
        try {
          const body = await req.json() as {
            toolName: string
            toolInput: Record<string, unknown>
            serverId?: string
          }

          const { toolName, toolInput, serverId } = body

          if (!toolName || !toolInput) {
            return createErrorResponse('INVALID_PARAMS', 'toolName and toolInput are required', 400)
          }

          const result = await getMCPBridge().callTool(toolName, toolInput)

          return createSuccessResponse({
            success: result.success,
            result: result.result,
            error: result.error,
            toolName,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'MCP tool call failed'
          return createErrorResponse('MCP_CALL_FAILED', message, 500)
        }
      }

      // GET /api/mcp/status - 获取 MCP 状态
      if (path === '/api/mcp/status' && method === 'GET') {
        return createSuccessResponse(getMCPBridge().getStatus())
      }

      // ==================== Monitoring API ====================

      // GET /api/monitoring/metrics - 获取性能指标
      if (path === '/api/monitoring/metrics' && method === 'GET') {
        return createSuccessResponse(performanceMonitor.getMetrics())
      }

      // GET /api/monitoring/logs - 获取日志
      if (path === '/api/monitoring/logs' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '100', 10)
        const level = url.searchParams.get('level') as 'debug' | 'info' | 'warn' | 'error' | 'fatal' | undefined
        const logs = performanceMonitor.getLogs(limit, level)
        return createSuccessResponse({ logs, count: logs.length })
      }

      // GET /api/monitoring/alerts - 获取告警
      if (path === '/api/monitoring/alerts' && method === 'GET') {
        const unacknowledgedOnly = url.searchParams.get('unacknowledged') === 'true'
        const alerts = performanceMonitor.getAlerts(undefined, unacknowledgedOnly)
        return createSuccessResponse({ alerts, count: alerts.length })
      }

      // POST /api/monitoring/alerts/acknowledge - 确认告警
      if (path === '/api/monitoring/alerts/acknowledge' && method === 'POST') {
        try {
          const body = await req.json() as { alertId: string }
          const success = performanceMonitor.acknowledgeAlert(body.alertId)
          return createSuccessResponse({ success, message: success ? 'Alert acknowledged' : 'Alert not found' })
        } catch (error) {
          return createErrorResponse('INVALID_REQUEST', 'Failed to acknowledge alert', 400)
        }
      }

      // GET /api/monitoring/rules - 获取告警规则
      if (path === '/api/monitoring/rules' && method === 'GET') {
        const rules = performanceMonitor.getAlertRules()
        return createSuccessResponse({ rules, count: rules.length })
      }

      // POST /api/monitoring/rules - 添加告警规则
      if (path === '/api/monitoring/rules' && method === 'POST') {
        try {
          const body = await req.json() as {
            name: string
            condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
            metric: string
            threshold: number
            enabled?: boolean
            cooldown?: number
          }
          const rule = performanceMonitor.addAlertRule({
            name: body.name,
            condition: body.condition,
            metric: body.metric,
            threshold: body.threshold,
            enabled: body.enabled ?? true,
            cooldown: body.cooldown ?? 60000,
          })
          return createSuccessResponse({ rule })
        } catch (error) {
          return createErrorResponse('INVALID_REQUEST', 'Failed to add alert rule', 400)
        }
      }

      // POST /api/monitoring/record - 记录指标
      if (path === '/api/monitoring/record' && method === 'POST') {
        try {
          const body = await req.json() as {
            name: string
            value: number
            unit?: string
            tags?: Record<string, string>
          }
          performanceMonitor.recordMetric(body.name, body.value, body.unit, body.tags)
          return createSuccessResponse({ recorded: true })
        } catch (error) {
          return createErrorResponse('INVALID_REQUEST', 'Failed to record metric', 400)
        }
      }

      // ==================== Diagnostics API ====================

      // GET /api/diagnostics/health - 健康检查
      if (path === '/api/diagnostics/health' && method === 'GET') {
        const dbConnected = true // 假设数据库已连接
        const healthStatus = performanceMonitor.getHealthStatus(dbConnected)
        
        // 更新 WebSocket 连接数
        const connections = wsManager.getAllConnections().size
        const sessions = wsManager.getActiveSessions().size
        performanceMonitor.setWebSocketStats(connections, sessions)
        
        // 重新获取包含最新 WebSocket 数据的健康状态
        const updatedHealthStatus = performanceMonitor.getHealthStatus(dbConnected)
        
        return createSuccessResponse(updatedHealthStatus)
      }

      // GET /api/diagnostics/components - 获取组件详细信息
      if (path === '/api/diagnostics/components' && method === 'GET') {
        const dbConnected = true
        const healthStatus = performanceMonitor.getHealthStatus(dbConnected)
        
        // 更新 WebSocket 连接数
        const connections = wsManager.getAllConnections().size
        const sessions = wsManager.getActiveSessions().size
        performanceMonitor.setWebSocketStats(connections, sessions)
        
        // 获取更新后的健康状态
        const updatedHealthStatus = performanceMonitor.getHealthStatus(dbConnected)
        
        // 获取性能指标
        const metrics = performanceMonitor.getMetrics()
        
        // 获取告警规则
        const rules = performanceMonitor.getAlertRules()
        
        // 获取未确认的告警
        const alerts = performanceMonitor.getAlerts(undefined, true)
        
        return createSuccessResponse({
          health: updatedHealthStatus,
          metrics: {
            uptime: metrics.uptime,
            memory: metrics.memory,
            cpu: metrics.cpu,
            requests: metrics.requests,
            tools: metrics.tools,
            connections: metrics.connections,
          },
          alerts: {
            rules: rules.length,
            active: alerts.length,
            details: alerts,
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

        // 配置 Agent 状态推送
        const agentStatusService = getAgentStatusService()
        agentStatusService.setWSPush((clientId, data) => {
          if (clientId === 'broadcast') {
            // 广播到所有连接的客户端
            wsManager.broadcast('agent_status', {
              type: data.type,
              payload: data.payload,
              timestamp: data.timestamp,
            } as any)
          }
        })

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

                sessionManager.createSession(userId, title, model, force).then(session => {
                  wsData.sessionId = session.id
                  console.log(`[WS] Session created/returned: ${session.id} for user ${userId}`)
                  ws.send(JSON.stringify({ type: 'session_created', session }))
                }).catch(err => {
                  console.error('[WS] Failed to create session:', err)
                  sendEvent('error', { message: 'Failed to create session' })
                })
              }
              break

            case 'load_session':
              {
                const sessionId = message.sessionId as string
                const userId = wsData.userId
                if (!userId) {
                  sendEvent('error', { message: 'User not authenticated' })
                  break
                }

                const currentSessionId = wsData.sessionId

                // 如果切换会话，先保存当前会话
                if (currentSessionId && currentSessionId !== sessionId) {
                  console.log(`[WS] Switching from session ${currentSessionId} to ${sessionId}, saving first`)
                  await sessionManager.switchSession(currentSessionId, sessionId)
                }

                sessionManager.loadSession(sessionId).then(sessionData => {
                  if (!sessionData) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }))
                    return
                  }

                  wsData.sessionId = sessionId
                  console.log(`[WS] Session loaded: ${sessionId}, messages: ${sessionData.messages.length}`)

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
                console.log(`[WS] list_sessions: userId=${userId}`)
                if (!userId) {
                  console.log('[WS] list_sessions: userId is null, sending error')
                  sendEvent('error', { message: 'User not registered' })
                  break
                }

                sessionManager.getUserSessions(userId).then(sessions => {
                  console.log(`[WS] list_sessions: found ${sessions.length} sessions for user ${userId}`)
                  console.log(`[WS] list_sessions: sessions data:`, JSON.stringify(sessions, null, 2))
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
                const userId = wsData.userId
                if (!userId) {
                  sendEvent('error', { message: 'User not authenticated' })
                  break
                }
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
                console.log('[WS] delete_session 事件收到:', message)
                const sessionId = message.sessionId as string
                const userId = wsData.userId
                console.log('[WS] delete_session - sessionId:', sessionId, 'userId:', userId)
                if (!userId) {
                  sendEvent('error', { message: 'User not authenticated' })
                  break
                }
                sessionManager.deleteSession(sessionId, userId).then(() => {
                  console.log('[WS] 会话删除成功，发送 session_deleted 事件:', sessionId)
                  ws.send(JSON.stringify({ type: 'session_deleted', sessionId }))
                  if (wsData.sessionId === sessionId) {
                    wsData.sessionId = null
                  }
                }).catch(err => {
                  console.error('[WS] Failed to delete session:', err)
                  const msg = err instanceof Error ? err.message : 'Failed to delete session'
                  sendEvent('error', { message: msg })
                })
              }
              break

            case 'rename_session':
              {
                const sessionId = message.sessionId as string
                const userId = wsData.userId
                if (!userId) {
                  sendEvent('error', { message: 'User not authenticated' })
                  break
                }
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
                const userId = wsData.userId
                if (!userId) {
                  sendEvent('error', { message: 'User not authenticated' })
                  break
                }
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

            case 'agents_list' as any:
              {
                const agents = getBuiltInAgents()
                sendEvent('agents_list', {
                  agents: agents.map(agent => ({
                    agentType: agent.agentType,
                    name: agent.agentType,
                    description: agent.description || agent.whenToUse,
                    icon: agent.icon,
                    color: agent.color,
                    isReadOnly: agent.isReadOnly,
                    source: agent.source
                  }))
                })
              }
              break

            case 'agents_orchestration_state' as any:
              {
                const state = agentManager.getOrchestrationState()
                sendEvent('agents_orchestration_state', state)
              }
              break

            case 'agents_orchestration_init' as any:
              {
                try {
                  const orchestratorType = message.orchestratorType as string
                  const subAgentTypes = message.subAgentTypes as string[]
                  
                  let state
                  if (orchestratorType && subAgentTypes) {
                    agentManager.resetOrchestration()
                    agentManager.initializeOrchestration(orchestratorType, subAgentTypes)
                    state = agentManager.getOrchestrationState()
                  } else {
                    state = initializeDemoOrchestration()
                  }
                  
                  sendEvent('agents_orchestration_state', state)
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : '初始化协调失败'
                  sendEvent('error', { message: errorMessage })
                }
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
  console.log(`\n[API]  Tools Endpoints:`)
  console.log(`       GET    /api/tools            - 获取工具列表`)
  console.log(`       GET    /api/tools/:name       - 获取特定工具详情`)
  console.log(`       POST   /api/tools/execute     - 执行工具`)
  console.log(`       GET    /api/tools/history     - 获取工具执行历史`)
  console.log(`       POST   /api/tools/history/clear - 清空历史`)
  console.log(`       POST   /api/tools/validate    - 验证工具输入`)
  console.log(`\n[API]  Models Endpoints:`)
  console.log(`       GET    /api/models           - 获取可用模型列表`)
  console.log(`\n[API]  MCP Endpoints:`)
  console.log(`       GET    /api/mcp/servers      - 获取 MCP 服务器列表`)
  console.log(`       GET    /api/mcp/tools        - 获取 MCP 工具列表`)
  console.log(`\n[API]  Monitoring Endpoints:`)
  console.log(`       GET    /api/monitoring/metrics        - 获取性能指标`)
  console.log(`       GET    /api/monitoring/logs           - 获取日志`)
  console.log(`       GET    /api/monitoring/alerts         - 获取告警`)
  console.log(`       POST   /api/monitoring/alerts/acknowledge - 确认告警`)
  console.log(`       GET    /api/monitoring/rules          - 获取告警规则`)
  console.log(`       POST   /api/monitoring/rules          - 添加告警规则`)
  console.log(`       POST   /api/monitoring/record         - 记录指标`)
  console.log(`\n[API]  Agents Endpoints:`)
  console.log(`       GET    /api/agents                    - 获取所有可用 Agent`)
  console.log(`       GET    /api/agents/:type              - 获取特定 Agent 详情`)
  console.log(`       GET    /api/agents/orchestration/state - 获取协调状态`)
  console.log(`       POST   /api/agents/orchestration/init  - 初始化多 Agent 协调`)
  console.log(`       POST   /api/agents/execute            - 执行 Agent 任务`)
  console.log(`\n[API]  Isolation Endpoints (用户隔离):`)
  console.log(`       POST   /api/agents/isolation          - 创建隔离上下文`)
  console.log(`       GET    /api/agents/isolation          - 获取用户的隔离上下文列表`)
  console.log(`       GET    /api/agents/isolation/:id      - 获取隔离上下文详情`)
  console.log(`       POST   /api/agents/isolation/:id/execute - 在隔离上下文中执行命令`)
  console.log(`       DELETE /api/agents/isolation/:id      - 销毁隔离上下文`)
  console.log(`\n[API]  Workspace Endpoints (工作区管理):`)
  console.log(`       POST   /api/workspace/:sessionId/upload   - 上传文件到工作区`)
  console.log(`       GET    /api/workspace/:sessionId/files    - 获取工作区文件列表`)
  console.log(`       DELETE /api/workspace/:sessionId/files/:filename - 删除文件`)
  console.log(`       GET    /api/workspace/:sessionId          - 获取工作区信息`)
  console.log(`       DELETE /api/workspace/:sessionId          - 清空工作区`)
  console.log(`\n[API]  Diagnostics Endpoints:`)
  console.log(`       GET    /api/diagnostics/health        - 健康检查`)
  console.log(`       GET    /api/diagnostics/components    - 获取组件详细信息`)
  console.log(`\n[WS]   WebSocket Events:`)
  console.log(`       create_session, load_session, list_sessions`)
  console.log(`       user_message, delete_session, rename_session`)
  console.log(`       clear_session, get_tools, execute_command`)
  console.log(`       get_models, get_status, rpc_call`)
  console.log(`       agents_list, agents_orchestration_state, agents_orchestration_init`)
  console.log(`\n[WS]   Tool RPC Methods:`)
  console.log(`       tool.list, tool.execute, tool.executeStreaming`)
  console.log(`       tool.history, tool.clearHistory, tool.validateInput`)
  console.log(`       mcp.listServers, mcp.listTools, mcp.callTool`)
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
      return getMCPBridge().getServers()
    },
  })

  wsManager.registerMethod({
    name: 'mcp.getStatus',
    description: 'Get MCP status',
    execute: async () => {
      return getMCPBridge().getStatus()
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
  
  // Save all Agent state (Agent, Mailbox, Team, Isolation)
  try {
    const { getAgentPersistenceService } = await import('./agents/agentPersistence')
    await getAgentPersistenceService().forceSaveAll()
  } catch (error) {
    console.error('[Server] Failed to save Agent state:', error)
  }
  
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
