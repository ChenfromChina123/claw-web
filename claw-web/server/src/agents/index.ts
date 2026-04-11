/**
 * Agent 导出 - 整合所有 Agent 相关模块
 * 
 * 阶段四: 多 Agent 协作
 * 
 * 导出:
 * - 类型定义
 * - 核心组件
 * - Agent 工具
 * - 执行引擎
 */

// ==================== 类型定义 ====================
export type {
  AgentDefinition,
  AgentInstance,
  AgentStatus,
  MultiAgentOrchestrationState,
  TaskStep,
  AgentExecutionContext,
  AgentExecutionResult,
  BaseAgentDefinition,
  BuiltInAgentDefinition,
  CustomAgentDefinition,
  AgentSource,
  AgentColorName,
  ToolPermission,
  MCPServerConfig,
  HookConfig,
  IsolationMode,
  MemoryType,
  PermissionMode,
} from './types'



// ==================== 内置 Agent ====================
export {
  getBuiltInAgents,
  getBuiltInAgentByType,
  GENERAL_PURPOSE_AGENT,
  EXPLORE_AGENT,
  PLAN_AGENT,
  VERIFICATION_AGENT,
  CLAUDE_CODE_GUIDE_AGENT,
  STATUSLINE_SETUP_AGENT,
} from './builtInAgents'

// ==================== Agent 注册表 ====================
export {
  AgentRegistry,
  getAgentRegistry,
} from './agentRegistry'

export type {
  AgentRuntimeState,
  ProgressCallback,
} from './agentRegistry'

// ==================== Mailbox 消息队列 ====================
export {
  MailboxManager,
  getMailboxManager,
} from './mailbox'

export type {
  MailboxMessage,
  MailboxDeliveryResult,
  MailboxQueryOptions,
} from './mailbox'

// ==================== 团队管理 ====================
export {
  TeamManager,
  TeamCoordinator,
  getTeamManager,
} from './teamManager'

export type {
  TeamMember,
  TeamTask,
  TeamState,
  TaskAssignmentResult,
  TeamRole,
  TeamMemberStatus,
  TeamEvent,
} from './teamManager'

// ==================== Fork 子代理 ====================
export {
  forkAgent,
  canForkAgent,
  getForkTree,
  getForkContextCache,
  ForkAgentError,
  ForkErrorType,
} from './forkAgent'

export type {
  ForkOptions,
  ForkResult,
} from './forkAgent'

// ==================== SendMessage 消息发送 ====================
export {
  sendMessage,
  getPendingMessages,
  markMessageAsRead,
  hasPendingMessages,
  isOneShotAgent,
  getOneShotAgents,
  SendMessageErrorType,
} from './sendMessage'

export type {
  SendMessageOptions,
  SendMessageResult,
} from './sendMessage'

// ==================== Agent 工具和执行 ====================
export { createAgentToolDefinition as createAgentTool } from '../tools/agentTool'

export {
  runAgent,
  executeAgent,
  getRuntimeStatusSummary,
} from './runAgent'

export type {
  RunAgentParams,
  AgentMessage,
  AgentToolCall,
  AgentToolResult,
  AgentProgress,
  RunAgentEvent,
} from './runAgent'

export { createRuntimeContext } from './runtimeContext'

export type { AgentRuntimeContext } from './runtimeContext'

export type { AgentRouterResult } from './agentRouter'

// ==================== Agent 引擎 ====================
export {
  executeAgent as engineExecuteAgent,
  initializeDemoOrchestration,
  agentManager,
} from './agentEngine'

export type { AgentManager } from './agentEngine'

// ==================== 错误处理与恢复 ====================
export {
  AgentError,
  AgentErrorFactory,
  AgentErrorType,
  ErrorSeverity,
  RecoveryStrategy,
  ErrorRecoveryHandler,
  ForkRecursionDetector,
  UserInterruptHandler,
  ResourceCleanupManager,
  getErrorRecoveryHandler,
  getForkRecursionDetector,
  getUserInterruptHandler,
  getResourceCleanupManager,
} from './errorHandler'

export type {
  RetryConfig,
  ErrorRecoveryContext,
  ForkCallEntry,
  InterruptRequest,
  CleanupTask,
} from './errorHandler'

// ==================== Feature Flags ====================
export {
  FeatureFlagManager,
  BUILTIN_FEATURE_FLAGS,
  getFeatureFlagManager,
  initializeFeatureFlags,
  isFeatureEnabled,
  getFeatureValue,
  setFeatureOverride,
  clearFeatureOverride,
  FeatureFlagType,
} from './featureFlags'

export type {
  FeatureFlagConfig,
  FeatureFlagState,
  FeatureFlagChangeEvent,
  FeatureFlagTarget,
  FlagEvaluationContext,
  FeatureFlagValue,
} from './featureFlags'

// ==================== MCP 验证 ====================
export {
  MCPServerValidator,
  getMCPServerValidator,
  initializeMCPValidator,
  createMCPServerError,
} from './mcpValidator'

export type {
  MCPTransportType,
  MCPValidatedServerConfig,
  MCPValidationResult,
  MCPValidationCheck,
  MCPToolValidationResult,
  MCPHealthCheckResult,
  MCPValidatorConfig,
} from './mcpValidator'

// ==================== 任务自动分解器 ====================
export {
  TaskDecomposer,
  SimpleLLMCaller,
  decomposeResultToTeamTasks,
  DecompositionMode,
} from './taskDecomposer'

export type {
  LLMCaller,
  TaskDecompositionRequest,
  TaskAnalysis,
  TaskDependency,
  SubTask,
  DecompositionResult,
} from './taskDecomposer'

// ==================== 上下文隔离 ====================
export {
  WorktreeIsolation,
  RemoteIsolation,
  IsolationContextManager,
  getIsolationManager,
  IsolationStatus,
} from './contextIsolation'

export type {
  WorktreeConfig,
  RemoteConfig,
  IsolationContextConfig,
  IsolationResult,
  IsolationExecutionRequest,
  IsolationContextInfo,
} from './contextIsolation'
