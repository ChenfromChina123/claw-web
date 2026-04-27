<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NLayout, NLayoutContent, NSpin, NButton, NEmpty, useMessage, NIcon } from 'naive-ui'
import { ChatbubblesOutline, ListOutline, SearchOutline } from '@vicons/ionicons5'
import ChatSidebar from '@/components/ChatSidebar.vue'
import ChatMessageList from '@/components/ChatMessageList.vue'
import ChatInput from '@/components/ChatInput.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import GlassPanel from '@/components/common/GlassPanel.vue'
import AgentStatusPanel from '@/components/AgentStatusPanel.vue'
import AgentActivitySidebar from '@/components/AgentActivitySidebar.vue'
import IdeSessionsPanel from '@/views/IdeSessionsPanel.vue'
import SessionSwitcher from '@/components/SessionSwitcher.vue'
import MessageSearch from '@/components/MessageSearch.vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { useAgentStore } from '@/stores/agent'
import type { MultiAgentOrchestrationState, AgentTaskStep, AgentRuntimeState } from '@/types/agent'
import { createInitialOrchestrationState } from '@/types/agent'

const router = useRouter()
const message = useMessage()
const chatStore = useChatStore()
const authStore = useAuthStore()
const agentStore = useAgentStore()

const showCommandPalette = ref(false)
const inputRef = ref<InstanceType<typeof ChatInput> | null>(null)
const isInitializing = ref(true)
const initError = ref<string | null>(null)
const sidebarCollapsed = ref(false)

// 防止重复初始化的锁
let isPageInitializing = false

/**
 * 会话创建去重锁
 * 防止在短时间内（如页面刷新、组件重载）重复创建会话
 * 使用时间戳判断，5秒内的重复创建请求将被忽略
 */
let lastSessionCreateTime = 0
const SESSION_CREATE_DEBOUNCE_MS = 5000

/**
 * 消息搜索弹窗
 */
const showMessageSearch = ref(false)

/**
 * 顶部视图切换：会话管理 vs 聊天
 */
const topView = ref<'chat' | 'sessions'>('chat')

/**
 * 显示会话切换器（在聊天界面内快速切换）
 */
const showSessionSwitcher = ref(false)

/**
 * Agent 协调状态（从真实数据转换）
 */
const orchestrationState = ref<MultiAgentOrchestrationState>(createInitialOrchestrationState())

/**
 * 是否显示 Agent 状态面板
 */
const showAgentPanel = ref(false)

/**
 * 是否显示 Agent 活动侧边栏（新）
 */
const showAgentActivitySidebar = ref(false)

/**
 * 显示导出/分享弹窗
 */
const showExportShareModal = ref(false)

/**
 * 从 agent store 获取真实数据
 */
const agentStatusSnapshots = computed(() => agentStore.getAllAgentStatusSnapshots())
const availableAgents = computed(() => agentStore.availableAgentTypes)
const currentAgents = computed(() => agentStore.currentAgents)
const agentTree = computed(() => agentStore.agentTree)

/**
 * 获取当前活跃的 Agent 状态（用于显示）
 */
const currentAgentStatus = computed(() => {
  const snapshots = agentStatusSnapshots.value
  if (snapshots.length === 0) {
    return {
      status: 'idle',
      currentTurn: 0,
      maxTurns: 100,
      progress: 0,
    }
  }
  // 返回最新的状态
  const latest = snapshots[snapshots.length - 1]
  return latest.executionStatus
})

/**
 * 获取工具调用列表
 */
const currentToolCalls = computed(() => {
  const snapshots = agentStatusSnapshots.value
  if (snapshots.length === 0) return []
  return snapshots[snapshots.length - 1].toolCalls || []
})

/**
 * 获取团队成员
 */
const currentTeamMembers = computed(() => {
  const snapshots = agentStatusSnapshots.value
  if (snapshots.length === 0) return []
  return snapshots[snapshots.length - 1].teamMembers || []
})

/**
 * 将 agentStore 中的工作流步骤转换为 orchestrationState 格式
 */
