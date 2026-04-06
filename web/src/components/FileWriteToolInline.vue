<script setup lang="ts">
/**
 * 文件写入工具内联展示组件
 * 动态展示 Agent 正在写入文件的进度状态
 * 支持 pending(等待中) / executing(写入中) / completed(完成) / error(错误) 四种状态
 */
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { NIcon, NTag, NSpin, NProgress, NButton, NTooltip } from 'naive-ui'
import {
  DocumentTextOutline,
  CheckmarkCircleOutline,
  CloseCircleOutline,
  TimeOutline,
  DownloadOutline,
  EyeOutline,
} from '@vicons/ionicons5'
import type { ToolCall } from '@/types/tool'

const props = defineProps<{
  /** 工具调用数据 */
  toolCall: ToolCall
  /** 是否展开详情 */
  expanded?: boolean
}>()

const emit = defineEmits<{
  (e: 'view-file', filePath: string, content: string): void
  (e: 'download-file', filePath: string, content: string): void
}>()

/** 展开状态 */
const isExpanded = ref(props.expanded ?? false)

/** 模拟写入进度（仅用于 executing 状态的动画效果） */
const writeProgress = ref(0)
let progressTimer: ReturnType<typeof setInterval> | null = null

/** 从工具输入中提取文件路径 */
const filePath = computed(() => {
  const input = props.toolCall.toolInput as Record<string, unknown> | undefined
  return (input?.file_path || input?.filePath || '未知文件') as string
})

/** 从工具输入中提取文件内容（预览用） */
const fileContent = computed(() => {
  const input = props.toolCall.toolInput as Record<string, unknown> | undefined
  return (input?.content || '') as string
})

/** 获取文件名（从路径中提取） */
const fileName = computed(() => {
  const path = filePath.value
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
})

/** 获取文件扩展名 */
const fileExtension = computed(() => {
  const name = fileName.value
  const dotIndex = name.lastIndexOf('.')
  return dotIndex > 0 ? name.substring(dotIndex + 1).toLowerCase() : ''
})

/** 计算内容行数 */
const lineCount = computed(() => {
  if (!fileContent.value) return 0
  return fileContent.value.split('\n').length
})

/** 获取内容大小（字符数） */
const contentSize = computed(() => {
  if (!fileContent.value) return '0 B'
  const len = new Blob([fileContent.value]).size
  if (len < 1024) return `${len} B`
  if (len < 1024 * 1024) return `${(len / 1024).toFixed(1)} KB`
  return `${(len / (1024 * 1024)).toFixed(1)} MB`
})

/** 状态配置映射 */
const statusConfig = computed(() => {
  const configs: Record<string, {
    label: string
    color: string
    icon: typeof DocumentTextOutline
    animating: boolean
  }> = {
    pending: {
      label: '准备写入',
      color: '#f59e0b',
      icon: TimeOutline,
      animating: false,
    },
    executing: {
      label: '正在写入...',
      color: '#3b82f6',
      icon: DocumentTextOutline,
      animating: true,
    },
    completed: {
      label: '写入完成',
      color: '#22c55e',
      icon: CheckmarkCircleOutline,
      animating: false,
    },
    error: {
      label: '写入失败',
      color: '#ef4444',
      icon: CloseCircleOutline,
      animating: false,
    },
  }
  return configs[props.toolCall.status] || configs.pending
})

/** 操作类型：新建 or 更新 */
const operationType = computed(() => {
  const output = props.toolCall.toolOutput as Record<string, unknown> | null | undefined
  if (output && typeof output.type === 'string') {
    return output.type === 'create' ? 'create' : 'update'
  }
  // 根据状态推断：completed 且有输出时默认为 create（新文件）
  if (props.toolCall.status === 'completed') return 'create'
  return 'pending'
})

/** 操作类型标签 */
const operationLabel = computed(() => {
  switch (operationType.value) {
    case 'create': return '新建文件'
    case 'update': return '更新文件'
    default: return '待定'
  }
})

/** 格式化文件路径（缩短显示） */
const displayPath = computed(() => {
  const path = filePath.value
  if (path.length <= 50) return path
  const start = path.substring(0, 25)
  const end = path.substring(path.length - 20)
  return `${start}...${end}`
})

