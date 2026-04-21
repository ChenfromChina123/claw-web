/**
 * Agent Workflow Event System Types
 * Defines the event-driven communication protocol between backend and frontend
 */

import type { AgentStatus, AgentActionType, AgentWorkflowStep } from './agent'

// ============================================================================
// Event Type Definitions
// ============================================================================

/** Core event types for agent workflow communication */
export type AgentWorkflowEventType =
  | 'WORKFLOW_UPDATE'         // Generic workflow state change
  | 'WORKFLOW_START'          // Workflow/trace started
  | 'WORKFLOW_COMPLETE'       // Workflow/trace completed
  | 'WORKFLOW_ERROR'          // Workflow/trace failed
  | 'AGENT_STATUS_CHANGED'    // Agent status transition
  | 'AGENT_SPAWNED'           // New agent created
  | 'AGENT_TERMINATED'        // Agent finished execution
  | 'TOOL_CALL_START'         // Tool execution started
  | 'TOOL_CALL_PROGRESS'      // Tool execution progress
  | 'TOOL_CALL_COMPLETE'      // Tool execution finished
  | 'TOOL_CALL_ERROR'         // Tool execution failed
  | 'PERMISSION_REQUIRED'     // User approval needed
  | 'PERMISSION_GRANTED'     // User approved action
  | 'PERMISSION_DENIED'       // User denied action
  | 'TEAMMATE_SPAWNED'        // Teammate agent created
  | 'TEAMMATE_MESSAGE'        // Message to/from teammate
  | 'AGENT_TOKEN_STREAM'      // Streaming token output
  | 'TASK_STATUS_CHANGED'     // Background task status change
  | 'CONTEXT_SUMMARY'         // Context window summary update
  | 'THINKING_START'          // Agent started reasoning
  | 'THINKING_END'            // Agent finished reasoning

/** Event priority levels */
export type EventPriority = 'low' | 'normal' | 'high' | 'critical'

// ============================================================================
// Core Event Payload Types
// ============================================================================

/** Base event structure */
export interface BaseAgentEvent<T = unknown> {
  traceId: string                    // Main task trace ID
  agentId: string                    // Agent that triggered the event
  type: AgentWorkflowEventType       // Event type
  timestamp: number                  // Unix timestamp (ms)
  priority?: EventPriority           // Event priority
  sessionId?: string                 // Optional session context
  parentAgentId?: string             // Parent agent if spawned
  payload: T                        // Event-specific payload
}

/** Workflow update payload */
export interface WorkflowUpdatePayload {
  status: 'WAITING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  actionType: AgentActionType
  message: string
  details?: Record<string, unknown>
  progress?: number                  // 0-100
  input?: Record<string, unknown>
  output?: Record<string, unknown>
}

/** Agent status change payload */
export interface AgentStatusChangePayload {
  agentId: string
  agentName: string
  agentType: string
  previousStatus: AgentStatus
  newStatus: AgentStatus
  reason?: string
}

/** Agent spawned payload */
export interface AgentSpawnedPayload {
  agentId: string
  agentName: string
  agentType: string
  parentAgentId?: string
  traceId: string
  config?: {
    tools?: string[]
    permissionMode?: string
    maxTurns?: number
    readonly?: boolean
  }
  teamId?: string
}

/** Tool call event payloads */
export interface ToolCallStartPayload {
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  agentId: string
}

export interface ToolCallProgressPayload {
  toolCallId: string
  toolName: string
  progress: number                   // 0-100
  message?: string
  logs?: string[]                    // Streaming logs
}

export interface ToolCallCompletePayload {
  toolCallId: string
  toolName: string
  output: unknown
  duration: number                   // ms
  success: boolean
}

export interface ToolCallErrorPayload {
  toolCallId: string
  toolName: string
  error: string
  stack?: string
}

/** Permission request payload */
export interface PermissionRequiredPayload {
  permissionId: string
  toolName: string
  action: string
  reason: string
  input: Record<string, unknown>
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  suggestions?: string[]             // Alternative suggestions
  agentId: string
}

/** Teammate spawned payload */
export interface TeammateSpawnedPayload {
  teamId: string
  teammateId: string
  teammateName: string
  role: string
  parentAgentId: string
  initialTask?: string
}

/** Token stream payload */
export interface TokenStreamPayload {
  agentId: string
  content: string
  isComplete: boolean
  tokenCount?: number
}

/** Task status change payload */
export interface TaskStatusChangePayload {
  taskId: string
  taskName: string
  previousStatus: string
  newStatus: string
  result?: unknown
  error?: string
  traceId?: string
}

/** Thinking event payload */
export interface ThinkingPayload {
  agentId: string
  thinking: string
  isComplete: boolean
}

// ============================================================================
// Event Union Types
// ============================================================================

export type AgentWorkflowEvent =
  | BaseAgentEvent<WorkflowUpdatePayload>
  | BaseAgentEvent<AgentStatusChangePayload>
  | BaseAgentEvent<AgentSpawnedPayload>
  | BaseAgentEvent<ToolCallStartPayload>
  | BaseAgentEvent<ToolCallProgressPayload>
  | BaseAgentEvent<ToolCallCompletePayload>
  | BaseAgentEvent<ToolCallErrorPayload>
  | BaseAgentEvent<PermissionRequiredPayload>
  | BaseAgentEvent<{ permissionId: string; action: 'granted' | 'denied' }>
  | BaseAgentEvent<TeammateSpawnedPayload>
  | BaseAgentEvent<TokenStreamPayload>
  | BaseAgentEvent<TaskStatusChangePayload>
  | BaseAgentEvent<ThinkingPayload>