function convertToTaskSteps(): AgentTaskStep[] {
  const steps: AgentTaskStep[] = []
  const now = new Date()
  
  currentAgents.value.forEach(agent => {
    agent.workflowSteps.forEach(workflowStep => {
      let status: 'pending' | 'active' | 'completed' | 'failed' = 'pending'
      if (workflowStep.status === 'COMPLETED') status = 'completed'
      else if (workflowStep.status === 'FAILED') status = 'failed'
      else if (workflowStep.status === 'RUNNING' || workflowStep.status === 'THINKING') status = 'active'
      
      steps.push({
        id: workflowStep.id,
        agentType: agent.agentType as any || 'general-purpose',
        description: workflowStep.message,
        status,
        startTime: new Date(workflowStep.createdAt),
        completedTime: workflowStep.completedAt ? new Date(workflowStep.completedAt) : undefined
      })
    })
  })
  
  return steps.sort((a, b) => (a.startTime?.getTime() || 0) - (b.startTime?.getTime() || 0))
}

/**
 * 将 agentStore 中的 agent 转换为 orchestrationState 格式
 */
function convertToAgentRuntimeStates(): { orchestrator?: AgentRuntimeState, subAgents: AgentRuntimeState[] } {
  const subAgents: AgentRuntimeState[] = []
  let orchestrator: AgentRuntimeState | undefined
  
  const builtInAgents = [
    { agentType: 'general-purpose', name: '通用 Agent', description: '处理各种复杂任务', color: '#3b82f6', icon: '🤖', source: 'built-in' },
    { agentType: 'Explore', name: '探索 Agent', description: '代码库探索和搜索', color: '#10b981', icon: '🔍', source: 'built-in' },
    { agentType: 'Plan', name: '规划 Agent', description: '任务规划和方案设计', color: '#f59e0b', icon: '�', source: 'built-in' }
  ]
  
  currentAgents.value.forEach((agent, index) => {
    const agentDef = builtInAgents.find(a => a.agentType === agent.agentType) || builtInAgents[0]
    
    let status: 'idle' | 'thinking' | 'working' | 'completed' | 'failed' = 'idle'
    if (agent.status === 'COMPLETED') status = 'completed'
    else if (agent.status === 'FAILED') status = 'failed'
    else if (agent.status === 'THINKING') status = 'thinking'
    else if (agent.status === 'RUNNING' || agent.status === 'BLOCKED') status = 'working'
    
    const runtimeState: AgentRuntimeState = {
      agentId: agent.agentId,
      agentDefinition: agentDef as any,
      status,
      currentTask: agent.workflowSteps[agent.workflowSteps.length - 1]?.message || '',
      progress: agent.workflowSteps.filter(s => s.status === 'COMPLETED').length / Math.max(agent.workflowSteps.length, 1) * 100,
      completedTasks: agent.workflowSteps.filter(s => s.status === 'COMPLETED').length,
      totalTasks: agent.workflowSteps.length,
      startTime: new Date(agent.createdAt),
      lastActivityTime: new Date(agent.updatedAt)
    }
    
    if (index === 0 && !agent.parentAgentId) {
      orchestrator = runtimeState
    } else {
      subAgents.push(runtimeState)
    }
  })
  
  return { orchestrator, subAgents }
}

/**
 * 从 agentStore 更新 orchestrationState
 */
function updateOrchestrationStateFromStore(): void {
  const { orchestrator, subAgents } = convertToAgentRuntimeStates()
  const taskSteps = convertToTaskSteps()
  
  let overallStatus: 'planning' | 'executing' | 'completed' | 'failed' = 'planning'
  if (taskSteps.some(s => s.status === 'active')) overallStatus = 'executing'
  else if (taskSteps.length > 0 && taskSteps.every(s => s.status === 'completed')) overallStatus = 'completed'
  else if (taskSteps.some(s => s.status === 'failed')) overallStatus = 'failed'
  
  orchestrationState.value = {
    orchestrator,
    subAgents,
    taskSteps,
    overallStatus,
    startTime: taskSteps[0]?.startTime
  }
}

/**
 * 监听 agentStore 变化，更新 orchestrationState
 */
