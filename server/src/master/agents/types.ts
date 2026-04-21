/**
 * Agent 核心类型定义
 *
 * 对齐 claw-web/src/tools/AgentTool/loadAgentsDir.ts 的类型设计：
 * - BaseAgentDefinition 字段与前端统一
 * - 添加 PluginAgentDefinition 独立类型
 * - mcpServers/hooks/effort/memory 类型对齐前端
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
export type AgentSource = 'built-in' | 'user' | 'project' | 'policy' | 'plugin'

/**
 * 用户/项目/策略来源类型
 */
export type SettingSource = 'user' | 'project' | 'policy'

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
  BUBBLE = 'bubble',
  DONT_ASK = 'dontAsk'
}

/**
 * 隔离模式枚举
 */
export enum IsolationMode {
  WORKTREE = 'worktree',
  REMOTE = 'remote'
}

/**
 * 内存作用域类型
 * 对齐前端 AgentMemoryScope
 */
export type AgentMemoryScope = 'user' | 'project' | 'local'

/**
 * Effort 值类型
 * 对齐前端 EffortValue
 */
export type EffortValue = 'low' | 'medium' | 'high' | 'max' | number

/**
 * MCP 服务器规格
 * 对齐前端 AgentMcpServerSpec
 */
export interface AgentMcpServerSpec {
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  enabled?: boolean
}

/**
 * Hook 设置类型
 * 对齐前端 HooksSettings
 */
export type HooksSettings = Record<string, HookConfig[]>

/**
 * 工具权限配置
 */
export interface ToolPermission {
  allowedTools?: string[]
  deniedTools?: string[]
}

/**
 * MCP 服务器配置（向后兼容）
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
 * 对齐前端 loadAgentsDir.ts 的 BaseAgentDefinition
 */
export interface BaseAgentDefinition {
  agentType: string
  whenToUse: string

  tools?: string[]
  disallowedTools?: string[]
  skills?: string[]

  mcpServers?: AgentMcpServerSpec[]
  requiredMcpServers?: string[]

  hooks?: HooksSettings

  color?: AgentColorName
  model?: string
  effort?: EffortValue
  permissionMode?: PermissionMode | string
  maxTurns?: number

  filename?: string
  baseDir?: string

  criticalSystemReminder_EXPERIMENTAL?: string

  background?: boolean
  initialPrompt?: string
  memory?: AgentMemoryScope
  isolation?: IsolationMode | string

  omitClaudeMd?: boolean
  pendingSnapshotUpdate?: { snapshotTimestamp: string }

  source: AgentSource
}

/**
 * 内置 Agent 定义
 * getSystemPrompt 接收 toolUseContext 参数用于动态上下文注入
 */
export interface BuiltInAgentDefinition extends BaseAgentDefinition {
  source: 'built-in'
  baseDir: 'built-in'
  callback?: () => void
  getSystemPrompt: (params?: { toolUseContext?: unknown }) => string
}

/**
 * 自定义 Agent 定义（来自用户/项目/策略设置）
 */
export interface CustomAgentDefinition extends BaseAgentDefinition {
  source: SettingSource
  filename?: string
  baseDir?: string
  getSystemPrompt: () => string
}

/**
 * 插件 Agent 定义
 * 对齐前端 PluginAgentDefinition
 */
export interface PluginAgentDefinition extends BaseAgentDefinition {
  source: 'plugin'
  plugin: string
  filename?: string
  getSystemPrompt: () => string
}

/**
 * 所有 Agent 定义类型的联合
 */
export type AgentDefinition = BuiltInAgentDefinition | CustomAgentDefinition | PluginAgentDefinition

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
  abortSignal?: AbortSignal
}

/**
 * Agent 执行结果
 */
export interface AgentExecutionResult {
  agentId: string
  status: 'completed' | 'error' | 'async_launched' | 'teammate_spawned'
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
  return agent.source === 'user' || agent.source === 'project' || agent.source === 'policy'
}

/**
 * 类型守卫：检查是否是插件 Agent
 */
export function isPluginAgent(agent: AgentDefinition): agent is PluginAgentDefinition {
  return agent.source === 'plugin'
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
