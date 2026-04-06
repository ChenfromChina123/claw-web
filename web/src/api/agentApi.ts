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
 */
export async function executeAgent(request: ExecuteAgentRequest): Promise<ExecuteAgentResponse> {
  const response = await client.post<ExecuteAgentResponse>('/agents/execute', {
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
 * Send message to a running agent
 */
export async function sendMessageToAgent(
  agentId: string,
  message: string
): Promise<{ success: boolean; messageId?: string }> {
  const response = await client.post(`/agents/${agentId}/message`, { message })
  return response.data.data as { success: boolean; messageId?: string }
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
 * Create isolated execution context
 */
export async function createIsolationContext(
  mode: 'worktree' | 'remote',
  options?: {
    branchName?: string
    remoteName?: string
  }
): Promise<{ contextId: string; mode: string }> {
  const response = await client.post('/agents/isolation/create', {
    mode,
    ...options
  })
  return response.data.data as { contextId: string; mode: string }
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
  const response = await client.get(`/agents/isolation/${contextId}/status`)
  return response.data.data as {
    contextId: string
    mode: string
    status: 'active' | 'completed' | 'failed'
    changes?: unknown
  }
}

/**
 * Merge isolation changes back
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
  getIsolationStatus,
  mergeIsolationChanges,

  // Utilities
  pollAgentUntilComplete,
  pollTaskUntilComplete
}
