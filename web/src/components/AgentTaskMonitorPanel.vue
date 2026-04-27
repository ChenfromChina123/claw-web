<script setup lang="ts">
/**
 * AgentTaskMonitorPanel - Agent任务监控面板
 * 
 * 全局持久化悬浮组件，显示Agent任务的创建、进度和完成状态。
 * 最小化时显示为右下角悬浮徽章，展开时显示任务列表。
 * 
 * 功能：
 * - 实时显示Agent后台任务状态
 * - 支持最小化/展开切换
 * - 任务取消和清除已完成任务
 * - 自动刷新任务列表
 * - 与Agent Store深度集成
 */

import { computed } from 'vue'
import {
  NCard,
  NTag,
  NButton,
  NProgress,
  NEmpty,
  NScrollbar,
  NIcon,
  NBadge
} from 'naive-ui'
import { useAgentTaskMonitor } from '@/composables/useAgentTaskMonitor'
import type { BackgroundTask } from '@/types/agentWorkflow'

const emit = defineEmits<{
  (e: 'task-click', task: BackgroundTask): void
  (e: 'task-cancel', taskId: string): void
}>()

const {
  tasks,
  activeCount,
  completedCount,
  failedCount,
  hasActiveTasks,
  hasFailedTasks,
  isExpanded,
  isMinimized,
  panelMode,
  openFromBadge,
  minimizePanel,
  cancelTask,
  clearCompletedTasks,
  formatTime,
  formatDuration,
  getStatusConfig
} = useAgentTaskMonitor()

/** 是否显示最小化徽章 */
const showBadge = computed(() => panelMode.value === 'minimized')

/** 是否显示展开面板 */
const showExpanded = computed(() => panelMode.value === 'expanded')

/** 是否有已完成/失败任务可清除 */
const hasCompletedTasks = computed(() => completedCount.value > 0 || failedCount.value > 0)

/** 徽章脉冲动画类名 */
const badgePulseClass = computed(() => hasActiveTasks.value ? 'badge-pulse' : '')

/** 处理任务点击 */
function handleTaskClick(task: BackgroundTask) {
  emit('task-click', task)
}

/** 处理取消任务 */
async function handleCancelTask(taskId: string) {
  await cancelTask(taskId)
  emit('task-cancel', taskId)
}
</script>

