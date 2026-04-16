<script setup lang="ts">
import { computed } from 'vue'
import { NAvatar, NTooltip } from 'naive-ui'
import type { TextMessage } from '@/types'
import { renderMarkdown } from '@/utils/markdown'
import { formatDate, truncateText } from '@/utils/format'

interface Props {
  message: TextMessage
  showAvatar?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showAvatar: true,
})

const formattedContent = computed(() => {
  return renderMarkdown(props.message.content)
})

const previewText = computed(() => {
  return truncateText(props.message.content.replace(/[#*`\n]/g, ' ').trim(), 100)
})

const timeDisplay = computed(() => {
  return formatDate(props.message.createdAt, 'time')
})
</script>

<template>
  <div class="message user-message">
    <div class="message-content">
      <NTooltip trigger="hover" placement="top" :delay="500">
        <template #trigger>
          <div class="message-bubble" v-html="formattedContent"></div>
        </template>
        {{ previewText }}
      </NTooltip>

      <span class="message-time">{{ timeDisplay }}</span>
    </div>
  </div>
</template>

<style scoped>
.user-message {
  display: flex;
  flex-direction: row-reverse;
  gap: 12px;
  padding: 16px 20px;
  animation: fadeIn 0.3s ease-out;
}

.avatar-wrapper {
  flex-shrink: 0;
}

.message-content {
  max-width: 75%;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.message-bubble {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 16px;
  border-radius: 18px 18px 4px 18px;
  word-break: break-word;
  line-height: 1.6;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.25);
}

.message-bubble :deep(p) {
  margin: 0;
}

.message-bubble :deep(pre) {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 10px;
  overflow-x: auto;
  font-size: 13px;
}

.message-bubble :deep(code) {
  background: rgba(0, 0, 0, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Fira Code', monospace;
  font-size: 13px;
}

.message-time {
  font-size: 11px;
  color: #999;
  padding-right: 8px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
