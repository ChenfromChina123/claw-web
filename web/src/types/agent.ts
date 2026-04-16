/**
 * Agent 相关类型定义
 * 用于多 Agent 协作系统的状态管理
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
 */
export type PermissionMode = 'bypassPermissions' | 'acceptEdits' | 'auto' | 'plan' | 'bubble'

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
 */
export enum AgentType {
  GENERAL_PURPOSE = 'general-purpose',
  EXPLORE = 'Explore',
  PLAN = 'Plan',
  CODE = 'Code',
  TEST = 'Test'
}

/**
 * Agent 定义
 */
export interface AgentDefinition {
  agentType: AgentType
  name: string
  description: string
  systemPrompt: string
  color: string
  icon: string
  source: 'built-in' | 'custom'
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
 */
export const BUILT_IN_AGENTS: AgentDefinition[] = [
  {
    agentType: AgentType.GENERAL_PURPOSE,
    name: '通用 Agent',
    description: '处理各种复杂任务',
    systemPrompt: '你是一个通用的 AI 助手，可以处理各种任务。',
    color: '#3b82f6',
    icon: '🤖',
    source: 'built-in'
  },
  {
    agentType: AgentType.EXPLORE,
    name: '探索 Agent',
    description: '探索代码库结构，定位相关文件',
    systemPrompt: '你是一个代码探索专家，负责分析代码库结构。',
    color: '#10b981',
    icon: '🔍',
    source: 'built-in'
  },
  {
    agentType: AgentType.PLAN,
    name: '规划 Agent',
    description: '制定实施方案，设计代码结构',
    systemPrompt: '你是一个规划专家，负责制定详细的执行方案。',
    color: '#f59e0b',
    icon: '📋',
    source: 'built-in'
  }
]

/**
 * 获取 Agent 定义
 * @param agentType Agent 类型
 * @returns Agent 定义，如果不存在则返回 undefined
 */
export function getAgentDefinition(agentType: AgentType): AgentDefinition | undefined {
  return BUILT_IN_AGENTS.find(agent => agent.agentType === agentType)
}

/**
 * 创建 Agent 运行时状态
 * @param definition Agent 定义
 * @returns Agent 运行时状态
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
 * @returns 多 Agent 协调状态
 */
export function createInitialOrchestrationState(): MultiAgentOrchestrationState {
  return {
    subAgents: [],
    taskSteps: [],
    overallStatus: 'planning'
  }
}
