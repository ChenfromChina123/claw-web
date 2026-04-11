/**
 * Agent 执行引擎核心模块
 * 
 * 负责 Agent 的生命周期管理、状态跟踪和任务协调
 */

import { randomUUID } from 'crypto'
import {
  type AgentDefinition,
  type AgentInstance,
  AgentStatus,
  type MultiAgentOrchestrationState,
  type TaskStep,
  type AgentExecutionContext,
  type AgentExecutionResult
} from './types'
import { getBuiltInAgents } from './builtInAgents'

/**
 * Agent 管理器类
 *
 * 管理 Agent 实例的生命周期，支持中断机制
 */
class AgentManager {
  private agents: Map<string, AgentInstance> = new Map()
  /** 存储 Agent 的 AbortController，用于中断 */
  private abortControllers: Map<string, AbortController> = new Map()
  private orchestrationState: MultiAgentOrchestrationState = {
    subAgents: [],
    taskSteps: [],
    overallStatus: 'idle'
  }

  /**
   * 创建新的 Agent 实例
   */
  createAgent(agentDefinition: AgentDefinition): AgentInstance {
    const agentId = `agent_${randomUUID().slice(0, 8)}`
    const now = new Date()

    const agentInstance: AgentInstance = {
      agentId,
      agentDefinition,
      status: 'idle' as AgentStatus,
      completedTasks: 0,
      totalTasks: 0,
      startTime: now,
      lastActivityTime: now,
      progress: 0
    }

    this.agents.set(agentId, agentInstance)
    return agentInstance
  }

  /**
   * 获取 Agent 实例
   */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId)
  }

  /**
   * 更新 Agent 状态
   */
  updateAgentStatus(agentId: string, status: AgentStatus, currentTask?: string, progress?: number): void {
    const agent = this.agents.get(agentId)
    if (agent) {
      agent.status = status
      if (currentTask !== undefined) {
        agent.currentTask = currentTask
      }
      if (progress !== undefined) {
        agent.progress = progress
      }
      agent.lastActivityTime = new Date()

      if (status === 'completed') {
        agent.completedTasks++
      }
    }
  }

  /**
   * 为 Agent 注册 AbortController（用于中断）
   * @param agentId Agent ID
   * @returns AbortController 实例
   */
  registerAbortController(agentId: string): AbortController {
    const controller = new AbortController()
    this.abortControllers.set(agentId, controller)
    return controller
  }

  /**
   * 获取 Agent 的 AbortController
   * @param agentId Agent ID
   * @returns AbortController 实例或 undefined
   */
  getAbortController(agentId: string): AbortController | undefined {
    return this.abortControllers.get(agentId)
  }

  /**
   * 中断指定 Agent 的执行
   * @param agentId Agent ID
   * @returns 是否成功中断
   */
  interruptAgent(agentId: string): boolean {
    const controller = this.abortControllers.get(agentId)
    const agent = this.agents.get(agentId)

    if (!controller || !agent) {
      return false
    }

    // 检查是否已经中断
    if (controller.signal.aborted) {
      return false
    }

    // 触发中断
    controller.abort()

    // 更新状态
    this.updateAgentStatus(agentId, AgentStatus.ERROR, undefined, agent.progress)

    console.log(`[AgentEngine] Agent ${agentId} 已被用户中断`)

    return true
  }

  /**
   * 清理 Agent 相关资源（包括 AbortController）
   * @param agentId Agent ID
   */
  cleanupAgent(agentId: string): void {
    this.abortControllers.delete(agentId)
  }

  /**
   * 获取所有 Agent 实例
   */
  getAllAgents(): AgentInstance[] {
    return Array.from(this.agents.values())
  }

  /**
   * 获取协调状态
   */
  getOrchestrationState(): MultiAgentOrchestrationState {
    return this.orchestrationState
  }

  /**
   * 更新协调状态
   */
  updateOrchestrationState(state: Partial<MultiAgentOrchestrationState>): void {
    this.orchestrationState = {
      ...this.orchestrationState,
      ...state
    }
  }

  /**
   * 添加任务步骤
   */
  addTaskStep(step: TaskStep): void {
    this.orchestrationState.taskSteps.push(step)
  }

  /**
   * 更新任务步骤
   */
  updateTaskStep(stepId: string, updates: Partial<TaskStep>): void {
    const step = this.orchestrationState.taskSteps.find(s => s.id === stepId)
    if (step) {
      Object.assign(step, updates)
    }
  }

  /**
   * 初始化多 Agent 协调
   */
  initializeOrchestration(orchestratorType: string, subAgentTypes: string[]): void {
    const builtInAgents = getBuiltInAgents()
    const now = new Date()
    
    // 创建协调者
    const orchestratorDef = builtInAgents.find(a => a.agentType === orchestratorType)
    if (orchestratorDef) {
      const orchestrator = this.createAgent(orchestratorDef)
      orchestrator.status = AgentStatus.WORKING
      this.orchestrationState.orchestrator = orchestrator
    }

    // 创建子 Agent
    this.orchestrationState.subAgents = subAgentTypes.map(type => {
      const agentDef = builtInAgents.find(a => a.agentType === type)
      if (agentDef) {
        const agent = this.createAgent(agentDef)
        agent.status = AgentStatus.IDLE
        return agent
      }
      return null
    }).filter((a): a is AgentInstance => a !== null)

    this.orchestrationState.overallStatus = 'executing'
    this.orchestrationState.startTime = now
  }

  /**
   * 重置协调状态
   */
  resetOrchestration(): void {
    this.orchestrationState = {
      subAgents: [],
      taskSteps: [],
      overallStatus: 'idle'
    }
  }
}

