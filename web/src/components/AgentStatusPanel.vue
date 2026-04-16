<template>
  <div class="agent-status-panel" :class="{ 'is-running': isRunning, 'is-error': hasError }">
    <!-- Agent 选择 -->
    <div class="agent-selector-section">
      <div class="section-header">
        <h3>选择 Agent</h3>
        <button
          v-if="!disabled"
          class="refresh-btn"
          title="刷新 Agent 列表"
          @click="$emit('refresh')"
        >
          <IconRefresh />
        </button>
      </div>

      <div class="agent-grid">
        <button
          v-for="agent in agents"
          :key="agent.agentType"
          class="agent-option"
          :class="{
            'is-selected': selectedAgent?.agentType === agent.agentType,
            [`agent-color-${agent.color}`]: agent.color
          }"
          :disabled="disabled"
          @click="$emit('select', agent)"
        >
          <span class="agent-icon">{{ getAgentIcon(agent.agentType) }}</span>
          <span class="agent-name">{{ agent.agentName }}</span>
          <span class="agent-desc">{{ agent.agentDescription }}</span>
        </button>
      </div>
    </div>

    <!-- 执行状态 -->
    <div v-if="executionStatus.status !== 'idle'" class="execution-status-section">
      <div class="section-header">
        <h3>执行状态</h3>
        <span class="status-badge" :class="`status-${executionStatus.status}`">
          {{ getStatusText(executionStatus.status) }}
        </span>
      </div>

      <!-- 进度条 -->
      <div class="progress-container">
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: `${executionStatus.progress}%` }"
          ></div>
        </div>
        <span class="progress-text">{{ executionStatus.progress }}%</span>
      </div>

      <!-- 轮次信息 -->
      <div class="turn-info">
        <span>轮次: {{ executionStatus.currentTurn }} / {{ executionStatus.maxTurns }}</span>
      </div>

      <!-- 状态消息 -->
      <div v-if="executionStatus.message" class="status-message">
        {{ executionStatus.message }}
      </div>

      <!-- 工具调用列表 -->
      <div v-if="toolCalls.length > 0" class="tool-calls-section">
        <h4>工具调用</h4>
        <ul class="tool-calls-list">
          <li
            v-for="(call, index) in toolCalls"
            :key="index"
            class="tool-call-item"
            :class="{ 'is-executing': call.status === 'executing' }"
          >
            <span class="tool-name">{{ call.toolName }}</span>
            <span v-if="call.status === 'executing'" class="tool-status">
              执行中...
            </span>
            <span v-else-if="call.status === 'completed'" class="tool-status completed">
              ✓
            </span>
            <span v-else-if="call.status === 'failed'" class="tool-status failed">
              ✗
            </span>
          </li>
        </ul>
      </div>

      <!-- 操作按钮 -->
      <div class="action-buttons">
        <button
          v-if="isRunning && !disabled"
          class="abort-btn"
          @click="$emit('abort')"
        >
          中断执行
        </button>
      </div>
    </div>

    <!-- 团队模式 -->
    <div v-if="teamMembers.length > 0" class="team-section">
      <div class="section-header">
        <h3>团队成员</h3>
        <button
          v-if="!disabled"
          class="add-member-btn"
          @click="$emit('addMember')"
        >
          + 添加
        </button>
      </div>

      <div class="team-members">
        <div
          v-for="member in teamMembers"
          :key="member.id"
          class="team-member"
          :class="`member-color-${member.color}`"
        >
          <span class="member-icon">{{ getAgentIcon(member.agentType) }}</span>
          <span class="member-name">{{ member.name }}</span>
          <span class="member-status">
            {{ getMemberStatusText(member.status) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RefreshOutline as IconRefresh } from '@vicons/ionicons5'
import type { AgentSelection, AgentExecutionStatus, ToolCallRecord, TeamMember } from '@/types/agentStatus'

/**
 * 工具调用记录（兼容旧的 ToolCall 类型）
 */
interface ToolCall {
  toolName: string
  status: 'pending' | 'executing' | 'completed' | 'failed'
}

/**
 * 属性
 */
const props = withDefaults(defineProps<{
  /** 选中的 Agent */
  modelValue?: AgentSelection | null
  /** Agent 列表 */
  agents?: AgentSelection[]
  /** 执行状态 */
  executionStatus?: AgentExecutionStatus
  /** 工具调用列表 */
  toolCalls?: (ToolCall | ToolCallRecord)[]
  /** 团队成员 */
  teamMembers?: TeamMember[]
  /** 是否禁用 */
  disabled?: boolean
}>(), {
  agents: () => [],
  executionStatus: () => ({
    status: 'idle',
    currentTurn: 0,
    maxTurns: 100,
    progress: 0,
  }),
  toolCalls: () => [],
  teamMembers: () => [],
  disabled: false,
})

/**
 * 事件
 */
 
const _emit = defineEmits<{
  (e: 'select', agent: AgentSelection): void
  (e: 'abort'): void
  (e: 'refresh'): void
  (e: 'addMember'): void
}>()

/**
 * 计算属性
 */
const selectedAgent = computed(() => props.modelValue)
const isRunning = computed(() =>
  ['starting', 'running'].includes(props.executionStatus.status)
)
const hasError = computed(() => props.executionStatus.status === 'error')

/**
 * 获取 Agent 图标
 */
function getAgentIcon(agentType: string): string {
  const icons: Record<string, string> = {
    'general-purpose': '🤖',
    'Explore': '🔍',
    'Plan': '📋',
    'verification': '✅',
    'claude-code-guide': '📖',
    'statusline-setup': '⚙️',
  }
  return icons[agentType] || '🤖'
}

/**
 * 获取状态文本
 */
function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    idle: '空闲',
    starting: '启动中',
    running: '执行中',
    completed: '已完成',
    error: '出错',
    cancelled: '已中断',
  }
  return texts[status] || status
}

