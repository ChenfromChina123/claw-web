<script setup lang="ts">
defineProps<{
  result: string
  status: 'pending' | 'executing' | 'completed' | 'error'
}>()
</script>

<template>
  <div class="tool-result" :class="status">
    <div class="result-header">
      <span class="result-icon">{{ status === 'completed' ? '✓' : '✗' }}</span>
      <span class="result-label">结果</span>
    </div>
    <div class="result-content">
      <pre>{{ result }}</pre>
    </div>
  </div>
</template>

<style scoped>
.tool-result {
  background: #1a2f1a;
  border: 1px solid #22c55e;
  border-radius: 8px;
  margin: 8px 0;
  overflow: hidden;
}

.tool-result.error {
  background: #2f1a1a;
  border-color: #ef4444;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #162016;
  border-bottom: 1px solid #22c55e;
}

.tool-result.error .result-header {
  border-bottom-color: #ef4444;
}

.result-icon {
  font-size: 14px;
  color: #22c55e;
}

.tool-result.error .result-icon {
  color: #ef4444;
}

.result-label {
  font-size: 12px;
  color: #888;
}

.result-content {
  padding: 12px 16px;
}

.result-content pre {
  background: #0d1a0d;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  margin: 0;
  color: #4ade80;
  max-height: 300px;
  overflow-y: auto;
}

.tool-result.error .result-content pre {
  background: #1a0d0d;
  color: #f87171;
}
</style>