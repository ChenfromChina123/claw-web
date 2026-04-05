/**
 * 工作流事件服务
 * 
 * 负责将 Agent 执行事件推送到前端，支持可视化展示
 */

import { v4 as uuidv4 } from 'uuid'

// 工作流事件类型
export type WorkflowEventType =
  | 'agent_started'
  | 'agent_thinking'
  | 'agent_tool_call'
  | 'agent_tool_result'
  | 'agent_message'
  | 'agent_completed'
  | 'agent_failed'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'subagent_spawned'
  | 'workflow_updated'

// 工作流事件数据结构
export interface WorkflowEvent {
  id: string
  type: WorkflowEventType
  timestamp: string
  traceId: string
  agentId: string
  agentType: string
  agentName: string
  parentAgentId?: string
  payload: Record<string, unknown>
}

// 工作流事件推送函数类型
export type WorkflowEventPushFn = (event: WorkflowEvent) => void

/**
 * 工作流事件服务类
 */
class WorkflowEventService {
  private pushFn: WorkflowEventPushFn | null = null
  private activeTraces: Map<string, Set<string>> = new Map() // traceId -> Set<agentId>

  /**
   * 设置推送函数
   */
  setPushFn(pushFn: WorkflowEventPushFn): void {
    this.pushFn = pushFn
  }

  /**
   * 推送工作流事件
   */
  pushEvent(event: Omit<WorkflowEvent, 'id' | 'timestamp'>): void {
    if (!this.pushFn) {
      return
    }

    const fullEvent: WorkflowEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...event,
    }

    // 跟踪活跃的 trace 和 agent
    if (!this.activeTraces.has(event.traceId)) {
      this.activeTraces.set(event.traceId, new Set())
    }
    this.activeTraces.get(event.traceId)!.add(event.agentId)

    this.pushFn(fullEvent)
  }

  /**
   * 创建便捷的事件推送方法
   */
  createEventEmitter(traceId: string, agentId: string, agentType: string, agentName: string, parentAgentId?: string) {
    return {
      /**
       * Agent 开始执行
       */
      agentStarted: (message?: string) => {
        this.pushEvent({
          type: 'agent_started',
          traceId,
          agentId,
          agentType,
          agentName,
          parentAgentId,
          payload: { message: message || 'Agent 开始执行' },
        })
      },

      /**
       * Agent 思考中
       */
      agentThinking: (message: string) => {
        this.pushEvent({
          type: 'agent_thinking',
          traceId,
          agentId,
          agentType,
          agentName,
          parentAgentId,
          payload: { message },
        })
      },

      /**
       * Agent 调用工具
       */
      agentToolCall: (toolName: string, input: Record<string, unknown>) => {
        this.pushEvent({
          type: 'agent_tool_call',
          traceId,
          agentId,
          agentType,
          agentName,
          parentAgentId,
          payload: { toolName, input },
        })
      },

      /**
       * Agent 工具结果
       */
      agentToolResult: (toolName: string, success: boolean, result?: unknown, error?: string) => {
        this.pushEvent({
          type: 'agent_tool_result',
          traceId,
          agentId,
          agentType,
          agentName,
          parentAgentId,
          payload: { toolName, success, result, error },
        })
      },

      /**
       * Agent 发送消息
       */
      agentMessage: (message: string) => {
        this.pushEvent({
          type: 'agent_message',
          traceId,
          agentId,
          agentType,
          agentName,
          parentAgentId,
          payload: { message },
        })
      },

      /**
       * Agent 完成
       */
      agentCompleted: (result?: string) => {
        this.pushEvent({
          type: 'agent_completed',
          traceId,
          agentId,
          agentType,
          agentName,
          parentAgentId,
          payload: { result: result || 'Agent 执行完成' },
        })
      },

      /**
       * Agent 失败
       */
      agentFailed: (error: string) => {
        this.pushEvent({
          type: 'agent_failed',
          traceId,
          agentId,
          agentType,
          agentName,
          parentAgentId,
          payload: { error },
        })
      },

      /**
       * 步骤开始
       */
      stepStarted: (stepId: string, label: string, icon?: string) => {
        this.pushEvent({
          type: 'step_started',
          traceId,
          agentId,
          agentType,
          agentName,
          parentAgentId,
          payload: { stepId, label, icon },
        })
      },

      /**
       * 步骤完成
       */
      stepCompleted: (stepId: string, label: string, result?: unknown) => {
        this.pushEvent({
          type: 'step_completed',
          traceId,
          agentId,
          agentType,
          agentName,
          parentAgentId,
          payload: { stepId, label, result },
        })
      },

      /**
       * 步骤失败
       */
      stepFailed: (stepId: string, label: string, error: string) => {
        this.pushEvent({
          type: 'step_failed',
          traceId,
          agentId,
          agentType,
          agentName,
          parentAgentId,
          payload: { stepId, label, error },
        })
      },

      /**
       * 派生子 Agent
       */
      subagentSpawned: (subagentId: string, subagentType: string, subagentName: string) => {
        this.pushEvent({
          type: 'subagent_spawned',
          traceId,
          agentId,
          agentType,
          agentName,
          parentAgentId,
          payload: { subagentId, subagentType, subagentName },
        })
      },
    }
  }

  /**
   * 获取活跃的 trace 列表
   */
  getActiveTraces(): string[] {
    return Array.from(this.activeTraces.keys())
  }

  /**
   * 获取指定 trace 中的活跃 agent 列表
   */
  getAgentsForTrace(traceId: string): string[] {
    const agents = this.activeTraces.get(traceId)
    return agents ? Array.from(agents) : []
  }

  /**
   * 清除指定的 trace
   */
  clearTrace(traceId: string): void {
    this.activeTraces.delete(traceId)
  }
}

// 单例实例
const workflowEventService = new WorkflowEventService()

/**
 * 获取工作流事件服务实例
 */
export function getWorkflowEventService(): WorkflowEventService {
  return workflowEventService
}

/**
 * 创建工作流事件服务实例（用于测试）
 */
export function createWorkflowEventService(): WorkflowEventService {
  return new WorkflowEventService()
}
