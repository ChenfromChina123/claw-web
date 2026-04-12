<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import type { IdeAppendToChatOptions, IdeCodeRefPayload, IdeTerminalRefPayload } from '@/composables/useIdeChatAppend'
import { buildIdeLayeredUserMessage } from '@/utils/ideUserMessageMarkers'
import { NInput, NButton, NIcon, NSpin, NTag, NSelect, NDropdown, useMessage } from 'naive-ui'
import type { UploadFileInfo } from 'naive-ui'
import { CloudUploadOutline, StopCircleOutline, ReorderFourOutline } from '@vicons/ionicons5'
import { modelApi, type Model } from '@/api/modelApi'
import { useChatStore } from '@/stores/chat'
import { promptTemplateApi, type PromptTemplate } from '@/api/promptTemplateApi'
import { useOpenPromptLibrary } from '@/composables/usePromptTemplateLibrary'

const props = defineProps<{
  disabled?: boolean
  sidebarCollapsed?: boolean
  sessionId?: string
  /** 占位文案（IDE 等场景可传入英文） */
  placeholder?: string
  /** default：全屏聊天大输入区；ide：侧栏紧凑 + 模型选择 */
  variant?: 'default' | 'ide'
  /** 当前是否正在生成中（控制发送→停止按钮切换） */
  isGenerating?: boolean
}>()

const emit = defineEmits<{
  send: [content: string, modelId?: string]
  focus: []
  /** 用户点击停止按钮，中断正在进行的生成 */
  stop: []
}>()

const chatStore = useChatStore()
const models = ref<Model[]>([])
const selectedModelId = ref<string>('')

const modelOptions = computed(() =>
  (models.value ?? []).map(m => ({ label: m.name, value: m.id })),
)

// 当前选中模型的显示标签
const selectedModelLabel = computed(() => {
  const model = models.value.find(m => m.id === selectedModelId.value)
  return model?.name || ''
})

async function loadModels(): Promise<void> {
  try {
    const list = await modelApi.listModels()
    models.value = list
    if (!selectedModelId.value && list.length > 0) {
      selectedModelId.value = list[0].id
    }
  } catch {
    models.value = []
  }
}

function syncModelFromSession(): void {
  if (props.variant !== 'ide') return
  const m = chatStore.currentSession?.model
  if (m) {
    const list = models.value ?? []
    if (list.some(x => x.id === m)) {
      selectedModelId.value = m
    } else {
      selectedModelId.value = m
    }
  }
}

watch(
  () => [props.variant, props.sessionId, chatStore.currentSession?.model] as const,
  () => {
    syncModelFromSession()
  },
  { immediate: true },
)

const inputValue = ref('')
const inputRef = ref<InstanceType<typeof NInput> | null>(null)
const message = useMessage()

interface IdeCodeAttachment extends IdeCodeRefPayload {
  id: string
}

/** 终端输出附件（以芯片形式显示） */
interface IdeTerminalAttachment {
  id: string
  preview: string
  content: string
  originalLength: number
}

const codeAttachments = ref<IdeCodeAttachment[]>([])
const terminalAttachments = ref<IdeTerminalAttachment[]>([])

/**
 * 模板列表相关状态
 */
const templates = ref<PromptTemplate[]>([])
const isLoadingTemplates = ref(false)
const openPromptLibraryInEditor = useOpenPromptLibrary()

/**
 * 加载模板列表
 */
async function loadTemplates(): Promise<void> {
  isLoadingTemplates.value = true
  try {
    const list = await promptTemplateApi.getTemplates()
    templates.value = list
  } catch (error) {
    console.error('加载模板失败:', error)
  } finally {
    isLoadingTemplates.value = false
  }
}

/**
 * 模板下拉选项
 */
const templateDropdownOptions = computed(() => {
  const options: Array<{
    key: string
    label: string
    type?: 'group' | 'divider'
    children?: Array<{ key: string; label: string }>
  }> = []

  // 确保 templates 是数组
  const templateList = templates.value || []

  // 收藏模板
  const favorites = templateList.filter(t => t.isFavorite)
  if (favorites.length > 0) {
    options.push({
      key: 'favorites',
      label: '我的收藏',
      type: 'group',
      children: favorites.slice(0, 5).map(t => ({
        key: `template:${t.id}`,
        label: t.title,
      })),
    })
  }

  // 常用模板（使用次数最多的）
  const popular = templateList
    .filter(t => !t.isFavorite)
    .sort((a, b) => b.useCount - a.useCount)
    .slice(0, 5)

  if (popular.length > 0) {
    if (options.length > 0) {
      options.push({ key: 'divider1', label: '', type: 'divider' })
    }
    options.push({
      key: 'popular',
      label: '常用模板',
      type: 'group',
      children: popular.map(t => ({
        key: `template:${t.id}`,
        label: t.title,
      })),
    })
  }

  // 分隔线 + 模板设置
  if (options.length > 0) {
    options.push({ key: 'divider2', label: '', type: 'divider' })
  }
  options.push({
    key: 'open-library',
    label: '📋 模板设置...',
  })

  return options
})

