<script setup lang="ts">
/**
 * BackgroundTasksPanel - 后台任务看板组件
 * 
 * 功能：
 * - 显示所有后台任务列表
 * - 实时更新任务状态
 * - 支持任务筛选和搜索
 * - 任务取消操作
 * - 点击跳转到相关会话
 */

import { computed, ref, onMounted, onUnmounted } from 'vue'
import { 
  NCard, 
  NTag, 
  NButton, 
  NProgress, 
  NEmpty, 
  NSpace,
  NInput,
  NDropdown,
  NScrollbar
} from 'naive-ui'
import type { BackgroundTask, BackgroundTaskStatus } from '@/types/agentWorkflow'
import { useAgentStore } from '@/stores/agent'
import agentApi from '@/api/agentApi'

// Props
interface Props {
  showHeader?: boolean
  showFilters?: boolean
  compact?: boolean
  maxHeight?: string
}

const props = withDefaults(defineProps<Props>(), {
  showHeader: true,
  showFilters: true,
  compact: false,
  maxHeight: '400px'
})

const emit = defineEmits<{
  (e: 'task-click', task: BackgroundTask): void
  (e: 'task-cancel', taskId: string): void
  (e: 'jump-to-trace', traceId: string): void
}>()

const agentStore = useAgentStore()

// 刷新间隔
const REFRESH_INTERVAL = 5000
let refreshTimer: number | null = null

// 筛选状态
const filterStatus = ref<BackgroundTaskStatus | 'ALL'>('ALL')
const searchQuery = ref('')

// 状态配置
const statusConfig: Record<BackgroundTaskStatus, {
  color: string
  bgColor: string
  label: string
  icon: string
}> = {
  PENDING: { color: '#999', bgColor: 'rgba(153,153,153,0.1)', label: '等待中', icon: '⏳' },
  RUNNING: { color: '#2080f0', bgColor: 'rgba(32,128,240,0.1)', label: '运行中', icon: '⚡' },
  COMPLETED: { color: '#18a058', bgColor: 'rgba(24,160,88,0.1)', label: '已完成', icon: '✅' },
  FAILED: { color: '#d03050', bgColor: 'rgba(208,48,80,0.1)', label: '失败', icon: '❌' },
  CANCELLED: { color: '#999', bgColor: 'rgba(153,153,153,0.1)', label: '已取消', icon: '🚫' }
}

// 筛选选项
const filterOptions = [
  { label: '全部', value: 'ALL' },
  { label: '运行中', value: 'RUNNING' },
  { label: '等待中', value: 'PENDING' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '失败', value: 'FAILED' },
  { label: '已取消', value: 'CANCELLED' }
]

// 任务列表
const taskList = computed(() => {
  let tasks = Array.from(agentStore.backgroundTasks.values())
  
  // 按状态筛选
  if (filterStatus.value !== 'ALL') {
    tasks = tasks.filter(t => t.status === filterStatus.value)
  }
  
  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    tasks = tasks.filter(t => 
      t.name.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query) ||
      t.taskId.toLowerCase().includes(query)
    )
  }
  
  // 按创建时间倒序排列
  return tasks.sort((a, b) => b.createdAt - a.createdAt)
})

// 任务统计
const taskStats = computed(() => {
  const tasks = Array.from(agentStore.backgroundTasks.values())
  return {
    total: tasks.length,
    running: tasks.filter(t => t.status === 'RUNNING').length,
    pending: tasks.filter(t => t.status === 'PENDING').length,
    completed: tasks.filter(t => t.status === 'COMPLETED').length,
    failed: tasks.filter(t => t.status === 'FAILED').length
  }
})

// 获取状态配置
function getStatusConfig(status: BackgroundTaskStatus) {
  return statusConfig[status] || statusConfig.PENDING
}

// 格式化时间
function formatTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  
  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// 格式化耗时
function formatDuration(start?: number, end?: number): string {
  if (!start) return ''
  const endTime = end || Date.now()
  const duration = endTime - start
  
  if (duration < 1000) return `${duration}ms`
  if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`
  return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`
}

