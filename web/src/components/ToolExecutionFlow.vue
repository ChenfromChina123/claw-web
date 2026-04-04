<script setup lang="ts">
/**
 * 工具执行流程可视化组件
 * 
 * 使用时间线展示工具执行的完整流程：
 * - 执行开始
 * - 执行进度（流式输出）
 * - 执行完成/失败
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { 
  NTimeline, NTimelineItem, NCard, NTag, NText, NSpace, 
  NButton, NCollapseTransition, NCode, NIcon, NSpin
} from 'naive-ui'
import { h } from 'vue'
import { 
  PlayOutline, 
  CheckmarkCircleOutline, 
  CloseCircleOutline, 
  TimeOutline,
  TerminalOutline
} from '@vicons/ionicons5'

interface ExecutionStep {
  id: string
  type: 'start' | 'progress' | 'complete' | 'error'
  timestamp: number
  data: any
}

interface ActiveExecution {
  executionId: string
  toolName: string
  toolInput: Record<string, unknown>
  startTime: number
  steps: ExecutionStep[]
  status: 'running' | 'completed' | 'failed'
  duration?: number
}

// 状态
const executions = ref<Map<string, ActiveExecution>>(new Map())
const maxExecutions = ref(10) // 最多显示多少个执行记录

// 计算执行列表
const executionList = computed(() => {
  return Array.from(executions.value.values()).sort((a, b) => {
    return b.startTime - a.startTime
  }).slice(0, maxExecutions.value)
})

// 格式化时间
const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString()
}

// 格式化相对时间
const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now()
  const diff = now - timestamp
  if (diff < 1000) return '刚刚'
  if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  return `${Math.floor(diff / 3600000)}小时前`
}

// 格式化持续时间
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// 获取步骤图标
const getStepIcon = (type: string) => {
  switch (type) {
    case 'start':
      return PlayOutline
    case 'progress':
      return TerminalOutline
    case 'complete':
      return CheckmarkCircleOutline
    case 'error':
      return CloseCircleOutline
    default:
      return TimeOutline
  }
}

// 获取步骤颜色
const getStepColor = (type: string): 'info' | 'success' | 'error' | 'default' => {
  switch (type) {
    case 'start':
      return 'info'
    case 'progress':
      return 'default'
    case 'complete':
      return 'success'
    case 'error':
      return 'error'
    default:
      return 'default'
  }
}

// 获取步骤标题
const getStepTitle = (type: string): string => {
  switch (type) {
    case 'start':
      return '开始执行'
    case 'progress':
      return '执行中'
    case 'complete':
      return '执行完成'
    case 'error':
      return '执行失败'
    default:
      return '未知'
  }
}



// 清除执行记录
const clearExecution = (executionId: string) => {
  executions.value.delete(executionId)
}

// 清除所有已完成/失败的执行
const clearCompleted = () => {
  for (const [id, execution] of executions.value.entries()) {
    if (execution.status !== 'running') {
      executions.value.delete(id)
    }
  }
}

// 生命周期
onMounted(() => {
  // TODO: 监听 WebSocket 事件
})

onUnmounted(() => {
  // 清理事件监听
})
</script>

<template>
  <div class="tool-execution-flow">
    <div class="flow-header">
      <h4>工具执行流程</h4>
      <NSpace>
        <NButton size="small" @click="clearCompleted">
          清除已完成
        </NButton>
      </NSpace>
    </div>

    <div v-if="executionList.length === 0" class="empty-state">
      <NText depth="3">暂无工具执行记录</NText>
    </div>

    <div v-else class="execution-list">
      <NCard 
        v-for="execution in executionList" 
        :key="execution.executionId"
        size="small"
        :class="['execution-item', `status-${execution.status}`]"
      >
        <template #header>
          <NSpace justify="space-between" align="center" style="width: 100%">
            <div class="execution-title">
              <NTag :type="execution.status === 'running' ? 'info' : execution.status === 'completed' ? 'success' : 'error'" size="small">
                {{ execution.toolName }}
              </NTag>
              <NTag v-if="execution.status === 'running'" type="info" size="small">
                <NSpin size="small" />
                执行中
              </NTag>
              <NText depth="3" style="font-size: 12px">
                {{ formatRelativeTime(execution.startTime) }}
              </NText>
            </div>
            <NSpace v-if="execution.duration">
              <NText depth="3" style="font-size: 12px">
                耗时：{{ formatDuration(execution.duration) }}
              </NText>
              <NButton size="tiny" @click="clearExecution(execution.executionId)">
                关闭
              </NButton>
            </NSpace>
          </NSpace>
        </template>

        <NTimeline>
          <NTimelineItem 
            v-for="step in execution.steps" 
            :key="step.id"
            :type="getStepColor(step.type)"
            :icon="() => h(NIcon, { component: getStepIcon(step.type) })"
            :title="getStepTitle(step.type)"
            :time="formatTime(step.timestamp)"
          >
            <NCollapseTransition :collapsed="step.type === 'progress' && execution.status === 'running'">
              <div class="step-content">
                <!-- 开始步骤显示输入参数 -->
                <template v-if="step.type === 'start'">
                  <NCode 
                    v-if="execution.toolInput && Object.keys(execution.toolInput).length > 0"
                    :code="JSON.stringify(execution.toolInput, null, 2)"
                    language="json"
                    word-wrap
                  />
                </template>
                
                <!-- 进度步骤显示输出 -->
                <template v-else-if="step.type === 'progress'">
                  <NText depth="2">{{ step.data.output || '执行中...' }}</NText>
                </template>
                
                <!-- 完成步骤显示结果 -->
                <template v-else-if="step.type === 'complete'">
                  <NCode 
                    v-if="step.data.result"
                    :code="JSON.stringify(step.data.result, null, 2)"
                    language="json"
                    word-wrap
                  />
                </template>
                
                <!-- 失败步骤显示错误 -->
                <template v-else-if="step.type === 'error'">
                  <NText depth="1" style="color: #d03050">
                    {{ step.data.error?.message || step.data.error }}
                  </NText>
                </template>
              </div>
            </NCollapseTransition>
          </NTimelineItem>
        </NTimeline>
      </NCard>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tool-execution-flow {
  padding: 16px;
  
  .flow-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    
    h4 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
  }
  
  .empty-state {
    padding: 40px 0;
    text-align: center;
  }
  
  .execution-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    
    .execution-item {
      &.status-running {
        border-left: 3px solid #2080f0;
      }
      
      &.status-completed {
        border-left: 3px solid #18a058;
      }
      
      &.status-failed {
        border-left: 3px solid #d03050;
      }
      
      .execution-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .step-content {
        margin-top: 8px;
        
        :deep(.n-code) {
          max-height: 200px;
          overflow-y: auto;
        }
      }
    }
  }
}


</style>
