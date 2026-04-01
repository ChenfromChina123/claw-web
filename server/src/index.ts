import Anthropic from '@anthropic-ai/sdk'
import { exec, execFile } from 'child_process'
import { readFile, writeFile } from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { initDatabase, closePool } from './db/mysql'
import { SessionManager } from './services/sessionManager'
import { authService } from './services/authService'
import { verifyToken, extractTokenFromHeader } from './services/jwtService'
import type { ConversationMessage, ToolCall, LoginRequest, RegisterRequest, ResetPasswordRequest } from './models/types'

const PORT = 3000

interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

interface Message {
  type: string
  [key: string]: unknown
}

interface WebSocketData {
  sendEvent: ((event: string, data: unknown) => void) | null
  sessionId: string | null
  userId: string | null
  token: string | null
}

const AVAILABLE_MODELS = [
  { id: 'qwen-plus', name: '通义千问 Plus', provider: 'aliyun' },
  { id: 'qwen-turbo', name: '通义千问 Turbo', provider: 'aliyun' },
  { id: 'qwen-max', name: '通义千问 Max', provider: 'aliyun' },
]

function getAnthropicClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? undefined,
    authToken: process.env.ANTHROPIC_AUTH_TOKEN ?? undefined,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(300000), 10),
    maxRetries: 0,
  })
}

function createSuccessResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
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

