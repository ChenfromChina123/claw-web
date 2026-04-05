<template>
  <div class="agent-orchestration-panel">
    <div class="panel-header">
      <h3>🤖 Agent 协调控制面板</h3>
      <n-button size="small" @click="createDemoTrace" type="primary">
        启动演示
      </n-button>
      <n-button size="small" @click="agentStore.reset" quaternary>
        重置
      </n-button>
    </div>

    <div v-if="agentStore.currentTrace" class="trace-info">
      <n-tag :type="getTraceStatusType(agentStore.currentTrace.status)">
        {{ agentStore.currentTrace.status }}
      </n-tag>
      <span class="trace-title">{{ agentStore.currentTrace.title }}</span>
    </div>

    <div class="agent-tree">
      <n-tree
        v-if="agentStore.agentTree.length > 0"
        :data="agentTreeData"
        :render-label="renderAgentNode"
        :default-expanded-keys="expandedKeys"
        block-line
      />
      <n-empty v-else description="暂无 Agent 数据" />
    </div>

    <div v-if="selectedAgent" class="agent-details">
      <n-divider>Agent 详情</n-divider>
      <div class="agent-header">
        <span class="agent-name">{{ selectedAgent.name }}</span>
        <n-tag :type="getAgentStatusType(selectedAgent.status)">
          {{ selectedAgent.status }}
        </n-tag>
      </div>
      <div class="workflow-steps">
        <n-timeline>
          <n-timeline-item
            v-for="step in selectedAgent.workflowSteps"
            :key="step.id"
            :type="getStepType(step.status)"
            :title="step.actionType"
          >
            <div class="step-content">
              <p>{{ step.message }}</p>
              <n-collapse v-if="step.input || step.output">
                <n-collapse-item title="详情">
                  <div v-if="step.input" class="step-detail">
                    <strong>输入：</strong>
                    <pre>{{ JSON.stringify(step.input, null, 2) }}</pre>
                  </div>
                  <div v-if="step.output" class="step-detail">
                    <strong>输出：</strong>
                    <pre>{{ JSON.stringify(step.output, null, 2) }}</pre>
                  </div>
                </n-collapse-item>
              </n-collapse>
            </div>
          </n-timeline-item>
        </n-timeline>
      </div>
    </div>

    <div v-if="agentStore.pendingPermissions.size > 0" class="permissions-panel">
      <n-divider>等待权限审批</n-divider>
      <div v-for="(event, key) in pendingPermissionsArray" :key="key" class="permission-item">
        <n-alert type="warning" :title="`${event.agentId} 需要授权`">
          <p>{{ event.data.message }}</p>
          <div class="permission-actions">
            <n-button size="small" type="error" @click="approvePermission(event.traceId, event.agentId, false)">
              拒绝
            </n-button>
            <n-button size="small" type="primary" @click="approvePermission(event.traceId, event.agentId, true)">
              允许
            </n-button>
          </div>
        </n-alert>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAgentStore } from '@/stores/agent'
import type { AgentState, AgentWorkflowStep, AgentStatus } from '@/types'
import { NButton, NTag, NTree, NEmpty, NDivider, NTimeline, NTimelineItem, NCollapse, NCollapseItem, NAlert } from 'naive-ui'

const agentStore = useAgentStore()

const selectedAgentKey = ref<string | null>(null)
const expandedKeys = ref<string[]>([])

/**
 * 将 Agent 树转换为 NTree 数据格式
 */
const agentTreeData = computed(() => {
  const buildTreeNode = (agent: AgentState & { children?: AgentState[] }) => {
    const key = `${agent.traceId}-${agent.agentId}`
    expandedKeys.value.push(key)
    return {
      key,
      label: agent.name,
      children: agent.children?.map(buildTreeNode) || [],
      agent
    }
  }
  return agentStore.agentTree.map(buildTreeNode)
})

/**
 * 选中的 Agent
 */
const selectedAgent = computed(() => {
  if (!selectedAgentKey.value) return null
  const [traceId, agentId] = selectedAgentKey.value.split('-')
  const agentMap = agentStore.agents.get(traceId)
  return agentMap?.get(agentId) || null
})

/**
 * 待审批权限列表
 */
const pendingPermissionsArray = computed(() => {
  return Array.from(agentStore.pendingPermissions.values())
})

/**
 * 渲染 Agent 节点
 */
function renderAgentNode({ node }: { node: any }) {
  const agent = node.agent as AgentState
  return (
    <div class="tree-node" onClick={() => selectAgent(agent)}>
      <span class="node-icon">{agent.icon || '🤖'}</span>
      <span class="node-name">{agent.name}</span>
      <n-tag size="small" :type="getAgentStatusType(agent.status)">
        {{ agent.status }}
      </n-tag>
    </div>
  )
}

/**
 * 选择 Agent
 */
function selectAgent(agent: AgentState) {
  selectedAgentKey.value = `${agent.traceId}-${agent.agentId}`
}

/**
 * 获取 Trace 状态的 Tag 类型
 */
