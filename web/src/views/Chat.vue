<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NSpin, NEmpty, NButton, useMessage } from 'naive-ui'
import CommandPalette from '@/components/CommandPalette.vue'
import AgentActivitySidebar from '@/components/AgentActivitySidebar.vue'
import IDELayout from '@/components/ide/IDELayout.vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { useAgentStore } from '@/stores/agent'

const router = useRouter()
const message = useMessage()
const chatStore = useChatStore()
const authStore = useAuthStore()
const agentStore = useAgentStore()

const showCommandPalette = ref(false)
const isInitializing = ref(true)
const initError = ref<string | null>(null)

/**
 * 是否显示 Agent 活动侧边栏
 */
const showAgentActivitySidebar = ref(false)

/**
 * 从 agent store 获取真实数据
 */
const agentStatusSnapshots = computed(() => agentStore.getAllAgentStatusSnapshots())
const availableAgents = computed(() => agentStore.availableAgentTypes)

onMounted(async () => {
  if (!authStore.token || !authStore.isLoggedIn) {
    console.warn('[Chat] 用户未登录，重定向到登录页面')
    router.replace('/login')
    return
  }

  isInitializing.value = true
  initError.value = null

  try {
    console.log('[Chat] 开始初始化...')

    await chatStore.connect(authStore.token || undefined)
    console.log('[Chat] WebSocket 连接成功， isConnected:', chatStore.isConnected)

    agentStore.setupWebSocketListeners()

    console.log('[Chat] 获取会话列表...')
    await chatStore.listSessions()
    console.log('[Chat] 会话列表获取完成，sessions:', chatStore.sessions)

    const sessions = chatStore.sessions || []
    console.log('[Chat] 会话数量:', sessions.length)
    if (sessions.length > 0) {
      console.log('[Chat] 加载第一个会话:', sessions[0].id)
      await chatStore.loadSession(sessions[0].id)
    } else {
      console.log('[Chat] 没有会话，创建新会话...')
      await chatStore.createSession(undefined, undefined, true)
    }

    console.log('[Chat] 初始化完成，currentSessionId:', chatStore.currentSessionId)

    await agentStore.loadAvailableAgentTypes()
    console.log('[Chat] Agent 类型列表加载完成')
  } catch (error: any) {
    console.error('初始化失败:', error)
    initError.value = error?.message || '初始化失败，请重试'
    message.error(initError.value || '初始化失败')
  } finally {
    isInitializing.value = false
  }

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
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    showCommandPalette.value = !showCommandPalette.value
  }
}

/**
 * 重新初始化
 */
async function handleRetry(): Promise<void> {
  if (!authStore.token || !authStore.isLoggedIn) {
    console.warn('[Chat] 用户未登录，重定向到登录页面')
    router.replace('/login')
    return
  }

  isInitializing.value = true
  initError.value = null

  try {
    console.log('[Chat] 开始重新初始化...')

    await chatStore.connect(authStore.token || undefined)
    console.log('[Chat] WebSocket 重新连接成功')
    await chatStore.listSessions()
    console.log('[Chat] 会话列表重新获取完成，sessions:', chatStore.sessions)

    const sessionsAfterList = chatStore.sessions || []
    console.log('[Chat] 会话数量:', sessionsAfterList.length)
    if (sessionsAfterList.length === 0) {
      await chatStore.createSession(undefined, undefined, true)
    } else if (chatStore.currentSessionId) {
      await chatStore.loadSession(chatStore.currentSessionId)
    } else if (sessionsAfterList.length > 0) {
      await chatStore.loadSession(sessionsAfterList[0].id)
    }

    message.success('重新连接成功')
  } catch (error: any) {
    console.error('重新初始化失败:', error)
    initError.value = error?.message || '初始化失败，请重试'
    message.error(initError.value || '初始化失败')
  } finally {
    isInitializing.value = false
  }
}

/**
 * 命令选择处理函数
 * @param command 选中的命令
 */
function handleCommandSelect(command: string): void {
  showCommandPalette.value = false

  switch (command) {
    case 'new':
      chatStore.createSession()
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
</script>

<template>
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

  <!-- 主内容：IDE 布局 -->
  <IDELayout
    v-else
    :session-id="chatStore.currentSessionId || undefined"
  />

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
</template>

<style scoped>
.initialization-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  z-index: 1000;
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
</style>
