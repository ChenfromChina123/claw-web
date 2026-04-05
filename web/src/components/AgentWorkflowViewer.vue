<script setup lang="ts">
/**
 * AgentWorkflowViewer - 递归工作流树形可视化组件
 * 
 * 功能：
 * - 以树形结构展示 Agent 的工作流程
 * - 支持递归渲染子 Agent
 * - 实时更新状态和进度
 * - 可折叠/展开详情
 * - 支持权限拦截展示
 */

import { computed, ref, h, type VNode } from 'vue'
import { NTag, NButton, NCollapse, NCollapseItem, NTooltip, NSpin } from 'naive-ui'
import type { AgentState, AgentWorkflowStep } from '@/types'
import { useAgentStore } from '@/stores/agent'

// Props
interface Props {
  node: AgentState & { children?: AgentState[] }
  level?: number
  showDetails?: boolean
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  level: 0,
  showDetails: true,
  compact: false
})

const emit = defineEmits<{
  (e: 'step-click', step: AgentWorkflowStep): void
  (e: 'agent-click', agentId: string): void
}>()

const agentStore = useAgentStore()

// 状态颜色映射
const statusColors = {
  IDLE: 'default',
  THINKING: 'info',
  RUNNING: 'primary',
  WAITING: 'warning',
  BLOCKED: 'warning',
  COMPLETED: 'success',
  FAILED: 'error'
} as const

// 步骤状态颜色
const stepStatusColors = {
  pending: 'default',
  running: 'primary',
  completed: 'success',
  failed: 'error',
  blocked: 'warning'
} as const

// 动作类型图标
const actionTypeIcons: Record<string, string> = {
  THINKING: '🤔',
  TOOL_CALL: '🔧',
  SPAWN_TEAMMATE: '🤖',
  MESSAGE: '💬',
  WAITING_PERMISSION: '⏳',
  IDLE: '💤'
}

// 获取 Agent 状态颜色
const statusColor = computed(() => {
  const color = statusColors[props.node.status] || 'default'
  return `var(--n-color-${color === 'default' ? 'fill-4' : color + '-tonal'})`
})

// 获取 Agent 状态文本
const statusText = computed(() => {
  const statusMap: Record<string, string> = {
    IDLE: '空闲',
    THINKING: '思考中',
    RUNNING: '运行中',
    WAITING: '等待中',
    BLOCKED: '已阻塞',
    COMPLETED: '已完成',
    FAILED: '失败'
  }
  return statusMap[props.node.status] || props.node.status
})

// 是否正在运行
const isRunning = computed(() => {
  return props.node.status === 'RUNNING' || props.node.status === 'THINKING'
})

// 是否是根节点
const isRoot = computed(() => props.level === 0)

// 步骤数量统计
const completedSteps = computed(() => 
  props.node.workflowSteps.filter(s => s.status === 'COMPLETED').length
)

const totalSteps = computed(() => props.node.workflowSteps.length)

const progress = computed(() => {
  if (totalSteps.value === 0) return 0
  return Math.round((completedSteps.value / totalSteps.value) * 100)
})