watch([() => agentStore.currentAgents, () => agentStore.agentTree], () => {
  updateOrchestrationStateFromStore()
}, { deep: true, immediate: true })

onMounted(async () => {
  // 防止重复初始化（Vue 3 的 <KeepAlive> 或热更新可能触发多次 onMounted）
  if (isPageInitializing) {
    console.warn('[Chat] Page already initializing, skipping duplicate onMounted call')
    return
  }
  isPageInitializing = true

  // 检查是否已登录
  if (!authStore.token || !authStore.isLoggedIn) {
    console.warn('[Chat] 用户未登录，重定向到登录页面')
    router.replace('/login')
    return
  }

  isInitializing.value = true
  initError.value = null

  try {
    console.log('[Chat] 开始初始化...')

    // 步骤1：连接 WebSocket（等待完全认证完成）
    console.log('[Chat] 步骤1: 连接 WebSocket...')
    await chatStore.connect(authStore.token || undefined)
    console.log('[Chat] WebSocket 连接成功，isConnected:', chatStore.isConnected)

    // 额外等待一小段时间，确保 WebSocket 完全就绪（避免竞态条件）
    await new Promise(resolve => setTimeout(resolve, 100))

    // 设置 Agent Store 的 WebSocket 监听
    agentStore.setupWebSocketListeners()

    // 步骤2：获取会话列表（确保在 WebSocket 就绪后）
    console.log('[Chat] 步骤2: 获取会话列表...')
    await chatStore.listSessions()
    console.log('[Chat] 会话列表获取完成，sessions:', chatStore.sessions)

    // 步骤 3：加载已有会话（不自动创建新会话）
    const sessions = chatStore.sessions || []
    console.log('[Chat] 步骤 3: 会话数量:', sessions.length)

    if (sessions.length > 0) {
      // 有现有会话：优先恢复上次选中的会话
      const lastSessionId = chatStore.currentSessionId
      const targetSession = lastSessionId && sessions.find(s => s.id === lastSessionId)
        ? sessions.find(s => s.id === lastSessionId)
        : sessions[0]
      console.log('[Chat] 加载已有会话:', targetSession?.id, '上次会话:', lastSessionId)

      try {
        await chatStore.loadSession(targetSession?.id || sessions[0].id)
        console.log('[Chat] 会话加载成功，currentSessionId:', chatStore.currentSessionId)
      } catch (loadError: any) {
        console.error('[Chat] 会话加载失败:', loadError)
        // 会话加载失败时不自动创建新会话，由用户手动创建
        console.warn('[Chat] 会话加载失败，不自动创建新会话')
      }
    } else {
      // 无现有会话：不自动创建，由用户手动创建
      console.log('[Chat] 会话列表为空，等待用户手动创建会话')
    }

    console.log('[Chat] 初始化完成，currentSessionId:', chatStore.currentSessionId)

    // 聚焦输入框
    nextTick(() => {
      inputRef.value?.focus()
    })

    // 加载 Agent 类型列表
    await agentStore.loadAvailableAgentTypes()
    console.log('[Chat] Agent 类型列表加载完成')
  } catch (error: any) {
    console.error('初始化失败:', error)
    initError.value = error?.message || '初始化失败，请重试'
    message.error(initError.value || '初始化失败')
  } finally {
    isInitializing.value = false
    isPageInitializing = false
  }

  // 监听键盘事件
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  chatStore.disconnect()
  document.removeEventListener('keydown', handleKeyDown)
})

/**
 * 处理键盘快捷键事件
 * @param e 键盘事件对象
 */
function handleKeyDown(e: KeyboardEvent): void {
  // Ctrl/Cmd + K 打开命令面板
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    showCommandPalette.value = !showCommandPalette.value
  }
  // Ctrl/Cmd + L 打开会话切换器
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
    e.preventDefault()
    showSessionSwitcher.value = !showSessionSwitcher.value
  }
  // Ctrl/Cmd + F 打开消息搜索
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    showMessageSearch.value = true
  }
}