/**
 * 处理模板选择
 */
function handleTemplateSelect(key: string): void {
  if (key === 'open-library') {
    // 在编辑器中打开模板库
    if (openPromptLibraryInEditor) {
      openPromptLibraryInEditor()
    } else {
      message.warning('编辑器未就绪，请稍后再试')
    }
    return
  }

  // 使用模板
  if (key.startsWith('template:')) {
    const templateId = key.replace('template:', '')
    const template = templates.value.find(t => t.id === templateId)
    if (template) {
      handleUseTemplate(template.content)
    }
  }
}

// 组件挂载时加载模板
onMounted(() => {
  void loadTemplates()
  if (props.variant === 'ide') {
    void loadModels().then(() => syncModelFromSession())
  }
})

function chipLang(fileName: string): string {
  const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : ''
  const map: Record<string, string> = {
    ts: 'TS',
    tsx: 'TSX',
    js: 'JS',
    jsx: 'JSX',
    vue: 'VUE',
    md: 'MD',
    json: 'JSON',
    css: 'CSS',
    scss: 'SCSS',
    html: 'HTML',
    py: 'PY',
  }
  if (ext && map[ext]) return map[ext]
  if (ext) return ext.slice(0, 4).toUpperCase()
  return 'TXT'
}

/** 格式化字符数显示 */
function formatCharCount(count: number): string {
  if (count >= 10000) return `${(count / 1000).toFixed(1)}k`
  return count.toString()
}

function guessLangFromName(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : ''
  if (ext === 'vue') return 'vue'
  if (ext === 'ts' || ext === 'tsx') return 'typescript'
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'javascript'
  if (ext === 'md') return 'markdown'
  if (ext === 'json') return 'json'
  if (ext === 'css') return 'css'
  if (ext === 'html') return 'html'
  if (ext === 'py') return 'python'
  return ext || 'text'
}

function buildDisplayFromRefs(userText: string, refs: IdeCodeAttachment[]): string {
  const parts: string[] = []
  if (userText) parts.push(userText)
  const chips = refs.map(r => `@${r.fileName} (${r.startLine}-${r.endLine})`)
  if (chips.length) parts.push(chips.join(' '))
  return parts.join('\n')
}

function buildAgentBodyFromRefs(userText: string, refs: IdeCodeAttachment[]): string {
  const blocks: string[] = []
  if (userText) blocks.push(userText)
  for (const r of refs) {
    const lang =
      r.language && r.language !== 'plaintext' ? r.language : guessLangFromName(r.fileName)
    blocks.push(
      `### 工作区代码引用\n- 路径: \`${r.filePath}\`\n- 行号: ${r.startLine}–${r.endLine}\n\n\`\`\`${lang}\n${r.snippet}\n\`\`\``,
    )
  }
  return blocks.join('\n\n')
}

function removeCodeAttachment(id: string): void {
  codeAttachments.value = codeAttachments.value.filter(a => a.id !== id)
}

/** 移除终端输出附件 */
function removeTerminalAttachment(id: string): void {
  terminalAttachments.value = terminalAttachments.value.filter(a => a.id !== id)
}

const uploadedFiles = ref<UploadFileInfo[]>([])
const uploading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

/**
 * 计算当前会话ID
 */
const currentSessionId = computed(() => props.sessionId || '')

/**
 * 处理发送消息
 */
function handleSend() {
  const text = inputValue.value.trim()
  const hasIdeRefs = props.variant === 'ide' && codeAttachments.value.length > 0
  const hasTerminalRefs = props.variant === 'ide' && terminalAttachments.value.length > 0
  if ((!text && !hasIdeRefs && !hasTerminalRefs) || props.disabled) return

  if (props.variant === 'ide') {
    /** 构建终端输出部分 */
    const terminalParts = terminalAttachments.value.map(t => {
      const truncated = t.originalLength > t.content.length
        ? `\n\n> ⚠️ 原文 ${t.originalLength} 字符，已截断显示`
        : ''
      return `### 终端输出\n\`\`\`terminal\n${t.content}\n\`\`\`${truncated}`
    })

    /** 构建代码引用部分 */
    const codeParts = codeAttachments.value.map(r => {
      const lang =
        r.language && r.language !== 'plaintext' ? r.language : guessLangFromName(r.fileName)
      return `### 工作区代码引用\n- 路径: \`${r.filePath}\`\n- 行号: ${r.startLine}–${r.endLine}\n\n\`\`\`${lang}\n${r.snippet}\n\`\`\``
    })

    const allParts = []
    if (text) allParts.push(text)
    allParts.push(...codeParts, ...terminalParts)

    const payload = (hasIdeRefs || hasTerminalRefs)
      ? buildIdeLayeredUserMessage(
          buildDisplayFromRefs(text, codeAttachments.value),
          allParts.join('\n\n'),
        )
      : text

    emit('send', payload, selectedModelId.value || undefined)
    codeAttachments.value = []
    terminalAttachments.value = []
  } else {
    emit('send', inputValue.value)
  }
  inputValue.value = ''
}

