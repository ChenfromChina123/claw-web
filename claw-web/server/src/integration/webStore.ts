/**
 * Claude Code HAHA - Deep React Integration
 * 
 * This module provides a comprehensive web-compatible state management
 * system that bridges the gap between the Ink-based terminal UI and
 * a modern React DOM-based web interface.
 */

import { v4 as uuidv4 } from 'uuid'
import type { EventEmitter } from 'events'

// ==================== Type Definitions ====================

export type DeepImmutable<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepImmutable<T[P]> : T[P]
}

export interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  category?: string
  tags?: string[]
}

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output?: unknown
  status: 'pending' | 'executing' | 'completed' | 'error'
  startedAt?: number
  completedAt?: number
  error?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  model?: string
  timestamp: number
  metadata?: {
    tokens?: number
    cost?: number
    duration?: number
  }
}

export interface Session {
  id: string
  userId: string
  title: string
  model: string
  createdAt: number
  updatedAt: number
  messageCount: number
  tokenUsage: {
    input: number
    output: number
  }
  config: SessionConfig
}

export interface SessionConfig {
  temperature: number
  maxTokens: number
  systemPrompt?: string
  thinkingEnabled?: boolean
  fastMode?: boolean
}

export interface User {
  id: string
  username: string
  email: string
  avatar?: string
  isAdmin: boolean
  preferences: UserPreferences
  createdAt: number
  lastLogin?: number
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  fontSize: number
  model: string
  temperature: number
  maxTokens: number
  thinkingEnabled: boolean
}

export interface MCPServer {
  id: string
  name: string
  description?: string
  command: string
  args: string[]
  env?: Record<string, string>
  enabled: boolean
  status: 'connected' | 'disconnected' | 'error'
  tools: Tool[]
  resources: MCPResource[]
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

export interface Agent {
  id: string
  name: string
  description: string
  color: string
  systemPrompt: string
  model: string
  enabled: boolean
}

export interface Task {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface Skill {
  id: string
  name: string
  description: string
  category: string
  enabled: boolean
  config?: Record<string, unknown>
}

export interface Command {
  name: string
  description: string
  usage: string
  aliases?: string[]
  category: 'general' | 'session' | 'config' | 'tools' | 'advanced' | 'mcp'
  execute: (args: string[], context: CommandContext) => Promise<CommandResult>
}

export interface CommandContext {
  userId: string
  sessionId?: string
  sendEvent: EventSender
  getState: () => AppState
}

export interface CommandResult {
  success: boolean
  output?: string
  data?: unknown
  error?: string
}

export type EventSender = (event: string, data: unknown) => void

// ==================== App State ====================

export interface AppState {
  // User
  user: User | null
  isAuthenticated: boolean
  
  // Session
  activeSession: Session | null
  sessions: Session[]
  
  // Messages
  messages: Message[]
  
  // Tools
  availableTools: Tool[]
  activeToolCalls: Map<string, ToolCall>
  
  // MCP
  mcpServers: MCPServer[]
  mcpTools: Tool[]
  
  // Agents
  agents: Agent[]
  activeAgent?: Agent
  
  // Tasks
  tasks: Task[]
  
  // Skills
  skills: Skill[]
  
  // UI State
  ui: {
    sidebarOpen: boolean
    theme: 'light' | 'dark'
    fontSize: number
    expandedView: 'none' | 'tasks' | 'agents' | 'mcp' | 'skills'
    loading: boolean
    streaming: boolean
    showSettings: boolean
    showShortcuts: boolean
  }
  
