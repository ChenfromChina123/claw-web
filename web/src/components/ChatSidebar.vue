<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NLayoutSider,
  NButton,
  NInput,
  NScrollbar,
  NDropdown,
  NModal,
  useMessage,
} from 'naive-ui'
import { useChatStore } from '@/stores/chat'
import type { Session } from '@/types'

const router = useRouter()
const chatStore = useChatStore()
const message = useMessage()

const searchValue = ref('')
const collapsed = ref(false)

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
  chatStore.createSession()
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
      <!-- 头部 -->
      <div class="sidebar-header">
        <h2>Claude Code</h2>
        <NButton type="primary" size="small" @click="handleNewChat">
          新对话
        </NButton>
      </div>

      <!-- 搜索 -->
      <div class="sidebar-search">
        <NInput
          v-model:value="searchValue"
          placeholder="搜索会话..."
          size="small"
          clearable
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
            v-for="session in filteredSessions"
            :key="session.id"
            class="session-item"
            :class="{ active: chatStore.currentSessionId === session.id }"
            @click="handleSelectSession(session)"
          >
            <div class="session-content">
              <div class="session-title">{{ session.title }}</div>
              <div class="session-meta">
                <span>{{ session.model }}</span>
                <span>{{ formatTime(session.updatedAt) }}</span>
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

          <div v-if="filteredSessions.length === 0" class="empty-state">
            <p>暂无会话</p>
            <NButton size="small" @click="handleNewChat">
              创建新对话
            </NButton>
          </div>
        </div>
      </NScrollbar>

      <!-- 底部 -->
      <div class="sidebar-footer">
        <div class="sidebar-footer-actions">
          <NButton block quaternary size="small" @click="router.push('/integration')">
            集成工作台
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
  </NLayoutSider>
  
  <!-- 自定义折叠按钮 - 放在 NLayoutSider 外面 -->
  <div class="custom-collapse-trigger" @click="collapsed = !collapsed" title="折叠侧边栏">
    <svg viewBox="0 0 24 24" fill="none" class="collapse-icon" :class="{ rotated: collapsed }">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
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

.sidebar-header {
  padding: 20px 16px 16px;
  display: flex;
  justify-content: space-between;
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
  padding: 12px 16px;
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
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 2px;
  border: 1px solid transparent;
  position: relative;
  overflow: hidden;
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
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(79, 70, 229, 0.08) 100%);
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.12);
  color: var(--text-primary);
}

.session-item.active::before {
  transform: scaleY(1);
  opacity: 1;
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
  gap: 3px;
}

.session-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
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
  font-size: 10px;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.session-meta::before {
  content: '';
  width: 12px;
  height: 1px;
  background: var(--border-color);
  flex-shrink: 0;
}

.session-item.active .session-meta {
  color: var(--text-secondary);
}

.session-item.active .session-meta::before {
  background: rgba(99, 102, 241, 0.3);
}

/* 三点菜单：更大点击区域与字号，避免误点会话项 */
.session-menu-trigger {
  flex-shrink: 0;
  min-width: 40px !important;
  width: 40px !important;
  height: 40px !important;
  font-size: 20px !important;
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

.chat-sidebar {
  position: relative;
}

/* 自定义折叠按钮 - 独立于侧边栏 */
.custom-collapse-trigger {
  position: fixed;
  top: 50%;
  left: 280px;
  transform: translateY(-50%);
  width: 28px;
  height: 72px;
  background: var(--bg-tertiary);
  border: 2px solid var(--border-color);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1000;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.custom-collapse-trigger:hover {
  background: linear-gradient(135deg, var(--primary-color), var(--primary-color-hover));
  border-color: var(--primary-color);
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
  transform: translateY(-50%) scale(1.05);
}

.collapse-icon {
  width: 20px;
  height: 20px;
  color: var(--text-secondary);
  transition: all 0.3s;
}

.custom-collapse-trigger:hover .collapse-icon {
  color: #ffffff;
  transform: scale(1.1);
}

.collapse-icon.rotated {
  transform: rotate(180deg);
}

/* 侧边栏折叠时按钮位置 */
.chat-sidebar.collapsed ~ .custom-collapse-trigger,
:deep(.n-layout-sider--collapsed) ~ .custom-collapse-trigger {
  left: 8px;
}
</style>
