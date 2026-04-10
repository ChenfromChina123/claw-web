import type { MCPServerConfig } from './mcp'

/**
 * 客户端 → 服务端 WebSocket 消息
 */
export type ClientMessage =
  | { type: 'user_message'; content: string; sessionId: string }
  | { type: 'create_session'; title?: string; model?: string }
  | { type: 'load_session'; sessionId: string }
  | { type: 'delete_session'; sessionId: string }
  | { type: 'tool_execute'; toolName: string; input: Record<string, unknown> }
  | { type: 'mcp_add_server'; config: MCPServerConfig }
  | { type: 'mcp_remove_server'; serverId: string }

/**
 * 服务端 → 客户端 WebSocket 消息
 */
export type ServerMessage =
  | { type: 'message_start'; messageId: string }
  | { type: 'message_delta'; text: string }
  | { type: 'message_stop'; stopReason: string }
  | { type: 'tool_start'; toolName: string; input: Record<string, unknown> }
  | { type: 'tool_end'; toolName: string; result: unknown }
  | { type: 'tool_error'; toolName: string; error: string }
  | { type: 'session_created'; sessionId: string }
  | { type: 'session_loaded'; session: unknown }
  | { type: 'session_deleted'; sessionId: string }
  | { type: 'error'; error: string; code?: string }
