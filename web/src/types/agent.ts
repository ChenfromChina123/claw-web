/**
 * Agent 系统前端类型定义
 * 
 * 定义前端 Agent 可视化相关的类型和接口
 */

/**
 * Agent 类型枚举
 */
export enum AgentType {
  GENERAL_PURPOSE = 'general-purpose',
  EXPLORE = 'Explore',
  PLAN = 'Plan',
  VERIFICATION = 'verification',
  CLAUDE_CODE_GUIDE = 'claude-code-guide',
  STATUSLINE_SETUP = 'statusline-setup'
}

/**
 * Agent 状态枚举
 */
export enum AgentStatus {
  IDLE = 'idle',
  THINKING = 'thinking',
  WORKING = 'working',
  COMPLETED = 'completed',
  ERROR = 'error'
}

/**
 * Agent 定义接口
 */
export interface AgentDefinition {
  /** Agent 类型 */
  agentType: AgentType
  
  /** Agent 名称 */
  name: string
  
  /** Agent 描述 */
  description: string
  
  /** 系统提示词 */
  systemPrompt: string
  
  /** 模型配置 */
  model?: string
  
  /** 工具白名单（'*' 表示所有工具） */
  tools?: string[] | '*'
  
  /** 工具黑名单 */
  disallowedTools?: string[]
  
  /** 最大轮次 */
  maxTurns?: number
  
  /** 是否后台运行 */
  background?: boolean
  
  /** 颜色标识 */
  color: string
  
  /** 图标 */
  icon: string
  
  /** 努力程度 */
  effort?: 'low' | 'medium' | 'high'
  
  /** 是否只读模式 */
  isReadOnly?: boolean
}

/**
 * Agent 运行时状态
 */
export interface AgentRuntimeState {
  /** Agent ID */
  agentId: string
  
  /** Agent 定义 */
  agentDefinition: AgentDefinition
  
  /** 当前状态 */
  status: AgentStatus
  
  /** 当前执行的任务 */
  currentTask?: string
  
  /** 已完成的任务数 */
  completedTasks: number
  
  /** 总任务数 */
  totalTasks: number
  
  /** 开始时间 */
  startTime: Date
  
  /** 最后活动时间 */
  lastActivityTime: Date
  
  /** 进度百分比（0-100） */
  progress: number
}

/**
 * Agent 任务步骤
 */
export interface AgentTaskStep {
  /** 步骤 ID */
  id: string
  
  /** Agent 类型 */
  agentType: AgentType
  
  /** 步骤描述 */
  description: string
  
  /** 状态 */
  status: 'pending' | 'active' | 'completed' | 'error'
  
  /** 开始时间 */
  startTime?: Date
  
  /** 完成时间 */
  completedTime?: Date
  
  /** 错误信息（如果有） */
  error?: string
}

/**
 * 多 Agent 协调状态
 */
export interface MultiAgentOrchestrationState {
  /** 主协调 Agent */
  orchestrator?: AgentRuntimeState
  
  /** 子 Agent 列表 */
  subAgents: AgentRuntimeState[]
  
  /** 任务步骤 */
  taskSteps: AgentTaskStep[]
  
  /** 整体状态 */
  overallStatus: 'idle' | 'planning' | 'executing' | 'completed' | 'error'
  
  /** 开始时间 */
  startTime?: Date
  
  /** 完成时间 */
  completedTime?: Date
}

/**
 * Agent 颜色配置
 */
export const AGENT_COLORS: Record<AgentType, string> = {
  [AgentType.GENERAL_PURPOSE]: '#3b82f6',
  [AgentType.EXPLORE]: '#10b981',
  [AgentType.PLAN]: '#f59e0b',
  [AgentType.VERIFICATION]: '#8b5cf6',
  [AgentType.CLAUDE_CODE_GUIDE]: '#ec4899',
  [AgentType.STATUSLINE_SETUP]: '#6366f1'
}

/**
 * Agent 图标配置
 */
export const AGENT_ICONS: Record<AgentType, string> = {
  [AgentType.GENERAL_PURPOSE]: '🤖',
  [AgentType.EXPLORE]: '🔍',
  [AgentType.PLAN]: '📋',
  [AgentType.VERIFICATION]: '✅',
  [AgentType.CLAUDE_CODE_GUIDE]: '📚',
  [AgentType.STATUSLINE_SETUP]: '⚙️'
}

/**
 * 内置 Agent 定义
 */
export const BUILT_IN_AGENTS: AgentDefinition[] = [
  {
    agentType: AgentType.GENERAL_PURPOSE,
    name: '通用 Agent',
    description: '处理各种复杂的多步骤任务',
    systemPrompt: '',
    color: AGENT_COLORS[AgentType.GENERAL_PURPOSE],
    icon: AGENT_ICONS[AgentType.GENERAL_PURPOSE],
    effort: 'medium'
  },
  {
    agentType: AgentType.EXPLORE,
    name: '探索 Agent',
    description: '快速代码库探索和搜索（只读模式）',
    systemPrompt: '',
    color: AGENT_COLORS[AgentType.EXPLORE],
    icon: AGENT_ICONS[AgentType.EXPLORE],
    effort: 'low',
    isReadOnly: true
  },
  {
    agentType: AgentType.PLAN,
    name: '规划 Agent',
    description: '任务规划和方案设计（只读模式）',
    systemPrompt: '',
    color: AGENT_COLORS[AgentType.PLAN],
    icon: AGENT_ICONS[AgentType.PLAN],
    effort: 'medium',
    isReadOnly: true
  },
  {
    agentType: AgentType.VERIFICATION,
    name: '验证 Agent',
    description: '代码验证和质量检查',
    systemPrompt: '',
    color: AGENT_COLORS[AgentType.VERIFICATION],
    icon: AGENT_ICONS[AgentType.VERIFICATION],
    effort: 'high'
  },
  {
    agentType: AgentType.CLAUDE_CODE_GUIDE,
    name: 'Claude Code 指南',
    description: '提供使用指导',
    systemPrompt: '',
    color: AGENT_COLORS[AgentType.CLAUDE_CODE_GUIDE],
    icon: AGENT_ICONS[AgentType.CLAUDE_CODE_GUIDE],
    effort: 'low'
  },
  {
    agentType: AgentType.STATUSLINE_SETUP,
    name: '状态栏设置',
    description: '配置和自定义状态栏',
    systemPrompt: '',
    color: AGENT_COLORS[AgentType.STATUSLINE_SETUP],
    icon: AGENT_ICONS[AgentType.STATUSLINE_SETUP],
    effort: 'low'
  }
]

/**
 * 根据 Agent 类型获取定义
 */
export function getAgentDefinition(agentType: AgentType): AgentDefinition | undefined {
  return BUILT_IN_AGENTS.find(agent => agent.agentType === agentType)
}

/**
 * 创建初始的多 Agent 协调状态
 */
export function createInitialOrchestrationState(): MultiAgentOrchestrationState {
  return {
    subAgents: [],
    taskSteps: [],
    overallStatus: 'idle'
  }
}

/**
 * 创建 Agent 运行时状态
 */
export function createAgentRuntimeState(
  agentDefinition: AgentDefinition
): AgentRuntimeState {
  const now = new Date()
  return {
    agentId: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    agentDefinition,
    status: AgentStatus.IDLE,
    completedTasks: 0,
    totalTasks: 0,
    startTime: now,
    lastActivityTime: now,
    progress: 0
  }
}
