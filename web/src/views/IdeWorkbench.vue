<script setup lang="ts">
/**
 * IdeWorkbench - IDE 工作台视图
 *
 * 布局：活动栏 + 主体三列（左栏 Explorer/会话切换 | Editor | AI Agent）
 * 会话列表在左栏与资源管理器切换展示；右侧 AI 栏独占纵向空间供对话与输入。
 */

import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NIcon,
  NSpin,
  NEmpty,
  useMessage,
} from 'naive-ui'
import {
  FolderOpen,
  SettingsOutline,
  DesktopOutline,
  ChatbubblesOutline,
  Add,
} from '@vicons/ionicons5'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'

import AgentWorkdirTreePanel from '@/components/workdir/AgentWorkdirTreePanel.vue'
import AgentWorkdirEditorPanel from '@/components/workdir/AgentWorkdirEditorPanel.vue'
import IdeSessionsPanel from './IdeSessionsPanel.vue'
import ChatMessageList from '@/components/ChatMessageList.vue'
import ChatInput from '@/components/ChatInput.vue'
import CommandPalette from '@/components/CommandPalette.vue'

import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { useAgentStore } from '@/stores/agent'
import { useAgentWorkdir } from '@/composables/useAgentWorkdir'

const router = useRouter()
const message = useMessage()
const chatStore = useChatStore()
const authStore = useAuthStore()
const agentStore = useAgentStore()

// ========== 初始化状态 ==========
const isInitializing = ref(true)
const initError = ref<string | null>(null)

// ========== UI 状态 ==========
const showCommandPalette = ref(false)
const inputRef = ref<InstanceType<typeof ChatInput> | null>(null)
/** 左侧边栏视图：资源管理器 vs 会话列表（释放右侧 AI 栏垂直空间） */
const leftSidebarView = ref<'explorer' | 'sessions'>('explorer')

// ========== 会话 ID ref ==========
const sessionIdRef = computed(() => chatStore.currentSessionId || '')

// ========== 工作目录上下文（单一 provide） ==========
const workdir = useAgentWorkdir(sessionIdRef)

/** 中间栏标题：与 VS Code 一致，显示当前文件名大写 */
const editorTabTitle = computed(() => {
  const p = workdir.currentFilePath.value
  if (!p) return 'EDITOR'
  const name = p.split(/[/\\]/).pop() || p
  return name.toUpperCase()
})

/** 顶栏面包屑：// PROJECT … / file */
const titleBarPath = computed(() => {
  const project =
    chatStore.currentSession?.title?.trim() || 'My-Code-Project'
  const p = workdir.currentFilePath.value
  const fileName = p ? (p.split(/[/\\]/).pop() || p) : ''
  if (fileName) {
    return `// PROJECT ${project} / ${fileName}`
  }
  return `// PROJECT ${project}`
})

// ========== 初始化 ==========
onMounted(async () => {
  // 检查登录
  if (!authStore.token || !authStore.isLoggedIn) {
    router.replace('/login')
    return
  }

  isInitializing.value = true
  initError.value = null

  try {
    console.log('[IdeWorkbench] 开始初始化...')

    // 连接 WebSocket（如果尚未连接）
    if (!chatStore.isConnected) {
      await chatStore.connect(authStore.token || undefined)
    }
    
    // 设置 Agent Store 的 WebSocket 监听
    agentStore.setupWebSocketListeners()
    
    // 获取会话列表
    await chatStore.listSessions()

    // 加载或创建会话：优先恢复 localStorage 中的上次会话，避免与 useAgentWorkdir 的 sessionId 一致导致 watch 不触发、文件树永不加载
    const sessions = chatStore.sessions || []
    const persistedId = chatStore.currentSessionId
    const persistedOk =
      !!persistedId && sessions.some((s) => s.id === persistedId)

    if (sessions.length > 0) {
      const targetId = persistedOk ? persistedId! : sessions[0].id
      await chatStore.loadSession(targetId)
    } else {
      await chatStore.createSession(undefined, undefined, true)
    }

    // 等待会话稳定后初始化文件树
    await workdir.initTree()

    // 聚焦输入框
    nextTick(() => {
      inputRef.value?.focus()
    })
  } catch (error: any) {
    console.error('[IdeWorkbench] 初始化失败:', error)
    initError.value = error?.message || '初始化失败'
    message.error(initError.value || '初始化失败')
  } finally {
    isInitializing.value = false
  }

  // 监听键盘
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  // 注意：不主动 disconnect，因为用户可能回到 /chat
  document.removeEventListener('keydown', handleKeyDown)
})

