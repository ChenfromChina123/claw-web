/**
 * Agent 注册表 - 管理所有活跃的 Agent 实例
 * 
 * 阶段四: 多 Agent 协作
 * 
 * 功能:
 * - Agent 实例注册和追踪
 * - Agent 状态查询
 * - Agent 取消和清理
 * - Fork 检测
 */

import { randomUUID } from 'crypto'
import type { AgentDefinition, AgentStatus } from './types'

/**
 * Agent 运行时状态
 */
export interface AgentRuntimeState {
  agentId: string
  agentDefinition: AgentDefinition
  status: 'created' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'
  parentAgentId?: string
  teamName?: string
  memberName?: string
  createdAt: Date
  lastActivityAt: Date
  abortController: AbortController
  messageHistory: AgentMessage[]
  result?: string
  error?: string
}

/**
 * Agent 消息
 */
export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  fromAgentId?: string
}

/**
 * 运行时进度回调
 */
export type ProgressCallback = (progress: AgentProgress) => void

/**
 * Agent 进度信息
 */
export interface AgentProgress {
  agentId: string
  status: AgentRuntimeState['status']
  currentTurn: number
  maxTurns: number
  message?: string
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>
  toolResults?: Array<{ name: string; success: boolean; result?: unknown; error?: string }>
}

/**
 * Agent 注册表类
 */
export class AgentRegistry {
  private static instance: AgentRegistry
  private agents: Map<string, AgentRuntimeState> = new Map()
  private abortControllers: Map<string, AbortController> = new Map()
  private progressCallbacks: Map<string, Set<ProgressCallback>> = new Map()

  private constructor() {
    // 私有构造函数，实现单例
  }

