/**
 * Agent 状态面板相关类型定义
 * 
 * 用于前端 AgentStatusPanel 组件与后端 AgentStatusService 的数据交互
 */

/**
 * Agent 执行状态
 */
export interface AgentExecutionStatus {
  /** 状态：idle | starting | running | completed | error | cancelled */
  status: string
  /** 当前轮次 */
  currentTurn: number
  /** 最大轮次 */
  maxTurns: number
  /** 进度百分比 (0-100) */
  progress: number
  /** 状态消息 */
  message?: string
}

/**
 * 工具调用记录
 */
export interface ToolCallRecord {
  /** 工具名称 */
  toolName: string
  /** 执行状态 */
  status: 'pending' | 'executing' | 'completed' | 'failed'
  /** 工具 ID */
  toolId?: string
  /** 输入参数 */
  input?: Record<string, unknown>
  /** 输出结果 */
  output?: unknown
  /** 错误信息 */
  error?: string
}

/**
 * 团队成员
 */
export interface TeamMember {
  /** 成员 ID */
  id: string
  /** 成员名称 */
  name: string
  /** Agent 类型 */
  agentType: string
  /** 颜色 */
  color?: string
  /** 状态 */
  status: 'idle' | 'working' | 'completed'
}

/**
 * Agent 选择
 */
export interface AgentSelection {
  /** Agent 类型 */
  agentType: string
  /** Agent 名称 */
  agentName: string
  /** Agent 描述 */
  agentDescription: string
  /** 图标 */
  icon?: string
  /** 颜色 */
  color?: string
}

/**
 * Agent 状态快照
 */
export interface AgentStatusSnapshot {
  /** Agent ID */
  agentId: string
  /** 执行状态 */
  executionStatus: AgentExecutionStatus
  /** 工具调用列表 */
  toolCalls: ToolCallRecord[]
  /** 团队成员 */
  teamMembers: TeamMember[]
  /** 更新时间 */
  updatedAt: Date
}

/**
 * WebSocket 推送的 Agent 状态更新
 */
export interface AgentStatusUpdate {
  /** Agent ID */
  agentId?: string
  /** 执行状态 */
  executionStatus?: AgentExecutionStatus
  /** 工具调用列表 */
  toolCalls?: ToolCallRecord[]
  /** 团队成员 */
  teamMembers?: TeamMember[]
  /** 快照列表（批量更新时） */
  snapshots?: AgentStatusSnapshot[]
}
