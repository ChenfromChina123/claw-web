<script setup lang="ts">
/**
 * 增强版消息列表组件 - 集成流程和知识可视化
 */
import { ref, watch, nextTick, computed } from 'vue'
import { NScrollbar, NSpin, NTag, NSwitch, NTooltip } from 'naive-ui'
import type { Message, ToolCall } from '@/types'
import type { FlowGraph, KnowledgeCard } from '@/types/flowKnowledge'
import { parseToolCalls } from '@/utils/toolParser'
import FlowVisualizer from './FlowVisualizer.vue'
import KnowledgeCardComponent from './KnowledgeCard.vue'
import ToolUseEnhanced from './ToolUseEnhanced.vue'
import ToolResultEnhanced from './ToolResultEnhanced.vue'

const props = defineProps<{
  messages: Message[]
  toolCalls: ToolCall[]
  isLoading: boolean
}>()

const scrollbarRef = ref<InstanceType<typeof NScrollbar> | null>(null)

// 流程知识展示开关
const showFlowVisualization = ref(true)
const showKnowledgeCards = ref(true)
const useEnhancedToolDisplay = ref(true)

// 监听消息变化，自动滚动到底部
watch(() => props.messages.length, async () => {
  await nextTick()
  scrollToBottom()
})

watch(() => props.isLoading, async (loading) => {
  if (loading) {
    await nextTick()
    scrollToBottom()
  }
})

function scrollToBottom() {
  scrollbarRef.value?.scrollTo({ top: 1000000, behavior: 'smooth' })
}

// 格式化工具输出
function formatToolOutput(output: unknown): string {
  if (!output) return ''
  if (typeof output === 'string') return output
  return JSON.stringify(output, null, 2)
}

// 获取当前正在进行的工具调用
const activeToolCalls = computed(() => {
  return props.toolCalls.filter(tc => tc.status === 'pending' || tc.status === 'executing')
})

// 获取已完成的工具调用
const completedToolCalls = computed(() => {
  return props.toolCalls.filter(tc => tc.status === 'completed' || tc.status === 'error')
})

// 解析工具调用序列，生成流程图和知识
const { flowGraph, knowledge } = computed(() => {
  if (props.toolCalls.length === 0) {
    return { flowGraph: null, knowledge: [] as KnowledgeCard[] }
  }
  
  const result = parseToolCalls(props.toolCalls)
  return {
    flowGraph: result.flowGraph,
    knowledge: result.knowledge
  }
}).value

// 当前激活的步骤（手风琴效果）
const activeStep = ref<string | null>(null)

// 工具统计
const toolStats = computed(() => {
  const stats: Record<string, { count: number; success: number; error: number }> = {}
  
  for (const tool of props.toolCalls) {
    if (!stats[tool.toolName]) {
      stats[tool.toolName] = { count: 0, success: 0, error: 0 }
    }
    stats[tool.toolName].count++
    if (tool.status === 'completed') stats[tool.toolName].success++
    if (tool.status === 'error') stats[tool.toolName].error++
  }
  
  return stats
})

// 获取统计摘要
const statsSummary = computed(() => {
  const total = props.toolCalls.length
  const completed = completedToolCalls.value.length
  const errors = props.toolCalls.filter(t => t.status === 'error').length
  
  return { total, completed, errors }
})

/**
 * 根据工具名称返回对应的图标
 * @param toolName - 工具名称
 * @returns 工具图标 emoji
 */
function getToolIcon(toolName: string): string {
  const iconMap: Record<string, string> = {
    FileRead: '📄',
    FileList: '📂',
    Bash: '🐚',
    Shell: '🐚',
    Search: '🔍',
    Grep: '🔍',
    Edit: '📝',
    Write: '✍️',
    Delete: '🗑️',
    Git: '🔀'
  }
  return iconMap[toolName] || '🔧'
}

/**
 * 根据工具调用状态返回标签类型
 * @param status - 工具调用状态
 * @returns naivue-ui NTag 组件的 type 属性值
 */
