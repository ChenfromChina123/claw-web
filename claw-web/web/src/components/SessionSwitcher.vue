<script setup lang="ts">
/**
 * SessionSwitcher - 快速会话切换器组件
 * 
 * 提供在聊天界面内快速切换会话的功能，支持键盘导航和搜索。
 * 通过 Ctrl/Cmd + L 快捷键打开。
 */

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { NModal, NInput, NScrollbar, NButton, NIcon, NTag } from 'naive-ui'
import { ChatbubblesOutline, Star } from '@vicons/ionicons5'
import { useChatStore } from '@/stores/chat'
import type { Session } from '@/types'

interface Props {
  show: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  select: [sessionId: string]
}>()

const chatStore = useChatStore()
const searchValue = ref('')
const selectedIndex = ref(0)
const inputRef = ref<InstanceType<typeof NInput> | null>(null)

// 过滤和排序会话列表
const filteredSessions = computed(() => {
  const sessions = chatStore.sessions || []
  if (!searchValue.value) return sessions
  return sessions.filter(s =>
    (s.title || '').toLowerCase().includes(searchValue.value.toLowerCase())
  )
})

const sortedSessions = computed(() => {
  return [...filteredSessions.value].sort((a, b) => {
    if (a.isMaster && !b.isMaster) return -1
    if (!a.isMaster && b.isMaster) return 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
})

// 监听打开状态，自动聚焦输入框
watch(() => props.show, (newShow) => {
  if (newShow) {
    selectedIndex.value = 0
    searchValue.value = ''
    setTimeout(() => {
      inputRef.value?.focus()
    }, 50)
  }
})

// 处理键盘导航
function handleKeyDown(e: KeyboardEvent) {
  if (!props.show) return

  const sessions = sortedSessions.value
  
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      selectedIndex.value = Math.min(selectedIndex.value + 1, sessions.length - 1)
      break
    case 'ArrowUp':
      e.preventDefault()
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
      break
    case 'Enter':
      e.preventDefault()
      if (sessions[selectedIndex.value]) {
        selectSession(sessions[selectedIndex.value].id)
      }
      break
    case 'Escape':
      e.preventDefault()
      emit('close')
      break
  }
}

function selectSession(sessionId: string) {
  chatStore.loadSession(sessionId)
  emit('select', sessionId)
  emit('close')
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

// 监听全局键盘事件
onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    title="切换会话"
    style="width: 600px; max-width: 90vw;"
    :closable="true"
    @close="emit('close')"
  >
    <div class="session-switcher">
      <!-- 搜索输入框 -->
      <NInput
        ref="inputRef"
        v-model:value="searchValue"
        placeholder="搜索会话标题..."
        size="large"
        clearable
        class="search-input"
      >
        <template #prefix>
          <NIcon :size="18">
            <ChatbubblesOutline />
          </NIcon>
        </template>
      </NInput>

      <!-- 会话列表 -->
      <NScrollbar class="session-list">
        <div
          v-for="(session, index) in sortedSessions"
          :key="session.id"
          class="session-item"
          :class="{
            active: chatStore.currentSessionId === session.id,
            selected: index === selectedIndex,
            master: session.isMaster,
          }"
          @click="selectSession(session.id)"
          @mouseenter="selectedIndex = index"
        >
          <div class="session-content">
            <div class="session-header">
              <span v-if="session.isMaster" class="master-star" title="主会话">
                <NIcon :size="14"><Star /></NIcon>
              </span>
              <span class="session-title">{{ session.title || '未命名' }}</span>
              <NTag
                v-if="modelLabel(session.model)"
                size="small"
                :bordered="false"
                class="model-tag"
              >
                {{ modelLabel(session.model) }}
              </NTag>
            </div>
            <div class="session-footer">
              <span class="session-time">{{ formatTime(session.updatedAt) }}</span>
              <span class="session-preview">点击切换</span>
            </div>
          </div>
        </div>

        <div v-if="sortedSessions.length === 0" class="empty-state">
          <p>没有找到匹配的会话</p>
        </div>
      </NScrollbar>

      <!-- 底部提示 -->
      <div class="footer-hints">
        <span class="hint">↑↓ 导航</span>
        <span class="hint">Enter 切换</span>
        <span class="hint">Esc 关闭</span>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.session-switcher {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 70vh;
}

.search-input {
  flex-shrink: 0;
}

.session-list {
  flex: 1;
  min-height: 0;
  max-height: 50vh;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.1);
}

.session-item {
  padding: 10px 12px;
  margin: 2px 0;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.session-item.selected {
  background: rgba(64, 158, 255, 0.15);
  border-color: rgba(64, 158, 255, 0.4);
}

.session-item.active {
  background: rgba(64, 158, 255, 0.12);
  border-color: #409eff;
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.3);
}

.session-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.master-star {
  display: flex;
  color: #fbbf24;
  flex-shrink: 0;
}

.session-title {
  flex: 1;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.92);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item.active .session-title {
  color: #fff;
}

.model-tag {
  flex-shrink: 0;
  font-size: 10px !important;
  padding: 0 6px !important;
  height: 20px !important;
  line-height: 20px !important;
  color: rgba(255, 255, 255, 0.75) !important;
  background: rgba(255, 255, 255, 0.08) !important;
}

.session-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}

.session-time {
  flex-shrink: 0;
}

.session-preview {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.session-item:hover .session-preview,
.session-item.selected .session-preview {
  opacity: 1;
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
}

.footer-hints {
  display: flex;
  gap: 16px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.hint {
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 8px;
  border-radius: 4px;
}
</style>
