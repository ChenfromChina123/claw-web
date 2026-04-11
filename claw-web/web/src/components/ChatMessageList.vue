<script setup lang="ts">
/**
 * 增强版消息列表组件 - 集成流程和知识可视化，支持 Agent 中断功能
 */
import { ref, watch, nextTick, computed, onMounted } from 'vue'
import {
  NScrollbar,
  NSpin,
  NTag,
  NSwitch,
  NTooltip,
  NModal,
  NCode,
  NButton,
  NIcon,
  NPopover,
  NPopconfirm,
  NInput,
  useMessage,
} from 'naive-ui'
import MarkdownRender from 'markstream-vue'
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
import { StopCircleOutline, ChevronDownOutline, ListOutline, ArrowUndoOutline, CreateOutline, CheckmarkOutline, CloseOutline } from '@vicons/ionicons5'
import { interruptAgent } from '@/api/agentApi'
import { extractIdeUserDisplay } from '@/utils/ideUserMessageMarkers'
import { isUserTimelineAnchor, userMessageTimelinePreview } from '@/utils/chatTimeline'
import { useChatStore } from '@/stores/chat'
import AgentAvatar from './AgentAvatar.vue'

/** 用户消息编辑功能 */
const editingMessageId = ref<string | null>(null)
const editingContent = ref('')
const isSavingEdit = ref(false)

const props = defineProps<{
  messages: Message[]
  toolCalls: ToolCall[]
  isLoading: boolean
  agentTaskSteps?: AgentTaskStep[]
  /** 当前活跃的 Agent ID（用于中断） */
  currentAgentId?: string
  /** IDE 窄栏：工具卡片与加载条使用更紧凑、偏 VS Code 的深色样式 */
  ideDensity?: boolean
  /** 是否显示时间线导航与回到底部按钮；默认与 ideDensity 一致 */
  showTimelineNav?: boolean
}>()

/**
 * 定义事件
 */
const emit = defineEmits<{
  interrupt: [agentId: string]
  /** 用户从 Bash/PowerShell 工具旁跳转到 IDE 底部终端 */
  'focus-terminal': []
}>()

const scrollbarRef = ref<InstanceType<typeof NScrollbar> | null>(null)
const settingsStore = useSettingsStore()
const chatStore = useChatStore()
const message = useMessage()
/** 中断按钮加载状态 */
const isInterrupting = ref(false)

const effectiveTimelineNav = computed(() =>
  props.showTimelineNav !== undefined ? props.showTimelineNav : !!props.ideDensity,
)

const timelinePopoverShow = ref(false)
const nearBottom = ref(true)
const rollingBackId = ref<string | null>(null)

const userTimelineEntries = computed(() => {
  const out: { id: string; preview: string; timeLabel: string }[] = []
  for (const m of props.messages) {
    if (!isUserTimelineAnchor(m)) continue
    const raw = (m as { createdAt?: string | Date }).createdAt
    const d = raw ? new Date(raw) : null
    const timeLabel =
      d && !Number.isNaN(d.getTime())
        ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : ''
    const contentUnknown = (m as { content?: unknown }).content
    let preview = userMessageTimelinePreview(contentUnknown)
    if (preview.length > 120) preview = `${preview.slice(0, 118)}…`
    out.push({ id: m.id, preview: preview || '（空提问）', timeLabel })
  }
  return out
})

function handleListScroll(e: Event) {
  const t = e.target as HTMLElement
  if (!t || typeof t.scrollTop !== 'number') return
  const gap = t.scrollHeight - t.scrollTop - t.clientHeight
  nearBottom.value = gap < 96
}

function scrollToBottomNow(behavior: 'auto' | 'smooth' = 'smooth') {
  lastScrollTime = 0
  scrollbarRef.value?.scrollTo({ top: 1_000_000, behavior })
  nextTick(() => {
    nearBottom.value = true
  })
}

function scrollToUserMessage(messageId: string) {
  void nextTick(() => {
    const inst = scrollbarRef.value as unknown as { $el?: HTMLElement } | null
    const root = inst?.$el
    const container = root?.querySelector?.('.n-scrollbar-container') as HTMLElement | null
    const target = document.getElementById(`chat-msg-${messageId}`)
    if (!container || !target) return
    const cRect = container.getBoundingClientRect()
    const tRect = target.getBoundingClientRect()
    const padding = 12
    const nextTop = container.scrollTop + (tRect.top - cRect.top) - padding
    scrollbarRef.value?.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
  })
}

async function handleRollback(entryId: string) {
  if (props.isLoading) {
    message.warning('请等待当前回复结束后再回滚')
    return
  }
  rollingBackId.value = entryId
  try {
    await chatStore.rollbackToUserMessage(entryId)
    message.success('已按时间线回滚')
    timelinePopoverShow.value = false
    await nextTick()
    scrollToBottomNow('auto')
  } catch (err: unknown) {
    message.error(err instanceof Error ? err.message : '回滚失败')
  } finally {
    rollingBackId.value = null
  }
}

