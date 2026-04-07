<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { NInput, NButton, NIcon, NSpin, NTag, NSelect, useMessage } from 'naive-ui'
import type { UploadFileInfo } from 'naive-ui'
import { CloudUploadOutline } from '@vicons/ionicons5'
import { modelApi, type Model } from '@/api/modelApi'
import { useChatStore } from '@/stores/chat'

const props = defineProps<{
  disabled?: boolean
  sidebarCollapsed?: boolean
  sessionId?: string
  /** 占位文案（IDE 等场景可传入英文） */
  placeholder?: string
  /** default：全屏聊天大输入区；ide：侧栏紧凑 + 模型选择 */
  variant?: 'default' | 'ide'
}>()

const emit = defineEmits<{
  send: [content: string, modelId?: string]
  focus: []
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
  if (!inputValue.value.trim() || props.disabled) return
  if (props.variant === 'ide') {
    emit('send', inputValue.value, selectedModelId.value || undefined)
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

// 暴露聚焦方法
defineExpose({
  focus: () => inputRef.value?.focus()
})
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
    <!-- 左侧：文件上传区域 -->
    <div class="upload-section">
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
        @click="triggerFileSelect"
        :title="sessionId ? '上传文件到工作区' : '请先选择会话'"
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
      <NInput
        ref="inputRef"
        v-model:value="inputValue"
        type="textarea"
        :placeholder="props.placeholder || '输入消息... (Shift+Enter 换行)'"
        :autosize="variant === 'ide' ? { minRows: 2, maxRows: 6 } : { minRows: 3, maxRows: 8 }"
        :disabled="disabled"
        @keydown="handleKeyDown"
        @focus="handleFocus"
      />
    </div>

    <!-- 右侧：发送按钮 -->
    <div class="input-actions">
      <NButton
        type="primary"
        :disabled="!inputValue.trim() || disabled || uploading"
        class="send-button"
        @click="handleSend"
      >
        发送
      </NButton>
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

.chat-input--ide .chat-input-body {
  width: 100%;
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

/* 发送按钮样式 */
.send-button {
  height: 56px !important;
  min-height: 56px !important;
  padding: 0 32px !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  border-radius: 12px !important;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%) !important;
  color: #ffffff !important;
  border: none !important;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.send-button:hover:not(:disabled) {
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%) !important;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
}

.send-button:active:not(:disabled) {
  background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%) !important;
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

.send-button:disabled {
  background: linear-gradient(135deg, #a5a6f6 0%, #818cf8 100%) !important;
  color: rgba(255, 255, 255, 0.6) !important;
  cursor: not-allowed;
  box-shadow: none;
}

/* ========== IDE 侧栏变体 ========== */
.ide-input-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ide-model-select {
  flex: 1;
  min-width: 0;
  max-width: 100%;
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

.chat-input--ide .input-wrapper :deep(.n-input) {
  border-radius: 8px;
  background: #1a1a1a;
}

.chat-input--ide .input-wrapper :deep(.n-input__textarea-el) {
  padding: 8px 10px !important;
  font-size: 13px !important;
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