/**
 * 处理键盘按下事件
 */
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

/**
 * 处理输入框聚焦
 */
function handleFocus() {
  emit('focus')
}

/**
 * 触发文件选择对话框
 */
function triggerFileSelect() {
  if (!currentSessionId.value) {
    message.warning('请先创建或选择一个会话')
    return
  }
  fileInputRef.value?.click()
}

/**
 * 处理文件选择变化
 */
async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const files = target.files
  
  if (!files || files.length === 0) return

  for (let i = 0; i < files.length; i++) {
    await uploadFile(files[i])
  }

  // 清空 input 以便重复选择同一文件
  target.value = ''
}

/**
 * 上传单个文件到工作区
 */
async function uploadFile(file: File): Promise<void> {
  if (!currentSessionId.value) {
    message.error('无法上传：缺少会话ID')
    return
  }

  // 文件大小验证（10MB）
  const maxSize = 10 * 1024 * 1024
  if (file.size > maxSize) {
    message.error(`文件 "${file.name}" 过大（最大 10MB）`)
    return
  }

  uploading.value = true

  try {
    const formData = new FormData()
    formData.append('file', file)

    const token = localStorage.getItem('token')
    const response = await fetch(
      `/api/workspace/${currentSessionId.value}/upload`,
      {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      }
    )

    const result = await response.json()

    if (result.success) {
      // 添加到本地文件列表显示
      const fileInfo: UploadFileInfo = {
        id: result.data.fileId,
        name: result.data.originalName,
        status: 'finished',
        percentage: 100,
        file: file as any
      }
      
      uploadedFiles.value.push(fileInfo)
      
      message.success(`✅ 文件 "${result.data.originalName}" 上传成功`)
      console.log('[FileUpload] 上传成功:', result.data)
    } else {
      message.error(`❌ 上传失败: ${result.error?.message || '未知错误'}`)
    }
  } catch (error) {
    console.error('[FileUpload] 上传错误:', error)
    message.error('❌ 网络错误，请重试')
  } finally {
    uploading.value = false
  }
}

/**
 * 移除已上传的文件（仅从UI移除，实际删除需要调用API）
 */
