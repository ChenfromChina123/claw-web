<script setup lang="ts">
import { ref } from 'vue'
import { NInput, NButton, NSpace, NTooltip } from 'naive-ui'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  focus: []
}>()

const inputValue = ref('')
const inputRef = ref<InstanceType<typeof NInput> | null>(null)

function handleSend() {
  if (!inputValue.value.trim() || props.disabled) return
  emit('send', inputValue.value)
  inputValue.value = ''
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function handleFocus() {
  emit('focus')
}

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
    <div class="input-actions">
      <NSpace>
        <NTooltip>
          <template #trigger>
            <NButton text size="small" @click="handleClear">
              🗑️
            </NButton>
          </template>
          清空输入
        </NTooltip>
      </NSpace>
      <NButton 
        type="primary" 
        :disabled="!inputValue.trim() || disabled"
        @click="handleSend"
      >
        发送
      </NButton>
    </div>
    <div class="input-hint">
      <span>按 Enter 发送，Shift+Enter 换行</span>
      <span class="command-hint">输入 <code>/</code> 使用命令</span>
    </div>
  </div>
</template>

<style scoped>
.chat-input {
  max-width: 900px;
  margin: 0 auto;
}

.input-wrapper {
  margin-bottom: 8px;
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
  justify-content: space-between;
  align-items: center;
}

.input-hint {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 8px;
}

.command-hint code {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}
</style>
