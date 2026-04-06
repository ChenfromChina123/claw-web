<script setup lang="ts">
/**
 * Agent 协调演示组件
 * 
 * 展示多 Agent 协调功能的演示界面
 */
import { ref, onMounted } from 'vue'
import type { 
  MultiAgentOrchestrationState,
  AgentTaskStep
} from '@/types/agent'
import { AgentType } from '@/types/agent'
import {
  createInitialOrchestrationState,
  createAgentRuntimeState,
  getAgentDefinition
} from '@/types/agent'
import AgentBadge from './AgentBadge.vue'
import TaskPipeline from './TaskPipeline.vue'
import AgentStatusPanel from './AgentStatusPanel.vue'

/**
 * 演示状态
 */
const orchestrationState = ref<MultiAgentOrchestrationState>(createInitialOrchestrationState())

/**
 * 是否正在演示
 */
const isDemoing = ref(false)

/**
 * 初始化演示状态
 */
function initDemoState(): void {
  const now = new Date()
  
  // 创建协调者
  const orchestratorDef = getAgentDefinition(AgentType.GENERAL_PURPOSE)!
  const orchestrator = createAgentRuntimeState(orchestratorDef)
  orchestrator.status = 'thinking'
  orchestrator.currentTask = '分析任务需求，规划执行步骤'
  orchestrator.progress = 10

  // 创建子 Agent
  const exploreAgentDef = getAgentDefinition(AgentType.EXPLORE)!
  const exploreAgent = createAgentRuntimeState(exploreAgentDef)
  exploreAgent.status = 'idle'
  exploreAgent.totalTasks = 2

  const planAgentDef = getAgentDefinition(AgentType.PLAN)!
  const planAgent = createAgentRuntimeState(planAgentDef)
  planAgent.status = 'idle'
  planAgent.totalTasks = 1

  // 创建任务步骤
  const taskSteps: AgentTaskStep[] = [
    {
      id: 'step-1',
      agentType: AgentType.GENERAL_PURPOSE,
      description: '分析任务需求，理解用户意图',
      status: 'active',
      startTime: now
    },
    {
      id: 'step-2',
      agentType: AgentType.EXPLORE,
      description: '探索代码库结构，定位相关文件',
      status: 'pending'
    },
    {
      id: 'step-3',
      agentType: AgentType.EXPLORE,
      description: '读取关键文件，了解现有实现',
      status: 'pending'
    },
    {
      id: 'step-4',
      agentType: AgentType.PLAN,
      description: '制定实施方案，设计代码结构',
      status: 'pending'
    },
    {
      id: 'step-5',
      agentType: AgentType.GENERAL_PURPOSE,
      description: '执行方案，完成代码修改',
      status: 'pending'
    }
  ]

  orchestrationState.value = {
    orchestrator,
    subAgents: [exploreAgent, planAgent],
    taskSteps,
    overallStatus: 'planning',
    startTime: now
  }
}

/**
 * 开始演示
 */
async function startDemo(): Promise<void> {
  if (isDemoing.value) return
  isDemoing.value = true
  
  initDemoState()
  
  // 模拟执行过程
  await simulateExecution()
  
  isDemoing.value = false
}

/**
 * 模拟执行过程
 */