// ========== 键盘快捷键 ==========
function handleKeyDown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    showCommandPalette.value = !showCommandPalette.value
  }
}

/** 活动栏全局「新建会话」，与命令面板 new 行为一致 */
function handleActivityBarNewSession(): void {
  if (chatStore.messages.length === 0) {
    message.warning('请先在当前会话中发送消息')
    return
  }
  chatStore.createSession(undefined, undefined, true)
}

// ========== 发送消息 ==========
function handleSendMessage(content: string, modelId?: string): void {
  if (!content.trim()) return

  if (content.startsWith('/')) {
    message.info('命令功能开发中...')
    return
  }

  chatStore.sendMessage(content, modelId)
}

// ========== 命令选择 ==========
function handleCommandSelect(command: string): void {
  showCommandPalette.value = false

  switch (command) {
    case 'new':
      chatStore.createSession()
      break
    case 'clear':
      chatStore.clearSession()
      break
    default:
      break
  }
}

// ========== 获取当前 Agent ID（用于中断） ==========
function getCurrentAgentId(): string | undefined {
  const runningAgents = agentStore.currentAgents.filter(
    a => a.status === 'RUNNING' || a.status === 'THINKING'
  )
  if (runningAgents.length > 0) {
    return runningAgents[0].agentId
  }

  const executingTool = chatStore.toolCalls.find(tc => tc.status === 'executing')
  if (executingTool) {
    return executingTool.id
  }

  return undefined
}

// ========== 中断工具调用 ==========
function handleToolInterrupt(agentId: string): void {
  console.log(`[IdeWorkbench] 用户请求中断 Agent: ${agentId}`)
  // 参考 Chat.vue 的实现
  import('@/api/agentApi').then(({ interruptAgent }) => {
    interruptAgent(agentId).then(result => {
      if (result.success) {
        message.success('Agent 已中断')
      }
    }).catch(() => {
      message.error('中断失败')
    })
  })
}

// ========== 重新连接 ==========
async function handleRetry(): Promise<void> {
  if (!authStore.token || !authStore.isLoggedIn) {
    router.replace('/login')
    return
  }

  isInitializing.value = true
  initError.value = null

  try {
    await chatStore.connect(authStore.token || undefined)
    await chatStore.listSessions()

    const sessions = chatStore.sessions || []
    if (sessions.length === 0) {
      await chatStore.createSession(undefined, undefined, true)
    } else {
      const persistedId = chatStore.currentSessionId
      const targetId =
        persistedId && sessions.some((s) => s.id === persistedId)
          ? persistedId
          : sessions[0].id
      await chatStore.loadSession(targetId)
    }

    await workdir.initTree()

    nextTick(() => {
      inputRef.value?.focus()
    })

    message.success('重新连接成功')
  } catch (error: any) {
    initError.value = error?.message || '初始化失败'
    message.error(initError.value || '初始化失败')
  } finally {
    isInitializing.value = false
  }
}
</script>