// 单例实例
const agentManager = new AgentManager()

/**
 * 执行 Agent 任务（支持中断）
 * @param context 执行上下文（包含可选的 abortSignal）
 * @param onProgress 进度回调
 * @returns 执行结果
 */
export async function executeAgent(
  context: AgentExecutionContext,
  onProgress?: (state: MultiAgentOrchestrationState) => void
): Promise<AgentExecutionResult> {
  const startTime = Date.now()
  const builtInAgents = getBuiltInAgents()

  // 查找对应的 Agent 定义
  const agentDef = builtInAgents.find(a => a.agentType === context.agentId.split('_')[1])
    || builtInAgents[0] // 默认使用通用 Agent

  // 创建 Agent 实例
  const agent = agentManager.createAgent(agentDef)
  agentManager.updateAgentStatus(agent.agentId, AgentStatus.WORKING, context.task, 0)

  // 注册 AbortController 用于中断
  const abortController = agentManager.registerAbortController(agent.agentId)

  // 如果外部提供了 abortSignal，则使用外部的；否则使用新创建的
  const signal = context.abortSignal || abortController.signal

  // 模拟执行过程（实际应该调用 LLM）
  try {
    // 更新进度
    let progress = 0
    const progressInterval = setInterval(() => {
      // 检查是否被中断
      if (signal.aborted) {
        clearInterval(progressInterval)
        return
      }

      progress += 10
      if (progress <= 100) {
        agentManager.updateAgentStatus(agent.agentId, AgentStatus.WORKING, context.task, progress)
        if (onProgress) {
          onProgress(agentManager.getOrchestrationState())
        }
      }
    }, 500)

    // 模拟任务执行（支持中断检测）
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearTimeout(timeout)
        resolve()
      }, 3000)

      // 监听中断信号
      signal.addEventListener('abort', () => {
        clearTimeout(timeout)
        reject(new DOMException('Agent execution was interrupted by user', 'AbortError'))
      }, { once: true })
    })

    clearInterval(progressInterval)

    // 完成
    agentManager.updateAgentStatus(agent.agentId, AgentStatus.COMPLETED, undefined, 100)
    agentManager.cleanupAgent(agent.agentId)

    const result: AgentExecutionResult = {
      agentId: agent.agentId,
      status: 'completed' as const,
      content: `Agent ${agentDef.agentType} 已完成任务: ${context.task}`,
      durationMs: Date.now() - startTime
    }

    return result
  } catch (error) {
    // 清理资源
    agentManager.cleanupAgent(agent.agentId)

    // 检查是否是中断错误
    if (error instanceof DOMException && error.name === 'AbortError') {
      agentManager.updateAgentStatus(agent.agentId, AgentStatus.ERROR, undefined, agent.progress || 0)

      console.log(`[AgentEngine] Agent ${agent.agentId} 执行被中断`)

      return {
        agentId: agent.agentId,
        status: 'error' as const,
        content: '',
        durationMs: Date.now() - startTime,
        error: 'Execution interrupted by user'
      }
    }

    agentManager.updateAgentStatus(agent.agentId, AgentStatus.ERROR, undefined, 0)

    return {
      agentId: agent.agentId,
      status: 'error' as const,
      content: '',
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * 初始化多 Agent 协调演示
 */
export function initializeDemoOrchestration(): MultiAgentOrchestrationState {
  agentManager.resetOrchestration()
  agentManager.initializeOrchestration('general-purpose', ['Explore', 'Plan'])
  
  // 添加示例任务步骤
  const now = new Date()
  agentManager.addTaskStep({
    id: 'step-1',
    agentType: 'general-purpose',
    description: '分析任务需求，理解用户意图',
    status: 'completed',
    startTime: now,
    completedTime: new Date(now.getTime() + 1500)
  })
  
  agentManager.addTaskStep({
    id: 'step-2',
    agentType: 'Explore',
    description: '探索代码库结构，定位相关文件',
    status: 'completed',
    startTime: new Date(now.getTime() + 1500),
    completedTime: new Date(now.getTime() + 2700)
  })
  
  agentManager.addTaskStep({
    id: 'step-3',
    agentType: 'Explore',
    description: '读取关键文件，了解现有实现',
    status: 'active',
    startTime: new Date(now.getTime() + 2700)
  })
  
  agentManager.addTaskStep({
    id: 'step-4',
    agentType: 'Plan',
    description: '制定实施方案，设计代码结构',
    status: 'pending'
  })
  
  agentManager.addTaskStep({
    id: 'step-5',
    agentType: 'general-purpose',
    description: '执行方案，完成代码修改',
    status: 'pending'
  })
  
  return agentManager.getOrchestrationState()
}

// 导出管理器实例和方法
export { agentManager }
export type { AgentManager }
