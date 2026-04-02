<script setup lang="ts">
import { ref } from 'vue'
import { NInput, NButton } from 'naive-ui'

const props = defineProps<{
  disabled?: boolean
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

/**
 * 处理清空输入
 */
function handleClear() {
  inputValue.value = ''
  inputRef.value?.focus()
}

// 暴露聚焦方法
defineExpose({
  focus: () => inputRef.value?.focus()
})
</script>

<template>
  <div class="chat-input">
    <div class="input-actions">
      <NButton 
        type="primary" 
        size="small"
        :disabled="!inputValue.trim() || disabled"
        @click="handleSend"
      >
        发送
      </NButton>
    </div>
    <div class="input-wrapper">
      <NInput
        ref="inputRef"
        v-model:value="inputValue"
        type="textarea"
        placeholder="输入消息... (Shift+Enter 换行)"
        :autosize="{ minRows: 1, maxRows: 6 }"
        :disabled="disabled"
        @keydown="handleKeyDown"
        @focus="handleFocus"
      />
    </div>
  </div>
</template>

<style scoped>
.chat-input {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.input-wrapper {
  flex: 1;
}

.input-wrapper :deep(.n-input) {
  background: var(--bg-secondary);
  border-radius: 12px;
}

.input-wrapper :deep(.n-input__input-el) {
  padding: 12px 16px !important;
  font-size: 15px;
  line-height: 1.5;
}

.input-actions {
  display: flex;
  align-items: center;
}

/* 统一按钮样式 - 使用 !important 确保优先级 */
.input-actions :deep(.n-button) {
  --n-color: #6366f1 !important;
  --n-color-hover: #818cf8 !important;
  --n-color-pressed: #4f46e5 !important;
  --n-color-focus: #818cf8 !important;
  --n-color-disabled: rgba(99, 102, 241, 0.5) !important;
  --n-text-color: #ffffff !important;
  --n-text-color-hover: #ffffff !important;
  --n-text-color-pressed: #ffffff !important;
  --n-text-color-focus: #ffffff !important;
  --n-text-color-disabled: rgba(255, 255, 255, 0.5) !important;
  --n-border: none !important;
  --n-border-hover: none !important;
  --n-border-pressed: none !important;
  --n-border-focus: none !important;
  --n-border-disabled: none !important;
  --n-height: 40px !important;
  --n-font-size: 14px !important;
  --n-padding: 0 20px !important;
  --n-border-radius: 10px !important;
  font-weight: 500 !important;
  transition: all 0.2s ease !important;
}

.input-actions :deep(.n-button:not(:disabled):hover) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.input-actions :deep(.n-button:not(:disabled):active) {
  transform: translateY(0);
}
</style>
