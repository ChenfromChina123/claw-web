<script setup lang="ts">
/**
 * AgentActivitySidebar - Agent 活动侧边栏
 * 
 * 整合所有 Agent 可视化组件的右侧抽屉：
 * - Agent 工作流树
 * - 团队拓扑图
 * - 后台任务看板
 * - 权限拦截器
 * - 权限模式选择器
 */

import { ref, computed, watch } from 'vue'
import { 
  NDrawer, 
  NDrawerContent, 
  NTabs, 
  NTabPane,
  NButton,
  NTag,
  NBadge,
  NDivider,
  NSpace,
  NSwitch
} from 'naive-ui'
import AgentWorkflowViewer from './AgentWorkflowViewer.vue'
import AgentTeamPanel from './AgentTeamPanel.vue'
import BackgroundTasksPanel from './BackgroundTasksPanel.vue'
import PermissionInterceptor from './PermissionInterceptor.vue'
import PermissionModeSelector from './PermissionModeSelector.vue'
import AgentWorkDir from './AgentWorkDir.vue'
import { useAgentStore } from '@/stores/agent'
import { useChatStore } from '@/stores/chat'

// Props
interface Props {
  show: boolean
  defaultTab?: string
}

const props = withDefaults(defineProps<Props>(), {
  defaultTab: 'workflow'
})

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'step-click', step: any): void
  (e: 'agent-click', agentId: string): void
}>()

const agentStore = useAgentStore()
const chatStore = useChatStore()

// 抽屉关闭
function handleClose() {
  emit('update:show', false)
}

// 当前 Tab
const currentTab = ref(props.defaultTab)

// 监听默认 Tab 变化
watch(() => props.defaultTab, (newTab) => {
  currentTab.value = newTab
})

// 当前 Trace
const currentTrace = computed(() => agentStore.currentTrace)

// Agent 树
const agentTree = computed(() => agentStore.agentTree)

// 等待审批的权限
const pendingPermission = computed(() => {
  const list = agentStore.pendingPermissionList
  return list.length > 0 ? list[0] : null
})

// 待处理权限数量
const pendingPermissionCount = computed(() => agentStore.pendingPermissionList.length)

// 活跃的后台任务数量
const activeTaskCount = computed(() => agentStore.activeBackgroundTasks.length)

// 活跃的 Agent 数量
const activeAgentCount = computed(() => {
  return agentStore.currentAgents.filter(a => 
    a.status === 'RUNNING' || a.status === 'THINKING'
  ).length
})

// 处理工作流步骤点击
function handleStepClick(step: any) {
  emit('step-click', step)
}

// 处理 Agent 点击
function handleAgentClick(agentId: string) {
  emit('agent-click', agentId)
  currentTab.value = 'team'
}

// 处理任务点击
function handleTaskClick(task: any) {
  if (task.traceId) {
    agentStore.setCurrentTrace(task.traceId)
    currentTab.value = 'workflow'
  }
}

// 处理跳转到 Trace
function handleJumpToTrace(traceId: string) {
  agentStore.setCurrentTrace(traceId)
  currentTab.value = 'workflow'
}

// 权限处理完成
function handlePermissionClose() {
  // 权限已由 PermissionInterceptor 组件处理
}

// 是否显示工作流
const hasWorkflow = computed(() => {
  return agentTree.value.length > 0 || currentTrace.value
})
</script>

