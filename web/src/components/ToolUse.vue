<script setup lang="ts">
defineProps<{
  name: string
  input: string
  status: 'pending' | 'executing' | 'completed' | 'error'
  progress?: string
}>()
</script>

<template>
  <div class="tool-use" :class="status">
    <div class="tool-header">
      <span class="tool-icon">⏺</span>
      <span class="tool-name">{{ name }}</span>
      <span v-if="status === 'executing'" class="tool-status">执行中...</span>
      <span v-else-if="status === 'completed'" class="tool-status completed">✓ 完成</span>
      <span v-else-if="status === 'error'" class="tool-status error">✗ 错误</span>
      <span v-else class="tool-status">等待中</span>
    </div>
    <div class="tool-content">
      <pre class="tool-input">{{ input }}</pre>
      <div v-if="progress" class="tool-progress">
        <span class="progress-label">输出:</span>
        <pre class="progress-output">{{ progress }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-use {
  background: #1e1e3f;
  border: 1px solid #3a3a6a;
  border-radius: 8px;
  margin: 12px 0;
  overflow: hidden;
}

.tool-use.executing {
  border-color: #f59e0b;
}

.tool-use.completed {
  border-color: #22c55e;
}

.tool-use.error {
  border-color: #ef4444;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #252550;
  border-bottom: 1px solid #3a3a6a;
}

.tool-icon {
  font-size: 14px;
}

.tool-name {
  font-weight: bold;
  color: #a78bfa;
}

.tool-status {
  margin-left: auto;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #3a3a6a;
  color: #888;
}

.tool-status.completed {
  background: #22c55e;
  color: white;
}

.tool-status.error {
  background: #ef4444;
  color: white;
}

.tool-content {
  padding: 12px 16px;
}

.tool-input {
  background: #16162a;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  margin: 0;
  color: #e0e0e0;
}

.tool-progress {
  margin-top: 12px;
}

.progress-label {
  font-size: 12px;
  color: #888;
  display: block;
  margin-bottom: 4px;
}

.progress-output {
  background: #0d0d1a;
  padding: 8px;
  border-radius: 4px;
  font-size: 11px;
  overflow-x: auto;
  margin: 0;
  color: #4ade80;
  max-height: 150px;
  overflow-y: auto;
}
</style>