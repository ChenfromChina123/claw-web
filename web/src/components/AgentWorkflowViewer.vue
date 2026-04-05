<template>
  <div class="agent-workflow-viewer">
    <header class="viewer-header">
      <div>
        <h1 class="header-title">Claude Code HAHA</h1>
        <p class="header-subtitle">Agent 流程监控控制台 (厚后端架构方案)</p>
      </div>
      <div class="header-actions">
        <button v-if="!demoTraceId" @click="startDemo" class="btn-primary">
          模拟后端推送事件
        </button>
        <template v-else>
          <button @click="simulateNextEvent" class="btn-primary">
            模拟后端推送事件
          </button>
          <button @click="resetDemo" class="btn-secondary">
            重置
          </button>
        </template>
      </div>
    </header>

    <div v-if="demoTraceId" class="workflow-container">
      <agent-workflow-node
        :node="rootAgentNode"
        :level="0"
      ></agent-workflow-node>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">🤖</div>
      <p>点击"模拟后端推送事件"开始演示</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { AgentState, AgentWorkflowStep, AgentStatus } from '@/types'

const agentStore = useAgentStore()
const demoTraceId = ref<string | null>(null)
const eventCount = ref(0)

/**
 * 根 Agent 节点（计算属性）
 */
const rootAgentNode = computed(() => {
  if (!demoTraceId.value) return null
  
  const agentMap = agentStore.agents.get(demoTraceId.value)
  if (!agentMap) return null
  
  const agents = Array.from(agentMap.values())
  const rootAgent = agents.find(a => !a.parentAgentId)
  if (!rootAgent) return null
  
  // 构建带 children 的节点结构
  const buildNode = (agent: AgentState): AgentNode => {
    const children = agents.filter(a => a.parentAgentId === agent.agentId)
    return {
      ...agent,
      children: children.map(buildNode),
      steps: agent.workflowSteps.map(step => ({
        id: step.id,
        label: step.actionType,
        content: step.message,
        status: mapStepStatus(step.status),
        input: step.input,
        output: step.output,
        childAgent: null
      }))
    }
  }
  
  return buildNode(rootAgent)
})

/**
 * 映射状态到原型风格
 */
function mapStepStatus(status: AgentStatus): 'success' | 'running' | 'intercepted' | 'failed' {
  const statusMap: Record<AgentStatus, 'success' | 'running' | 'intercepted' | 'failed'> = {
    IDLE: 'success',
    THINKING: 'running',
    RUNNING: 'running',
    WAITING: 'intercepted',
    COMPLETED: 'success',
    FAILED: 'failed',
    BLOCKED: 'intercepted'
  }
  return statusMap[status] || 'success'
}

/**
 * 开始演示
 */
function startDemo() {
  const traceId = agentStore.createTrace('重构项目文件结构', 'Plan')
  demoTraceId.value = traceId
  eventCount.value = 0
  
  // 初始步骤
  const rootAgentId = agentStore.currentTrace?.rootAgentId || ''
  
  setTimeout(() => {
    agentStore.handleAgentEvent({
      traceId,
      agentId: rootAgentId,
      type: 'WORKFLOW_UPDATE',
      timestamp: Date.now(),
      data: {
        status: 'COMPLETED',
        actionType: 'THINKING',
        message: '用户要求重构项目文件结构'
      }
    })
  }, 300)
  
  setTimeout(() => {
    agentStore.handleAgentEvent({
      traceId,
      agentId: rootAgentId,
      type: 'WORKFLOW_UPDATE',
      timestamp: Date.now(),
      data: {
        status: 'COMPLETED',
        actionType: 'THINKING',
        message: '识别到 3 个子任务：扫描、修改、验证'
      }
    })
  }, 800)
}

/**
 * 模拟后端推送事件
 */