function getStatusType(status: string): string {
  const statusTypeMap: Record<string, string> = {
    completed: 'success',
    error: 'error',
    executing: 'warning',
    pending: 'info'
  }
  return statusTypeMap[status] || 'default'
}

/**
 * 生成工具调用的智能摘要
 * @param toolCall - 工具调用对象
 * @returns 摘要文本
 */
function getShortSummary(toolCall: ToolCall): string {
  switch (toolCall.toolName) {
    case 'FileRead':
      const readPath = (toolCall.toolInput as any)?.path || '未知文件'
      return `读取文件：${readPath}`
    case 'FileList':
      const listPath = (toolCall.toolInput as any)?.path || '未知目录'
      return `浏览目录：${listPath}`
    case 'Bash':
    case 'Shell':
      const command = (toolCall.toolInput as any)?.command || ''
      const shortCmd = command.length > 50 ? command.substring(0, 50) + '...' : command
      return `执行命令：${shortCmd}`
    default:
      return '点击查看详情'
  }
}

/**
 * 处理步骤点击事件，实现手风琴效果
 * @param toolCallId - 工具调用 ID
 */
function handleStepClick(toolCallId: string) {
  if (activeStep.value === toolCallId) {
    activeStep.value = null
  } else {
    activeStep.value = toolCallId
  }
}
</script>

