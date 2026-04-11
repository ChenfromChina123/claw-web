/**
 * 工具路由 - 处理工具管理相关 API
 */

import { toolExecutor } from '../integration/enhancedToolExecutor'
import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'

/**
 * 处理工具相关的 HTTP 请求
 */
export async function handleToolsRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

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

  return null
}

export default handleToolsRoutes