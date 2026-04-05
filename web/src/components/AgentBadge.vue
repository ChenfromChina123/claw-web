<script setup lang="ts">
/**
 * Agent 标签组件
 * 
 * 用于显示 Agent 的名称、图标和状态
 */
import type { AgentType } from '@/types/agent'
import { getAgentDefinition, AGENT_ICONS } from '@/types/agent'

interface Props {
  /** Agent 类型 */
  agentType: AgentType
  /** 是否显示状态指示器 */
  showStatus?: boolean
  /** Agent 状态 */
  status?: 'idle' | 'thinking' | 'working' | 'completed' | 'error'
  /** 大小 */
  size?: 'small' | 'medium' | 'large'
}

const props = withDefaults(defineProps<Props>(), {
  showStatus: false,
  status: 'idle',
  size: 'medium'
})

/**
 * 获取 Agent 定义
 */
const agentDef = getAgentDefinition(props.agentType)

/**
 * 状态指示器颜色
 */
const statusColors: Record<string, string> = {
  idle: '#6b7280',
  thinking: '#f59e0b',
  working: '#3b82f6',
  completed: '#10b981',
  error: '#ef4444'
}

/**
 * 状态标签文本
 */
const statusLabels: Record<string, string> = {
  idle: '待命',
  thinking: '思考中',
  working: '工作中',
  completed: '已完成',
  error: '出错'
}
</script>

<template>
  <div 
    v-if="agentDef"
    class="agent-badge"
    :class="[`size-${size}`]"
    :style="{ '--agent-color': agentDef.color }"
  >
    <!-- 状态指示器 -->
    <span v-if="showStatus" class="status-indicator" :style="{ backgroundColor: statusColors[status] }">
      <span class="pulse" v-if="status === 'working' || status === 'thinking'"></span>
    </span>

    <!-- Agent 图标 -->
    <span class="agent-icon">{{ AGENT_ICONS[agentType] || '🤖' }}</span>

    <!-- Agent 名称 -->
    <span class="agent-name">{{ agentDef.name }}</span>

    <!-- 只读标签 -->
    <span v-if="agentDef.isReadOnly" class="readonly-badge">只读</span>

    <!-- 状态标签 -->
    <span v-if="showStatus" class="status-label">{{ statusLabels[status] }}</span>
  </div>
</template>

<style scoped>
.agent-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--agent-color);
  border-radius: 9999px;
  font-size: 12px;
  transition: all var(--transition-fast, 150ms) ease;
}

.agent-badge:hover {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 15px color-mix(in srgb, var(--agent-color) 20%, transparent);
}

/* 大小变体 */
.agent-badge.size-small {
  padding: 2px 8px;
  gap: 4px;
  font-size: 11px;
}

.agent-badge.size-large {
  padding: 6px 14px;
  gap: 8px;
  font-size: 14px;
}

/* 状态指示器 */
.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  position: relative;
  flex-shrink: 0;
}

.status-indicator .pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: inherit;
  opacity: 0.6;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.5);
    opacity: 0;
  }
}

/* Agent 图标 */
.agent-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.size-small .agent-icon {
  font-size: 12px;
}

.size-large .agent-icon {
  font-size: 16px;
}

/* Agent 名称 */
.agent-name {
  font-weight: 600;
  color: var(--agent-color);
}

/* 只读标签 */
.readonly-badge {
  font-size: 10px;
  padding: 1px 6px;
  background: rgba(107, 114, 128, 0.2);
  color: #9ca3af;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* 状态标签 */
.status-label {
  font-size: 10px;
  padding: 1px 6px;
  background: rgba(0, 0, 0, 0.2);
  color: #9ca3af;
  border-radius: 4px;
}
</style>