// ============================================================================
// Trace & Workflow State Types
// ============================================================================

/** Full trace state for workflow visualization */
export interface TraceState {
  traceId: string
  title: string
  status: 'WAITING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  rootAgentId: string
  agentIds: string[]
  parentTraceId?: string
  childTraceIds: string[]
  createdAt: number
  startedAt?: number
  completedAt?: number
  duration?: number
  messageCount: number
  toolCallCount: number
  errorCount: number
  progress?: number                   // 0-100
  summary?: string
}

/** Agent runtime state */
export interface AgentRuntimeEvent {
  agentId: string
  traceId: string
  name: string
  type: string
  status: AgentStatus
  parentAgentId?: string
  teamId?: string
  currentTask?: string
  progress: number                   // 0-100
  steps: AgentWorkflowStep[]
  spawnedAgents: string[]
  toolCalls: ToolCallInfo[]
  permissionRequests: PermissionRequest[]
  createdAt: number
  startedAt?: number
  completedAt?: number
}

/** Tool call info for agent */
export interface ToolCallInfo {
  toolCallId: string
  toolName: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: number
  completedAt?: number
  duration?: number
  input?: Record<string, unknown>
  output?: unknown
  error?: string
}

/** Permission request tracking */
export interface PermissionRequest {
  permissionId: string
  toolName: string
  action: string
  reason: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  status: 'pending' | 'approved' | 'denied' | 'timeout'
  requestedAt: number
  respondedAt?: number
  respondedBy?: 'user' | 'system'
}

/** Team topology for multi-agent visualization */
export interface TeamTopology {
  teamId: string
  name: string
  orchestratorId: string
  members: TeamMember[]
  createdAt: number
  status: 'active' | 'completed' | 'failed'
}

export interface TeamMember {
  agentId: string
  name: string
  role: string
  type: string
  status: AgentStatus
  parentId?: string
  children: string[]                 // Child agent IDs
  progress: number
  isActive: boolean
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/** Execute agent request */
/**
 * Execute agent request
 * 对齐后端 AgentToolInput 的完整字段
 */
export interface ExecuteAgentRequest {
  prompt: string
  description?: string
  agentType?: string
  sessionId?: string
  tools?: string[]
  deniedTools?: string[]
  permissionMode?: 'bypassPermissions' | 'acceptEdits' | 'auto' | 'plan' | 'bubble' | 'dontAsk'
  maxTurns?: number
  background?: boolean
  teamId?: string
  teamName?: string
  name?: string
  model?: string
  isolation?: 'worktree' | 'remote'
  cwd?: string
}

/** Execute agent response */
export interface ExecuteAgentResponse {
  traceId: string
  agentId: string
  status: 'queued' | 'started' | 'completed' | 'failed' | 'async_launched' | 'teammate_spawned'
  message?: string
  outputFile?: string
  canReadOutputFile?: boolean
}

/** Team spawn request */
export interface SpawnTeamRequest {
  name: string
  orchestratorType?: string
  members?: Array<{
    name: string
    role: string
    type: string
    tools?: string[]
  }>
  initialTask?: string
}

/** Team spawn response */
export interface SpawnTeamResponse {
  teamId: string
  orchestratorId: string
  memberIds: string[]
  topology: TeamTopology
}

// ============================================================================
// Permission Mode Types
// ============================================================================

export type PermissionMode = 'bypassPermissions' | 'acceptEdits' | 'auto' | 'plan' | 'bubble'

export interface PermissionModeInfo {
  mode: PermissionMode
  label: string
  description: string
  icon: string
  requiresUserInteraction: boolean
  blocksOnRisk: boolean
}

export const PERMISSION_MODES: PermissionModeInfo[] = [
  {
    mode: 'bypassPermissions',
    label: '无限制',
    description: '所有操作直接执行，无需确认',
    icon: 'flash',
    requiresUserInteraction: false,
    blocksOnRisk: false
  },
  {
    mode: 'acceptEdits',
    label: '接受编辑',
    description: '接受所有文件编辑，其他操作需确认',
    icon: 'checkmark-circle',
    requiresUserInteraction: false,
    blocksOnRisk: true
  },
  {
    mode: 'auto',
    label: '自动',
    description: '自动允许安全操作，高风险操作需确认',
    icon: 'speedometer',
    requiresUserInteraction: false,
    blocksOnRisk: true
  },
  {
    mode: 'plan',
    label: '计划模式',
    description: '先规划后执行，所有修改需确认',
    icon: 'git-branch',
    requiresUserInteraction: true,
    blocksOnRisk: true
  },
  {
    mode: 'bubble',
    label: '冒泡模式',
    description: '类似自动模式，但会提示所有操作',
    icon: 'chatbox-ellipses',
    requiresUserInteraction: false,
    blocksOnRisk: true
  }
]

// ============================================================================
// Background Task Types
// ============================================================================

export type BackgroundTaskStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export interface BackgroundTask {
  taskId: string
  traceId?: string
  name: string
  description?: string
  status: BackgroundTaskStatus
  progress?: number
  result?: unknown
  error?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  metadata?: Record<string, unknown>
}
