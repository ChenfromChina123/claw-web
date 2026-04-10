/**
 * MCP 路由 - 处理 MCP 服务器相关 API
 */

import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { isFeatureEnabled } from '../utils/featureFlags'
import { getMcpGateway } from '../services/mcp/McpGateway'

// MCP Bridge 实例获取函数
function getMCPBridgeInstance(): any {
  // 延迟导入避免循环依赖
  const { getWebMCPBridgeInstance } = require('../integrations/mcpBridge')
  return getWebMCPBridgeInstance()
}

// MCP Gateway 实例
const mcpGateway = getMcpGateway()

/**
 * 处理 MCP 相关的 HTTP 请求
 */
export async function handleMCPRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  const mcpBridge = getMCPBridgeInstance()
  
  // 使用 Feature Flag 控制新旧代码切换
  const useNewGateway = isFeatureEnabled('mcp.new.gateway')

  // ==================== MCP 服务器管理 ====================

  // GET /api/mcp/servers - 获取 MCP 服务器列表
  if (path === '/api/mcp/servers' && method === 'GET') {
    if (useNewGateway) {
      // 新实现
      const servers = mcpGateway.getServerStatus()
      return createSuccessResponse({
        servers: servers.map(s => ({
          id: s.serverId,
          name: s.name,
          status: s.status,
          tools: s.toolCount || 0,
          error: s.error,
        })),
        count: servers.length,
      })
    } else {
      // 旧实现
      const servers = mcpBridge.getServers()
      const serverRuntimes = (mcpBridge as any).serverRuntimes

      return createSuccessResponse({
        servers: servers.map((s: any) => {
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
  }

  // POST /api/mcp/servers - 添加 MCP 服务器
  if (path === '/api/mcp/servers' && method === 'POST') {
    if (useNewGateway) {
      // 新实现
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

        const result = await mcpGateway.addServer({
          name,
          command,
          args: args || [],
          env: env || {},
          enabled: true,
          transport: transport || 'stdio',
          url,
        })

        return result.success
          ? createSuccessResponse({
              success: true,
              serverId: result.serverId,
              message: `MCP server '${name}' added successfully`,
            })
          : createErrorResponse('MCP_ADD_FAILED', result.error || 'Failed to add MCP server', 500)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to add MCP server'
        return createErrorResponse('MCP_ADD_FAILED', message, 500)
      }
    } else {
      // 旧实现
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

        const server = mcpBridge.addServer({
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
  }

  // DELETE /api/mcp/servers/:id - 移除 MCP 服务器
  if (path.startsWith('/api/mcp/servers/') && method === 'DELETE') {
    const serverId = path.replace('/api/mcp/servers/', '')
    const removed = mcpBridge.removeServer(serverId)

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

      const success = mcpBridge.toggleServer(serverId, body.enabled)

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

  // POST /api/mcp/servers/:id/test - 测试 MCP 服务器连接
  if (path.match(/^\/api\/mcp\/servers\/[^/]+\/test$/) && method === 'POST') {
    const serverId = path.split('/')[4]
    const result = await mcpBridge.testConnection(serverId)

    return createSuccessResponse(result)
  }

  // ==================== MCP 工具 ====================

  // GET /api/mcp/tools - 获取 MCP 工具列表
  if (path === '/api/mcp/tools' && method === 'GET') {
    const serverId = url.searchParams.get('serverId') || undefined
    const serverName = url.searchParams.get('serverName') || undefined

    let tools = mcpBridge.getAllTools()

    if (serverId) {
      tools = tools.filter((t: any) => t.serverId === serverId)
    }
    if (serverName) {
      tools = tools.filter((t: any) => t.serverName === serverName)
    }

    return createSuccessResponse({
      tools: tools.map((t: any) => ({
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

      const result = await mcpBridge.callTool(toolName, toolInput)

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
    return createSuccessResponse(mcpBridge.getStatus())
  }

  return null
}

export default handleMCPRoutes