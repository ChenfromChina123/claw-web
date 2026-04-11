/**
 * MCP 服务器配置接口
 */
export interface MCPServerConfig {
  id: string
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  enabled: boolean
  transport?: 'stdio' | 'websocket' | 'sse' | 'streamable-http'
  url?: string
  type?: 'stdio' | 'sse' | 'ws' | 'http' | 'sdk' | 'claudeai-proxy'
  headers?: Record<string, string>
  autoReconnect?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverId: string
  serverName: string
  annotations?: {
    title?: string
    readOnlyHint?: boolean
    destructiveHint?: boolean
    openWorldHint?: boolean
  }
}

/**
 * MCP 工具调用结果
 */
export interface MCPToolResult {
  success: boolean
  result?: unknown
  error?: string
  duration?: number
}

/**
 * MCP 服务器状态
 */
export type MCPServerStatus = 
  | 'disconnected' 
  | 'connecting' 
  | 'connected' 
  | 'error'
  | 'needs-auth'
  | 'reconnecting'

/**
 * MCP 服务器运行时信息
 */
export interface MCPServerRuntime {
  config: MCPServerConfig
  status: MCPServerStatus
  tools: MCPTool[]
  error?: string
  connectedAt?: number
  lastErrorAt?: number
  reconnectCount?: number
}
