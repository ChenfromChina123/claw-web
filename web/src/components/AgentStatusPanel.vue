<script setup lang="ts">
/**
 * Agent 状态墙组件
 * 
 * 侧边栏显示，展示所有参与协调的 Agent 状态
 */
import { computed } from 'vue'
import type { AgentRuntimeState, MultiAgentOrchestrationState } from '@/types/agent'
import { BUILT_IN_AGENTS } from '@/types/agent'
import AgentBadge from './AgentBadge.vue'

interface Props {
  /** 多 Agent 协调状态 */
  orchestrationState: MultiAgentOrchestrationState
}

const props = defineProps<Props>()

/**
 * 所有显示的 Agent
 */
const allAgents = computed(() => {
  const agents: AgentRuntimeState[] = []
  if (props.orchestrationState.orchestrator) {
    agents.push(props.orchestrationState.orchestrator)
  }
  agents.push(...props.orchestrationState.subAgents)
  return agents
})

/**
 * 工作中的 Agent 数量
 */
const workingAgentCount = computed(() => 
  allAgents.value.filter(agent => 
    agent.status === 'working' || agent.status === 'thinking'
  ).length
)

/**
 * 完成的 Agent 数量
 */
const completedAgentCount = computed(() => 
  allAgents.value.filter(agent => agent.status === 'completed').length
)
</script>

<template>
  <div class="agent-status-panel">
    <!-- 面板头部 -->
    <div class="panel-header">
      <div class="header-left">
        <span class="panel-icon">🤝</span>
        <span class="panel-title">Agent 协调</span>
      </div>
      <div class="header-stats">
        <span class="stat-item" :class="{ active: workingAgentCount > 0 }">
          🔄 {{ workingAgentCount }}
        </span>
        <span class="stat-item" :class="{ active: completedAgentCount > 0 }">
          ✅ {{ completedAgentCount }}
        </span>
      </div>
    </div>

    <!-- 整体状态 -->
    <div class="overall-status" :class="orchestrationState.overallStatus">
      <span class="status-indicator"></span>
      <span class="status-text">
        {{ 
          orchestrationState.overallStatus === 'idle' ? '系统待命' :
          orchestrationState.overallStatus === 'planning' ? '正在规划...' :
          orchestrationState.overallStatus === 'executing' ? '正在执行...' :
          orchestrationState.overallStatus === 'completed' ? '已完成' :
          '出错'
        }}
      </span>
    </div>

    <!-- Agent 列表 -->
    <div class="agents-list">
      <div v-if="allAgents.length === 0" class="empty-state">
        <span class="empty-icon">🤖</span>
        <span class="empty-text">暂无活跃 Agent</span>
      </div>

      <div v-else>
        <!-- 协调者 Agent -->
        <div v-if="orchestrationState.orchestrator" class="agent-card orchestrator">
          <div class="agent-header">
            <AgentBadge 
              :agent-type="orchestrationState.orchestrator.agentDefinition.agentType"
              :show-status="true"
              :status="orchestrationState.orchestrator.status"
              size="small"
            />
            <span class="agent-role">协调者</span>
          </div>

          <div class="agent-progress">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                :style="{ width: `${orchestrationState.orchestrator.progress}%` }"
              ></div>
            </div>
            <span class="progress-text">{{ orchestrationState.orchestrator.progress }}%</span>
          </div>

          <div v-if="orchestrationState.orchestrator.currentTask" class="current-task">
            <span class="task-label">当前任务:</span>
            <span class="task-text">{{ orchestrationState.orchestrator.currentTask }}</span>
          </div>

          <div class="task-stats">
            <span>
              {{ orchestrationState.orchestrator.completedTasks }} / {{ orchestrationState.orchestrator.totalTasks }} 任务
            </span>
          </div>
        </div>

        <!-- 子 Agent -->
        <div v-for="agent in orchestrationState.subAgents" :key="agent.agentId" class="agent-card">
          <div class="agent-header">
            <AgentBadge 
              :agent-type="agent.agentDefinition.agentType"
              :show-status="true"
              :status="agent.status"
              size="small"
            />
          </div>

          <div class="agent-progress">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                :style="{ width: `${agent.progress}%` }"
              ></div>
            </div>
            <span class="progress-text">{{ agent.progress }}%</span>
          </div>

          <div v-if="agent.currentTask" class="current-task">
            <span class="task-label">当前:</span>
            <span class="task-text">{{ agent.currentTask }}</span>
          </div>

          <div class="task-stats">
            <span>
              {{ agent.completedTasks }} / {{ agent.totalTasks }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 任务步骤预览 -->
    <div v-if="orchestrationState.taskSteps.length > 0" class="steps-preview">
      <div class="preview-header">
        <span class="preview-title">任务步骤</span>
        <span class="preview-count">{{ orchestrationState.taskSteps.length }}</span>
      </div>
      <div class="steps-list">
        <div 
          v-for="(step, index) in orchestrationState.taskSteps.slice(0, 5)" 
          :key="step.id"
          class="step-item"
          :class="step.status"
        >
          <span class="step-number">{{ index + 1 }}</span>
          <span class="step-desc">{{ step.description }}</span>
          <span class="step-status-icon">
            {{
              step.status === 'pending' ? '⏳' :
              step.status === 'active' ? '🔄' :
              step.status === 'completed' ? '✅' : '❌'
            }}
          </span>
        </div>
      </div>
      <div v-if="orchestrationState.taskSteps.length > 5" class="more-steps">
        +{{ orchestrationState.taskSteps.length - 5 }} 更多步骤
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-status-panel {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
}

/* 面板头部 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-icon {
  font-size: 18px;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.header-stats {
  display: flex;
  gap: 8px;
}

.stat-item {
  font-size: 12px;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 9999px;
  color: var(--text-secondary);
  transition: all var(--transition-fast, 150ms) ease;
}

.stat-item.active {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

/* 整体状态 */
.overall-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(0, 0, 0, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.overall-status .status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6b7280;
  position: relative;
}

.overall-status.planning .status-indicator {
  background: #f59e0b;
}

.overall-status.executing .status-indicator {
  background: #3b82f6;
  animation: pulse 1.5s ease-in-out infinite;
}

.overall-status.completed .status-indicator {
  background: #10b981;
}

.overall-status.error .status-indicator {
  background: #ef4444;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.2);
    opacity: 0.5;
  }
}

