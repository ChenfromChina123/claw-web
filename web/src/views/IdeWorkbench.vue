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
  ListOutline,
  ChevronDownOutline,
  GridOutline,
} from '@vicons/ionicons5'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'

import AgentWorkdirTreePanel from '@/components/workdir/AgentWorkdirTreePanel.vue'
import AgentWorkdirEditorPanel from '@/components/workdir/AgentWorkdirEditorPanel.vue'
import IdeSessionsPanel from './IdeSessionsPanel.vue'
import ChatMessageList from '@/components/ChatMessageList.vue'
import ChatInput from '@/components/ChatInput.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import IdeTerminalTabs from '@/components/terminal/IdeTerminalTabs.vue'
import IdeComponentLayoutPanel from '@/components/layout/IdeComponentLayoutPanel.vue'
import type { ComponentPublicInstance } from 'vue'

import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { useAgentStore } from '@/stores/agent'
import { useIdeComponentLayoutStore } from '@/stores/ideComponentLayout'
import { useAgentWorkdir } from '@/composables/useAgentWorkdir'
import { useEffectiveWorkspacePath } from '@/composables/useEffectiveWorkspacePath'
import {
  provideIdeAppendToChat,
  type IdeAppendToChatOptions,
} from '@/composables/useIdeChatAppend'
import {
  provideOpenPromptLibrary,
} from '@/composables/usePromptTemplateLibrary'
import {
  loadIdeWorkbenchLayout,
  saveIdeWorkbenchLayout,
  readSplitPanePercents,
  type IdeWorkbenchLayoutState,
} from '@/composables/useIdeWorkbenchLayout'

const router = useRouter()
const message = useMessage()
const chatStore = useChatStore()
const authStore = useAuthStore()
const agentStore = useAgentStore()
const layoutStore = useIdeComponentLayoutStore()

// ========== 初始化状态 ==========
const isInitializing = ref(true)
const initError = ref<string | null>(null)
/** 与 Chat 共用单例 WS：须先完成登录连接再挂载终端，避免 PTY 抢先匿名建连 */
const terminalWebSocketReady = ref(false)

/** 分栏尺寸（localStorage 持久化） */
const ideLayout = ref<IdeWorkbenchLayoutState>(loadIdeWorkbenchLayout())
const rootSplitRef = ref<InstanceType<typeof Splitpanes> | null>(null)
const editorTermSplitRef = ref<InstanceType<typeof Splitpanes> | null>(null)

