<script setup lang="ts">
/**
 * 增强版消息列表组件 - 集成流程和知识可视化，支持 Agent 中断功能
 */
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import { NScrollbar, NSpin, NTag, NSwitch, NTooltip, NModal, NCode, NButton, NIcon, useMessage } from 'naive-ui'
import type { Message, ToolCall } from '@/types'
import type { KnowledgeCard } from '@/types/flowKnowledge'
import type { AgentTaskStep } from '@/types/agent'
import { parseToolCalls } from '@/utils/toolParser'
import { useSettingsStore } from '@/stores/settings'
import FlowVisualizer from './FlowVisualizer.vue'
import KnowledgeCardComponent from './KnowledgeCard.vue'
import ToolUseEnhanced from './ToolUseEnhanced.vue'
import TaskPipeline from './TaskPipeline.vue'
import FileWriteToolInline from './FileWriteToolInline.vue'
import FileOutputCard from './FileOutputCard.vue'
import { StopCircleOutline } from '@vicons/ionicons5'
import { interruptAgent } from '@/api/agentApi'

const props = defineProps<{
  messages: Message[]
  toolCalls: ToolCall[]
  isLoading: boolean
  agentTaskSteps?: AgentTaskStep[]
  /** 当前活跃的 Agent ID（用于中断） */
  currentAgentId?: string
}>()

/**
 * 定义事件
 */
const emit = defineEmits<{
  interrupt: [agentId: string]
}>()

const scrollbarRef = ref<InstanceType<typeof NScrollbar> | null>(null)
const settingsStore = useSettingsStore()
const message = useMessage()
/** 中断按钮加载状态 */
const isInterrupting = ref(false)

/** Agent 输出的文件列表（用于展示 FileOutputCard） */
const agentOutputFiles = ref<Array<{
  id: string
  messageId: string
  fileName: string
  filePath: string
  content: string
  mimeType?: string
  size?: number
  description?: string
}>>([])

/** 文件预览弹窗状态 */
const filePreviewModal = ref<{
  show: boolean
  fileName: string
  content: string
  filePath: string
}>({
  show: false,
  fileName: '',
  content: '',
  filePath: '',
})

// 流程知识展示开关 - 从设置 store 读取
const showFlowVisualization = computed(() => settingsStore.preferences.showFlowVisualization)
const showKnowledgeCards = computed(() => settingsStore.preferences.showKnowledgeCards)
const useEnhancedToolDisplay = computed(() => settingsStore.preferences.useEnhancedToolDisplay)

/**
 * 滚动到底部
 */
function scrollToBottom() {
  scrollbarRef.value?.scrollTo({ top: 1000000, behavior: 'smooth' })
}

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

// 组件挂载时滚动到底部（确保刷新和切换会话时生效）
onMounted(async () => {
  await nextTick()
  scrollToBottom()
})

// 格式化工具输出
function formatToolOutput(output: unknown): string {
  if (output === null || output === undefined) return '无结果'
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output)
      return JSON.stringify(parsed, null, 2)
    } catch {
      return output
    }
  }
  if (typeof output === 'object') {
    return JSON.stringify(output, null, 2)
  }
  return String(output)
}

// 获取当前正在进行的工具调用
const activeToolCalls = computed(() => {
  return props.toolCalls.filter(tc => tc.status === 'pending' || tc.status === 'executing')
})

// 获取已完成的工具调用
const completedToolCalls = computed(() => {
  return props.toolCalls.filter(tc => tc.status === 'completed' || tc.status === 'error')
})

/**
 * Store 在 message_start 时已推入 assistant 占位消息，流式内容由同一条气泡展示。
 * 若仍用 isLoading 再画一整行「助手 + 转圈」，会出现第二个头像（与截图一致的多余图标）。
 */
const showStandaloneLoadingRow = computed(() => {
  if (!props.isLoading) return false
  const last = props.messages[props.messages.length - 1]
  if (last?.role === 'assistant') return false
  return true
})

/**
 * 判断工具调用是否为 FileWrite（文件写入）类型
 * @param toolCall - 工具调用对象
 * @returns 是否为文件写入工具
 */
function isFileWriteTool(toolCall: ToolCall): boolean {
  const name = toolCall.toolName.toLowerCase()
  return name === 'filewrite' || name === 'file_write' || name === 'write'
}

