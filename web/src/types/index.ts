/**
 * 类型定义统一导出入口
 * 包含所有前后端共享的类型定义
 */

// 核心类型（优先导出）
export * from './auth'
export * from './message'
export * from './tool'
export * from './session'
export * from './websocket'
export * from './ui'
export * from './agent'

// 扩展类型（后导出，避免冲突）
export * from './flowKnowledge'

// Agent 工作流类型 - 显式导出以避免命名冲突
export type {
  AgentWorkflowEvent,
  WorkflowUpdatePayload,
  AgentStatusChangePayload,
  ToolCallStartPayload,
  ToolCallCompletePayload,
  ToolCallErrorPayload,
  PermissionRequiredPayload,
  TeammateSpawnedPayload,
  TaskStatusChangePayload,
  ThinkingPayload,
  TeamTopology,
  TeamMember as WorkflowTeamMember,
  BackgroundTask,
  PermissionRequest,
  PermissionModeInfo,
  PERMISSION_MODES,
  AgentRuntimeEvent,
  ToolCallInfo,
  ExecuteAgentRequest,
  ExecuteAgentResponse,
  TaskDecomposeRequest,
  TaskDecomposeResponse,
  SubTask,
  AgentStatusSnapshot,
  AgentStatusUpdate,
  AgentSelection,
  AgentExecutionStatus,
  ToolCallRecord,
} from './agentWorkflow'