// 处理任务点击
function handleTaskClick(task: BackgroundTask) {
  emit('task-click', task)
}

// 处理取消任务
async function handleCancelTask(taskId: string) {
  try {
    await agentStore.cancelBackgroundTask(taskId)
    emit('task-cancel', taskId)
  } catch (error) {
    console.error('Failed to cancel task:', error)
  }
}

// 处理跳转到 Trace
function handleJumpToTrace(traceId: string) {
  emit('jump-to-trace', traceId)
  agentStore.setCurrentTrace(traceId)
}

// 刷新任务列表
async function refreshTasks() {
  try {
    await agentStore.refreshBackgroundTasks()
  } catch (error) {
    console.error('Failed to refresh tasks:', error)
  }
}

// 开始自动刷新
function startAutoRefresh() {
  if (refreshTimer) return
  refreshTimer = window.setInterval(refreshTasks, REFRESH_INTERVAL)
}

// 停止自动刷新
function stopAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

// 获取任务操作菜单
function getTaskActions(task: BackgroundTask) {
  const actions = []
  
  if (task.traceId) {
    actions.push({
      label: '跳转到会话',
      key: 'jump'
    })
  }
  
  if (task.status === 'RUNNING' || task.status === 'PENDING') {
    actions.push({
      label: '取消任务',
      key: 'cancel'
    })
  }
  
  actions.push({
    label: '复制任务ID',
    key: 'copy'
  })
  
  return actions
}

// 处理任务操作
function handleTaskAction(key: string, task: BackgroundTask) {
  switch (key) {
    case 'jump':
      if (task.traceId) handleJumpToTrace(task.traceId)
      break
    case 'cancel':
      handleCancelTask(task.taskId)
      break
    case 'copy':
      navigator.clipboard.writeText(task.taskId)
      break
  }
}