function simulateNextEvent() {
  if (!demoTraceId.value) return
  
  eventCount.value++
  const traceId = demoTraceId.value
  const rootAgentId = agentStore.currentTrace?.rootAgentId || ''
  
  if (eventCount.value === 1) {
    // 推送：派生子 Agent
    setTimeout(() => {
      agentStore.handleAgentEvent({
        traceId,
        agentId: rootAgentId,
        type: 'TEAMMATE_SPAWNED',
        timestamp: Date.now(),
        data: {
          status: 'RUNNING',
          actionType: 'SPAWN_TEAMMATE',
          message: '启动 Explore 代理扫描 src 目录',
          childTraceId: traceId,
          childAgentId: 'sub-explore-001'
        }
      })
    }, 300)
    
    setTimeout(() => {
      agentStore.handleAgentEvent({
        traceId,
        agentId: 'sub-explore-001',
        type: 'WORKFLOW_UPDATE',
        timestamp: Date.now(),
        data: {
          status: 'COMPLETED',
          actionType: 'TOOL_CALL',
          message: 'ls -R ./src',
          toolName: 'FileList',
          input: { path: './src' },
          output: { files: ['main.ts', 'App.vue', 'components/'] }
        }
      })
    }, 800)
    
    setTimeout(() => {
      agentStore.handleAgentEvent({
        traceId,
        agentId: 'sub-explore-001',
        type: 'PERMISSION_REQUIRED',
        timestamp: Date.now(),
        data: {
          status: 'BLOCKED',
          actionType: 'WAITING_PERMISSION',
          message: 'read package.json'
        }
      })
    }, 1300)
    
  } else if (eventCount.value === 2) {
    // 推送：主任务完成
    setTimeout(() => {
      agentStore.handleAgentEvent({
        traceId,
        agentId: rootAgentId,
        type: 'WORKFLOW_UPDATE',
        timestamp: Date.now(),
        data: {
          status: 'COMPLETED',
          actionType: 'THINKING',
          message: '任务全部完成！'
        }
      })
    }, 300)
  }
}

/**
 * 重置演示
 */
function resetDemo() {
  if (demoTraceId.value) {
    agentStore.clearTrace(demoTraceId.value)
  }
  demoTraceId.value = null
  eventCount.value = 0
}

/**
 * Agent 节点类型
 */
interface AgentNode extends AgentState {
  children: AgentNode[]
  steps: Array<{
    id: string
    label: string
    content: string
    status: 'success' | 'running' | 'intercepted' | 'failed'
    input?: Record<string, unknown>
    output?: Record<string, unknown>
    childAgent: AgentNode | null
  }>
}

/**
 * 递归组件：Agent Workflow Node
 */
const AgentWorkflowNode = {
  name: 'AgentWorkflowNode',
  props: {
    node: {
      type: Object as () => AgentNode,
      required: true
    },
    level: {
      type: Number,
      default: 0
    }
  },
  setup(props) {
    const isRunning = computed(() => 
      props.node.status === 'RUNNING' || props.node.status === 'THINKING'
    )
    
    const statusColor = computed(() => {
      if (isRunning.value) return 'status-running'
      if (props.node.status === 'FAILED') return 'status-failed'
      if (props.node.status === 'BLOCKED') return 'status-blocked'
      return 'status-success'
    })
    
    const stepStatusClass = (status: string) => {
      const map: Record<string, string> = {
        'success': 'step-success',
        'running': 'step-running',
        'intercepted': 'step-intercepted',
        'failed': 'step-failed'
      }
      return map[status] || 'step-default'
    }
    
    return { isRunning, statusColor, stepStatusClass }
  },
  render() {
    const { node, level, isRunning, statusColor, stepStatusClass } = this as any
    
    return h('div', { class: 'workflow-node' }, [
      // Agent 头部
      h('div', { class: 'node-header' }, [
        h('div', { class: ['status-dot', statusColor, isRunning ? 'pulse' : ''] }),
        h('span', { class: 'agent-type' }, `[${node.name}]`),
        h('span', { class: 'agent-id' }, `ID: ${node.agentId}`)
      ]),
      
      // 子内容（带缩进）
      h('div', { class: 'node-content', style: { marginLeft: `${level * 24}px` } }, [
        // 步骤列表
        ...node.steps.map((step: any) => 
          h('div', { class: 'step-item', key: step.id }, [
            h('div', { class: 'step-dot' }),
            h('div', { class: 'step-card' }, [
              h('div', { class: 'step-header' }, [
                h('span', { class: 'step-label' }, step.label),
                h('span', { class: ['step-status', stepStatusClass(step.status)] }, step.status.toUpperCase())
              ]),
              h('p', { class: 'step-content' }, step.content),
              
              // 权限拦截提示
              step.status === 'intercepted' && h('div', { class: 'permission-intercept' }, [
                h('span', { class: 'permission-warning' }, [
                  '⚠️ 发现高危命令: ',
                  h('b', null, 'rm -rf /test')
                ]),
                h('div', { class: 'permission-actions' }, [
                  h('button', { class: 'btn-allow' }, '允许执行'),
                  h('button', { class: 'btn-deny' }, '拒绝')
                ])
              ]),
              
              // 子 Agent（递归）
              step.childAgent && h('div', { class: 'child-agent' }, [
                h(AgentWorkflowNode, { 
                  node: step.childAgent,
                  level: level + 1
                })
              ])
            ])
          ])
        ),
        
        // 运行中提示
        isRunning && h('div', { class: 'running-indicator pulse' }, [
          h('span', null, '●'),
          h('span', null, ' Agent 正在处理中...')
        ])
      ])
    ])
  }
}