/**
 * 创建会话（带去重和重试机制）
 *
 * 功能说明：
 * 1. 去重检查：使用时间戳防止短时间内重复创建
 * 2. 重试机制：容器分配失败时自动重试
 * 3. 友好提示：提供清晰的错误反馈
 *
 * 去重原理：
 * - 记录上次创建会话的时间戳
 * - 如果距离上次创建不到5秒，跳过本次创建
 * - 防止页面刷新、组件重载等场景下的重复创建
 *
 * @param maxRetries 最大重试次数（默认2次）
 */
async function createSessionWithDebounce(maxRetries = 2): Promise<void> {
  // 去重检查：如果短时间内已经创建过会话，直接返回
  const now = Date.now()
  if (now - lastSessionCreateTime < SESSION_CREATE_DEBOUNCE_MS) {
    const timeLeft = Math.ceil((SESSION_CREATE_DEBOUNCE_MS - (now - lastSessionCreateTime)) / 1000)
    console.log(`[Chat] 跳过重复创建会话（${timeLeft}秒内已创建过）`)
    // 检查当前是否已有会话（可能是刚刚创建的）
    if (chatStore.sessions.length > 0 && chatStore.currentSessionId) {
      console.log('[Chat] 已有会话，跳过创建')
      return
    }
    // 如果确实没有会话（异常情况），允许创建
    console.warn('[Chat] 虽然在去重期内，但没有会话，强制创建')
  }

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Chat] 创建会话，第 ${attempt} 次尝试...`)

      // 调用 store 的 createSession（已内置并发控制）
      await chatStore.createSession(undefined, undefined, false)

      // 创建成功：记录时间戳
      lastSessionCreateTime = Date.now()
      console.log('[Chat] 会话创建成功')
      return
    } catch (error: any) {
      lastError = error
      console.error(`[Chat] 第 ${attempt} 次创建失败:`, error)

      // 判断是否是容器分配超时错误
      const isContainerTimeout = error?.message?.includes('超时') ||
                                 error?.message?.includes('容器启动') ||
                                 error?.message?.includes('分配失败')

      if (isContainerTimeout && attempt < maxRetries) {
        // 容器分配超时，等待后重试（指数退避）
        const waitTime = 2000 * attempt // 2秒、4秒
        console.warn(`[Chat] 容器分配超时，${waitTime / 1000}秒后重试...`)
        message.warning(`容器分配超时，${waitTime / 1000}秒后重试...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      } else {
        // 其他错误或最后一次重试失败
        break
      }
    }
  }

  // 所有重试都失败
  const errorMsg = lastError?.message || '创建会话失败'
  console.error('[Chat] 会话创建最终失败:', errorMsg)

  // 提供友好的错误提示
  if (errorMsg.includes('超时')) {
    message.error('容器分配超时，请稍后重试或联系管理员')
  } else if (errorMsg.includes('资源')) {
    message.error('系统资源不足，请稍后重试')
  } else {
    message.error(errorMsg)
  }

  throw lastError
}

/**
 * 重新初始化（用户点击重试按钮时调用）
 */
async function handleRetry(): Promise<void> {
  console.log('[Chat] 用户点击重试，重新初始化...')
  isInitializing.value = true
  initError.value = null
  isPageInitializing = true

  // 重置去重锁（允许用户手动重试时创建会话）
  lastSessionCreateTime = 0

  try {
    // 重连 WebSocket
    await chatStore.connect(authStore.token || undefined)

    // 等待 WebSocket 就绪
    await new Promise(resolve => setTimeout(resolve, 100))

    // 获取会话列表
    await chatStore.listSessions()

    // 加载或创建会话
    const sessions = chatStore.sessions || []
    if (sessions.length > 0) {
      const lastSessionId = chatStore.currentSessionId
      const targetSession = lastSessionId && sessions.find(s => s.id === lastSessionId)
        ? sessions.find(s => s.id === lastSessionId)
        : sessions[0]
      try {
        await chatStore.loadSession(targetSession?.id || sessions[0].id)
      } catch {
        await createSessionWithDebounce()
      }
    } else {
      await createSessionWithDebounce()
    }

    // 加载 Agent 类型列表
    await agentStore.loadAvailableAgentTypes()
  } catch (error: any) {
    console.error('[Chat] 重试失败:', error)
    initError.value = error?.message || '重试失败'
    message.error(initError.value)
  } finally {
    isInitializing.value = false
    isPageInitializing = false
  }
}

