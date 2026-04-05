/**
 * WebSocket 消息协议类型定义
 * 从 server/src/integration/wsBridge.ts 迁移并扩展
 */

// 使用 message.ts 中的 MessageType，避免重复定义
import type { MessageType as MessageMessageType } from './message'

export type WebSocketMessageType =
  | MessageMessageType
  | 'rpc_call'
  | 'rpc_response'
  | 'user_message'
  | 'create_session'
  | 'load_session'
  | 'list_sessions'
  | 'delete_session'
  | 'rename_session'
  | 'clear_session'
  | 'message_start'
  | 'content_block_delta'
  | 'message_stop'
  | 'message_delta'
  | 'tool_use'
  | 'tool_use_end'
  | 'tool_start'
  | 'tool_input_delta'
  | 'tool_end'
  | 'tool_error'
  | 'tool_progress'
  | 'tool_execute'
  | 'tool_result'
  | 'tool_executed'
  | 'session_created'
  | 'session_loaded'
  | 'session_list'
  | 'session_deleted'
  | 'session_renamed'
  | 'session_cleared'
  | 'streaming_chunk'
  | 'streaming_end'
  | 'error'
  | 'registered'
  | 'logged_in'
  | 'user_validated'
  | 'user_invalid'
  | 'authenticated'
  | 'auth_error'
  | 'ping'
  | 'pong'
  | 'subscribe'
  | 'unsubscribe'
  | 'broadcast'
  | 'command_result'
  | 'connected'
  // MCP types
  | 'mcp_server_added'
  | 'mcp_server_removed'
  | 'mcp_server_error'
  | 'mcp_tool_list'
  | 'mcp_tool_result'
  // Session types
  | 'session_export'
  | 'user_question'
  // Message sync types
  | 'message_saved'
  | 'session_saved'
  // Agent types
  | 'agent_event'
  | 'permission_response'

export interface RPCRequest {
  id: string
  method: string
  params?: Record<string, unknown>
  timeout?: number
}

export interface RPCResponse {
  id: string
  success: boolean
  result?: unknown
  error?: {
    code: string
    message: string
    details?: unknown
  }
}

export interface WebSocketMessage {
  type: WebSocketMessageType
  id?: string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: unknown
  sessionId?: string
  title?: string
  model?: string
  content?: string
  text?: string
  role?: string
  messages?: unknown[]
  name?: string
  input?: unknown
  output?: unknown
  partial_json?: string
  userId?: string
  username?: string
  token?: string
  event?: string
  data?: unknown
  status?: string
  stop_reason?: string
  offset?: number
  limit?: number
  serverId?: string
  serverName?: string
  command?: string
  args?: string[]
  enabled?: boolean
  agentId?: string
  agentName?: string
  color?: string
  systemPrompt?: string
  taskId?: string
  taskTitle?: string
  taskStatus?: string
  skillId?: string
  skillName?: string
  skillConfig?: Record<string, unknown>
  key?: string
  value?: string
  view?: string
  theme?: string
  expanded?: boolean
  iteration?: number
  success?: boolean
  duration?: number
  streaming?: boolean
  category?: string
  tools?: unknown[]
  history?: unknown[]
  // Tool execution
  toolName?: string
  toolId?: string
  toolInput?: Record<string, unknown>
  toolResult?: unknown
  executionId?: string
  // MCP
  mcpServers?: unknown[]
  mcpTools?: unknown[]
  // Extra
  [key: string]: unknown
}

export interface RPCContext {
  userId: string | null
  sessionId: string | null
  sendEvent: () => void
  getConnectionId: () => string
  getRemoteAddress: () => string | undefined
}

export interface ConnectionInfo {
  id: string
  userId: string | null
  sessionId: string | null
  connected: boolean
  createdAt: number
  uptime: number
  queuedMessages: number
  remoteAddress?: string
}

export interface MessageSavedEvent {
  type: 'message_saved'
  sessionId: string
  tempId?: string
  messageId: string
  role: string
}

export interface SessionSavedEvent {
  type: 'session_saved'
  sessionId: string
  messageCount: number
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnecting' | 'disconnected' | 'reconnecting'

export interface WebSocketState {
  status: ConnectionStatus
  connectionId: string | null
  reconnectAttempts: number
  lastError: string | null
  latency: number
}
