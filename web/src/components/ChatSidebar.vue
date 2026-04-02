<script setup lang="ts">
import { ref, computed } from 'vue'
import { NLayoutSider, NButton, NInput, NScrollbar, NDropdown } from 'naive-ui'
import { useChatStore } from '@/stores/chat'
import type { Session } from '@/types'

const chatStore = useChatStore()

const searchValue = ref('')
const collapsed = ref(false)

const filteredSessions = computed(() => {
  if (!searchValue.value) return chatStore.sessions
  return chatStore.sessions.filter(s => 
    s.title.toLowerCase().includes(searchValue.value.toLowerCase())
  )
})

function handleNewChat() {
  chatStore.createSession()
}

function handleSelectSession(session: Session) {
  chatStore.loadSession(session.id)
}

function handleDeleteSession(session: Session, e: Event) {
  e.stopPropagation()
  chatStore.deleteSession(session.id)
}

function handleRenameSession(session: Session, e: Event) {
  e.stopPropagation()
  const newTitle = prompt('请输入新的会话标题:', session.title)
  if (newTitle && newTitle !== session.title) {
    chatStore.renameSession(session.id, newTitle)
  }
}

const sessionOptions = [
  { label: '重命名', key: 'rename' },
  { label: '删除', key: 'delete' }
]

function handleSessionContext(key: string, session: Session) {
  if (key === 'rename') {
    handleRenameSession(session, new Event('click'))
  } else if (key === 'delete') {
    handleDeleteSession(session, new Event('click'))
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
    bordered
    :width="280"
    :collapsed-width="0"
    :collapsed="collapsed"
    show-trigger
    content-style="padding: 0;"
    @update:collapsed="collapsed = !collapsed"
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
              @select="(key) => handleSessionContext(key, session)"
              trigger="click"
            >
              <NButton text size="tiny" @click.stop>
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
        <div class="connection-status">
          <span :class="['status-dot', chatStore.isConnected ? 'online' : 'offline']"></span>
          {{ chatStore.isConnected ? '已连接' : '未连接' }}
        </div>
      </div>
    </div>
  </NLayoutSider>
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
  padding: 8px;
}

.session-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
}

.session-item:hover {
  background: var(--bg-tertiary);
}

.session-item.active {
  background: var(--primary-color);
  color: white;
}

.session-content {
  flex: 1;
  min-width: 0;
}

.session-title {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  display: flex;
  gap: 8px;
}

.session-item.active .session-meta {
  color: rgba(255, 255, 255, 0.7);
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
</style>
