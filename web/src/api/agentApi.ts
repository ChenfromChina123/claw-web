/**
 * Agent API Client
 * Handles all HTTP communication with the backend Agent endpoints
 */

import client from './client'
import type {
  ExecuteAgentRequest,
  ExecuteAgentResponse,
  SpawnTeamRequest,
  SpawnTeamResponse,
  TeamTopology,
  BackgroundTask,
  AgentRuntimeEvent
} from '@/types/agentWorkflow'
import type { AgentDefinition } from '@/types'

// ============================================================================
// Agent Execution API
// ============================================================================

/**
 * Execute a single agent task
 * 对齐后端 AgentToolInput 的完整字段
 */
export async function executeAgent(request: ExecuteAgentRequest): Promise<ExecuteAgentResponse> {
  const response = await client.post<ExecuteAgentResponse>('/agents/execute', {
    prompt: request.prompt,
    description: request.description,
    agentType: request.agentType || 'general-purpose',
    subagent_type: request.agentType || 'general-purpose',
    sessionId: request.sessionId,
    tools: request.tools,
    deniedTools: request.deniedTools,
    permissionMode: request.permissionMode || 'auto',
    mode: request.permissionMode || 'auto',
    maxTurns: request.maxTurns,
    max_turns: request.maxTurns,
    background: request.background || false,
    run_in_background: request.background || false,
    teamId: request.teamId,
    team_name: request.teamName,
    name: request.name,
    model: request.model,
    isolation: request.isolation,
    cwd: request.cwd
  })
  return response.data.data as ExecuteAgentResponse
}

/**
 * Interrupt a running agent
 */
export async function interruptAgent(agentId: string): Promise<{ success: boolean; message?: string }> {
  const response = await client.post(`/agents/${agentId}/interrupt`)
  return response.data.data as { success: boolean; message?: string }
}

/**
 * Approve a pending permission request
 */
export async function approvePermission(
  permissionId: string,
  agentId?: string
): Promise<{ success: boolean; message?: string }> {
  const response = await client.post(`/agents/${agentId || 'pending'}/approve`, {
    permissionId
  })
  return response.data.data as { success: boolean; message?: string }
}

/**
 * Deny a pending permission request
 */
export async function denyPermission(
  permissionId: string,
  agentId?: string
): Promise<{ success: boolean; message?: string }> {
  const response = await client.post(`/agents/${agentId || 'pending'}/deny`, {
    permissionId
  })
  return response.data.data as { success: boolean; message?: string }
}

// ============================================================================
// Multi-Agent & Team API
// ============================================================================

/**
 * Spawn a new team of agents
 */
export async function spawnTeam(request: SpawnTeamRequest): Promise<SpawnTeamResponse> {
  const response = await client.post<SpawnTeamResponse>('/agents/team/spawn', request)
  return response.data.data as SpawnTeamResponse
}

/**
 * Get team topology
 */
export async function getTeamTopology(teamId: string): Promise<TeamTopology> {
  const response = await client.get<TeamTopology>(`/agents/team/${teamId}/topology`)
  return response.data.data as TeamTopology
}

/**
 * Get all active teams
 */
export async function listTeams(): Promise<TeamTopology[]> {
  const response = await client.get<{ teams: TeamTopology[] }>('/agents/teams')
  return (response.data.data as { teams: TeamTopology[] }).teams
}

/**
 * 结构化消息类型
 * 对齐后端 sendMessageTool.ts 的 StructuredMessage
 */
export type StructuredMessage =
  | { type: 'shutdown_request'; reason?: string }
  | { type: 'shutdown_response'; request_id: string; approve: boolean; reason?: string }
  | { type: 'plan_approval_response'; request_id: string; approve: boolean; feedback?: string }

/**
 * SendMessage 请求参数
 * 对齐后端 SendMessageInput：支持 to（名称路由）和 agentId（ID 路由）
 */
export interface SendMessageParams {
  /** 目标接收者：队友名称或 "*" 广播 */
  to?: string
  /** 消息内容（纯文本或结构化消息） */
  message: string | StructuredMessage
  /** 消息摘要（5-10 词预览） */
  summary?: string
  /** 目标 Agent ID（向后兼容，优先使用 to） */
  agentId?: string
  /** Agent 类型名称（用于验证是否为 One-shot Agent） */
  agentName?: string
}

/**
 * SendMessage 响应
 * 对齐后端 SendMessageOutput
 */
export interface SendMessageResponse {
  messageId: string
  agentId?: string
  status: 'sent' | 'queued' | 'broadcast' | 'error'
  routing?: {
    method: 'name' | 'id' | 'broadcast'
    target: string
  }
  recipients?: string[]
  error?: string
}

/**
 * Send message to a running agent
 * 支持 to（名称路由 + 广播）和 agentId（ID 路由）两种方式
 */