/**
 * 发送消息处理函数
 * @param content 消息内容
 */
function handleSendMessage(content: string, modelId?: string, imageAttachments?: Array<{ imageId: string; type: 'image'; mimeType?: string }>): void {
  if (!content.trim() && !imageAttachments?.length) return

  if (content.startsWith('/')) {
    message.info('命令功能开发中...')
    return
  }

  chatStore.sendMessage(content, modelId, imageAttachments)
}

/**
 * 停止当前正在进行的生成
 */
async function handleStopGeneration(): Promise<void> {
  console.log('[Chat] handleStopGeneration triggered')
  await chatStore.interruptGeneration()
}

/**
 * 命令选择处理函数
 * @param command 选中的命令
 */
function handleCommandSelect(command: string): void {
  showCommandPalette.value = false
  
  switch (command) {
    case 'new':
      chatStore.createSession(undefined, undefined, false)
      break
    case 'clear':
      chatStore.clearSession()
      break
    case 'export':
      message.info('导出功能开发中...')
      break
    default:
      break
  }
}

/**
 * 中断 Agent 执行（参考 claw-web/src 的 useCancelRequest.ts）
 * @param agentId 要中断的 Agent ID
 */
async function handleInterruptAgent(agentId: string) {
  console.log(`[Chat] 用户请求中断 Agent: ${agentId}`)

  try {
    // 调用 API 中断 Agent
    const { interruptAgent } = await import('@/api/agentApi')
    const result = await interruptAgent(agentId)

    if (result.success) {
      message.success(`✅ Agent 已被成功中断`)
      console.log(`[Chat] Agent ${agentId} 中断成功`)

      // 更新本地状态：将相关工具调用标记为错误/已中断
      const interruptedToolCalls = chatStore.toolCalls.filter(
        tc => tc.status === 'executing'
      )
      interruptedToolCalls.forEach(tc => {
        tc.status = 'error'
        tc.toolOutput = {
          error: '用户中断执行',
          errorType: 'INTERRUPTED',
          timestamp: new Date().toISOString(),
        }
      })

      // 触发响应式更新
      chatStore.toolCalls = [...chatStore.toolCalls]
    } else {
      message.error(`❌ 中断失败: ${result.message || '未知错误'}`)
    }
  } catch (error: any) {
    console.error('[Chat] 中断 Agent 失败:', error)
    message.error(`❌ 中断失败: ${error?.message || '网络错误'}`)
  }
}

/**
 * 获取当前活跃的 Agent ID（用于中断功能）
 * 从 agentStore 或 toolCalls 中提取
 */
function getCurrentAgentId(): string | undefined {
  // 优先从 agentStore 获取
  const runningAgents = agentStore.currentAgents.filter(
    a => a.status === 'RUNNING' || a.status === 'THINKING'
  )
  if (runningAgents.length > 0) {
    return runningAgents[0].agentId
  }

  // 其次从正在执行的工具调用中获取
  const executingTool = chatStore.toolCalls.find(tc => tc.status === 'executing')
  if (executingTool) {
    return executingTool.id
  }

  return undefined
}

/**
 * 处理 ToolUse 组件的中断事件
 */
function handleToolInterrupt(agentId: string) {
  handleInterruptAgent(agentId)
}

/** 沉浸式聊天无底部终端：提示前往 IDE 工作台 */
function handleFocusTerminalHint() {
  message.info('底部终端在 IDE 工作台中可用，请从左侧活动栏进入工作台。', { duration: 4500 })
}

/**
 * 刷新 Agent 状态
 */
async function handleRefreshAgentStatus() {
  try {
    await agentStore.loadAvailableAgentTypes()
    message.success('Agent 状态已刷新')
  } catch (error) {
    message.error('刷新 Agent 状态失败')
  }
}

/**
 * 添加团队成员
 */
function handleAddTeamMember() {
  message.info('添加团队成员功能开发中')
  // TODO: 实现添加团队成员功能
}

