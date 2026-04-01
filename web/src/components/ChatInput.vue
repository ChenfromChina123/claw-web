<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'send', message: string): void
}>()

const props = defineProps<{
  disabled?: boolean
}>()

const input = ref('')

function handleSend() {
  const text = input.value.trim()
  if (text && !props.disabled) {
    emit('send', text)
    input.value = ''
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="chat-input">
    <textarea
      v-model="input"
      @keydown="handleKeydown"
      :placeholder="disabled ? '等待连接...' : '输入消息... (Enter 发送，Shift+Enter 换行)'"
      rows="3"
      :disabled="disabled"
    ></textarea>
    <button @click="handleSend" :disabled="!input.trim() || disabled">
      发送
    </button>
  </div>
</template>

<style scoped>
.chat-input {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  background: #16213e;
  border-top: 1px solid #0f3460;
}

.chat-input textarea {
  flex: 1;
  padding: 12px;
  border: 1px solid #0f3460;
  border-radius: 8px;
  resize: none;
  font-size: 14px;
  font-family: inherit;
  background: #1a1a2e;
  color: #eee;
}

.chat-input textarea:focus {
  outline: none;
  border-color: #e94560;
}

.chat-input textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-input button {
  padding: 12px 24px;
  background: #e94560;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.chat-input button:hover:not(:disabled) {
  background: #d63850;
}

.chat-input button:disabled {
  background: #3a3a6a;
  cursor: not-allowed;
}
</style>