/**
 * 开始编辑用户消息
 */
function startEditingMessage(messageId: string, content: string) {
  if (props.isLoading) {
    message.warning('请等待当前回复结束后再编辑消息')
    return
  }
  editingMessageId.value = messageId
  editingContent.value = content
  timelinePopoverShow.value = false
}

/**
 * 取消编辑
 */
function cancelEditing() {
  editingMessageId.value = null
  editingContent.value = ''
}

/**
 * 保存编辑并重新发送
 */
async function saveEditedMessage(messageId: string) {
  if (!editingContent.value.trim()) {
    message.warning('消息内容不能为空')
    return
  }

  if (props.isLoading) {
    message.warning('请等待当前回复结束后再编辑消息')
    return
  }

  isSavingEdit.value = true
  try {
    // 调用回滚并重新发送
    await chatStore.rollbackToUserMessage(messageId)
    await nextTick()
    // 发送编辑后的消息
    chatStore.sendMessage(editingContent.value.trim())
    editingMessageId.value = null
    editingContent.value = ''
    message.success('消息已更新，对话将重新开始')
    await nextTick()
    scrollToBottomNow('auto')
  } catch (err: unknown) {
    message.error(err instanceof Error ? err.message : '编辑失败')
  } finally {
    isSavingEdit.value = false
  }
}

/**
 * 检查消息是否正在被编辑
 */
function isEditing(messageId: string): boolean {
  return editingMessageId.value === messageId
}

/** 流式光标节流：仅当内容超过 16ms 增量时才触发滚动（避免每字符都 layout） */
let lastScrollTime = 0
const SCROLL_THROTTLE_MS = 48

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
 * 滚动到底部（节流：避免每次内容变化都触发 layout）
 */
function scrollToBottom() {
  const now = Date.now()
  if (now - lastScrollTime < SCROLL_THROTTLE_MS) return
  lastScrollTime = now
  scrollbarRef.value?.scrollTo({ top: 1000000, behavior: 'smooth' })
}

// 监听消息内容长度变化（捕获流式增量），节流滚动到底部
watch(
  () => props.messages.length + (props.messages[props.messages.length - 1]?.content ?? '').length,
  async () => {
    await nextTick()
    scrollToBottom()
  },
)

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
/** Bash / PowerShell / Shell：可在旁显示「在终端查看」 */
function isShellToolName(name: string): boolean {
  const n = name.toLowerCase()
  return n === 'bash' || n === 'powershell' || n === 'shell'
}

function handleFocusTerminalClick(e: Event): void {
  e.stopPropagation()
  emit('focus-terminal')
}

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

/** 用户气泡：IDE 双轨消息只展示简短层，避免大段代码占满对话 */
function formatUserMessageForBubble(content: unknown): string {
  return extractIdeUserDisplay(getMessageText(content))
}