// 生命周期
onMounted(() => {
  refreshTasks()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div class="background-tasks-panel" :class="{ compact }">
    <!-- 头部 -->
    <div v-if="showHeader" class="panel-header">
      <div class="header-info">
        <span class="header-icon">📋</span>
        <span class="header-title">后台任务</span>
        <NTag v-if="taskStats.running > 0" size="small" type="info">
          {{ taskStats.running }} 运行中
        </NTag>
      </div>
      
      <NButton size="tiny" quaternary @click="refreshTasks">
        刷新
      </NButton>
    </div>
    
    <!-- 筛选器 -->
    <div v-if="showFilters" class="filters">
      <NInput
        v-model:value="searchQuery"
        placeholder="搜索任务..."
        size="small"
        clearable
        class="search-input"
      >
        <template #prefix>
          <span>🔍</span>
        </template>
      </NInput>
      
      <NSpace :size="6">
        <NTag
          v-for="option in filterOptions"
          :key="option.value"
          :type="filterStatus === option.value ? 'primary' : undefined"
          :bordered="filterStatus !== option.value"
          size="small"
          checkable
          :checked="filterStatus === option.value"
          @click="filterStatus = option.value as BackgroundTaskStatus | 'ALL'"
        >
          {{ option.label }}
        </NTag>
      </NSpace>
    </div>
    
    <!-- 统计栏 -->
    <div v-if="!compact" class="stats-bar">
      <div class="stat-item">
        <span class="stat-value">{{ taskStats.total }}</span>
        <span class="stat-label">总任务</span>
      </div>
      <div class="stat-item running">
        <span class="stat-value">{{ taskStats.running }}</span>
        <span class="stat-label">运行中</span>
      </div>
      <div class="stat-item completed">
        <span class="stat-value">{{ taskStats.completed }}</span>
        <span class="stat-label">已完成</span>
      </div>
      <div class="stat-item failed">
        <span class="stat-value">{{ taskStats.failed }}</span>
        <span class="stat-label">失败</span>
      </div>
    </div>
    
    <!-- 任务列表 -->
    <NScrollbar :style="{ maxHeight }" class="task-list-container">
      <NEmpty 
        v-if="taskList.length === 0" 
        description="暂无后台任务" 
        class="empty-state"
      >
        <template #icon>
          <span class="empty-icon">📋</span>
        </template>
      </NEmpty>
      
      <div v-else class="task-list">
        <div 
          v-for="task in taskList" 
          :key="task.taskId"
          class="task-item"
          @click="handleTaskClick(task)"
        >
          <!-- 任务图标 -->
          <div 
            class="task-icon"
            :style="{ 
              backgroundColor: getStatusConfig(task.status).bgColor,
              color: getStatusConfig(task.status).color
            }"
          >
            {{ getStatusConfig(task.status).icon }}
          </div>
          
          <!-- 任务信息 -->
          <div class="task-info">
            <div class="task-header">
              <span class="task-name">{{ task.name }}</span>
              <NTag 
                size="tiny" 
                :bordered="false"
                :style="{ 
                  backgroundColor: getStatusConfig(task.status).bgColor,
                  color: getStatusConfig(task.status).color
                }"
              >
                {{ getStatusConfig(task.status).label }}
              </NTag>
            </div>
            
            <div class="task-meta">
              <span class="task-time">{{ formatTime(task.createdAt) }}</span>
              <span v-if="task.startedAt" class="task-duration">
                {{ formatDuration(task.startedAt, task.completedAt) }}
              </span>
            </div>
            
            <!-- 进度条 -->
            <div v-if="task.status === 'RUNNING' || task.status === 'PENDING'" class="task-progress">
              <NProgress
                type="line"
                :percentage="task.progress || 0"
                :show-indicator="false"
                :height="3"
                :border-radius="1"
              />
            </div>
            
            <!-- 错误信息 -->
            <div v-if="task.error" class="task-error">
              {{ task.error }}
            </div>
          </div>
          
          <!-- 操作按钮 -->
          <div class="task-actions" @click.stop>
            <NDropdown
              trigger="click"
              :options="getTaskActions(task)"
              @select="(key) => handleTaskAction(key, task)"
            >
              <NButton size="tiny" quaternary>⋮</NButton>
            </NDropdown>
          </div>
        </div>
      </div>
    </NScrollbar>
  </div>
</template>

<style scoped>
.background-tasks-panel {
  --card-bg: var(--card-color, #1a1a1a);
  --border-color: var(--border-color, #3b3b3b);
  --text-color: var(--text-color, #fff);
  --text-color-2: var(--text-color-2, #ccc);
  --text-color-3: var(--text-color-3, #999);
  
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.background-tasks-panel.compact {
  gap: 8px;
}

/* 头部 */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-icon {
  font-size: 18px;
}

.header-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
}

/* 筛选器 */
.filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-input {
  max-width: 200px;
}

/* 统计栏 */
.stats-bar {
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  background: var(--fill-color, #2a2a2a);
  border-radius: 6px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
}

.stat-label {
  font-size: 10px;
  color: var(--text-color-3);
}

.stat-item.running .stat-value {
  color: #2080f0;
}

.stat-item.completed .stat-value {
  color: #18a058;
}

.stat-item.failed .stat-value {
  color: #d03050;
}

/* 任务列表容器 */
.task-list-container {
  flex: 1;
}

.empty-state {
  padding: 24px;
}

.empty-icon {
  font-size: 48px;
}

/* 任务列表 */
.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 任务项 */
.task-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.task-item:hover {
  border-color: var(--primary-color, #18a058);
  background: var(--fill-color-hover, #252525);
}

.task-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  font-size: 14px;
  flex-shrink: 0;
}

.task-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-color-3);
}

.task-duration {
  color: var(--text-color-2);
}

.task-progress {
  margin-top: 4px;
}

.task-error {
  font-size: 11px;
  color: #d03050;
  padding: 4px 6px;
  background: rgba(208, 48, 80, 0.1);
  border-radius: 4px;
  margin-top: 4px;
}

.task-actions {
  flex-shrink: 0;
}
</style>