function getTraceStatusType(status: AgentStatus) {
  const statusMap: Record<AgentStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
    IDLE: 'default',
    THINKING: 'info',
    RUNNING: 'info',
    WAITING: 'warning',
    COMPLETED: 'success',
    FAILED: 'error',
    BLOCKED: 'warning'
  }
  return statusMap[status] || 'default'
}

/**
 * 获取 Agent 状态的 Tag 类型
 */
function getAgentStatusType(status: AgentStatus) {
  return getTraceStatusType(status)
}

/**
 * 获取步骤状态的 Timeline 类型
 */
function getStepType(status: AgentStatus) {
  const typeMap: Record<AgentStatus, 'default' | 'success' | 'warning' | 'error' | 'info'> = {
    IDLE: 'default',
    THINKING: 'info',
    RUNNING: 'info',
    WAITING: 'warning',
    COMPLETED: 'success',
    FAILED: 'error',
    BLOCKED: 'warning'
  }
  return typeMap[status] || 'default'
}

/**
 * 审批权限
 */
function approvePermission(traceId: string, agentId: string, approved: boolean) {
  agentStore.approvePermission(traceId, agentId, approved)
}

/**
 * 创建演示 Trace
 */
function createDemoTrace() {
  const traceId = agentStore.createTrace('分析项目结构', '主 Agent')
  
  // 模拟一些事件
  setTimeout(() => {
    agentStore.handleAgentEvent({
      traceId,
      agentId: agentStore.currentTrace?.rootAgentId || '',
      type: 'WORKFLOW_UPDATE',
      timestamp: Date.now(),
      data: {
        status: 'THINKING',
        actionType: 'THINKING',
        message: '正在分析任务...'
      }
    })
  }, 500)

  setTimeout(() => {
    agentStore.handleAgentEvent({
      traceId,
      agentId: agentStore.currentTrace?.rootAgentId || '',
      type: 'TOOL_CALL_START',
      timestamp: Date.now(),
      data: {
        status: 'RUNNING',
        actionType: 'TOOL_CALL',
        message: '执行 FileList',
        toolName: 'FileList',
        input: { path: '.' }
      }
    })
  }, 1500)

  setTimeout(() => {
    agentStore.handleAgentEvent({
      traceId,
      agentId: agentStore.currentTrace?.rootAgentId || '',
      type: 'TOOL_CALL_COMPLETE',
      timestamp: Date.now(),
      data: {
        status: 'IDLE',
        actionType: 'TOOL_CALL',
        message: 'FileList 完成',
        toolName: 'FileList',
        output: { files: ['package.json', 'src/', 'dist/'] },
        duration: 1200
      }
    })
  }, 3000)

  setTimeout(() => {
    agentStore.handleAgentEvent({
      traceId,
      agentId: agentStore.currentTrace?.rootAgentId || '',
      type: 'TEAMMATE_SPAWNED',
      timestamp: Date.now(),
      data: {
        status: 'COMPLETED',
        actionType: 'SPAWN_TEAMMATE',
        message: '派生子 Agent(Explore)',
        childTraceId: traceId,
        childAgentId: 'explore-agent'
      }
    })
  }, 4000)

  setTimeout(() => {
    agentStore.handleAgentEvent({
      traceId,
      agentId: 'explore-agent',
      type: 'WORKFLOW_UPDATE',
      timestamp: Date.now(),
      data: {
        status: 'RUNNING',
        actionType: 'THINKING',
        message: '正在探索项目结构...'
      }
    })
  }, 4500)

  setTimeout(() => {
    agentStore.handleAgentEvent({
      traceId,
      agentId: agentStore.currentTrace?.rootAgentId || '',
      type: 'PERMISSION_REQUIRED',
      timestamp: Date.now(),
      data: {
        status: 'BLOCKED',
        actionType: 'WAITING_PERMISSION',
        message: '需要您的授权来修改文件'
      }
    })
  }, 6000)
}

onMounted(() => {
  agentStore.setupWebSocketListeners()
})
</script>

<style scoped>
.agent-orchestration-panel {
  padding: 16px;
  background: var(--n-color-card);
  border-radius: 8px;
  height: 100%;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.trace-info {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px;
  background: var(--n-color-card-soft);
  border-radius: 6px;
}

.trace-title {
  font-weight: 500;
}

.agent-tree {
  margin-bottom: 16px;
  min-height: 100px;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.2s;
}

.tree-node:hover {
  background: var(--n-color-card-soft);
}

.node-icon {
  font-size: 16px;
}

.node-name {
  flex: 1;
}

.agent-details {
  padding: 12px;
  background: var(--n-color-card-soft);
  border-radius: 6px;
}

.agent-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.agent-name {
  font-size: 16px;
  font-weight: 600;
}

.workflow-steps {
  max-height: 300px;
  overflow-y: auto;
}

.step-content {
  font-size: 14px;
}

.step-detail {
  margin-top: 8px;
}

.step-detail pre {
  margin: 4px 0;
  padding: 8px;
  background: var(--n-color-modal);
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
}

.permissions-panel {
  margin-top: 16px;
}

.permission-item {
  margin-bottom: 12px;
}

.permission-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