<template>
  <NDrawer
    :show="show"
    :width="400"
    placement="right"
    class="agent-activity-sidebar"
    @update:show="(val) => emit('update:show', val)"
  >
    <NDrawerContent :native-scrollbar="false" closable>
      <!-- 头部 -->
      <template #header>
        <div class="sidebar-header">
          <div class="header-title">
            <span class="title-icon">🤖</span>
            <span class="title-text">Agent 活动</span>
          </div>
          
          <div class="header-actions">
            <PermissionModeSelector compact show-label />
          </div>
        </div>
      </template>
      
      <!-- 权限拦截提示 -->
      <div v-if="pendingPermission" class="permission-alert">
        <PermissionInterceptor 
          :permission="pendingPermission"
          @approve="handlePermissionClose"
          @deny="handlePermissionClose"
          @close="handlePermissionClose"
        />
      </div>
      
      <!-- 统计概览 -->
      <div class="stats-overview">
        <div class="stat-card">
          <span class="stat-icon">⚡</span>
          <div class="stat-info">
            <span class="stat-value">{{ activeAgentCount }}</span>
            <span class="stat-label">活跃 Agent</span>
          </div>
        </div>
        
        <div class="stat-card">
          <span class="stat-icon">📋</span>
          <div class="stat-info">
            <span class="stat-value">{{ activeTaskCount }}</span>
            <span class="stat-label">后台任务</span>
          </div>
        </div>
        
        <div class="stat-card" :class="{ warning: pendingPermissionCount > 0 }">
          <span class="stat-icon">🔒</span>
          <div class="stat-info">
            <span class="stat-value">{{ pendingPermissionCount }}</span>
            <span class="stat-label">待审批</span>
          </div>
        </div>
      </div>
      
      <NDivider />
      
      <!-- Tab 切换 -->
      <NTabs 
        v-model:value="currentTab" 
        type="line" 
        animated
        class="sidebar-tabs"
      >
        <!-- 工作流 Tab -->
        <NTabPane name="workflow" tab="工作流">
          <template #tab>
            <div class="tab-label">
              <span>🌳</span>
              <span>工作流</span>
              <NBadge 
                v-if="agentTree.length > 0" 
                :value="agentTree.length" 
                :max="9"
              />
            </div>
          </template>
          
          <div class="tab-content">
            <div v-if="!hasWorkflow" class="empty-state">
              <span class="empty-icon">🌳</span>
              <span class="empty-text">暂无工作流数据</span>
              <span class="empty-hint">发送消息后将自动生成工作流</span>
            </div>
            
            <div v-else class="workflow-container">
              <!-- 当前 Trace 标题 -->
              <div v-if="currentTrace" class="trace-header">
                <span class="trace-title">{{ currentTrace.title }}</span>
                <NTag 
                  :type="currentTrace.status === 'RUNNING' ? 'info' : 'default'"
                  size="small"
                >
                  {{ currentTrace.status }}
                </NTag>
              </div>
              
              <!-- Agent 工作流树 -->
              <div class="workflow-tree">
                <AgentWorkflowViewer
                  v-for="node in agentTree"
                  :key="node.agentId"
                  :node="node"
                  :show-details="true"
                  @step-click="handleStepClick"
                  @agent-click="handleAgentClick"
                />
              </div>
            </div>
          </div>
        </NTabPane>
        
        <!-- 团队 Tab -->
        <NTabPane name="team" tab="团队">
          <template #tab>
            <div class="tab-label">
              <span>👥</span>
              <span>团队</span>
            </div>
          </template>
          
          <div class="tab-content">
            <AgentTeamPanel />
          </div>
        </NTabPane>
        
        <!-- 任务 Tab -->
        <NTabPane name="tasks" tab="任务">
          <template #tab>
            <div class="tab-label">
              <span>📋</span>
              <span>任务</span>
              <NBadge 
                v-if="activeTaskCount > 0" 
                :value="activeTaskCount" 
                :max="9"
                type="info"
              />
            </div>
          </template>
          
          <div class="tab-content">
            <BackgroundTasksPanel
              @task-click="handleTaskClick"
              @jump-to-trace="handleJumpToTrace"
            />
          </div>
        </NTabPane>

        <!-- 工作目录 Tab -->
        <NTabPane name="workdir" tab="工作目录">
          <template #tab>
            <div class="tab-label">
              <span>📂</span>
              <span>工作目录</span>
            </div>
          </template>
          
          <div class="tab-content workdir-tab">
            <AgentWorkDir 
              v-if="chatStore.currentSessionId"
              :session-id="chatStore.currentSessionId"
            />
            <div v-else class="empty-state">
              <span class="empty-icon">📂</span>
              <span class="empty-text">暂无活动会话</span>
              <span class="empty-hint">开始对话后可查看工作目录</span>
            </div>
          </div>
        </NTabPane>
        
        <!-- 设置 Tab -->
        <NTabPane name="settings" tab="设置">
          <template #tab>
            <div class="tab-label">
              <span>⚙️</span>
              <span>设置</span>
            </div>
          </template>
          
          <div class="tab-content settings-content">
            <div class="settings-section">
              <div class="section-title">权限模式</div>
              <div class="section-description">
                选择 Agent 执行操作时的权限级别
              </div>
              <PermissionModeSelector :show-label="false" />
            </div>
            
            <NDivider />
            
            <div class="settings-section">
              <div class="section-title">通知设置</div>
              
              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">任务完成通知</span>
                  <span class="setting-desc">后台任务完成时显示通知</span>
                </div>
                <NSwitch size="small" />
              </div>
              
              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">权限请求声音</span>
                  <span class="setting-desc">权限请求时播放提示音</span>
                </div>
                <NSwitch size="small" />
              </div>
            </div>
            
            <NDivider />
            
            <div class="settings-section">
              <div class="section-title">显示设置</div>
              
              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">显示工具输入详情</span>
                  <span class="setting-desc">在工具调用中显示完整参数</span>
                </div>
                <NSwitch size="small" :default-value="true" />
              </div>
              
              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">显示执行耗时</span>
                  <span class="setting-desc">显示每个步骤的执行时间</span>
                </div>
                <NSwitch size="small" :default-value="true" />
              </div>
            </div>
          </div>
        </NTabPane>
      </NTabs>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.agent-activity-sidebar {
  --sidebar-bg: var(--card-color, #1a1a1a);
  --border-color: var(--border-color, #3b3b3b);
  --text-color: var(--text-color, #fff);
  --text-color-2: var(--text-color-2, #ccc);
  --text-color-3: var(--text-color-3, #999);
}

/* 头部 */
.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 20px;
}

.title-text {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-color);
}

/* 权限提示 */
.permission-alert {
  margin-bottom: 16px;
}

/* 统计概览 */
.stats-overview {
  display: flex;
  gap: 12px;
  padding: 0 4px;
}

.stat-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  background: var(--fill-color, #2a2a2a);
  border-radius: 8px;
}

.stat-card.warning {
  background: rgba(240, 160, 32, 0.1);
  border: 1px solid rgba(240, 160, 32, 0.3);
}

.stat-icon {
  font-size: 18px;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  line-height: 1;
}

.stat-label {
  font-size: 10px;
  color: var(--text-color-3);
}

/* Tab 样式 */
.sidebar-tabs {
  margin-top: 8px;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-label span:first-child {
  font-size: 14px;
}

/* Tab 内容 */
.tab-content {
  padding: 12px 4px;
  min-height: 200px;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  color: var(--text-color-2);
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  color: var(--text-color-3);
}

/* 工作流容器 */
.workflow-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.trace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--fill-color, #2a2a2a);
  border-radius: 6px;
}

.trace-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-tree {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 设置内容 */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.section-description {
  font-size: 12px;
  color: var(--text-color-3);
  margin-top: -8px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-label {
  font-size: 13px;
  color: var(--text-color);
}

.setting-desc {
  font-size: 11px;
  color: var(--text-color-3);
}

/* 工作目录标签页特殊样式 */
.workdir-tab {
  padding: 0 !important;
  min-height: 500px;
  height: calc(100vh - 300px);
}
</style>
