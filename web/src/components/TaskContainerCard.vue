<template>
  <div class="task-container" :class="'task--' + task.status.toLowerCase()">
    <div class="task-accent-bar" :style="{ background: accentColor }"></div>
    <div class="task-body">
      <div class="task-header" @click="toggleExpand">
        <span class="task-status-icon" :class="'icon--' + task.status.toLowerCase()">
          <template v-if="task.status === 'RUNNING'">✦</template>
          <template v-else-if="task.status === 'COMPLETED'">✓</template>
          <template v-else-if="task.status === 'FAILED'">✗</template>
          <template v-else-if="task.status === 'CANCELLED'">⊘</template>
          <template v-else>○</template>
        </span>
        <span class="task-name">{{ task.name }}</span>
        <span class="task-status-badge" :class="'badge--' + task.status.toLowerCase()">
          {{ statusLabel(task.status) }}
        </span>
        <span v-if="task.progress != null && task.status === 'RUNNING'" class="task-progress-text">
          {{ Math.round(task.progress) }}%
        </span>
        <span class="task-expand-icon" :class="{ expanded: isExpanded }">▾</span>
      </div>

      <Transition name="task-expand">
        <div v-if="isExpanded" class="task-content">
          <div v-if="task.error" class="task-error">{{ task.error }}</div>
          <div v-if="task.result" class="task-result">{{ formatResult(task.result) }}</div>
          <div v-if="relatedToolCalls.length > 0" class="task-tools">
            <div
              v-for="tool in relatedToolCalls"
              :key="tool.id"
              class="task-tool-item"
              :class="'tool--' + tool.status"
            >
              <span class="tool-dot" :class="'tool-dot--' + tool.status"></span>
              <span class="tool-name">{{ tool.toolName }}</span>
              <span class="tool-status">{{ toolStatusLabel(tool.status) }}</span>
              <span v-if="tool.duration" class="tool-duration">{{ tool.duration }}ms</span>
            </div>
          </div>
          <div v-if="relatedToolCalls.length === 0 && !task.error && !task.result" class="task-empty">
            {{ task.status === 'PENDING' ? '等待执行...' : '执行中...' }}
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { BackgroundTask } from '@/types/agentWorkflow'

interface ToolCallItem {
  id: string
  toolName: string
  status: string
  duration?: number
}

const props = defineProps<{
  task: BackgroundTask
  toolCalls?: ToolCallItem[]
}>()

const isExpanded = ref(props.task.status === 'RUNNING' || props.task.status === 'PENDING')

const accentColor = computed(() => {
  const map: Record<string, string> = {
    PENDING: '#f0c040',
    RUNNING: '#63e2b7',
    COMPLETED: 'rgba(255,255,255,0.2)',
    FAILED: '#e88080',
    CANCELLED: 'rgba(255,255,255,0.1)',
  }
  return map[props.task.status] || 'rgba(255,255,255,0.15)'
})

const relatedToolCalls = computed(() => props.toolCalls || [])

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

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

function toolStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '等待',
    executing: '执行中',
    completed: '完成',
    error: '错误',
  }
  return map[status] || status
}

function formatResult(result: unknown): string {
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result)
      return JSON.stringify(parsed, null, 2).slice(0, 500)
    } catch {
      return result.slice(0, 500)
    }
  }
  return String(result).slice(0, 500)
}
</script>

<style scoped>
.task-container {
  display: flex;
  margin: 6px 0;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: border-color 0.2s;
}

.task-container:hover {
  border-color: rgba(255, 255, 255, 0.1);
}

.task-accent-bar {
  width: 3px;
  flex-shrink: 0;
}

.task-body {
  flex: 1;
  min-width: 0;
  padding: 8px 10px;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.task-status-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.icon--pending { color: #f0c040; }
.icon--running { color: #63e2b7; animation: pulse-icon 1.5s ease-in-out infinite; }
.icon--completed { color: rgba(255, 255, 255, 0.4); }
.icon--failed { color: #e88080; }
.icon--cancelled { color: rgba(255, 255, 255, 0.25); }

@keyframes pulse-icon {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.task-name {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.task-status-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  flex-shrink: 0;
}

.badge--pending { color: #f0c040; background: rgba(240, 192, 64, 0.1); }
.badge--running { color: #63e2b7; background: rgba(99, 226, 183, 0.1); }
.badge--completed { color: rgba(255, 255, 255, 0.4); background: rgba(255, 255, 255, 0.04); }
.badge--failed { color: #e88080; background: rgba(232, 128, 128, 0.1); }
.badge--cancelled { color: rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.03); }

.task-progress-text {
  font-size: 11px;
  color: #63e2b7;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.task-expand-icon {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.task-expand-icon.expanded {
  transform: rotate(180deg);
}

.task-content {
  padding-top: 8px;
  padding-left: 18px;
}

.task-error {
  font-size: 12px;
  color: #e88080;
  padding: 6px 8px;
  background: rgba(232, 128, 128, 0.08);
  border-radius: 4px;
  margin-bottom: 6px;
  word-break: break-all;
}

.task-result {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
  margin-bottom: 6px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}

.task-tools {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-tool-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 3px 0;
}

.tool-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tool-dot--pending { background: #f0c040; }
.tool-dot--executing { background: #63e2b7; animation: pulse-dot 1.5s ease-in-out infinite; }
.tool-dot--completed { background: rgba(255, 255, 255, 0.3); }
.tool-dot--error { background: #e88080; }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.tool-name {
  color: rgba(255, 255, 255, 0.6);
}

.tool-status {
  color: rgba(255, 255, 255, 0.3);
  margin-left: auto;
}

.tool-duration {
  color: rgba(255, 255, 255, 0.25);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
}

.task-empty {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.25);
  font-style: italic;
}

.task-expand-enter-active,
.task-expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.task-expand-enter-from,
.task-expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
}
</style>
