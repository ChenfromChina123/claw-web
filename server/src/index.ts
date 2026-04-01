import Anthropic from '@anthropic-ai/sdk'

const PORT = 3000
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function createErrorResponse(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function createSSEEvent(eventType: string, data: unknown): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
}

async function handleChat(request: Request): Promise<Response> {
  try {
    const body = await request.json()
    const {
      model = process.env.ANTHROPIC_MODEL || 'qwen-plus',
      messages,
      stream = false,
      max_tokens = 4096,
      system_prompt,
    } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return createErrorResponse('INVALID_REQUEST', 'messages is required and must be a non-empty array', 400)
    }

    const client = getAnthropicClient()

    if (stream) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const stream = await client.messages.stream({
              model,
              max_tokens,
              system: system_prompt,
              messages,
            })

            for await (const event of stream) {
              const sseData = {
                type: event.type,
                ...event,
              }
              controller.enqueue(encoder.encode(createSSEEvent('message', sseData)))
            }

            controller.enqueue(encoder.encode(createSSEEvent('message', { type: 'message_stop' })))
            controller.close()
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            controller.enqueue(encoder.encode(createSSEEvent('error', { message: errorMessage })))
            controller.close()
          }
        },
      })

      return new Response(stream, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    } else {
      const response = await client.messages.create({
        model,
        max_tokens,
        system: system_prompt,
        messages,
      })

      const text = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n')

      return createSuccessResponse({
        content: text,
        model,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Chat error:', errorMessage)
    return createErrorResponse('API_ERROR', errorMessage, 500)
  }
}

async function handleModels(): Promise<Response> {
  return createSuccessResponse({ models: AVAILABLE_MODELS })
}

async function handleHealth(): Promise<Response> {
  return createSuccessResponse({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  })
}

async function handleClear(): Promise<Response> {
  return new Response(JSON.stringify({ success: true, message: '会话已清除' }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    if (path === '/api/chat' && method === 'POST') {
      return await handleChat(request)
    }

    if (path === '/api/models' && method === 'GET') {
      return await handleModels()
    }

    if (path === '/api/health' && method === 'GET') {
      return await handleHealth()
    }

    if (path === '/api/clear' && method === 'POST') {
      return await handleClear()
    }

    if (path === '/' && method === 'GET') {
      return new Response(JSON.stringify({
        success: true,
        data: {
          name: 'Claude Code Haha API',
          version: '1.0.0',
          endpoints: ['/api/chat', '/api/models', '/api/health', '/api/clear'],
        },
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    return createErrorResponse('NOT_FOUND', `Route ${path} not found`, 404)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Request error:', errorMessage)
    return createErrorResponse('INTERNAL_ERROR', errorMessage, 500)
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    return handleRequest(request)
  },
})

console.log(`Claude Code Haha API Server running at http://localhost:${PORT}`)
console.log(`Endpoints:`)
console.log(`  POST /api/chat    - Send chat message`)
console.log(`  GET  /api/models  - Get available models`)
console.log(`  GET  /api/health  - Health check`)
console.log(`  POST /api/clear   - Clear session`)
console.log(`\nCORS enabled for all origins`)