  /**
   * 获取单例实例
   */
  static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry()
    }
    return AgentRegistry.instance
  }

  /**
   * 注册新的 Agent 实例
   */
  register(params: {
    agentDefinition: AgentDefinition
    parentAgentId?: string
    teamName?: string
    memberName?: string
    maxTurns?: number
  }): AgentRuntimeState {
    const agentId = `agent_${randomUUID().slice(0, 8)}`
    const abortController = new AbortController()

    const state: AgentRuntimeState = {
      agentId,
      agentDefinition: params.agentDefinition,
      status: 'created',
      parentAgentId: params.parentAgentId,
      teamName: params.teamName,
      memberName: params.memberName,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      abortController,
      messageHistory: [],
    }

    this.agents.set(agentId, state)
    this.abortControllers.set(agentId, abortController)
    this.progressCallbacks.set(agentId, new Set())

    console.log(`[AgentRegistry] 注册新 Agent: ${agentId} (类型: ${params.agentDefinition.agentType})`)
    return state
  }

  /**
   * 获取 Agent 运行时状态
   */
  getAgent(agentId: string): AgentRuntimeState | undefined {
    return this.agents.get(agentId)
  }

  /**
   * 获取所有活跃的 Agent
   */
  getActiveAgents(): AgentRuntimeState[] {
    return Array.from(this.agents.values()).filter(
      a => a.status === 'running' || a.status === 'waiting' || a.status === 'created'
    )
  }

  /**
   * 按团队名称获取 Agent
   */
  getAgentsByTeam(teamName: string): AgentRuntimeState[] {
    return Array.from(this.agents.values()).filter(a => a.teamName === teamName)
  }

  /**
   * 按成员名称获取 Agent (团队模式)
   */
  getAgentByMemberName(teamName: string, memberName: string): AgentRuntimeState | undefined {
    return Array.from(this.agents.values()).find(
      a => a.teamName === teamName && a.memberName === memberName
    )
  }

  /**
   * 检查 Agent 是否存在
   */
  hasAgent(agentId: string): boolean {
    return this.agents.has(agentId)
  }

  /**
   * 检查 Agent 是否支持继续执行 (非 One-shot)
   */
  canContinueAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) return false

    const oneShotTypes = ['Explore', 'Plan', 'claude-code-guide', 'statusline-setup']
    return !oneShotTypes.includes(agent.agentDefinition.agentType)
  }

  /**
   * 检查 Agent 是否可以 Fork
   */
  canFork(agentId: string): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) return false

    // One-shot Agent 不可 Fork
    const oneShotTypes = ['Explore', 'Plan', 'claude-code-guide', 'statusline-setup']
    if (oneShotTypes.includes(agent.agentDefinition.agentType)) {
      return false
    }

    // 检查是否已经是 Fork 的 Agent
    if (agent.parentAgentId) {
      // Fork 的 Agent 不能再 Fork (防止递归)
      return false
    }

    return true
  }

  /**
   * 更新 Agent 状态
   */
  updateStatus(agentId: string, status: AgentRuntimeState['status'], error?: string): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.status = status
      agent.lastActivityAt = new Date()
      if (error) {
        agent.error = error
      }
    }
  }

  /**
   * 添加消息到历史
   */
  addMessage(agentId: string, message: Omit<AgentMessage, 'id' | 'timestamp'>): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.messageHistory.push({
        ...message,
        id: randomUUID(),
        timestamp: new Date(),
      })
      agent.lastActivityAt = new Date()
    }
  }

  /**
   * 获取消息历史
   */
  getMessageHistory(agentId: string): AgentMessage[] {
    const agent = this.agents.get(agentId)
    return agent?.messageHistory || []
  }

  /**
   * 设置执行结果
   */
  setResult(agentId: string, result: string): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.result = result
      agent.status = 'completed'
      agent.lastActivityAt = new Date()
    }
  }

  /**
   * 设置执行错误
   */
  setError(agentId: string, error: string): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.error = error
      agent.status = 'failed'
      agent.lastActivityAt = new Date()
    }
  }

  /**
   * 订阅进度回调
   */
  subscribeProgress(agentId: string, callback: ProgressCallback): () => void {
    const callbacks = this.progressCallbacks.get(agentId)
    if (callbacks) {
      callbacks.add(callback)
    }
    return () => {
      callbacks?.delete(callback)
    }
  }

  /**
   * 通知进度更新
   */
  notifyProgress(progress: AgentProgress): void {
    const callbacks = this.progressCallbacks.get(progress.agentId)
    if (callbacks) {
      callbacks.forEach(cb => cb(progress))
    }
  }

  /**
   * 请求取消 Agent
   */
  requestAbort(agentId: string): boolean {
    const controller = this.abortControllers.get(agentId)
    if (controller) {
      controller.abort()
      this.updateStatus(agentId, 'cancelled')
      return true
    }
    return false
  }

  /**
   * 获取 AbortController
   */
  getAbortController(agentId: string): AbortController | undefined {
    return this.abortControllers.get(agentId)
  }

  /**
   * 取消注册 Agent
   */
  unregister(agentId: string): boolean {
    const agent = this.agents.get(agentId)
    if (agent) {
      console.log(`[AgentRegistry] 取消注册 Agent: ${agentId}`)
      this.agents.delete(agentId)
      this.abortControllers.delete(agentId)
      this.progressCallbacks.delete(agentId)
      return true
    }
    return false
  }

  /**
   * 清理所有已完成的 Agent
   */
  cleanupCompleted(maxAgeMs: number = 60000): number {
    const now = Date.now()
    let cleaned = 0

    for (const [agentId, agent] of this.agents) {
      const age = now - agent.lastActivityAt.getTime()
      if (age > maxAgeMs && (agent.status === 'completed' || agent.status === 'failed' || agent.status === 'cancelled')) {
        this.unregister(agentId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[AgentRegistry] 清理了 ${cleaned} 个已完成的 Agent`)
    }
    return cleaned
  }

  /**
   * 获取状态摘要
   */
  getStatusSummary(): {
    total: number
    running: number
    waiting: number
    completed: number
    failed: number
    cancelled: number
  } {
    const states = Array.from(this.agents.values()).reduce(
      (acc, agent) => {
        acc[agent.status]++
        acc.total++
        return acc
      },
      { total: 0, created: 0, running: 0, waiting: 0, completed: 0, failed: 0, cancelled: 0 }
    )

    return {
      total: states.total,
      running: states.running,
      waiting: states.waiting,
      completed: states.completed,
      failed: states.failed,
      cancelled: states.cancelled,
    }
  }

  /**
   * 获取 Agent 详细信息
   */
  getAgentInfo(agentId: string): {
    agentId: string
    agentType: string
    status: string
    parentAgentId?: string
    teamName?: string
    memberName?: string
    createdAt: Date
    lastActivityAt: Date
    messageCount: number
    hasError: boolean
  } | undefined {
    const agent = this.agents.get(agentId)
    if (!agent) return undefined

    return {
      agentId: agent.agentId,
      agentType: agent.agentDefinition.agentType,
      status: agent.status,
      parentAgentId: agent.parentAgentId,
      teamName: agent.teamName,
      memberName: agent.memberName,
      createdAt: agent.createdAt,
      lastActivityAt: agent.lastActivityAt,
      messageCount: agent.messageHistory.length,
      hasError: !!agent.error,
    }
  }
}

/**
 * 获取 Agent 注册表单例
 */
export function getAgentRegistry(): AgentRegistry {
  return AgentRegistry.getInstance()
}