function removeFile(id: string | number) {
  const index = uploadedFiles.value.findIndex(f => f.id === id)
  if (index !== -1) {
    const fileName = uploadedFiles.value[index].name
    uploadedFiles.value.splice(index, 1)
    message.info(`已从列表移除: ${fileName}`)
  }
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/**
 * 将选中文本插入输入框（供 IDE「引用到对话」），不自动发送
 */
function appendToChatInput(text: string, options?: IdeAppendToChatOptions): void {
  if (props.variant === 'ide' && options?.terminalRef) {
    /** 处理终端输出引用：以芯片形式添加 */
    const tr = options.terminalRef
    const id = `terminal:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    const attachment: IdeTerminalAttachment = {
      id,
      preview: tr.preview,
      content: tr.content,
      originalLength: tr.originalLength,
    }
    terminalAttachments.value.push(attachment)
    void nextTick(() => {
      inputRef.value?.focus()
      const el = (inputRef.value as { $el?: HTMLElement } | null)?.$el
      const textarea = el?.querySelector?.('textarea') as HTMLTextAreaElement | undefined
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length
        textarea.scrollTop = textarea.scrollHeight
      }
    })
    return
  }

  if (props.variant === 'ide' && options?.codeRef) {
    const cr = options.codeRef
    const snippet = text.trim() || cr.snippet.trim()
    if (!snippet) return
    const id = `${cr.filePath}:${cr.startLine}-${cr.endLine}`
    const next: IdeCodeAttachment = { id, ...cr, snippet }
    const i = codeAttachments.value.findIndex(a => a.id === id)
    if (i >= 0) codeAttachments.value.splice(i, 1, next)
    else codeAttachments.value.push(next)
    void nextTick(() => {
      inputRef.value?.focus()
      const el = (inputRef.value as { $el?: HTMLElement } | null)?.$el
      const textarea = el?.querySelector?.('textarea') as HTMLTextAreaElement | undefined
      if (textarea) {
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length
        textarea.scrollTop = textarea.scrollHeight
      }
    })
    return
  }

  const trimmed = text.trim()
  if (!trimmed) return

  const label = options?.sourceLabel
  const language = options?.language
  let block = ''
  if (label) {
    block += `【${label}】\n`
  }
  if (language) {
    block += `\`\`\`${language}\n${trimmed}\n\`\`\``
  } else {
    block += trimmed
  }

  const cur = inputValue.value
  if (cur && cur.trim()) {
    inputValue.value = cur.replace(/\s+$/, '') + '\n\n' + block
  } else {
    inputValue.value = block
  }

  void nextTick(() => {
    inputRef.value?.focus()
    const el = (inputRef.value as { $el?: HTMLElement } | null)?.$el
    const textarea = el?.querySelector?.('textarea') as HTMLTextAreaElement | undefined
    if (textarea) {
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length
      textarea.scrollTop = textarea.scrollHeight
    }
  })
}

/**
 * 处理使用模板事件，将模板内容插入输入框
 */
function handleUseTemplate(content: string) {
  const cur = inputValue.value
  if (cur && cur.trim()) {
    inputValue.value = cur.replace(/\s+$/, '') + '\n\n' + content
  } else {
    inputValue.value = content
  }

  void nextTick(() => {
    inputRef.value?.focus()
    const el = (inputRef.value as { $el?: HTMLElement } | null)?.$el
    const textarea = el?.querySelector?.('textarea') as HTMLTextAreaElement | undefined
    if (textarea) {
      textarea.selectionStart = textarea.selectionEnd = textarea.value.length
      textarea.scrollTop = textarea.scrollHeight
    }
  })
}

defineExpose({
  focus: () => inputRef.value?.focus(),
  appendToChatInput,
})
</script>

<template>
  <div class="chat-input" :class="`chat-input--${variant || 'default'}`">
    <!-- IDE 变体：输入框容器（所有组件都在输入框内部） -->
    <div v-if="variant === 'ide'" class="input-container">
      <!-- 输入框 Header：AI角色标识 -->
      <div class="input-header">
        <span>claw-code</span>
      </div>

      <!-- 中间：输入框 + 代码引用 -->
      <div class="input-main-wrapper">
        <!-- 终端输出引用显示 -->
        <div v-if="terminalAttachments.length > 0" class="ide-terminal-refs">
          <div
            v-for="t in terminalAttachments"
            :key="t.id"
            class="ide-terminal-chip"
            :title="`终端输出 (${formatCharCount(t.originalLength)}字符)`"
          >
            <span class="ide-terminal-chip-icon">⌘</span>
            <span class="ide-terminal-chip-text">{{ t.preview }}</span>
            <span v-if="t.originalLength > t.content.length" class="ide-terminal-chip-truncated">已截断</span>
            <button
              type="button"
              class="ide-terminal-chip-x"
              aria-label="移除终端输出"
              @click="removeTerminalAttachment(t.id)"
            >
              ×
            </button>
          </div>
        </div>

        <!-- 代码引用显示 -->
        <div v-if="codeAttachments.length > 0" class="ide-code-refs">
          <div
            v-for="a in codeAttachments"
            :key="a.id"
            class="ide-code-chip"
            :title="a.filePath"
          >
            <span class="ide-code-chip-lang">{{ chipLang(a.fileName) }}</span>
            <span class="ide-code-chip-text">{{ a.fileName }} ({{ a.startLine }}-{{ a.endLine }})</span>
            <button
              type="button"
              class="ide-code-chip-x"
              aria-label="移除引用"
              @click="removeCodeAttachment(a.id)"
            >
              ×
            </button>
          </div>
        </div>

        <NInput
          ref="inputRef"
          v-model:value="inputValue"
          type="textarea"
          :placeholder="props.placeholder || 'Ask AI assistant...'"
          :autosize="{ minRows: 1, maxRows: 8 }"
          :disabled="disabled"
          @keydown="handleKeyDown"
          @focus="handleFocus"
        />
      </div>

      <!-- 底部：功能按钮栏 -->
      <div class="input-footer">
        <div class="left-tools">
          <!-- 提示词模板下拉选择器 -->
          <NDropdown
            :options="templateDropdownOptions"
            :disabled="disabled || isLoadingTemplates"
            trigger="click"
            placement="top-start"
            @select="handleTemplateSelect"
          >
            <NButton
              class="prompt-library-button"
              :disabled="disabled || isLoadingTemplates"
              :loading="isLoadingTemplates"
            >
              <template #icon>
                <NIcon><ReorderFourOutline /></NIcon>
              </template>
              模板
            </NButton>
          </NDropdown>
        </div>

        <div class="right-tools">
          <!-- 模型选择下拉 -->
          <NSelect
            v-if="variant === 'ide'"
            v-model:value="selectedModelId"
            :options="modelOptions"
            :disabled="disabled || modelOptions.length === 0"
            size="small"
            class="model-select-integrated"
            :consistent-menu-width="false"
          />

          <!-- 发送/停止按钮 -->
          <button
            class="send-btn-minimal"
            :class="{ 'can-send': inputValue.trim() || codeAttachments.length > 0 || terminalAttachments.length > 0, 'is-generating': isGenerating }"
            :disabled="(!inputValue.trim() && !(codeAttachments.length > 0) && !(terminalAttachments.length > 0)) || disabled"
            @click="isGenerating ? emit('stop') : handleSend()"
          >
            <NIcon v-if="!isGenerating" :size="16">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
              </svg>
            </NIcon>
            <NIcon v-else :size="16"><StopCircleOutline /></NIcon>
          </button>
        </div>
      </div>
    </div>

    <!-- 默认变体：简单的输入框（不改变原有功能布局） -->
    <div v-if="variant !== 'ide'" class="chat-input-body">
      <!-- 左侧：文件上传区域 -->
      <div class="upload-section">
        <input
          ref="fileInputRef"
          type="file"
          multiple
          style="display: none"
          @change="handleFileChange"
        />
        <div
          class="upload-button"
          :class="{ 'disabled': !sessionId || disabled }"
          :title="sessionId ? '上传文件到工作区' : '请先选择会话'"
          @click="triggerFileSelect"
        >
          <template v-if="uploading">
            <NSpin size="18" stroke="#6366f1" />
          </template>
          <template v-else>
            <NIcon :size="22" color="#6366f1">
              <CloudUploadOutline />
            </NIcon>
          </template>
          <span v-if="uploadedFiles.length > 0" class="upload-badge">
            {{ uploadedFiles.length }}
          </span>
        </div>
        <div v-if="uploadedFiles.length > 0" class="uploaded-files-list">
          <div v-for="file in uploadedFiles" :key="file.id" class="uploaded-file-item">
            <NTag size="small" round closable type="info" @close="removeFile(file.id)">
              <span class="file-name">{{ file.name }}</span>
            </NTag>
          </div>
        </div>
      </div>

      <!-- 中间：输入框 -->
      <div class="input-wrapper">
        <NInput
          ref="inputRef"
          v-model:value="inputValue"
          type="textarea"
          :placeholder="props.placeholder || '输入消息... (Shift+Enter 换行)'"
          :autosize="{ minRows: 3, maxRows: 8 }"
          :disabled="disabled"
          @keydown="handleKeyDown"
          @focus="handleFocus"
        />
      </div>

      <!-- 右侧：操作按钮 -->
      <div class="input-actions">
        <NButton
          class="prompt-library-button"
          :disabled="!sessionId || disabled"
          @click="openPromptLibrary"
        >
          <template #icon>
            <NIcon><ReorderFourOutline /></NIcon>
          </template>
          模板
        </NButton>
        <template v-if="isGenerating">
          <NButton type="warning" class="stop-button" @click="emit('stop')">
            <template #icon>
              <NIcon><StopCircleOutline /></NIcon>
            </template>
            停止
          </NButton>
        </template>
        <template v-else>
          <NButton
            type="primary"
            :disabled="!inputValue.trim() || disabled"
            class="send-button"
            @click="handleSend"
          >
            发送
          </NButton>
        </template>
      </div>
    </div>

  </div>
</template>

<style scoped>
.chat-input {
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 10px;
  padding: 10px;
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.chat-input-body {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.chat-input--ide {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 8px;
}

/* ========== IDE 变体：嵌入式输入框样式 ========== */

/* 1. 输入框容器：去掉 blur 和阴影，抹平"突兀感" */
.chat-input--ide .input-container {
  /* 使用纯色背景，与未点击时保持一致 */
  background-color: #1e1e1e !important;
  /* 彻底去掉阴影和磨砂玻璃效果 */
  backdrop-filter: none !important;
  box-shadow: none !important;

  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 12px !important;
  padding: 12px 16px !important; /* 精简 Padding */
  margin: 0;
  transition: border-color 0.2s, background-color 0.2s;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

/* 2. 聚焦时的状态：不改变背景色，只让边框稍微变亮一点（类似 Code 聚焦） */
.chat-input--ide .input-container:focus-within {
  /* 背景保持一致，防止跳跃 */
  background-color: #1e1e1e !important;
  /* 边框改为一个低调的深蓝色 */
  border-color: #007acc !important;
  /* 彻底去掉聚焦时的突兀阴影 */
  box-shadow: none !important;
}

/* 2. 解决"框中框"：彻底抹平 NInput */
.chat-input--ide :deep(.n-input),
.chat-input--ide :deep(.n-input-wrapper),
.chat-input--ide :deep(.n-input__border),
.chat-input--ide :deep(.n-input__state-border) {
  border: none !important;
  background-color: transparent !important;
  box-shadow: none !important;
  --n-border: none !important;
  --n-border-hover: none !important;
  --n-border-focus: none !important;
  --n-box-shadow-focus: none !important;
}

/* 彻底压制 NInput 的聚焦反馈 */
.chat-input--ide :deep(.n-input.n-input--focus) {
  background-color: transparent !important;
}

.chat-input--ide :deep(.n-input .n-input__state-border) {
  border: none !important;
  box-shadow: none !important;
}

/* ========== 抹平 NInput 内嵌样式 (IDE 变体) ========== */
.chat-input--ide :deep(.n-input),
.chat-input--ide :deep(.n-input-wrapper) {
  border: none !important;
  background-color: transparent !important;
  box-shadow: none !important;
  --n-border: none !important;
  --n-border-hover: none !important;
  --n-border-focus: none !important;
}

.chat-input--ide :deep(.n-input__textarea-el) {
  color: #d1d1d1 !important; /* 灰白色文本 */
  font-size: 14px !important;
  line-height: 1.6 !important;
  padding: 0 !important; /* 去掉 naive 默认 padding */
  background: transparent !important;
  caret-color: #007acc !important; /* 光标颜色与聚焦边框一致 */
}

/* 占位符颜色对齐 */
.chat-input--ide :deep(.n-input__placeholder) {
  color: #555 !important;
}

/* 移除 NInput 自带的 Padding，让内容受父容器控制 */
.chat-input--ide :deep(.n-input) {
  padding-left: 0 !important;
  padding-right: 0 !important;
  --n-padding-left: 0 !important;
  --n-padding-right: 0 !important;
}

/* 3. Header：弱化文本 */
.chat-input--ide .input-header {
  font-size: 12px;
  color: #888; /* 灰色，不抢戏 */
  margin-bottom: 6px;
  user-select: none;
  font-weight: 500;
}

/* AI Icon 已彻底去掉 */

/* 4. Footer：精细化排版 */
.chat-input--ide .input-footer {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  opacity: 0.9; /* 默认稍微淡一点 */
  transition: opacity 0.2s;
}

.chat-input--ide .input-container:focus-within .input-footer {
  opacity: 1;
}

/* 6. 模型选择器：融入背景，彻底去掉药丸样式 */
.model-select-integrated {
  width: auto;
  min-width: 100px;
  max-width: 160px;
}

/* 彻底抹平 Naive NSelect 的默认样式 */
.chat-input--ide .model-select-integrated :deep(.n-base-selection) {
  background-color: transparent !important; /* 彻底透明背景 */
  border: none !important; /* 去掉所有边框 */
  box-shadow: none !important; /* 去掉阴影 */
  --n-height: 24px !important; /* 更矮一点 */
  transition: color 0.2s;
}

/* 调整未展开时的文字样式：低调、灰色、等宽 */
.chat-input--ide .model-select-integrated :deep(.n-base-selection__render) {
  color: #888 !important; /* 灰色文本，不突兀 */
  font-size: 12px !important;
  font-family: var(--font-family-mono, 'Consolas', monospace);
  padding: 0 4px !important; /* 精简内边距 */
  justify-content: flex-end; /* 文字靠右对齐，靠近发送按钮 */
}

/* 调整右侧箭头颜色 */
.chat-input--ide .model-select-integrated :deep(.n-base-selection-arrow) {
  color: #666 !important;
  right: 0 !important;
}

/* 悬停时：弱化高亮，只让文字颜色变亮一点 */
.chat-input--ide .model-select-integrated:hover :deep(.n-base-selection__render),
.chat-input--ide .model-select-integrated.n-select--focus :deep(.n-base-selection__render) {
  color: #d1d1d1 !important; /* 文字变为灰白色 */
}

/* ========== 默认变体：输入框容器样式 ========== */
.input-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: #111111;
  border: 1px solid #2a2a2a;
  border-radius: 16px;
  padding: 16px 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-container:focus-within {
  border-color: #3a3a3a;
  box-shadow: 0 0 0 1px rgba(25, 195, 125, 0.15);
}

.input-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: #666;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.5px;
  user-select: none;
}

.model-selector-wrapper {
  display: flex;
  align-items: center;
}

.model-selector-wrapper :deep(.n-base-selection) {
  --n-height: 28px !important;
  font-size: 13px !important;
  background: transparent !important;
  border: none !important;
}

.model-selector-wrapper :deep(.n-base-selection .n-base-selection__render) {
  background: transparent !important;
}

.input-main-wrapper {
  flex: 1;
}

/* 彻底重置 NInput 样式 - 消除所有"框"特征 */
.input-main-wrapper :deep(.n-input) {
  --n-font-size: 16px !important;
  --n-border: none !important;
  --n-border-hover: none !important;
  --n-border-focus: none !important;
  --n-box-shadow-focus: none !important;
  --n-color: transparent !important;
  --n-color-focus: transparent !important;
  --n-color-disabled: transparent !important;
  /* 关键：去掉 NInput 默认给 Wrapper 加的左右 Padding */
  --n-padding-left: 0 !important;
  --n-padding-right: 0 !important;
  background: transparent !important;
}

/* 调整真实 textarea 元素的样式 */
.input-main-wrapper :deep(.n-input__textarea-el) {
  padding: 8px 0 !important; /* 只保留上下间距，左右设为 0 */
  background: transparent !important;
  color: #e5e5e5 !important;
  font-size: 16px !important;
  line-height: 1.6 !important;
  caret-color: #19c37d !important;
}

/* 让 Placeholder 也完全对齐 */
.input-main-wrapper :deep(.n-input__placeholder) {
  left: 0 !important;
  color: #444 !important;
}

/* 优化代码引用（Chip）的间距 */
.ide-code-refs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 10px 0;
  max-height: 80px;
  overflow-y: auto;
}

/* 终端输出引用芯片样式 */
.ide-terminal-refs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 10px 0;
  max-height: 80px;
  overflow-y: auto;
}

.ide-terminal-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 8px 4px 6px;
  border-radius: 6px;
  background: linear-gradient(135deg, #1a3a2a 0%, #1e2d2a 100%);
  border: 1px solid #23d18b33;
  font-size: 12px;
  color: #a7f3d0;
}

.ide-terminal-chip-icon {
  flex-shrink: 0;
  font-size: 11px;
  color: #23d18b;
}

.ide-terminal-chip-text {
  flex: 1;
  min-width: 0;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-family-mono, 'Consolas', monospace);
  font-size: 11px;
}