/**
 * 判断消息是否应该显示
 * - 过滤掉 tool_result 类型的用户消息（内部消息，不显示给用户）
 * - 过滤掉没有内容且没有工具调用的空助手消息
 * - 但保留正在流式输出的助手消息（isLoading 状态下）
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
    return formatUserMessageForBubble(content).length > 0
  }

  // 助手消息：只要有内容、有关联的工具调用、或是最后一条消息且正在加载中就显示
  if (message.role === 'assistant') {
    const hasContent = getMessageText(content).length > 0
    const hasTools = toolsForMessage(message.id).length > 0
    // 如果是最后一条助手消息且正在加载中，也显示（用于流式输出）
    const isLastMessage = props.messages[props.messages.length - 1]?.id === message.id
    const isStreaming = props.isLoading && isLastMessage
    const shouldShow = hasContent || hasTools || isStreaming
    console.log('[ChatMessageList] shouldShowMessage:', {
      messageId: message.id,
      hasContent,
      hasTools,
      isLastMessage,
      isLoading: props.isLoading,
      isStreaming,
      shouldShow
    })
    return shouldShow
  }

  return true
}

const visibleMessages = computed(() => props.messages.filter(shouldShowMessage))

/**
 * 处理中断 Agent 执行（参考 claw-web/src 的 useCancelRequest.ts）
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
  <div
    class="message-list-wrapper"
    :class="{ 'message-list-wrapper--ide': ideDensity }"
  >
    <!-- 主消息列表 -->
    <div class="message-list">
      <NScrollbar ref="scrollbarRef" class="scrollbar" @scroll="handleListScroll">
        <div class="messages-container">
          <!-- 欢迎消息 -->
          <div v-if="messages.length === 0 && !isLoading" class="welcome">
            <div class="welcome-avatar">
              <AgentAvatar />
            </div>
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
          <div
            v-for="(message, index) in visibleMessages"
            :id="'chat-msg-' + (message.id || String(index))"
            :key="message.id || index"
            class="message-wrapper"
          >
            <!-- 用户消息 - 右边 -->
            <div v-if="message.role === 'user'" class="message user-message">
              <div class="message-content">
                <div class="message-bubble-column">
                  <!-- 气泡主体 -->
                  <div class="message-bubble user-bubble">
                    <!-- 编辑模式 -->
                    <div v-if="isEditing(message.id)" class="edit-mode">
                      <NInput
                        v-model:value="editingContent"
                        type="textarea"
                        :rows="3"
                        placeholder="编辑消息内容..."
                        class="edit-input"
                        @keydown.ctrl.enter.prevent="saveEditedMessage(message.id)"
                        @keydown.meta.enter.prevent="saveEditedMessage(message.id)"
                      />
                    </div>
                    <!-- 显示模式 -->
                    <template v-else>
                      <div class="message-text">{{ formatUserMessageForBubble((message as any).content) }}</div>
                    </template>
                  </div>

                  <!-- 气泡下方操作栏：编辑模式 -->
                  <div v-if="isEditing(message.id)" class="bubble-edit-actions">
                    <span class="edit-hint">Ctrl+Enter 发送 · Esc 取消</span>
                    <div class="action-group">
                      <button
                        type="button"
                        class="action-btn action-btn--cancel"
                        title="取消编辑"
                        @click="cancelEditing"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        class="action-btn action-btn--save"
                        title="保存并重新发送"
                        :disabled="isSavingEdit"
                        @click="saveEditedMessage(message.id)"
                      >
                        {{ isSavingEdit ? '发送中...' : '发送' }}
                      </button>
                    </div>
                  </div>

                  <!-- 气泡下方操作栏：显示模式 - 编辑按钮 -->
                  <div v-else class="bubble-actions">
                    <button
                      type="button"
                      class="action-btn action-btn--edit"
                      title="编辑消息"
                      @click="startEditingMessage(message.id, formatUserMessageForBubble((message as any).content))"
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
                        <path d="M11 4H4C3.46957 4 2.96086 4.21071 2.58579 4.58579C2.21071 4.96086 2 5.46957 2 6V20C2 20.5304 2.21071 21.0391 2.58579 21.4142C2.96086 21.7893 3.46957 22 4 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M18.5 2.50001C18.8978 2.10219 19.4374 1.87869 20 1.87869C20.5626 1.87869 21.1022 2.10219 21.5 2.50001C21.8978 2.89784 22.1213 3.4374 22.1213 4.00001C22.1213 4.56262 21.8978 5.10219 21.5 5.50001L12 15L8 16L9 12L18.5 2.50001Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                      编辑
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 助手消息 - 左边 -->
            <template v-else-if="message.role === 'assistant'">
              <div class="message assistant-message">
                <div class="message-content">
                  <div class="message-bubble assistant-bubble">
                    <div class="message-text markdown-content">
                      <MarkdownRender
                        :content="getMessageText((message as any).content)"
                        :enable-monaco="true"
                        :enable-mermaid="true"
                        :enable-katex="true"
                        :final="!props.isLoading"
                        :custom-id="'assistant-chat-' + message.id"
                        :mermaid-props="{
                          renderDebounceMs: 180,
                          previewPollDelayMs: 500,
                        }"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <!-- 工具调用 - 作为独立区域显示在助手消息下方 -->
              <div v-if="toolsForMessage(message.id).length > 0 && useEnhancedToolDisplay" class="tool-calls-wrapper">
                <div class="tool-calls-container">
                  <div 
                    v-for="(toolCall, idx) in toolsForMessage(message.id)" 
                    :key="toolCall.id"
                    class="tool-call-item"
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
                      <div class="tool-call-header" @click="handleStepClick(toolCall.id)">
                        <span class="tool-call-icon">{{ getToolIcon(toolCall.toolName) }}</span>
                        <span class="tool-call-name">{{ toolCall.toolName }}</span>
                        <NTag size="small" :type="getStatusType(toolCall.status) as any">
                          {{ toolCall.status === 'pending' ? '等待中' : toolCall.status === 'executing' ? '执行中' : toolCall.status === 'completed' ? '完成' : '错误' }}
                        </NTag>
                        <NTooltip v-if="isShellToolName(toolCall.toolName)" trigger="hover">
                          <template #trigger>
                            <button
                              type="button"
                              class="tool-call-terminal-link"
                              aria-label="在终端查看"
                              @click="handleFocusTerminalClick"
                            >
                              <span class="tool-call-terminal-icon" aria-hidden="true">⎘</span>
                              终端
                            </button>
                          </template>
                          跳转到底部终端面板并聚焦（与 Agent Shell 输出同一区域）
                        </NTooltip>
                        <span class="tool-call-expand-icon">{{ activeStep === toolCall.id ? '▼' : '▶' }}</span>
                      </div>
                      
                      <!-- 展开内容 -->
                      <Transition name="slide-toggle">
                        <div v-if="activeStep === toolCall.id" class="tool-call-result">
                          <div class="result-title">执行结果</div>
                          <div class="result-content">
                            <pre>{{ formatToolOutput(toolCall.toolOutput) }}</pre>
                          </div>
                          
                          <!-- 错误提示 -->
                          <div v-if="toolCall.status === 'error' && getErrorInfo(toolCall)" class="tool-call-error-alert">
                            <div class="error-header">
                              <span class="error-icon">⚠️</span>
                              <span class="error-title">工具执行失败</span>
                              <NTag size="small" type="error">{{ getErrorInfo(toolCall)?.type }}</NTag>
                            </div>
                            <div class="error-message">{{ getErrorInfo(toolCall)?.message }}</div>
                            <div v-if="getErrorInfo(toolCall)?.suggestion" class="error-suggestion">
                              💡 建议：{{ getErrorInfo(toolCall)?.suggestion }}
                            </div>
                          </div>
                        </div>
                      </Transition>
                    </template>
                  </div>
                </div>
              </div>
              
              <!-- 工具调用 - 原始版（作为独立区域显示） -->
              <div v-if="toolsForMessage(message.id).length > 0 && !useEnhancedToolDisplay" class="tool-calls-wrapper">
                <div class="tool-calls-container">
                  <div 
                    v-for="toolCall in toolsForMessage(message.id)" 
                    :key="toolCall.id"
                    class="tool-call-item legacy"
                    :class="toolCall.status"
                  >
                    <div class="tool-call-header legacy">
                      <span class="tool-call-name">{{ toolCall.toolName }}</span>
                      <NTooltip v-if="isShellToolName(toolCall.toolName)" trigger="hover">
                        <template #trigger>
                          <button
                            type="button"
                            class="tool-call-terminal-link"
                            aria-label="在终端查看"
                            @click="handleFocusTerminalClick"
                          >
                            <span class="tool-call-terminal-icon" aria-hidden="true">⎘</span>
                            终端
                          </button>
                        </template>
                        跳转到底部终端面板并聚焦
                      </NTooltip>
                      <span class="tool-call-status">{{
                        toolCall.status === 'pending' ? '执行中...' : toolCall.status
                      }}</span>
                    </div>
                    <details class="tool-call-details">
                      <summary>查看详情</summary>
                      <div class="tool-call-input">
                        <pre>{{ JSON.stringify(toolCall.toolInput, null, 2) }}</pre>
                      </div>
                      <div v-if="toolCall.toolOutput" class="tool-call-output">
                        <pre>{{ formatToolOutput(toolCall.toolOutput) }}</pre>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </template>
          </div>
          
          <!-- 加载状态（无 assistant 占位时兜底，避免与流式消息重复一行头像） -->
          <div v-if="showStandaloneLoadingRow" class="message-wrapper">
            <div class="message assistant-message">
              <div class="message-content">
                <NSpin size="small" />
              </div>
            </div>
          </div>
          
          <!-- 活动工具调用（带中断按钮） -->
          <div v-if="activeToolCalls.length > 0" class="active-tools">
            <div class="active-tools-header">
              <span class="active-tools-title">🔄 正在执行工具</span>

              <!-- 中断按钮：参考 claw-web 的取消机制 -->
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
              <NTooltip v-if="isShellToolName(tool.toolName)" trigger="hover">
                <template #trigger>
                  <button
                    type="button"
                    class="inline-tool-terminal-link inline-tool-terminal-link--active-row"
                    aria-label="在终端查看"
                    @click="handleFocusTerminalClick"
                  >
                    <span class="inline-tool-terminal-icon" aria-hidden="true">⎘</span>
                    终端
                  </button>
                </template>
                跳转到底部终端面板并聚焦
              </NTooltip>
              <NSpin size="small" />
            </div>
          </div>
        </div>
      </NScrollbar>
    </div>

    <!-- 返回底部悬浮按钮 - 聊天框中间底部 -->
    <Transition name="chat-nav-fade">
      <div
        v-show="!nearBottom && messages.length > 0"
        class="chat-nav-bottom"
      >
        <button
          type="button"
          class="scroll-to-bottom-btn"
          title="回到底部"
          aria-label="回到底部"
          @click="scrollToBottomNow('smooth')"
        >
          <NIcon :size="24"><ChevronDownOutline /></NIcon>
        </button>
      </div>
    </Transition>

    <!-- 时间线导航（聊天框右上角悬浮） -->
    <div
      v-if="effectiveTimelineNav && (messages.length > 0 || isLoading)"
      class="chat-nav-floating"
      :class="{ 'chat-nav-floating--ide': ideDensity }"
    >
      <NPopover
        v-model:show="timelinePopoverShow"
        trigger="click"
        :show-arrow="false"
        placement="left-end"
        raw
        class="chat-timeline-popover-wrap"
      >
        <template #trigger>
          <button
            type="button"
            class="chat-nav-btn chat-nav-btn--secondary"
            title="按提问跳转 / 编辑消息"
            aria-label="对话时间线"
          >
            <NIcon :size="ideDensity ? 18 : 20"><ListOutline /></NIcon>
          </button>
        </template>
        <div class="chat-timeline-panel" :class="{ 'chat-timeline-panel--ide': ideDensity }">
          <div class="chat-timeline-panel-head">用户提问时间线</div>
          <div v-if="userTimelineEntries.length === 0" class="chat-timeline-empty">暂无可见提问</div>
          <div v-else class="chat-timeline-list">
            <div
              v-for="entry in userTimelineEntries"
              :key="entry.id"
              class="chat-timeline-row"
            >
              <div class="chat-timeline-meta">
                <span v-if="entry.timeLabel" class="chat-timeline-time">{{ entry.timeLabel }}</span>
              </div>
              <div class="chat-timeline-preview" :title="entry.preview">{{ entry.preview }}</div>
              <div class="chat-timeline-actions">
                <button
                  type="button"
                  class="chat-timeline-link"
                  @click="scrollToUserMessage(entry.id); timelinePopoverShow = false"
                >
                  定位
                </button>
                <NPopconfirm
                  placement="left"
                  positive-text="回滚"
                  negative-text="取消"
                  :disabled="isLoading"
                  @positive-click="handleRollback(entry.id)"
                >
                  <template #trigger>
                    <button
                      type="button"
                      class="chat-timeline-link chat-timeline-link--danger"
                      :disabled="!!isLoading || rollingBackId === entry.id"
                    >
                      <NIcon v-if="rollingBackId !== entry.id" :size="14"><ArrowUndoOutline /></NIcon>
                      {{ rollingBackId === entry.id ? '…' : '回滚' }}
                    </button>
                  </template>
                  将删除此提问及其之后的所有消息与工具记录，且不可撤销。确定回滚？
                </NPopconfirm>
              </div>
            </div>
          </div>
        </div>
      </NPopover>
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
  position: relative;
}

/* —— 时间线 + 回到底部浮动按钮 —— */

