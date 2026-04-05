import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AgentState,
  TraceState,
  AgentWorkflowStep,
  AgentEvent,
  AgentStatus,
  AgentActionType,
  AgentEventType,
  AgentConfig,
  PermissionMode
} from '@/types'
import wsClient from '@/composables/useWebSocket'

/**
 * Agent 状态管理 Store
 * 
 * 核心设计原则：
 * 1. 按 traceId（主任务ID）和 agentId 完全隔离状态
 * 2. 每个 Agent 拥有独立的状态树
 * 3. 使用 Map 结构实现 O(1) 时间复杂度的查找
 * 4. 支持嵌套（父子）Agent 关系
 */

// 防止重复注册 WS 监听器
let agentWsListenersAttached = false

export const useAgentStore = defineStore('agent', () => {
  // ==================== 状态存储 ====================
  
  /**
   * 主任务（Trace）状态集合
   * key: traceId
   */
  const traces = ref<Map<string, TraceState>>(new Map())
  
  /**
   * Agent 状态集合
   * 第一层 key: traceId
   * 第二层 key: agentId
   */
  const agents = ref<Map<string, Map<string, AgentState>>>(new Map())
  
  /**
   * 当前活跃的 traceId
   */
  const currentTraceId = ref<string | null>(null)
  
  /**
   * Agent 配置
   */
  const agentConfig = ref<AgentConfig>({
    permissionMode: 'auto'
  })
  
  /**
   * 等待权限审批的事件队列
   */
  const pendingPermissions = ref<Map<string, AgentEvent>>(new Map())

  // ==================== 计算属性 ====================
  
  /**
   * 获取当前活跃的 Trace
   */
  const currentTrace = computed(() => {
    if (!currentTraceId.value) return null
    return traces.value.get(currentTraceId.value) || null
  })
  
  /**
   * 获取当前 Trace 下的所有 Agent
   */
  const currentAgents = computed(() => {
    if (!currentTraceId.value) return []
    const agentMap = agents.value.get(currentTraceId.value)
    if (!agentMap) return []
    return Array.from(agentMap.values())
  })
  
  /**
   * 获取 Agent 的树形结构（用于可视化）
   */
  const agentTree = computed(() => {
    if (!currentTraceId.value) return []
    const agentMap = agents.value.get(currentTraceId.value)
    if (!agentMap) return []
    
    const allAgents = Array.from(agentMap.values())
    const rootAgents = allAgents.filter(a => !a.parentAgentId)
    
    const buildTree = (agent: AgentState): AgentState & { children: AgentState[] } => {
      const children = allAgents.filter(a => a.parentAgentId === agent.agentId)
      return {
        ...agent,
        children: children.map(buildTree)
      }
    }
    
    return rootAgents.map(buildTree)
  })

  // ==================== 内部辅助方法 ====================
  
  /**
   * 生成唯一 ID
   */
  function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
  }
  
  /**
   * 确保 Trace 存在
   */
  function ensureTrace(traceId: string): TraceState {
    let trace = traces.value.get(traceId)
    if (!trace) {
      trace = {
        traceId,
        title: '未知任务',
        status: 'IDLE',
        rootAgentId: '',
        agentIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      traces.value.set(traceId, trace)
    }
    return trace
  }
  
  /**
   * 确保 Agent Map 存在
   */
  function ensureAgentMap(traceId: string): Map<string, AgentState> {
    let agentMap = agents.value.get(traceId)
    if (!agentMap) {
      agentMap = new Map()
      agents.value.set(traceId, agentMap)
    }
    return agentMap
  }
  
  /**
   * 确保 Agent 存在
   */
  function ensureAgent(traceId: string, agentId: string, name: string = 'Unknown Agent'): AgentState {
    const agentMap = ensureAgentMap(traceId)
    let agent = agentMap.get(agentId)
    
    if (!agent) {
      agent = {
        agentId,
        traceId,
        name,
        status: 'IDLE',
        workflowSteps: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      agentMap.set(agentId, agent)
      
      // 更新 Trace 的 agentIds
      const trace = ensureTrace(traceId)
      if (!trace.agentIds.includes(agentId)) {
        trace.agentIds.push(agentId)
        trace.updatedAt = Date.now()
      }
    }
    
    return agent
  }

  // ==================== 公共方法 ====================
  
  /**
   * 设置当前活跃的 Trace
   */
  function setCurrentTrace(traceId: string | null) {
    currentTraceId.value = traceId
  }
  
  /**
   * 创建新的 Trace（主任务）
   */
  function createTrace(title: string, rootAgentName: string = 'Main Agent'): string {
    const traceId = generateId()
    const rootAgentId = generateId()
    
    // 创建 Trace
    const trace: TraceState = {
      traceId,
      title,
      status: 'IDLE',
      rootAgentId,
      agentIds: [rootAgentId],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    traces.value.set(traceId, trace)
    
    // 创建根 Agent
    const agentMap = new Map<string, AgentState>()
    const rootAgent: AgentState = {
      agentId: rootAgentId,
      traceId,
      name: rootAgentName,
      status: 'IDLE',
      workflowSteps: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    agentMap.set(rootAgentId, rootAgent)
    agents.value.set(traceId, agentMap)
    
    // 设置为当前 Trace
    currentTraceId.value = traceId
    
    console.log('[AgentStore] Created trace:', traceId, 'with root agent:', rootAgentId)
    return traceId
  }
  
  /**
   * 派生子 Agent
   */
  function spawnAgent(
    traceId: string,
    parentAgentId: string,
    name: string,
    description?: string,
    icon?: string,
    color?: string
  ): string {
    const agentId = generateId()
    
    const agentMap = ensureAgentMap(traceId)
    const agent: AgentState = {
      agentId,
      traceId,
      parentAgentId,
      name,
      description,
      icon,
      color,
      status: 'IDLE',
      workflowSteps: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    agentMap.set(agentId, agent)
    
    // 更新 Trace
    const trace = ensureTrace(traceId)
    if (!trace.agentIds.includes(agentId)) {
      trace.agentIds.push(agentId)
      trace.updatedAt = Date.now()
    }
    
    console.log('[AgentStore] Spawned agent:', agentId, 'under parent:', parentAgentId)
    return agentId
  }
  
  /**
   * 更新 Agent 状态
   */
  function updateAgentStatus(
    traceId: string,
    agentId: string,
    status: AgentStatus,
    actionType?: AgentActionType
  ) {
    const agent = ensureAgent(traceId, agentId)
    agent.status = status
    if (actionType) {
      agent.currentAction = actionType
    }
    agent.updatedAt = Date.now()
    
    // 同时更新 Trace 状态
    const trace = ensureTrace(traceId)
    if (status === 'FAILED') {
      trace.status = 'FAILED'
    } else if (status === 'COMPLETED' && agentId === trace.rootAgentId) {
      trace.status = 'COMPLETED'
    } else if (status === 'RUNNING' || status === 'THINKING') {
      trace.status = 'RUNNING'
    }
    trace.updatedAt = Date.now()
    
    console.log('[AgentStore] Agent status updated:', agentId, '->', status)
  }
  
  /**
   * 添加工作流步骤
   */
  function addWorkflowStep(
    traceId: string,
    agentId: string,
    step: Omit<AgentWorkflowStep, 'id' | 'traceId' | 'agentId' | 'createdAt'>
  ): string {
    const stepId = generateId()
    const agent = ensureAgent(traceId, agentId)
    
    const workflowStep: AgentWorkflowStep = {
      id: stepId,
      traceId,
      agentId,
      createdAt: Date.now(),
      ...step
    }
    
    agent.workflowSteps.push(workflowStep)
    agent.updatedAt = Date.now()
    
    console.log('[AgentStore] Added workflow step:', stepId, 'for agent:', agentId)
    return stepId
  }
  
  /**
   * 更新工作流步骤
   */
  function updateWorkflowStep(
    stepId: string,
    updates: Partial<AgentWorkflowStep>
  ) {
    // 遍历所有 Trace 和 Agent 查找步骤
    for (const [traceId, agentMap] of agents.value) {
      for (const [agentId, agent] of agentMap) {
        const step = agent.workflowSteps.find(s => s.id === stepId)
        if (step) {
          Object.assign(step, updates)
          if (updates.status === 'COMPLETED' || updates.status === 'FAILED') {
            step.completedAt = Date.now()
            if (step.createdAt) {
              step.duration = step.completedAt - step.createdAt
            }
          }
          agent.updatedAt = Date.now()
          console.log('[AgentStore] Updated workflow step:', stepId)
          return
        }
      }
    }
    console.warn('[AgentStore] Workflow step not found:', stepId)
  }
  
  /**
   * 处理 Agent 事件（核心方法）
   * 这是从 WebSocket 接收事件并更新状态的统一入口
   */
  function handleAgentEvent(event: AgentEvent) {
    const { traceId, agentId, type, timestamp, data } = event
    
    console.log('[AgentStore] Handling agent event:', type, 'for trace:', traceId, 'agent:', agentId)
    
    // 确保 Trace 和 Agent 存在
    ensureTrace(traceId)
    ensureAgent(traceId, agentId, data.message?.split(' ')[0] || 'Agent')
    
    switch (type) {
      case 'WORKFLOW_UPDATE':
        if (data.status) {
          updateAgentStatus(traceId, agentId, data.status, data.actionType)
        }
        if (data.message) {
          addWorkflowStep(traceId, agentId, {
            status: data.status || 'RUNNING',
            actionType: data.actionType || 'THINKING',
            message: data.message,
            details: typeof data.details === 'string' 
              ? { text: data.details } 
              : data.details,
            input: data.input,
            output: data.output,
            toolName: data.toolName,
            childTraceId: data.childTraceId
          })
        }
        break
        
      case 'AGENT_STATUS_CHANGED':
        if (data.status) {
          updateAgentStatus(traceId, agentId, data.status, data.actionType)
        }
        break
        
      case 'TOOL_CALL_START':
        updateAgentStatus(traceId, agentId, 'RUNNING', 'TOOL_CALL')
        addWorkflowStep(traceId, agentId, {
          status: 'RUNNING',
          actionType: 'TOOL_CALL',
          message: data.message || `执行工具: ${data.toolName}`,
          toolName: data.toolName,
          input: data.input
        })
        break
        
      case 'TOOL_CALL_COMPLETE':
        updateAgentStatus(traceId, agentId, 'IDLE')
        // 找到对应的 TOOL_CALL 步骤并更新
        const agentMap = ensureAgentMap(traceId)
        const agent = agentMap.get(agentId)
        if (agent) {
          const lastToolStep = [...agent.workflowSteps]
            .reverse()
            .find(s => s.actionType === 'TOOL_CALL' && s.status === 'RUNNING')
          if (lastToolStep) {
            updateWorkflowStep(lastToolStep.id, {
              status: 'COMPLETED',
              output: data.output,
              duration: data.duration
            })
          }
        }
        break
        
      case 'TOOL_CALL_ERROR':
        updateAgentStatus(traceId, agentId, 'FAILED')
        // 找到对应的步骤并更新
        const errAgentMap = ensureAgentMap(traceId)
        const errAgent = errAgentMap.get(agentId)
        if (errAgent) {
          const lastStep = [...errAgent.workflowSteps]
            .reverse()
            .find(s => s.status === 'RUNNING')
          if (lastStep) {
            updateWorkflowStep(lastStep.id, {
              status: 'FAILED',
              output: { error: data.error, errorType: data.errorType }
            })
          }
        }
        break
        
      case 'PERMISSION_REQUIRED':
        updateAgentStatus(traceId, agentId, 'BLOCKED', 'WAITING_PERMISSION')
        pendingPermissions.value.set(`${traceId}-${agentId}`, event)
        addWorkflowStep(traceId, agentId, {
          status: 'BLOCKED',
          actionType: 'WAITING_PERMISSION',
          message: data.message || '需要用户授权',
          details: data.details
        })
        break
        
      case 'TEAMMATE_SPAWNED':
        if (data.childAgentId && data.childTraceId) {
          const childAgentId = spawnAgent(
            traceId,
            agentId,
            data.message?.split(' ').pop() || 'Sub Agent',
            undefined,
            '🤖',
            data.childTraceId === traceId ? '#4CAF50' : '#2196F3'
          )
          addWorkflowStep(traceId, agentId, {
            status: 'COMPLETED',
            actionType: 'SPAWN_TEAMMATE',
            message: data.message || `派生子 Agent`,
            childTraceId: data.childTraceId,
            details: { childAgentId }
          })
        }
        break
        
      case 'AGENT_TOKEN_STREAM':
        // 流式输出可以直接通过 chat store 处理
        break
        
      case 'TASK_STATUS_CHANGED':
        if (data.taskStatus) {
          updateAgentStatus(traceId, agentId, data.taskStatus as AgentStatus)
        }
        break
    }
  }
  
  /**
   * 审批权限请求
   */
  function approvePermission(traceId: string, agentId: string, approved: boolean) {
    const key = `${traceId}-${agentId}`
    const event = pendingPermissions.value.get(key)
    
    if (event) {
      pendingPermissions.value.delete(key)
      
      // 通过 WebSocket 发送审批结果
      wsClient.send({
        type: 'permission_response',
        traceId,
        agentId,
        approved
      })
      
      // 更新状态
      updateAgentStatus(traceId, agentId, approved ? 'RUNNING' : 'FAILED')
      
      console.log('[AgentStore] Permission', approved ? 'approved' : 'denied', 'for:', agentId)
    }
  }
  
  /**
   * 更新 Agent 配置
   */
  function updateConfig(config: Partial<AgentConfig>) {
    agentConfig.value = { ...agentConfig.value, ...config }
  }
  
  /**
   * 清空指定 Trace 的数据
   */
  function clearTrace(traceId: string) {
    traces.value.delete(traceId)
    agents.value.delete(traceId)
    
    // 清理相关的权限请求
    for (const [key] of pendingPermissions.value) {
      if (key.startsWith(traceId)) {
        pendingPermissions.value.delete(key)
      }
    }
    
    if (currentTraceId.value === traceId) {
      currentTraceId.value = null
    }
    
    console.log('[AgentStore] Cleared trace:', traceId)
  }
  
  /**
   * 重置整个 Store
   */
  function reset() {
    traces.value.clear()
    agents.value.clear()
    currentTraceId.value = null
    pendingPermissions.value.clear()
    agentConfig.value = { permissionMode: 'auto' }
    console.log('[AgentStore] Reset complete')
  }

  // ==================== WebSocket 事件监听 ====================
  
  /**
   * 设置 WebSocket 事件监听器
   */
  function setupWebSocketListeners() {
    if (agentWsListenersAttached) return
    agentWsListenersAttached = true
    
    // 监听 Agent 事件
    wsClient.on('agent_event', (data: unknown) => {
      const event = data as AgentEvent
      if (event.traceId && event.agentId && event.type) {
        handleAgentEvent(event)
      }
    })
    
    console.log('[AgentStore] WebSocket listeners setup complete')
  }

  return {
    // 状态
    traces,
    agents,
    currentTraceId,
    agentConfig,
    pendingPermissions,
    
    // 计算属性
    currentTrace,
    currentAgents,
    agentTree,
    
    // 方法
    setCurrentTrace,
    createTrace,
    spawnAgent,
    updateAgentStatus,
    addWorkflowStep,
    updateWorkflowStep,
    handleAgentEvent,
    approvePermission,
    updateConfig,
    clearTrace,
    reset,
    setupWebSocketListeners
  }
})