/**
 * 获取成员状态文本
 */
function getMemberStatusText(status: string): string {
  const texts: Record<string, string> = {
    idle: '空闲',
    working: '工作中',
    completed: '已完成',
  }
  return texts[status] || status
}
</script>

<style scoped>
.agent-status-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
  background: var(--bg-secondary, #1e1e1e);
  border-radius: 8px;
  border: 1px solid var(--border-color, #3a3a3a);
}

.agent-status-panel.is-running {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}

.agent-status-panel.is-error {
  border-color: var(--color-error, #ef4444);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.section-header h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary, #a1a1aa);
  margin: 0;
}

/* Agent 选择器 */
.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
}

.agent-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--bg-tertiary, #252525);
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.agent-option:hover:not(:disabled) {
  background: var(--bg-hover, #2a2a2a);
  transform: translateY(-2px);
}

.agent-option.is-selected {
  border-color: var(--color-primary, #3b82f6);
  background: var(--bg-selected, rgba(59, 130, 246, 0.1));
}

.agent-option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.agent-icon {
  font-size: 1.5rem;
}

.agent-name {
  font-weight: 600;
  color: var(--text-primary, #ffffff);
}

.agent-desc {
  font-size: 0.75rem;
  color: var(--text-muted, #71717a);
  text-align: center;
}

/* 状态 */
.status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-idle { background: var(--color-gray, #71717a); color: white; }
.status-starting { background: var(--color-blue, #3b82f6); color: white; }
.status-running { background: var(--color-green, #22c55e); color: white; }
.status-completed { background: var(--color-green, #22c55e); color: white; }
.status-error { background: var(--color-error, #ef4444); color: white; }
.status-cancelled { background: var(--color-yellow, #eab308); color: black; }

/* 进度条 */
.progress-container {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--bg-tertiary, #252525);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary, #3b82f6), var(--color-secondary, #8b5cf6));
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #a1a1aa);
  min-width: 3rem;
  text-align: right;
}

.turn-info {
  font-size: 0.75rem;
  color: var(--text-muted, #71717a);
  margin-top: 0.5rem;
}

.status-message {
  font-size: 0.875rem;
  color: var(--text-primary, #ffffff);
  padding: 0.75rem;
  background: var(--bg-tertiary, #252525);
  border-radius: 6px;
  margin-top: 0.5rem;
}

/* 工具调用 */
.tool-calls-section {
  margin-top: 0.75rem;
}

.tool-calls-section h4 {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary, #a1a1aa);
  margin: 0 0 0.5rem 0;
}

.tool-calls-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tool-call-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--bg-tertiary, #252525);
  border-radius: 4px;
  font-size: 0.875rem;
}

.tool-name {
  font-family: monospace;
  color: var(--text-primary, #ffffff);
}

.tool-status {
  font-size: 0.75rem;
}

.tool-status.completed { color: var(--color-green, #22c55e); }
.tool-status.failed { color: var(--color-error, #ef4444); }

/* 操作按钮 */
.action-buttons {
  margin-top: 1rem;
}

.abort-btn {
  width: 100%;
  padding: 0.75rem;
  background: var(--color-error, #ef4444);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s ease;
}

.abort-btn:hover {
  background: #dc2626;
}

/* 团队成员 */
.team-members {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.team-member {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--bg-tertiary, #252525);
  border-radius: 6px;
}

.member-icon {
  font-size: 1.25rem;
}

.member-name {
  flex: 1;
  font-weight: 500;
  color: var(--text-primary, #ffffff);
}

.member-status {
  font-size: 0.75rem;
  color: var(--text-muted, #71717a);
}

/* 刷新按钮 */
.refresh-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--border-color, #3a3a3a);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary, #a1a1aa);
  transition: all 0.2s ease;
}

.refresh-btn:hover {
  background: var(--bg-hover, #2a2a2a);
  color: var(--text-primary, #ffffff);
}

.refresh-btn :deep(svg) {
  width: 16px;
  height: 16px;
}
</style>
