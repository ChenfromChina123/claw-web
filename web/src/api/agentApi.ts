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
import type { AgentDefinition, AgentExecuteRequest, AgentExecuteResponse } from '@/types'

// ============================================================================
// Agent Execution API
// ============================================================================

/**
 * Execute a single agent task
 */
export async function executeAgent(request: ExecuteAgentRequest): Promise<ExecuteAgentResponse> {
  const response = await client.post<ExecuteAgentResponse>('/api/agents/execute', {
    prompt: request.prompt,
    agentType: request.agentType || 'general-purpose',
    sessionId: request.sessionId,
    tools: request.tools,
    deniedTools: request.deniedTools,
    permissionMode: request.permissionMode || 'auto',
    maxTurns: request.maxTurns,
    background: request.background || false,
    teamId: request.teamId
  })
  return response.data
}

/**
 * Interrupt a running agent
 */
export async function interruptAgent(agentId: string): Promise<{ success: boolean; message?: string }> {
  const response = await client.post(`/api/agents/${agentId}/interrupt`)
  return response.data
}

/**
 * Approve a pending permission request
 */
export async function approvePermission(
  permissionId: string,
  agentId?: string
): Promise<{ success: boolean; message?: string }> {
  const response = await client.post(`/api/agents/${agentId || 'pending'}/approve`, {
    permissionId
  })
  return response.data
}

/**
 * Deny a pending permission request
 */
export async function denyPermission(
  permissionId: string,
  agentId?: string
): Promise<{ success: boolean; message?: string }> {
  const response = await client.post(`/api/agents/${agentId || 'pending'}/deny`, {
    permissionId
  })
  return response.data
}

// ============================================================================
// Multi-Agent & Team API
// ============================================================================

/**
 * Spawn a new team of agents
 */
export async function spawnTeam(request: SpawnTeamRequest): Promise<SpawnTeamResponse> {
  const response = await client.post<SpawnTeamResponse>('/api/agents/team/spawn', request)
  return response.data
}

/**
 * Get team topology
 */
export async function getTeamTopology(teamId: string): Promise<TeamTopology> {
  const response = await client.get<TeamTopology>(`/api/agents/team/${teamId}/topology`)
  return response.data
}

/**
 * Get all active teams
 */
export async function listTeams(): Promise<TeamTopology[]> {
  const response = await client.get<{ teams: TeamTopology[] }>('/api/agents/teams')
  return response.data.teams
}

/**
 * Send message to a running agent
 */
export async function sendMessageToAgent(
  agentId: string,
  message: string
): Promise<{ success: boolean; messageId?: string }> {
  const response = await client.post(`/api/agents/${agentId}/message`, { message })
  return response.data
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
    `/api/tasks?${params.toString()}`
  )
  return response.data
}

/**
 * Get single task status
 */
export async function getTaskStatus(taskId: string): Promise<BackgroundTask> {
  const response = await client.get<BackgroundTask>(`/api/tasks/${taskId}/status`)
  return response.data
}

/**
 * Cancel a background task
 */
export async function cancelTask(taskId: string): Promise<{ success: boolean }> {
  const response = await client.post(`/api/tasks/${taskId}/cancel`)
  return response.data
}

/**
 * Get task trace (jump to related trace)
 */
export async function getTaskTrace(taskId: string): Promise<{ traceId: string } | null> {
  const response = await client.get<{ traceId: string } | null>(`/api/tasks/${taskId}/trace`)
  return response.data
}

// ============================================================================
// Agent State & Orchestration API
// ============================================================================

/**
 * Get agent runtime state
 */
export async function getAgentState(agentId: string): Promise<AgentRuntimeEvent> {
  const response = await client.get<AgentRuntimeEvent>(`/api/agents/${agentId}/state`)
  return response.data
}

/**
 * Get all active agents
 */
export async function listActiveAgents(): Promise<AgentRuntimeEvent[]> {
  const response = await client.get<{ agents: AgentRuntimeEvent[] }>('/api/agents/active')
  return response.data.agents
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
    '/api/agents/orchestration/init',
    config
  )
  return response.data
}

/**
 * Get orchestration state
 */
export async function getOrchestrationState(): Promise<{
  orchestrator: AgentRuntimeEvent | null
  agents: AgentRuntimeEvent[]
  traces: string[]
}> {
  const response = await client.get('/api/agents/orchestration/state')
  return response.data
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
  const response = await client.post('/api/agents/decompose', { task, context })
  return response.data
}

// ============================================================================
// Agent Registry API
// ============================================================================

/**
 * List available agent types
 */
export async function listAgentTypes(): Promise<AgentDefinition[]> {
  const response = await client.get<{ agents: AgentDefinition[] }>('/api/agents')
  return response.data.agents
}

/**
 * Get agent definition by type
 */
export async function getAgentDefinition(agentType: string): Promise<AgentDefinition | null> {
  const response = await client.get<AgentDefinition | null>(`/api/agents/${agentType}`)
  return response.data
}

// ============================================================================
// Context Isolation API
// ============================================================================

/**
 * Create isolated execution context
 */
export async function createIsolationContext(
  mode: 'worktree' | 'remote',
  options?: {
    branchName?: string
    remoteName?: string
  }
): Promise<{ contextId: string; mode: string }> {
  const response = await client.post('/api/agents/isolation/create', {
    mode,
    ...options
  })
  return response.data
}

/**
 * Get isolation context status
 */
export async function getIsolationStatus(contextId: string): Promise<{
  contextId: string
  mode: string
  status: 'active' | 'completed' | 'failed'
  changes?: unknown
}> {
  const response = await client.get(`/api/agents/isolation/${contextId}/status`)
  return response.data
}

/**
 * Merge isolation changes back
 */
export async function mergeIsolationChanges(contextId: string): Promise<{
  success: boolean
  merged: number
  conflicts?: unknown[]
}> {
  const response = await client.post(`/api/agents/isolation/${contextId}/merge`)
  return response.data
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
  getIsolationStatus,
  mergeIsolationChanges,

  // Utilities
  pollAgentUntilComplete,
  pollTaskUntilComplete
}
