/**
 * Agent 核心类型定义
 * 
 * 基于 Claude Code Agent 系统的完整类型定义
 */

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
 * Agent 来源类型
 */
export type AgentSource = 'built-in' | 'user' | 'plugin'

/**
 * Agent 颜色名称
 */
export type AgentColorName = 'blue' | 'green' | 'orange' | 'purple' | 'pink' | 'red' | 'cyan' | 'yellow'

/**
 * Agent 颜色映射
 */
export const AGENT_COLORS: Record<AgentColorName, string> = {
  blue: '#3b82f6',
  green: '#10b981',
  orange: '#f59e0b',
  purple: '#8b5cf6',
  pink: '#ec4899',
  red: '#ef4444',
  cyan: '#06b6d4',
  yellow: '#eab308'
}

/**
 * 权限模式枚举
 */
export enum PermissionMode {
  BYPASS = 'bypassPermissions',
  ACCEPT_EDITS = 'acceptEdits',
  AUTO = 'auto',
  PLAN = 'plan',
  BUBBLE = 'bubble'
}

/**
 * 隔离模式枚举
 */
export enum IsolationMode {
  WORKTREE = 'worktree',
  REMOTE = 'remote'
}

/**
 * 内存类型枚举
 */
export enum MemoryType {
  USER = 'user',
  PROJECT = 'project',
  LOCAL = 'local'
}

/**
 * 工具权限配置
 */
export interface ToolPermission {
  allowedTools?: string[]
  deniedTools?: string[]
}

/**
 * MCP 服务器配置
 */
export interface MCPServerConfig {
  name: string
  enabled?: boolean
}

/**
 * Hook 配置
 */
export interface HookConfig {
  name: string
  enabled?: boolean
  config?: Record<string, unknown>
}

/**
 * 基础 Agent 定义
 */
export interface BaseAgentDefinition {
  // 必需字段
  agentType: string
  whenToUse: string
  
  // 来源
  source: AgentSource
  filename?: string
  baseDir?: string
  
  // 工具配置
  tools?: string[]
  disallowedTools?: string[]
  
  // MCP 配置
  mcpServers?: Array<string | MCPServerConfig>
  requiredMcpServers?: string[]
  
  // Hook 配置
  hooks?: HookConfig | HookConfig[]
  
  // 技能配置
  skills?: string[]
  
  // 权限与执行
  permissionMode?: PermissionMode | string
  maxTurns?: number
  effort?: number | string
  
  // 隔离与内存
  isolation?: IsolationMode | string
  memory?: MemoryType | string
  
  // 上下文优化
  omitClaudeMd?: boolean
  criticalSystemReminder_EXPERIMENTAL?: string
  
  // 显示配置
  color?: AgentColorName
  description?: string
  icon?: string
  
  // 执行特性
  background?: boolean
  initialPrompt?: string
  isReadOnly?: boolean
  
  // 模型配置
  model?: string
  
  // 回调函数
  callback?: () => void
}

/**
 * 内置 Agent 定义
 */
export interface BuiltInAgentDefinition extends BaseAgentDefinition {
  source: 'built-in'
  baseDir: 'built-in'
  getSystemPrompt: (params?: { toolUseContext?: unknown }) => string
}

/**
 * 自定义 Agent 定义
 */
export interface CustomAgentDefinition extends BaseAgentDefinition {
  source: 'user' | 'plugin'
  getSystemPrompt: () => string
}

/**
 * 所有 Agent 定义类型的联合
 */
export type AgentDefinition = BuiltInAgentDefinition | CustomAgentDefinition

/**
 * Agent 状态枚举
 */
export enum AgentStatus {
  IDLE = 'idle',
  WORKING = 'working',
  COMPLETED = 'completed',
  ERROR = 'error',
  PAUSED = 'paused'
}

/**
 * Agent 实例接口
 */
export interface AgentInstance {
  agentId: string
  agentDefinition: AgentDefinition
  status: AgentStatus
  currentTask?: string
  completedTasks: number
  totalTasks: number
  startTime: Date
  lastActivityTime: Date
  progress: number
  error?: string
}

/**
 * 任务步骤状态
 */
export type TaskStepStatus = 'pending' | 'active' | 'completed' | 'error'

/**
 * 任务步骤接口
 */
export interface TaskStep {
  id: string
  agentType: string
  description: string
  status: TaskStepStatus
  startTime?: Date
  completedTime?: Date
  error?: string
}

/**
 * 多 Agent 协调状态
 */
export interface MultiAgentOrchestrationState {
  orchestrator?: AgentInstance
  subAgents: AgentInstance[]
  taskSteps: TaskStep[]
  overallStatus: 'idle' | 'executing' | 'completed' | 'error'
  startTime?: Date
  completionTime?: Date
  error?: string
}

/**
 * Agent 执行上下文
 */
export interface AgentExecutionContext {
  agentId: string
  sessionId: string
  task: string
  prompt: string
  tools: string[]
  maxTurns?: number
}

/**
 * Agent 执行结果
 */
export interface AgentExecutionResult {
  agentId: string
  status: 'completed' | 'error' | 'async_launched'
  content: string
  durationMs: number
  totalTokens?: number
  error?: string
}

/**
 * 类型守卫：检查是否是内置 Agent
 */
export function isBuiltInAgent(agent: AgentDefinition): agent is BuiltInAgentDefinition {
  return agent.source === 'built-in'
}

/**
 * 类型守卫：检查是否是自定义 Agent
 */
export function isCustomAgent(agent: AgentDefinition): agent is CustomAgentDefinition {
  return agent.source !== 'built-in'
}

/**
 * 获取有效的权限模式列表
 */
export function getValidPermissionModes(): PermissionMode[] {
  return Object.values(PermissionMode)
}

/**
 * 获取有效的隔离模式列表
 */
export function getValidIsolationModes(): IsolationMode[] {
  return Object.values(IsolationMode)
}
