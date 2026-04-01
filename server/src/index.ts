import Anthropic from '@anthropic-ai/sdk'
import { exec, execFile } from 'child_process'
import { readFile, writeFile } from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import { initDatabase, closePool } from './db/mysql'
import { SessionManager } from './services/sessionManager'
import type { ConversationMessage, ToolCall } from './models/types'

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

    console.log('Starting processMessage with model:', model)
    console.log('Total messages in history:', messages.length)

    try {
      let maxIterations = 10
      let iteration = 0

      while (iteration < maxIterations) {
        iteration++
        console.log(`API iteration ${iteration}, messages count:`, messages.length)

        sendEvent('message_start', {})

        const response = await client.messages.create({
          model,
          max_tokens: 4096,
          messages: messages,
          tools: this.toolExecutor.getAnthropicTools(),
        })

        console.log('Response stop_reason:', response.stop_reason)
        console.log('Response content blocks:', response.content?.length || 0)

        let assistantText = ''
        let toolUseId = ''
        let toolName = ''

        if (response.content) {
          for (const block of response.content) {
            if (block.type === 'text') {
              assistantText += block.text
              sendEvent('content_block_delta', { text: block.text })
            } else if (block.type === 'tool_use') {
              toolUseId = block.id || uuidv4()
              toolName = block.name || ''
              const toolInput = block.input || {}

              console.log('Tool use detected:', toolName, toolInput)

              const toolCall: ToolCall = {
                id: toolUseId,
                messageId: '',
                sessionId,
                toolName,
                toolInput,
                toolOutput: null,
                status: 'pending',
                createdAt: new Date(),
              }

              sendEvent('tool_use', { id: toolUseId, name: toolName, input: toolInput })
              sendEvent('tool_start', { name: toolName, input: JSON.stringify(toolInput) })

              try {
                const result = await this.toolExecutor.executeTool(
                  toolName,
                  toolInput as Record<string, unknown>,
                  sendEvent
                )

                toolCall.toolOutput = result as Record<string, unknown>
                toolCall.status = 'completed'

                sessionManager.addToolCall(sessionId, toolCall)
                sessionManager.addMessage(sessionId, 'user', JSON.stringify({ tool_use_id: toolUseId, name: toolName, result }))

                console.log('Tool result added to messages')
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error)
                console.error('Tool execution error:', errorMessage)

                toolCall.toolOutput = { error: errorMessage }
                toolCall.status = 'error'

                sessionManager.addToolCall(sessionId, toolCall)
                sessionManager.addMessage(sessionId, 'user', JSON.stringify({ tool_use_id: toolUseId, name: toolName, error: errorMessage }))
              }
            }
          }
        }

        if (assistantText) {
          sessionManager.addMessage(sessionId, 'assistant', assistantText)
        }

        sendEvent('message_stop', { stop_reason: response.stop_reason })

        if (response.stop_reason !== 'tool_use') {
          console.log('Conversation completed, total messages:', messages.length)
          break
        }

        console.log('Tool was used, continuing with', messages.length, 'messages...')
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

      if (path === '/ws') {
        const success = server.upgrade(req, {
          data: { sendEvent: null, sessionId: null, userId: null } as WebSocketData,
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
        ws.data = { sendEvent: null, sessionId: null, userId: null } as WebSocketData
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
  console.log(`Endpoints:`)
  console.log(`  GET  /api/health  - Health check`)
  console.log(`  GET  /api/models  - Get available models`)
  console.log(`  GET  /api/tools    - Get available tools`)
  console.log(`  WS   /ws          - WebSocket connection`)
}

process.on('SIGINT', async () => {
  console.log('Shutting down...')
  await sessionManager.saveAllDirtySessions()
  await closePool()
  process.exit(0)
})

startServer()
