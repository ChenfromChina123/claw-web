<script setup lang="ts">
import { computed, ref } from 'vue'
import { NAvatar, NButton, NTooltip } from 'naive-ui'
import type { TextMessage } from '@/types'
import { renderMarkdown, copyToClipboard } from '@/utils/markdown'
import { formatDate } from '@/utils/format'

interface Props {
  message: TextMessage
  showAvatar?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showAvatar: true,
})

const isStreaming = computed(() => props.message.isStreaming)

const formattedContent = computed(() => {
  const content = props.message.content

  if (isStreaming.value && content) {
    return renderMarkdown(content + '<span class="cursor">|</span>')
  }

  return renderMarkdown(content || '*正在思考...*')
})

const timeDisplay = computed(() => {
  return formatDate(props.message.createdAt, 'time')
})

const copied = ref(false)

async function handleCopy(): Promise<void> {
  try {
    await copyToClipboard(props.message.content)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('复制失败:', error)
  }
}
</script>

<template>
  <div class="message assistant-message">
    <div v-if="showAvatar" class="avatar-wrapper">
      <NAvatar round size="small" :style="{ backgroundColor: '#10b981' }">
        AI
      </NAvatar>
    </div>

    <div class="message-content">
      <div class="message-header">
        <span class="assistant-label">助手</span>
        <NTooltip trigger="hover" placement="top">
          <template #trigger>
            <NButton text size="tiny" @click="handleCopy">
              {{ copied ? '已复制' : '复制' }}
            </NButton>
          </template>
          复制消息内容
        </NTooltip>
      </div>

      <div
        class="message-body"
        :class="{ streaming: isStreaming }"
        v-html="formattedContent"
      ></div>

      <span class="message-time">{{ timeDisplay }}</span>
    </div>
  </div>
</template>

<style scoped>
.assistant-message {
  display: flex;
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
  gap: 6px;
}

.message-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.assistant-label {
  font-size: 12px;
  font-weight: 600;
  color: #10b981;
}

.message-body {
  background: #1e1e2e;
  color: #e2e8f0;
  padding: 14px 18px;
  border-radius: 4px 18px 18px 18px;
  word-break: break-word;
  line-height: 1.7;
  font-size: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.message-body.streaming .cursor {
  animation: blink 1s infinite;
  color: #10b981;
  font-weight: bold;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

.message-body :deep(p) {
  margin: 0 0 8px 0;
}

.message-body :deep(p:last-child) {
  margin-bottom: 0;
}

.message-body :deep(h1),
.message-body :deep(h2),
.message-body :deep(h3) {
  margin-top: 16px;
  margin-bottom: 8px;
  color: #f1f5f9;
}

.message-body :deep(h1) {
  font-size: 1.5em;
}

.message-body :deep(h2) {
  font-size: 1.3em;
}

.message-body :deep(h3) {
  font-size: 1.15em;
}

.message-body :deep(ul),
.message-body :deep(ol) {
  padding-left: 24px;
  margin: 8px 0;
}

.message-body :deep(li) {
  margin: 4px 0;
}

.message-body :deep(blockquote) {
  border-left: 4px solid #6366f1;
  padding-left: 16px;
  margin: 12px 0;
  color: #94a3b8;
  font-style: italic;
}

.message-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.message-body :deep(th),
.message-body :deep(td) {
  border: 1px solid #334155;
  padding: 8px 12px;
  text-align: left;
}

.message-body :deep(th) {
  background: #334155;
  font-weight: 600;
}

.message-body :deep(pre) {
  background: #0d1117;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  margin: 12px 0;
  position: relative;
}

.message-body :deep(code) {
  font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
}

.message-body :deep(:not(pre) > code) {
  background: #334155;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.message-body :deep(.hljs) {
  background: transparent !important;
  padding: 0 !important;
}

.message-time {
  font-size: 11px;
  color: #999;
  padding-left: 8px;
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
