<script setup lang="ts">
/**
 * 任务流水线组件
 * 
 * 展示多 Agent 协调的任务执行过程
 */
import { ref, computed } from 'vue'
import type { AgentTaskStep, AgentType } from '@/types/agent'
import { getAgentDefinition, AGENT_ICONS } from '@/types/agent'
import AgentBadge from './AgentBadge.vue'

interface Props {
  /** 任务步骤列表 */
  steps: AgentTaskStep[]
  /** 是否折叠显示 */
  collapsed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  collapsed: false
})

/**
 * 本地折叠状态
 */
const isCollapsed = ref(props.collapsed)

/**
 * 切换折叠状态
 */
function toggleCollapse(): void {
  isCollapsed.value = !isCollapsed.value
}

/**
 * 步骤状态图标
 */
const stepStatusIcons: Record<string, string> = {
  pending: '⏳',
  active: '🔄',
  completed: '✅',
  error: '❌'
}

/**
 * 步骤状态颜色
 */
const stepStatusColors: Record<string, string> = {
  pending: '#6b7280',
  active: '#3b82f6',
  completed: '#10b981',
  error: '#ef4444'
}

/**
 * 完成的步骤数
 */
const completedSteps = computed(() => 
  props.steps.filter(step => step.status === 'completed').length
)

/**
 * 总步骤数
 */
const totalSteps = computed(() => props.steps.length)

/**
 * 进度百分比
 */
const progressPercent = computed(() => 
  totalSteps.value > 0 ? Math.round((completedSteps.value / totalSteps.value) * 100) : 0
)
</script>

<template>
  <div class="task-pipeline">
    <!-- 流水线头部 -->
    <div class="pipeline-header" @click="toggleCollapse">
      <div class="header-left">
        <span class="pipeline-icon">🔀</span>
        <span class="pipeline-title">任务流水线</span>
        <span class="pipeline-count">{{ completedSteps }} / {{ totalSteps }}</span>
      </div>
      <div class="header-right">
        <!-- 进度条 -->
        <div class="progress-bar">
          <div 
            class="progress-fill" 
            :style="{ width: `${progressPercent}%` }"
          ></div>
        </div>
        <span class="progress-text">{{ progressPercent }}%</span>
        <span class="collapse-icon">{{ isCollapsed ? '▼' : '▲' }}</span>
      </div>
    </div>

    <!-- 流水线内容 -->
    <Transition name="pipeline-expand">
      <div v-if="!isCollapsed" class="pipeline-content">
        <div v-for="(step, index) in steps" :key="step.id" class="pipeline-step">
          <!-- 连接线 -->
          <div v-if="index < steps.length - 1" class="step-connector">
            <div class="connector-line" :class="{ active: step.status === 'completed' }"></div>
          </div>

          <!-- 步骤内容 -->
          <div class="step-content" :class="step.status">
            <!-- 状态图标 -->
            <div class="step-status-icon" :style="{ color: stepStatusColors[step.status] }">
              <span v-if="step.status === 'active'" class="spinner"></span>
              <span v-else>{{ stepStatusIcons[step.status] }}</span>
            </div>

            <!-- 步骤信息 -->
            <div class="step-info">
              <!-- Agent 标签 -->
              <AgentBadge 
                :agent-type="step.agentType" 
                size="small"
                class="step-agent"
              />
              
              <!-- 步骤描述 -->
              <p class="step-description">{{ step.description }}</p>

              <!-- 时间信息 -->
              <div class="step-times">
                <span v-if="step.startTime" class="start-time">
                  开始: {{ step.startTime.toLocaleTimeString() }}
                </span>
                <span v-if="step.completedTime" class="completed-time">
                  完成: {{ step.completedTime.toLocaleTimeString() }}
                </span>
              </div>

              <!-- 错误信息 -->
              <div v-if="step.error" class="step-error">
                ⚠️ {{ step.error }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.task-pipeline {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  margin: 16px 0;
  overflow: hidden;
}

/* 流水线头部 */
.pipeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: background var(--transition-fast, 150ms) ease;
}

.pipeline-header:hover {
  background: rgba(0, 0, 0, 0.3);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pipeline-icon {
  font-size: 18px;
}

.pipeline-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.pipeline-count {
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 8px;
  border-radius: 9999px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-bar {
  width: 100px;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #10b981);
  border-radius: 3px;
  transition: width var(--transition-normal, 250ms) ease;
}

.progress-text {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 32px;
  text-align: right;
}

.collapse-icon {
  font-size: 12px;
  color: var(--text-secondary);
  transition: transform var(--transition-fast, 150ms) ease;
}

/* 流水线内容 */
.pipeline-content {
  padding: 16px;
}

.pipeline-step {
  display: flex;
  gap: 12px;
  position: relative;
}

/* 连接线 */
.step-connector {
  position: absolute;
  left: 15px;
  top: 32px;
  bottom: -16px;
  width: 2px;
}

.connector-line {
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.1);
  transition: background var(--transition-normal, 250ms) ease;
}

.connector-line.active {
  background: linear-gradient(to bottom, #10b981, rgba(255, 255, 255, 0.1));
}

/* 步骤内容 */
.step-content {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  margin-bottom: 8px;
  transition: all var(--transition-fast, 150ms) ease;
}

.step-content.pending {
  opacity: 0.5;
}

.step-content.active {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.05);
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.1);
}

.step-content.completed {
  border-color: rgba(16, 185, 129, 0.3);
}

.step-content.error {
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.05);
}

/* 状态图标 */
.step-status-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(59, 130, 246, 0.2);
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 步骤信息 */
.step-info {
  flex: 1;
  min-width: 0;
}

.step-agent {
  margin-bottom: 6px;
}

.step-description {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
}

.step-times {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-disabled);
}

.step-error {
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 6px;
  font-size: 12px;
  color: #fca5a5;
}

/* 动画 */
.pipeline-expand-enter-active,
.pipeline-expand-leave-active {
  transition: all var(--transition-normal, 250ms) ease;
  overflow: hidden;
}

.pipeline-expand-enter-from,
.pipeline-expand-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-8px);
}
</style>
