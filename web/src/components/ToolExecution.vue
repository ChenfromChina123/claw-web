<script setup lang="ts">
/**
 * 工具执行可视化组件
 * 显示工具执行进度和结果
 */

import { computed } from 'vue'
import { NSpin, NTag, NCode, NButton, NCollapseTransition } from 'naive-ui'
import type { ToolCall } from '@/types'

interface Props {
  toolCall: ToolCall
  expanded?: boolean
  showDetails?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  expanded: false,
  showDetails: true,
})

const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'cancel'): void
  (e: 'expand', expanded: boolean): void
}>()

const statusConfig = computed(() => {
  switch (props.toolCall.status) {
    case 'pending':
      return { color: 'warning', text: '等待中', icon: '⏳' }
    case 'executing':
      return { color: 'info', text: '执行中', icon: '⚙️' }
    case 'completed':
      return { color: 'success', text: '完成', icon: '✅' }
    case 'error':
      return { color: 'error', text: '错误', icon: '❌' }
    default:
      return { color: 'default', text: '未知', icon: '❓' }
  }
})

const formattedInput = computed(() => {
  try {
    return JSON.stringify(props.toolCall.toolInput, null, 2)
  } catch {
    return String(props.toolCall.toolInput)
  }
})

const formattedOutput = computed(() => {
  if (!props.toolCall.toolOutput) return null
  try {
    return JSON.stringify(props.toolCall.toolOutput, null, 2)
  } catch {
    return String(props.toolCall.toolOutput)
  }
})

const duration = computed(() => {
  if (!props.toolCall.completedAt) return null
  const start = new Date(props.toolCall.createdAt).getTime()
  const end = new Date(props.toolCall.completedAt).getTime()
  return end - start
})

const formattedDuration = computed(() => {
  if (!duration.value) return null
  if (duration.value < 1000) return `${duration.value}ms`
  return `${(duration.value / 1000).toFixed(2)}s`
})

const isRunning = computed(() => 
  props.toolCall.status === 'pending' || props.toolCall.status === 'executing'
)
</script>

<template>
  <div class="tool-execution" :class="[`status-${toolCall.status}`]">
    <div class="tool-header" @click="emit('expand', !expanded)">
      <div class="tool-info">
        <span class="tool-icon">{{ statusConfig.icon }}</span>
        <NTag :type="statusConfig.color as any" size="small">
          {{ toolCall.toolName }}
        </NTag>
        <NTag v-if="isRunning" type="info" size="small">
          <NSpin v-if="toolCall.status === 'executing'" size="small" stroke="currentColor" />
          <span v-else>{{ statusConfig.text }}</span>
        </NTag>
        <NTag v-else :type="statusConfig.color as any" size="small">
          {{ statusConfig.text }}
        </NTag>
        <span v-if="formattedDuration" class="duration">
          {{ formattedDuration }}
        </span>
      </div>
      <div class="tool-actions">
        <NButton 
          v-if="toolCall.status === 'error'" 
          size="tiny" 
          @click.stop="emit('retry')"
        >
          重试
        </NButton>
      </div>
    </div>

    <NCollapseTransition :show="expanded">
      <div v-if="showDetails" class="tool-details">
        <div class="detail-section">
          <div class="section-title">输入参数</div>
          <NCode :code="formattedInput" language="json" />
        </div>

        <div v-if="formattedOutput" class="detail-section">
          <div class="section-title">输出结果</div>
          <NCode 
            :code="formattedOutput" 
            language="json"
            :class="{ 'output-error': toolCall.status === 'error' }"
          />
        </div>

        <div v-if="toolCall.error" class="detail-section error">
          <div class="section-title">错误信息</div>
          <div class="error-message">{{ toolCall.error }}</div>
        </div>
      </div>
    </NCollapseTransition>
  </div>
</template>

<style scoped>
.tool-execution {
  background: var(--n-color);
  border-radius: 8px;
  border: 1px solid var(--n-border-color);
  overflow: hidden;
  transition: all 0.2s ease;
}

.tool-execution:hover {
  border-color: var(--n-primary-color-hover);
}

.tool-execution.status-error {
  border-color: var(--n-error-color);
}

.tool-execution.status-completed {
  border-color: var(--n-success-color);
}

.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
}

.tool-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tool-icon {
  font-size: 16px;
}

.duration {
  font-size: 12px;
  color: var(--n-text-color-3);
  margin-left: 8px;
}

.tool-actions {
  display: flex;
  gap: 8px;
}

.tool-details {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--n-text-color-3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-section.error {
  padding: 8px;
  background: rgba(var(--n-error-color-rgb), 0.1);
  border-radius: 4px;
}

.error-message {
  color: var(--n-error-color);
  font-family: monospace;
  font-size: 13px;
  white-space: pre-wrap;
}

.output-error {
  border-left: 3px solid var(--n-error-color);
}
</style>
