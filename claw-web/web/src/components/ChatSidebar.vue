<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  NLayoutSider,
  NButton,
  NInput,
  NScrollbar,
  NDropdown,
  NModal,
  NSpin,
  NDrawer,
  NDrawerContent,
  NIcon,
  NTag,
  useMessage,
} from 'naive-ui'
import {
  FolderOpen,
  CodeSlash,
  Add,
} from '@vicons/ionicons5'
import { useChatStore } from '@/stores/chat'
import type { Session } from '@/types'
import AgentWorkDir from './AgentWorkDir.vue'

const router = useRouter()
const chatStore = useChatStore()
const message = useMessage()

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
}>()

const searchValue = ref('')
const collapsed = ref(false)
const visibleSessionCount = ref(10)
const SESSIONS_PER_PAGE = 10
const loadMoreTriggerRef = ref<HTMLElement | null>(null)
const isLoadingMore = ref(false)
let intersectionObserver: IntersectionObserver | null = null

// 工作目录抽屉状态
const showWorkDir = ref(false)

watch(collapsed, (newVal) => {
  emit('update:collapsed', newVal)
})

const showRenameModal = ref(false)
const renameTitleDraft = ref('')
const renameTarget = ref<Session | null>(null)

const showDeleteModal = ref(false)
const deleteTarget = ref<Session | null>(null)

const filteredSessions = computed(() => {
  const sessions = chatStore.sessions || []
  if (!searchValue.value) return sessions
  return sessions.filter(s =>
    (s.title || '').toLowerCase().includes(searchValue.value.toLowerCase())
  )
})

const visibleSessions = computed(() => {
  const sessions = filteredSessions.value.slice(0, visibleSessionCount.value)
  // 主会话始终在最前面
  return sessions.sort((a, b) => {
    if (a.isMaster && !b.isMaster) return -1
    if (!a.isMaster && b.isMaster) return 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
})

const hasMoreSessions = computed(() => {
  return filteredSessions.value.length > visibleSessionCount.value
})

/**
 * 设置观察者监听指定元素
 */
function observeTrigger() {
  if (intersectionObserver && loadMoreTriggerRef.value) {
    intersectionObserver.disconnect()
    intersectionObserver.observe(loadMoreTriggerRef.value)
  }
}

/**
 * 加载更多会话
 */
function loadMoreSessions() {
  if (isLoadingMore.value || !hasMoreSessions.value) return
  
  isLoadingMore.value = true
  visibleSessionCount.value += SESSIONS_PER_PAGE
  
  setTimeout(() => {
    isLoadingMore.value = false
    nextTick(observeTrigger)
  }, 200)
}

/**
 * 设置 IntersectionObserver 监听加载更多触发器
 */
onMounted(() => {
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry.isIntersecting && hasMoreSessions.value && !isLoadingMore.value) {
        loadMoreSessions()
      }
    },
    {
      root: null,
      rootMargin: '100px',
      threshold: 0,
    }
  )

  nextTick(observeTrigger)
})

watch(hasMoreSessions, () => {
  nextTick(observeTrigger)
})

/**
 * 清理 IntersectionObserver
 */
onUnmounted(() => {
  if (intersectionObserver) {
    intersectionObserver.disconnect()
    intersectionObserver = null
  }
})

watch(showRenameModal, (open) => {
  if (!open) {
    renameTarget.value = null
    renameTitleDraft.value = ''
  }
})

watch(showDeleteModal, (open) => {
  if (!open) deleteTarget.value = null
})

/**
 * 处理创建新会话
 * 验证当前会话是否有消息，如果没有消息则提示用户
 */
function handleNewChat() {
  if (chatStore.messages.length === 0) {
    message.warning('请先在当前会话中发送消息')
    return
  }
  chatStore.createSession(undefined, undefined, true)
}

function handleSelectSession(session: Session) {
  chatStore.loadSession(session.id)
}

function openDeleteModal(session: Session) {
  deleteTarget.value = session
  showDeleteModal.value = true
}