class ToolExecutor {
  private tools: Tool[] = [
    {
      name: 'Bash',
      description: 'Execute shell commands',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          workingDirectory: { type: 'string', description: 'Working directory for the command' },
        },
        required: ['command'],
      },
    },
    {
      name: 'FileRead',
      description: 'Read contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to read' },
        },
        required: ['path'],
      },
    },
    {
      name: 'FileWrite',
      description: 'Write content to a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to write' },
          content: { type: 'string', description: 'Content to write to the file' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'FileEdit',
      description: 'Edit a file by replacing text',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to edit' },
          oldText: { type: 'string', description: 'Text to find and replace' },
          newText: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'oldText', 'newText'],
      },
    },
    {
      name: 'Grep',
      description: 'Search for patterns in files',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search pattern (regex)' },
          path: { type: 'string', description: 'Directory or file to search in' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'Glob',
      description: 'List files matching a pattern',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g., **/*.ts)' },
          path: { type: 'string', description: 'Base directory for search' },
        },
        required: ['pattern'],
      },
    },
    {
      name: 'WebSearch',
      description: 'Search the web for information',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  ]

  async executeTool(name: string, input: Record<string, unknown>, sendEvent: (event: string, data: unknown) => void): Promise<unknown> {
    sendEvent('tool_start', { name, input })

    try {
      let result: unknown

      switch (name) {
        case 'Bash':
          result = await this.executeBash(input.command as string, process.cwd(), sendEvent)
          break
        case 'FileRead':
          result = await this.readFile(input.path as string)
          break
        case 'FileWrite':
          await this.writeFile(input.path as string, input.content as string)
          result = { success: true, message: 'File written successfully' }
          break
        case 'FileEdit':
          result = await this.editFile(input.path as string, input.oldText as string, input.newText as string)
          break
        case 'Grep':
          result = await this.grep(input.pattern as string, input.path as string | undefined)
          break
        case 'Glob':
          result = await this.glob(input.pattern as string, input.path as string | undefined)
          break
        case 'WebSearch':
          result = await this.webSearch(input.query as string)
          break
        default:
          throw new Error(`Unknown tool: ${name}`)
      }

      sendEvent('tool_end', { name, result })
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      sendEvent('tool_error', { name, error: errorMessage })
      return { error: errorMessage }
    }
  }

  private executeBash(command: string, cwd?: string, sendEvent?: (event: string, data: unknown) => void): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32'
      const args = isWindows ? ['-Command', command] : ['-c', command]

      sendEvent?.('tool_progress', { output: `Executing: ${command}\n` })

      const child = execFile(isWindows ? 'powershell.exe' : '/bin/bash', args, { cwd }, (error, stdout, stderr) => {
        if (error) {
          sendEvent?.('tool_progress', { output: `Error: ${stderr || error.message}\n` })
        }
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode: error?.code || 0,
        })
      })

      child.stdout?.on('data', (data) => {
        sendEvent?.('tool_progress', { output: data.toString() })
      })

      child.stderr?.on('data', (data) => {
        sendEvent?.('tool_progress', { output: data.toString() })
      })
    })
  }

  private async readFile(path: string): Promise<{ content: string; path: string }> {
    const content = await readFile(path, 'utf-8')
    return { content, path }
  }

  private async writeFile(path: string, content: string): Promise<void> {
    await writeFile(path, content, 'utf-8')
  }

  private async editFile(path: string, oldText: string, newText: string): Promise<{ success: boolean; message: string }> {
    const content = await readFile(path, 'utf-8')
    if (!content.includes(oldText)) {
      throw new Error(`Text not found in file: ${oldText}`)
    }
    const newContent = content.replace(oldText, newText)
    await writeFile(path, newContent, 'utf-8')
    return { success: true, message: 'File edited successfully' }
  }

  private grep(pattern: string, path?: string): Promise<{ matches: string[] }> {
    return new Promise((resolve) => {
      const searchPath = path || '.'
      const isWindows = process.platform === 'win32'
      let command: string

      if (isWindows) {
        command = `Get-ChildItem -Recurse -Path "${searchPath}" -Filter "*${pattern}*" -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName`
      } else {
        command = `grep -rn "${pattern}" ${searchPath} 2>/dev/null || true`
      }

      exec(command, { cwd: searchPath }, (error, stdout) => {
        const matches = stdout.trim().split('\n').filter(Boolean)
        resolve({ matches })
      })
    })
  }

  private glob(pattern: string, path?: string): Promise<{ files: string[] }> {
    return new Promise((resolve) => {
      const searchPath = path || '.'
      const isWindows = process.platform === 'win32'
      let command: string

      if (isWindows) {
        command = `Get-ChildItem -Recurse -Path "${searchPath}" -Filter "${pattern}" -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName`
      } else {
        command = `find ${searchPath} -name "${pattern}" -type f 2>/dev/null || true`
      }

      exec(command, { cwd: searchPath }, (error, stdout) => {
        const files = stdout.trim().split('\n').filter(Boolean)
        resolve({ files })
      })
    })
  }

  private async webSearch(query: string): Promise<{ results: string[] }> {
    return { results: [`Web search for: ${query} - (WebSearch tool placeholder)`] }
  }

  getTools(): Tool[] {
    return this.tools
  }

  getAnthropicTools(): Anthropic.Tool[] {
    return this.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }))
  }
}

class SessionConversationManager {
  private toolExecutor: ToolExecutor

  constructor(toolExecutor: ToolExecutor) {
    this.toolExecutor = toolExecutor
  }

  async processMessage(
    sessionId: string,
    userMessage: string,
    model: string,
    sessionManager: SessionManager,
    sendEvent: (event: string, data: unknown) => void
  ): Promise<void> {
    sessionManager.addMessage(sessionId, 'user', userMessage)

    const sessionData = sessionManager.getInMemorySession(sessionId)
    if (!sessionData) {
      sendEvent('error', { message: 'Session not found' })
      return
    }

    const messages = sessionData.messages
    const client = getAnthropicClient()

    console.log('Starting streaming processMessage with model:', model)
    console.log('Total messages in history:', messages.length)

    try {
      let maxIterations = 10
      let iteration = 0

      while (iteration < maxIterations) {
        iteration++
        console.log(`API iteration ${iteration}, messages count:`, messages.length)

        sendEvent('message_start', {})

        const stream = client.messages.stream({
          model,
          max_tokens: 4096,
          messages: messages,
          tools: this.toolExecutor.getAnthropicTools(),
        })

        let assistantText = ''
        let pendingToolCalls: Array<{ id: string; name: string; input: string }> = []
        let currentTextBlock = ''
        let executedToolCalls: ToolCall[] = []

        for await (const event of stream) {
          console.log('Stream event:', event.type)

          switch (event.type) {
            case 'content_block_start':
              if (event.content_block.type === 'tool_use') {
                const toolId = event.content_block.id || uuidv4()
                const toolName = event.content_block.name || ''
                console.log('Tool use started:', toolName, 'id:', toolId)
                pendingToolCalls.push({ id: toolId, name: toolName, input: '' })
                sendEvent('tool_use', { id: toolId, name: toolName, input: {} })
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
                sendEvent('message_stop', { stop_reason: event.delta.stop_reason })
              }
              break

            case 'message_stop':
              console.log('Message stream completed')
              console.log('Processing', pendingToolCalls.length, 'pending tool calls')
              for (const tool of pendingToolCalls) {
                const toolInput = tool.input ? JSON.parse(tool.input) : {}
                sendEvent('tool_start', { name: tool.name, input: tool.input })

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
                  const result = await this.toolExecutor.executeTool(
                    tool.name,
                    toolInput as Record<string, unknown>,
                    sendEvent
                  )

                  toolCall.toolOutput = result as Record<string, unknown>
                  toolCall.status = 'completed'

                  sessionManager.addToolCall(sessionId, toolCall)
                  sessionManager.addMessage(sessionId, 'user', JSON.stringify({ tool_use_id: tool.id, name: tool.name, result }))

                  console.log('Tool result added to messages:', tool.name)
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error)
                  console.error('Tool execution error:', errorMessage)

                  toolCall.toolOutput = { error: errorMessage }
                  toolCall.status = 'error'

                  sessionManager.addToolCall(sessionId, toolCall)
                  sessionManager.addMessage(sessionId, 'user', JSON.stringify({ tool_use_id: tool.id, name: tool.name, error: errorMessage }))
                }
              }
              executedToolCalls = pendingToolCalls.map(tc => ({
                id: tc.id,
                messageId: '',
                sessionId,
                toolName: tc.name,
                toolInput: tc.input ? JSON.parse(tc.input) : {},
                toolOutput: null,
                status: 'completed' as const,
                createdAt: new Date(),
              }))
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
          console.log('Conversation completed, total messages:', finalSession.messages.length)
          break
        }

        const lastTool = lastMsg.toolCalls[lastMsg.toolCalls.length - 1]
        if (lastTool.status !== 'pending' && iteration < maxIterations) {
          console.log('Tool was used, continuing with', finalSession.messages.length, 'messages...')
          continue
        }

        console.log('Conversation completed, total messages:', finalSession.messages.length)
        break
      }

      if (iteration >= maxIterations) {
        console.log('Max iterations reached')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('API call error:', errorMessage)
      sendEvent('error', { message: errorMessage })
    }
  }
}

const toolExecutor = new ToolExecutor()
const sessionConversationManager = new SessionConversationManager(toolExecutor)
const sessionManager = SessionManager.getInstance()

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
      const body = await request.json()
      const email = body.email as string
      await authService.sendRegisterCode(email)
      return createSuccessResponse({ message: '验证码已发送到您的邮箱' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送验证码失败'
      return createErrorResponse('SEND_CODE_FAILED', message, 400)
    }
  }

  if (path === '/api/auth/register' && method === 'POST') {
    try {
      const body = await request.json()
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
      const body = await request.json()
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
      const body = await request.json()
      const email = body.email as string
      await authService.sendForgotPasswordCode(email)
      return createSuccessResponse({ message: '验证码已发送到您的邮箱' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '发送验证码失败'
      return createErrorResponse('SEND_CODE_FAILED', message, 400)
    }
  }

  if (path === '/api/auth/forgot-password' && method === 'POST') {
    try {
      const body = await request.json()
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

  return createErrorResponse('NOT_FOUND', `Route ${path} not found`, 404)
}

async function startServer() {
  try {
    console.log('Initializing database...')
    await initDatabase()
    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Failed to initialize database:', error)
    console.warn('Server will start without database connection')
  }

  const server = Bun.serve({
    port: PORT,
    async fetch(req, server) {
      const url = new URL(req.url)
      const path = url.pathname
      const method = req.method

      if (path.startsWith('/api/auth/')) {
        return handleAuthRoutes(path, method, req)
      }

      if (path === '/ws') {
        const success = server.upgrade(req, {
          data: { sendEvent: null, sessionId: null, userId: null, token: null } as WebSocketData,
        })

        if (!success) {
          return new Response('WebSocket upgrade failed', { status: 500 })
        }

        return
      }

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

      if (path === '/api/health' && method === 'GET') {
        return createSuccessResponse({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          dbConnected: true,
        })
      }

      if (path === '/api/models' && method === 'GET') {
        return createSuccessResponse({ models: AVAILABLE_MODELS })
      }

      if (path === '/api/tools' && method === 'GET') {
        return createSuccessResponse({ tools: toolExecutor.getTools() })
      }

      return createErrorResponse('NOT_FOUND', `Route ${path} not found`, 404)
    },

    websocket: {
      open(ws) {
        console.log('Client connected')
        ws.data = { sendEvent: null, sessionId: null, userId: null, token: null } as WebSocketData
      },

      message(ws, data) {
        console.log('WebSocket message received:', data.toString())
        try {
          const message: Message = JSON.parse(data.toString())
          console.log('Parsed message:', message)

          const sendEvent = (event: string, eventData: unknown) => {
            const wsData = ws.data as WebSocketData
            if (wsData.sendEvent && ws.readyState === 1) {
              const payload = JSON.stringify({ type: event, ...eventData as object, sessionId: wsData.sessionId })
              ws.send(payload)
            }
          }

          const wsData = ws.data as WebSocketData
          wsData.sendEvent = sendEvent

          switch (message.type) {
            case 'register':
              {
                const userId = message.userId as string || uuidv4()
                const username = message.username as string || `user_${userId.slice(0, 8)}`
                wsData.userId = userId

                sessionManager.getOrCreateUser(userId, username).then(user => {
                  wsData.userId = user.id
                  console.log(`User registered: ${user.id} (${user.username})`)
                  ws.send(JSON.stringify({ type: 'registered', userId: user.id, username: user.username }))
                }).catch(err => {
                  console.error('Failed to register user:', err)
                  ws.send(JSON.stringify({ type: 'error', message: 'Failed to register user' }))
                })
              }
              break

            case 'login':
              {
                const token = message.token as string
                if (token) {
                  wsData.token = token
                  verifyToken(token).then(payload => {
                    if (payload) {
                      wsData.userId = payload.userId
                      console.log(`User logged in via token: ${payload.userId}`)
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

                sessionManager.createSession(userId, title, model).then(session => {
                  wsData.sessionId = session.id
                  console.log(`Session created: ${session.id} for user ${userId}`)
                  ws.send(JSON.stringify({ type: 'session_created', session }))
                }).catch(err => {
                  console.error('Failed to create session:', err)
                  sendEvent('error', { message: 'Failed to create session' })
                })
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
                  console.log(`Session loaded: ${sessionId}`)

                  ws.send(JSON.stringify({
                    type: 'session_loaded',
                    session: sessionData.session,
                    messages: sessionData.messages,
                    toolCalls: sessionData.toolCalls,
                  }))
                }).catch(err => {
                  console.error('Failed to load session:', err)
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
                  console.error('Failed to list sessions:', err)
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

                console.log(`Processing message for session ${sessionId}:`, content)

                sessionConversationManager.processMessage(
                  sessionId,
                  content,
                  model,
                  sessionManager,
                  sendEvent
                ).catch(err => {
                  console.error('processMessage error:', err)
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
                  console.error('Failed to delete session:', err)
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
                  console.error('Failed to rename session:', err)
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
                  console.error('Failed to clear session:', err)
                  sendEvent('error', { message: 'Failed to clear session' })
                })
              }
              break

            case 'get_tools':
              sendEvent('tools', { tools: toolExecutor.getTools() })
              break

            case 'validate_user':
              {
                const userId = message.userId as string
                const username = message.username as string

                sessionManager.getOrCreateUser(userId, username).then(user => {
                  wsData.userId = user.id
                  console.log(`User validated: ${user.id} (${user.username})`)
                  ws.send(JSON.stringify({ type: 'user_validated', userId: user.id, username: user.username }))
                }).catch(err => {
                  console.error('Failed to validate user:', err)
                  ws.send(JSON.stringify({ type: 'user_invalid' }))
                })
              }
              break

            default:
              sendEvent('error', { message: `Unknown message type: ${message.type}` })
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.error('Message handling error:', errorMessage)
        }
      },

      close(ws) {
        console.log('Client disconnected')
        const wsData = ws.data as WebSocketData
        if (wsData.sessionId) {
          sessionManager.saveSession(wsData.sessionId).catch(err => {
            console.error('Failed to save session on close:', err)
          })
        }
      },
    },
  })

  console.log(`Claude Code Haha WebSocket Server running at ws://localhost:${PORT}`)
  console.log(`REST API: http://localhost:${PORT}/api/*`)
  console.log(`Auth API Endpoints:`)
  console.log(`  POST /api/auth/register/send-code  - 发送注册验证码`)
  console.log(`  POST /api/auth/register            - 用户注册`)
  console.log(`  POST /api/auth/login               - 用户登录`)
  console.log(`  POST /api/auth/forgot-password/send-code  - 发送重置密码验证码`)
  console.log(`  POST /api/auth/forgot-password     - 重置密码`)
  console.log(`  GET  /api/auth/me                  - 获取当前用户信息`)
  console.log(`  GET  /api/health  - Health check`)
  console.log(`  GET  /api/models  - Get available models`)
  console.log(`  GET  /api/tools   - Get available tools`)
  console.log(`  WS   /ws          - WebSocket connection`)
}

process.on('SIGINT', async () => {
  console.log('Shutting down...')
  await sessionManager.saveAllDirtySessions()
  await closePool()
  process.exit(0)
})

startServer()