onMounted(() => {
  agentStore.setupWebSocketListeners()
})
</script>

<style scoped>
.agent-workflow-viewer {
  padding: 32px;
  background: #111827;
  color: #f3f4f6;
  font-family: system-ui, -apple-system, sans-serif;
  min-height: 100vh;
}

.viewer-header {
  max-width: 896px;
  margin: 0 auto 32px;
  padding-bottom: 16px;
  border-bottom: 1px solid #374151;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.header-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: #60a5fa;
}

.header-subtitle {
  margin: 4px 0 0;
  font-size: 14px;
  color: #9ca3af;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn-primary {
  background: #2563eb;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #3b82f6;
}

.btn-secondary {
  background: #4b5563;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-secondary:hover {
  background: #6b7280;
}

.workflow-container {
  max-width: 896px;
  margin: 0 auto;
}

.empty-state {
  max-width: 896px;
  margin: 64px auto;
  text-align: center;
  color: #6b7280;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

/* 工作流节点样式 */
.workflow-node {
  margin-bottom: 16px;
}

.node-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.status-success {
  background: #22c55e;
}

.status-running {
  background: #3b82f6;
}

.status-failed {
  background: #ef4444;
}

.status-blocked {
  background: #f97316;
}

.agent-type {
  font-family: monospace;
  font-weight: 700;
  color: #93c5fd;
}

.agent-id {
  font-size: 12px;
  color: #6b7280;
}

.node-content {
  border-left: 2px dashed #4b5563;
  padding-left: 24px;
}

/* 步骤样式 */
.step-item {
  position: relative;
  margin-bottom: 12px;
}

.step-dot {
  position: absolute;
  left: -31px;
  top: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4b5563;
  border: 2px solid #111827;
}

.step-card {
  background: #1f2937;
  border: 1px solid #374151;
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

.step-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.step-label {
  font-size: 14px;
  font-weight: 500;
}

.step-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: 600;
}

.step-success {
  background: rgba(34, 197, 94, 0.2);
  color: #86efac;
}

.step-running {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
}

.step-intercepted {
  background: rgba(249, 115, 22, 0.2);
  color: #fdba74;
}

.step-failed {
  background: rgba(239, 68, 68, 0.2);
  color: #fca5a5;
}

.step-default {
  background: rgba(75, 85, 99, 0.2);
  color: #d1d5db;
}

.step-content {
  margin: 4px 0 0;
  font-size: 12px;
  color: #9ca3af;
}

/* 权限拦截 */
.permission-intercept {
  margin-top: 12px;
  padding: 8px;
  background: rgba(249, 115, 22, 0.2);
  border: 1px solid #c2410c;
  border-radius: 6px;
  display: flex;
  gap: 8px;
  align-items: center;
}

.permission-warning {
  font-size: 12px;
  color: #fed7aa;
  flex: 1;
}

.permission-actions {
  display: flex;
  gap: 8px;
}

.btn-allow {
  background: #ea580c;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  cursor: pointer;
}

.btn-deny {
  background: #4b5563;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 10px;
  cursor: pointer;
}

/* 子 Agent */
.child-agent {
  margin-top: 16px;
}

/* 运行中指示器 */
.running-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #6b7280;
}

/* 脉冲动画 */
.pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