.ide-terminal-chip-truncated {
  flex-shrink: 0;
  font-size: 9px;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.15);
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 500;
}

.ide-terminal-chip-x {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #6ee7b7;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.ide-terminal-chip-x:hover {
  background: rgba(35, 209, 139, 0.15);
  color: #fff;
}
  margin-top: 4px;
  padding: 0;
}

.input-footer {
  margin-top: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 1. 基础按钮重置：去掉所有原生边框和背景 */
.icon-btn, .icon-btn-circle, .send-action-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  padding: 0;
  color: #64748b; /* 低调的深灰色 */
}

.icon-btn:hover, .icon-btn-circle:hover {
  color: #f1f5f9;
}

/* 5. 左侧工具栏 */
.left-tools {
  display: flex;
  align-items: center;
}

/* 右侧工具 */
.right-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}



/* 功能图标按钮样式 */
.action-icon-btn, .send-btn-minimal {
  background: transparent;
  border: none;
  padding: 6px;
  color: #666;
  cursor: pointer;
  display: flex;
  transition: all 0.2s;
}
.action-icon-btn:hover { color: #aaa; }

/* ========== 发送按钮样式 (IDE 变体) ========== */
.right-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}

.send-btn-minimal {
  background: transparent;
  border: none;
  padding: 4px;
  color: #666; /* 默认深灰色 */
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  border-radius: 4px;
}

