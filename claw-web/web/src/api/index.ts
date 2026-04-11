/**
 * API 模块统一导出
 */

export { apiClient, default as api } from './client'
export { authApi } from './authApi'
export { sessionApi } from './sessionApi'
export { toolApi } from './toolApi'
export { modelApi } from './modelApi'
export { mcpApi } from './mcpApi'
export { exportApi } from './exportApi'
export { promptTemplateApi } from './promptTemplateApi'
export { default as agentApi } from './agentApi'
export type {
  AgentExecuteRequest,
  AgentExecuteResponse,
  AgentStateResponse,
  TeamCreateRequest,
  TeamMember,
  TeamStateResponse,
  TaskDecomposeRequest,
  SubTask,
  TaskDecomposeResponse,
  IsolationCreateRequest,
  IsolationStateResponse
} from './agentApi'

// 新增 Agent Workflow 类型导出
export type {
  ExecuteAgentRequest,
  ExecuteAgentResponse,
  SpawnTeamRequest,
  SpawnTeamResponse,
  TeamTopology,
  BackgroundTask,
  BackgroundTaskStatus,
  AgentWorkflowEvent,
  WorkflowUpdatePayload,
  ToolCallStartPayload,
  ToolCallCompletePayload,
  ToolCallErrorPayload,
  PermissionRequiredPayload,
  PermissionMode,
  PermissionModeInfo
} from '@/types/agentWorkflow'