async function simulateExecution(): Promise<void> {
  const steps = orchestrationState.value.taskSteps
  const subAgents = orchestrationState.value.subAgents
  const orchestrator = orchestrationState.value.orchestrator
  
  if (!orchestrator) return

  // 步骤 1: 协调者分析需求
  await delay(1500)
  steps[0].status = 'completed'
  steps[0].completedTime = new Date()
  orchestrator.progress = 20
  orchestrator.currentTask = '任务分析完成，启动探索 Agent'
  
  // 步骤 2: 探索 Agent 开始工作
  await delay(500)
  steps[1].status = 'active'
  steps[1].startTime = new Date()
  subAgents[0].status = 'working'
  subAgents[0].currentTask = '探索代码库结构'
  subAgents[0].progress = 30
  
  await delay(1200)
  steps[1].status = 'completed'
  steps[1].completedTime = new Date()
  subAgents[0].completedTasks = 1
  subAgents[0].progress = 50
  orchestrator.progress = 40
  
  // 步骤 3: 探索 Agent 继续工作
  await delay(500)
  steps[2].status = 'active'
  steps[2].startTime = new Date()
  subAgents[0].currentTask = '读取关键文件'
  subAgents[0].progress = 60
  
  await delay(1500)
  steps[2].status = 'completed'
  steps[2].completedTime = new Date()
  subAgents[0].completedTasks = 2
  subAgents[0].status = 'completed'
  subAgents[0].progress = 100
  orchestrator.progress = 60
  orchestrator.currentTask = '探索完成，启动规划 Agent'
  
  // 步骤 4: 规划 Agent 工作
  await delay(500)
  steps[3].status = 'active'
  steps[3].startTime = new Date()
  subAgents[1].status = 'working'
  subAgents[1].currentTask = '制定实施方案'
  subAgents[1].progress = 40
  
  await delay(1800)
  steps[3].status = 'completed'
  steps[3].completedTime = new Date()
  subAgents[1].completedTasks = 1
  subAgents[1].status = 'completed'
  subAgents[1].progress = 100
  orchestrator.progress = 80
  orchestrator.currentTask = '规划完成，开始执行'
  
  // 步骤 5: 协调者执行
  await delay(500)
  steps[4].status = 'active'
  steps[4].startTime = new Date()
  orchestrator.status = 'working'
  orchestrator.currentTask = '执行代码修改'
  orchestrator.progress = 90
  
  await delay(2000)
  steps[4].status = 'completed'
  steps[4].completedTime = new Date()
  orchestrator.status = 'completed'
  orchestrator.progress = 100
  orchestrator.completedTasks = 3
  
  // 完成
  orchestrationState.value.overallStatus = 'completed'
  orchestrationState.value.completedTime = new Date()
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// 初始化
onMounted(() => {
  initDemoState()
})
</script>

<template>
  <div class="agent-orchestration-demo">
    <div class="demo-header">
      <h2 class="demo-title">🤝 多 Agent 协调演示</h2>
      <p class="demo-desc">
        展示通用 Agent、探索 Agent、规划 Agent 如何协作完成复杂任务
      </p>
      <button 
        class="demo-btn"
        :class="{ disabled: isDemoing }"
        @click="startDemo"
        :disabled="isDemoing"
      >
        {{ isDemoing ? '演示中...' : '开始演示' }}
      </button>
    </div>

    <div class="demo-content">
      <!-- 左侧：聊天演示区 -->
      <div class="chat-demo">
        <div class="chat-demo-header">
          <span class="demo-label">💬 对话演示</span>
        </div>

        <!-- 模拟用户消息 -->
        <div class="demo-message user-message">
          <div class="message-inner">
            <div class="avatar">👤</div>
            <div class="message-content">
              帮我分析一下这个项目的结构，然后规划一个功能改进方案。
            </div>
          </div>
        </div>

        <!-- 模拟 AI 回复 -->
        <div class="demo-message assistant-message">
          <div class="message-inner">
            <div class="avatar">🤖</div>
            <div class="message-content">
              <!-- Agent 标签 -->
              <div class="message-agent-badge">
                <AgentBadge 
                  :agent-type="AgentType.GENERAL_PURPOSE"
                  :show-status="true"
                  status="working"
                />
              </div>

              <!-- 任务流水线 -->
              <TaskPipeline 
                :steps="orchestrationState.taskSteps"
                :collapsed="false"
              />

              <!-- 回复内容 -->
              <div class="message-text">
                好的！我来帮你分析这个项目并制定改进方案。我会调动多个 Agent 来协作完成这个任务。
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：Agent 状态面板 -->
      <div class="status-panel-demo">
        <div class="status-panel-header">
          <span class="demo-label">📊 实时状态</span>
        </div>
        <AgentStatusPanel 
          :orchestration-state="orchestrationState"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-orchestration-demo {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

/* 演示头部 */
.demo-header {
  text-align: center;
  margin-bottom: 32px;
}

.demo-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.demo-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 16px 0;
}

.demo-btn {
  padding: 10px 24px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms) ease;
}

.demo-btn:hover:not(.disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.demo-btn.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 演示内容 */
.demo-content {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 24px;
}

@media (max-width: 1024px) {
  .demo-content {
    grid-template-columns: 1fr;
  }
}

/* 聊天演示区 */
.chat-demo {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
}

.chat-demo-header,
.status-panel-header {
  padding: 12px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.demo-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

/* 演示消息 */
.demo-message {
  padding: 16px;
}

.message-inner {
  display: flex;
  gap: 12px;
  max-width: 700px;
}

.user-message .message-inner {
  flex-direction: row-reverse;
  margin-left: auto;
}

.avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.user-message .avatar {
  background: rgba(99, 102, 241, 0.2);
}

.assistant-message .avatar {
  background: rgba(34, 197, 94, 0.15);
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-agent-badge {
  margin-bottom: 12px;
}

.message-text {
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  margin-top: 12px;
}

.user-message .message-content {
  text-align: right;
}

.user-message .message-text {
  display: inline-block;
  padding: 12px 16px;
  background: rgba(99, 102, 241, 0.2);
  border-radius: 12px 12px 4px 12px;
}

/* 状态面板演示区 */
.status-panel-demo {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
}
</style>