/**
 * 会话切换器关闭回调
 */
function handleSessionSwitcherClose() {
  showSessionSwitcher.value = false
}

/**
 * 会话切换器选择回调
 */
function handleSessionSwitcherSelect(sessionId: string) {
  console.log('[Chat] 切换到会话:', sessionId)
  message.success('已切换会话')
}

/**
 * 消息搜索选择回调
 */
function handleMessageSearchSelect(messageId: string, sessionId: string) {
  console.log('[Chat] 选择消息:', messageId, '会话:', sessionId)
  
  // 如果不在当前会话，先切换会话
  if (sessionId !== chatStore.currentSessionId) {
    chatStore.loadSession(sessionId).then(() => {
      message.success('已定位到消息')
      // 滚动到指定消息
      handleQuickNavNavigate(messageId)
    }).catch((error) => {
      console.error('加载会话失败:', error)
      message.error('加载会话失败')
    })
  } else {
    message.success('已定位到消息')
    // 滚动到指定消息
    handleQuickNavNavigate(messageId)
  }
}

/**
 * 处理快速导航
 */
function handleQuickNavNavigate(messageId: string) {
  // 滚动到指定的消息
  const messageElement = document.querySelector(`[data-message-id="${messageId}"]`)
  if (messageElement) {
    messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // 高亮显示
    messageElement.classList.add('highlight-message')
    setTimeout(() => {
      messageElement.classList.remove('highlight-message')
    }, 2000)
  }
}
</script>

