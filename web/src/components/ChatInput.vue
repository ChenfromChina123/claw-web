<script setup lang="ts">
import { ref } from 'vue'
import { NInput, NButton } from 'naive-ui'

const props = defineProps<{
  disabled?: boolean
  sidebarCollapsed?: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  focus: []
}>()

const inputValue = ref('')
const inputRef = ref<InstanceType<typeof NInput> | null>(null)

/**
 * 处理发送消息
 */
function handleSend() {
  if (!inputValue.value.trim() || props.disabled) return
  emit('send', inputValue.value)
  inputValue.value = ''
}

/**
 * 处理键盘按下事件
 * @param e 键盘事件对象
 */
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

/**
 * 处理输入框聚焦
 */
function handleFocus() {
  emit('focus')
}

// 暴露聚焦方法
defineExpose({
  focus: () => inputRef.value?.focus()
})
</script>

<template>
  <div class="chat-input">
    <div class="input-wrapper">
      <NInput
        ref="inputRef"
        v-model:value="inputValue"
        type="textarea"
        placeholder="输入消息... (Shift+Enter 换行)"
        :autosize="{ minRows: 3, maxRows: 8 }"
        :disabled="disabled"
        @keydown="handleKeyDown"
        @focus="handleFocus"
      />
    </div>
    <div class="input-actions">
      <NButton
        type="primary"
        :disabled="!inputValue.trim() || disabled"
        class="send-button"
        @click="handleSend"
      >
        发送
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.chat-input {
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 10px;
  padding: 10px;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.input-wrapper {
  flex: 1;
  min-width: 0;
}

.input-wrapper :deep(.n-input) {
  background: var(--bg-secondary);
  border-radius: 12px;
}

.input-wrapper :deep(.n-input__input-el) {
  padding: 14px 18px !important;
  font-size: 15px;
  line-height: 1.6;
}

.input-actions {
  display: flex;
  align-items: flex-end;
  flex-shrink: 0;
  padding-bottom: 2px;
}

/* 发送按钮样式 */
.send-button {
  height: 56px !important;
  min-height: 56px !important;
  padding: 0 32px !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  border-radius: 12px !important;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
  color: #ffffff !important;
  border: none !important;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.send-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%) !important;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
}

.send-button:active:not(:disabled) {
  background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%) !important;
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.send-button:disabled {
  background: linear-gradient(135deg, #a5a6f6 0%, #818cf8 100%) !important;
  color: rgba(255, 255, 255, 0.6) !important;
  cursor: not-allowed;
  box-shadow: none;
}

.send-button:hover:not(:disabled) {
  background: #818cf8 !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.send-button:active:not(:disabled) {
  background: #4f46e5 !important;
  transform: translateY(0);
}

.send-button:disabled {
  background: rgba(99, 102, 241, 0.5) !important;
  color: rgba(255, 255, 255, 0.5) !important;
  cursor: not-allowed;
}
</style>
