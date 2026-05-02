<template>
  <Transition name="task-bar">
    <div v-if="activeTasks.length > 0" class="task-status-bar">
      <div
        v-for="task in activeTasks"
        :key="task.taskId"
        class="task-bar-item"
        :class="'task--' + task.status.toLowerCase()"
      >
        <span class="task-dot" :class="'dot--' + task.status.toLowerCase()"></span>
        <span class="task-name">{{ task.name }}</span>
        <span class="task-status-label">{{ statusLabel(task.status) }}</span>
        <span v-if="task.progress != null" class="task-progress">{{ Math.round(task.progress) }}%</span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAgentStore } from '@/stores/agent'

const agentStore = useAgentStore()

const activeTasks = computed(() => {
  return Array.from(agentStore.backgroundTasks)
    .filter(t => t.status === 'RUNNING' || t.status === 'PENDING' || t.status === 'FAILED')
    .sort((a, b) => {
      const priority: Record<string, number> = { RUNNING: 0, PENDING: 1, FAILED: 2 }
      return (priority[a.status] ?? 3) - (priority[b.status] ?? 3)
    })
    .slice(0, 3)
})

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: '等待中',
    RUNNING: '执行中',
    COMPLETED: '已完成',
    FAILED: '失败',
    CANCELLED: '已取消',
  }
  return map[status] || status
}
</script>

<style scoped>
.task-status-bar {
  display: flex;
  gap: 12px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  overflow-x: auto;
  flex-shrink: 0;
}

.task-bar-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.04);
  transition: background 0.2s;
}

.task-bar-item:hover {
  background: rgba(255, 255, 255, 0.07);
}

.task-dot {
  width: 5px;
  height: 5px;
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

.dot--failed {
  background: #e88080;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.task-name {
  color: rgba(255, 255, 255, 0.7);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-status-label {
  color: rgba(255, 255, 255, 0.35);
}

.task--running .task-status-label {
  color: #63e2b7;
}

.task--failed .task-status-label {
  color: #e88080;
}

.task-progress {
  color: #63e2b7;
  font-variant-numeric: tabular-nums;
  font-size: 11px;
}

.task-bar-enter-active,
.task-bar-leave-active {
  transition: all 0.25s ease;
}

.task-bar-enter-from,
.task-bar-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
