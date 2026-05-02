import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AgentState,
  TraceState,
  AgentWorkflowStep,
  AgentEvent,
  AgentStatus,
  AgentActionType,
  AgentConfig
} from '@/types'
import type {
  AgentWorkflowEvent,
  WorkflowUpdatePayload,
  AgentStatusChangePayload,
  ToolCallStartPayload,
  ToolCallCompletePayload,
  ToolCallErrorPayload,
  PermissionRequiredPayload,
  TeammateSpawnedPayload,
  TaskStatusChangePayload,
  ThinkingPayload,
  TeamTopology,
  WorkflowTeamMember,
  BackgroundTask,
  PermissionRequest
} from '@/types'
import wsClient from '@/composables/useWebSocket'
import agentApi from '@/api/agentApi'
import type { AgentSelection, AgentStatusSnapshot, AgentStatusUpdate } from '@/types/agentStatus'

/**
 * Agent 状态管理 Store
 * 
 * 核心设计原则：
 * 1. 按 traceId（主任务ID）和 agentId 完全隔离状态
 * 2. 每个 Agent 拥有独立的状态树
 * 3. 使用 Map 结构实现 O(1) 时间复杂度的查找
 * 4. 支持嵌套（父子）Agent 关系
 * 5. 实时响应后端 WebSocket 事件推送
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
  const pendingPermissions = ref<Map<string, PermissionRequest>>(new Map())
  
  /**
   * 团队拓扑结构
   */
  const teams = ref<Map<string, TeamTopology>>(new Map())
  
  /**
   * 后台任务列表
   */
  const backgroundTasks = ref<Map<string, BackgroundTask>>(new Map())
  
  /**
   * Agent 状态面板数据
   */
  const agentStatusSnapshots = ref<Map<string, AgentStatusSnapshot>>(new Map())
  
  /**
   * 可用的 Agent 类型列表
   */
  const availableAgentTypes = ref<AgentSelection[]>([])
  
  /**
   * Agent 状态面板是否启用
   */
  const isAgentStatusPanelEnabled = ref(false)
  
  /**
   * 活跃的 thinking 内容（流式）
   */
  const activeThinkings = ref<Map<string, string>>(new Map())
  
  /**
   * 工具调用详情缓存
   */
  const toolCallDetails = ref<Map<string, {
    input: Record<string, unknown>
    output?: unknown
    logs: string[]
    startTime: number
  }>>(new Map())

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
  
  /**
   * 当前活跃的后台任务列表
   */
  const activeBackgroundTasks = computed(() => {
    return Array.from(backgroundTasks.value.values())
      .filter(t => t.status === 'RUNNING' || t.status === 'PENDING')
  })
  
  /**
   * 等待审批的权限请求列表
   */
  const pendingPermissionList = computed(() => {
    return Array.from(pendingPermissions.value.values())
      .filter(p => p.status === 'pending')
  })
  
  /**
   * 获取团队拓扑结构
   */
  const currentTeamTopology = computed(() => {
    if (!currentTraceId.value) return null
    for (const team of teams.value.values()) {
      if (team.members.some(m => m.agentId === currentTraceId.value)) {
        return team
      }
    }
    return null
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
    color?: string,
    agentType?: string
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
      agentType,
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
   * 查找最后一个匹配的工作流步骤
   */
  function findLastWorkflowStep(
    traceId: string,
    agentId: string,
    predicate: (step: AgentWorkflowStep) => boolean
  ): AgentWorkflowStep | undefined {
    const agentMap = agents.value.get(traceId)
    if (!agentMap) return undefined
    const agent = agentMap.get(agentId)
    if (!agent) return undefined
    return [...agent.workflowSteps].reverse().find(predicate)
  }

  // ==================== 核心事件处理 ====================
  
  /**
   * 处理通用的 Agent 事件
   */
  function handleAgentEvent(event: AgentEvent) {
    const { traceId, agentId, type, timestamp, data } = event
    
    console.log('[AgentStore] Handling agent event:', type, 'for trace:', traceId, 'agent:', agentId)
    
    // 确保 Trace 和 Agent 存在
    ensureTrace(traceId)
    ensureAgent(traceId, agentId, data.message?.split(' ')[0] || 'Agent')
    
    switch (type) {
      case 'WORKFLOW_UPDATE':
        handleWorkflowUpdate(traceId, agentId, data as WorkflowUpdatePayload)
        break
        
      case 'AGENT_STATUS_CHANGED':
        handleStatusChange(traceId, agentId, data as AgentStatusChangePayload)
        break
        
      case 'TOOL_CALL_START':
        handleToolCallStart(traceId, agentId, data as ToolCallStartPayload)
        break
        
      case 'TOOL_CALL_PROGRESS':
        handleToolCallProgress(traceId, agentId, data)
        break
        
      case 'TOOL_CALL_COMPLETE':
        handleToolCallComplete(traceId, agentId, data as ToolCallCompletePayload)
        break
        
      case 'TOOL_CALL_ERROR':
        handleToolCallError(traceId, agentId, data as ToolCallErrorPayload)
        break
        
      case 'PERMISSION_REQUIRED':
        handlePermissionRequired(traceId, agentId, data as PermissionRequiredPayload)
        break
        
      case 'TEAMMATE_SPAWNED':
        handleTeammateSpawned(traceId, agentId, data as TeammateSpawnedPayload)
        break
        
      case 'AGENT_TOKEN_STREAM':
        handleTokenStream(traceId, agentId, data)
        break
        
      case 'TASK_STATUS_CHANGED':
        handleTaskStatusChange(data as TaskStatusChangePayload)
        break
        
      case 'THINKING_START':
      case 'THINKING_END':
        handleThinking(traceId, agentId, type, data as ThinkingPayload)
        break
    }
  }

  // ==================== 详细事件处理器 ====================
  
  /**
   * 处理工作流更新
   */
  function handleWorkflowUpdate(traceId: string, agentId: string, data: WorkflowUpdatePayload) {
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
    
    // 更新 Trace 进度
    const trace = ensureTrace(traceId)
    if (data.progress !== undefined) {
      trace.progress = data.progress
    }
  }

  /**
   * 处理工作流事件（来自后端 workflowEventService）
   */
  function handleWorkflowEvent(event: any) {
    const { traceId, agentId, agentType, agentName, type, payload, parentAgentId } = event

    // 确保 trace 和 agent 存在
    ensureTrace(traceId)
    ensureAgentForWorkflow(traceId, agentId, agentType, agentName, parentAgentId)

    switch (type) {
      case 'agent_started':
        updateAgentStatus(traceId, agentId, 'RUNNING')
        addWorkflowStep(traceId, agentId, {
          status: 'RUNNING',
          actionType: 'THINKING',
          message: payload.message || 'Agent 开始执行'
        })
        break

      case 'agent_thinking':
        updateAgentStatus(traceId, agentId, 'THINKING')
        addWorkflowStep(traceId, agentId, {
          status: 'RUNNING',
          actionType: 'THINKING',
          message: payload.message || 'Agent 思考中'
        })
        break

      case 'agent_tool_call':
        updateAgentStatus(traceId, agentId, 'RUNNING', 'TOOL_CALL')
        const toolCallStepId = addWorkflowStep(traceId, agentId, {
          status: 'RUNNING',
          actionType: 'TOOL_CALL',
          message: `调用工具: ${payload.toolName}`,
          toolName: payload.toolName,
          input: payload.input
        })
        // 缓存工具调用详情
        toolCallDetails.value.set(toolCallStepId, {
          input: payload.input || {},
          logs: [],
          startTime: Date.now()
        })
        break

      case 'agent_tool_result':
        updateAgentStatus(traceId, agentId, 'IDLE')
        // 找到对应的 TOOL_CALL 步骤并更新
        const toolStep = findLastWorkflowStep(traceId, agentId, s =>
          s.actionType === 'TOOL_CALL' && s.status === 'RUNNING'
        )
        if (toolStep) {
          updateWorkflowStep(toolStep.id, {
            status: payload.success ? 'COMPLETED' : 'FAILED',
            output: payload.result || payload.error,
            toolName: payload.toolName
          })
          // 更新缓存
          const details = toolCallDetails.value.get(toolStep.id)
          if (details) {
            details.output = payload.result || payload.error
          }
        }
        break

      case 'agent_message':
        updateAgentStatus(traceId, agentId, 'RUNNING')
        addWorkflowStep(traceId, agentId, {
          status: 'RUNNING',
          actionType: 'MESSAGE',
          message: payload.message
        })
        break

      case 'agent_completed':
        updateAgentStatus(traceId, agentId, 'COMPLETED')
        addWorkflowStep(traceId, agentId, {
          status: 'COMPLETED',
          actionType: 'THINKING',
          message: payload.result || 'Agent 执行完成'
        })
        break

      case 'agent_failed':
        updateAgentStatus(traceId, agentId, 'FAILED')
        addWorkflowStep(traceId, agentId, {
          status: 'FAILED',
          actionType: 'THINKING',
          message: payload.error || 'Agent 执行失败'
        })
        break

      case 'step_started':
        addWorkflowStep(traceId, agentId, {
          status: 'RUNNING',
          actionType: 'THINKING',
          message: payload.label || '步骤开始'
        })
        break

      case 'step_completed':
        const completedStep = findLastWorkflowStep(traceId, agentId, s => s.status === 'RUNNING')
        if (completedStep) {
          updateWorkflowStep(completedStep.id, {
            status: 'COMPLETED',
            output: payload.result
          })
        }
        break

      case 'step_failed':
        const failedStep = findLastWorkflowStep(traceId, agentId, s => s.status === 'RUNNING')
        if (failedStep) {
          updateWorkflowStep(failedStep.id, {
            status: 'FAILED',
            output: { error: payload.error }
          })
        }
        break

      case 'subagent_spawned':
        updateAgentStatus(traceId, agentId, 'RUNNING')
        // 创建子 Agent
        const subAgentId = spawnAgent(
          traceId,
          agentId,
          payload.subagentName,
          '子 Agent',
          '🤖',
          '#2196F3',
          payload.subagentType
        )
        addWorkflowStep(traceId, agentId, {
          status: 'COMPLETED',
          actionType: 'SPAWN_TEAMMATE',
          message: `派生子 Agent: ${payload.subagentName}`,
          childTraceId: payload.subagentId
        })
        break
    }

    // 如果是当前 trace，设置为当前
    if (!currentTraceId.value) {
      currentTraceId.value = traceId
    }
  }
  
  /**
   * 确保 Agent 存在（工作流事件专用）
   */
  function ensureAgentForWorkflow(traceId: string, agentId: string, agentType: string, agentName: string, parentAgentId?: string) {
    const agentMap = ensureAgentMap(traceId)
    
    if (!agentMap.has(agentId)) {
      // 从内置 agent 类型中获取图标和颜色
      const builtInAgent = availableAgentTypes.value.find(a => a.agentType === agentType)
      const icon = builtInAgent?.icon || '🤖'
      const color = builtInAgent?.color || '#2196F3'

      const newAgent: AgentState = {
        agentId,
        traceId,
        name: agentName || agentType,
        status: 'IDLE',
        agentType,
        icon,
        color,
        parentAgentId,
        startTime: Date.now(),
        lastActivityTime: Date.now(),
        workflowSteps: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        progress: 0
      }
      agentMap.set(agentId, newAgent)
    }
  }
  
  /**
   * 处理 Agent 状态变化
   */
  function handleStatusChange(traceId: string, agentId: string, data: AgentStatusChangePayload) {
    const status = data.newStatus || data.status
    if (status) {
      updateAgentStatus(traceId, agentId, status)
    }
  }
  
  /**
   * 处理工具调用开始
   */
  function handleToolCallStart(traceId: string, agentId: string, data: ToolCallStartPayload) {
    updateAgentStatus(traceId, agentId, 'RUNNING', 'TOOL_CALL')
    
    const stepId = addWorkflowStep(traceId, agentId, {
      status: 'RUNNING',
      actionType: 'TOOL_CALL',
      message: data.message || `执行工具: ${data.toolName}`,
      toolName: data.toolName,
      input: data.input
    })
    
    // 缓存工具调用详情
    toolCallDetails.value.set(stepId, {
      input: data.input || {},
      logs: [],
      startTime: Date.now()
    })
  }
  
  /**
   * 处理工具调用进度
   */
  function handleToolCallProgress(traceId: string, agentId: string, data: { toolCallId?: string; logs?: string[]; message?: string }) {
    // 如果有 toolCallId，找到对应的步骤
    if (data.toolCallId) {
      const step = findLastWorkflowStep(traceId, agentId, s => s.toolName === data.toolCallId)
      if (step && data.logs) {
        const details = toolCallDetails.value.get(step.id)
        if (details) {
          details.logs.push(...data.logs)
        }
      }
    }
  }
  
  /**
   * 处理工具调用完成
   */
  function handleToolCallComplete(traceId: string, agentId: string, data: ToolCallCompletePayload) {
    updateAgentStatus(traceId, agentId, 'IDLE')
    
    // 找到对应的 TOOL_CALL 步骤并更新
    const step = findLastWorkflowStep(traceId, agentId, s => 
      s.actionType === 'TOOL_CALL' && s.status === 'RUNNING'
    )
    if (step) {
      updateWorkflowStep(step.id, {
        status: 'COMPLETED',
        output: data.output,
        duration: data.duration
      })
      
      // 更新缓存
      const details = toolCallDetails.value.get(step.id)
      if (details) {
        details.output = data.output
      }
    }
  }
  
  /**
   * 处理工具调用错误
   */
  function handleToolCallError(traceId: string, agentId: string, data: ToolCallErrorPayload) {
    updateAgentStatus(traceId, agentId, 'FAILED')
    
    const step = findLastWorkflowStep(traceId, agentId, s => s.status === 'RUNNING')
    if (step) {
      updateWorkflowStep(step.id, {
        status: 'FAILED',
        output: { error: data.error, errorType: data.errorType }
      })
    }
  }
  
  /**
   * 处理权限请求
   */
  function handlePermissionRequired(traceId: string, agentId: string, data: PermissionRequiredPayload) {
    updateAgentStatus(traceId, agentId, 'BLOCKED', 'WAITING_PERMISSION')
    
    // 添加权限请求
    const request: PermissionRequest = {
      permissionId: data.permissionId,
      toolName: data.toolName,
      action: data.action,
      reason: data.reason,
      riskLevel: data.riskLevel,
      status: 'pending',
      requestedAt: Date.now()
    }
    pendingPermissions.value.set(data.permissionId, request)
    
    addWorkflowStep(traceId, agentId, {
      status: 'BLOCKED',
      actionType: 'WAITING_PERMISSION',
      message: `需要授权: ${data.reason || data.toolName}`,
      details: { 
        permissionId: data.permissionId,
        riskLevel: data.riskLevel,
        suggestions: data.suggestions
      }
    })
  }
  
  /**
   * 处理团队成员创建
   */
  function handleTeammateSpawned(traceId: string, agentId: string, data: TeammateSpawnedPayload) {
    const childAgentId = spawnAgent(
      traceId,
      agentId,
      data.teammateName,
      data.role,
      '🤖',
      '#2196F3',
      data.teammateName
    )
    
    addWorkflowStep(traceId, agentId, {
      status: 'COMPLETED',
      actionType: 'SPAWN_TEAMMATE',
      message: `派生子 Agent: ${data.teammateName}`,
      childTraceId: data.teammateId,
      details: { childAgentId, teamId: data.teamId }
    })
    
    // 更新团队拓扑
    if (data.teamId) {
      const team = teams.value.get(data.teamId) || {
        teamId: data.teamId,
        name: 'Team',
        orchestratorId: agentId,
        members: [],
        createdAt: Date.now(),
        status: 'active'
      }
      team.members.push({
        agentId: childAgentId,
        name: data.teammateName,
        role: data.role,
        type: data.teammateName,
        status: 'IDLE',
        parentId: agentId,
        children: [],
        progress: 0,
        isActive: true
      })
      teams.value.set(data.teamId, team)
    }
  }
  
  /**
   * 处理流式 Token
   */
  function handleTokenStream(traceId: string, agentId: string, data: { content?: string }) {
    if (data.content) {
      const existing = activeThinkings.value.get(agentId) || ''
      activeThinkings.value.set(agentId, existing + data.content)
    }
  }
  
  /**
   * 处理后台任务状态变化
   */
  function handleTaskStatusChange(data: TaskStatusChangePayload) {
    let task = backgroundTasks.value.get(data.taskId)
    
    if (!task) {
      task = {
        taskId: data.taskId,
        traceId: data.traceId,
        name: data.taskName,
        status: 'PENDING',
        createdAt: Date.now()
      }
      backgroundTasks.value.set(data.taskId, task)
    }

    const statusMap: Record<string, string> = {
      created: 'PENDING',
      queued: 'PENDING',
      running: 'RUNNING',
      completed: 'COMPLETED',
      failed: 'FAILED',
      cancelled: 'CANCELLED',
      blocked: 'PENDING',
    }
    task.status = (statusMap[data.newStatus] || data.newStatus) as BackgroundTask['status']

    if (data.progress !== undefined && data.progress !== null) {
      task.progress = data.progress
    }
    if (task.status === 'COMPLETED') {
      task.progress = 100
    }
    
    if (task.status === 'COMPLETED' || task.status === 'FAILED' || task.status === 'CANCELLED') {
      task.completedAt = Date.now()
    }
    if (task.status === 'RUNNING' && !task.startedAt) {
      task.startedAt = Date.now()
    }
    
    if (data.traceId) {
      task.traceId = data.traceId
    }
    if (data.error) {
      task.error = data.error
    }
  }
  
  /**
   * 处理思考过程
   */
  function handleThinking(traceId: string, agentId: string, type: string, data: ThinkingPayload) {
    if (type === 'THINKING_START') {
      activeThinkings.value.set(agentId, '')
      updateAgentStatus(traceId, agentId, 'THINKING')
    } else if (type === 'THINKING_END') {
      activeThinkings.value.delete(agentId)
      updateAgentStatus(traceId, agentId, 'IDLE')
    }
  }

  // ==================== 权限审批 ====================
  
  /**
   * 审批权限请求
   */
  async function approvePermission(permissionId: string, approved: boolean) {
    const request = pendingPermissions.value.get(permissionId)
    
    if (request) {
      request.status = approved ? 'approved' : 'denied'
      request.respondedAt = Date.now()
      request.respondedBy = 'user'
      
      // 通过 API 发送审批结果
      try {
        await agentApi.approvePermission(permissionId)
      } catch (error) {
        console.error('[AgentStore] Failed to approve permission:', error)
      }
      
      // 找到对应的 Agent 并更新状态
      for (const [traceId, agentMap] of agents.value) {
        for (const [agentId, agent] of agentMap) {
          const step = agent.workflowSteps.find(s => 
            s.actionType === 'WAITING_PERMISSION' && 
            s.status === 'BLOCKED'
          )
          if (step) {
            updateAgentStatus(traceId, agentId, approved ? 'RUNNING' : 'FAILED')
            updateWorkflowStep(step.id, {
              status: approved ? 'COMPLETED' : 'FAILED'
            })
            break
          }
        }
      }
      
      console.log('[AgentStore] Permission', approved ? 'approved' : 'denied', 'for:', permissionId)
    }
  }
  
  /**
   * 拒绝权限请求
   */
  async function denyPermission(permissionId: string) {
    return approvePermission(permissionId, false)
  }

  // ==================== 工具调用详情 ====================
  
  /**
   * 获取工具调用详情
   */
  function getToolCallDetails(stepId: string) {
    return toolCallDetails.value.get(stepId)
  }
  
  /**
   * 清除工具调用详情缓存
   */
  function clearToolCallDetails(stepId: string) {
    toolCallDetails.value.delete(stepId)
  }

  // ==================== 后台任务管理 ====================
  
  /**
   * 刷新后台任务列表
   */
  async function refreshBackgroundTasks() {
    try {
      const { tasks } = await agentApi.listTasks()
      for (const task of tasks) {
        backgroundTasks.value.set(task.taskId, task)
      }
    } catch (error) {
      console.error('[AgentStore] Failed to refresh background tasks:', error)
    }
  }
  
  /**
   * 取消后台任务
   */
  async function cancelBackgroundTask(taskId: string) {
    try {
      await agentApi.cancelTask(taskId)
      const task = backgroundTasks.value.get(taskId)
      if (task) {
        task.status = 'CANCELLED'
        task.completedAt = Date.now()
      }
    } catch (error) {
      console.error('[AgentStore] Failed to cancel task:', error)
    }
  }

  // ==================== 配置管理 ====================
  
  /**
   * 更新 Agent 配置
   */
  function updateConfig(config: Partial<AgentConfig>) {
    agentConfig.value = { ...agentConfig.value, ...config }
  }
  
  /**
   * 设置权限模式
   */
  function setPermissionMode(mode: PermissionMode) {
    agentConfig.value.permissionMode = mode
  }

  // ==================== 状态清理 ====================
  
  /**
   * 清空指定 Trace 的数据
   */
  function clearTrace(traceId: string) {
    traces.value.delete(traceId)
    agents.value.delete(traceId)
    
    // 清理相关的权限请求
    for (const [key, request] of pendingPermissions.value) {
      if (key.includes(traceId)) {
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
    teams.value.clear()
    backgroundTasks.value.clear()
    activeThinkings.value.clear()
    toolCallDetails.value.clear()
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
    
    // 监听工具调用事件
    wsClient.on('tool_call_start', (data: unknown) => {
      const payload = data as ToolCallStartPayload & { traceId: string; agentId: string }
      if (payload.traceId && payload.agentId) {
        handleToolCallStart(payload.traceId, payload.agentId, payload)
      }
    })
    
    wsClient.on('tool_call_end', (data: unknown) => {
      const payload = data as ToolCallCompletePayload & { traceId: string; agentId: string }
      if (payload.traceId && payload.agentId) {
        handleToolCallComplete(payload.traceId, payload.agentId, payload)
      }
    })
    
    wsClient.on('tool_call_error', (data: unknown) => {
      const payload = data as ToolCallErrorPayload & { traceId: string; agentId: string }
      if (payload.traceId && payload.agentId) {
        handleToolCallError(payload.traceId, payload.agentId, payload)
      }
    })
    
    // 监听权限事件
    wsClient.on('permission_required', (data: unknown) => {
      const payload = data as PermissionRequiredPayload & { traceId: string; agentId: string }
      if (payload.traceId && payload.agentId) {
        handlePermissionRequired(payload.traceId, payload.agentId, payload)
      }
    })
    
    // 监听任务状态变化
    wsClient.on('task_status_changed', (data: unknown) => {
      const payload = data as TaskStatusChangePayload
      handleTaskStatusChange(payload)
    })
    
    // 监听团队事件
    wsClient.on('teammate_spawned', (data: unknown) => {
      const payload = data as TeammateSpawnedPayload & { traceId: string; agentId: string }
      if (payload.traceId && payload.agentId) {
        handleTeammateSpawned(payload.traceId, payload.agentId, payload)
      }
    })
    
    // 监听 Agent 状态更新事件
    wsClient.on('agent_status_update', (data: unknown) => {
      const payload = data as any
      handleAgentStatusUpdate(payload)
    })
    
    // 监听工作流事件（用于真实的子 Agent 执行和可视化）
    wsClient.on('workflow_event', (data: unknown) => {
      const event = data as any
      handleWorkflowEvent(event)
    })
    
    console.log('[AgentStore] WebSocket listeners setup complete')
  }

  // ==================== Agent 状态面板相关方法 ====================
  
  /**
   * 加载可用的 Agent 类型
   */
  async function loadAvailableAgentTypes() {
    try {
      const response = await agentApi.listAgentTypes()
      availableAgentTypes.value = response.map(agent => ({
        agentType: agent.agentType,
        agentName: agent.agentName || agent.agentType,
        agentDescription: agent.description || '',
        icon: (agent as any).icon,
        color: (agent as any).color,
      }))
      console.log('[AgentStore] Loaded agent types:', availableAgentTypes.value.length)
    } catch (error) {
      console.error('[AgentStore] Failed to load agent types:', error)
    }
  }
  
  /**
   * 更新 Agent 状态快照
   */
  function updateAgentStatusSnapshot(snapshot: AgentStatusSnapshot) {
    agentStatusSnapshots.value.set(snapshot.agentId, snapshot)
    isAgentStatusPanelEnabled.value = true
  }
  
  /**
   * 处理 WebSocket Agent 状态更新
   */
  function handleAgentStatusUpdate(data: AgentStatusUpdate) {
    if (data.snapshots) {
      // 批量更新
      data.snapshots.forEach(snapshot => {
        agentStatusSnapshots.value.set(snapshot.agentId, {
          ...snapshot,
          updatedAt: new Date(snapshot.updatedAt),
        })
      })
    } else if (data.agentId) {
      // 单个更新
      const existing = agentStatusSnapshots.value.get(data.agentId)
      if (existing) {
        agentStatusSnapshots.value.set(data.agentId, {
          ...existing,
          executionStatus: data.executionStatus || existing.executionStatus,
          toolCalls: data.toolCalls || existing.toolCalls,
          teamMembers: data.teamMembers || existing.teamMembers,
          updatedAt: new Date(),
        })
      } else {
        agentStatusSnapshots.value.set(data.agentId, {
          agentId: data.agentId,
          executionStatus: data.executionStatus || {
            status: 'idle',
            currentTurn: 0,
            maxTurns: 100,
            progress: 0,
          },
          toolCalls: data.toolCalls || [],
          teamMembers: data.teamMembers || [],
          updatedAt: new Date(),
        })
      }
    }
    isAgentStatusPanelEnabled.value = true
  }
  
  /**
   * 获取 Agent 状态快照
   */
  function getAgentStatusSnapshot(agentId: string): AgentStatusSnapshot | undefined {
    return agentStatusSnapshots.value.get(agentId)
  }
  
  /**
   * 获取所有 Agent 状态快照
   */
  function getAllAgentStatusSnapshots(): AgentStatusSnapshot[] {
    return Array.from(agentStatusSnapshots.value.values())
  }
  
  /**
   * 清除 Agent 状态
   */
  function clearAgentStatus(agentId?: string) {
    if (agentId) {
      agentStatusSnapshots.value.delete(agentId)
    } else {
      agentStatusSnapshots.value.clear()
      isAgentStatusPanelEnabled.value = false
    }
  }

  return {
    // 状态
    traces,
    agents,
    currentTraceId,
    agentConfig,
    pendingPermissions,
    teams,
    backgroundTasks,
    activeThinkings,
    agentStatusSnapshots,
    availableAgentTypes,
    isAgentStatusPanelEnabled,
    
    // 计算属性
    currentTrace,
    currentAgents,
    agentTree,
    activeBackgroundTasks,
    pendingPermissionList,
    currentTeamTopology,
    
    // 核心方法
    setCurrentTrace,
    createTrace,
    spawnAgent,
    updateAgentStatus,
    addWorkflowStep,
    updateWorkflowStep,
    handleAgentEvent,
    findLastWorkflowStep,
    
    // 权限管理
    approvePermission,
    denyPermission,
    
    // 工具调用详情
    getToolCallDetails,
    clearToolCallDetails,
    
    // 后台任务
    refreshBackgroundTasks,
    cancelBackgroundTask,
    
    // Agent 状态面板
    loadAvailableAgentTypes,
    updateAgentStatusSnapshot,
    handleAgentStatusUpdate,
    getAgentStatusSnapshot,
    getAllAgentStatusSnapshots,
    clearAgentStatus,
    
    // 配置
    updateConfig,
    setPermissionMode,
    
    // 清理
    clearTrace,
    reset,
    
    // WebSocket
    setupWebSocketListeners
  }
})