<template>
  <NLayout has-sider class="chat-layout">
    <!-- 侧边栏 -->
    <ChatSidebar @update:collapsed="sidebarCollapsed = $event" />
    
    <!-- 主内容区：内层滚动容器用 flex 占满高度，避免整页被消息撑高把输入区顶出视口 -->
    <NLayoutContent
      class="chat-content"
      :native-scrollbar="false"
      content-style="display: flex; flex-direction: column; height: 100%;"
    >
      <!-- 顶部视图切换 + Agent 活动侧边栏切换 -->
      <div class="top-bar">
        <!-- 视图切换标签 -->
        <div class="view-tabs">
          <button
            type="button"
            class="view-tab"
            :class="{ active: topView === 'chat' }"
            @click="topView = 'chat'"
          >
            <NIcon :size="16"><ChatbubblesOutline /></NIcon>
            聊天
          </button>
          <button
            type="button"
            class="view-tab"
            :class="{ active: topView === 'sessions' }"
            @click="topView = 'sessions'"
          >
            <NIcon :size="16"><ListOutline /></NIcon>
            会话管理
          </button>
        </div>

        <!-- 右侧工具按钮 -->
        <div class="top-bar-actions">
          <!-- 消息搜索按钮 -->
          <NButton
            quaternary
            circle
            class="action-button"
            @click="showMessageSearch = true"
          >
            <template #icon>
              <NIcon :size="18">
                <SearchOutline />
              </NIcon>
            </template>
          </NButton>

          <!-- Agent 活动侧边栏切换按钮 -->
          <div class="agent-activity-toggle" :class="{ active: showAgentActivitySidebar }" @click="showAgentActivitySidebar = !showAgentActivitySidebar">
            <span class="toggle-icon">🤖</span>
            <span class="toggle-label">活动</span>
            <div v-if="agentStore.pendingPermissionList.length > 0" class="pending-indicator">
              {{ agentStore.pendingPermissionList.length }}
            </div>
          </div>

          <!-- 导出/分享按钮 -->
          <NButton
            size="small"
            quaternary
            class="export-btn"
            @click="showExportShareModal = true"
          >
            <template #icon>
              <span class="export-icon">📤</span>
            </template>
            导出/分享
          </NButton>
        </div>
      </div>

      <!-- 背景装饰 -->
      <div class="chat-bg-decoration">
        <div class="bg-grid-pattern"></div>
        <div class="bg-glow bg-glow-1"></div>
        <div class="bg-glow bg-glow-2"></div>
      </div>

      <!-- 初始化加载状态 -->
      <div v-if="isInitializing" class="initialization-container">
        <NSpin size="large" />
        <p class="initialization-text">正在初始化...</p>
      </div>

      <!-- 初始化错误状态 -->
      <div v-else-if="initError" class="initialization-container">
        <NEmpty description="初始化失败">
          <template #extra>
            <p class="error-text">{{ initError }}</p>
            <NButton type="primary" @click="handleRetry">重试</NButton>
          </template>
        </NEmpty>
      </div>

      <!-- 主内容容器 -->
      <div v-else class="chat-main" :class="{ 'with-agent-panel': showAgentPanel }">
        <!-- 会话管理视图 -->
        <div v-if="topView === 'sessions'" class="sessions-view">
          <IdeSessionsPanel />
        </div>

        <!-- 聊天视图 -->
        <template v-else>
          <!-- 聊天区域 -->
          <div class="chat-area">
            <!-- 消息列表 -->
            <ChatMessageList
              :messages="chatStore.messages"
              :tool-calls="chatStore.toolCalls"
              :is-loading="chatStore.isLoading"
              :current-agent-id="getCurrentAgentId()"
              show-timeline-nav
              class="message-list-container"
              @interrupt="handleToolInterrupt"
              @focus-terminal="handleFocusTerminalHint"
            />

            <!-- 输入区包装器 -->
            <div class="input-wrapper">
              <GlassPanel variant="normal" bordered class="input-container">
                <ChatInput
                  ref="inputRef"
                  :disabled="!chatStore.currentSessionId"
                  :sidebar-collapsed="sidebarCollapsed"
                  :session-id="chatStore.currentSessionId || undefined"
                  :is-generating="chatStore.isLoading"
                  @send="handleSendMessage"
                  @stop="handleStopGeneration"
                  @focus="showCommandPalette = false"
                />
              </GlassPanel>
            </div>
          </div>

          <!-- Agent 状态面板 -->
          <Transition name="agent-panel">
            <div v-if="showAgentPanel" class="agent-panel">
              <AgentStatusPanel 
                :agents="availableAgents"
                :execution-status="currentAgentStatus"
                :tool-calls="currentToolCalls"
                :team-members="currentTeamMembers"
                @select="(agent) => console.log('Agent selected:', agent)"
                @abort="handleAbortAgent"
                @refresh="handleRefreshAgentStatus"
                @add-member="handleAddTeamMember"
              />
            </div>
          </Transition>
        </template>
      </div>
    </NLayoutContent>
    
    <!-- 命令面板（全局覆盖层） -->
    <Teleport to="body">
      <CommandPalette
        :show="showCommandPalette"
        @close="showCommandPalette = false"
        @select="handleCommandSelect"
      />
    </Teleport>
    
    <!-- Agent 活动侧边栏 -->
    <AgentActivitySidebar
      v-model:show="showAgentActivitySidebar"
      default-tab="workflow"
      @step-click="(step) => console.log('Step clicked:', step)"
      @agent-click="(agentId) => console.log('Agent clicked:', agentId)"
    />
    
    <!-- 会话切换器 -->
    <SessionSwitcher
      :show="showSessionSwitcher"
      @close="handleSessionSwitcherClose"
      @select="handleSessionSwitcherSelect"
    />
    
    <!-- 消息搜索 -->
    <MessageSearch
      :show="showMessageSearch"
      @close="showMessageSearch = false"
      @select-message="handleMessageSearchSelect"
    />
    
    <!-- 导出/分享弹窗 -->
    <ExportShareModal
      v-model:show="showExportShareModal"
    />
  </NLayout>
</template>

<style scoped>
/* 确保最外层容器铺满全屏且不产生外部滚动条 */
.chat-layout {
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background: var(--bg-primary);
}

.chat-content {
  flex: 1;
  height: 100%;
  position: relative;
}

/* ---- 背景装饰 ---- */
.chat-bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.5;
}

.bg-grid-pattern {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
}

.bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  animation: glowFloat 30s ease-in-out infinite;
}

.bg-glow-1 {
  width: 500px;
  height: 500px;
  background: var(--color-primary-light);
  top: -200px;
  right: -150px;
  opacity: 0.3;
}