/** 内容预览（最多显示前5行） */
const contentPreview = computed(() => {
  if (!fileContent.value) return ''
  const lines = fileContent.value.split('\n')
  const previewLines = lines.slice(0, 5)
  let preview = previewLines.join('\n')
  if (lines.length > 5) preview += '\n...'
  return preview
})

/** 获取文件类型图标颜色 */
const getFileTypeColor = () => {
  const ext = fileExtension.value
  const colors: Record<string, string> = {
    ts: '#3178c6', tsx: '#3178c6', js: '#f7df1e', jsx: '#61dafb',
    vue: '#42b883', py: '#3776ab', java: '#ed8b00', go: '#00add8',
    rs: '#dea584', c: '#555555', cpp: '#00599c', rb: '#cc342d',
    php: '#777bb4', swift: '#fa7343', kt: '#a97bff', md: '#083fa1',
    json: '#cb8c07', yaml: '#cb171e', yml: '#cb171e', html: '#e34c26',
    css: '#264de4', scss: '#cd6799', sql: '#e38c00', sh: '#89e051',
    bash: '#89e051', dockerfile: '#384d54', toml: '#9c4121', xml: '#e34c26',
  }
  return colors[ext] || '#6366f1'
}

/** 切换展开/收起 */
function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

/** 触发查看文件事件 */
function handleViewFile() {
  emit('view-file', filePath.value, fileContent.value)
}

/** 触发下载文件事件 */
function handleDownloadFile() {
  emit('download-file', filePath.value, fileContent.value)
}

/** 模拟进度更新 */
onMounted(() => {
  if (props.toolCall.status === 'executing') {
    progressTimer = setInterval(() => {
      if (writeProgress.value < 90) {
        writeProgress.value += Math.random() * 15
        if (writeProgress.value > 90) writeProgress.value = 90
      }
    }, 300)
  }
  // 如果已经是完成状态，直接设为100%
  if (props.toolCall.status === 'completed') {
    writeProgress.value = 100
  }
})

onUnmounted(() => {
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
})
</script>