/** 确保 size 值始终为有效数字 */
const safeSize = (val: number | undefined, fallback: number): number => {
  const n = Number(val)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function persistRootSplitSizes(): void {
  const el = rootSplitRef.value?.$el as HTMLElement | undefined
  const sizes = readSplitPanePercents(el, false)
  const visibleCount =
    Number(layoutStore.explorerVisible) +
    Number(layoutStore.editorVisible || layoutStore.terminalVisible) +
    Number(layoutStore.chatVisible)
  if (sizes.length === 3 && visibleCount === 3) {
    ideLayout.value = {
      ...ideLayout.value,
      rootSizes: sizes as [number, number, number],
    }
    saveIdeWorkbenchLayout(ideLayout.value)
  }
}

function persistEditorTermSplitSizes(): void {
  const el = editorTermSplitRef.value?.$el as HTMLElement | undefined
  const sizes = readSplitPanePercents(el, true)
  if (sizes.length === 2) {
    ideLayout.value = {
      ...ideLayout.value,
      editorTerminalSizes: sizes as [number, number],
    }
    saveIdeWorkbenchLayout(ideLayout.value)
  }
}

function onRootSplitResized(): void {
  void nextTick(() => persistRootSplitSizes())
}

function onEditorTermSplitResized(): void {
  void nextTick(() => persistEditorTermSplitSizes())
}

// ========== UI 状态 ==========
const showCommandPalette = ref(false)
const showLayoutPanel = ref(false)
const inputRef = ref<InstanceType<typeof ChatInput> | null>(null)
const editorPanelRef = ref<InstanceType<typeof AgentWorkdirEditorPanel> | null>(null)
/** 左侧边栏视图：资源管理器 vs 会话列表（释放右侧 AI 栏垂直空间） */
const leftSidebarView = ref<'explorer' | 'sessions'>('explorer')

// ========== 快速导航状态 ==========
const quickNavShow = ref(false)

// 用户消息数量
const userMessageCount = computed(() => {
  return chatStore.messages.filter(m => m.role === 'user').length
})

// 用户消息导航项
const userMessageNavItems = computed(() => {
  const items: Array<{ id: string; preview: string; index: number }> = []
  let userIndex = 0

  // 先收集所有用户消息
  for (const m of chatStore.messages) {
    if (m.role !== 'user') continue

    userIndex++
    // 获取消息预览
    let preview = ''
    const content = (m as { content?: unknown }).content
    if (typeof content === 'string') {
      preview = content.slice(0, 40).replace(/\n/g, ' ')
    } else if (Array.isArray(content)) {
      const textContent = content
        .filter((b: unknown) => (b as { type?: string })?.type === 'text')
        .map((b: unknown) => String((b as { text?: string }).text || ''))
        .join(' ')
      preview = textContent.slice(0, 40).replace(/\n/g, ' ')
    } else {
      preview = String(content).slice(0, 40).replace(/\n/g, ' ')
    }

    if (preview.length > 40) {
      preview = preview + '...'
    }

    items.push({
      id: m.id,
      preview: preview || '（空消息）',
      index: userIndex,
    })
  }

  // 第一条消息在最上面，序号为1
  return items
})

// 处理快速导航点击
function handleQuickNavClick(messageId: string) {
  quickNavShow.value = false
  // 滚动到指定消息
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

// ========== 会话 ID ref ==========
const sessionIdRef = computed(() => chatStore.currentSessionId || '')

// ========== 工作目录上下文（单一 provide） ==========
const workdir = useAgentWorkdir(sessionIdRef)

/** 有效工作区路径（与 Agent Bash cwd 一致），传给终端组件 */
const { workspacePath: effectiveWorkspacePath } = useEffectiveWorkspacePath(sessionIdRef)

/** 底部多标签终端（供「在终端查看」聚焦） */
const terminalTabsRef = ref<
  (ComponentPublicInstance & { focusActiveTerminal?: () => void }) | null
>(null)

function handleFocusTerminalFromChat(): void {
  const el = document.getElementById('ide-bottom-terminal')
  el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  nextTick(() => {
    terminalTabsRef.value?.focusActiveTerminal?.()
  })
}

/** 编辑器「引用选中到对话」→ 插入右侧 ChatInput */
function handleAppendToChatFromEditor(text: string, options?: IdeAppendToChatOptions): void {
  const trimmed = text.trim()
  const hasRef = !!options?.codeRef
  if (!hasRef && !trimmed) return
  if (hasRef && !trimmed && !options!.codeRef!.snippet.trim()) return
  if (!chatStore.currentSessionId) {
    message.warning('请先选择或创建会话')
    return
  }
  if (!inputRef.value) {
    message.warning('对话输入框未就绪，请稍后再试')
    return
  }
  inputRef.value.appendToChatInput(hasRef ? trimmed || options!.codeRef!.snippet : trimmed, options)
}

provideIdeAppendToChat(handleAppendToChatFromEditor)

/**
 * 在编辑器中打开提示词模板库
 * 通过 ref 调用 AgentWorkdirEditorPanel 的方法
 */
function handleOpenPromptLibrary(): void {
  if (!editorPanelRef.value) {
    message.warning('编辑器未就绪，请稍后再试')
    return
  }
  // 调用编辑器面板的打开模板库方法
  editorPanelRef.value.openPromptLibraryTab()
}

/**
 * 在编辑器中打开设置页面
 * 通过 ref 调用 AgentWorkdirEditorPanel 的方法
 */
function handleOpenSettings(): void {
  if (!editorPanelRef.value) {
    message.warning('编辑器未就绪，请稍后再试')
    return
  }
  // 调用编辑器面板的打开设置页面方法
  editorPanelRef.value.openSettingsTab()
}

/**
 * 提供打开模板库的方法给 ChatInput 使用
 */
provideOpenPromptLibrary(handleOpenPromptLibrary)

/** 中间栏标题：与 VS Code 一致，显示当前文件名大写 */
const editorTabTitle = computed(() => {
  const p = workdir.currentFilePath.value
  if (!p) return 'EDITOR'
  const name = p.split(/[/\\]/).pop() || p
  return name.toUpperCase()
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
    terminalWebSocketReady.value = true

    // 设置 Agent Store 的 WebSocket 监听
    agentStore.setupWebSocketListeners()
    
    // 获取会话列表
    await chatStore.listSessions()

    // 加载会话：优先恢复 localStorage 中的上次会话，避免与 useAgentWorkdir 的 sessionId 一致导致 watch 不触发、文件树永不加载
    // 注意：不自动创建新会话，由用户手动创建
    const sessions = chatStore.sessions || []
    const persistedId = chatStore.currentSessionId
    const persistedOk =
      !!persistedId && sessions.some((s) => s.id === persistedId)

    if (sessions.length > 0) {
      const targetId = persistedOk ? persistedId! : sessions[0].id
      await chatStore.loadSession(targetId)
    } else {
      // 无现有会话时不自动创建，等待用户手动创建
      console.log('[IdeWorkbench] 会话列表为空，等待用户手动创建会话')
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

// ========== 停止生成 ==========
async function handleStopGeneration(): Promise<void> {
  console.log('[IdeWorkbench] 用户点击停止生成')
  await chatStore.interruptGeneration()
  message.info('生成已停止')
}

// ========== 重新连接 ==========
async function handleRetry(): Promise<void> {
  if (!authStore.token || !authStore.isLoggedIn) {
    router.replace('/login')
    return
  }

  isInitializing.value = true
  initError.value = null
  terminalWebSocketReady.value = false

  try {
    await chatStore.connect(authStore.token || undefined)
    terminalWebSocketReady.value = true
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
          title="组件布局"
          @click="showLayoutPanel = !showLayoutPanel"
        >
          <NIcon size="22"><GridOutline /></NIcon>
        </div>
        <div
          class="activity-icon"
          title="设置"
          @click="handleOpenSettings"
        >
          <NIcon size="22"><SettingsOutline /></NIcon>
        </div>
      </div>
    </div>

    <!-- 主体：顶栏 + 三列（Explorer | Editor | AI Agent） -->
    <div class="ide-main ide-vscode-dark">
      <!-- 勿用 splitpanes default-theme：其分割条为 #fff、面板为 #f2f2f2，会产生刺眼白条 -->
      <Splitpanes
        ref="rootSplitRef"
        class="ide-splitpanes ide-split-root"
        @resized="onRootSplitResized"
      >
        <Pane v-if="layoutStore.explorerVisible" :size="safeSize(ideLayout.rootSizes[0], 20)" min-size="14" class="explorer-pane">
          <div class="pane-header">
            <span>{{ leftSidebarView === 'explorer' ? 'EXPLORER' : 'SESSIONS' }}</span>
          </div>
          <div class="pane-content explorer-or-sessions-body">
            <AgentWorkdirTreePanel v-if="leftSidebarView === 'explorer'" />
            <IdeSessionsPanel v-else />
          </div>
        </Pane>

        <Pane v-if="layoutStore.editorVisible || layoutStore.terminalVisible" :size="safeSize(ideLayout.rootSizes[1], 52)" min-size="30" class="editor-pane">
          <Splitpanes
            v-if="layoutStore.editorVisible && layoutStore.terminalVisible"
            ref="editorTermSplitRef"
            horizontal
            class="ide-editor-terminal-split"
            @resized="onEditorTermSplitResized"
          >
            <Pane v-if="layoutStore.editorVisible" :size="safeSize(ideLayout.editorTerminalSizes[0], 68)" min-size="35" class="editor-pane-stack">
              <div class="pane-header">
                <span>{{ editorTabTitle }}</span>
              </div>
              <div class="pane-content editor-pane-editor-body">
                <AgentWorkdirEditorPanel ref="editorPanelRef" />
              </div>
            </Pane>
            <Pane v-if="layoutStore.terminalVisible" :size="safeSize(ideLayout.editorTerminalSizes[1], 32)" min-size="14" max-size="55" class="editor-terminal-pane">
              <div id="ide-bottom-terminal" class="ide-terminal-anchor">
                <IdeTerminalTabs
                  v-if="terminalWebSocketReady"
                  ref="terminalTabsRef"
                  :default-cwd="effectiveWorkspacePath || undefined"
                />
              </div>
            </Pane>
          </Splitpanes>
          <template v-else>
            <div v-if="layoutStore.editorVisible" class="pane-full-content">
              <div class="pane-header">
                <span>{{ editorTabTitle }}</span>
              </div>
              <div class="pane-content editor-pane-editor-body">
                <AgentWorkdirEditorPanel ref="editorPanelRef" />
              </div>
            </div>
            <div v-if="layoutStore.terminalVisible" class="pane-full-content">
              <div id="ide-bottom-terminal" class="ide-terminal-anchor">
                <IdeTerminalTabs
                  v-if="terminalWebSocketReady"
                  ref="terminalTabsRef"
                  :default-cwd="effectiveWorkspacePath || undefined"
                />
              </div>
            </div>
          </template>
        </Pane>

        <Pane v-if="layoutStore.chatVisible" :size="safeSize(ideLayout.rootSizes[2], 28)" min-size="20" class="right-column-pane chat-pane-full">
          <div class="pane-header chat-pane-header">
            <span>AI AGENT</span>
            <div class="chat-header-actions">
              <!-- 快速导航按钮 -->
              <div
                v-if="userMessageCount > 0"
                class="quick-nav-wrapper"
                @mouseenter="quickNavShow = true"
                @mouseleave="quickNavShow = false"
              >
                <button type="button" class="quick-nav-trigger">
                  <NIcon :size="14"><ListOutline /></NIcon>
                  <span class="quick-nav-count">{{ userMessageCount }}</span>
                  <NIcon :size="12" class="quick-nav-arrow" :class="{ 'is-open': quickNavShow }">
                    <ChevronDownOutline />
                  </NIcon>
                </button>

                <!-- 快速导航弹出层 - 向下展开 -->
                <Transition name="quick-nav-fade">
                  <div
                    v-show="quickNavShow"
                    class="quick-nav-popup"
                    @mouseenter="quickNavShow = true"
                    @mouseleave="quickNavShow = false"
                  >
                    <div class="quick-nav-header">
                      <span>快速导航</span>
                      <span class="quick-nav-total">共 {{ userMessageCount }} 条</span>
                    </div>
                    <div class="quick-nav-list">
                      <div
                      v-for="entry in userMessageNavItems"
                      :key="entry.id"
                      class="quick-nav-item"
                      @click="handleQuickNavClick(entry.id)"
                    >
                      <span class="quick-nav-index">#{{ entry.index }}</span>
                      <span class="quick-nav-preview" :title="entry.preview">{{ entry.preview }}</span>
                    </div>
                    </div>
                  </div>
                </Transition>
              </div>

              <button
                type="button"
                class="chat-new-session-btn"
                title="新建会话"
                aria-label="新建会话"
                @click="handleActivityBarNewSession"
              >
                <NIcon :size="18"><Add /></NIcon>
              </button>
            </div>
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
                @focus-terminal="handleFocusTerminalFromChat"
              />
              <div class="chat-input-outer">
                <div class="ide-chat-input-shell">
                  <ChatInput
                    ref="inputRef"
                    variant="ide"
                    placeholder="Ask AI assistant..."
                    :disabled="!chatStore.currentSessionId"
                    :session-id="chatStore.currentSessionId || undefined"
                    :is-generating="chatStore.isLoading"
                    @send="handleSendMessage"
                    @stop="handleStopGeneration"
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

    <Teleport to="body">
      <IdeComponentLayoutPanel
        :visible="showLayoutPanel"
        @close="showLayoutPanel = false"
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

.chat-pane-header {
  justify-content: space-between;
  gap: 8px;
}

.chat-new-session-btn {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid rgba(64, 158, 255, 0.45);
  background: rgba(64, 158, 255, 0.1);
  color: rgba(64, 158, 255, 0.95);
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.chat-new-session-btn:hover {
  color: #fff;
  background: rgba(64, 158, 255, 0.32);
  border-color: rgba(64, 158, 255, 0.65);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.2);
}

.chat-new-session-btn:active {
  transform: scale(0.96);
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
  min-height: 0;
  background: #141414;
}

.ide-editor-terminal-split {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
}

.editor-pane :deep(> .splitpanes) {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.editor-pane-stack {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.editor-pane-editor-body {
  min-height: 0;
}

.editor-terminal-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.pane-full-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ide-terminal-anchor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
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

/* ========== 快速导航样式 ========== */
.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.quick-nav-wrapper {
  position: relative;
}

.quick-nav-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background-color: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #888;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-nav-trigger:hover {
  background-color: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.15);
  color: #aaa;
}

.quick-nav-count {
  font-weight: 600;
  color: #f2c97d;
  min-width: 14px;
  text-align: center;
}

.quick-nav-arrow {
  transition: transform 0.2s ease;
  opacity: 0.6;
}

.quick-nav-arrow.is-open {
  transform: rotate(180deg);
}

.quick-nav-popup {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 280px;
  max-height: 240px;
  background-color: #252525;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 1000;
}

.quick-nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 13px;
  color: #aaa;
  font-weight: 500;
}

.quick-nav-total {
  font-size: 11px;
  color: #666;
  font-weight: 400;
}

.quick-nav-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.quick-nav-list::-webkit-scrollbar {
  width: 4px;
}

.quick-nav-list::-webkit-scrollbar-track {
  background: transparent;
}

.quick-nav-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.quick-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.quick-nav-item:hover {
  background-color: rgba(255, 255, 255, 0.06);
}

.quick-nav-index {
  flex-shrink: 0;
  width: 24px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(242, 201, 125, 0.15);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #f2c97d;
}

.quick-nav-preview {
  flex: 1;
  font-size: 12px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.quick-nav-item:hover .quick-nav-preview {
  color: #ccc;
}

/* 快速导航动画 - 向下展开 */
.quick-nav-fade-enter-active,
.quick-nav-fade-leave-active {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.quick-nav-fade-enter-from,
.quick-nav-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
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
  --n-color: rgba(30, 30, 30, 0.6) !important;
  --n-color-focus: rgba(30, 30, 30, 0.75) !important;
  --n-border: 1px solid #4a4a4a !important;
  --n-border-hover: 1px solid #5c5c5c !important;
  --n-border-focus: 1px solid #007acc !important;
  --n-box-shadow-focus: 0 0 0 1px rgba(0, 122, 204, 0.35) !important;
  border-radius: 6px !important;
}

.ide-chat-input-shell :deep(.n-input__textarea-el),
.ide-chat-input-shell :deep(.n-input__input-el) {
  color: #ccc !important;
  background: transparent !important;
}

.ide-chat-input-shell :deep(.n-input__placeholder) {
  color: rgba(255, 255, 255, 0.38) !important;
  text-align: left !important;
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