/**
 * 判断消息是否包含 Agent 输出的文件
 * @param messageId - 消息 ID
 * @returns 该消息关联的输出文件列表
 */
function getOutputFilesForMessage(messageId: string): typeof agentOutputFiles.value {
  return agentOutputFiles.value.filter(f => f.messageId === messageId)
}

/**
 * 处理查看文件事件
 * @param filePath - 文件路径
 * @param content - 文件内容
 */
function handleViewFile(filePath: string, content: string): void {
  const fileName = filePath.replace(/\\/g, '/').split('/').pop() || filePath
  filePreviewModal.value = {
    show: true,
    fileName,
    content,
    filePath,
  }
}

/**
 * 处理下载文件事件
 * @param filePath - 文件路径
 * @param content - 文件内容
 */
function handleDownloadFile(filePath: string, content: string): void {
  try {
    const fileName = filePath.replace(/\\/g, '/').split('/').pop() || 'download.txt'
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    message.success(`文件 "${fileName}" 下载成功`)
  } catch (err) {
    console.error('[ChatMessageList] 下载文件失败:', err)
    message.error('下载失败，请重试')
  }
}

// 解析工具调用序列，生成流程图和知识
const flowKnowledgeData = computed(() => {
  if (props.toolCalls.length === 0) {
    return { flowGraph: null, knowledge: [] as KnowledgeCard[] }
  }
  
  const result = parseToolCalls(props.toolCalls)
  return {
    flowGraph: result.flowGraph,
    knowledge: result.knowledge
  }
})

const flowGraph = computed(() => flowKnowledgeData.value.flowGraph)
const knowledge = computed(() => flowKnowledgeData.value.knowledge)

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
    case 'FileRead': {
      const readPath = (toolCall.toolInput as Record<string, unknown>)?.path || '未知文件'
      return `读取文件：${readPath}`
    }
    case 'FileList': {
      const listPath = (toolCall.toolInput as Record<string, unknown>)?.path || '未知目录'
      return `浏览目录：${listPath}`
    }
    case 'Bash':
    case 'Shell': {
      const command = (toolCall.toolInput as Record<string, unknown>)?.command || ''
      const shortCmd = String(command).length > 50 ? String(command).substring(0, 50) + '...' : command
      return `执行命令：${shortCmd}`
    }
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

/**
 * 获取工具错误的详细信息
 */
function getErrorInfo(toolCall: ToolCall): { type: string; message: string; suggestion: string } | null {
  if (toolCall.status !== 'error' || !toolCall.toolOutput) return null

  const output = toolCall.toolOutput as any
  const errorType = output.errorType || 'UNKNOWN'
  const errorMessage = output.error || '未知错误'

  const suggestions: Record<string, string> = {
    NOT_FOUND: '请检查文件路径是否正确，或确认文件是否存在',
    PERMISSION: '请检查文件权限，或以管理员身份运行',
    TIMEOUT: '操作超时，请稍后重试或简化任务',
    INVALID_INPUT: '请检查输入参数格式是否正确',
    UNKNOWN: '请联系管理员或查看日志获取更多信息',
  }

  return {
    type: errorType,
    message: errorMessage,
    suggestion: suggestions[errorType] || suggestions.UNKNOWN,
  }
}

/**
 * 返回属于指定助手消息的工具调用列表
 * - 只按 messageId 精确匹配
 * - 数据一致性由后端保证
 */
function toolsForMessage(messageId: string): ToolCall[] {
  return props.toolCalls.filter(t => t.messageId === messageId)
}

/**
 * 从消息内容中提取纯文本（处理多种格式）
 */