.bg-glow-2 {
  width: 400px;
  height: 400px;
  background: var(--color-info-light);
  bottom: -200px;
  left: -100px;
  opacity: 0.25;
  animation-delay: -15s;
}

@keyframes glowFloat {
  0%, 100% { transform: translate(0, 0); }
  33% { transform: translate(30px, -20px); }
  66% { transform: translate(-20px, 30px); }
}

/* ---- 初始化状态 ---- */
.initialization-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
  gap: 16px;
}

.initialization-text {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.error-text {
  font-size: 14px;
  color: var(--color-error);
  margin: 8px 0 16px;
  text-align: center;
}

/* ---- 顶部工具栏（切换按钮） ---- */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 20px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
  z-index: 10;
  flex-shrink: 0;
}

.top-bar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-button {
  transition: all var(--transition-fast, 150ms) ease;
}

.action-button:hover {
  background: rgba(99, 102, 241, 0.15);
  color: var(--color-primary);
}

/* 视图切换标签 */
.view-tabs {
  display: flex;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  padding: 4px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.view-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: none;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
  background: transparent;
  transition: all var(--transition-fast, 150ms) ease;
}

.view-tab:hover {
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.08);
}

.view-tab.active {
  color: #fff;
  background: rgba(99, 102, 241, 0.3);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

/* ---- Agent 活动侧边栏切换按钮（已存在，样式已定义） ---- */
.agent-activity-toggle {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  cursor: pointer;
  z-index: 10;
  transition: all var(--transition-fast, 150ms) ease;
}

.agent-activity-toggle:hover {
  background: rgba(24, 160, 88, 0.15);
  border-color: rgba(24, 160, 88, 0.3);
}

.agent-activity-toggle.active {
  background: rgba(24, 160, 88, 0.2);
  border-color: rgba(24, 160, 88, 0.5);
}

.toggle-icon {
  font-size: 14px;
}

.toggle-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.pending-indicator {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: #d03050;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pulse 2s ease infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* ---- 会话管理视图 ---- */
.sessions-view {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ---- 主内容容器 ---- */
.chat-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  position: relative;
  z-index: 1;
  overflow: hidden;
}

.chat-main.with-agent-panel {
  flex-direction: row;
}

/* ---- 聊天区域 ---- */
.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-width: 0;
}

.with-agent-panel .chat-area {
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

/* ---- Agent 状态面板 ---- */
.agent-panel {
  width: 320px;
  flex-shrink: 0;
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  background: rgba(0, 0, 0, 0.1);
}

/* Agent 面板过渡动画 */
.agent-panel-enter-active,
.agent-panel-leave-active {
  transition: all var(--transition-normal, 250ms) ease;
}

.agent-panel-enter-from,
.agent-panel-leave-to {
  width: 0;
  opacity: 0;
  transform: translateX(20px);
}

/* 消息列表容器：必须能够收缩且拥有独立滚动条 */
.message-list-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 0;
}

/* 输入区域包装器：确保它始终固定在底部 */
.input-wrapper {
  flex-shrink: 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.input-container {
  margin: 0 20px 20px;
  border-radius: 16px !important;
  padding: 4px !important;
  transition: all var(--transition-normal, 250ms) ease;
  max-width: 900px;
  margin-left: auto;
  margin-right: auto;
}

.input-container:hover {
  border-color: var(--border-accent) !important;
  box-shadow: var(--shadow-md);
}

/* ---- 导出/分享按钮 ---- */
.export-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  transition: all var(--transition-fast, 150ms) ease;
}

.export-btn:hover {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
  color: rgba(255, 255, 255, 0.95);
}

.export-icon {
  font-size: 14px;
}

/* ---- 响应式适配 ---- */
@media (max-width: 768px) {
  .input-container {
    margin: 12px 12px 12px;
  }

  .bg-glow {
    display: none;
  }

  .top-bar {
    padding: 8px 12px;
  }

  .view-tab {
    padding: 5px 10px;
    font-size: 12px;
  }

  .toggle-label {
    display: none;
  }
}
</style>
