/**
 * Agent 系统核心类型定义
 * 
 * 定义 Agent 系统的基础类型、接口和常量
 */

import type { ToolDefinition } from '../integration/enhancedToolExecutor'

// ==================== 基础类型 ====================

/**
 * Agent 唯一标识符
 */
export type AgentId = string & { __brand: 'AgentId' }

/**
 * Agent 类型枚举
 */
export enum AgentType {
  GENERAL_PURPOSE = 'general-purpose',
  EXPLORE = 'Explore',
  PLAN = 'Plan',
  VERIFICATION = 'verification',
  CLAUDE_CODE_GUIDE = 'claude-code-guide',
  STATUSLINE_SETUP = 'statusline-setup'
}

/**
 * 权限模式
 */
export enum PermissionMode {
  BYPASS_PERMISSIONS = 'bypassPermissions',
  ACCEPT_EDITS = 'acceptEdits',
  AUTO = 'auto',
  PLAN = 'plan',
  BUBBLE = 'bubble'
}

/**
 * Agent 执行状态
 */
export enum AgentStatus {
  CREATED = 'created',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BACKGROUND = 'backgrounded',
  KILLED = 'killed'
}

// ==================== Agent 定义 ====================

/**
 * Agent 定义接口
 */
export interface AgentDefinition {
  /** Agent 类型 */
  agentType: AgentType
  
  /** Agent 名称 */
  name: string
  
  /** Agent 描述 */
  description: string
  
  /** 系统提示词 */
  systemPrompt: string
  
  /** 模型配置 */
  model?: string
  
  /** 工具白名单（'*' 表示所有工具） */
  tools?: string[] | '*'
  
  /** 工具黑名单 */
  disallowedTools?: string[]
  
  /** 最大轮次 */
  maxTurns?: number
  
  /** 是否后台运行 */
  background?: boolean
  
  /** 权限模式 */
  permissionMode?: PermissionMode
  
  /** MCP 服务器列表 */
  mcpServers?: string[]
  
  /** Skills 列表 */
  skills?: string[]
  
  /** 内存配置 */
  memory?: 'user' | 'project' | 'none'
  
  /** 隔离模式 */
  isolation?: 'worktree' | 'remote'
  
  /** 颜色标识 */
  color?: string
  
  /** 努力程度 */
  effort?: 'low' | 'medium' | 'high'
  
  /** 是否省略 CLAUDE.md（节省 Token） */
  omitClaudeMd?: boolean
  
  /** Hooks 配置 */
  hooks?: Record<string, unknown>
  
  /** 来源 */
  source: 'built-in' | 'user' | 'plugin'
}

/**
 * 内置 Agent 定义
 */
export interface BuiltInAgentDefinition extends AgentDefinition {
  source: 'built-in'
}

/**
 * 自定义 Agent 定义
 */
export interface CustomAgentDefinition extends AgentDefinition {
  source: 'user' | 'plugin'
  filePath?: string
}

// ==================== Agent 配置 ====================

/**
 * Agent 运行时配置
 */
export interface AgentConfig {
  /** 模型 */
  model: string
  
  /** 最大 Token 数 */
  maxTokens: number
  
  /** 温度参数 */
  temperature: number
  
  /** 系统提示词覆盖 */
  systemPrompt?: string
  
  /** 工具覆盖 */
  tools?: string[]
  
  /** 最大轮次覆盖 */
  maxTurns?: number
}

// ==================== Agent 执行上下文 ====================

/**
 * Agent 执行上下文
 */
export interface AgentExecutionContext {
  /** Agent ID */
  agentId: AgentId
  
  /** Agent 定义 */
  agentDefinition: AgentDefinition
  
  /** 用户 ID */
  userId: string
  
  /** 会话 ID */
  sessionId: string
  
  /** 工具执行器 */
  toolExecutor: unknown
  
  /** 事件发送器 */
  sendEvent: (event: string, data: unknown) => void
  
  /** 父 Agent ID（如果有） */
  parentAgentId?: AgentId
  
  /** 是否为 Fork 模式 */
  isFork?: boolean
  
  /** 权限模式 */
  permissionMode: PermissionMode
}

// ==================== Agent 消息类型 ====================

/**
 * Agent 消息类型
 */
export interface AgentMessage {
  /** 角色 */
  role: 'user' | 'assistant' | 'system'
  
  /** 内容 */
  content: string | Array<{
    type: 'text' | 'tool_use' | 'tool_result'
    text?: string
    id?: string
    name?: string
    input?: Record<string, unknown>
    output?: unknown
  }>
  
  /** 工具调用（可选） */
  toolCalls?: AgentToolCall[]
  
  /** 时间戳 */
  timestamp?: Date
}

/**
 * Agent 工具调用
 */
export interface AgentToolCall {
  /** 工具调用 ID */
  id: string
  
  /** 工具名称 */
  name: string
  
  /** 工具输入 */
  input: Record<string, unknown>
  
  /** 工具输出（执行后） */
  output?: unknown
  
  /** 状态 */
  status: 'pending' | 'executing' | 'completed' | 'error'
  
  /** 错误信息（如果有） */
  error?: string
  
  /** 开始时间 */
  startedAt?: Date
  
  /** 完成时间 */
  completedAt?: Date
}

// ==================== Agent 执行结果 ====================

/**
 * Agent 执行结果
 */
export interface AgentResult {
  /** Agent ID */
  agentId: AgentId
  
  /** 状态 */
  status: AgentStatus
  
  /** 消息 */
  messages: AgentMessage[]
  
  /** 工具调用 */
  toolCalls: AgentToolCall[]
  
  /** 结束原因 */
  finishReason: 'stop' | 'tool_use' | 'max_tokens' | 'error' | 'max_turns'
  
  /** 总 Token 数 */
  totalTokens?: number
  
  /** 总工具调用次数 */
  totalToolUseCount?: number
  
  /** 总持续时间（毫秒） */
  totalDurationMs?: number
  
  /** 错误信息（如果有） */
  error?: string
}

// ==================== 常量 ====================

/**
 * Agent 工具名称
 */
export const AGENT_TOOL_NAME = 'Agent'

/**
 * 兼容旧名
 */
export const LEGACY_AGENT_TOOL_NAME = 'Task'

/**
 * 进度更新阈值（毫秒）
 */
export const PROGRESS_THRESHOLD_MS = 2000

/**
 * 默认最大轮次
 */
export const DEFAULT_MAX_TURNS = 20

/**
 * 只读 Agent 禁用的工具
 */
export const READ_ONLY_DISALLOWED_TOOLS = [
  'FileWrite',
  'FileEdit',
  'FileDelete',
  'FileRename',
  AGENT_TOOL_NAME,
  'ExitPlanMode'
]

/**
 * 创建 Agent ID
 */
export function createAgentId(): AgentId {
  return `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as AgentId
}

/**
 * 检查是否为有效的 Agent ID
 */
export function isAgentId(id: string): id is AgentId {
  return id.startsWith('agent_')
}