function getMessageText(content: any): string {
  // 情况1：null 或 undefined
  if (!content) {
    return ''
  }
  
  // 情况2：已经是字符串
  if (typeof content === 'string') {
    return content
  }
  
  // 情况3：数组格式（Anthropic 格式）
  if (Array.isArray(content)) {
    // 先提取 text 类型的内容
    const textBlocks = content
      .filter((block: any) => block && block.type === 'text')
      .map((block: any) => block.text || '')
      .filter((text: string) => text.length > 0)
    
    if (textBlocks.length > 0) {
      return textBlocks.join('\n')
    }
    
    // 如果没有 text 块，检查是否有 tool_result 块
    const hasToolResult = content.some((block: any) => block && block.type === 'tool_result')
    if (hasToolResult) {
      // 工具结果消息，返回空（不显示给用户）
      return ''
    }
    
    return ''
  }
  
  // 情况4：对象格式（可能有 text 属性）
  if (typeof content === 'object') {
    // 如果有 text 属性
    if (content.text && typeof content.text === 'string') {
      return content.text
    }
    // 如果有 content 属性（嵌套结构）
    if (content.content) {
      return getMessageText(content.content)
    }
    // 兜底：转换为 JSON 字符串显示
    try {
      const jsonStr = JSON.stringify(content, null, 2)
      console.warn('[ChatMessageList] Content is object without text property:', jsonStr.substring(0, 200))
      return jsonStr
    } catch (e) {
      return '[无法显示的内容]'
    }
  }
  
  // 情况5：其他类型（数字、布尔等）
  return String(content)
}

/**
 * 判断消息是否应该显示
 * - 过滤掉 tool_result 类型的用户消息（内部消息，不显示给用户）
 * - 过滤掉没有内容且没有工具调用的空助手消息
 */
function shouldShowMessage(message: any): boolean {
  const content = (message as any).content

  // 用户消息：检查是否是 tool_result 格式（内部消息）
  if (message.role === 'user') {
    if (Array.isArray(content)) {
      const hasToolResult = content.some((block: any) => block && block.type === 'tool_result')
      if (hasToolResult) {
        return false  // 隐藏工具结果消息
      }
    }
    // 显示有内容的用户消息
    return getMessageText(content).length > 0
  }

  // 助手消息：只要有内容或有关联的工具调用就显示
  if (message.role === 'assistant') {
    const hasContent = getMessageText(content).length > 0
    const hasTools = toolsForMessage(message.id).length > 0
    return hasContent || hasTools
  }

  return true
}

/**
 * 处理中断 Agent 执行（参考 claude-code-haha/src 的 useCancelRequest.ts）
 * 调用后端 API 中断当前正在执行的 Agent
 */
async function handleInterruptExecution() {
  if (!props.currentAgentId) {
    message.warning('无法中断：当前没有活跃的 Agent')
    return
  }

  if (isInterrupting.value) return

  isInterrupting.value = true

  try {
    console.log(`[ChatMessageList] 正在中断 Agent: ${props.currentAgentId}`)

    // 调用后端中断 API
    const result = await interruptAgent(props.currentAgentId)

    if (result.success) {
      message.success('✅ Agent 执行已中断')
      console.log(`[ChatMessageList] Agent ${props.currentAgentId} 中断成功`)

      // 触发父组件事件
      emit('interrupt', props.currentAgentId)
    } else {
      message.error(`❌ 中断失败: ${result.message || '未知错误'}`)
    }
  } catch (error: any) {
    console.error('[ChatMessageList] 中断 Agent 失败:', error)
    message.error(`❌ 中断失败: ${error?.message || '网络错误'}`)
  } finally {
    isInterrupting.value = false
  }
}
</script>

