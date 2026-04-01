<script setup lang="ts">
defineProps<{
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}>()
</script>

<template>
  <div :class="['message', role]">
    <div class="avatar">
      {{ role === 'user' ? '👤' : '🤖' }}
    </div>
    <div class="content">
      <div class="role-label">{{ role === 'user' ? '你' : 'Claude' }}</div>
      <div class="text" :class="{ streaming: isStreaming }" v-html="content"></div>
      <span v-if="isStreaming" class="typing-cursor">▋</span>
      <slot name="tool-calls"></slot>
    </div>
  </div>
</template>

<style scoped>
.message {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 12px;
}

.message.user {
  background: #252550;
  flex-direction: row-reverse;
}

.message.assistant {
  background: #1e1e3f;
}

.avatar {
  font-size: 24px;
  flex-shrink: 0;
}

.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.role-label {
  font-size: 12px;
  font-weight: bold;
  color: #888;
  margin-bottom: 4px;
}

.message.user .role-label {
  text-align: right;
}

.text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  color: #e0e0e0;
}

.text :deep(code) {
  background: #16213e;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  color: #4ade80;
}

.text :deep(pre) {
  background: #16162a;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  color: #e0e0e0;
}

.text :deep(pre code) {
  background: none;
  padding: 0;
}

.typing-cursor {
  display: inline-block;
  color: #e94560;
  font-weight: bold;
  animation: blink 1s step-end infinite;
  margin-left: 2px;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>
