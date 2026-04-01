<script setup lang="ts">
defineProps<{
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}>()
</script>

<template>
  <div :class="['message', role]">
    <div class="avatar-wrapper">
      <div class="avatar" :class="role">
        {{ role === 'user' ? '👤' : '🤖' }}
      </div>
    </div>
    <div class="content-wrapper">
      <div class="role-label">{{ role === 'user' ? '你' : 'Claude' }}</div>
      <div class="content">
        <div class="text" :class="{ streaming: isStreaming }" v-html="content"></div>
        <span v-if="isStreaming" class="typing-cursor">▋</span>
      </div>
      <slot name="tool-calls"></slot>
    </div>
  </div>
</template>

<style scoped>
.message {
  display: flex;
  gap: 16px;
  padding: 20px;
  margin-bottom: 8px;
  border-radius: 16px;
  transition: background 0.2s;
}

.message.user {
  background: rgba(30, 30, 50, 0.5);
  flex-direction: row-reverse;
  border: 1px solid rgba(99, 102, 241, 0.1);
}

.message.assistant {
  background: rgba(25, 25, 45, 0.6);
  border: 1px solid rgba(99, 102, 241, 0.08);
}

.avatar-wrapper {
  flex-shrink: 0;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  transition: all 0.2s;
}

.avatar.user {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%);
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.avatar.assistant {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.content-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.role-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 0;
}

.message.user .role-label {
  text-align: right;
  color: #a5b4fc;
}

.message.assistant .role-label {
  color: #86efac;
}

.content {
  display: flex;
  flex-direction: column;
}

.text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
  color: #e5e7eb;
  font-size: 15px;
}

.text.streaming {
  color: #f0f0f0;
}

.text :deep(code) {
  background: rgba(15, 15, 30, 0.8);
  padding: 3px 8px;
  border-radius: 6px;
  font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
  font-size: 13px;
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.text :deep(pre) {
  background: rgba(15, 15, 30, 0.9);
  padding: 16px;
  border-radius: 12px;
  overflow-x: auto;
  color: #e5e7eb;
  border: 1px solid rgba(99, 102, 241, 0.15);
  margin: 12px 0;
}

.text :deep(pre code) {
  background: none;
  padding: 0;
  border: none;
  color: inherit;
  font-size: 13px;
  line-height: 1.6;
}

.text :deep(p) {
  margin: 0 0 12px 0;
}

.text :deep(p:last-child) {
  margin-bottom: 0;
}

.text :deep(ul), .text :deep(ol) {
  margin: 12px 0;
  padding-left: 24px;
}

.text :deep(li) {
  margin: 6px 0;
}

.text :deep(blockquote) {
  border-left: 3px solid rgba(99, 102, 241, 0.5);
  padding-left: 16px;
  margin: 12px 0;
  color: #9ca3af;
}

.text :deep(a) {
  color: #818cf8;
  text-decoration: none;
}

.text :deep(a:hover) {
  text-decoration: underline;
}

.text :deep(table) {
  border-collapse: collapse;
  margin: 12px 0;
  width: 100%;
}

.text :deep(th), .text :deep(td) {
  border: 1px solid rgba(99, 102, 241, 0.2);
  padding: 8px 12px;
  text-align: left;
}

.text :deep(th) {
  background: rgba(99, 102, 241, 0.1);
}

.typing-cursor {
  display: inline-block;
  color: #6366f1;
  font-weight: bold;
  animation: blink 1s step-end infinite;
  margin-left: 2px;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

@media (max-width: 640px) {
  .message {
    gap: 12px;
    padding: 16px;
  }

  .avatar {
    width: 36px;
    height: 36px;
    font-size: 18px;
    border-radius: 10px;
  }

  .text {
    font-size: 14px;
  }
}
</style>