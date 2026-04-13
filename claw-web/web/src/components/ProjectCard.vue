<template>
  <div class="project-card" :class="{ 'is-running': project.status === 'running' }">
    <div class="project-header">
      <div class="project-icon">
        <span v-if="project.type === 'nodejs'">📦</span>
        <span v-else-if="project.type === 'python'">🐍</span>
        <span v-else-if="project.type === 'static'">🌐</span>
        <span v-else>⚙️</span>
      </div>
      <div class="project-info">
        <h3 class="project-name">{{ project.name }}</h3>
        <div class="project-meta">
          <span class="project-type">{{ project.type }}</span>
          <span class="project-status" :class="`status-${project.status}`">
            <span class="status-dot"></span>
            {{ statusText }}
          </span>
        </div>
      </div>
    </div>

    <div class="project-details">
      <div class="detail-item">
        <span class="detail-label">端口:</span>
        <span class="detail-value">{{ project.workerPort }}</span>
      </div>
      <div class="detail-item" v-if="project.domain">
        <span class="detail-label">域名:</span>
        <a :href="`http://${project.domain}`" target="_blank" class="detail-value domain-link">
          {{ project.domain }}
        </a>
      </div>
      <div class="detail-item">
        <span class="detail-label">进程管理:</span>
        <span class="detail-value">{{ project.processManager }}</span>
      </div>
    </div>

    <div class="project-stats" v-if="status">
      <div class="stat-item">
        <span class="stat-label">CPU</span>
        <span class="stat-value">{{ status.cpu?.toFixed(1) || 0 }}%</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">内存</span>
        <span class="stat-value">{{ formatMemory(status.memory) }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">运行时间</span>
        <span class="stat-value">{{ formatUptime(status.uptime) }}</span>
      </div>
    </div>

    <div class="project-actions">
      <button
        v-if="project.status === 'stopped'"
        @click="handleStart"
        class="action-btn start"
        :disabled="loading"
      >
        <span class="btn-icon">▶</span>
        启动
      </button>
      <button
        v-if="project.status === 'running'"
        @click="handleStop"
        class="action-btn stop"
        :disabled="loading"
      >
        <span class="btn-icon">⏹</span>
        停止
      </button>
      <button
        v-if="project.status === 'running'"
        @click="handleRestart"
        class="action-btn restart"
        :disabled="loading"
      >
        <span class="btn-icon">🔄</span>
        重启
      </button>
      <button @click="handleViewLogs" class="action-btn logs">
        <span class="btn-icon">📋</span>
        日志
      </button>
      <button @click="handleConfigure" class="action-btn config">
        <span class="btn-icon">⚙️</span>
        配置
      </button>
      <button @click="handleDelete" class="action-btn delete" :disabled="loading">
        <span class="btn-icon">🗑</span>
        删除
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ProjectDeployment, ProjectStatus } from '@/api/deploymentApi'

interface Props {
  project: ProjectDeployment
  status?: ProjectStatus
}

const props = defineProps<Props>()
const emit = defineEmits<{
  start: [projectId: string]
  stop: [projectId: string]
  restart: [projectId: string]
  delete: [projectId: string]
  viewLogs: [projectId: string]
  configure: [projectId: string]
}>()

const loading = ref(false)

const statusText = computed(() => {
  const statusMap = {
    running: '运行中',
    stopped: '已停止',
    error: '错误',
    building: '构建中'
  }
  return statusMap[props.project.status] || '未知'
})

function formatMemory(bytes?: number): string {
  if (!bytes) return '0 MB'
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

function formatUptime(ms?: number): string {
  if (!ms) return '0秒'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}天`
  if (hours > 0) return `${hours}小时`
  if (minutes > 0) return `${minutes}分钟`
  return `${seconds}秒`
}

async function handleStart() {
  loading.value = true
  emit('start', props.project.projectId)
  setTimeout(() => (loading.value = false), 1000)
}

async function handleStop() {
  loading.value = true
  emit('stop', props.project.projectId)
  setTimeout(() => (loading.value = false), 1000)
}

async function handleRestart() {
  loading.value = true
  emit('restart', props.project.projectId)
  setTimeout(() => (loading.value = false), 1000)
}

function handleViewLogs() {
  emit('viewLogs', props.project.projectId)
}

function handleConfigure() {
  emit('configure', props.project.projectId)
}

async function handleDelete() {
  if (confirm(`确定要删除项目 "${props.project.name}" 吗？`)) {
    loading.value = true
    emit('delete', props.project.projectId)
    setTimeout(() => (loading.value = false), 1000)
  }
}
</script>

<style scoped>
.project-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 20px;
  transition: all 0.3s ease;
}

.project-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.project-card.is-running {
  border-left: 4px solid var(--success-color);
}

.project-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.project-icon {
  font-size: 32px;
}

.project-info {
  flex: 1;
}

.project-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.project-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.project-type {
  font-size: 12px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 4px;
}

.project-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

.status-running .status-dot {
  background: var(--success-color);
}

.status-stopped .status-dot {
  background: var(--text-tertiary);
}

.status-error .status-dot {
  background: var(--error-color);
}

.status-building .status-dot {
  background: var(--warning-color);
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.project-details {
  margin-bottom: 16px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-light);
}

.detail-label {
  color: var(--text-secondary);
  font-size: 13px;
}

.detail-value {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
}

.domain-link {
  color: var(--primary-color);
  text-decoration: none;
}

.domain-link:hover {
  text-decoration: underline;
}

.project-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.stat-item {
  text-align: center;
}

.stat-label {
  display: block;
  font-size: 11px;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.stat-value {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.project-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
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
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.action-btn:hover:not(:disabled) {
  opacity: 0.8;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.start {
  background: var(--success-color);
  color: white;
}

.action-btn.stop {
  background: var(--error-color);
  color: white;
}

.action-btn.restart {
  background: var(--warning-color);
  color: white;
}

.action-btn.delete {
  background: var(--error-color);
  color: white;
}

.btn-icon {
  font-size: 14px;
}
</style>