function confirmDelete(): boolean {
  const s = deleteTarget.value
  console.log('[Sidebar] confirmDelete, target:', s?.id, 'ws connected:', chatStore.isConnected)
  if (!s) return true
  chatStore.deleteSession(s.id)
  message.success('已删除会话')
  return true
}

function openRenameModal(session: Session) {
  renameTarget.value = session
  renameTitleDraft.value = session.title || ''
  showRenameModal.value = true
}

function confirmRename(): boolean {
  const s = renameTarget.value
  const title = renameTitleDraft.value.trim()
  console.log('[Sidebar] confirmRename, target:', s?.id, 'title:', title, 'ws connected:', chatStore.isConnected)
  if (!s) return true
  if (!title) {
    message.warning('标题不能为空')
    return false
  }
  if (title === s.title) {
    return true
  }
  chatStore.renameSession(s.id, title)
  message.success('已重命名')
  return true
}

const sessionOptions = [
  { label: '重命名', key: 'rename' },
  { label: '删除', key: 'delete' },
]

function handleSessionContext(key: string, session: Session) {
  if (key === 'rename') {
    openRenameModal(session)
  } else if (key === 'delete') {
    openDeleteModal(session)
  }
}

function formatTime(date: Date | string) {
  const d = new Date(date)
  const now = new Date()
  const diff = now.getTime() - d.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return d.toLocaleDateString()
}
</script>

