<script setup lang="ts">
/**
 * Agent 协调控制面板
 * 
 * 真实的多 Agent 协调功能界面
 * 支持：
 * - 任务分解
 * - 团队管理
 * - 任务执行
 * - 实时状态监控
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  NButton,
  NInput,
  NSelect,
  NCard,
  NSpace,
  NTag,
  NSpin,
  NEmpty,
  NAlert,
  NDivider,
  NProgress,
  NTimeline,
  NTimelineItem,
  NModal,
  NForm,
  NFormItem,
  useMessage
} from 'naive-ui'
import {
  executeAgent,
  decomposeTask,
  createTeam,
  getTeamState,
  addTeamMember,
  addTeamTask,
  type TaskDecomposeRequest,
  type TaskDecomposeResponse,
  type SubTask
} from '@/api/agentApi'
import { useAgentStore } from '@/stores/agent'
import type { AgentType } from '@/types/agent'
import AgentBadge from './AgentBadge.vue'
import TaskPipeline from './TaskPipeline.vue'
import AgentStatusPanel from './AgentStatusPanel.vue'

const message = useMessage()
const agentStore = useAgentStore()

// ==================== 状态 ====================

/** 当前任务输入 */
const taskInput = ref('')

/** 任务分解结果 */
const decompositionResult = ref<TaskDecomposeResponse | null>(null)

/** 是否正在分解 */
const isDecomposing = ref(false)

/** 是否正在执行 */
const isExecuting = ref(false)

/** 选中的任务索引 */
const selectedTaskIndex = ref<number | null>(null)

/** 执行进度 */
const executionProgress = ref(0)

/** 当前步骤 */
const currentStep = ref('')

/** 执行日志 */
const executionLogs = ref<Array<{
  time: Date
  type: 'info' | 'success' | 'error' | 'task'
  message: string
}>>([])

// ==================== 可用选项 ====================

/** Agent 类型选项 */
const agentTypeOptions = [
  { label: '通用 Agent', value: 'general-purpose' },
  { label: '探索 Agent', value: 'Explore' },
  { label: '规划 Agent', value: 'Plan' },
  { label: '验证 Agent', value: 'verification' }
]

/** 分解模式选项 */
const decomposeModeOptions = [
  { label: '自动选择', value: 'auto' },
  { label: '顺序执行', value: 'sequential' },
  { label: '并行执行', value: 'parallel' },
  { label: '流水线执行', value: 'pipeline' }
]

/** 当前选择的 Agent 类型 */
const selectedAgentType = ref('general-purpose')

/** 当前选择的分解模式 */
const selectedDecomposeMode = ref('auto')

/** 最大任务数 */
const maxTasks = ref(8)

// ==================== 计算属性 ====================

/** 编排状态 */
const orchestrationState = computed(() => {
  if (agentStore.currentTrace) {
    return {
      orchestrator: agentStore.currentAgents.find(a => a.agentId === agentStore.currentTrace?.rootAgentId),
      subAgents: agentStore.currentAgents.filter(a => a.agentId !== agentStore.currentTrace?.rootAgentId),
      taskSteps: agentStore.currentAgents.flatMap(a => a.workflowSteps),
      overallStatus: agentStore.currentTrace.status === 'RUNNING' ? 'executing' 
        : agentStore.currentTrace.status === 'COMPLETED' ? 'completed' 
        : 'planning'
    }
  }
  return null
})

/** 是否有分解结果 */
const hasDecomposition = computed(() => decompositionResult.value !== null && decompositionResult.value.success)

// ==================== 方法 ====================

/**
 * 添加日志
 */
function addLog(type: 'info' | 'success' | 'error' | 'task', msg: string) {
  executionLogs.value.unshift({
    time: new Date(),
    type,
    message: msg
  })
  // 保持最多 100 条日志
  if (executionLogs.value.length > 100) {
    executionLogs.value = executionLogs.value.slice(0, 100)
  }
}

/**
 * 分解任务
 */
async function handleDecompose() {
  if (!taskInput.value.trim()) {
    message.warning('请输入任务描述')
    return
  }

  isDecomposing.value = true
  executionLogs.value = []
  addLog('info', `开始分析任务: "${taskInput.value.slice(0, 50)}..."`)

  try {
    const request: TaskDecomposeRequest = {
      task: taskInput.value,
      preferences: {
        mode: selectedDecomposeMode.value as any,
        maxTasks: maxTasks.value,
        preferParallel: true
      }
    }

    const result = await decomposeTask(request)
    decompositionResult.value = result

    if (result.success) {
      addLog('success', `任务分解完成！生成 ${result.subTasks.length} 个子任务`)
      addLog('info', `执行模式: ${result.executionPlan.mode}`)
      addLog('info', `预计时长: ${Math.round(result.executionPlan.estimatedDuration / 1000)}s`)
      message.success(`分解成功！生成了 ${result.subTasks.length} 个子任务`)
    } else {
      addLog('error', `分解失败: ${result.error}`)
      message.error(result.error || '任务分解失败')
    }
  } catch (error: any) {
    addLog('error', `分解异常: ${error.message}`)
    message.error('任务分解失败')
  } finally {
    isDecomposing.value = false
  }
}