<template>
  <div class="message-list-wrapper">
    <!-- 流程知识工具栏 -->
    <div v-if="toolCalls.length > 0" class="visualization-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-icon">📊</span>
        <span class="toolbar-title">流程知识</span>
        <NTag size="small" type="info">{{ statsSummary.total }} 个工具</NTag>
        <NTag v-if="statsSummary.errors > 0" size="small" type="error">
          {{ statsSummary.errors }} 错误
        </NTag>
      </div>
      <div class="toolbar-right">
        <div class="toolbar-toggle">
          <span class="toggle-label">流程图</span>
          <NSwitch v-model:value="showFlowVisualization" size="small" />
        </div>
        <div class="toolbar-toggle">
          <span class="toggle-label">知识卡片</span>
          <NSwitch v-model:value="showKnowledgeCards" size="small" />
        </div>
        <div class="toolbar-toggle">
          <span class="toggle-label">增强展示</span>
          <NSwitch v-model:value="useEnhancedToolDisplay" size="small" />
        </div>
      </div>
    </div>
    
    <!-- 主消息列表 -->
    <div class="message-list">
      <NScrollbar ref="scrollbarRef" class="scrollbar">
        <div class="messages-container">
          <!-- 欢迎消息 -->
          <div v-if="messages.length === 0 && !isLoading" class="welcome">
            <h2>欢迎使用 Claude Code</h2>
            <p>我是您的 AI 助手，可以帮助您完成各种任务。</p>
            <div class="welcome-features">
              <div class="feature">
                <span class="feature-icon">💻</span>
                <span>编写和调试代码</span>
              </div>
              <div class="feature">
                <span class="feature-icon">📁</span>
                <span>文件管理和搜索</span>
              </div>
              <div class="feature">
                <span class="feature-icon">🔧</span>
                <span>执行 Shell 命令</span>
              </div>
              <div class="feature">
                <span class="feature-icon">🌐</span>
                <span>网络搜索和信息查询</span>
              </div>
            </div>
            <p class="welcome-hint">输入您的问题开始对话</p>
          </div>
          
          <!-- 消息列表 -->
          <div v-for="(message, index) in messages" :key="message.id || index" class="message-wrapper">
            <!-- 用户消息 -->
            <div v-if="message.role === 'user'" class="message user-message">
              <div class="message-avatar">👤</div>
              <div class="message-content">
                <div class="message-text">{{ (message as any).content }}</div>
              </div>
            </div>
            
            <!-- 助手消息 -->
            <div v-else-if="message.role === 'assistant'" class="message assistant-message">
              <div class="message-avatar">🤖</div>
              <div class="message-content">
                <div class="message-text" v-html="(message as any).content.replace(/\n/g, '<br>')"></div>
              </div>
            </div>
            
            <!-- 工具调用 - 步骤化增强版 -->
            <div v-if="props.toolCalls && props.toolCalls.length > 0 && useEnhancedToolDisplay" class="tool-sequence-container">
              <div class="tool-section-header">
                <span class="section-icon">🔧</span>
                <span class="section-title">工具调用 ({{ props.toolCalls.length }})</span>
              </div>
              
              <!-- 引导线 -->
              <div class="sequence-line"></div>
              
              <!-- 工具步骤列表 -->
              <div 
                v-for="(toolCall, idx) in props.toolCalls" 
                :key="toolCall.id"
                class="tool-step-item"
                :class="[toolCall.status, { 'is-active': activeStep === toolCall.id }]"
              >
                <!-- 步骤序号徽章 -->
                <div class="step-badge">{{ idx + 1 }}</div>
                
                <!-- 步骤卡片 -->
                <div class="step-card">
                  <!-- 步骤头部 -->
                  <div class="step-header" @click="handleStepClick(toolCall.id)">
                    <div class="step-header-left">
                      <span class="step-tool-icon">{{ getToolIcon(toolCall.toolName) }}</span>
                      <span class="step-tool-name">{{ toolCall.toolName }}</span>
                    </div>
                    <div class="step-header-right">
                      <NTooltip>
                        <template #trigger>
                          <NTag size="small" :type="getStatusType(toolCall.status) as any">
                            {{ toolCall.status === 'pending' ? '等待中' : toolCall.status === 'executing' ? '执行中' : toolCall.status === 'completed' ? '完成' : '错误' }}
                          </NTag>
                        </template>
                        {{ toolCall.status }}
                      </NTooltip>
                    </div>
                  </div>
                  
                  <!-- 展开内容：显示详细工具调用组件 -->
                  <div v-if="activeStep === toolCall.id" class="step-content">
                    <ToolUseEnhanced 
                      :tool-call="toolCall"
                      :expanded="true"
                    />
                  </div>
                  
                  <!-- 收起内容：显示智能摘要 -->
                  <div v-else class="step-summary">
                    {{ getShortSummary(toolCall) }}
                    <span class="summary-hint">（点击展开）</span>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 工具调用 - 原始版 -->
            <div v-if="props.toolCalls && props.toolCalls.length > 0 && !useEnhancedToolDisplay" class="tool-calls">
              <div 
                v-for="toolCall in props.toolCalls" 
                :key="toolCall.id"
                class="tool-call"
                :class="toolCall.status"
              >
                <div class="tool-header">
                  <span class="tool-name">{{ toolCall.toolName }}</span>
                  <span class="tool-status">{{ toolCall.status === 'pending' ? '执行中...' : toolCall.status }}</span>
                </div>
                <div class="tool-input">
                  <pre>{{ JSON.stringify(toolCall.toolInput, null, 2) }}</pre>
                </div>
                <div v-if="toolCall.toolOutput" class="tool-output">
                  <pre>{{ formatToolOutput(toolCall.toolOutput) }}</pre>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 加载状态 -->
          <div v-if="isLoading" class="message-wrapper">
            <div class="message assistant-message">
              <div class="message-avatar">🤖</div>
              <div class="message-content">
                <NSpin size="small" />
              </div>
            </div>
          </div>
          
          <!-- 活动工具调用 -->
          <div v-if="activeToolCalls.length > 0" class="active-tools">
            <div v-for="tool in activeToolCalls" :key="tool.id" class="tool-call active">
              <span class="tool-name">{{ tool.toolName }}</span>
              <NSpin size="small" />
            </div>
          </div>
          
          <!-- 流程可视化区域 -->
          <div v-if="showFlowVisualization && flowGraph && flowGraph.nodes.length > 2" class="flow-section">
            <FlowVisualizer :flow-graph="flowGraph" :expanded="false" />
          </div>
          
          <!-- 知识卡片区域 -->
          <div v-if="showKnowledgeCards && knowledge.length > 0" class="knowledge-section">
            <div class="section-header">
              <span class="section-icon">💡</span>
              <span class="section-title">提取的知识 ({{ knowledge.length }})</span>
            </div>
            <div class="knowledge-list">
              <KnowledgeCardComponent 
                v-for="card in knowledge.slice(0, 10)" 
                :key="card.id"
                :card="card"
                :compact="true"
                :show-source="true"
              />
              <div v-if="knowledge.length > 10" class="more-knowledge">
                还有 {{ knowledge.length - 10 }} 条知识...
              </div>
            </div>
          </div>
          
          <!-- 工具统计 -->
          <div v-if="toolCalls.length > 0" class="stats-section">
            <div class="section-header">
              <span class="section-icon">📈</span>
              <span class="section-title">工具使用统计</span>
            </div>
            <div class="stats-grid">
              <div 
                v-for="(stat, toolName) in toolStats" 
                :key="toolName"
                class="stat-card"
              >
                <div class="stat-name">{{ toolName }}</div>
                <div class="stat-bar">
                  <div 
                    class="stat-fill success" 
                    :style="{ width: `${(stat.success / stat.count) * 100}%` }"
                  ></div>
                  <div 
                    class="stat-fill error" 
                    :style="{ width: `${(stat.error / stat.count) * 100}%` }"
                  ></div>
                </div>
                <div class="stat-count">
                  {{ stat.count }} 次
                  <span v-if="stat.error > 0" class="error-count">({{ stat.error }} 失败)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </NScrollbar>
    </div>
  </div>
