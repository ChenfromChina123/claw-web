/**
 * Claude Code HAHA - Integration Module Index
 * 
 * This module exports all integration components:
 * - WebStore: React-compatible state management
 * - WebSocketManager: Real-time RPC bridge
 * - EnhancedToolExecutor: Full-featured tool system
 */

export * from './webStore'
export * from './wsBridge'
export * from './enhancedToolExecutor'

import { WebSocketManager } from './wsBridge'
import { EnhancedToolExecutor } from './enhancedToolExecutor'
import { WebCommandBridge, parseUserInput } from '../integrations/commandBridge'
import { WebMCPBridge } from '../integrations/mcpBridge'
import { WebAgentRunner } from '../integrations/agentRunner'
import { WebSessionBridge } from '../integrations/sessionBridge'
import { appStateManager } from './webStore'

// Re-export bridge modules
export { WebCommandBridge, parseUserInput }
export { WebMCPBridge }
export { WebAgentRunner }
export { WebSessionBridge }
export { appStateManager }

// ==================== Integration Summary ====================
/**
 * The integration system provides:
 * 
 * 1. **WebStore** - React-compatible state management
 *    - AppState with user, session, messages, tools, MCP, agents, tasks, skills
 *    - Store pattern with subscriptions
 *    - High-level state mutations
 * 
 * 2. **WebSocketManager** - Real-time RPC bridge
 *    - Full-duplex WebSocket communication
 *    - RPC method calling with responses
 *    - Broadcast channels for pub/sub
 *    - Connection management
 *    - Heartbeat and cleanup
 * 
 * 3. **EnhancedToolExecutor** - Full-featured tool system
 *    - 15+ built-in tools (Bash, FileRead, FileWrite, FileEdit, Glob, Grep, etc.)
 *    - Real-time streaming output
 *    - Execution history
 *    - Web search (DuckDuckGo, Wikipedia, ArXiv)
 *    - Anthropic SDK format compatibility
 * 
 * 4. **Bridge Modules**
 *    - WebCommandBridge: Command system (/help, /clear, /config, etc.)
 *    - WebMCPBridge: MCP server management
 *    - WebAgentRunner: Agent execution
 *    - WebSessionBridge: Enhanced session management
 */

// ==================== Server Capabilities ====================
export interface ServerCapabilities {
  version: string
  name: string
  features: {
    tools: number
    models: number
    websocket: boolean
    mcp: boolean
    auth: boolean
    commands: boolean
    agents: boolean
    skills: boolean
    fileWatching: boolean
    sandbox: boolean
  }
  endpoints: {
    api: string
    websocket: string
  }
}

export const SERVER_CAPABILITIES: ServerCapabilities = {
  version: '1.0.0',
  name: 'Claude Code HAHA - Deep React Integration Server',
  features: {
    tools: 18, // Bash, FileRead, FileWrite, FileEdit, FileDelete, FileRename, FileList, Glob, Grep, WebSearch, WebFetch, TodoWrite, TodoList, TodoClear, TaskCreate, TaskList, TaskUpdate, Config, AskUserQuestion
    models: 5,  // qwen-plus, qwen-turbo, qwen-max, claude-3-5-sonnet, claude-3-opus
    websocket: true,
    mcp: true,
    auth: true,
    commands: true,
    agents: true,
    skills: true,
    fileWatching: false, // Can be enabled with chokidar
    sandbox: false,      // Can be enabled with isolated-vm
  },
  endpoints: {
    api: '/api',
    websocket: '/ws',
  },
}