  // System
  connected: boolean
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  error?: string
}

export const DEFAULT_APP_STATE: AppState = {
  user: null,
  isAuthenticated: false,
  activeSession: null,
  sessions: [],
  messages: [],
  availableTools: [],
  activeToolCalls: new Map(),
  mcpServers: [],
  mcpTools: [],
  agents: [],
  tasks: [],
  skills: [],
  ui: {
    sidebarOpen: true,
    theme: 'dark',
    fontSize: 14,
    expandedView: 'none',
    loading: false,
    streaming: false,
    showSettings: false,
    showShortcuts: false,
  },
  connected: false,
  connectionStatus: 'disconnected',
}

// ==================== Store Implementation ====================

type Listener = () => void
type OnChange<T> = (args: { newState: T; oldState: T }) => void

export interface Store<T> {
  getState: () => T
  setState: (updater: (prev: T) => T) => void
  subscribe: (listener: Listener) => () => void
  getInitialState: () => T
}

export function createWebStore<T extends object>(
  initialState: T,
  onChange?: OnChange<T>
): Store<T> {
  let state = initialState
  const listeners = new Set<Listener>()

  return {
    getState: () => state,
    getInitialState: () => initialState,

    setState: (updater: (prev: T) => T) => {
      const prev = state
      const next = updater(prev)
      if (Object.is(next, prev)) return
      state = next
      onChange?.({ newState: next, oldState: prev })
      for (const listener of listeners) listener()
    },

    subscribe: (listener: Listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

// ==================== State Manager ====================

class AppStateManager {
  private stores: Map<string, Store<unknown>> = new Map()
  private globalStore: Store<AppState>
  private eventEmitter: EventEmitter

  constructor() {
    this.globalStore = createWebStore(DEFAULT_APP_STATE, (change) => {
      this.eventEmitter.emit('stateChange', change)
    })
    
    // Create EventEmitter without strict typing
    this.eventEmitter = {
      listeners: new Map<string, Set<Function>>(),
      on(event: string, listener: Function) {
        if (!this.listeners.has(event)) {
          this.listeners.set(event, new Set())
        }
        this.listeners.get(event)!.add(listener)
      },
      off(event: string, listener: Function) {
        this.listeners.get(event)?.delete(listener)
      },
      emit(event: string, ...args: unknown[]) {
        this.listeners.get(event)?.forEach(fn => fn(...args))
      },
      removeAllListeners() {
        this.listeners.clear()
      },
    } as EventEmitter
  }

  getStore(): Store<AppState> {
    return this.globalStore
  }

  getState(): AppState {
    return this.globalStore.getState()
  }

  setState(updater: (prev: AppState) => AppState): void {
    this.globalStore.setState(updater)
  }

  subscribe(listener: () => void): () => void {
    return this.globalStore.subscribe(listener)
  }

  onStateChange(listener: (change: { newState: AppState; oldState: AppState }) => void): () => void {
    this.eventEmitter.on('stateChange', listener as Function)
    return () => this.eventEmitter.off('stateChange', listener as Function)
  }

  // High-level state mutations
  setUser(user: User | null): void {
    this.setState(prev => ({
      ...prev,
      user,
      isAuthenticated: !!user,
    }))
  }

  setActiveSession(session: Session | null): void {
    this.setState(prev => ({
      ...prev,
      activeSession: session,
      messages: session ? prev.messages.filter(m => m.id.startsWith(session.id)) : prev.messages,
    }))
  }

  addMessage(message: Message): void {
    this.setState(prev => ({
      ...prev,
      messages: [...prev.messages, message],
      activeSession: prev.activeSession ? {
        ...prev.activeSession,
        updatedAt: Date.now(),
        messageCount: prev.activeSession.messageCount + 1,
      } : null,
    }))
  }

  addToolCall(toolCall: ToolCall): void {
    this.setState(prev => {
      const newMap = new Map(prev.activeToolCalls)
      newMap.set(toolCall.id, toolCall)
      return {
        ...prev,
        activeToolCalls: newMap,
      }
    })
  }

  updateToolCall(id: string, update: Partial<ToolCall>): void {
    this.setState(prev => {
      const newMap = new Map(prev.activeToolCalls)
      const existing = newMap.get(id)
      if (existing) {
        newMap.set(id, { ...existing, ...update })
      }
      return { ...prev, activeToolCalls: newMap }
    })
  }

  setStreaming(streaming: boolean): void {
    this.setState(prev => ({
      ...prev,
      ui: { ...prev.ui, streaming },
    }))
  }

  setConnectionStatus(status: AppState['connectionStatus']): void {
    this.setState(prev => ({
      ...prev,
      connectionStatus: status,
      connected: status === 'connected',
    }))
  }

  setError(error?: string): void {
    this.setState(prev => ({ ...prev, error }))
  }

  reset(): void {
    this.globalStore.setState(() => ({ ...DEFAULT_APP_STATE }))
  }
}

// Singleton instance
export const appStateManager = new AppStateManager()
export { AppStateManager }
