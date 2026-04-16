/**
 * 前端 Agent 集成模块
 * 
 * 实现前端与真实 Agent 的连接
 */

import { ref, computed, shallowRef } from 'vue'
import { useWebSocket } from '@/composables/useWebSocket'
import { useAuthStore } from '@/stores/auth'

/**
 * Agent 选择状态
 */
export interface AgentSelection {
  agentType: string
  agentName: string
  agentDescription?: string
  agentColor?: string
}

/**
 * Agent 执行状态
 */
export interface AgentExecutionStatus {
  status: 'idle' | 'starting' | 'running' | 'completed' | 'error' | 'cancelled'
  currentTurn: number
  maxTurns: number
  progress: number
  message?: string
  startedAt?: Date
  completedAt?: Date
}

/**
 * Agent 消息
 */
export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  agentType?: string
  toolCalls?: Array<{
    id: string
    name: string
    input: Record<string, unknown>
  }>
  timestamp: Date
}

/**
 * Agent 执行结果
 */
export interface AgentExecutionResult {
  agentId: string
  status: 'completed' | 'error' | 'async_launched'
  content: string
  durationMs: number
  error?: string
}

/**
 * Agent 集成 composable
 */
export function useAgentIntegration() {
  const authStore = useAuthStore()
  const { send, isConnected } = useWebSocket()

  // Agent 选择状态
  const selectedAgent = ref<AgentSelection | null>(null)

  // Agent 执行状态
  const executionStatus = ref<AgentExecutionStatus>({
    status: 'idle',
    currentTurn: 0,
    maxTurns: 100,
    progress: 0,
  })

  // 消息列表
  const messages = shallowRef<AgentMessage[]>([])

  // 可用的 Agent 列表
  const availableAgents = ref<AgentSelection[]>([
    { agentType: 'general-purpose', agentName: '通用助手', agentDescription: '处理各种复杂任务' },
    { agentType: 'Explore', agentName: '探索者', agentDescription: '仅读取和分析文件', agentColor: 'blue' },
    { agentType: 'Plan', agentName: '规划师', agentDescription: '制定详细计划', agentColor: 'green' },
    { agentType: 'verification', agentName: '验证者', agentDescription: '审查和验证代码', agentColor: 'orange' },
    { agentType: 'claude-code-guide', agentName: '使用指南', agentDescription: '提供 Claude Code 帮助', agentColor: 'purple' },
    { agentType: 'statusline-setup', agentName: '状态栏设置', agentDescription: '配置状态栏显示', agentColor: 'cyan' },
  ])

  // 是否正在执行
  const isExecuting = computed(() =>
    ['starting', 'running'].includes(executionStatus.value.status)
  )

  // 是否已完成
  const isCompleted = computed(() =>
    ['completed', 'error', 'cancelled'].includes(executionStatus.value.status)
  )

  /**
   * 选择 Agent
   */
  function selectAgent(agentType: string) {
    const agent = availableAgents.value.find(a => a.agentType === agentType)
    if (agent) {
      selectedAgent.value = agent
    }
  }

  /**
   * 发送消息给 Agent
   */
  async function sendToAgent(prompt: string, options?: {
    runInBackground?: boolean
    model?: string
  }): Promise<AgentMessage> {
    if (!authStore.isAuthenticated) {
      throw new Error('用户未登录')
    }

    if (!selectedAgent.value) {
      throw new Error('请先选择 Agent')
    }

    // 添加用户消息
    const userMessage: AgentMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: prompt,
      agentType: selectedAgent.value.agentType,
      timestamp: new Date(),
    }

    messages.value = [...messages.value, userMessage]

    // 更新状态
    executionStatus.value = {
      status: 'starting',
      currentTurn: 0,
      maxTurns: 100,
      progress: 0,
      message: '启动 Agent...',
    }

    try {
      // 发送 WebSocket 消息
      if (isConnected.value) {
        send({
          type: 'agent_execute',
          payload: {
            agentType: selectedAgent.value.agentType,
            prompt,
            model: options?.model,
            runInBackground: options?.runInBackground ?? false,
          },
        })
      } else {
        // 使用 HTTP API
        const response = await fetch('/api/agents/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authStore.token}`,
          },
          body: JSON.stringify({
            agentType: selectedAgent.value.agentType,
            prompt,
            model: options?.model,
            runInBackground: options?.runInBackground ?? false,
          }),
        })

        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`)
        }

        const result = await response.json()
        return result
      }

      // 返回用户消息（实际响应由 WebSocket 推送）
      return userMessage
    } catch (error) {
      executionStatus.value = {
        ...executionStatus.value,
        status: 'error',
        message: error instanceof Error ? error.message : '执行失败',
      }
      throw error
    }
  }

  /**
   * 中断 Agent 执行
   */
  function abortAgent() {
    if (isConnected.value) {
      send({
        type: 'agent_abort',
        payload: {
          agentType: selectedAgent.value?.agentType,
        },
      })
    }

    executionStatus.value = {
      ...executionStatus.value,
      status: 'cancelled',
      message: '用户中断',
      completedAt: new Date(),
    }
  }

  /**
   * 处理 WebSocket 消息
   */
  function handleWebSocketMessage(data: {
    type: string
    payload: unknown
  }) {
    switch (data.type) {
      case 'agent_started':
        executionStatus.value = {
          status: 'running',
          currentTurn: 0,
          maxTurns: 100,
          progress: 0,
          startedAt: new Date(),
          message: 'Agent 执行中...',
        }
        break

      case 'agent_progress':
        const progress = data.payload as {
          currentTurn: number
          maxTurns: number
          progress: number
          message: string
        }
        executionStatus.value = {
          ...executionStatus.value,
          currentTurn: progress.currentTurn,
          maxTurns: progress.maxTurns,
          progress: progress.progress,
          message: progress.message,
        }
        break

      case 'agent_message':
        const msgData = data.payload as AgentMessage
        messages.value = [...messages.value, msgData]
        break

      case 'agent_completed':
        const completedData = data.payload as { content: string }
        executionStatus.value = {
          ...executionStatus.value,
          status: 'completed',
          progress: 100,
          message: '执行完成',
          completedAt: new Date(),
        }
        break

      case 'agent_error':
        const errorData = data.payload as { error: string }
        executionStatus.value = {
          ...executionStatus.value,
          status: 'error',
          message: errorData.error,
          completedAt: new Date(),
        }
        break

      case 'agent_cancelled':
        executionStatus.value = {
          ...executionStatus.value,
          status: 'cancelled',
          message: '已中断',
          completedAt: new Date(),
        }
        break
    }
  }

  /**
   * 获取 Agent 列表
   */
  async function fetchAgents() {
    try {
      const response = await fetch('/api/agents', {
        headers: {
          Authorization: `Bearer ${authStore.token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        availableAgents.value = data.agents || data.data?.agents || []
      }
    } catch (error) {
      console.error('获取 Agent 列表失败:', error)
    }
  }

  /**
   * 获取 Agent 状态
   */
  async function fetchAgentStatus(agentId: string) {
    try {
      const response = await fetch(`/api/agents/${agentId}/status`, {
        headers: {
          Authorization: `Bearer ${authStore.token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        executionStatus.value = {
          status: data.status,
          currentTurn: data.currentTurn,
          maxTurns: data.maxTurns,
          progress: data.progress,
          message: data.message,
        }
      }
    } catch (error) {
      console.error('获取 Agent 状态失败:', error)
    }
  }

  /**
   * 清除消息
   */
  function clearMessages() {
    messages.value = []
  }

  /**
   * 清除执行状态
   */
  function resetExecutionStatus() {
    executionStatus.value = {
      status: 'idle',
      currentTurn: 0,
      maxTurns: 100,
      progress: 0,
    }
  }

  return {
    // 状态
    selectedAgent,
    executionStatus,
    messages,
    availableAgents,

    // 计算属性
    isExecuting,
    isCompleted,
    isConnected,

    // 方法
    selectAgent,
    sendToAgent,
    abortAgent,
    handleWebSocketMessage,
    fetchAgents,
    fetchAgentStatus,
    clearMessages,
    resetExecutionStatus,
  }
}

/**
 * Agent 选择器组件接口
 */
export interface AgentSelectorEmits {
  (e: 'select', agent: AgentSelection): void
}

export interface AgentSelectorProps {
  modelValue?: AgentSelection | null
  agents?: AgentSelection[]
  disabled?: boolean
}
