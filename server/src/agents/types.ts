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
 * 基础 Agent 定义
 */
export interface BaseAgentDefinition {
  agentType: string
  whenToUse: string
  tools?: string[]
  disallowedTools?: string[]
  skills?: string[]
  mcpServers?: Array<string | Record<string, unknown>>
  hooks?: unknown
  color?: AgentColorName
  model?: string
  effort?: number | string
  permissionMode?: string
  maxTurns?: number
  filename?: string
  baseDir?: string
  criticalSystemReminder_EXPERIMENTAL?: string
  requiredMcpServers?: string[]
  background?: boolean
  initialPrompt?: string
  memory?: 'user' | 'project' | 'local'
  isolation?: 'worktree' | 'remote'
  omitClaudeMd?: boolean
  description?: string
  icon?: string
  isReadOnly?: boolean
}

/**
 * 内置 Agent 定义
 */
export interface BuiltInAgentDefinition extends BaseAgentDefinition {
  source: 'built-in'
  baseDir: 'built-in'
  callback?: () => void
  getSystemPrompt: (params?: { toolUseContext?: unknown }) => string
}

/**
 * 自定义 Agent 定义
 */
export interface CustomAgentDefinition extends BaseAgentDefinition {
  getSystemPrompt: () => string
  source: 'user' | 'plugin'
  filename?: string
  baseDir?: string
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