.overall-status .status-text {
  font-size: 12px;
  color: var(--text-secondary);
}

/* Agent 列表 */
.agents-list {
  padding: 12px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  gap: 8px;
}

.empty-icon {
  font-size: 32px;
  opacity: 0.5;
}

.empty-text {
  font-size: 12px;
  color: var(--text-disabled);
}

/* Agent 卡片 */
.agent-card {
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all var(--transition-fast, 150ms) ease;
}

.agent-card.orchestrator {
  border-color: rgba(168, 85, 247, 0.3);
  background: rgba(168, 85, 247, 0.05);
}

.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.agent-role {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Agent 进度 */
.agent-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.agent-progress .progress-bar {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
}

.agent-progress .progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #10b981);
  border-radius: 2px;
  transition: width var(--transition-normal, 250ms) ease;
}

.agent-progress .progress-text {
  font-size: 11px;
  color: var(--text-secondary);
  min-width: 32px;
  text-align: right;
}

/* 当前任务 */
.current-task {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
}

.task-label {
  color: var(--text-disabled);
  flex-shrink: 0;
}

.task-text {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 任务统计 */
.task-stats {
  font-size: 11px;
  color: var(--text-disabled);
}

/* 任务步骤预览 */
.steps-preview {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 12px;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.preview-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.preview-count {
  font-size: 11px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 9999px;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  font-size: 11px;
  opacity: 0.6;
}

.step-item.active {
  opacity: 1;
  background: rgba(59, 130, 246, 0.08);
}

.step-item.completed {
  opacity: 0.8;
}

.step-item.error {
  opacity: 1;
  background: rgba(239, 68, 68, 0.08);
}

.step-number {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.step-desc {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}

.step-status-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.more-steps {
  text-align: center;
  padding: 8px;
  font-size: 11px;
  color: var(--text-disabled);
}
</style>
