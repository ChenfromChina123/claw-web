<template>
  <div
    class="task-status-indicator"
    @mouseenter="showPopup = true"
    @mouseleave="showPopup = false"
  >
    <div class="indicator-icon" :class="statusClass">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.5" fill="none" />
        <path v-if="hasActiveTasks" d="M5 8L7 10L11 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <circle v-else cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
      <span v-if="activeTaskCount > 0" class="task-count">{{ activeTaskCount }}</span>
    </div>
    <span class="indicator-label">任务</span>

    <Transition name="task-popup">
      <div
        v-show="showPopup"
        class="task-popup"
        @mouseenter="showPopup = true"
        @mouseleave="showPopup = false"
      >
        <div class="task-popup-header">
          <span>后台任务</span>
          <span class="task-popup-stats">{{ statsText }}</span>
        </div>
        <div v-if="tasks.length === 0" class="task-popup-empty">
          暂无任务
        </div>
        <div v-else class="task-popup-list">
          <div
            v-for="task in displayTasks"
            :key="task.taskId"
            class="task-popup-item"
            :class="'task-status--' + task.status.toLowerCase()"
          >
            <div class="task-item-left">
              <span class="task-status-dot" :class="'dot--' + task.status.toLowerCase()"></span>
              <span class="task-item-name" :title="task.name">{{ task.name }}</span>
            </div>
            <div class="task-item-right">
              <span v-if="task.progress !== undefined && task.progress !== null" class="task-item-progress">
                {{ Math.round(task.progress) }}%
              </span>
              <span class="task-item-status">{{ statusLabel(task.status) }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { BackgroundTask } from '@/types/agentWorkflow'

const agentStore = useAgentStore()
const showPopup = ref(false)

const tasks = computed(() => agentStore.backgroundTasks)

const activeTaskCount = computed(() => {
  return tasks.value.filter(t => t.status === 'RUNNING' || t.status === 'PENDING').length
})

const hasActiveTasks = computed(() => activeTaskCount.value > 0)

const statusClass = computed(() => {
  if (tasks.value.some(t => t.status === 'FAILED')) return 'has-error'
  if (activeTaskCount.value > 0) return 'has-active'
  if (tasks.value.some(t => t.status === 'COMPLETED')) return 'has-done'
  return 'idle'
})

const displayTasks = computed(() => {
  return Array.from(tasks.value)
    .sort((a, b) => {
      const priority: Record<string, number> = { RUNNING: 0, PENDING: 1, FAILED: 2, COMPLETED: 3, CANCELLED: 4 }
      return (priority[a.status] ?? 5) - (priority[b.status] ?? 5)
    })
    .slice(0, 20)
})

const statsText = computed(() => {
  const running = tasks.value.filter(t => t.status === 'RUNNING').length
  const pending = tasks.value.filter(t => t.status === 'PENDING').length
  const done = tasks.value.filter(t => t.status === 'COMPLETED').length
  const failed = tasks.value.filter(t => t.status === 'FAILED').length
  const parts: string[] = []
  if (running) parts.push(`${running} 运行中`)
  if (pending) parts.push(`${pending} 等待`)
  if (done) parts.push(`${done} 完成`)
  if (failed) parts.push(`${failed} 失败`)
  return parts.length ? parts.join(' · ') : ''
})

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: '等待',
    RUNNING: '运行中',
    COMPLETED: '完成',
    FAILED: '失败',
    CANCELLED: '已取消',
  }
  return map[status] || status
}
</script>

<style scoped>
.task-status-indicator {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background 0.2s;
  user-select: none;
}

.task-status-indicator:hover {
  background: rgba(255, 255, 255, 0.08);
}

.indicator-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
  transition: color 0.3s;
}

.indicator-icon.has-active {
  color: #63e2b7;
}

.indicator-icon.has-error {
  color: #e88080;
}

.indicator-icon.has-done {
  color: rgba(255, 255, 255, 0.5);
}

.indicator-icon.idle {
  color: rgba(255, 255, 255, 0.3);
}

.indicator-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.task-count {
  position: absolute;
  top: -6px;
  right: -8px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: #63e2b7;
  color: #000;
  font-size: 10px;
  font-weight: 600;
  line-height: 14px;
  text-align: center;
}

.has-error .task-count {
  background: #e88080;
}

.task-popup {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 6px;
  width: 320px;
  max-height: 400px;
  background: rgba(30, 30, 35, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  z-index: 100;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(12px);
}

.task-popup-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
}

.task-popup-stats {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
  font-weight: 400;
}

.task-popup-empty {
  padding: 24px 14px;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
}

.task-popup-list {
  overflow-y: auto;
  max-height: 340px;
  padding: 4px 0;
}

.task-popup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 14px;
  gap: 8px;
  transition: background 0.15s;
}

.task-popup-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.task-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.task-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot--pending {
  background: #f0c040;
}

.dot--running {
  background: #63e2b7;
  animation: pulse-dot 1.5s ease-in-out infinite;
}

.dot--completed {
  background: rgba(255, 255, 255, 0.3);
}

.dot--failed {
  background: #e88080;
}

.dot--cancelled {
  background: rgba(255, 255, 255, 0.15);
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.task-item-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-item-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.task-item-progress {
  font-size: 11px;
  color: #63e2b7;
  font-variant-numeric: tabular-nums;
}

.task-item-status {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}

.task-status--failed .task-item-status {
  color: #e88080;
}

.task-status--running .task-item-status {
  color: #63e2b7;
}

.task-popup-enter-active,
.task-popup-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.task-popup-enter-from,
.task-popup-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