/**
 * 执行分解后的任务
 */
async function handleExecute() {
  if (!hasDecomposition.value) {
    message.warning('请先分解任务')
    return
  }

  isExecuting.value = true
  executionProgress.value = 0
  selectedTaskIndex.value = null

  // 创建 Trace
  const traceId = agentStore.createTrace(taskInput.value, '主协调者')
  addLog('info', `创建执行追踪: ${traceId}`)

  const subTasks = decompositionResult.value!.subTasks
  const totalTasks = subTasks.length

  try {
    for (let i = 0; i < subTasks.length; i++) {
      const subTask = subTasks[i]
      selectedTaskIndex.value = i
      currentStep.value = subTask.title
      executionProgress.value = Math.round((i / totalTasks) * 100)

      addLog('task', `[${i + 1}/${totalTasks}] 开始: ${subTask.title}`)
      agentStore.addWorkflowStep(traceId, agentStore.currentTrace!.rootAgentId, {
        status: 'RUNNING',
        actionType: 'THINKING',
        message: subTask.title
      })

      try {
        // 执行 Agent 任务
        const result = await executeAgent({
          task: subTask.instructions,
          agentType: subTask.agentType,
          permissionMode: 'auto'
        })

        if (result.success) {
          addLog('success', `[${i + 1}/${totalTasks}] 完成: ${subTask.title}`)
          agentStore.addWorkflowStep(traceId, agentStore.currentTrace!.rootAgentId, {
            status: 'COMPLETED',
            actionType: 'THINKING',
            message: `${subTask.title} - 执行成功`,
            output: { result: result.message }
          })
        } else {
          addLog('error', `[${i + 1}/${totalTasks}] 失败: ${subTask.title} - ${result.error}`)
          agentStore.addWorkflowStep(traceId, agentStore.currentTrace!.rootAgentId, {
            status: 'FAILED',
            actionType: 'THINKING',
            message: `${subTask.title} - 执行失败`,
            output: { error: result.error }
          })
        }
      } catch (error: any) {
        addLog('error', `[${i + 1}/${totalTasks}] 异常: ${subTask.title} - ${error.message}`)
        agentStore.addWorkflowStep(traceId, agentStore.currentTrace!.rootAgentId, {
          status: 'FAILED',
          actionType: 'THINKING',
          message: `${subTask.title} - 异常: ${error.message}`
        })
      }

      executionProgress.value = Math.round(((i + 1) / totalTasks) * 100)
    }

    addLog('success', '所有任务执行完成！')
    message.success('任务执行完成')
  } catch (error: any) {
    addLog('error', `执行异常: ${error.message}`)
    message.error('执行过程中发生错误')
  } finally {
    isExecuting.value = false
    selectedTaskIndex.value = null
    currentStep.value = ''
  }
}

/**
 * 直接执行单个任务
 */
async function handleQuickExecute() {
  if (!taskInput.value.trim()) {
    message.warning('请输入任务描述')
    return
  }

  isExecuting.value = true
  executionLogs.value = []
  executionProgress.value = 0

  const traceId = agentStore.createTrace(taskInput.value, '通用 Agent')
  addLog('info', `开始执行: "${taskInput.value.slice(0, 50)}..."`)

  try {
    executionProgress.value = 20
    addLog('info', '正在分析任务...')

    const result = await executeAgent({
      task: taskInput.value,
      agentType: selectedAgentType.value,
      permissionMode: 'auto'
    })

    executionProgress.value = 80

    if (result.success) {
      addLog('success', '任务执行成功')
      agentStore.addWorkflowStep(traceId, agentStore.currentTrace!.rootAgentId, {
        status: 'COMPLETED',
        actionType: 'THINKING',
        message: '任务执行成功',
        output: { result: result.message }
      })
      message.success('任务执行成功')
    } else {
      addLog('error', `任务执行失败: ${result.error}`)
      agentStore.addWorkflowStep(traceId, agentStore.currentTrace!.rootAgentId, {
        status: 'FAILED',
        actionType: 'THINKING',
        message: `执行失败: ${result.error}`
      })
      message.error(result.error || '任务执行失败')
    }

    executionProgress.value = 100
  } catch (error: any) {
    addLog('error', `执行异常: ${error.message}`)
    message.error('任务执行失败')
  } finally {
    isExecuting.value = false
  }
}

