<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import {
  NButton,
  NInput,
  NScrollbar,
  NDropdown,
  NModal,
  NEmpty,
  NText,
  useMessage
} from 'naive-ui'
import { useChatStore } from '@/stores/chat'
import type { Session } from '@/types'

const chatStore = useChatStore()
const message = useMessage()

const searchValue = ref('')
const visibleSessionCount = ref(10)
const SESSIONS_PER_PAGE = 10
const loadMoreTriggerRef = ref<HTMLElement | null>(null)
const isLoadingMore = ref(false)
let intersectionObserver: IntersectionObserver | null = null

const showRenameModal = ref(false)
const renameTitleDraft = ref('')
const renameTarget = ref<Session | null>(null)

const showDeleteModal = ref(false)
const deleteTarget = ref<Session | null>(null)

/**
 * 过滤后的会话列表
 */
const filteredSessions = computed(() => {
  const sessions = chatStore.sessions || []
  if (!searchValue.value) return sessions
  return sessions.filter(s =>
    (s.title || '').toLowerCase().includes(searchValue.value.toLowerCase())
  )
})

/**
 * 可见的会话列表（排序后）
 */
const visibleSessions = computed(() => {
  const sessions = filteredSessions.value.slice(0, visibleSessionCount.value)
  return sessions.sort((a, b) => {
    if (a.isMaster && !b.isMaster) return -1
    if (!a.isMaster && b.isMaster) return 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
})

/**
 * 是否有更多会话可加载
 */
const hasMoreSessions = computed(() => {
  return filteredSessions.value.length > visibleSessionCount.value
})

/**
 * 设置观察者监听加载更多触发器
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

onMounted(() => {
  intersectionObserver = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      if (entry.isIntersecting && hasMoreSessions.value && !isLoadingMore.value) {
        loadMoreSessions()
      }
    },
    { root: null, rootMargin: '100px', threshold: 0 }
  )

  nextTick(observeTrigger)
})

/**
 * 处理创建新会话
 */
function handleNewChat() {
  if (chatStore.messages.length === 0) {
    message.warning('请先在当前会话中发送消息')
    return
  }
  chatStore.createSession(undefined, undefined, true)
}

/**
 * 处理选择会话
 */
function handleSelectSession(session: Session) {
  chatStore.loadSession(session.id)
}

/**
 * 打开删除确认对话框
 */
function openDeleteModal(session: Session) {
  deleteTarget.value = session
  showDeleteModal.value = true
}

/**
 * 确认删除会话
 */
function confirmDelete() {
  const s = deleteTarget.value
  if (!s) return true
  chatStore.deleteSession(s.id)
  message.success('已删除会话')
  return true
}

/**
 * 打开重命名对话框
 */
function openRenameModal(session: Session) {
  renameTarget.value = session
  renameTitleDraft.value = session.title || ''
  showRenameModal.value = true
}

/**
 * 确认重命名会话
 */
function confirmRename() {
  const s = renameTarget.value
  const title = renameTitleDraft.value.trim()
  if (!s) return true
  if (!title) {
    message.warning('标题不能为空')
    return false
  }
  if (title === s.title) return true
  chatStore.renameSession(s.id, title)
  message.success('已重命名')
  return true
}

const sessionOptions = [
  { label: '重命名', key: 'rename' },
  { label: '删除', key: 'delete' },
]

/**
 * 处理会话右键菜单操作
 */
function handleSessionContext(key: string, session: Session) {
  if (key === 'rename') openRenameModal(session)
  else if (key === 'delete') openDeleteModal(session)
}

/**
 * 格式化时间显示
 */
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
  <div class="module-container">
    <div class="module-header">SESSIONS</div>

    <!-- 搜索框 -->
    <div class="session-search">
      <NInput
        v-model:value="searchValue"
        placeholder="搜索会话..."
        size="small"
        clearable
        :style="{ fontSize: '12px' }"
      />
    </div>

    <!-- 新建按钮 -->
    <div class="session-actions">
      <NButton type="primary" size="small" block @click="handleNewChat" :style="{ fontSize: '12px' }">
        + 新对话
      </NButton>
    </div>

    <!-- 会话列表 -->
    <NScrollbar class="session-list-wrapper">
      <div v-if="visibleSessions.length > 0" class="session-list">
        <div
          v-for="session in visibleSessions"
          :key="session.id"
          class="session-item"
          :class="{ active: chatStore.currentSessionId === session.id }"
          @click="handleSelectSession(session)"
        >
          <div class="session-content">
            <div class="session-title">
              <span v-if="session.isMaster" class="master-badge">⭐</span>
              {{ session.title }}
            </div>
            <div class="session-meta">
              <span :style="{ fontSize: '10px', color: '#666' }">{{ formatTime(session.updatedAt) }}</span>
            </div>
          </div>
          <NDropdown
            :options="sessionOptions"
            trigger="click"
            @select="(key) => handleSessionContext(key as string, session)"
          >
            <NButton
              quaternary
              circle
              size="tiny"
              :style="{ width: '24px', height: '24px' }"
              @click.stop
            >
              ⋮
            </NButton>
          </NDropdown>
        </div>

        <!-- 加载更多 -->
        <div
          v-if="hasMoreSessions"
          ref="loadMoreTriggerRef"
          class="load-more-trigger"
        >
          <span :style="{ fontSize: '11px', color: '#888' }">
            {{ isLoadingMore ? '加载中...' : '滚动加载更多' }}
          </span>
        </div>
      </div>

      <NEmpty
        v-else
        description="暂无会话"
        :style="{ padding: '30px 20px' }"
      >
        <template #extra>
          <NButton size="small" @click="handleNewChat" :style="{ fontSize: '12px' }">
            创建新对话
          </NButton>
        </template>
      </NEmpty>
    </NScrollbar>

    <!-- 连接状态 -->
    <div class="connection-status">
      <span :class="['status-dot', chatStore.isConnected ? 'online' : 'offline']"></span>
      <span :style="{ fontSize: '11px', color: '#888' }">
        {{ chatStore.isConnected ? '已连接' : '未连接' }}
      </span>
    </div>

    <!-- 重命名对话框 -->
    <NModal
      v-model:show="showRenameModal"
      preset="dialog"
      title="重命名会话"
      positive-text="保存"
      negative-text="取消"
      :show-icon="false"
      @positive-click="confirmRename"
    >
      <NInput
        v-model:value="renameTitleDraft"
        placeholder="输入新标题"
        maxlength="120"
        show-count
        @keydown.enter.prevent="confirmRename"
      />
    </NModal>

    <!-- 删除确认对话框 -->
    <NModal
      v-model:show="showDeleteModal"
      preset="dialog"
      title="删除会话"
      type="warning"
      positive-text="删除"
      negative-text="取消"
      @positive-click="confirmDelete"
    >
      <p :style="{ margin: 0, fontSize: '14px', lineHeight: '1.5', color: 'var(--text-secondary)' }">
        确定删除「{{ deleteTarget?.title || '未命名' }}」吗？聊天记录将一并删除，且不可恢复。
      </p>
    </NModal>
  </div>
</template>

<style scoped>
.module-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--ide-sidebar);
  overflow: hidden;
}

.module-header {
  height: 35px;
  background: var(--ide-header);
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 11px;
  font-weight: bold;
  color: #969696;
  text-transform: uppercase;
  letter-spacing: 1px;
  flex-shrink: 0;
  user-select: none;
  border-bottom: 1px solid var(--ide-border);
}

.session-search {
  padding: 8px 10px;
  flex-shrink: 0;
}

.session-actions {
  padding: 4px 10px;
  flex-shrink: 0;
}

.session-list-wrapper {
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
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 2px;
  border: 1px solid transparent;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
}

.session-item.active {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.3);
}

.session-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.session-title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #ccc;
}

.session-item.active .session-title {
  color: #fff;
}

.master-badge {
  display: inline-block;
  margin-right: 3px;
  font-size: 11px;
}

.session-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.load-more-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--ide-border);
  flex-shrink: 0;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.status-dot.online {
  background: #18a058;
}

.status-dot.offline {
  background: #d03050;
}
</style>
