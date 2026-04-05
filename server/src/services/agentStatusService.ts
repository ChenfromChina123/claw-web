/**
 * Agent 状态推送服务
 * 
 * 提供 Agent 执行状态的实时 WebSocket 推送功能：
 * - Agent 执行状态更新
 * - 工具调用实时推送
 * - 任务进度更新
 * - 团队成员状态同步
 */

import { EventEmitter } from 'events'
import type { WebSocketData } from '../index'
import type { AgentRuntimeState, AgentProgress } from '../agents/agentRegistry'
import type { ToolCall } from '../integration/webStore'

/**
 * Agent 执行状态接口（前端格式）
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
 * 工具调用记录（前端格式）
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
 * 团队成员（前端格式）
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
 * Agent 选择（前端格式）
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
 * WebSocket 推送发送函数
 */
export type WSPushFn = (clientId: string, data: {
  type: string
  payload: unknown
  timestamp: string
}) => void

/**
 * Agent 状态服务配置
 */
export interface AgentStatusServiceConfig {
  /** WebSocket 推送函数 */
  wsPush?: WSPushFn
  /** 刷新间隔（毫秒） */
  refreshInterval?: number
}

/**
 * Agent 状态服务
 */
export class AgentStatusService extends EventEmitter {
  private wsPush: WSPushFn | null = null
  private refreshInterval: number = 5000
  private statusCache: Map<string, AgentStatusSnapshot> = new Map()
  private refreshTimer: NodeJS.Timeout | null = null

  constructor(config?: AgentStatusServiceConfig) {
    super()
    if (config?.wsPush) {
      this.wsPush = config.wsPush
    }
    if (config?.refreshInterval) {
      this.refreshInterval = config.refreshInterval
    }
  }

