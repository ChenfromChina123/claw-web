<template>
  <div class="deployment-page">
    <div class="page-header">
      <div class="header-content">
        <h1 class="page-title">项目部署管理</h1>
        <p class="page-subtitle">管理和部署您的项目，实现容器化运行和外部访问</p>
      </div>
      <button @click="showWizard = true" class="create-btn">
        <span class="btn-icon">+</span>
        新建项目
      </button>
    </div>

    <div class="stats-bar">
      <div class="stat-card">
        <div class="stat-icon">📦</div>
        <div class="stat-info">
          <span class="stat-value">{{ deploymentStore.projects.length }}</span>
          <span class="stat-label">总项目</span>
        </div>
      </div>
      <div class="stat-card success">
        <div class="stat-icon">✓</div>
        <div class="stat-info">
          <span class="stat-value">{{ deploymentStore.runningProjectsCount }}</span>
          <span class="stat-label">运行中</span>
        </div>
      </div>
      <div class="stat-card warning">
        <div class="stat-icon">⏸</div>
        <div class="stat-info">
          <span class="stat-value">{{ deploymentStore.stoppedProjectsCount }}</span>
          <span class="stat-label">已停止</span>
        </div>
      </div>
      <div class="stat-card error">
        <div class="stat-icon">⚠</div>
        <div class="stat-info">
          <span class="stat-value">{{ deploymentStore.errorProjectsCount }}</span>
          <span class="stat-label">错误</span>
        </div>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-tabs">
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          @click="currentStatus = tab.value"
          :class="['filter-tab', { active: currentStatus === tab.value }]"
        >
          {{ tab.label }}
        </button>
      </div>
      <div class="search-box">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索项目..."
          class="search-input"
        />
      </div>
    </div>

    <div class="projects-container" v-if="!deploymentStore.loading">
      <div v-if="filteredProjects.length === 0" class="empty-state">
        <div class="empty-icon">📦</div>
        <h3 class="empty-title">暂无项目</h3>
        <p class="empty-description">
          {{ searchQuery ? '没有找到匹配的项目' : '点击"新建项目"按钮创建您的第一个项目' }}
        </p>
        <button v-if="!searchQuery" @click="showWizard = true" class="empty-btn">
          创建第一个项目
        </button>
      </div>

      <div v-else class="projects-grid">
        <ProjectCard
          v-for="project in filteredProjects"
          :key="project.projectId"
          :project="project"
          :status="deploymentStore.projectStatuses.get(project.projectId)"
          @start="handleStartProject"
          @stop="handleStopProject"
          @restart="handleRestartProject"
          @delete="handleDeleteProject"
          @viewLogs="handleViewLogs"
          @configure="handleConfigure"
        />
      </div>
    </div>

    <div v-else class="loading-state">
      <div class="spinner"></div>
      <span>加载中...</span>
    </div>

    <DeploymentWizard
      v-if="showWizard"
      @close="showWizard = false"
      @created="handleProjectCreated"
    />

    <div v-if="showLogViewer" class="log-viewer-modal">
      <div class="modal-overlay" @click="showLogViewer = false"></div>
      <div class="modal-content">
        <LogViewer
          :project-name="currentProject?.name || ''"
          :stdout="currentLogs?.stdout || ''"
          :stderr="currentLogs?.stderr || ''"
          :loading="logsLoading"
          @refresh="handleRefreshLogs"
          @clear="handleClearLogs"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useDeploymentStore } from '@/stores/deployment'
import ProjectCard from '@/components/ProjectCard.vue'
import LogViewer from '@/components/LogViewer.vue'
import DeploymentWizard from '@/components/DeploymentWizard.vue'

const deploymentStore = useDeploymentStore()

const showWizard = ref(false)
const showLogViewer = ref(false)
const currentProjectId = ref<string | null>(null)
const currentStatus = ref<string>('all')
const searchQuery = ref('')
const logsLoading = ref(false)

const statusTabs = [
  { label: '全部', value: 'all' },
  { label: '运行中', value: 'running' },
  { label: '已停止', value: 'stopped' },
  { label: '错误', value: 'error' }
]

const filteredProjects = computed(() => {
  let projects = deploymentStore.projects

  if (currentStatus.value !== 'all') {
    projects = projects.filter(p => p.status === currentStatus.value)
  }

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    projects = projects.filter(p =>
      p.name.toLowerCase().includes(query) ||
      p.type.toLowerCase().includes(query)
    )
  }

  return projects
})

const currentProject = computed(() => {
  return deploymentStore.projects.find(p => p.projectId === currentProjectId.value)
})

const currentLogs = computed(() => {
  if (!currentProjectId.value) return null
  return deploymentStore.projectLogs.get(currentProjectId.value)
})

onMounted(() => {
  deploymentStore.loadProjects()
})

async function handleStartProject(projectId: string) {
  await deploymentStore.startProject(projectId)
}

async function handleStopProject(projectId: string) {
  await deploymentStore.stopProject(projectId)
}

async function handleRestartProject(projectId: string) {
  await deploymentStore.restartProject(projectId)
}

async function handleDeleteProject(projectId: string) {
  await deploymentStore.deleteProject(projectId)
}

async function handleViewLogs(projectId: string) {
  currentProjectId.value = projectId
  showLogViewer.value = true
  logsLoading.value = true
  await deploymentStore.fetchProjectLogs(projectId)
  logsLoading.value = false
}

function handleConfigure(projectId: string) {
  console.log('Configure project:', projectId)
}

function handleProjectCreated() {
  showWizard.value = false
  deploymentStore.loadProjects()
}

async function handleRefreshLogs() {
  if (!currentProjectId.value) return
  logsLoading.value = true
  await deploymentStore.fetchProjectLogs(currentProjectId.value)
  logsLoading.value = false
}

function handleClearLogs() {
  console.log('Clear logs')
}
</script>

<style scoped>
.deployment-page {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
}

.page-subtitle {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.create-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.create-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

.btn-icon {
  font-size: 18px;
}

.stats-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.stat-card.success {
  border-left: 4px solid var(--success-color);
}

.stat-card.warning {
  border-left: 4px solid var(--warning-color);
}

.stat-card.error {
  border-left: 4px solid var(--error-color);
}

.stat-icon {
  font-size: 32px;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.filter-tabs {
  display: flex;
  gap: 8px;
}

.filter-tab {
  padding: 8px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-tab.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.search-box {
  width: 300px;
}

.search-input {
  width: 100%;
  padding: 10px 16px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 13px;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.projects-container {
  min-height: 400px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.empty-description {
  margin: 8px 0 24px;
  font-size: 14px;
  color: var(--text-secondary);
}

.empty-btn {
  padding: 12px 24px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  gap: 16px;
}

.spinner {
  width: 40px;
  height: 40px;
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

.log-viewer-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
}

.modal-content {
  position: relative;
  width: 90%;
  max-width: 1200px;
  height: 80vh;
  background: var(--bg-primary);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
</style>