/* 导航按钮容器 - 聊天框右上角悬浮 */
.chat-nav-floating {
  position: absolute;
  top: 16px;
  right: 20px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
}

/* 返回底部按钮 - 悬浮在聊天框中间底部 */
.chat-nav-bottom {
  position: absolute;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  pointer-events: none;
}

.chat-nav-floating > * {
  pointer-events: auto;
}

.chat-nav-bottom > * {
  pointer-events: auto;
}

.chat-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(8px);
}

.chat-nav-btn--secondary {
  border: 1px solid rgba(34, 197, 94, 0.3);
  background: rgba(22, 22, 30, 0.85);
  color: #22c55e;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}

.chat-nav-btn--secondary:hover {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.5);
  color: #4ade80;
  transform: scale(1.05);
}

.chat-nav-btn--primary {
  border: 1px solid rgba(34, 197, 94, 0.35);
  background: rgba(22, 22, 30, 0.85);
  color: #22c55e;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}

.chat-nav-btn--primary:hover {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.5);
  color: #4ade80;
  transform: scale(1.05);
}

/* IDE 风格的导航按钮 */
.chat-nav-floating--ide .chat-nav-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid #3f3f3f;
  background: #2a2a2a;
  color: #c0c0c0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
}

.chat-nav-floating--ide .chat-nav-btn:hover {
  background: #333333;
  border-color: #505050;
  color: #e8e8e8;
}

