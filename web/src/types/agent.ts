/**
 * Agent 相关类型定义
 * 用于多 Agent 协作系统的状态管理
 *
 * 对齐 server/src/master/agents/types.ts 的类型定义：
 * - AgentType 枚举与后端一致
 * - AgentDefinition 接口与后端 BaseAgentDefinition 对齐
 * - BUILT_IN_AGENTS 与后端 builtInAgents.ts 对齐
 */

/**
 * Agent 状态枚举
 */
export type AgentStatus = 'IDLE' | 'THINKING' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'BLOCKED'

/**
 * Agent 动作类型
 */
export type AgentActionType = 'THINKING' | 'TOOL_CALL' | 'SPAWN_TEAMMATE' | 'MESSAGE' | 'WAITING_PERMISSION'

/**
 * Agent 工作流步骤
 */
export interface AgentWorkflowStep {
  id: string
  traceId: string
  agentId: string
  status: AgentStatus
  actionType: AgentActionType
  message: string
  details?: Record<string, unknown>
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  toolName?: string
  childTraceId?: string
  createdAt: number
  completedAt?: number
  duration?: number
}

/**
 * Agent 实例状态
 */
export interface AgentState {
  agentId: string
  traceId: string
  parentAgentId?: string
  name: string
  description?: string
  icon?: string
  color?: string
  status: AgentStatus
  currentAction?: AgentActionType
  workflowSteps: AgentWorkflowStep[]
  createdAt: number
  updatedAt: number
  metadata?: Record<string, unknown>
}

/**
 * 主任务（Trace）状态
 */
export interface TraceState {
  traceId: string
  title: string
  status: AgentStatus
  rootAgentId: string
  agentIds: string[]
  createdAt: number
  updatedAt: number
  metadata?: Record<string, unknown>
}

/**
 * Agent 事件类型
 */
export type AgentEventType =
  | 'WORKFLOW_UPDATE'
  | 'AGENT_STATUS_CHANGED'
  | 'TOOL_CALL_START'
  | 'TOOL_CALL_COMPLETE'
  | 'TOOL_CALL_ERROR'
  | 'PERMISSION_REQUIRED'
  | 'TEAMMATE_SPAWNED'
  | 'AGENT_TOKEN_STREAM'
  | 'TASK_STATUS_CHANGED'

/**
 * Agent 事件载荷
 */
export interface AgentEvent {
  traceId: string
  agentId: string
  type: AgentEventType
  timestamp: number
  data: {
    status?: AgentStatus
    actionType?: AgentActionType
    message?: string
    details?: string | Record<string, unknown>
    input?: Record<string, unknown>
    output?: Record<string, unknown>
    toolName?: string
    childTraceId?: string
    childAgentId?: string
    success?: boolean
    error?: string
    errorType?: string
    duration?: number
    token?: string
    taskStatus?: string
  }
}

/**
 * 权限模式
 * 对齐后端 PermissionMode 枚举
 */
export type PermissionMode = 'bypassPermissions' | 'acceptEdits' | 'auto' | 'plan' | 'bubble' | 'dontAsk'

/**
 * Agent 颜色名称
 * 对齐后端 AgentColorName
 */
export type AgentColorName = 'blue' | 'green' | 'orange' | 'purple' | 'pink' | 'red' | 'cyan' | 'yellow'

/**
 * Agent 颜色映射
 * 对齐后端 AGENT_COLORS
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
 * Agent 配置
 */
export interface AgentConfig {
  permissionMode: PermissionMode
  allowedTools?: string[]
  deniedTools?: string[]
  maxIterations?: number
  model?: string
}

/**
 * Agent 类型枚举
 * 对齐后端 AgentType 枚举，包含全部 6 个内置类型
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
 * 对齐后端 AgentSource
 */
export type AgentSource = 'built-in' | 'user' | 'project' | 'policy' | 'plugin'

/**
 * Agent 定义接口
 * 对齐后端 BaseAgentDefinition
 */
export interface AgentDefinition {
  agentType: string
  name: string
  description: string
  whenToUse: string
  systemPrompt?: string
  color: string
  icon: string
  source: AgentSource
  tools?: string[]
  disallowedTools?: string[]
  model?: string
  permissionMode?: PermissionMode
  maxTurns?: number
  background?: boolean
  memory?: 'user' | 'project' | 'local'
  isolation?: 'worktree' | 'remote'
  omitClaudeMd?: boolean
}

/**
 * Agent 运行时状态
 */
export interface AgentRuntimeState {
  agentId: string
  agentDefinition: AgentDefinition
  status: 'idle' | 'thinking' | 'working' | 'completed' | 'failed'
  currentTask?: string
  progress?: number
  completedTasks?: number
  totalTasks?: number
  startTime?: Date
  lastActivityTime?: Date
}

