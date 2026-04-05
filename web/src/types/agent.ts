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
export type PermissionMode = 'bypassPermissions' | 'acceptEdits' | 'auto' | 'plan'

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