<template>
  <div class="message-list-wrapper">
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
          <div v-for="(message, index) in messages.filter(shouldShowMessage)" :key="message.id || index" class="message-wrapper">
            <!-- 用户消息 - 右边 -->
            <div v-if="message.role === 'user'" class="message user-message">
              <div class="message-content">
                <div class="message-avatar user-avatar">👤</div>
                <div class="message-bubble user-bubble">
                  <div class="message-text">{{ getMessageText((message as any).content) }}</div>
                </div>
              </div>
            </div>
            
            <!-- 助手消息 - 左边 -->
            <template v-else-if="message.role === 'assistant'">
              <div class="message assistant-message">
                <div class="message-content">
                  <div class="message-avatar assistant-avatar">🤖</div>
                  <div class="message-bubble assistant-bubble">
                    <div class="message-text" v-html="getMessageText((message as any).content).replace(/\n/g, '<br>')"></div>
                    
                    <!-- 工具调用 - 步骤化增强版（内嵌在助手消息内） -->
                    <div v-if="toolsForMessage(message.id).length > 0 && useEnhancedToolDisplay" class="inline-tool-sequence-container">
                      <div 
                        v-for="(toolCall, idx) in toolsForMessage(message.id)" 
                        :key="toolCall.id"
                        class="inline-tool-step-item"
                        :class="[toolCall.status]"
                      >
                        <!-- 文件写入工具 - 使用专用动态UI组件 -->
                        <FileWriteToolInline
                          v-if="isFileWriteTool(toolCall)"
                          :tool-call="toolCall"
                          @view-file="handleViewFile"
                          @download-file="handleDownloadFile"
                        />
                        
                        <!-- 其他工具 - 使用通用组件 -->
                        <template v-else>
                          <!-- 工具头部（可折叠） -->
                          <div class="inline-tool-header" @click="handleStepClick(toolCall.id)">
                            <span class="inline-tool-icon">{{ getToolIcon(toolCall.toolName) }}</span>
                            <span class="inline-tool-name">{{ toolCall.toolName }}</span>
                            <NTag size="small" :type="getStatusType(toolCall.status) as any">
                              {{ toolCall.status === 'pending' ? '等待中' : toolCall.status === 'executing' ? '执行中' : toolCall.status === 'completed' ? '完成' : '错误' }}
                            </NTag>
                            <span class="inline-expand-icon">{{ activeStep === toolCall.id ? '▼' : '▶' }}</span>
                          </div>
                          
                          <!-- 展开内容 -->
                          <Transition name="slide-toggle">
                            <div v-if="activeStep === toolCall.id" class="inline-tool-result">
                              <div class="result-title">执行结果</div>
                              <div class="result-content">
                                <pre>{{ formatToolOutput(toolCall.toolOutput) }}</pre>
                              </div>
                              
                              <!-- 错误提示 -->
                              <div v-if="toolCall.status === 'error' && getErrorInfo(toolCall)" class="inline-error-alert">
                                <div class="error-header">
                                  <span class="error-icon">⚠️</span>
                                  <span class="error-title">工具执行失败</span>
                                  <NTag size="small" type="error">{{ getErrorInfo(toolCall)?.type }}</NTag>
                                </div>
                                <div class="error-message">{{ getErrorInfo(toolCall)?.message }}</div>
                                <div class="error-suggestion" v-if="getErrorInfo(toolCall)?.suggestion">
                                  💡 建议：{{ getErrorInfo(toolCall)?.suggestion }}
                                </div>
                              </div>
                            </div>
                          </Transition>
                        </template>
                      </div>
                    </div>
                    
                    <!-- 工具调用 - 原始版（内嵌在助手消息内） -->
                    <div v-if="toolsForMessage(message.id).length > 0 && !useEnhancedToolDisplay" class="inline-tool-calls">
                      <div 
                        v-for="toolCall in toolsForMessage(message.id)" 
                        :key="toolCall.id"
                        class="inline-tool-call"
                        :class="toolCall.status"
                      >
                        <div class="inline-tool-call-header">
                          <span class="tool-name">{{ toolCall.toolName }}</span>
                          <span class="tool-status">{{ toolCall.status === 'pending' ? '执行中...' : toolCall.status }}</span>
                        </div>
                        <details class="inline-tool-details">
                          <summary>查看详情</summary>
                          <div class="tool-input">
                            <pre>{{ JSON.stringify(toolCall.toolInput, null, 2) }}</pre>
                          </div>
                          <div v-if="toolCall.toolOutput" class="tool-output">
                            <pre>{{ formatToolOutput(toolCall.toolOutput) }}</pre>
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
          
          <!-- 加载状态（无 assistant 占位时兜底，避免与流式消息重复一行头像） -->
          <div v-if="showStandaloneLoadingRow" class="message-wrapper">
            <div class="message assistant-message">
              <div class="message-avatar">🤖</div>
              <div class="message-content">
                <NSpin size="small" />
              </div>
            </div>
          </div>
          
          <!-- 活动工具调用（带中断按钮） -->
          <div v-if="activeToolCalls.length > 0" class="active-tools">
            <div class="active-tools-header">
              <span class="active-tools-title">🔄 正在执行工具</span>

              <!-- 中断按钮：参考 claude-code-haha 的取消机制 -->
              <NButton
                v-if="currentAgentId"
                type="error"
                size="small"
                :loading="isInterrupting"
                class="interrupt-button"
                @click="handleInterruptExecution"
              >
                <template #icon>
                  <NIcon><StopCircleOutline /></NIcon>
                </template>
                {{ isInterrupting ? '中断中...' : '中断执行' }}
              </NButton>
            </div>

            <div v-for="tool in activeToolCalls" :key="tool.id" class="tool-call active">
              <span class="tool-name">{{ tool.toolName }}</span>
              <NSpin size="small" />
            </div>
          </div>
        </div>
      </NScrollbar>
    </div>

    <!-- 文件预览弹窗 -->
    <NModal
      v-model:show="filePreviewModal.show"
      preset="card"
      :title="`📄 ${filePreviewModal.fileName}`"
      style="max-width: 850px; width: 92vw;"
      :bordered="false"
      :segmented="{ content: true, footer: 'soft' }"
    >
      <div class="file-preview-content">
        <NCode
          :code="filePreviewModal.content"
          language="plaintext"
          :show-line-numbers="true"
          style="max-height: 60vh; overflow-y: auto; font-size: 12.5px; line-height: 1.6;"
        />
      </div>
      <template #footer>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="preview-path">路径：{{ filePreviewModal.filePath }}</span>
          <div style="display: flex; gap: 8px;">
            <NButton size="small" secondary @click="handleDownloadFile(filePreviewModal.filePath, filePreviewModal.content)">
              📥 下载文件
            </NButton>
          </div>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.message-list-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
}

