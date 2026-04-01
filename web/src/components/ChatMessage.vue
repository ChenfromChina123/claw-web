<script setup lang="ts">
defineProps<{
  role: 'user' | 'assistant'
  content: string
}>()
</script>

<template>
  <div :class="['message', role]">
    <div class="avatar">
      {{ role === 'user' ? '👤' : '🤖' }}
    </div>
    <div class="content">
      <div class="role-label">{{ role === 'user' ? '你' : 'Claude' }}</div>
      <div class="text" v-html="content"></div>
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
  background: #e3f2fd;
  flex-direction: row-reverse;
}

.message.assistant {
  background: #f5f5f5;
}

.avatar {
  font-size: 24px;
  flex-shrink: 0;
}

.content {
  flex: 1;
  min-width: 0;
}

.role-label {
  font-size: 12px;
  font-weight: bold;
  color: #666;
  margin-bottom: 4px;
}

.text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.text :deep(code) {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.text :deep(pre) {
  background: #2d2d2d;
  color: #f8f8f2;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
}
</style>