export async function sendMessageToAgent(
  agentIdOrParams: string | SendMessageParams,
  message?: string | StructuredMessage
): Promise<SendMessageResponse> {
  let params: SendMessageParams

  if (typeof agentIdOrParams === 'string') {
    params = {
      agentId: agentIdOrParams,
      message: message || ''
    }
  } else {
    params = agentIdOrParams
  }

  const endpoint = params.agentId
    ? `/agents/${params.agentId}/message`
    : '/agents/message'

  const response = await client.post<SendMessageResponse>(endpoint, {
    to: params.to,
    message: typeof params.message === 'string' ? params.message : JSON.stringify(params.message),
    summary: params.summary,
    agentName: params.agentName
  })
  return response.data.data as SendMessageResponse
}

// ============================================================================
// Background Task Management API
// ============================================================================

/**
 * Get all background tasks
 */
export async function listTasks(
  status?: string,
  limit = 50,
  offset = 0
): Promise<{ tasks: BackgroundTask[]; total: number }> {
  const params = new URLSearchParams()
  if (status) params.append('status', status)
  params.append('limit', String(limit))
  params.append('offset', String(offset))

  const response = await client.get<{ tasks: BackgroundTask[]; total: number }>(
    `/tasks?${params.toString()}`
  )
  return response.data.data as { tasks: BackgroundTask[]; total: number }
}

/**
 * Get single task status
 */
export async function getTaskStatus(taskId: string): Promise<BackgroundTask> {
  const response = await client.get<BackgroundTask>(`/tasks/${taskId}/status`)
  return response.data.data as BackgroundTask
}

/**
 * Cancel a background task
 */
export async function cancelTask(taskId: string): Promise<{ success: boolean }> {
  const response = await client.post(`/tasks/${taskId}/cancel`)
  return response.data.data as { success: boolean }
}

/**
 * Get task trace (jump to related trace)
 */
export async function getTaskTrace(taskId: string): Promise<{ traceId: string } | null> {
  const response = await client.get<{ traceId: string } | null>(`/tasks/${taskId}/trace`)
  return response.data.data as { traceId: string } | null
}

// ============================================================================
// Agent State & Orchestration API
// ============================================================================

/**
 * Get agent runtime state
 */
export async function getAgentState(agentId: string): Promise<AgentRuntimeEvent> {
  const response = await client.get<AgentRuntimeEvent>(`/agents/${agentId}/state`)
  return response.data.data as AgentRuntimeEvent
}

/**
 * Get all active agents
 */
export async function listActiveAgents(): Promise<AgentRuntimeEvent[]> {
  const response = await client.get<{ agents: AgentRuntimeEvent[] }>('/agents/active')
  return (response.data.data as { agents: AgentRuntimeEvent[] }).agents
}

/**
 * Initialize orchestration
 */
export async function initOrchestration(
  config?: {
    orchestratorType?: string
    maxAgents?: number
    teamMode?: boolean
  }
): Promise<{ orchestratorId: string; teamId?: string }> {
  const response = await client.post<{ orchestratorId: string; teamId?: string }>(
    '/agents/orchestration/init',
    config
  )
  return response.data.data as { orchestratorId: string; teamId?: string }
}

/**
 * Get orchestration state
 */
export async function getOrchestrationState(): Promise<{
  orchestrator: AgentRuntimeEvent | null
  agents: AgentRuntimeEvent[]
  traces: string[]
}> {
  const response = await client.get('/agents/orchestration/state')
  return response.data.data as {
    orchestrator: AgentRuntimeEvent | null
    agents: AgentRuntimeEvent[]
    traces: string[]
  }
}

// ============================================================================
// Task Decomposition API
// ============================================================================

/**
 * Decompose a task into subtasks
 */
export async function decomposeTask(
  task: string,
  context?: Record<string, unknown>
): Promise<{
  subtasks: Array<{
    id: string
    description: string
    estimatedComplexity: 'low' | 'medium' | 'high'
    parallelizable: boolean
    dependencies: string[]
  }>
}> {
  const response = await client.post('/agents/decompose', { task, context })
  return response.data.data as {
    subtasks: Array<{
      id: string
      description: string
      estimatedComplexity: 'low' | 'medium' | 'high'
      parallelizable: boolean
      dependencies: string[]
    }>
  }
}

// ============================================================================
// Agent Registry API
// ============================================================================

/**
 * List available agent types
 */
export async function listAgentTypes(): Promise<AgentDefinition[]> {
  const response = await client.get<{ agents: AgentDefinition[] }>('/agents')
  return (response.data.data as { agents: AgentDefinition[] }).agents
}

/**
 * Get agent definition by type
 */
export async function getAgentDefinition(agentType: string): Promise<AgentDefinition | null> {
  const response = await client.get<AgentDefinition | null>(`/agents/${agentType}`)
  return response.data.data as AgentDefinition | null
}

