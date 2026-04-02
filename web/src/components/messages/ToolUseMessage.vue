<script setup lang="ts">
import { computed } from 'vue'
import { NIcon, NTag, NSpin, NButton, NTooltip } from 'naive-ui'
import { TimeOutline, CheckmarkCircle, CloseCircle, EllipsisHorizontal } from '@vicons/ionicons5'
import type { ToolUseMessage } from '@/types'
import { formatDate, formatDuration } from '@/utils/format'

interface Props {
  message: ToolUseMessage
  isCollapsible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isCollapsible: true,
})

const isCollapsed = defineModel<boolean>('collapsed', { default: false })

const statusConfig = computed(() => {
  const configs = {
    pending: { color: 'warning', label: '等待中', icon: TimeOutline },
    executing: { color: 'info', label: '执行中', icon: null },
    completed: { color: 'success', label: '已完成', icon: CheckmarkCircle },
    error: { color: 'error', label: '错误', icon: CloseCircle },
  }
  return configs[props.message.status]
})

const formattedInput = computed(() => {
  try {
    return JSON.stringify(props.message.toolInput, null, 2)
  } catch {
    return String(props.message.toolInput)
  }
})

const durationDisplay = computed(() => {
  if (!props.message.createdAt) return ''
  const start = new Date(props.message.createdAt).getTime()
  const end = Date.now()
  return formatDuration(end - start)
})
</script>

<template>
  <div class="tool-use-message">
    <div class="tool-header" @click="isCollapsed = !isCollapsed">
      <div class="tool-info">
        <NIcon :size="18" :component="statusConfig.icon" :color="getStatusColor(statusConfig.color)" />
        <span class="tool-name">{{ message.toolName }}</span>
        <NTag :type="statusConfig.color as never" size="small" round>
          {{ statusConfig.label }}
        </NTag>
      </div>

      <div class="tool-meta">
        <span v-if="message.status === 'executing'" class="duration">
          <NSpin size="small" />
          {{ durationDisplay }}
        </span>
        <NTooltip v-if="isCollapsible" trigger="hover" placement="top">
          <template #trigger>
            <NButton text size="tiny">
              <NIcon :component="EllipsisHorizontal" />
            </NButton>
          </template>
          {{ isCollapsed ? '展开' : '收起' }}
        </NTooltip>
      </div>
    </div>

    <div v-if="!isCollapsed" class="tool-body">
      <div class="input-section">
        <div class="section-label">输入参数</div>
        <pre class="code-block"><code>{{ formattedInput }}</code></pre>
      </div>

      <div v-if="message.error" class="error-section">
        <div class="section-label">错误信息</div>
        <div class="error-content">{{ message.error }}</div>
      </div>
    </div>

    <span class="message-time">{{ formatDate(message.createdAt, 'time') }}</span>
  </div>
</template>

<script lang="ts">
function getStatusColor(color: string): string {
  const colors: Record<string, string> = {
    warning: '#f59e0b',
    info: '#3b82f6',
    success: '#10b981',
    error: '#ef4444',
  }
  return colors[color] || '#999'
}
</script>

<style scoped>
.tool-use-message {
  padding: 12px 16px;
  background: #f8fafc;
  border-radius: 12px;
  border-left: 3px solid #6366f1;
  margin: 8px 20px;
  animation: slideIn 0.3s ease-out;
}

.tool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.tool-header:hover .tool-name {
  color: #6366f1;
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tool-name {
  font-weight: 600;
  font-size: 14px;
  color: #374151;
  transition: color 0.2s;
}

.tool-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.duration {
  font-size: 12px;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool-body {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #e5e7eb;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.code-block {
  background: #1e1e2e;
  color: #e2e8f0;
  padding: 10px 14px;
  border-radius: 8px;
  overflow-x: auto;
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.5;
  max-height: 200px;
  overflow-y: auto;
}

.error-section {
  margin-top: 12px;
}

.error-content {
  background: #fef2f2;
  color: #dc2626;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.message-time {
  display: block;
  margin-top: 8px;
  font-size: 11px;
  color: #9ca3af;
  text-align: right;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
