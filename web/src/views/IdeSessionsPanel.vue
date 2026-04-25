<script setup lang="ts">
/**
 * IdeSessionsPanel - IDE 工作台会话面板
 *
 * 在 IdeWorkbench 左栏与 Explorer 切换展示：全高列表、明确「筛选」文案、活动栏「+」统一新建；
 * 当前会话使用 #409eff 描边；重命名/删除经 ⋮ 下拉，避免边缘微图标误触。
 */

import { ref, computed } from 'vue'
import {
  NScrollbar,
  NButton,
  NIcon,
  useMessage,
  NEmpty,
  NModal,
  NInput,
  NDropdown,
  NTag,
} from 'naive-ui'
import { useChatStore } from '@/stores/chat'
import type { Session } from '@/types'

const chatStore = useChatStore()
const message = useMessage()

const searchValue = ref('')

const filteredSessions = computed(() => {
  const sessions = chatStore.sessions || []
  if (!searchValue.value) return sessions
  return sessions.filter(s =>
    (s.title || '').toLowerCase().includes(searchValue.value.toLowerCase())
  )
})

const sortedSessions = computed(() => {
  return [...filteredSessions.value].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
})

const showRenameModal = ref(false)
const renameTitleDraft = ref('')
const renameTarget = ref<Session | null>(null)

function openRenameModal(session: Session) {
  renameTarget.value = session
  renameTitleDraft.value = session.title || ''
  showRenameModal.value = true
}

function confirmRename(): boolean {
  const s = renameTarget.value
  const title = renameTitleDraft.value.trim()

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

const showDeleteModal = ref(false)
const deleteTarget = ref<Session | null>(null)

function openDeleteModal(session: Session) {
  deleteTarget.value = session
  showDeleteModal.value = true
}

function confirmDelete(): boolean {
  const s = deleteTarget.value
  if (!s) return true
  chatStore.deleteSession(s.id)
  message.success('已删除会话')
  return true
}

function handleSelectSession(session: Session) {
  chatStore.loadSession(session.id)
}

function handleNewSession() {
  chatStore.createSession(undefined, undefined, false)
}

const sessionOptions = [
  { label: '重命名', key: 'rename' },
  { label: '删除', key: 'delete' },
]

function handleSessionContext(key: string, session: Session) {
  if (key === 'rename') openRenameModal(session)
  else if (key === 'delete') openDeleteModal(session)
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

function modelLabel(model: string | undefined) {
  if (!model || !model.trim()) return ''
  return model.trim()
}
</script>

<template>
  <div class="sessions-panel">
    <div class="sessions-toolbar">
      <p class="search-hint">在当前会话列表中筛选</p>
      <NInput
        v-model:value="searchValue"
        placeholder="搜索标题…"
        size="small"
        clearable
        aria-label="筛选会话列表"
      />
    </div>

    <NScrollbar class="sessions-list">
      <div v-if="sortedSessions.length === 0" class="empty-state">
        <NEmpty description="暂无匹配的会话" size="small">
          <template #extra>
            <p class="empty-tip">新建对话请使用左侧活动栏顶部的「+」</p>
            <NButton size="small" quaternary @click="handleNewSession">
              仍要新建会话
            </NButton>
          </template>
        </NEmpty>
      </div>

      <div
        v-for="session in sortedSessions"
        :key="session.id"
        class="session-item"
        :class="{
          active: chatStore.currentSessionId === session.id,
        }"
        @click="handleSelectSession(session)"
      >
        <div class="session-row-main">
          <div class="session-line">
            <span class="session-title-text" :title="session.title || '未命名'">
              {{ session.title || '未命名' }}
            </span>
            <NTag
              v-if="modelLabel(session.model)"
              size="small"
              :bordered="false"
              class="model-tag"
            >
              {{ modelLabel(session.model) }}
            </NTag>
            <span class="session-time">{{ formatTime(session.updatedAt) }}</span>
          </div>
        </div>

        <NDropdown
          :options="sessionOptions"
          trigger="click"
          @select="(key) => handleSessionContext(key as string, session)"
        >
          <NButton
            class="session-menu-btn"
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
    </NScrollbar>

    <NModal
      v-model:show="showRenameModal"
      preset="dialog"
      title="重命名会话"
      positive-text="保存"
      negative-text="取消"
      :show-icon="false"
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
  </div>
</template>

<style scoped>
.sessions-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #1a1a1a;
}

.sessions-toolbar {
  flex-shrink: 0;
  padding: 8px 10px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.search-hint {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.45);
}

.sessions-list {
  flex: 1;
  min-height: 0;
}

.empty-state {
  padding: 20px 12px;
}

.empty-tip {
  margin: 0 0 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.45;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 8px 8px 10px;
  margin: 0 6px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease,
    border-color 0.15s ease;
  border: 1px solid transparent;
  background: transparent;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

/* 当前会话：高对比描边，深色下易于扫视 */
.session-item.active {
  background: rgba(64, 158, 255, 0.12);
  border-color: #409eff;
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.45);
}

.session-row-main {
  flex: 1;
  min-width: 0;
}

.session-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
}

.session-title-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
}

.session-item.active .session-title-text {
  color: #fff;
}

.model-tag {
  flex-shrink: 1;
  min-width: 0;
  max-width: 88px;
  font-size: 10px !important;
  padding: 0 6px !important;
  height: 20px !important;
  line-height: 20px !important;
  color: rgba(255, 255, 255, 0.75) !important;
  background: rgba(255, 255, 255, 0.08) !important;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-time {
  flex-shrink: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
}

.session-item.active .session-time {
  color: rgba(255, 255, 255, 0.65);
}

.session-menu-btn {
  flex-shrink: 0;
  width: 36px !important;
  min-width: 36px !important;
  height: 36px !important;
  font-size: 18px !important;
  opacity: 0.75;
}

.session-item:hover .session-menu-btn,
.session-item.active .session-menu-btn {
  opacity: 1;
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
</style>