/**
 * 清除结果
 */
function handleClear() {
  decompositionResult.value = null
  executionLogs.value = []
  executionProgress.value = 0
  selectedTaskIndex.value = null
  agentStore.reset()
  message.info('已清除所有状态')
}

/**
 * 格式化时间
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

/**
 * 获取日志类型颜色
 */
function getLogTypeColor(type: string): string {
  switch (type) {
    case 'success': return 'var(--n-color-success)'
    case 'error': return 'var(--n-color-error)'
    case 'task': return 'var(--n-color-info)'
    default: return 'var(--n-color)'
  }
}

// ==================== 生命周期 ====================

onMounted(() => {
  agentStore.setupWebSocketListeners()
})
</script>

<template>
  <div class="agent-orchestration-panel">
    <!-- 头部 -->
    <div class="panel-header">
      <h2 class="panel-title">🤖 Agent 协调控制面板</h2>
      <p class="panel-desc">多 Agent 智能协作，自动分解与执行复杂任务</p>
    </div>

    <div class="panel-content">
      <!-- 左侧：任务输入和分解 -->
      <div class="left-panel">
        <!-- 任务输入卡片 -->
        <NCard title="📝 任务输入" class="input-card">
          <NInput
            v-model:value="taskInput"
            type="textarea"
            placeholder="输入你想要完成的任务，例如：分析这个项目的结构，然后重构一个模块..."
            :rows="4"
            :disabled="isExecuting"
          />
          
          <NDivider />

          <NSpace vertical>
            <NSpace>
              <NFormItem label="Agent 类型" label-placement="left">
                <NSelect
                  v-model:value="selectedAgentType"
                  :options="agentTypeOptions"
                  style="width: 150px"
                  :disabled="isExecuting"
                />
              </NFormItem>
              
              <NFormItem label="分解模式" label-placement="left">
                <NSelect
                  v-model:value="selectedDecomposeMode"
                  :options="decomposeModeOptions"
                  style="width: 130px"
                  :disabled="isExecuting"
                />
              </NFormItem>
              
              <NFormItem label="最大子任务" label-placement="left">
                <NInputNumber
                  v-model:value="maxTasks"
                  :min="1"
                  :max="20"
                  style="width: 80px"
                  :disabled="isExecuting"
                />
              </NFormItem>
            </NSpace>

            <NSpace>
              <NButton
                type="primary"
                :loading="isDecomposing"
                :disabled="!taskInput.trim() || isExecuting"
                @click="handleDecompose"
              >
                {{ isDecomposing ? '分析中...' : '🔍 分解任务' }}
              </NButton>
              
              <NButton
                type="success"
                :loading="isExecuting"
                :disabled="!hasDecomposition"
                @click="handleExecute"
              >
                {{ isExecuting ? '执行中...' : '▶️ 执行分解计划' }}
              </NButton>
              
              <NButton
                :disabled="isDecomposing || isExecuting"
                @click="handleQuickExecute"
              >
                ⚡ 快速执行
              </NButton>
              
              <NButton quaternary @click="handleClear">
                清空
              </NButton>
            </NSpace>
          </NSpace>
        </NCard>

        <!-- 分解结果卡片 -->
        <NCard v-if="hasDecomposition" title="📋 任务分解结果" class="result-card">
          <template #header-extra>
            <NTag type="success" size="small">
              {{ decompositionResult?.subTasks.length }} 个子任务
            </NTag>
          </template>

          <div class="subtasks-list">
            <div
              v-for="(task, index) in decompositionResult?.subTasks"
              :key="task.taskId"
              class="subtask-item"
              :class="{
                'selected': selectedTaskIndex === index,
                'pending': selectedTaskIndex === null || selectedTaskIndex > index
              }"
            >
              <div class="subtask-header">
                <NTag :type="selectedTaskIndex === index ? 'info' : selectedTaskIndex > index ? 'success' : 'default'" size="small">
                  #{{ index + 1 }}
                </NTag>
                <span class="subtask-title">{{ task.title }}</span>
                <AgentBadge :agent-type="task.agentType as AgentType" size="small" />
              </div>
              <div class="subtask-desc">{{ task.description }}</div>
              <div class="subtask-meta">
                <NTag size="tiny">优先级 {{ task.priority }}</NTag>
                <NTag v-if="task.dependsOn.length > 0" size="tiny" type="warning">
                  依赖 {{ task.dependsOn.length }} 个任务
                </NTag>
              </div>
            </div>
          </div>

          <NDivider />

          <div class="execution-plan">
            <h4>执行计划</h4>
            <NSpace>
              <NTag type="info">模式: {{ decompositionResult?.executionPlan.mode }}</NTag>
              <NTag type="warning">预计: {{ Math.round((decompositionResult?.executionPlan.estimatedDuration || 0) / 1000) }}s</NTag>
              <NTag v-if="decompositionResult?.executionPlan.parallelGroups.length > 1" type="success">
                可并行: {{ decompositionResult?.executionPlan.parallelGroups.length }} 组
              </NTag>
            </NSpace>
          </div>
        </NCard>

        <!-- 执行日志卡片 -->
        <NCard title="📜 执行日志" class="log-card">
          <template #header-extra>
            <NButton v-if="executionLogs.length > 0" text @click="executionLogs = []">
              清空
            </NButton>
          </template>

          <div v-if="executionLogs.length === 0" class="empty-logs">
            <NEmpty description="暂无执行日志" />
          </div>

          <div v-else class="logs-list">
            <div
              v-for="(log, index) in executionLogs"
              :key="index"
              class="log-item"
              :style="{ borderLeftColor: getLogTypeColor(log.type) }"
            >
              <span class="log-time">{{ formatTime(log.time) }}</span>
              <span class="log-message">{{ log.message }}</span>
            </div>
          </div>
        </NCard>
      </div>

      <!-- 右侧：状态面板 -->
      <div class="right-panel">
        <!-- 执行进度 -->
        <NCard title="📊 执行进度" class="progress-card">
          <NProgress
            v-if="isExecuting"
            type="line"
            :percentage="executionProgress"
            :indicator-text-color="'#63e6be'"
            :processing="isExecuting"
          />
          <div v-else class="progress-idle">
            <NEmpty description="等待执行" />
          </div>
          <div v-if="currentStep" class="current-step">
            当前: {{ currentStep }}
          </div>
        </NCard>

        <!-- 实时状态 -->
        <NCard title="🔄 实时状态" class="status-card">
          <AgentStatusPanel
            v-if="orchestrationState"
            :orchestration-state="orchestrationState"
          />
          <div v-else class="status-idle">
            <NEmpty description="暂无执行状态" />
          </div>
        </NCard>

        <!-- 任务流水线 -->
        <NCard v-if="hasDecomposition" title="🔗 任务流水线" class="pipeline-card">
          <TaskPipeline
            :steps="decompositionResult?.subTasks.map((t, i) => ({
              id: t.taskId,
              agentType: t.agentType,
              description: t.title,
              status: selectedTaskIndex === null ? 'pending'
                : selectedTaskIndex === i ? 'active'
                : selectedTaskIndex > i ? 'completed' : 'pending'
            })) || []"
          />
        </NCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-orchestration-panel {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
  height: calc(100vh - 120px);
  overflow-y: auto;
}

