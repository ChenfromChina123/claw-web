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

// 工具分类统计
const toolStats = computed(() => {
  const stats: Record<string, { count: number; success: number; error: number }> = {}
  
  for (const tool of props.toolCalls) {
    if (!stats[tool.name]) {
      stats[tool.name] = { count: 0, success: 0, error: 0 }
    }
    stats[tool.name].count++
    if (tool.status === 'completed') stats[tool.name].success++
    if (tool.status === 'error') stats[tool.name].error++
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
                <div class="message-text">{{ message.content }}</div>
              </div>
            </div>
            
            <!-- 助手消息 -->
            <div v-else-if="message.role === 'assistant'" class="message assistant-message">
              <div class="message-avatar">🤖</div>
              <div class="message-content">
                <div class="message-text" v-html="message.content.replace(/\n/g, '<br>')"></div>
              </div>
            </div>
            
            <!-- 工具调用 - 增强版 -->
            <div v-if="message.toolCalls && message.toolCalls.length > 0 && useEnhancedToolDisplay" class="tool-calls-enhanced">
              <div class="tool-section-header">
                <span class="section-icon">🔧</span>
                <span class="section-title">工具调用 ({{ message.toolCalls.length }})</span>
              </div>
              
              <ToolUseEnhanced 
                v-for="toolCall in message.toolCalls" 
                :key="toolCall.id"
                :tool-call="toolCall"
                :expanded="false"
              />
            </div>
            
            <!-- 工具调用 - 原始版 -->
            <div v-if="message.toolCalls && message.toolCalls.length > 0 && !useEnhancedToolDisplay" class="tool-calls">
              <div 
                v-for="toolCall in message.toolCalls" 
                :key="toolCall.id"
                class="tool-call"
                :class="toolCall.status"
              >
                <div class="tool-header">
                  <span class="tool-name">{{ toolCall.name }}</span>
                  <span class="tool-status">{{ toolCall.status === 'pending' ? '执行中...' : toolCall.status }}</span>
                </div>
                <div class="tool-input">
                  <pre>{{ JSON.stringify(toolCall.input, null, 2) }}</pre>
                </div>
                <div v-if="toolCall.output" class="tool-output">
                  <pre>{{ formatToolOutput(toolCall.output) }}</pre>
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
              <span class="tool-name">{{ tool.name }}</span>
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

.tool-calls-enhanced {
  margin-left: 48px;
  margin-top: 12px;
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