</template>

<style scoped>
.message-list-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 工具栏 */
.visualization-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: rgba(30, 30, 60, 0.5);
  border-bottom: 1px solid rgba(99, 102, 241, 0.15);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-icon {
  font-size: 16px;
}

.toolbar-title {
  font-weight: 600;
  font-size: 14px;
  color: #e5e7eb;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.toolbar-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toggle-label {
  font-size: 12px;
  color: #9ca3af;
}

/* 消息列表 */
.message-list {
  flex: 1;
  overflow: hidden;
}

.scrollbar {
  height: 100%;
}

.messages-container {
  padding: 20px;
  max-width: 900px;
  margin: 0 auto;
}

.welcome {
  text-align: center;
  padding: 60px 20px;
}

.welcome h2 {
  font-size: 28px;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.welcome p {
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.welcome-features {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  max-width: 500px;
  margin: 0 auto 24px;
}

.feature {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.feature-icon {
  font-size: 24px;
}

.welcome-hint {
  color: var(--primary-color);
  font-size: 14px;
}

.message-wrapper {
  margin-bottom: 24px;
}

.message {
  display: flex;
  gap: 12px;
  animation: fadeIn 0.3s ease-out;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.user-message .message-avatar {
  background: var(--primary-color);
}

.assistant-message .message-avatar {
  background: var(--bg-tertiary);
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-text {
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.user-message .message-text {
  background: var(--primary-color);
  color: white;
}

.assistant-message .message-text {
  background: var(--bg-secondary);
}

/* 工具调用区域 */
.tool-calls {
  margin-left: 48px;
  margin-top: 12px;
}

/* 工具调用步骤化容器 */
.tool-sequence-container {
  margin-left: 48px;
  margin-top: 12px;
  position: relative;
  padding-left: 20px;
}

/* 引导线 */
.sequence-line {
  position: absolute;
  left: 24px;
  top: 30px;
  bottom: 20px;
  width: 2px;
  background: linear-gradient(to bottom, rgba(99, 102, 241, 0.4), rgba(99, 102, 241, 0.1));
  border-radius: 2px;
}

/* 工具步骤项 */
.tool-step-item {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  position: relative;
  align-items: flex-start;
  transition: all 0.3s ease;
}

.tool-step-item:hover {
  transform: translateX(4px);
}

/* 步骤序号徽章 */
.step-badge {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  z-index: 1;
  transition: all 0.3s ease;
}

/* 不同状态下的徽章颜色 */
.tool-step-item.completed .step-badge {
  background: linear-gradient(135deg, #22c55e, #10b981);
}

.tool-step-item.error .step-badge {
  background: linear-gradient(135deg, #ef4444, #dc2626);
}

.tool-step-item.executing .step-badge,
.tool-step-item.pending .step-badge {
  background: linear-gradient(135deg, #f59e0b, #d97706);
}

.tool-step-item.is-active .step-badge {
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.3);
  transform: scale(1.1);
}

/* 步骤卡片 */
.step-card {
  flex: 1;
  background: rgba(40, 40, 80, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.2);
  overflow: hidden;
  transition: all 0.3s ease;
}

.step-card:hover {
  border-color: rgba(99, 102, 241, 0.4);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.15);
}

/* 激活状态的步骤卡片 */
.tool-step-item.is-active .step-card {
  border-color: rgba(99, 102, 241, 0.6);
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.3);
  background: rgba(40, 40, 80, 0.8);
}

/* 步骤头部 */
.step-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  background: rgba(30, 30, 60, 0.3);
  transition: background 0.2s ease;
}

.step-header:hover {
  background: rgba(30, 30, 60, 0.5);
}

.step-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.step-tool-icon {
  font-size: 18px;
  line-height: 1;
}

.step-tool-name {
  font-size: 14px;
  font-weight: 600;
  color: #e5e7eb;
  font-family: 'Monaco', 'Menlo', monospace;
}

.step-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 步骤内容区域 */
.step-content {
  padding: 16px;
  border-top: 1px solid rgba(99, 102, 241, 0.15);
  background: rgba(20, 20, 40, 0.3);
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 步骤摘要 */
.step-summary {
  padding: 12px 16px;
  color: #9ca3af;
  font-size: 13px;
  line-height: 1.6;
}

.summary-hint {
  color: #6b7280;
  font-size: 12px;
  margin-left: 4px;
}

.tool-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(99, 102, 241, 0.1);
  border-radius: 8px;
}

.section-icon {
  font-size: 16px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #a5b4fc;
}

.tool-call {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  border-left: 3px solid var(--border-color);
}

.tool-call.pending {
  border-left-color: var(--warning-color);
}

.tool-call.completed {
  border-left-color: var(--success-color);
}

.tool-call.error {
  border-left-color: var(--error-color);
}

.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.tool-name {
  font-weight: 600;
  color: var(--primary-color);
}

.tool-status {
  font-size: 12px;
  color: var(--text-secondary);
}

.tool-input,
.tool-output {
  background: var(--bg-tertiary);
  border-radius: 4px;
  padding: 8px;
  margin-top: 8px;
  overflow-x: auto;
}

.tool-output {
  border-top: 1px solid var(--border-color);
}

.tool-input pre,
.tool-output pre {
  margin: 0;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.active-tools {
  display: flex;
  gap: 8px;
  margin-left: 48px;
  margin-top: 12px;
}

.tool-call.active {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: 20px;
  font-size: 13px;
}

/* 流程区域 */
.flow-section {
  margin-top: 20px;
}

/* 知识区域 */
.knowledge-section {
  margin-top: 20px;
  padding: 16px;
  background: rgba(30, 30, 60, 0.4);
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.15);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #e5e7eb;
}

.knowledge-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.more-knowledge {
  text-align: center;
  padding: 10px;
  color: #6b7280;
  font-size: 12px;
}

/* 统计区域 */
.stats-section {
  margin-top: 20px;
  padding: 16px;
  background: rgba(30, 30, 60, 0.4);
  border-radius: 12px;
  border: 1px solid rgba(99, 102, 241, 0.15);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.stat-card {
  background: rgba(40, 40, 80, 0.5);
  border-radius: 8px;
  padding: 12px;
}

.stat-name {
  font-weight: 600;
  font-size: 13px;
  color: #e5e7eb;
  margin-bottom: 8px;
  font-family: 'Monaco', 'Menlo', monospace;
}

.stat-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  overflow: hidden;
  display: flex;
  margin-bottom: 6px;
}

.stat-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.stat-fill.success {
  background: #22c55e;
}

.stat-fill.error {
  background: #ef4444;
}

.stat-count {
  font-size: 11px;
  color: #9ca3af;
}

.error-count {
  color: #ef4444;
}

/* 动画 */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