<template>
  <!-- 使用普通 flex 容器而非 NLayout：避免 Naive 纵向布局把活动栏与主区叠成上下块，导致顶栏视觉上「横跨全屏」 -->
  <div class="ide-layout">
    <!-- 左侧活动栏：全局新建、Explorer / 会话、沉浸式聊天、设置 -->
    <div class="activity-bar">
      <div class="activity-icons">
        <div
          class="activity-new-btn"
          title="新建会话"
          @click="handleActivityBarNewSession"
        >
          <NIcon size="20"><Add /></NIcon>
        </div>
        <div
          class="activity-icon"
          :class="{ active: leftSidebarView === 'explorer' }"
          title="资源管理器"
          @click="leftSidebarView = 'explorer'"
        >
          <NIcon size="22"><FolderOpen /></NIcon>
        </div>
        <div
          class="activity-icon"
          :class="{ active: leftSidebarView === 'sessions' }"
          title="会话列表"
          @click="leftSidebarView = 'sessions'"
        >
          <NIcon size="22"><ChatbubblesOutline /></NIcon>
        </div>
        <div
          class="activity-icon"
          title="沉浸式聊天"
          @click="router.push('/chat')"
        >
          <NIcon size="22"><DesktopOutline /></NIcon>
        </div>
      </div>

      <div class="activity-bottom">
        <div
          class="activity-icon"
          title="Settings"
          @click="router.push('/settings')"
        >
          <NIcon size="22"><SettingsOutline /></NIcon>
        </div>
      </div>
    </div>

    <!-- 主体：顶栏 + 三列（Explorer | Editor | AI Agent） -->
    <div class="ide-main ide-vscode-dark">
      <div class="ide-title-bar" :title="titleBarPath">
        {{ titleBarPath }}
      </div>

      <!-- 勿用 splitpanes default-theme：其分割条为 #fff、面板为 #f2f2f2，会产生刺眼白条 -->
      <Splitpanes class="ide-splitpanes ide-split-root">
        <Pane :size="20" min-size="14" class="explorer-pane">
          <div class="pane-header">
            <span>{{ leftSidebarView === 'explorer' ? 'EXPLORER' : 'SESSIONS' }}</span>
          </div>
          <div class="pane-content explorer-or-sessions-body">
            <AgentWorkdirTreePanel v-if="leftSidebarView === 'explorer'" />
            <IdeSessionsPanel v-else />
          </div>
        </Pane>

        <Pane :size="52" min-size="30" class="editor-pane">
          <div class="pane-header">
            <span>{{ editorTabTitle }}</span>
          </div>
          <div class="pane-content">
            <AgentWorkdirEditorPanel />
          </div>
        </Pane>

        <Pane :size="28" min-size="20" class="right-column-pane chat-pane-full">
          <div class="pane-header">
            <span>AI AGENT</span>
          </div>
          <div class="pane-content chat-content">
            <div v-if="isInitializing" class="initialization-container">
              <NSpin size="large" />
              <p>正在初始化...</p>
            </div>

            <div v-else-if="initError" class="initialization-container">
              <NEmpty description="初始化失败">
                <template #extra>
                  <p class="error-text">{{ initError }}</p>
                  <NButton type="primary" @click="handleRetry">重试</NButton>
                </template>
              </NEmpty>
            </div>

            <template v-else>
              <ChatMessageList
                :messages="chatStore.messages"
                :tool-calls="chatStore.toolCalls"
                :is-loading="chatStore.isLoading"
                :current-agent-id="getCurrentAgentId()"
                ide-density
                class="message-list"
                @interrupt="handleToolInterrupt"
              />
              <div class="chat-input-outer">
                <div class="ide-chat-input-shell">
                  <ChatInput
                    ref="inputRef"
                    variant="ide"
                    placeholder="Ask AI assistant..."
                    :disabled="!chatStore.currentSessionId"
                    :session-id="chatStore.currentSessionId || undefined"
                    @send="handleSendMessage"
                  />
                </div>
              </div>
            </template>
          </div>
        </Pane>
      </Splitpanes>
    </div>

    <!-- 命令面板 -->
    <Teleport to="body">
      <CommandPalette
        :show="showCommandPalette"
        @close="showCommandPalette = false"
        @select="handleCommandSelect"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.ide-layout {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  height: 100vh;
  width: 100%;
  background: #121212;
  overflow: hidden;
}

/* ========== 活动栏 ========== */
.activity-bar {
  width: 48px;
  min-height: 0;
  align-self: stretch;
  background: #2d2d2d;
  border-right: 1px solid #1a1a1a;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px 0;
  flex-shrink: 0;
  z-index: 2;
}

.activity-icons {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 全局新建：与 VS Code 命令调色板式入口一致，使用蓝色强调而非大块黄色 */
.activity-new-btn {
  width: 48px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(64, 158, 255, 0.95);
  transition: background 0.15s ease, color 0.15s ease;
  border-radius: 6px;
  margin: 0 4px 8px;
  border: 1px solid rgba(64, 158, 255, 0.35);
  background: rgba(64, 158, 255, 0.08);
}

.activity-new-btn:hover {
  color: #fff;
  background: rgba(64, 158, 255, 0.28);
  border-color: rgba(64, 158, 255, 0.55);
}

.activity-bottom {
  margin-top: auto;
}

.activity-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.2s ease;
  border-left: 2px solid transparent;
}

.activity-icon:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.08);
}

.activity-icon.active {
  color: #fff;
  border-left-color: #007acc;
  background: rgba(0, 122, 204, 0.2);
}

/* IDE 内强制 VS Code 深色令牌（不受全局浅色主题影响） */
.ide-vscode-dark {
  --bg-primary: #1e1e1e;
  --bg-secondary: #252526;
  --bg-tertiary: #2d2d2d;
  --bg-card: #2d2d2d;
  --text-primary: #cccccc;
  --text-secondary: #858585;
  --text-tertiary: #6e6e6e;
  --border-color: #3c3c3c;
  --border-light: rgba(255, 255, 255, 0.09);
  --glass-bg: rgba(37, 37, 38, 0.96);
  --glass-border: rgba(255, 255, 255, 0.12);
}