<template>
  <div class="agent-task-monitor">
    <!-- 最小化悬浮徽章 -->
    <Transition name="badge-fade">
      <div
        v-if="showBadge"
        class="monitor-badge"
        :class="[badgePulseClass, { 'has-error': hasFailedTasks }]"
        @click="openFromBadge"
      >
        <div class="badge-icon">
          <span class="badge-emoji">🤖</span>
          <NBadge
            v-if="activeCount > 0"
            :value="activeCount"
            :max="9"
            type="info"
            class="badge-count"
          />
        </div>
      </div>
    </Transition>

    <!-- 展开面板 -->
    <Transition name="panel-slide">
      <div v-if="showExpanded" class="monitor-panel">
        <NCard
          size="small"
          :bordered="true"
          class="panel-card"
        >
          <!-- 面板头部 -->
          <template #header>
            <div class="panel-header">
              <div class="header-left">
                <span class="header-icon">🤖</span>
                <span class="header-title">Agent 任务</span>
                <NTag
                  v-if="activeCount > 0"
                  size="small"
                  type="info"
                  :bordered="false"
                >
                  {{ activeCount }} 运行中
                </NTag>
              </div>
              <div class="header-right">
                <NButton
                  v-if="hasCompletedTasks"
                  size="tiny"
                  quaternary
                  @click="clearCompletedTasks"
                >
                  清除已完成
                </NButton>
                <NButton
                  size="tiny"
                  quaternary
                  @click="minimizePanel"
                >
                  ✕
                </NButton>
              </div>
            </div>
          </template>

          <!-- 统计栏 -->
          <div class="stats-bar">
            <div class="stat-chip running">
              <span class="stat-value">{{ activeCount }}</span>
              <span class="stat-label">运行中</span>
            </div>
            <div class="stat-chip completed">
              <span class="stat-value">{{ completedCount }}</span>
              <span class="stat-label">已完成</span>
            </div>
            <div class="stat-chip failed">
              <span class="stat-value">{{ failedCount }}</span>
              <span class="stat-label">失败</span>
            </div>
          </div>

          <!-- 任务列表 -->
          <NScrollbar class="task-list-scroll" :style="{ maxHeight: '300px' }">
            <NEmpty
              v-if="tasks.length === 0"
              description="暂无Agent任务"
              class="empty-state"
            >
              <template #icon>
                <span class="empty-icon">🤖</span>
              </template>
            </NEmpty>

            <div v-else class="task-list">
              <div
                v-for="task in tasks"
                :key="task.taskId"
                class="task-item"
                :class="`task-${task.status.toLowerCase()}`"
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
                  <span v-if="task.status === 'RUNNING'" class="icon-spinner">⚡</span>
                  <span v-else>{{ getStatusConfig(task.status).icon }}</span>
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
                  <NProgress
                    v-if="task.status === 'RUNNING' || task.status === 'PENDING'"
                    type="line"
                    :percentage="task.progress || 0"
                    :show-indicator="false"
                    :height="3"
                    :border-radius="1"
                    class="task-progress"
                  />

                  <!-- 错误信息 -->
                  <div v-if="task.error" class="task-error">
                    {{ task.error }}
                  </div>
                </div>

                <!-- 操作按钮 -->
                <div class="task-actions" @click.stop>
                  <NButton
                    v-if="task.status === 'RUNNING' || task.status === 'PENDING'"
                    size="tiny"
                    quaternary
                    type="error"
                    @click="handleCancelTask(task.taskId)"
                  >
                    取消
                  </NButton>
                </div>
              </div>
            </div>
          </NScrollbar>
        </NCard>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.agent-task-monitor {
  --card-bg: var(--card-color, #1a1a1a);
  --border-color: var(--border-color, #3b3b3b);
  --text-color: var(--text-color, #fff);
  --text-color-2: var(--text-color-2, #ccc);
  --text-color-3: var(--text-color-3, #999);
  --primary-color: var(--primary-color, #6366f1);
  --fill-color: var(--fill-color, #2a2a2a);

  position: fixed;
  z-index: 1000;
  bottom: 20px;
  right: 20px;
  pointer-events: none;
}

.agent-task-monitor > * {
  pointer-events: auto;
}

/* ==================== 最小化徽章 ==================== */
.monitor-badge {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--primary-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s, box-shadow 0.2s;
}

.monitor-badge:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
}

.monitor-badge.has-error {
  background: #d03050;
}

.badge-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.badge-emoji {
  font-size: 22px;
}

.badge-count {
  position: absolute;
  top: -8px;
  right: -12px;
}

.badge-pulse {
  animation: badge-pulse-anim 2s ease-in-out infinite;
}

@keyframes badge-pulse-anim {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}

/* ==================== 展开面板 ==================== */
.monitor-panel {
  width: 360px;
  max-width: calc(100vw - 40px);
}

.panel-card {
  background: var(--card-bg) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3) !important;
}

/* 面板头部 */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.header-left {
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

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 统计栏 */
.stats-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.stat-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--fill-color);
}

.stat-chip.running {
  background: rgba(32, 128, 240, 0.1);
}

.stat-chip.running .stat-value {
  color: #2080f0;
}

.stat-chip.completed {
  background: rgba(24, 160, 88, 0.1);
}

.stat-chip.completed .stat-value {
  color: #18a058;
}

.stat-chip.failed {
  background: rgba(208, 48, 80, 0.1);
}

.stat-chip.failed .stat-value {
  color: #d03050;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.stat-label {
  font-size: 10px;
  color: var(--text-color-3);
}

/* 任务列表 */
.task-list-scroll {
  margin: 0 -4px;
}

.empty-state {
  padding: 20px;
}

.empty-icon {
  font-size: 36px;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 任务项 */
.task-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.task-item:hover {
  border-color: var(--primary-color);
  background: var(--fill-color);
}

.task-item.task-running {
  border-color: rgba(32, 128, 240, 0.2);
  background: rgba(32, 128, 240, 0.03);
}

.task-item.task-failed {
  border-color: rgba(208, 48, 80, 0.2);
  background: rgba(208, 48, 80, 0.03);
}

/* 任务图标 */
.task-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  font-size: 14px;
  flex-shrink: 0;
}

.icon-spinner {
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 任务信息 */
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

/* 任务操作 */
.task-actions {
  flex-shrink: 0;
}

/* ==================== 动画 ==================== */
.badge-fade-enter-active,
.badge-fade-leave-active {
  transition: all 0.3s ease;
}

.badge-fade-enter-from,
.badge-fade-leave-to {
  opacity: 0;
  transform: scale(0.5);
}

.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.3s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

/* ==================== 响应式 ==================== */
@media (max-width: 480px) {
  .agent-task-monitor {
    bottom: 12px;
    right: 12px;
  }

  .monitor-panel {
    width: calc(100vw - 24px);
  }
}
</style>
