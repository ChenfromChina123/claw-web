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
  <div class="chat-input-wrapper">
    <div class="chat-input">
      <textarea
        v-model="input"
        @keydown="handleKeydown"
        :placeholder="disabled ? '等待连接...' : '输入消息... (Enter 发送，Shift+Enter 换行)'"
        rows="3"
        :disabled="disabled"
      ></textarea>
      <button @click="handleSend" :disabled="!input.trim() || disabled" class="send-btn">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>发送</span>
      </button>
    </div>
    <div class="input-hint">
      <kbd>Enter</kbd> 发送 · <kbd>Shift</kbd>+<kbd>Enter</kbd> 换行
    </div>
  </div>
</template>

<style scoped>
.chat-input-wrapper {
  background: rgba(20, 20, 30, 0.95);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(99, 102, 241, 0.15);
  padding: 16px 20px;
}

.chat-input {
  display: flex;
  gap: 12px;
  max-width: 900px;
  margin: 0 auto;
}

.chat-input textarea {
  flex: 1;
  padding: 14px 16px;
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 14px;
  resize: none;
  font-size: 15px;
  font-family: inherit;
  background: rgba(30, 30, 50, 0.8);
  color: #e5e7eb;
  outline: none;
  transition: all 0.2s;
  line-height: 1.5;
}

.chat-input textarea::placeholder {
  color: #6b7280;
}

.chat-input textarea:focus {
  border-color: rgba(99, 102, 241, 0.5);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.chat-input textarea:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  padding: 14px 24px;
  background: linear-gradient(135deg, #6366f1 0%, #7c3aed 100%);
  color: white;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: flex-end;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.send-btn svg {
  width: 18px;
  height: 18px;
}

.send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
}

.send-btn:active:not(:disabled) {
  transform: translateY(0);
}

.send-btn:disabled {
  background: #3a3a5a;
  cursor: not-allowed;
  box-shadow: none;
}

.input-hint {
  text-align: center;
  font-size: 11px;
  color: #4b5563;
  margin-top: 10px;
}

.input-hint kbd {
  background: rgba(99, 102, 241, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 10px;
  border: 1px solid rgba(99, 102, 241, 0.2);
  color: #818cf8;
}

@media (max-width: 640px) {
  .chat-input-wrapper {
    padding: 12px 16px;
  }

  .chat-input textarea {
    padding: 12px 14px;
    font-size: 14px;
  }

  .send-btn {
    padding: 12px 18px;
    font-size: 14px;
  }

  .send-btn span {
    display: none;
  }

  .send-btn svg {
    width: 20px;
    height: 20px;
  }
}
</style>