/* ========== 主体区域 ========== */
.ide-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #121212;
  border-left: none;
}

.ide-title-bar {
  flex-shrink: 0;
  height: 28px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  font-family: var(--font-family-mono, 'Consolas', monospace);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  background: #252526;
  border-bottom: 1px solid #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ide-split-root {
  flex: 1;
  min-height: 0;
}

/* ========== 分栏样式 ========== */
.pane-header {
  height: 32px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  background: #2d2d2d;
  border-bottom: 1px solid #1a1a1a;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.65);
  letter-spacing: 0.6px;
}

.pane-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ========== 各面板 ========== */
.explorer-pane {
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
}

.editor-pane {
  display: flex;
  flex-direction: column;
  background: #141414;
}

.right-column-pane {
  display: flex;
  flex-direction: column;
  background: #181818;
}

.chat-pane-full {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.explorer-or-sessions-body {
  min-height: 0;
  background: #1a1a1a;
}

/* ========== 对话区 ========== */
.chat-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 0;
  background: #181818;
}

.chat-input-outer {
  flex-shrink: 0;
  padding-bottom: 10px;
}

.ide-chat-input-shell {
  margin: 0 8px;
  border-radius: 8px;
  border: 1px solid #2e2e2e;
  background: #222222;
  overflow: hidden;
}

.ide-chat-input-shell :deep(.chat-input) {
  padding: 8px;
}

.ide-chat-input-shell :deep(.n-input) {
  --n-color: transparent !important;
  --n-color-focus: transparent !important;
  --n-border: none !important;
  --n-border-hover: none !important;
  --n-border-focus: none !important;
  --n-box-shadow-focus: none !important;
}

.ide-chat-input-shell :deep(.n-input__textarea-el),
.ide-chat-input-shell :deep(.n-input__input-el) {
  color: #ccc !important;
  background: transparent !important;
}

.ide-chat-input-shell :deep(.n-input__placeholder) {
  color: rgba(255, 255, 255, 0.35) !important;
}

/* ========== 初始化状态 ========== */
.initialization-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  background: #181818;
}

.error-text {
  color: var(--color-error);
  font-size: 13px;
  text-align: center;
  margin-bottom: 12px;
}

/* ========== Splitpanes：1px 级暗线 + 宽命中区，仅悬停/拖拽时高亮 ========== */
.ide-splitpanes :deep(.splitpanes__pane) {
  transition: background-color 0.15s ease;
}

.ide-splitpanes :deep(.splitpanes__splitter) {
  flex-shrink: 0;
  touch-action: none;
  box-sizing: border-box;
  border: none;
  position: relative;
  background: transparent;
}

/* 中间 1px 线条，两侧透明保证约 5px 可拖区域 */
.ide-splitpanes.splitpanes--vertical > :deep(.splitpanes__splitter) {
  width: 5px;
  min-width: 5px;
  margin: 0;
  cursor: col-resize;
  background: linear-gradient(
    90deg,
    transparent 0,
    transparent 2px,
    #3c3c3c 2px,
    #3c3c3c 3px,
    transparent 3px,
    transparent 100%
  );
}

.ide-splitpanes.splitpanes--vertical > :deep(.splitpanes__splitter:hover),
.ide-splitpanes.splitpanes--vertical > :deep(.splitpanes__splitter:active) {
  background: linear-gradient(
    90deg,
    transparent 0,
    transparent 1px,
    rgba(0, 122, 204, 0.85) 2px,
    rgba(0, 122, 204, 0.85) 3px,
    transparent 4px,
    transparent 100%
  );
}

.ide-splitpanes.splitpanes--horizontal > :deep(.splitpanes__splitter) {
  height: 5px;
  min-height: 5px;
  margin: 0;
  cursor: row-resize;
  background: linear-gradient(
    180deg,
    transparent 0,
    transparent 2px,
    #3c3c3c 2px,
    #3c3c3c 3px,
    transparent 3px,
    transparent 100%
  );
}

.ide-splitpanes.splitpanes--horizontal > :deep(.splitpanes__splitter:hover),
.ide-splitpanes.splitpanes--horizontal > :deep(.splitpanes__splitter:active) {
  background: linear-gradient(
    180deg,
    transparent 0,
    transparent 1px,
    rgba(0, 122, 204, 0.85) 2px,
    rgba(0, 122, 204, 0.85) 3px,
    transparent 4px,
    transparent 100%
  );
}
</style>