/* 消息列表 */
.message-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.scrollbar {
  flex: 1;
  min-height: 0;
}

.messages-container {
  padding: 20px;
  padding-bottom: 20px;
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
  animation: fadeIn 0.3s ease-out;
}

/* 用户消息 - 右边 */
.user-message {
  justify-content: flex-end;
}

/* 助手消息 - 左边 */
.assistant-message {
  justify-content: flex-start;
}

.message-content {
  display: flex;
  gap: 12px;
  max-width: 100%;
  align-items: flex-start;
}

/* 用户消息内容：头像在右边，消息在左边 */
.user-message .message-content {
  flex-direction: row-reverse;
  justify-content: flex-start;
}

.message-bubble {
  padding: 16px 20px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  position: relative;
  transition: all 0.2s ease;
  max-width: 85%;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* 用户消息气泡 - 右边 */
.user-bubble {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--color-primary-dark) 100%);
  color: white;
  border-radius: 20px 20px 4px 20px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
}

.user-bubble:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);
}

/* 助手消息气泡 - 左边 */
.assistant-bubble {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 4px 20px 20px 20px;
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.assistant-bubble:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  border-color: rgba(99, 102, 241, 0.3);
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.user-avatar {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.assistant-avatar {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.message-avatar:hover {
  transform: scale(1.1);
}

.message-text {
  padding: 0;
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
  flex-direction: column;
  gap: 8px;
  margin-left: 48px;
  margin-top: 12px;
}

/* 活动工具头部（包含中断按钮） */
.active-tools-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.active-tools-title {
  font-size: 13px;
  font-weight: 600;
  color: #f59e0b;
}

/* 中断按钮样式 */
.interrupt-button {
  font-size: 12px !important;
  padding: 0 12px !important;
  height: 28px !important;
  border-radius: 6px !important;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
  transition: all 0.2s ease !important;
}

.interrupt-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4) !important;
}

.interrupt-button:active:not(:disabled) {
  transform: translateY(0);
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

/* 错误提示框 */
.error-alert {
  margin-top: 12px;
  padding: 12px 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  animation: shake 0.5s ease-in-out;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.error-icon {
  font-size: 18px;
}

.error-title {
  font-weight: 600;
  color: #ef4444;
  font-size: 14px;
}

.error-message {
  color: #fca5a5;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 8px;
  word-break: break-word;
}

.error-suggestion {
  color: #9ca3af;
  font-size: 12px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

/* ==================== 内嵌工具调用样式 ==================== */

/* 内嵌工具调用容器 */
.inline-tool-sequence-container {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 内嵌工具步骤项 */
.inline-tool-step-item {
  background: rgba(30, 30, 60, 0.3);
  border-radius: 8px;
  border: 1px solid rgba(99, 102, 241, 0.15);
  overflow: hidden;
  transition: all 0.2s ease;
}

.inline-tool-step-item:hover {
  border-color: rgba(99, 102, 241, 0.3);
}

/* 内嵌工具头部 */
.inline-tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  background: rgba(40, 40, 80, 0.2);
  transition: background 0.2s ease;
}

.inline-tool-header:hover {
  background: rgba(40, 40, 80, 0.4);
}

.inline-tool-icon {
  font-size: 14px;
}

.inline-tool-name {
  font-size: 12px;
  font-weight: 500;
  color: #e5e7eb;
  flex: 1;
}

.inline-expand-icon {
  font-size: 10px;
  color: #6b7280;
  transition: transform 0.2s ease;
}

/* 内嵌工具内容 */
.inline-tool-content {
  padding: 10px 12px;
  border-top: 1px solid rgba(99, 102, 241, 0.1);
  font-size: 12px;
}

/* 内嵌错误提示 */
.inline-error-alert {
  margin-top: 10px;
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  font-size: 12px;
}

.inline-error-alert .error-header {
  margin-bottom: 6px;
}

.inline-error-alert .error-title {
  font-size: 12px;
}

.inline-error-alert .error-message {
  font-size: 11px;
  margin-bottom: 6px;
}

.inline-error-alert .error-suggestion {
  font-size: 11px;
  padding: 6px;
}

/* 原始版内嵌工具调用 */
.inline-tool-calls {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inline-tool-call {
  background: rgba(30, 30, 60, 0.3);
  border-radius: 8px;
  border: 1px solid rgba(99, 102, 241, 0.15);
  overflow: hidden;
}

.inline-tool-call-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(40, 40, 80, 0.2);
}

.inline-tool-call-header .tool-name {
  font-size: 12px;
  font-weight: 500;
  color: #e5e7eb;
}

.inline-tool-call-header .tool-status {
  font-size: 11px;
  color: #6b7280;
}

.inline-tool-details {
  font-size: 11px;
}

.inline-tool-details summary {
  padding: 6px 12px;
  cursor: pointer;
  color: #6b7280;
  font-size: 11px;
}

.inline-tool-details summary:hover {
  color: #9ca3af;
}

.inline-tool-details .tool-input,
.inline-tool-details .tool-output {
  padding: 8px 12px;
  border-top: 1px solid rgba(99, 102, 241, 0.1);
}

.inline-tool-details pre {
  font-size: 11px;
  line-height: 1.4;
}

/* 内嵌工具结果显示 */
.inline-tool-result {
  padding: 10px 12px;
  border-top: 1px solid rgba(99, 102, 241, 0.1);
  font-size: 11px;
  max-height: 250px;
  overflow-y: auto;
}

/* Transition 动画 - 展开/收起 */
.slide-toggle-enter-active,
.slide-toggle-leave-active {
  transition: all 0.3s ease-out;
  overflow: hidden;
}

.slide-toggle-enter-from,
.slide-toggle-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  transform: translateY(-10px);
}

.slide-toggle-enter-to,
.slide-toggle-leave-from {
  opacity: 1;
  max-height: 250px;
  transform: translateY(0);
}

.inline-tool-result .result-title {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  padding: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.inline-tool-result .result-content pre {
  background: rgba(15, 15, 30, 0.8);
  padding: 10px;
  border-radius: 6px;
  font-size: 11px;
  font-family: 'Monaco', 'Menlo', monospace;
  color: #a5b4fc;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 180px;
  overflow-y: auto;
  line-height: 1.5;
}

.inline-tool-result .inline-error-alert {
  margin-top: 10px;
  padding: 10px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  font-size: 11px;
}

.inline-tool-result .inline-error-alert .error-header {
  margin-bottom: 6px;
}

.inline-tool-result .inline-error-alert .error-title {
  font-size: 11px;
}

.inline-tool-result .inline-error-alert .error-message {
  font-size: 11px;
  margin-bottom: 6px;
}

.inline-tool-result .inline-error-alert .error-suggestion {
  font-size: 11px;
  padding: 6px;
}

/* 文件预览弹窗 */
.file-preview-content {
  border-radius: 8px;
  overflow: hidden;
}

.preview-path {
  font-size: 12px;
  color: #9ca3af;
  font-family: 'Monaco', 'Menlo', monospace;
  max-width: 50%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