<template>
  <div
    class="file-write-tool"
    :class="[
      `status-${toolCall.status}`,
      `operation-${operationType}`,
      { expanded: isExpanded, animating: statusConfig.animating }
    ]"
  >
    <!-- 工具头部 -->
    <div class="fw-header" @click="toggleExpand">
      <!-- 左侧：图标和工具信息 -->
      <div class="fw-main">
        <div class="fw-icon" :style="{ background: getFileTypeColor() + '20', borderColor: getFileTypeColor() + '60' }">
          <template v-if="statusConfig.animating">
            <NSpin size="16" :stroke="statusConfig.color" />
          </template>
          <template v-else>
            <NIcon :size="18" :component="statusConfig.icon" :color="statusConfig.color" />
          </template>
        </div>
        
        <div class="fw-info">
          <div class="fw-title-row">
            <span class="fw-tool-name">FileWrite</span>
            <NTag size="small" round :bordered="false" :style="{
              background: statusConfig.color + '20',
              color: statusConfig.color,
              '--n-font-weight-strong': '500',
            } as any">
              {{ statusConfig.label }}
            </NTag>
          </div>
          <div class="fw-file-path" :title="filePath">
            {{ displayPath }}
          </div>
        </div>
      </div>

      <!-- 右侧：操作信息 -->
      <div class="fw-status-area">
        <!-- 执行中的进度条 -->
        <div v-if="statusConfig.animating" class="fw-progress-mini">
          <NProgress
            type="line"
            :percentage="Math.round(writeProgress)"
            :show-indicator="false"
            :height="4"
            :rail-color="'rgba(255,255,255,0.06)'"
            :fill-color="statusConfig.color"
            style="width: 80px"
          />
        </div>

        <!-- 操作类型标签 -->
        <span v-if="operationType !== 'pending'" class="fw-operation-tag" :class="operationType">
          {{ operationLabel }}
        </span>

        <!-- 展开/收起按钮 -->
        <span class="fw-expand-btn">{{ isExpanded ? '▼' : '▶' }}</span>
      </div>
    </div>

    <!-- 展开内容区 -->
    <Transition name="fw-slide">
      <div v-if="isExpanded" class="fw-body">
        <!-- 文件元信息 -->
        <div class="fw-meta-grid">
          <div class="meta-item">
            <span class="meta-label">文件名</span>
            <span class="meta-value">{{ fileName }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">类型</span>
            <span class="meta-value">
              <span class="file-ext-tag" :style="{ background: getFileTypeColor() + '20', color: getFileTypeColor() }">
                .{{ fileExtension || '无扩展名' }}
              </span>
            </span>
          </div>
          <div class="meta-item">
            <span class="meta-label">行数</span>
            <span class="meta-value">{{ lineCount }} 行</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">大小</span>
            <span class="meta-value">{{ contentSize }}</span>
          </div>
        </div>

        <!-- 写入进度（执行中状态） -->
        <div v-if="statusConfig.animating" class="fw-progress-section">
          <div class="progress-header">
            <span class="progress-title">写入进度</span>
            <span class="progress-percent">{{ Math.round(writeProgress) }}%</span>
          </div>
          <NProgress
            type="line"
            :percentage="Math.round(writeProgress)"
            :height="8"
            :rail-color="'rgba(255,255,255,0.06)'"
            :fill-color="statusConfig.color"
            :indicator-text-color="'#fff'"
          />
          <div class="progress-hint">正在将内容写入磁盘...</div>
        </div>

        <!-- 完成状态的结果展示 -->
        <div v-if="toolCall.status === 'completed'" class="fw-result-section">
          <div class="result-header">
            <NIcon :size="16" :component="CheckmarkCircleOutline" color="#22c55e" />
            <span>文件{{ operationType === 'create' ? '创建' : '更新' }}成功</span>
          </div>
          
          <!-- 操作按钮组 -->
          <div class="result-actions">
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="small" type="primary" secondary @click.stop="handleViewFile">
                  <template #icon><NIcon :size="14" :component="EyeOutline" /></template>
                  查看
                </NButton>
              </template>
              预览文件完整内容
            </NTooltip>
            
            <NTooltip trigger="hover">
              <template #trigger>
                <NButton size="small" secondary @click.stop="handleDownloadFile">
                  <template #icon><NIcon :size="14" component={DownloadOutline} /></template>
                  下载
                </NButton>
              </template>
              下载文件到本地
            </NTooltip>
          </div>
        </div>

        <!-- 错误状态 -->
        <div v-if="toolCall.status === 'error'" class="fw-error-section">
          <div class="error-header">
            <NIcon :size="16" component={CloseCircleOutline} color="#ef4444" />
            <span>文件写入失败</span>
          </div>
          <div v-if="toolCall.error" class="error-content">{{ toolCall.error }}</div>
          <div v-else class="error-content">未知错误，请检查文件权限或路径是否正确</div>
        </div>

        <!-- 内容预览 -->
        <div v-if="fileContent" class="fw-preview-section">
          <div class="preview-header">
            <span class="preview-title">内容预览</span>
            <span class="preview-lines">{{ lineCount }} 行</span>
          </div>
          <pre class="preview-code"><code>{{ contentPreview }}</code></pre>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.file-write-tool {
  background: rgba(30, 30, 60, 0.5);
  border-radius: 10px;
  border: 1px solid rgba(99, 102, 241, 0.15);
  overflow: hidden;
  transition: all 0.25s ease;
}

.file-write-tool:hover {
  border-color: rgba(99, 102, 241, 0.35);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
}

/* 状态边框 */
.file-write-tool.status-completed {
  border-left: 3px solid #22c55e;
}

.file-write-tool.status-error {
  border-left: 3px solid #ef4444;
  background: rgba(60, 20, 20, 0.3);
}

.file-write-tool.status-executing {
  border-left: 3px solid #3b82f6;
  animation: borderPulse 2s ease-in-out infinite;
}

@keyframes borderPulse {
  0%, 100% { border-left-color: #3b82f6; box-shadow: -2px 0 8px rgba(59, 130, 246, 0.2); }
  50% { border-left-color: #60a5fa; box-shadow: -2px 0 16px rgba(59, 130, 246, 0.4); }
}

.file-write-tool.status-pending {
  border-left: 3px solid #f59e0b;
}

/* 头部区域 */
.fw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.2s ease;
  gap: 12px;
}

.fw-header:hover {
  background: rgba(50, 50, 100, 0.25);
}

.fw-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.fw-icon {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1.5px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.25s ease;
}

.file-write-tool.animating .fw-icon {
  animation: iconPulse 1.5s ease-in-out infinite;
}

@keyframes iconPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}

.fw-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.fw-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fw-tool-name {
  font-size: 13px;
  font-weight: 700;
  color: #e5e7eb;
  font-family: 'Monaco', 'Menlo', monospace;
  letter-spacing: -0.3px;
}

.fw-file-path {
  font-size: 11.5px;
  color: #9ca3af;
  font-family: 'Monaco', 'Menlo', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}

.fw-status-area {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.fw-progress-mini {
  display: flex;
  align-items: center;
}

.fw-operation-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.fw-operation-tag.create {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.fw-operation-tag.update {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.fw-expand-btn {
  font-size: 9px;
  color: #6b7280;
  transition: transform 0.2s ease;
}

.file-write-tool.expanded .fw-expand-btn {
  transform: rotate(0deg);
}

/* 展开内容区 */
.fw-body {
  padding: 0 14px 14px;
  border-top: 1px solid rgba(99, 102, 241, 0.1);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 元信息网格 */
.fw-meta-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  padding-top: 12px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.meta-label {
  font-size: 10px;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.meta-value {
  font-size: 12px;
  color: #d1d5db;
  font-weight: 500;
}

.file-ext-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-weight: 600;
}

/* 进度区域 */
.fw-progress-section {
  padding: 12px;
  background: rgba(30, 30, 60, 0.5);
  border-radius: 8px;
  border: 1px solid rgba(59, 130, 246, 0.15);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.progress-title {
  font-size: 12px;
  font-weight: 600;
  color: #93c5fd;
}

.progress-percent {
  font-size: 13px;
  font-weight: 700;
  color: #60a5fa;
  font-family: 'Monaco', 'Menlo', monospace;
}

.progress-hint {
  margin-top: 6px;
  font-size: 11px;
  color: #6b7280;
  text-align: center;
}

/* 结果区域 */
.fw-result-section {
  padding: 12px;
  background: rgba(34, 197, 94, 0.06);
  border-radius: 8px;
  border: 1px solid rgba(34, 197, 94, 0.15);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #4ade80;
  margin-bottom: 10px;
}

.result-actions {
  display: flex;
  gap: 8px;
}

/* 错误区域 */
.fw-error-section {
  padding: 12px;
  background: rgba(239, 68, 68, 0.06);
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.15);
}

.error-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #fca5a5;
  margin-bottom: 8px;
}

.error-content {
  font-size: 12px;
  color: #f87171;
  line-height: 1.6;
  word-break: break-word;
}

/* 内容预览 */
.fw-preview-section {
  padding: 0;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  padding-top: 4px;
}

.preview-title {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.preview-lines {
  font-size: 10px;
  color: #6b7280;
}

.preview-code {
  background: rgba(15, 15, 30, 0.85);
  border-radius: 6px;
  padding: 10px 12px;
  margin: 0;
  font-size: 11px;
  font-family: 'Monaco', 'Menlo', 'Fira Code', monospace;
  color: #a5b4fc;
  line-height: 1.55;
  max-height: 180px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  border: 1px solid rgba(99, 102, 241, 0.1);
}

/* Transition 动画 */
.fw-slide-enter-active,
.fw-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.fw-slide-enter-from,
.fw-slide-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  transform: translateY(-8px);
}

.fw-slide-enter-to,
.fw-slide-leave-from {
  opacity: 1;
  max-height: 500px;
  transform: translateY(0);
}

/* 响应式适配 */
@media (max-width: 640px) {
  .fw-meta-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .fw-file-path {
    max-width: 160px;
  }
}
</style>
