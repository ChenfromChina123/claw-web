<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Session {
  id: string
  title: string
  model: string
  updatedAt: string
}

const props = defineProps<{
  sessions: Session[]
  currentSessionId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', sessionId: string): void
  (e: 'create'): void
  (e: 'delete', sessionId: string): void
  (e: 'rename', sessionId: string): void
}>()

const editingId = ref<string | null>(null)
const editingTitle = ref('')

function startEdit(session: Session) {
  editingId.value = session.id
  editingTitle.value = session.title
}

function saveEdit() {
  if (editingId.value && editingTitle.value.trim()) {
    emit('rename', editingId.value)
    editingId.value = null
  }
}

function cancelEdit() {
  editingId.value = null
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}
</script>

<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <h2>会话列表</h2>
      <button class="new-btn" @click="$emit('create')">+ 新对话</button>
    </div>

    <div class="session-list">
      <div
        v-for="session in sessions"
        :key="session.id"
        :class="['session-item', { active: session.id === currentSessionId }]"
        @click="$emit('select', session.id)"
      >
        <div class="session-info">
          <template v-if="editingId === session.id">
            <input
              v-model="editingTitle"
              class="edit-input"
              @keyup.enter="saveEdit"
              @keyup.escape="cancelEdit"
              @click.stop
              autofocus
            />
            <div class="edit-actions">
              <button class="save-btn" @click.stop="saveEdit">保存</button>
              <button class="cancel-btn" @click.stop="cancelEdit">取消</button>
            </div>
          </template>
          <template v-else>
            <div class="session-title">{{ session.title }}</div>
            <div class="session-meta">
              <span class="session-time">{{ formatDate(session.updatedAt) }}</span>
              <span class="session-model">{{ session.model }}</span>
            </div>
          </template>
        </div>

        <div class="session-actions" @click.stop>
          <button class="action-btn edit" @click="startEdit(session)" title="重命名">✎</button>
          <button class="action-btn delete" @click="$emit('delete', session.id)" title="删除">×</button>
        </div>
      </div>

      <div v-if="sessions.length === 0" class="empty-state">
        暂无会话
        <br />
        点击"新对话"开始
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: 280px;
  background: #16213e;
  border-right: 1px solid #0f3460;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #0f3460;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 16px;
  color: #e94560;
}

.new-btn {
  background: #e94560;
  color: white;
  border: none;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.new-btn:hover {
  background: #d63850;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.2s;
}

.session-item:hover {
  background: #1e2a4a;
}

.session-item.active {
  background: #0f3460;
  border-left: 3px solid #e94560;
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-title {
  font-size: 14px;
  color: #eee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.session-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: #666;
}

.session-model {
  color: #4ade80;
}

.session-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.session-item:hover .session-actions {
  opacity: 1;
}

.action-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn.edit {
  background: #0f3460;
  color: #888;
}

.action-btn.edit:hover {
  background: #1a4a7a;
  color: #fff;
}

.action-btn.delete {
  background: #442020;
  color: #888;
}

.action-btn.delete:hover {
  background: #662020;
  color: #f44336;
}

.edit-input {
  width: 100%;
  padding: 6px;
  border: 1px solid #e94560;
  border-radius: 4px;
  background: #1a1a2e;
  color: #eee;
  font-size: 14px;
  margin-bottom: 4px;
}

.edit-actions {
  display: flex;
  gap: 4px;
}

.save-btn, .cancel-btn {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}

.save-btn {
  background: #22c55e;
  color: white;
}

.cancel-btn {
  background: #666;
  color: white;
}

.empty-state {
  text-align: center;
  color: #666;
  padding: 32px 16px;
  font-size: 14px;
  line-height: 1.6;
}
</style>