/* 头部 */
.panel-header {
  text-align: center;
  margin-bottom: 24px;
}

.panel-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.panel-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

/* 内容布局 */
.panel-content {
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 20px;
}

@media (max-width: 1200px) {
  .panel-content {
    grid-template-columns: 1fr;
  }
}

/* 左侧面板 */
.left-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.right-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 卡片样式 */
.input-card :deep(.n-card-header),
.result-card :deep(.n-card-header),
.log-card :deep(.n-card-header),
.progress-card :deep(.n-card-header),
.status-card :deep(.n-card-header),
.pipeline-card :deep(.n-card-header) {
  padding: 12px 16px;
}

/* 子任务列表 */
.subtasks-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}

.subtask-item {
  padding: 12px;
  background: var(--n-color-card-soft);
  border-radius: 8px;
  border-left: 3px solid var(--n-color-border);
  transition: all 0.2s;
}

.subtask-item.selected {
  border-left-color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
}

.subtask-item.pending {
  opacity: 0.7;
}

.subtask-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.subtask-title {
  font-weight: 600;
  flex: 1;
}

.subtask-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.subtask-meta {
  display: flex;
  gap: 8px;
}

/* 执行计划 */
.execution-plan h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
}

/* 执行日志 */
.logs-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.log-item {
  display: flex;
  gap: 12px;
  padding: 8px;
  background: var(--n-color-card-soft);
  border-radius: 4px;
  border-left: 3px solid var(--n-color-border);
  font-size: 13px;
}

.log-time {
  color: var(--text-secondary);
  font-family: monospace;
  flex-shrink: 0;
}

.log-message {
  flex: 1;
  word-break: break-word;
}

.empty-logs,
.progress-idle,
.status-idle {
  padding: 20px;
  text-align: center;
}

/* 当前步骤 */
.current-step {
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(59, 130, 246, 0.1);
  border-radius: 4px;
  font-size: 13px;
  color: #3b82f6;
}
</style>