<template>
  <div class="chat-sidebar-container">
    <NLayoutSider
      v-model:collapsed="collapsed"
      bordered
      :width="280"
      :collapsed-width="0"
      :show-trigger="false"
      content-style="padding: 0;"
      class="chat-sidebar"
    >
      <div class="sidebar">
        <!-- 与 IDE 活动栏统一的「新建」入口（蓝色强调，避免与沉浸式内其他黄色主按钮混用） -->
        <div
          class="sidebar-global-new"
          title="新建会话"
          role="button"
          tabindex="0"
          @click="handleNewChat"
          @keydown.enter.prevent="handleNewChat"
          @keydown.space.prevent="handleNewChat"
        >
          <NIcon :size="18"><Add /></NIcon>
          <span>新建会话</span>
        </div>

        <!-- 头部 -->
        <div class="sidebar-header">
          <h2>Claude Code</h2>
        </div>

        <!-- 搜索 -->
        <div class="sidebar-search">
          <p class="sidebar-search-hint">在当前会话列表中筛选</p>
          <NInput
            v-model:value="searchValue"
            placeholder="搜索标题…"
            size="small"
            clearable
            aria-label="筛选会话列表"
          >
            <template #prefix>
              <span>🔍</span>
            </template>
          </NInput>
        </div>

        <!-- 会话列表 -->
        <NScrollbar class="sidebar-list">
          <div class="session-list">
            <div
              v-for="session in visibleSessions"
              :key="session.id"
              class="session-item"
              :class="{ active: chatStore.currentSessionId === session.id, 'master-session': session.isMaster }"
              @click="handleSelectSession(session)"
            >
              <div class="session-content">
                <div class="session-title">
                  <span v-if="session.isMaster" class="master-badge">⭐</span>
                  {{ session.title }}
                </div>
                <div class="session-meta">
                  <NTag
                    v-if="session.model && session.model.trim()"
                    size="small"
                    :bordered="false"
                    class="session-model-tag"
                  >
                    {{ session.model }}
                  </NTag>
                  <span class="session-time-only">{{ formatTime(session.updatedAt) }}</span>
                </div>
              </div>
              <NDropdown
                :options="sessionOptions"
                trigger="click"
                @select="(key) => handleSessionContext(key as string, session)"
              >
                <NButton
                  class="session-menu-trigger"
                  quaternary
                  circle
                  size="medium"
                  aria-label="会话操作"
                  @click.stop
                >
                  ⋮
                </NButton>
              </NDropdown>
            </div>

            <!-- 加载更多提示 -->
            <div
              v-if="hasMoreSessions"
              ref="loadMoreTriggerRef"
              class="load-more-trigger"
            >
              <NSpin v-if="isLoadingMore" size="small" />
              <span>{{ isLoadingMore ? '加载中...' : '滚动加载更多' }}</span>
            </div>

            <div v-if="filteredSessions.length === 0" class="empty-state">
              <p>暂无会话</p>
              <p class="empty-hint">点击顶部「新建会话」开始</p>
              <NButton size="small" quaternary @click="handleNewChat">
                创建新对话
              </NButton>
            </div>
          </div>
        </NScrollbar>

        <!-- 底部 -->
        <div class="sidebar-footer">
          <div class="sidebar-footer-actions">
            <NButton block quaternary size="small" @click="showWorkDir = true">
              <template #icon>
                <NIcon><FolderOpen /></NIcon>
              </template>
              工作目录
            </NButton>
            <NButton block quaternary size="small" @click="router.push('/integration')">
              集成工作台
            </NButton>
            <NButton block quaternary size="small" @click="router.push('/ide')">
              <template #icon>
                <NIcon><CodeSlash /></NIcon>
              </template>
              IDE 工作台
            </NButton>
            <NButton block quaternary size="small" @click="router.push('/settings')">
              设置
            </NButton>
          </div>
          <div class="connection-status">
            <span :class="['status-dot', chatStore.isConnected ? 'online' : 'offline']"></span>
            {{ chatStore.isConnected ? '已连接' : '未连接' }}
          </div>
        </div>
      </div>
    </NLayoutSider>
    
    <!-- 自定义折叠按钮 -->
    <div class="custom-collapse-trigger" title="折叠侧边栏" @click="collapsed = !collapsed">
      <svg viewBox="0 0 24 24" fill="none" class="collapse-icon" :class="{ rotated: collapsed }">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    
    <!-- 重命名（与应用主题一致的对话框） -->
    <NModal
      v-model:show="showRenameModal"
      preset="dialog"
      title="重命名会话"
      positive-text="保存"
      negative-text="取消"
      :show-icon="false"
      class="session-dialog"
      @positive-click="confirmRename"
    >
      <div class="dialog-field">
        <label class="dialog-label">会话标题</label>
        <NInput
          v-model:value="renameTitleDraft"
          placeholder="输入新标题"
          maxlength="120"
          show-count
          @keydown.enter.prevent="confirmRename"
        />
      </div>
    </NModal>

    <!-- 删除确认 -->
    <NModal
      v-model:show="showDeleteModal"
      preset="dialog"
      title="删除会话"
      type="warning"
      positive-text="删除"
      negative-text="取消"
      @positive-click="confirmDelete"
    >
      <p class="delete-hint">
        确定删除「{{ deleteTarget?.title || '未命名' }}」吗？聊天记录将一并删除，且不可恢复。
      </p>
    </NModal>

    <!-- 工作目录抽屉 -->
    <NDrawer
      v-model:show="showWorkDir"
      :width="800"
      placement="right"
      :trap-focus="false"
      :block-scroll="true"
    >
      <NDrawerContent title="工作目录" closable>
        <AgentWorkDir 
          v-if="chatStore.currentSessionId"
          :session-id="chatStore.currentSessionId"
        />
        <div v-else class="no-session-hint">
          <p>请先选择一个会话</p>
        </div>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-right: 1px solid var(--glass-border);
}

.sidebar-global-new {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 12px 12px 0;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: rgba(64, 158, 255, 0.95);
  border: 1px solid rgba(64, 158, 255, 0.4);
  background: rgba(64, 158, 255, 0.08);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.sidebar-global-new:hover {
  color: #fff;
  background: rgba(64, 158, 255, 0.22);
  border-color: rgba(64, 158, 255, 0.55);
}

.sidebar-global-new:focus-visible {
  outline: 2px solid rgba(64, 158, 255, 0.7);
  outline-offset: 2px;
}

.sidebar-header {
  padding: 14px 16px 12px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  border-bottom: 1px solid var(--border-color, rgba(99, 102, 241, 0.1));
}

.sidebar-header h2 {
  font-size: 18px;
  font-weight: 700;
  background: var(--gradient-text);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.3px;
}

.sidebar-search {
  padding: 10px 16px 12px;
}

.sidebar-search-hint {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-tertiary);
}