.chat-nav-floating--ide .chat-nav-btn--primary {
  border-color: rgba(34, 197, 94, 0.5);
  color: #4ade80;
  background: rgba(34, 197, 94, 0.1);
}

.chat-nav-floating--ide .chat-nav-btn--primary:hover {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.7);
}

/* 返回底部按钮样式 - 悬浮圆形按钮 */
.scroll-to-bottom-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid rgba(34, 197, 94, 0.4);
  background: rgba(22, 22, 30, 0.9);
  color: #22c55e;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 20px rgba(34, 197, 94, 0.2);
  backdrop-filter: blur(10px);
  animation: floatIn 0.3s ease-out;
}

.scroll-to-bottom-btn:hover {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.6);
  color: #4ade80;
  transform: scale(1.1) translateY(-2px);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5), 0 0 30px rgba(34, 197, 94, 0.3);
}

.scroll-to-bottom-btn:active {
  transform: scale(1.05) translateY(0);
}

@keyframes floatIn {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.chat-nav-fade-enter-active,
.chat-nav-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.chat-nav-fade-enter-from,
.chat-nav-fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.chat-timeline-panel {
  width: min(320px, calc(100vw - 48px));
  max-height: min(420px, 55vh);
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  border: 1px solid rgba(99, 102, 241, 0.2);
  background: #ffffff;
  box-shadow: 0 12px 40px rgba(15, 23, 42, 0.15);
  overflow: hidden;
}

.chat-timeline-panel--ide {
  background: #252526;
  border: 1px solid #3c3c3c;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55);
}

.chat-timeline-panel-head {
  padding: 10px 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
}

.chat-timeline-panel--ide .chat-timeline-panel-head {
  color: #858585;
  border-bottom-color: #3c3c3c;
}

.chat-timeline-empty {
  padding: 16px 12px;
  font-size: 13px;
  color: #94a3b8;
}

.chat-timeline-panel--ide .chat-timeline-empty {
  color: #6e6e6e;
}

.chat-timeline-list {
  overflow-y: auto;
  padding: 6px 0;
  max-height: min(360px, 50vh);
}

.chat-timeline-row {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.chat-timeline-panel--ide .chat-timeline-row {
  border-bottom-color: #333;
}

.chat-timeline-meta {
  margin-bottom: 4px;
}

.chat-timeline-time {
  font-size: 10px;
  color: #94a3b8;
  letter-spacing: 0.02em;
}

.chat-timeline-panel--ide .chat-timeline-time {
  color: #6e6e6e;
}

.chat-timeline-preview {
  font-size: 12px;
  line-height: 1.45;
  color: #334155;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 8px;
}

.chat-timeline-panel--ide .chat-timeline-preview {
  color: #cccccc;
}

.chat-timeline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.chat-timeline-link {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 12px;
  font-weight: 500;
  color: #6366f1;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.chat-timeline-link:hover {
  color: #4f46e5;
}

.chat-timeline-panel--ide .chat-timeline-link {
  color: #3794ff;
}

.chat-timeline-panel--ide .chat-timeline-link:hover {
  color: #6cbbff;
}

.chat-timeline-link--danger {
  color: #e11d48;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.chat-timeline-panel--ide .chat-timeline-link--danger {
  color: #f97316;
}

.chat-timeline-link:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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
  padding: 40px 20px;
}

.welcome-avatar {
  display: flex;
  justify-content: center;
  margin-bottom: 24px;
}

.welcome-avatar :deep(.agent-avatar) {
  width: 80px;
  height: 80px;
}

.welcome-avatar :deep(.avatar-ring) {
  width: 80px;
  height: 80px;
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
  margin-bottom: 8px;
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

/* 气泡列容器 - 包含气泡和下方操作栏 */
.message-bubble-column {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 92%;
}

/* 气泡下方的操作栏 - 显示模式 */
.bubble-actions {
  display: flex;
  justify-content: flex-end;
  padding: 0 4px;
  opacity: 0;
  transition: opacity var(--transition-fast, 150ms) ease;
}

.user-message:hover .bubble-actions {
  opacity: 1;
}

/* 气泡下方的编辑操作栏 */
.bubble-edit-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 4px;
  animation: fadeIn 0.2s ease-out;
}

/* 操作按钮组 */
.action-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* 统一操作按钮样式 */
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms) ease;
}

