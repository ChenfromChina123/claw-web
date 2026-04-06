<script setup lang="ts">
import { ref, computed } from 'vue'
import { NInput, NButton, NUpload, NIcon, NSpin, NTag, useMessage } from 'naive-ui'
import type { UploadFileInfo } from 'naive-ui'
import { PaperclipOutline, CloseOutline } from '@vicons/ionicons5'

const props = defineProps<{
  disabled?: boolean
  sidebarCollapsed?: boolean
  sessionId?: string
}>()

const emit = defineEmits<{
  send: [content: string]
  focus: []
}>()

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
  emit('send', inputValue.value)
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
  <div class="chat-input">
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
          <NIcon size="22" color="#6366f1">
            <PaperclipOutline />
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
          :title="`${file.name} (${formatFileSize((file.file as File)?.size || 0)})`}"
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
        placeholder="输入消息... (Shift+Enter 换行)"
        :autosize="{ minRows: 3, maxRows: 8 }"
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

/* 响应式设计 */
@media (max-width: 768px) {
  .chat-input {
    flex-direction: column;
    gap: 8px;
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