.send-btn-minimal:hover:not(:disabled) {
  background-color: rgba(255, 255, 255, 0.05);
  color: #f1f5f9;
}

.send-btn-minimal.can-send {
  color: #007acc; /* 仅在有内容时点亮为蓝色 */
}
.send-btn-minimal.is-generating {
  color: #ef4444; /* 停止状态显红色 */
}

.send-btn-minimal:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 默认变体的停止按钮样式 */
.input-footer .stop-button {
  width: 32px !important;
  height: 32px !important;
  min-height: 32px !important;
  padding: 0 !important;
  font-size: 13px !important;
  border-radius: 8px !important;
  box-shadow: none !important;
}

/* 默认变体的模板按钮样式 */
.input-footer .prompt-library-button {
  height: 30px !important;
  min-height: 30px !important;
  padding: 0 10px !important;
  font-size: 12px !important;
  border-radius: 6px !important;
}

/* 模板按钮在footer中的样式 */
.input-footer .prompt-library-button :deep(.n-button__content) {
  gap: 4px;
}

/* ====== 左侧上传区域样式 ====== */
.upload-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding-bottom: 2px;
}

.upload-button {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--bg-secondary, rgba(99, 102, 241, 0.08));
  border: 2px dashed #6366f1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.upload-button:hover:not(.disabled) {
  background: rgba(99, 102, 241, 0.15);
  border-color: #818cf8;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
}