/**
 * 任务步骤
 */
export interface AgentTaskStep {
  id: string
  agentType: AgentType
  description: string
  status: 'pending' | 'active' | 'completed' | 'failed'
  startTime?: Date
  completedTime?: Date
}

/**
 * 多 Agent 协调状态
 */
export interface MultiAgentOrchestrationState {
  orchestrator?: AgentRuntimeState
  subAgents: AgentRuntimeState[]
  taskSteps: AgentTaskStep[]
  overallStatus: 'planning' | 'executing' | 'completed' | 'failed'
  startTime?: Date
  completedTime?: Date
}

/**
 * 内置 Agent 定义
 * 对齐后端 builtInAgents.ts 的 6 个内置 Agent
 */
export const BUILT_IN_AGENTS: AgentDefinition[] = [
  {
    agentType: AgentType.GENERAL_PURPOSE,
    name: '通用 Agent',
    description: '处理各种复杂任务',
    whenToUse: 'General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks.',
    systemPrompt: '',
    color: AGENT_COLORS.blue,
    icon: '🤖',
    source: 'built-in',
    tools: ['*']
  },
  {
    agentType: AgentType.EXPLORE,
    name: '探索 Agent',
    description: '探索代码库结构，定位相关文件',
    whenToUse: 'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns or search code for keywords.',
    systemPrompt: '',
    color: AGENT_COLORS.green,
    icon: '🔍',
    source: 'built-in',
    disallowedTools: ['Agent', 'ExitPlanMode', 'FileEdit', 'FileWrite', 'NotebookEdit'],
    model: 'haiku',
    omitClaudeMd: true
  },
  {
    agentType: AgentType.PLAN,
    name: '规划 Agent',
    description: '制定实施方案，设计代码结构',
    whenToUse: 'Software architect agent for designing implementation plans. Returns step-by-step plans, identifies critical files, and considers architectural trade-offs.',
    systemPrompt: '',
    color: AGENT_COLORS.orange,
    icon: '📋',
    source: 'built-in',
    disallowedTools: ['Agent', 'ExitPlanMode', 'FileEdit', 'FileWrite', 'NotebookEdit'],
    model: 'inherit',
    omitClaudeMd: true
  },
  {
    agentType: AgentType.VERIFICATION,
    name: '验证 Agent',
    description: '验证实现是否正确，执行对抗性测试',
    whenToUse: 'Use this agent to verify that implementation work is correct before reporting completion. Produces a PASS/FAIL/PARTIAL verdict with evidence.',
    systemPrompt: '',
    color: AGENT_COLORS.red,
    icon: '✅',
    source: 'built-in',
    disallowedTools: ['Agent', 'ExitPlanMode', 'FileEdit', 'FileWrite', 'NotebookEdit'],
    model: 'inherit',
    background: true
  },
  {
    agentType: AgentType.CLAUDE_CODE_GUIDE,
    name: 'Claude 指南 Agent',
    description: '帮助用户了解 Claude Code、Agent SDK 和 API',
    whenToUse: 'Use this agent when the user asks questions about Claude Code, Agent SDK, or Claude API.',
    systemPrompt: '',
    color: AGENT_COLORS.purple,
    icon: '📖',
    source: 'built-in',
    tools: ['Bash', 'Read', 'WebFetch', 'WebSearch'],
    model: 'haiku',
    permissionMode: 'dontAsk'
  },
  {
    agentType: AgentType.STATUSLINE_SETUP,
    name: '状态栏设置 Agent',
    description: '配置 Claude Code 的状态栏',
    whenToUse: "Use this agent to configure the user's Claude Code status line setting.",
    systemPrompt: '',
    color: AGENT_COLORS.orange,
    icon: '⚙️',
    source: 'built-in',
    tools: ['Read', 'Edit'],
    model: 'sonnet'
  }
]

/**
 * 获取 Agent 定义
 */
export function getAgentDefinition(agentType: AgentType): AgentDefinition | undefined {
  return BUILT_IN_AGENTS.find(agent => agent.agentType === agentType)
}

/**
 * 创建 Agent 运行时状态
 */
export function createAgentRuntimeState(definition: AgentDefinition): AgentRuntimeState {
  return {
    agentId: `agent_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    agentDefinition: definition,
    status: 'idle',
    completedTasks: 0,
    totalTasks: 0,
    startTime: new Date(),
    lastActivityTime: new Date()
  }
}

/**
 * 创建初始的多 Agent 协调状态
 */
export function createInitialOrchestrationState(): MultiAgentOrchestrationState {
  return {
    subAgents: [],
    taskSteps: [],
    overallStatus: 'planning'
  }
}
