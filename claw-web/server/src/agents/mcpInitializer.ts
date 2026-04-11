/**
 * MCP 服务器初始化模块
 * 
 * 为 Agent 执行初始化 MCP 服务器连接
 */

import { getMCPServers, type MCPServerInfo } from '../integrations/mcpBridge'

/**
 * MCP 客户端接口
 */
export interface MCPClient {
  serverId: string
  name: string
  tools: MCPClientTool[]
  cleanup: () => Promise<void>
}

/**
 * MCP 客户端工具
 */
export interface MCPClientTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * MCP 初始化结果
 */
export interface MCPInitializationResult {
  /** 合并后的 MCP 客户端 */
  clients: Map<string, MCPClient>
  /** Agent 可用的 MCP 工具 */
  tools: MCPClientTool[]
  /** 清理函数 */
  cleanup: () => Promise<void>
}

/**
 * 检查 MCP 服务器是否可用
 */
export function isMCPServerAvailable(serverId: string): boolean {
  try {
    const servers = getMCPServers()
    return servers.some(s => s.id === serverId && s.enabled)
  } catch {
    return false
  }
}

/**
 * 获取 MCP 服务器配置
 */
export function getMCPServerConfig(
  agentMcpServers?: Array<string | Record<string, unknown>>
): string[] {
  if (!agentMcpServers || agentMcpServers.length === 0) {
    return []
  }

  return agentMcpServers.map(server => {
    if (typeof server === 'string') {
      return server
    }
    return (server as { name: string }).name
  })
}

/**
 * 初始化 Agent 的 MCP 服务器
 * 
 * 根据 Agent 定义中的 mcpServers 配置初始化对应的 MCP 连接
 */
export async function initializeAgentMCPServers(
  agentMcpServers?: Array<string | Record<string, unknown>>,
  parentClients?: Map<string, MCPClient>
): Promise<MCPInitializationResult> {
  const clients = new Map<string, MCPClient>()
  const allTools: MCPClientTool[] = []

  // 获取 Agent 需要的 MCP 服务器列表
  const requiredServers = getMCPServerConfig(agentMcpServers)

  // 获取可用的 MCP 服务器
  let availableServers: MCPServerInfo[] = []
  try {
    availableServers = getMCPServers()
  } catch {
    // MCP 服务器未初始化，返回空结果
    return {
      clients: new Map(),
      tools: [],
      cleanup: async () => {},
    }
  }

  // 为每个需要的 MCP 服务器创建客户端
  for (const serverName of requiredServers) {
    const server = availableServers.find(s => s.name === serverName)

    if (!server) {
      console.warn(`[MCP Init] MCP 服务器 "${serverName}" 未找到`)
      continue
    }

    if (!server.enabled) {
      console.warn(`[MCP Init] MCP 服务器 "${serverName}" 未启用`)
      continue
    }

    // 如果有父客户端，尝试复用
    if (parentClients?.has(server.id)) {
      const parentClient = parentClients.get(server.id)!
      clients.set(server.id, parentClient)
      allTools.push(...parentClient.tools)
      continue
    }

    // 创建新的 MCP 客户端
    const client = await createMCPClient(server)
    if (client) {
      clients.set(server.id, client)
      allTools.push(...client.tools)
    }
  }

  // 创建清理函数
  const cleanup = async (): Promise<void> => {
    console.log(`[MCP Cleanup] 清理 ${clients.size} 个 MCP 客户端`)
    const cleanupPromises: Promise<void>[] = []

    for (const [serverId, client] of clients) {
      // 不清理父客户端
      if (parentClients?.has(serverId)) {
        continue
      }

      cleanupPromises.push(
        client.cleanup().catch(error => {
          console.error(`[MCP Cleanup] 清理 MCP 客户端 ${serverId} 失败:`, error)
        })
      )
    }

    await Promise.all(cleanupPromises)
  }

  return {
    clients,
    tools: allTools,
    cleanup,
  }
}

/**
 * 创建 MCP 客户端
 */
async function createMCPClient(server: MCPServerInfo): Promise<MCPClient | null> {
  try {
    // 获取 MCP 服务器的工具列表
    const tools = server.tools?.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || {},
    })) || []

    // 创建客户端接口
    const client: MCPClient = {
      serverId: server.id,
      name: server.name,
      tools,
      cleanup: async () => {
        console.log(`[MCP Client] 断开 MCP 服务器 ${server.name}`)
        // 实际的断开逻辑由 MCP Bridge 处理
      },
    }

    return client
  } catch (error) {
    console.error(`[MCP Client] 创建 MCP 客户端失败 ${server.name}:`, error)
    return null
  }
}

/**
 * 检查 Agent 必需的 MCP 服务器是否都可用
 */
export function checkRequiredMCPServers(
  requiredServers?: string[]
): { available: boolean; missing: string[] } {
  if (!requiredServers || requiredServers.length === 0) {
    return { available: true, missing: [] }
  }

  const missing: string[] = []

  try {
    const servers = getMCPServers()
    const enabledServerNames = servers
      .filter(s => s.enabled)
      .map(s => s.name)

    for (const required of requiredServers) {
      if (!enabledServerNames.includes(required)) {
        missing.push(required)
      }
    }
  } catch {
    return { available: false, missing: requiredServers }
  }

  return {
    available: missing.length === 0,
    missing,
  }
}

/**
 * 合并 MCP 工具列表
 */
export function mergeMCPTools(
  parentTools: MCPClientTool[],
  agentTools: MCPClientTool[]
): MCPClientTool[] {
  const toolMap = new Map<string, MCPClientTool>()

  // 添加父工具
  for (const tool of parentTools) {
    toolMap.set(tool.name, tool)
  }

  // 添加/覆盖 Agent 工具
  for (const tool of agentTools) {
    toolMap.set(tool.name, tool)
  }

  return Array.from(toolMap.values())
}
