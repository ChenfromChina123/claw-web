/**
 * Agent API 服务
 * 
 * 封装后端 Agent 系统的 API 调用
 */

const API_BASE_URL = 'http://localhost:3000'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

/**
 * Agent 基本信息
 */
export interface AgentInfo {
  agentType: string
  name: string
  description: string
  whenToUse?: string
  icon?: string
  color?: string
  isReadOnly?: boolean
  model?: string
  source: string
  tools?: string[]
  disallowedTools?: string[]
}

/**
 * 多 Agent 协调状态
 */
export interface MultiAgentOrchestrationState {
  orchestrator?: AgentInstance
  subAgents: AgentInstance[]
  taskSteps: TaskStep[]
  overallStatus: 'idle' | 'executing' | 'completed' | 'error'
  startTime?: string
  completionTime?: string
  error?: string
}

/**
 * Agent 实例
 */
export interface AgentInstance {
  agentId: string
  agentDefinition: AgentInfo
  status: 'idle' | 'working' | 'completed' | 'error' | 'paused'
  currentTask?: string
  completedTasks: number
  totalTasks: number
  startTime: string
  lastActivityTime: string
  progress: number
  error?: string
}

/**
 * 任务步骤
 */
export interface TaskStep {
  id: string
  agentType: string
  description: string
  status: 'pending' | 'active' | 'completed' | 'error'
  startTime?: string
  completedTime?: string
  error?: string
}

/**
 * Agent 执行请求
 */
export interface AgentExecuteRequest {
  agentId: string
  sessionId: string
  task: string
  prompt: string
  tools: string[]
  maxTurns?: number
}

/**
 * Agent 执行结果
 */
export interface AgentExecuteResult {
  agentId: string
  status: 'completed' | 'error' | 'async_launched'
  content: string
  durationMs: number
  totalTokens?: number
  error?: string
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    return await response.json()
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : '网络请求失败',
      },
    }
  }
}

export const agentApi = {
  /**
   * 获取所有可用 Agent 列表
   */
  async getAgents(): Promise<ApiResponse<{ agents: AgentInfo[]; count: number }>> {
    return request('/api/agents', {
      method: 'GET',
    })
  },

  /**
   * 获取特定 Agent 详情
   */
  async getAgent(agentType: string): Promise<ApiResponse<AgentInfo>> {
    return request(`/api/agents/${agentType}`, {
      method: 'GET',
    })
  },

  /**
   * 获取多 Agent 协调状态
   */
  async getOrchestrationState(): Promise<ApiResponse<MultiAgentOrchestrationState>> {
    return request('/api/agents/orchestration/state', {
      method: 'GET',
    })
  },

  /**
   * 初始化多 Agent 协调
   */
  async initOrchestration(orchestratorType?: string, subAgentTypes?: string[]): Promise<ApiResponse<MultiAgentOrchestrationState>> {
    return request('/api/agents/orchestration/init', {
      method: 'POST',
      body: JSON.stringify({ orchestratorType, subAgentTypes }),
    })
  },

  /**
   * 执行 Agent 任务
   */
  async executeAgent(data: AgentExecuteRequest): Promise<ApiResponse<AgentExecuteResult>> {
    return request('/api/agents/execute', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

export type { AgentInfo, MultiAgentOrchestrationState, AgentInstance, TaskStep, AgentExecuteRequest, AgentExecuteResult }
