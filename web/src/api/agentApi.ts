/**
 * Agent API 服务
 * 
 * 提供前端与后端 Agent 系统的完整交互接口
 */

import client from './client'
import type { AgentType } from '@/types/agent'

// ==================== 类型定义 ====================

/**
 * Agent 执行请求
 */
export interface AgentExecuteRequest {
  /** 任务描述 */
  task: string
  /** Agent 类型 */
  agentType?: string
  /** 模型 */
  model?: string
  /** 权限模式 */
  permissionMode?: 'bypassPermissions' | 'acceptEdits' | 'auto' | 'plan'
  /** 最大轮次 */
  maxTurns?: number
  /** 工作目录 */
  cwd?: string
  /** 是否异步执行 */
  runInBackground?: boolean
}

/**
 * Agent 执行响应
 */
export interface AgentExecuteResponse {
  success: boolean
  agentId: string
  traceId: string
  status: 'launched' | 'completed' | 'error'
  message?: string
  error?: string
}

/**
 * Agent 状态
 */
export interface AgentStateResponse {
  agentId: string
  traceId: string
  status: 'idle' | 'thinking' | 'working' | 'completed' | 'failed'
  currentTask?: string
  progress?: number
  workflowSteps?: Array<{
    id: string
    status: string
    actionType: string
    message: string
    createdAt: number
    completedAt?: number
  }>
}

/**
 * 团队创建请求
 */
export interface TeamCreateRequest {
  teamName: string
  description?: string
  orchestratorType?: string
}

/**
 * 团队成员
 */
export interface TeamMember {
  memberId: string
  memberName: string
  agentType: string
  role: string
  status: string
  currentTask?: string
}

/**
 * 团队状态
 */
export interface TeamStateResponse {
  teamId: string
  teamName: string
  members: TeamMember[]
  overallStatus: string
  progress?: {
    totalTasks: number
    completedTasks: number
    failedTasks: number
  }
}

/**
 * 任务分解请求
 */
export interface TaskDecomposeRequest {
  task: string
  projectContext?: {
    codebase: string
    language?: string
    framework?: string
    mainFiles?: string[]
  }
  preferences?: {
    mode?: 'sequential' | 'parallel' | 'pipeline' | 'hybrid'
    maxTasks?: number
    preferParallel?: boolean
  }
}

/**
 * 子任务
 */
export interface SubTask {
  taskId: string
  title: string
  description: string
  agentType: string
  priority: number
  dependsOn: string[]
  instructions: string
  acceptanceCriteria?: string[]
}

/**
 * 分解结果
 */
export interface TaskDecomposeResponse {
  success: boolean
  originalTask: string
  subTasks: SubTask[]
  executionPlan: {
    mode: string
    estimatedDuration: number
    parallelGroups: string[][]
  }
  summary: {
    totalTasks: number
    parallelTasks: number
    sequentialTasks: number
  }
  error?: string
}

/**
 * 隔离上下文创建请求
 */
export interface IsolationCreateRequest {
  name: string
  mode: 'worktree' | 'remote'
  description?: string
  worktree?: {
    mainRepoPath: string
    worktreeName: string
    branchName?: string
  }
  remote?: {
    type: 'ssh' | 'docker'
    connection: {
      host?: string
      user?: string
      keyPath?: string
    }
    container?: {
      image: string
    }
  }
}

/**
 * 隔离上下文状态
 */
export interface IsolationStateResponse {
  isolationId: string
  name: string
  mode: string
  status: 'initializing' | 'ready' | 'running' | 'paused' | 'terminated'
  workingDirectory: string
  createdAt: string
  lastActivity: string
}

// ==================== API 函数 ====================

/**
 * Agent API 对象 - 整合所有 Agent 相关 API 函数
 */
export const agentApi = {
  getAgentTypes,
  getAgentDefinition,
  executeAgent,
  getAgentState,
  getOrchestrationState,
  initializeOrchestration,
  decomposeTask,
  createTeam,
  getTeamState,
  addTeamMember,
  addTeamTask,
  assignTask,
  createIsolation,
  getIsolationState,
  executeInIsolation,
  destroyIsolation,
  listIsolations,
}

/**
 * 获取所有可用的 Agent 类型
 */
export async function getAgentTypes(): Promise<AgentType[]> {
  const response = await client.get('/api/agents')
  return response.data
}