// ============================================================================
// Context Isolation API
// ============================================================================

/**
 * 隔离上下文信息
 */
export interface IsolationContext {
  isolationId: string
  userId?: string
  name: string
  mode: 'worktree' | 'remote'
  status: 'initializing' | 'ready' | 'running' | 'paused' | 'terminated' | 'error'
  workingDirectory: string
  createdAt: string
  lastActivity: string
  executionCount: number
  totalDuration: number
}

/**
 * 创建隔离上下文请求
 */
export interface CreateIsolationRequest {
  name: string
  mode: 'worktree' | 'remote'
  description?: string
  worktree?: {
    mainRepoPath: string
    worktreeName?: string
    branchName?: string
  }
  remote?: {
    type: 'ssh' | 'docker'
    connection: Record<string, unknown>
  }
}

/**
 * 创建隔离上下文
 */
export async function createIsolationContext(
  request: CreateIsolationRequest
): Promise<IsolationContext> {
  const response = await client.post('/agents/isolation', request)
  return (response.data.data as { context: IsolationContext }).context
}

/**
 * 获取当前用户的隔离上下文列表
 */
export async function listIsolationContexts(): Promise<IsolationContext[]> {
  const response = await client.get('/agents/isolation')
  return (response.data.data as { contexts: IsolationContext[] }).contexts
}

/**
 * 获取隔离上下文状态
 */
export async function getIsolationStatus(contextId: string): Promise<IsolationContext> {
  const response = await client.get(`/agents/isolation/${contextId}`)
  return (response.data.data as { context: IsolationContext }).context
}

/**
 * 在隔离上下文中执行命令
 */
export async function executeInIsolation(
  contextId: string,
  command: string,
  args?: string[],
  options?: {
    cwd?: string
    env?: Record<string, string>
    timeout?: number
  }
): Promise<{
  success: boolean
  isolationId: string
  output?: string
  error?: string
  exitCode?: number
  duration: number
}> {
  const response = await client.post(`/agents/isolation/${contextId}/execute`, {
    command,
    args,
    ...options
  })
  return (response.data.data as { result: any }).result
}

/**
 * 销毁隔离上下文
 */
export async function destroyIsolationContext(contextId: string): Promise<{ success: boolean }> {
  const response = await client.delete(`/agents/isolation/${contextId}`)
  return response.data.data as { success: boolean }
}

/**
 * 合并隔离更改（worktree模式）
 */
export async function mergeIsolationChanges(contextId: string): Promise<{
  success: boolean
  merged: number
  conflicts?: unknown[]
}> {
  const response = await client.post(`/agents/isolation/${contextId}/merge`)
  return response.data.data as {
    success: boolean
    merged: number
    conflicts?: unknown[]
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Poll agent status until completion or error
 */
export async function pollAgentUntilComplete(
  agentId: string,
  intervalMs = 1000,
  maxAttempts = 60
): Promise<AgentRuntimeEvent> {
  let attempts = 0

  while (attempts < maxAttempts) {
    const state = await getAgentState(agentId)

    if (state.status === 'COMPLETED' || state.status === 'FAILED') {
      return state
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    attempts++
  }

  throw new Error(`Agent ${agentId} did not complete within ${maxAttempts} attempts`)
}

/**
 * Poll task status until completion
 */
export async function pollTaskUntilComplete(
  taskId: string,
  intervalMs = 1000,
  maxAttempts = 120
): Promise<BackgroundTask> {
  let attempts = 0

  while (attempts < maxAttempts) {
    const task = await getTaskStatus(taskId)

    if (
      task.status === 'COMPLETED' ||
      task.status === 'FAILED' ||
      task.status === 'CANCELLED'
    ) {
      return task
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
    attempts++
  }

  throw new Error(`Task ${taskId} did not complete within ${maxAttempts} attempts`)
}

// ============================================================================
// Export all API functions
// ============================================================================

export default {
  // Execution
  executeAgent,
  interruptAgent,
  approvePermission,
  denyPermission,

  // Team
  spawnTeam,
  getTeamTopology,
  listTeams,
  sendMessageToAgent,

  // Tasks
  listTasks,
  getTaskStatus,
  cancelTask,
  getTaskTrace,

  // State
  getAgentState,
  listActiveAgents,
  initOrchestration,
  getOrchestrationState,

  // Decomposition
  decomposeTask,

  // Registry
  listAgentTypes,
  getAgentDefinition,

  // Isolation
  createIsolationContext,
  listIsolationContexts,
  getIsolationStatus,
  executeInIsolation,
  destroyIsolationContext,
  mergeIsolationChanges,

  // Utilities
  pollAgentUntilComplete,
  pollTaskUntilComplete
}
