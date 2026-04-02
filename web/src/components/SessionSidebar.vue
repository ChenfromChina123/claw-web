<script setup lang="ts">
import { ref } from 'vue'

interface Session {
  id: string
  title: string
  model: string
  updatedAt: string
}

defineProps<{
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
      <div class="header-title">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h2>会话列表</h2>
      </div>
      <button class="new-btn" @click="$emit('create')">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        新对话
      </button>
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
              autofocus
              @keyup.enter="saveEdit"
              @keyup.escape="cancelEdit"
              @click.stop
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
          <button class="action-btn edit" title="重命名" @click="startEdit(session)">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="action-btn delete" title="删除" @click="$emit('delete', session.id)">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 6H5H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div v-if="sessions.length === 0" class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <p>暂无会话</p>
        <span>点击"新对话"开始</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar {
  width: 300px;
  background: rgba(15, 15, 25, 0.95);
  border-right: 1px solid rgba(99, 102, 241, 0.12);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid rgba(99, 102, 241, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-title svg {
  width: 18px;
  height: 18px;
  color: #6366f1;
}

.header-title h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #e5e7eb;
}

.new-btn {
  background: linear-gradient(135deg, #6366f1 0%, #7c3aed 100%);
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.new-btn svg {
  width: 14px;
  height: 14px;
}

.new-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-list::-webkit-scrollbar {
  width: 4px;
}

.session-list::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.2);
  border-radius: 2px;
}

.session-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-radius: 12px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.session-item:hover {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.1);
}

.session-item.active {
  background: rgba(99, 102, 241, 0.12);
  border-color: rgba(99, 102, 241, 0.25);
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-title {
  font-size: 14px;
  color: #e5e7eb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.session-meta {
  display: flex;
  gap: 8px;
  font-size: 11px;
  color: #6b7280;
}

.session-model {
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
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
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  background: transparent;
}

.action-btn svg {
  width: 14px;
  height: 14px;
}

.action-btn.edit {
  color: #6b7280;
}

.action-btn.edit:hover {
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
}

.action-btn.delete {
  color: #6b7280;
}

.action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.edit-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #6366f1;
  border-radius: 8px;
  background: rgba(30, 30, 50, 0.9);
  color: #e5e7eb;
  font-size: 14px;
  margin-bottom: 6px;
  outline: none;
}

.edit-input:focus {
  border-color: #818cf8;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
}

.edit-actions {
  display: flex;
  gap: 6px;
}

.save-btn, .cancel-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.save-btn {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
}

.save-btn:hover {
  background: rgba(34, 197, 94, 0.3);
}

.cancel-btn {
  background: rgba(107, 114, 128, 0.2);
  color: #9ca3af;
}

.cancel-btn:hover {
  background: rgba(107, 114, 128, 0.3);
}

.empty-state {
  text-align: center;
  color: #6b7280;
  padding: 48px 16px;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  background: rgba(99, 102, 241, 0.1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-icon svg {
  width: 24px;
  height: 24px;
  color: #6366f1;
}

.empty-state p {
  font-size: 14px;
  margin: 0 0 4px 0;
  color: #9ca3af;
}

.empty-state span {
  font-size: 12px;
}
</style>