/**
 * 获取指定类型的 Agent 定义
 */
export async function getAgentDefinition(type: string): Promise<AgentDefinition> {
  const response = await client.get(`/api/agents/${type}`)
  return response.data
}

/**
 * 执行 Agent 任务
 */
export async function executeAgent(request: AgentExecuteRequest): Promise<AgentExecuteResponse> {
  const response = await client.post('/api/agents/execute', request)
  return response.data
}

/**
 * 获取 Agent 状态
 */
export async function getAgentState(traceId: string, agentId: string): Promise<AgentStateResponse> {
  const response = await client.get(`/api/agents/${agentId}/state`, {
    params: { traceId }
  })
  return response.data
}

/**
 * 获取 Agent 编排状态
 */
export async function getOrchestrationState(): Promise<MultiAgentOrchestrationState> {
  const response = await client.get('/api/agents/orchestration/state')
  return response.data
}

/**
 * 初始化 Agent 编排
 */
export async function initializeOrchestration(
  orchestratorType: string,
  subAgentTypes: string[]
): Promise<MultiAgentOrchestrationState> {
  const response = await client.post('/api/agents/orchestration/init', {
    orchestratorType,
    subAgentTypes
  })
  return response.data
}

/**
 * 分解任务
 */
export async function decomposeTask(request: TaskDecomposeRequest): Promise<TaskDecomposeResponse> {
  const response = await client.post('/api/agents/decompose', request)
  return response.data
}

/**
 * 创建团队
 */
export async function createTeam(request: TeamCreateRequest): Promise<TeamStateResponse> {
  const response = await client.post('/api/teams', request)
  return response.data
}

/**
 * 获取团队状态
 */
export async function getTeamState(teamId: string): Promise<TeamStateResponse> {
  const response = await client.get(`/api/teams/${teamId}`)
  return response.data
}

/**
 * 添加团队成员
 */
export async function addTeamMember(
  teamId: string,
  member: { memberName: string; agentType: string; role: string }
): Promise<TeamMember> {
  const response = await client.post(`/api/teams/${teamId}/members`, member)
  return response.data
}

/**
 * 添加团队任务
 */
export async function addTeamTask(
  teamId: string,
  task: { title: string; description: string; priority?: number }
): Promise<{ taskId: string }> {
  const response = await client.post(`/api/teams/${teamId}/tasks`, task)
  return response.data
}

/**
 * 分配任务
 */
export async function assignTask(
  teamId: string,
  taskId: string,
  memberId?: string
): Promise<{ success: boolean; error?: string }> {
  const response = await client.post(`/api/teams/${teamId}/tasks/${taskId}/assign`, {
    memberId
  })
  return response.data
}

/**
 * 创建隔离上下文
 */
export async function createIsolation(request: IsolationCreateRequest): Promise<IsolationStateResponse> {
  const response = await client.post('/api/agents/isolation', request)
  return response.data
}

/**
 * 获取隔离上下文状态
 */
export async function getIsolationState(isolationId: string): Promise<IsolationStateResponse> {
  const response = await client.get(`/api/agents/isolation/${isolationId}`)
  return response.data
}

/**
 * 在隔离上下文中执行命令
 */
export async function executeInIsolation(
  isolationId: string,
  command: string,
  args?: string[]
): Promise<{ success: boolean; output?: string; error?: string; duration: number }> {
  const response = await client.post(`/api/agents/isolation/${isolationId}/execute`, {
    command,
    args
  })
  return response.data
}

/**
 * 销毁隔离上下文
 */
export async function destroyIsolation(isolationId: string): Promise<{ success: boolean }> {
  const response = await client.delete(`/api/agents/isolation/${isolationId}`)
  return response.data
}

/**
 * 获取所有隔离上下文
 */
export async function listIsolations(): Promise<IsolationStateResponse[]> {
  const response = await client.get('/api/agents/isolation')
  return response.data
}

// ==================== 导出类型 ====================

interface AgentDefinition {
  agentType: string
  name: string
  description: string
  color: string
  icon: string
}

interface MultiAgentOrchestrationState {
  orchestrator?: AgentStateResponse
  subAgents: AgentStateResponse[]
  taskSteps: Array<{
    id: string
    agentType: string
    description: string
    status: string
  }>
  overallStatus: string
}

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
}
