<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import type { IdeAppendToChatOptions, IdeCodeRefPayload } from '@/composables/useIdeChatAppend'
import { buildIdeLayeredUserMessage } from '@/utils/ideUserMessageMarkers'
import { NInput, NButton, NIcon, NSpin, NTag, NSelect, useMessage, NDrawer, NDrawerContent } from 'naive-ui'
import type { UploadFileInfo } from 'naive-ui'
import { CloudUploadOutline, StopCircleOutline, ReorderFourOutline, ImageOutline, HappyOutline, ChatboxEllipsesOutline } from '@vicons/ionicons5'
import { modelApi, type Model } from '@/api/modelApi'
import { useChatStore } from '@/stores/chat'
import PromptTemplateLibrary from './PromptTemplateLibrary.vue'

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

onMounted(() => {
  if (props.variant === 'ide') {
    void loadModels().then(() => syncModelFromSession())
  }
})

const inputValue = ref('')
const inputRef = ref<InstanceType<typeof NInput> | null>(null)
const message = useMessage()

interface IdeCodeAttachment extends IdeCodeRefPayload {
  id: string
}

const codeAttachments = ref<IdeCodeAttachment[]>([])

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
  if ((!text && !hasIdeRefs) || props.disabled) return

  if (props.variant === 'ide') {
    const payload =
      hasIdeRefs
        ? buildIdeLayeredUserMessage(
            buildDisplayFromRefs(text, codeAttachments.value),
            buildAgentBodyFromRefs(text, codeAttachments.value),
          )
        : text
    emit('send', payload, selectedModelId.value || undefined)
    codeAttachments.value = []
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

defineExpose({
  focus: () => inputRef.value?.focus(),
  appendToChatInput,
})

// 提示词模板库相关
const showPromptLibrary = ref(false)

function openPromptLibrary() {
  showPromptLibrary.value = true
}

function closePromptLibrary() {
  showPromptLibrary.value = false
}

function handleUseTemplate(content: string) {
  inputValue.value = content
  closePromptLibrary()
  nextTick(() => {
    inputRef.value?.focus()
  })
}

// ========== 底部工具栏功能 ==========

/**
 * 处理表情按钮点击
 */
function handleEmojiClick() {
  message.info('表情功能开发中...')
}

/**
 * 处理话题按钮点击
 */
function handleTopicClick() {
  message.info('话题功能开发中...')
}

/**
 * 处理图片按钮点击
 */
function handleImageClick() {
  // 触发文件选择，限制为图片类型
  if (!currentSessionId.value) {
    message.warning('请先创建或选择一个会话')
    return
  }
  // 设置 accept 属性为图片类型
  if (fileInputRef.value) {
    fileInputRef.value.accept = 'image/*'
  }
  fileInputRef.value?.click()
}
</script>

<template>
  <div class="chat-input" :class="`chat-input--${variant || 'default'}`">
    <div v-if="variant === 'ide'" class="ide-input-toolbar">
      <NSelect
        v-model:value="selectedModelId"
        :options="modelOptions"
        :disabled="disabled || modelOptions.length === 0"
        size="small"
        placeholder="模型"
        class="ide-model-select"
        :consistent-menu-width="false"
      />
    </div>

    <div class="chat-input-body">
    <!-- 左侧：文件上传区域（IDE 侧栏不展示上传） -->
    <div v-if="variant !== 'ide'" class="upload-section">
      <!-- 隐藏的文件输入框 -->
      <input
        ref="fileInputRef"
        type="file"
        multiple
        style="display: none"
        @change="handleFileChange"
      />
      
      <!-- 上传按钮 -->
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
          <NIcon :size="variant === 'ide' ? 18 : 22" :color="variant === 'ide' ? '#3b9eff' : '#6366f1'">
            <CloudUploadOutline />
          </NIcon>
        </template>
        
        <!-- 已上传文件数量角标 -->
        <span v-if="uploadedFiles.length > 0" class="upload-badge">
          {{ uploadedFiles.length }}
        </span>
      </div>

      <!-- 已上传文件预览列表 -->
      <div v-if="uploadedFiles.length > 0" class="uploaded-files-list">
        <div
          v-for="file in uploadedFiles"
          :key="file.id"
          class="uploaded-file-item"
          :title="`${file.name} (${formatFileSize(file.file?.size || 0)})`"
        >
          <NTag 
            size="small" 
            round 
            closable 
            type="info"
            @close="removeFile(file.id)"
          >
            <span class="file-name">{{ file.name }}</span>
          </NTag>
        </div>
      </div>
    </div>

    <!-- 中间：输入框 -->
    <div class="input-wrapper">
      <div v-if="variant === 'ide' && codeAttachments.length > 0" class="ide-code-refs">
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
      <div class="input-area">
        <NInput
          ref="inputRef"
          v-model:value="inputValue"
          type="textarea"
          :placeholder="props.placeholder || '输入消息... (Shift+Enter 换行)'"
          :rows="variant === 'ide' ? 3 : undefined"
          :autosize="variant === 'ide' ? false : { minRows: 3, maxRows: 8 }"
          :disabled="disabled"
          @keydown="handleKeyDown"
          @focus="handleFocus"
        >
          <template #suffix>
            <!-- 底部工具栏 - 悬浮在输入框内部右下角 -->
            <div v-if="variant !== 'ide'" class="input-toolbar">
              <!-- 提示词模板库按钮 -->
              <button
                type="button"
                class="toolbar-btn toolbar-btn-text"
                :disabled="!sessionId || disabled"
                title="提示词模板"
                @click="openPromptLibrary"
              >
                <NIcon :size="16">
                  <ReorderFourOutline />
                </NIcon>
                <span class="btn-text">模板</span>
              </button>

              <!-- 发送/停止按钮 -->
              <template v-if="isGenerating">
                <button
                  type="button"
                  class="toolbar-btn toolbar-btn-send stop-btn"
                  @click="emit('stop')"
                >
                  <NIcon :size="16">
                    <StopCircleOutline />
                  </NIcon>
                  <span class="btn-text">停止</span>
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="toolbar-btn toolbar-btn-send"
                  :disabled="(!inputValue.trim() && !(variant === 'ide' && codeAttachments.length > 0)) || disabled || (variant !== 'ide' && uploading)"
                  @click="handleSend"
                >
                  <span class="btn-text">发送</span>
                </button>
              </template>
            </div>
          </template>
        </NInput>
      </div>
    </div>
    </div>

    <!-- 右侧：发送 / 停止按钮 (仅 IDE 模式显示) -->
    <div v-if="variant === 'ide'" class="input-actions">
      <!-- 提示词模板库按钮 -->
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
        <NButton
          type="warning"
          class="stop-button"
          @click="emit('stop')"
        >
          <template #icon>
            <NIcon><StopCircleOutline /></NIcon>
          </template>
          停止
        </NButton>
      </template>
      <template v-else>
        <NButton
          type="primary"
          :disabled="(!inputValue.trim() && !(variant === 'ide' && codeAttachments.length > 0)) || disabled || (variant !== 'ide' && uploading)"
          class="send-button"
          @click="handleSend"
        >
          发送
        </NButton>
      </template>
    </div>

    <!-- 提示词模板库抽屉 -->
    <NDrawer
      v-model:show="showPromptLibrary"
      :width="500"
      placement="right"
    >
      <NDrawerContent title="提示词模板库" :native-scrollbar="false" closable>
        <PromptTemplateLibrary
          :session-id="sessionId"
          @use-template="handleUseTemplate"
          @close="closePromptLibrary"
        />
      </NDrawerContent>
    </NDrawer>
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

.chat-input--ide .chat-input-body {
  width: 100%;
  align-items: stretch;
}

.chat-input--ide .input-wrapper {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
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

.input-area {
  position: relative;
  display: flex;
  flex-direction: column;
}

/* 输入框容器需要相对定位，以便工具栏绝对定位 */
.input-area {
  position: relative;
  width: 100%;
}

/* NInput 的 suffix 插槽样式 */
.input-area :deep(.n-input__suffix) {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
}

/* 调整 textarea 的内边距，为右边的按钮留出空间 */
.input-area :deep(.n-input__textarea-el) {
  padding-right: 160px !important;
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

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.2s ease;
}

.toolbar-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
}

.toolbar-btn:active:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
}