.upload-button:active:not(.disabled) {
  transform: translateY(0);
  background: rgba(99, 102, 241, 0.2);
}

.upload-button.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  border-color: #a5a6f6;
}

/* 上传数量角标 */
.upload-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4);
  animation: badgePulse 2s ease-in-out infinite;
}

@keyframes badgePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

/* 已上传文件列表 */
.uploaded-files-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 280px;
  overflow-x: auto;
  padding: 4px 0;
}

.uploaded-file-item {
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.file-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

/* ====== 输入框区域样式 ====== */
.input-wrapper {
  flex: 1;
  min-width: 0;
}

.input-wrapper :deep(.n-input) {
  background: var(--bg-secondary);
  border-radius: 12px;
}

.input-wrapper :deep(.n-input__input-el) {
  padding: 14px 18px !important;
  font-size: 15px;
  line-height: 1.6;
}

/* ====== 右侧操作区样式 ====== */
.input-actions {
  display: flex;
  align-items: flex-end;
  flex-shrink: 0;
  padding-bottom: 2px;
}

/* 发送按钮样式 - 绿色主题风格 */
.send-button {
  height: 56px !important;
  min-height: 56px !important;
  padding: 0 32px !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  border-radius: 14px !important;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%) !important;
  color: #ffffff !important;
  border: none !important;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
  position: relative;
  overflow: hidden;
}

.send-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transition: left 0.5s ease;
}

.send-button:hover:not(:disabled)::before {
  left: 100%;
}

.send-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%) !important;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(34, 197, 94, 0.4);
}

.send-button:active:not(:disabled) {
  background: linear-gradient(135deg, #16a34a 0%, #15803d 100%) !important;
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
}

.send-button:disabled {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%) !important;
  color: rgba(255, 255, 255, 0.5) !important;
  cursor: not-allowed;
  box-shadow: none;
}