  /**
   * 启动定时刷新
   */
  startAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
    }
    this.refreshTimer = setInterval(() => {
      this.broadcastStatus()
    }, this.refreshInterval)
    console.log('[AgentStatusService] 已启动自动刷新，间隔:', this.refreshInterval, 'ms')
  }

  /**
   * 停止定时刷新
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
      console.log('[AgentStatusService] 已停止自动刷新')
    }
  }

  /**
   * 广播状态到所有客户端
   */
  private broadcastStatus(): void {
    if (!this.wsPush) return

    const snapshots = Array.from(this.statusCache.values())
    this.wsPush('broadcast', {
      type: 'agent_status_update',
      payload: { snapshots },
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * 更新 Agent 执行状态
   */
  updateExecutionStatus(
    agentId: string,
    status: Partial<AgentExecutionStatus>
  ): void {
    const snapshot = this.getOrCreateSnapshot(agentId)
    
    if (status.status !== undefined) {
      snapshot.executionStatus.status = status.status
    }
    if (status.currentTurn !== undefined) {
      snapshot.executionStatus.currentTurn = status.currentTurn
    }
    if (status.maxTurns !== undefined) {
      snapshot.executionStatus.maxTurns = status.maxTurns
    }
    if (status.progress !== undefined) {
      snapshot.executionStatus.progress = status.progress
    }
    if (status.message !== undefined) {
      snapshot.executionStatus.message = status.message
    }
    
    snapshot.updatedAt = new Date()
    this.statusCache.set(agentId, snapshot)
    this.emit('status_updated', snapshot)
    
    // 推送到客户端
    this.pushStatusUpdate(agentId, snapshot)
  }

  /**
   * 添加工具调用
   */
  addToolCall(agentId: string, toolCall: ToolCallRecord): void {
    const snapshot = this.getOrCreateSnapshot(agentId)
    snapshot.toolCalls.push(toolCall)
    snapshot.updatedAt = new Date()
    this.statusCache.set(agentId, snapshot)
    this.emit('tool_call_added', { agentId, toolCall })
    
    this.pushStatusUpdate(agentId, snapshot)
  }

  /**
   * 更新工具调用状态
   */
  updateToolCall(
    agentId: string,
    toolId: string,
    updates: Partial<ToolCallRecord>
  ): void {
    const snapshot = this.statusCache.get(agentId)
    if (!snapshot) return

    const index = snapshot.toolCalls.findIndex(tc => tc.toolId === toolId)
    if (index === -1) return

    snapshot.toolCalls[index] = {
      ...snapshot.toolCalls[index],
      ...updates,
    }
    
    snapshot.updatedAt = new Date()
    this.statusCache.set(agentId, snapshot)
    this.emit('tool_call_updated', { agentId, toolId, updates })
    
    this.pushStatusUpdate(agentId, snapshot)
  }

  /**
   * 设置团队成员
   */
  setTeamMembers(agentId: string, members: TeamMember[]): void {
    const snapshot = this.getOrCreateSnapshot(agentId)
    snapshot.teamMembers = members
    snapshot.updatedAt = new Date()
    this.statusCache.set(agentId, snapshot)
    this.emit('team_members_updated', { agentId, members })
    
    this.pushStatusUpdate(agentId, snapshot)
  }

  /**
   * 获取 Agent 状态快照
   */
  getSnapshot(agentId: string): AgentStatusSnapshot | undefined {
    return this.statusCache.get(agentId)
  }

  /**
   * 获取所有 Agent 状态
   */
  getAllSnapshots(): AgentStatusSnapshot[] {
    return Array.from(this.statusCache.values())
  }

  /**
   * 清除 Agent 状态
   */
  clearSnapshot(agentId: string): void {
    this.statusCache.delete(agentId)
    this.emit('status_cleared', agentId)
  }

  /**
   * 获取或创建快照
   */
  private getOrCreateSnapshot(agentId: string): AgentStatusSnapshot {
    let snapshot = this.statusCache.get(agentId)
    if (!snapshot) {
      snapshot = {
        agentId,
        executionStatus: {
          status: 'idle',
          currentTurn: 0,
          maxTurns: 100,
          progress: 0,
        },
        toolCalls: [],
        teamMembers: [],
        updatedAt: new Date(),
      }
      this.statusCache.set(agentId, snapshot)
    }
    return snapshot
  }

  /**
   * 推送状态更新到客户端
   */
  private pushStatusUpdate(agentId: string, snapshot: AgentStatusSnapshot): void {
    if (!this.wsPush) return

    this.wsPush('broadcast', {
      type: 'agent_status_update',
      payload: {
        agentId,
        executionStatus: snapshot.executionStatus,
        toolCalls: snapshot.toolCalls,
        teamMembers: snapshot.teamMembers,
      },
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * 从 AgentRegistry 同步状态
   */
  syncFromAgentRuntime(runtimeState: AgentRuntimeState): void {
    const snapshot = this.getOrCreateSnapshot(runtimeState.agentId)
    
    // 映射运行时状态到前端状态
    const statusMap: Record<string, string> = {
      created: 'starting',
      running: 'running',
      waiting: 'running',
      completed: 'completed',
      failed: 'error',
      cancelled: 'cancelled',
    }
    
    snapshot.executionStatus.status = statusMap[runtimeState.status] || 'idle'
    snapshot.updatedAt = new Date()
    
    this.statusCache.set(runtimeState.agentId, snapshot)
    this.emit('synced_from_runtime', snapshot)
  }

  /**
   * 从 ToolCall 同步工具调用
   */
  syncFromToolCall(toolCall: ToolCall): void {
    const statusMap: Record<string, 'pending' | 'executing' | 'completed' | 'failed'> = {
      pending: 'pending',
      executing: 'executing',
      completed: 'completed',
      error: 'failed',
    }

    const toolCallRecord: ToolCallRecord = {
      toolName: toolCall.name,
      status: statusMap[toolCall.status] || 'pending',
      toolId: toolCall.id,
      input: toolCall.input,
      output: toolCall.output,
      error: toolCall.error,
    }

    // 查找对应的 Agent（如果有 sessionId 等信息）
    // 这里简化处理，添加到最近的 Agent
    const snapshots = Array.from(this.statusCache.values())
    if (snapshots.length > 0) {
      const latest = snapshots[snapshots.length - 1]
      this.addToolCall(latest.agentId, toolCallRecord)
    }
  }

  /**
   * 获取可用的 Agent 类型（前端格式）
   */
  getAvailableAgentTypes(): AgentSelection[] {
    const { getBuiltInAgents } = require('../agents/builtInAgents')
    const agents = getBuiltInAgents()
    
    return agents.map(agent => ({
      agentType: agent.agentType,
      agentName: agent.agentType,
      agentDescription: agent.description || agent.whenToUse || '',
      icon: agent.icon,
      color: agent.color,
    }))
  }
}

// 单例实例
let agentStatusServiceInstance: AgentStatusService | null = null

/**
 * 获取 Agent 状态服务实例
 */
export function getAgentStatusService(): AgentStatusService {
  if (!agentStatusServiceInstance) {
    agentStatusServiceInstance = new AgentStatusService()
  }
  return agentStatusServiceInstance
}

/**
 * 创建新的 Agent 状态服务实例（用于测试）
 */
export function createAgentStatusService(config?: AgentStatusServiceConfig): AgentStatusService {
  return new AgentStatusService(config)
}