.toolbar-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 带文字的按钮 - 模板按钮 */
.toolbar-btn-text {
  width: auto;
  padding: 0 14px;
  height: 36px;
  gap: 6px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
}

.toolbar-btn-text:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.95);
  border-color: rgba(255, 255, 255, 0.2);
}

/* 发送按钮 */
.toolbar-btn-send {
  width: auto;
  padding: 0 20px;
  height: 36px;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  border-radius: 10px;
  border: none;
}

.toolbar-btn-send:hover:not(:disabled) {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.35);
}

.toolbar-btn-send:disabled {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
  color: rgba(255, 255, 255, 0.5);
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* 停止按钮 */
.stop-btn {
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
}

.stop-btn:hover {
  background: linear-gradient(135deg, #fb923c 0%, #f97316 100%);
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.35);
}

.btn-text {
  font-size: 13px;
  white-space: nowrap;
}

/* ====== 右侧操作区样式（已移入输入框内部，保留 IDE 模式样式） ====== */
.input-actions {
  display: none;
}

/* IDE 模式下保留右侧操作区 */
.chat-input--ide .input-actions {
  display: flex;
  align-items: flex-end;
  flex-shrink: 0;
  padding-bottom: 2px;
  gap: 8px;
}

/* IDE 模式下的按钮样式 */
.chat-input--ide .send-button {
  height: 36px !important;
  min-height: 36px !important;
  padding: 0 16px !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  border-radius: 8px !important;
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%) !important;
  color: #ffffff !important;
  border: none !important;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
}

.chat-input--ide .send-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%) !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
}

.chat-input--ide .send-button:disabled {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%) !important;
  color: rgba(255, 255, 255, 0.5) !important;
  cursor: not-allowed;
  box-shadow: none;
}

.chat-input--ide .stop-button {
  height: 36px !important;
  min-height: 36px !important;
  padding: 0 14px !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  border-radius: 8px !important;
  background: linear-gradient(135deg, #f97316 0%, #ea580c 100%) !important;
  color: #fff !important;
  border: none !important;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
}

.chat-input--ide .stop-button:hover {
  background: linear-gradient(135deg, #fb923c 0%, #f97316 100%) !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
}

.chat-input--ide .prompt-library-button {
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

.chat-input--ide .prompt-library-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08) !important;
  color: rgba(255, 255, 255, 0.9) !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
}

.chat-input--ide .prompt-library-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
