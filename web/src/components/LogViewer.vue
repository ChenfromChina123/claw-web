<template>
  <div class="log-viewer">
    <div class="log-header">
      <h3 class="log-title">项目日志 - {{ projectName }}</h3>
      <div class="log-controls">
        <select v-model="logType" class="log-type-select">
          <option value="all">全部日志</option>
          <option value="stdout">标准输出</option>
          <option value="stderr">错误输出</option>
        </select>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索日志..."
          class="log-search"
        />
        <button @click="handleRefresh" class="refresh-btn" :disabled="loading">
          <span class="btn-icon">🔄</span>
          刷新
        </button>
        <button @click="handleDownload" class="download-btn">
          <span class="btn-icon">📥</span>
          下载
        </button>
        <button @click="handleClear" class="clear-btn">
          <span class="btn-icon">🗑</span>
          清空
        </button>
      </div>
    </div>

    <div class="log-content" ref="logContainer">
      <div v-if="loading" class="log-loading">
        <div class="spinner"></div>
        <span>加载中...</span>
      </div>
      
      <div v-else-if="!filteredLogs.length" class="log-empty">
        <span class="empty-icon">📋</span>
        <span>暂无日志</span>
      </div>

      <div v-else class="log-lines">
        <div
          v-for="(line, index) in filteredLogs"
          :key="index"
          class="log-line"
          :class="getLogClass(line)"
        >
          <span class="line-number">{{ index + 1 }}</span>
          <span class="line-content">{{ line }}</span>
        </div>
      </div>
    </div>

    <div class="log-footer">
      <div class="log-stats">
        <span>总行数: {{ filteredLogs.length }}</span>
        <span v-if="errorCount > 0" class="error-count">
          错误: {{ errorCount }}
        </span>
      </div>
      <div class="auto-scroll">
        <label>
          <input type="checkbox" v-model="autoScroll" />
          自动滚动
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'

interface Props {
  projectName: string
  stdout: string
  stderr: string
  loading?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  refresh: []
  clear: []
}>()

const logType = ref<'all' | 'stdout' | 'stderr'>('all')
const searchQuery = ref('')
const autoScroll = ref(true)
const logContainer = ref<HTMLElement | null>(null)

const allLogs = computed(() => {
  const logs: string[] = []
  
  if (logType.value === 'all' || logType.value === 'stdout') {
    if (props.stdout) {
      logs.push(...props.stdout.split('\n'))
    }
  }
  
  if (logType.value === 'all' || logType.value === 'stderr') {
    if (props.stderr) {
      logs.push(...props.stderr.split('\n'))
    }
  }
  
  return logs.filter(line => line.trim())
})

const filteredLogs = computed(() => {
  if (!searchQuery.value) {
    return allLogs.value
  }
  
  const query = searchQuery.value.toLowerCase()
  return allLogs.value.filter(line => 
    line.toLowerCase().includes(query)
  )
})

const errorCount = computed(() => {
  return allLogs.value.filter(line => 
    line.toLowerCase().includes('error') || 
    line.toLowerCase().includes('exception')
  ).length
})

function getLogClass(line: string): string {
  const lowerLine = line.toLowerCase()
  if (lowerLine.includes('error') || lowerLine.includes('exception')) {
    return 'log-error'
  }
  if (lowerLine.includes('warn') || lowerLine.includes('warning')) {
    return 'log-warning'
  }
  if (lowerLine.includes('info')) {
    return 'log-info'
  }
  return ''
}

function handleRefresh() {
  emit('refresh')
}

function handleDownload() {
  const content = filteredLogs.value.join('\n')
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${props.projectName}-logs-${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

function handleClear() {
  if (confirm('确定要清空日志吗？')) {
    emit('clear')
  }
}

watch([() => props.stdout, () => props.stderr], () => {
  if (autoScroll.value) {
    nextTick(() => {
      if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight
      }
    })
  }
})

onMounted(() => {
  if (logContainer.value && autoScroll.value) {
    logContainer.value.scrollTop = logContainer.value.scrollHeight
  }
})
</script>

<style scoped>
.log-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.log-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.log-controls {
  display: flex;
  gap: 8px;
  align-items: center;
}

.log-type-select,
.log-search {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.log-search {
  width: 200px;
}

.refresh-btn,
.download-btn,
.clear-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.refresh-btn {
  background: var(--primary-color);
  color: white;
}

.download-btn {
  background: var(--success-color);
  color: white;
}

.clear-btn {
  background: var(--error-color);
  color: white;
}

.refresh-btn:hover:not(:disabled),
.download-btn:hover,
.clear-btn:hover {
  opacity: 0.8;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon {
  font-size: 14px;
}

.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  font-family: 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  background: #1e1e1e;
  color: #d4d4d4;
}

.log-loading,
.log-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  gap: 12px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-icon {
  font-size: 48px;
}

.log-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.log-line {
  display: flex;
  gap: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s ease;
}

.log-line:hover {
  background: rgba(255, 255, 255, 0.05);
}

.line-number {
  color: #858585;
  user-select: none;
  min-width: 40px;
  text-align: right;
}

.line-content {
  flex: 1;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-error {
  background: rgba(244, 63, 94, 0.1);
  color: #f43f5e;
}

.log-warning {
  background: rgba(251, 191, 36, 0.1);
  color: #fbbf24;
}

.log-info {
  color: #60a5fa;
}

.log-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  font-size: 12px;
  color: var(--text-secondary);
}

.log-stats {
  display: flex;
  gap: 16px;
}

.error-count {
  color: var(--error-color);
  font-weight: 500;
}

.auto-scroll label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.auto-scroll input[type="checkbox"] {
  cursor: pointer;
}
</style>