/* 停止按钮 */
.stop-button {
  height: 56px !important;
  min-height: 56px !important;
  padding: 0 24px !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  border-radius: 12px !important;
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%) !important;
  color: #fff !important;
  border: none !important;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
}

.stop-button:hover {
  background: linear-gradient(135deg, #fb923c 0%, #f97316 100%) !important;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(249, 115, 22, 0.4);
}

.stop-button:active {
  transform: translateY(0);
}

.chat-input--ide .stop-button {
  height: 36px !important;
  min-height: 36px !important;
  padding: 0 14px !important;
  font-size: 13px !important;
  border-radius: 8px !important;
  box-shadow: none !important;
}

.chat-input--ide .stop-button:hover {
  transform: none;
}

/* 提示词模板库按钮 */
.prompt-library-button {
  height: 36px !important;
  min-height: 36px !important;
  padding: 0 12px !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  border-radius: 8px !important;
  background: transparent !important;
  color: rgba(255, 255, 255, 0.65) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  cursor: pointer;
  transition: all 0.2s ease;
}

.prompt-library-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08) !important;
  color: rgba(255, 255, 255, 0.9) !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
}

.prompt-library-button:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.12) !important;
}

.prompt-library-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.chat-input--ide .prompt-library-button {
  height: 30px !important;
  min-height: 30px !important;
  padding: 0 10px !important;
  font-size: 12px !important;
  border-radius: 6px !important;
}

.chat-input--ide .prompt-library-button:hover:not(:disabled) {
  transform: none;
}

/* ========== IDE 侧栏变体 ========== */
.ide-input-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-start;
}

.ide-model-select {
  flex: 0 1 auto;
  width: auto;
  min-width: 0;
  max-width: 200px;
}

.chat-input--ide .ide-input-toolbar :deep(.n-base-selection) {
  --n-height: 28px !important;
  font-size: 12px !important;
  background-color: #1e1e1e !important;
  border: 1px solid #3c3c3c !important;
}

.chat-input--ide .upload-section {
  flex-direction: row;
  align-items: flex-start;
}

.chat-input--ide .upload-button {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border-width: 1px;
  border-style: dashed;
  border-color: rgba(0, 122, 204, 0.65);
  background: rgba(0, 122, 204, 0.08);
}

.chat-input--ide .upload-button:hover:not(.disabled) {
  border-color: #007acc;
  background: rgba(0, 122, 204, 0.14);
  transform: none;
  box-shadow: none;
}

.chat-input--ide .uploaded-files-list {
  max-width: 100%;
  flex: 1;
}

.chat-input--ide .input-wrapper :deep(.n-input.n-input--textarea) {
  border-radius: 8px;
  background: #1a1a1a;
  /*
   * Naive 将 textarea 水平内边距放在 wrapper（--n-padding-left/right），
   * placeholder 与 textarea-el 的 padding-left 为 0。若只给 textarea-el 加左右 padding，
   * 会出现光标与占位符水平错位。
   */
  --n-padding-left: 12px;
  --n-padding-right: 12px;
}

.chat-input--ide .input-wrapper :deep(.n-input__textarea-el) {
  padding-left: 0 !important;
  padding-right: 0 !important;
  font-size: 13px !important;
  line-height: 1.55 !important;
  text-align: left !important;
  vertical-align: top !important;
  caret-color: #58a6ff;
  min-height: 72px !important;
  box-sizing: border-box !important;
  resize: none !important;
}

.ide-code-refs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
  max-height: 132px;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
  scrollbar-width: thin;
}

.ide-code-refs::-webkit-scrollbar {
  width: 6px;
}

.ide-code-refs::-webkit-scrollbar-thumb {
  background: #4a4d5c;
  border-radius: 3px;
}

.ide-code-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 8px 4px 6px;
  border-radius: 6px;
  background: #2a2d3a;
  border: 1px solid #3f4252;
  font-size: 12px;
  color: #e2e8f0;
}

.ide-code-chip-lang {
  flex-shrink: 0;
  min-width: 28px;
  text-align: center;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #42b883;
  font-family: var(--font-family-mono, 'Consolas', monospace);
}

.ide-code-chip-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-family-mono, 'Consolas', monospace);
}

.ide-code-chip-x {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #94a3b8;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}

.ide-code-chip-x:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}

.chat-input--ide .input-actions {
  align-self: flex-end;
}

.chat-input--ide .send-button {
  height: 36px !important;
  min-height: 36px !important;
  padding: 0 16px !important;
  font-size: 13px !important;
  border-radius: 8px !important;
  box-shadow: none !important;
}

.chat-input--ide .send-button:hover:not(:disabled) {
  transform: none;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .chat-input {
    flex-direction: column;
    gap: 8px;
  }

  .chat-input-body {
    flex-direction: column;
    align-items: stretch;
  }

  .upload-section {
    width: 100%;
    justify-content: flex-start;
  }

  .uploaded-files-list {
    max-width: 100%;
  }

  .send-button {
    width: 100%;
  }
}
</style>
