<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  (e: 'send', message: string): void
}>()

const input = ref('')

function handleSend() {
  const text = input.value.trim()
  if (text) {
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
      placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
      rows="3"
    ></textarea>
    <button @click="handleSend" :disabled="!input.trim()">
      发送
    </button>
  </div>
</template>

<style scoped>
.chat-input {
  display: flex;
  gap: 12px;
  padding: 16px;
  background: white;
  border-top: 1px solid #e0e0e0;
}

.chat-input textarea {
  flex: 1;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  resize: none;
  font-size: 14px;
  font-family: inherit;
}

.chat-input textarea:focus {
  outline: none;
  border-color: #2196f3;
}

.chat-input button {
  padding: 12px 24px;
  background: #2196f3;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.chat-input button:hover:not(:disabled) {
  background: #1976d2;
}

.chat-input button:disabled {
  background: #bdbdbd;
  cursor: not-allowed;
}
</style>