/* 编辑按钮 */
.action-btn--edit {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.action-btn--edit:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.25);
}

/* 保存按钮 */
.action-btn--save {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.action-btn--save:hover:not(:disabled) {
  background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
}

.action-btn--save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 取消按钮 */
.action-btn--cancel {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.action-btn--cancel:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.85);
}

/* 编辑提示文字 */
.edit-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}

.message-bubble {
  padding: 12px 16px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  position: relative;
  transition: all 0.2s ease;
  max-width: 92%;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* 用户消息气泡 - 右边 */
.user-bubble {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
  border-radius: 20px 20px 4px 20px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.25);
}

.user-bubble:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(34, 197, 94, 0.35);
}

/* 编辑模式下的气泡 */
.user-bubble .edit-mode {
  padding: 0;
}

.user-bubble .edit-input {
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  color: white;
  font-size: 14px;
  line-height: 1.6;
}

.user-bubble .edit-input :deep(.n-input__textarea-el),
.user-bubble .edit-input :deep(.n-input__input-el) {
  color: white !important;
  background: transparent !important;
}

.user-bubble .edit-input :deep(.n-input__placeholder) {
  color: rgba(255, 255, 255, 0.5) !important;
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
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
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

/* Markdown 内容样式 - 表格、公式等 */
.markdown-content :deep(.markstream-vue) {
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.7;
}

.markdown-content :deep(.markstream-vue p) {
  margin: 0 0 8px 0;
}

.markdown-content :deep(.markstream-vue p:last-child) {
  margin-bottom: 0;
}

/* 表格样式 */
.markdown-content :deep(.markstream-vue table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
  border-radius: 8px;
  overflow: hidden;
}

.markdown-content :deep(.markstream-vue th),
.markdown-content :deep(.markstream-vue td) {
  border: 1px solid var(--border-color);
  padding: 10px 14px;
  text-align: left;
}

.markdown-content :deep(.markstream-vue th) {
  background: rgba(99, 102, 241, 0.15);
  font-weight: 600;
  color: var(--text-primary);
}

.markdown-content :deep(.markstream-vue tr:nth-child(even)) {
  background: rgba(255, 255, 255, 0.03);
}

.markdown-content :deep(.markstream-vue tr:hover) {
  background: rgba(99, 102, 241, 0.08);
}

/* KaTeX 公式样式 */
.markdown-content :deep(.markstream-vue .katex) {
  font-size: 1.1em;
  color: var(--text-primary);
}

.markdown-content :deep(.markstream-vue .katex-display) {
  margin: 16px 0;
  overflow-x: auto;
  overflow-y: hidden;
}

/* 代码块样式 */
.markdown-content :deep(.markstream-vue pre) {
  background: #0d1117;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  margin: 12px 0;
}

.markdown-content :deep(.markstream-vue code) {
  font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
}

.markdown-content :deep(.markstream-vue :not(pre) > code) {
  background: rgba(99, 102, 241, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  color: #a5b4fc;
}

/* Mermaid 图表样式 */
.markdown-content :deep(.markstream-vue .mermaid) {
  background: transparent;
  padding: 12px;
  border-radius: 8px;
  margin: 12px 0;
  text-align: center;
}

/* 列表样式 */
.markdown-content :deep(.markstream-vue ul),
.markdown-content :deep(.markstream-vue ol) {
  padding-left: 24px;
  margin: 8px 0;
}

.markdown-content :deep(.markstream-vue li) {
  margin: 4px 0;
}

/* 引用块样式 */
.markdown-content :deep(.markstream-vue blockquote) {
  border-left: 4px solid #6366f1;
  padding-left: 16px;
  margin: 12px 0;
  color: #94a3b8;
  font-style: italic;
}

/* 标题样式 */
.markdown-content :deep(.markstream-vue h1),
.markdown-content :deep(.markstream-vue h2),
.markdown-content :deep(.markstream-vue h3) {
  margin-top: 16px;
  margin-bottom: 8px;
  color: var(--text-primary);
}

.markdown-content :deep(.markstream-vue h1) {
  font-size: 1.5em;
}

.markdown-content :deep(.markstream-vue h2) {
  font-size: 1.3em;
}

.markdown-content :deep(.markstream-vue h3) {
  font-size: 1.15em;
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
  gap: 8px;
  flex-wrap: wrap;
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

.inline-tool-call-header__status {
  margin-left: auto;
}

/* 「在终端查看」链接（Bash / PowerShell 旁） */
.inline-tool-terminal-link {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border: 1px solid rgba(34, 197, 94, 0.4);
  border-radius: 4px;
  background: rgba(34, 197, 94, 0.1);
  color: #86efac;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.inline-tool-terminal-link:hover {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.65);
  color: #bbf7d0;
}

.inline-tool-terminal-icon {
  font-size: 12px;
  opacity: 0.95;
}

.inline-tool-terminal-link--active-row {
  margin-right: 6px;
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

/* ========== IDE 窄栏：任务卡片与「正在执行」条 ========== */
.message-list-wrapper--ide .message-list {
  background: transparent;
}

.message-list-wrapper--ide .inline-tool-sequence-container {
  gap: 6px;
  margin-top: 10px;
}

.message-list-wrapper--ide .inline-tool-step-item {
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  box-shadow: none;
}

.message-list-wrapper--ide .inline-tool-step-item:hover {
  border-color: #4a4a4a;
}

.message-list-wrapper--ide .inline-tool-header {
  padding: 8px 10px;
  background: #1e1e1e;
  border-radius: 4px;
  gap: 6px;
}

.message-list-wrapper--ide .inline-tool-header:hover {
  background: #2a2a2a;
}

.message-list-wrapper--ide .inline-tool-name {
  font-size: 12px;
  font-weight: 600;
  color: #d4d4d4;
  letter-spacing: 0.02em;
}

.message-list-wrapper--ide .inline-tool-icon {
  font-size: 15px;
  filter: saturate(0.9);
}

.message-list-wrapper--ide .inline-expand-icon {
  color: #858585;
  font-size: 9px;
  opacity: 0.9;
}

.message-list-wrapper--ide .active-tools {
  margin-top: 8px;
  padding: 8px 10px;
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
}

.message-list-wrapper--ide .active-tools-header {
  margin-bottom: 6px;
}

.message-list-wrapper--ide .active-tools-title {
  font-size: 11px;
  font-weight: 500;
  color: #b0b0b0;
}

.message-list-wrapper--ide .tool-call.active {
  padding: 6px 8px;
  font-size: 11px;
  background: #1e1e1e;
  border-radius: 4px;
  border: 1px solid #333;
}

.message-list-wrapper--ide .chat-nav-floating {
  right: 6px;
  bottom: 6px;
}

/* ==================== 独立工具调用样式（从消息气泡中分离） ==================== */

/* 工具调用包装器 - 与助手消息对齐 */
.tool-calls-wrapper {
  margin-left: 52px;
  margin-top: 2px;
  margin-bottom: 4px;
}

/* 工具调用容器 */
.tool-calls-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 单个工具调用项 */
.tool-call-item {
  background: rgba(30, 30, 60, 0.4);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.tool-call-item:hover {
  border-color: rgba(99, 102, 241, 0.4);
}

/* 不同状态的工具调用 */
.tool-call-item.completed {
  border-left: 3px solid #22c55e;
}

.tool-call-item.error {
  border-left: 3px solid #ef4444;
}

.tool-call-item.executing {
  border-left: 3px solid #f59e0b;
}

/* 工具调用头部 */
.tool-call-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  background: rgba(40, 40, 80, 0.2);
  transition: background 0.2s ease;
}

.tool-call-header:hover {
  background: rgba(40, 40, 80, 0.4);
}

.tool-call-header.legacy {
  cursor: default;
}

.tool-call-icon {
  font-size: 14px;
}

.tool-call-name {
  font-size: 12px;
  font-weight: 500;
  color: #e5e7eb;
  flex: 1;
}

.tool-call-expand-icon {
  font-size: 10px;
  color: #6b7280;
  transition: transform 0.2s ease;
}

.tool-call-status {
  font-size: 11px;
  color: #6b7280;
  margin-left: auto;
}

/* 终端链接按钮 */
.tool-call-terminal-link {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border: 1px solid rgba(34, 197, 94, 0.4);
  border-radius: 4px;
  background: rgba(34, 197, 94, 0.1);
  color: #86efac;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-call-terminal-link:hover {
  background: rgba(34, 197, 94, 0.2);
  border-color: rgba(34, 197, 94, 0.65);
  color: #bbf7d0;
}

.tool-call-terminal-icon {
  font-size: 12px;
  opacity: 0.95;
}

/* 工具调用结果区域 */
.tool-call-result {
  padding: 8px 10px;
  border-top: 1px solid rgba(99, 102, 241, 0.1);
  font-size: 11px;
  max-height: 250px;
  overflow-y: auto;
}

.tool-call-result .result-title {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  padding: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tool-call-result .result-content pre {
  background: rgba(15, 15, 30, 0.8);
  padding: 8px;
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

/* 工具调用错误提示 */
.tool-call-error-alert {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  font-size: 11px;
}

.tool-call-error-alert .error-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.tool-call-error-alert .error-title {
  font-size: 11px;
  font-weight: 600;
  color: #ef4444;
}

.tool-call-error-alert .error-message {
  font-size: 11px;
  color: #fca5a5;
  margin-bottom: 6px;
  word-break: break-word;
}

.tool-call-error-alert .error-suggestion {
  font-size: 11px;
  color: #9ca3af;
  padding: 6px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

/* 旧版工具调用样式 */
.tool-call-item.legacy {
  background: rgba(30, 30, 60, 0.3);
}

.tool-call-details {
  font-size: 11px;
}

.tool-call-details summary {
  padding: 6px 10px;
  cursor: pointer;
  color: #6b7280;
  font-size: 11px;
}

.tool-call-details summary:hover {
  color: #9ca3af;
}

.tool-call-input,
.tool-call-output {
  padding: 8px 10px;
  border-top: 1px solid rgba(99, 102, 241, 0.1);
}

.tool-call-input pre,
.tool-call-output pre {
  font-size: 11px;
  line-height: 1.4;
  margin: 0;
  font-family: 'Monaco', 'Menlo', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

/* ========== IDE 窄栏：独立工具调用样式 ========== */
.message-list-wrapper--ide .tool-calls-wrapper {
  margin-left: 48px;
  margin-top: 4px;
  margin-bottom: 10px;
}

.message-list-wrapper--ide .tool-calls-container {
  gap: 4px;
}

.message-list-wrapper--ide .tool-call-item {
  background: #252526;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  box-shadow: none;
}

.message-list-wrapper--ide .tool-call-item:hover {
  border-color: #4a4a4a;
}

.message-list-wrapper--ide .tool-call-header {
  padding: 6px 10px;
  background: #1e1e1e;
  border-radius: 4px;
  gap: 6px;
}

.message-list-wrapper--ide .tool-call-header:hover {
  background: #2a2a2a;
}

.message-list-wrapper--ide .tool-call-name {
  font-size: 12px;
  font-weight: 600;
  color: #d4d4d4;
  letter-spacing: 0.02em;
}

.message-list-wrapper--ide .tool-call-icon {
  font-size: 15px;
  filter: saturate(0.9);
}

.message-list-wrapper--ide .tool-call-expand-icon {
  color: #858585;
  font-size: 9px;
  opacity: 0.9;
}

.message-list-wrapper--ide .tool-call-result {
  padding: 8px 10px;
  border-top-color: #333;
}

.message-list-wrapper--ide .tool-call-result .result-content pre {
  background: #1e1e1e;
  border: 1px solid #333;
  color: #d4d4d4;
}
</style>