// 格式化时长
function formatDuration(ms?: number): string {
  if (!ms) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

// 获取步骤图标
function getStepIcon(step: AgentWorkflowStep): string {
  if (step.toolName) {
    return actionTypeIcons.TOOL_CALL
  }
  return actionTypeIcons[step.actionType] || actionTypeIcons.IDLE
}

// 处理步骤点击
function handleStepClick(step: AgentWorkflowStep) {
  emit('step-click', step)
}

// 处理 Agent 点击
function handleAgentClick() {
  emit('agent-click', props.node.agentId)
}

// 获取工具调用详情
function getToolCallDetails(step: AgentWorkflowStep) {
  if (!step.toolName) return null
  return agentStore.getToolCallDetails(step.id)
}

// 展开状态
const expandedSteps = ref<Set<string>>(new Set())

function toggleStepExpand(stepId: string) {
  if (expandedSteps.value.has(stepId)) {
    expandedSteps.value.delete(stepId)
  } else {
    expandedSteps.value.add(stepId)
  }
}

function isStepExpanded(stepId: string): boolean {
  return expandedSteps.value.has(stepId)
}

// 渲染单个步骤
function renderStep(step: AgentWorkflowStep, index: number): VNode {
  const isExpanded = isStepExpanded(step.id)
  const details = getToolCallDetails(step)
  const isToolCall = step.actionType === 'TOOL_CALL'
  const isPermission = step.actionType === 'WAITING_PERMISSION'
  
  const connectorClass = index < props.node.workflowSteps.length - 1 ? 'step-connector' : ''
  
  return h('div', { class: 'workflow-step-wrapper' }, [
    // 连接线
    index > 0 && h('div', { class: 'step-connector-line', 'data-active': step.status === 'completed' }),
    
    // 步骤内容
    h('div', {
      class: [
        'workflow-step',
        `status-${step.status}`,
        isToolCall && 'tool-step',
        isPermission && 'permission-step'
      ]
    }, [
      // 步骤头部
      h('div', { class: 'step-header', onClick: () => toggleStepExpand(step.id) }, [
        // 展开/折叠指示器
        isToolCall && h('span', { class: ['step-expand-icon', isExpanded && 'expanded'] }, '▶'),
        
        // 步骤图标
        h('span', { class: 'step-icon' }, getStepIcon(step)),
        
        // 步骤标签
        h('span', { class: 'step-label' }, step.toolName || step.message.substring(0, 40)),
        
        // 状态标签
        h(NTag, {
          class: 'step-status-tag',
          size: 'small',
          type: stepStatusColors[step.status] as any
        }, () => step.status)
      ]),
      
      // 展开详情
      isExpanded && h('div', { class: 'step-details' }, [
        // 消息内容
        h('div', { class: 'step-message' }, step.message),
        
        // 工具输入
        step.input && h('div', { class: 'step-input' }, [
          h('div', { class: 'detail-label' }, '输入参数:'),
          h('pre', { class: 'detail-code' }, JSON.stringify(step.input, null, 2))
        ]),
        
        // 工具输出
        step.output && h('div', { class: 'step-output' }, [
          h('div', { class: 'detail-label' }, '输出结果:'),
          h('pre', { class: 'detail-code' }, 
            typeof step.output === 'object' 
              ? JSON.stringify(step.output, null, 2).substring(0, 500)
              : String(step.output)
          )
        ]),
        
        // 日志
        details?.logs && details.logs.length > 0 && h('div', { class: 'step-logs' }, [
          h('div', { class: 'detail-label' }, '执行日志:'),
          h('div', { class: 'log-container' }, 
            details.logs.slice(-10).map((log, i) => 
              h('div', { key: i, class: 'log-line' }, log)
            )
          )
        ]),
        
        // 耗时
        step.duration && h('div', { class: 'step-duration' }, 
          `耗时: ${formatDuration(step.duration)}`
        ),
        
        // 权限操作按钮
        isPermission && h('div', { class: 'permission-actions' }, [
          h(NButton, {
            type: 'success',
            size: 'small',
            onClick: () => agentStore.approvePermission(step.id, true)
          }, () => '允许'),
          h(NButton, {
            type: 'error',
            size: 'small',
            onClick: () => agentStore.approvePermission(step.id, false)
          }, () => '拒绝')
        ])
      ])
    ])
  ])
}

// 渲染子 Agent
function renderChildAgents(): VNode[] {
  if (!props.node.children || props.node.children.length === 0) {
    return []
  }
  
  return [
    h('div', { class: 'child-agents-label' }, [
      h('span', {}, '子 Agent'),
      h('span', { class: 'child-count' }, props.node.children.length)
    ]),
    ...props.node.children.map(child => 
      h(AgentWorkflowNode, {
        node: child,
        level: props.level + 1,
        showDetails: props.showDetails,
        compact: props.compact,
        onStepClick: (step: AgentWorkflowStep) => emit('step-click', step),
        onAgentClick: (agentId: string) => emit('agent-click', agentId)
      })
    )
  ]
}

// Agent 图标
const agentIcon = computed(() => {
  if (props.node.icon) return props.node.icon
  if (props.node.name?.includes('Plan')) return '📋'
  if (props.node.name?.includes('Explore')) return '🔍'
  if (props.node.name?.includes('Code')) return '💻'
  if (props.node.name?.includes('Test')) return '🧪'
  if (props.node.name?.includes('Verify')) return '✅'
  return '🤖'
})
</script>

<template>
  <div 
    class="agent-workflow-node"
    :class="{ 'is-root': isRoot, 'is-running': isRunning, 'compact-mode': compact }"
    :style="{ '--level': level }"
  >
    <!-- Agent 头部 -->
    <div class="agent-header" @click="handleAgentClick">
      <!-- 状态指示器 -->
      <div class="status-indicator" :class="node.status.toLowerCase()">
        <div v-if="isRunning" class="pulse-dot"></div>
        <div v-else class="static-dot"></div>
      </div>
      
      <!-- Agent 图标和名称 -->
      <span class="agent-icon">{{ agentIcon }}</span>
      <span class="agent-name">{{ node.name || 'Unknown Agent' }}</span>
      
      <!-- Agent 类型标签 -->
      <NTag v-if="node.agentType" size="small" :bordered="false">
        {{ node.agentType }}
      </NTag>
      
      <!-- 状态标签 -->
      <NTag 
        :type="statusColors[node.status] as any" 
        size="small"
        class="status-tag"
      >
        {{ statusText }}
      </NTag>
      
      <!-- 进度指示 -->
      <div v-if="totalSteps > 0 && !compact" class="progress-indicator">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
        </div>
        <span class="progress-text">{{ completedSteps }}/{{ totalSteps }}</span>
      </div>
      
      <!-- 旋转指示器 -->
      <NSpin v-if="isRunning" :size="16" />
    </div>
    
    <!-- 工作流步骤 -->
    <div v-if="showDetails && node.workflowSteps.length > 0" class="workflow-steps">
      <template v-for="(step, index) in node.workflowSteps" :key="step.id">
        <!-- 渲染步骤 -->
        <div class="step-wrapper">
          <!-- 连接线 -->
          <div v-if="index > 0" class="connector-line" :class="{ active: step.status === 'completed' }"></div>
          
          <!-- 步骤内容 -->
          <div 
            class="step-item"
            :class="[`status-${step.status}`, { 'tool-call': step.actionType === 'TOOL_CALL', 'permission-waiting': step.actionType === 'WAITING_PERMISSION' }]"
            @click="handleStepClick(step)"
          >
            <!-- 步骤图标 -->
            <span class="step-icon">{{ getStepIcon(step) }}</span>
            
            <!-- 步骤信息 -->
            <div class="step-content">
              <div class="step-main">
                <span class="step-label">{{ step.toolName || step.message.substring(0, 50) }}</span>
                <NTag :type="stepStatusColors[step.status] as any" size="tiny" :bordered="false">
                  {{ step.status }}
                </NTag>
              </div>
              
              <!-- 展开详情 -->
              <div v-if="step.toolName" class="step-details-collapsed">
                <NTooltip trigger="hover">
                  <template #trigger>
                    <span class="detail-toggle">详情</span>
                  </template>
                  <div class="detail-tooltip">
                    <div v-if="step.input"><strong>输入:</strong> {{ JSON.stringify(step.input).substring(0, 100) }}</div>
                    <div v-if="step.duration"><strong>耗时:</strong> {{ formatDuration(step.duration) }}</div>
                  </div>
                </NTooltip>
              </div>
            </div>
            
            <!-- 耗时 -->
            <span v-if="step.duration && step.status === 'completed'" class="step-duration">
              {{ formatDuration(step.duration) }}
            </span>
          </div>
        </div>
      </template>
    </div>
    
    <!-- 运行中指示 -->
    <div v-if="isRunning" class="running-indicator">
      <span class="running-dot"></span>
      <span>处理中...</span>
    </div>
    
    <!-- 子 Agent -->
    <div v-if="node.children && node.children.length > 0" class="child-agents">
      <div class="child-agents-header">
        <span class="child-label">子任务</span>
        <NTag size="tiny" round>{{ node.children.length }}</NTag>
      </div>
      <div class="child-agents-list">
        <AgentWorkflowNode
          v-for="child in node.children"
          :key="child.agentId"
          :node="child"
          :level="level + 1"
          :show-details="showDetails"
          :compact="compact"
          @step-click="(step) => emit('step-click', step)"
          @agent-click="(id) => emit('agent-click', id)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-workflow-node {
  --level: 0;
  --indent-size: 24px;
  --node-gap: 8px;
  --accent-color: var(--primary-color, #18a058);
  
  padding: var(--node-gap);
  margin-left: calc(var(--level) * var(--indent-size));
  border-left: 2px dashed var(--border-color, #3b3b3b);
  transition: border-color 0.2s;
}

.agent-workflow-node.is-root {
  border-left: 2px solid var(--accent-color);
  border-radius: 8px;
  background: var(--card-color, #1a1a1a);
}

.agent-workflow-node.is-running {
  border-left-color: var(--accent-color);
}

.agent-workflow-node.compact-mode {
  padding: 4px 8px;
}

/* Agent 头部 */
.agent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  background: var(--fill-color, #2a2a2a);
  cursor: pointer;
  transition: background 0.2s;
}

.agent-header:hover {
  background: var(--fill-color-hover, #333);
}

.status-indicator {
  width: 12px;
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-indicator .static-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-color, #666);
}

.status-indicator .pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent-color);
  animation: pulse 1.5s ease-in-out infinite;
}

.status-indicator.idle .static-dot { background: #666; }
.status-indicator.thinking .static-dot { background: #18a058; }
.status-indicator.running .pulse-dot { background: #2080f0; }
.status-indicator.waiting .static-dot { background: #f0a020; }
.status-indicator.blocked .static-dot { background: #d03050; }
.status-indicator.completed .static-dot { background: #18a058; }
.status-indicator.failed .static-dot { background: #d03050; }

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.7; }
}

.agent-icon {
  font-size: 16px;
}

.agent-name {
  font-weight: 600;
  color: var(--text-color, #fff);
}

.status-tag {
  margin-left: auto;
}

.progress-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.progress-bar {
  width: 60px;
  height: 4px;
  background: var(--fill-color, #333);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-color);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 11px;
  color: var(--text-color-3, #999);
}

/* 工作流步骤 */
.workflow-steps {
  margin-top: var(--node-gap);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.step-wrapper {
  display: flex;
  flex-direction: column;
}

.connector-line {
  width: 2px;
  height: 12px;
  background: var(--border-color, #3b3b3b);
  margin-left: 16px;
  transition: background 0.2s;
}

.connector-line.active {
  background: var(--accent-color);
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--fill-color-light, #252525);
  cursor: pointer;
  transition: background 0.2s;
}

.step-item:hover {
  background: var(--fill-color-hover, #333);
}

.step-item.status-running {
  background: rgba(32, 128, 240, 0.1);
  border-left: 2px solid #2080f0;
}

.step-item.status-completed {
  opacity: 0.8;
}

.step-item.status-failed {
  background: rgba(208, 48, 80, 0.1);
  border-left: 2px solid #d03050;
}

.step-item.status-blocked {
  background: rgba(240, 160, 32, 0.1);
  border-left: 2px solid #f0a020;
}

.step-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-label {
  font-size: 12px;
  color: var(--text-color-2, #ccc);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-duration {
  font-size: 11px;
  color: var(--text-color-3, #999);
  flex-shrink: 0;
}

.detail-toggle {
  font-size: 11px;
  color: var(--primary-color, #18a058);
  cursor: pointer;
}

.detail-toggle:hover {
  text-decoration: underline;
}

.detail-tooltip {
  font-size: 12px;
  max-width: 300px;
  word-break: break-all;
}

/* 运行中指示 */
.running-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 4px 8px;
  font-size: 11px;
  color: var(--text-color-3, #999);
}

.running-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-color);
  animation: blink 1s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* 子 Agent */
.child-agents {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color, #3b3b3b);
}

.child-agents-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-color-3, #999);
}

.child-label {
  font-weight: 500;
}

.child-agents-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