.empty-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 8px !important;
}

.sidebar-list {
  flex: 1;
  overflow: hidden;
}

.session-list {
  padding: 4px;
}

.session-item {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 4px;
  border: 1px solid transparent;
  position: relative;
  overflow: hidden;
  height: 64px !important;
  min-height: 64px !important;
  max-height: 64px !important;
  box-sizing: border-box;
  flex-shrink: 0;
}

.session-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--primary-color);
  transform: scaleY(0);
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0;
}

.session-item:hover {
  background: var(--bg-tertiary);
  border-color: var(--border-hover);
  transform: translateX(2px);
}

.session-item:hover::before {
  transform: scaleY(0.5);
  opacity: 0.6;
}

.session-item.active {
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.12) 0%, rgba(99, 102, 241, 0.08) 100%);
  border-color: #409eff;
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.35);
  color: var(--text-primary);
}

.session-item.active::before {
  transform: scaleY(1);
  opacity: 1;
  background: #409eff;
}

.session-item.active:hover {
  transform: translateX(0);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
}

.session-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.session-title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
  transition: color 0.2s;
}

.session-item:hover .session-title {
  color: var(--primary-color);
}

.session-item.active .session-title {
  color: var(--primary-color);
  font-weight: 700;
}

.session-meta {
  font-size: 12px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.session-model-tag {
  flex-shrink: 1;
  min-width: 0;
  max-width: 100px;
  font-size: 10px !important;
  padding: 0 6px !important;
  height: 20px !important;
  line-height: 20px !important;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-time-only {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
}

.session-item.active .session-meta {
  color: var(--text-secondary);
}

.session-item.active .session-time-only {
  color: var(--text-secondary);
}

/* 主会话样式 */
.session-item.master-session {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(217, 119, 6, 0.04));
  border-color: rgba(251, 191, 36, 0.2);
}

.session-item.master-session::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, #fbbf24, #f59e0b);
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.4);
  opacity: 1;
  transform: scaleY(1);
}

.session-item.master-session:hover {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.12), rgba(217, 119, 6, 0.06));
  border-color: rgba(251, 191, 36, 0.3);
}

.session-item.master-session.active {
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(217, 119, 6, 0.08));
  border-color: #fbbf24;
  box-shadow: 0 2px 12px rgba(251, 191, 36, 0.2);
}

.master-badge {
  display: inline-block;
  margin-right: 4px;
  font-size: 12px;
  animation: starPulse 2s ease-in-out infinite;
}

@keyframes starPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.8; }
}

/* 三点菜单：更大点击区域与字号，避免误点会话项 */
.session-menu-trigger {
  flex-shrink: 0;
  min-width: 48px !important;
  width: 48px !important;
  height: 48px !important;
  font-size: 24px !important;
  line-height: 1 !important;
  letter-spacing: -0.02em;
}

.session-item.active .session-menu-trigger {
  color: rgba(255, 255, 255, 0.95) !important;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-secondary);
}

.empty-state p {
  margin-bottom: 16px;
}

.load-more-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  color: var(--text-secondary);
  font-size: 13px;
  min-height: 40px;
}

.sidebar-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}

.sidebar-footer-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.online {
  background: var(--success-color);
}

.status-dot.offline {
  background: var(--error-color);
}

.dialog-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.dialog-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.delete-hint {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.chat-sidebar-container {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.chat-sidebar {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* 自定义折叠按钮 */
.custom-collapse-trigger {
  position: absolute;
  top: 50%;
  right: -40px;
  transform: translateY(-50%);
  width: 32px;
  height: 80px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 0 8px 8px 0;
  border-left: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1000;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(8px);
}

.custom-collapse-trigger:hover {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.15);
  right: -44px;
  width: 36px;
}

.collapse-icon {
  width: 20px;
  height: 20px;
  color: rgba(99, 102, 241, 0.6);
  transition: all 0.3s;
}

.custom-collapse-trigger:hover .collapse-icon {
  color: rgba(99, 102, 241, 0.9);
  transform: scale(1.05);
}

.collapse-icon.rotated {
  transform: rotate(180deg);
}

.no-session-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
