<script setup lang="ts">
/**
 * Agent 文件输出卡片组件
 * 当 Agent 使用输出命令时，在对话框中弹出此 UI
 * 支持查看、预览、下载等多种操作
 * 兼容所有文件类型（文本、图片、二进制等）
 */
import { computed, ref } from 'vue'
import {
  NIcon, NTag, NButton, NTooltip, NSpin, NModal,
  NCollapse, NCollapseItem, NCode, useMessage
} from 'naive-ui'
import {
  DocumentTextOutline,
  DownloadOutline,
  EyeOutline,
  CopyOutline,
  ImageOutline,
  FilmOutline,
  MusicalNotesOutline,
  ArchiveOutline,
  GridOutline,
  CheckmarkCircleOutline,
} from '@vicons/ionicons5'

const message = useMessage()

/** 文件输出数据接口 */
interface FileOutputData {
  /** 文件名 */
  fileName: string
  /** 文件路径 */
  filePath: string
  /** 文件内容（Base64 或纯文本） */
  content: string
  /** MIME 类型 */
  mimeType?: string
  /** 文件大小（字节） */
  size?: number
  /** 描述信息 */
  description?: string
  /** 是否为 Base64 编码 */
  isBase64?: boolean
}

const props = defineProps<{
  /** 文件输出数据 */
  file: FileOutputData
  /** 卡片样式变体 */
  variant?: 'compact' | 'full'
}>()

const emit = defineEmits<{
  (e: 'download', file: FileOutputData): void
  (e: 'preview', file: FileOutputData): void
}>()

/** 是否显示详情弹窗 */
const showDetailModal = ref(false)

/** 当前激活的 Tab */
const activeTab = ref<'preview' | 'info'>('preview')

/** 复制状态 */
const copied = ref(false)

/** 从文件名提取扩展名 */
const fileExtension = computed(() => {
  const name = props.file.fileName
  const dotIndex = name.lastIndexOf('.')
  return dotIndex > 0 ? name.substring(dotIndex + 1).toLowerCase() : ''
})

/** 判断文件类别 */
const fileCategory = computed(() => {
  const ext = fileExtension.value
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'gifv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio'
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'archive'
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'document'
  return 'text'
})

/** 获取文件类型图标 */
const categoryIcon = computed(() => {
  switch (fileCategory.value) {
    case 'image': return ImageOutline
    case 'video': return FilmOutline
    case 'audio': return MusicalNotesOutline
    case 'archive': return ArchiveOutline
    default: return DocumentTextOutline
  }
})

/** 获取文件类型颜色 */
const categoryColor = computed(() => {
  switch (fileCategory.value) {
    case 'image': return '#f59e0b'
    case 'video': return '#ef4444'
    case 'audio': return '#a855f7'
    case 'archive': return '#f97316'
    case 'document': return '#3b82f6'
    default: return '#22c55e'
  }
})

/** 获取文件类型标签 */
const categoryLabel = computed(() => {
  switch (fileCategory.value) {
    case 'image': return '图片'
    case 'video': return '视频'
    case 'audio': return '音频'
    case 'archive': return '压缩包'
    case 'document': return '文档'
    default: return '文本'
  }
})

/** 格式化文件大小 */
const formattedSize = computed(() => {
  const size = props.file.size || (props.file.content ? new Blob([props.file.content]).size : 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
})

/** 解码后的文本内容（用于预览） */
const decodedContent = computed(() => {
  try {
    if (props.file.isBase64) {
      return atob(props.file.content)
    }
    return props.file.content
  } catch {
    return '[无法解码的内容]'
  }
})

/** 是否支持文本预览 */
const canPreviewAsText = computed(() => {
  return ['text', 'document'].includes(fileCategory.value)
})

/** 是否支持内联预览 */
const canInlinePreview = computed(() => {
  return ['image', 'video', 'audio'].includes(fileCategory.value)
})

/** 内联预览 URL（用于图片等） */
const inlinePreviewUrl = computed(() => {
  if (!canInlinePreview.value) return ''
  try {
    const mime = props.file.mimeType || guessMimeType()
    const base64 = props.file.isBase64 ? props.file.content : btoa(props.file.content)
    return `data:${mime};base64,${base64}`
  } catch {
    return ''
  }
})

/**
 * 根据扩展名猜测 MIME 类型
 */
function guessMimeType(): string {
  const ext = fileExtension.value
  const mimeMap: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
    pdf: 'application/pdf', json: 'application/json',
    html: 'text/html', css: 'text/css', js: 'text/javascript',
    ts: 'text/typescript', xml: 'application/xml',
  }
  return mimeMap[ext] || 'application/octet-stream'
}

/**
 * 处理下载事件
 */
function handleDownload() {
  emit('download', props.file)
}

/**
 * 处理预览事件
 */
function handlePreview() {
  if (canInlinePreview.value) {
    showDetailModal.value = true
  } else {
    showDetailModal.value = true
  }
  emit('preview', props.file)
}

/**
 * 复制文本内容到剪贴板
 */
async function handleCopyContent() {
  try {
    await navigator.clipboard.writeText(decodedContent.value)
    copied.value = true
    message.success('内容已复制到剪贴板')
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    message.error('复制失败')
  }
}
</script>

<template>
  <div class="file-output-card" :class="[`category-${fileCategory}`, `variant-${variant || 'compact'}`]">
    <!-- 紧凑模式 -->
    <template v-if="variant === 'compact'">
      <div class="card-compact" @click="handlePreview">
        <!-- 图标 -->
        <div class="card-icon" :style="{ background: categoryColor + '18', borderColor: categoryColor + '40' }">
          <NIcon :size="20" :component="categoryIcon" :color="categoryColor" />
        </div>

        <!-- 信息 -->
        <div class="card-info">
          <div class="card-name" :title="file.fileName">{{ file.fileName }}</div>
          <div class="card-meta">
            <span class="meta-type">{{ categoryLabel }}</span>
            <span class="meta-sep">·</span>
            <span class="meta-size">{{ formattedSize }}</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="card-actions" @click.stop>
          <NTooltip trigger="hover">
            <template #trigger>
              <NButton size="tiny" secondary circle @click="handleDownload">
                <template #icon><NIcon :size="14" :component="DownloadOutline" /></template>
              </NButton>
            </template>
            下载文件
          </NTooltip>

          <NTooltip v-if="canPreviewAsText" trigger="hover">
            <template #trigger>
              <NButton size="tiny" secondary circle @click="handleCopyContent">
                <template #icon>
                  <NIcon :size="14" :component="copied ? CheckmarkCircleOutline : CopyOutline" />
                </template>
              </NButton>
            </template>
            {{ copied ? '已复制' : '复制内容' }}
          </NTooltip>
        </div>
      </div>
    </template>

    <!-- 完整模式 -->
    <template v-else>
      <div class="card-full">
        <!-- 头部 -->
        <div class="full-header">
          <div class="header-left">
            <div class="card-icon-lg" :style="{ background: categoryColor + '18', borderColor: categoryColor + '40' }">
              <NIcon :size="24" :component="categoryIcon" :color="categoryColor" />
            </div>
            <div class="header-info">
              <div class="full-filename">{{ file.fileName }}</div>
              <div class="full-path">{{ file.filePath }}</div>
            </div>
          </div>

          <div class="header-right">
            <NTag size="small" round :bordered="false" :style="{
              background: categoryColor + '18',
              color: categoryColor,
            } as any">
              {{ categoryLabel }}
            </NTag>
            <span class="full-size">{{ formattedSize }}</span>
          </div>
        </div>

        <!-- 描述 -->
        <div v-if="file.description" class="full-desc">{{ file.description }}</div>

        <!-- 预览区域 -->
        <div class="full-preview-area">
          <!-- 图片/视频/音频内联预览 -->
          <div v-if="canInlinePreview && inlinePreviewUrl" class="inline-media-container">
            <img v-if="fileCategory === 'image'" :src="inlinePreviewUrl" :alt="file.fileName" class="media-preview-image" />
            <video v-else-if="fileCategory === 'video'" :src="inlinePreviewUrl" controls class="media-preview-video" />
            <audio v-else-if="fileCategory === 'audio'" :src="inlinePreviewUrl" controls class="media-preview-audio" />
          </div>

          <!-- 文本预览 -->
          <div v-else-if="canPreviewAsText" class="text-preview-container">
            <NCode
              :code="decodedContent.substring(0, 1000) + (decodedContent.length > 1000 ? '\n... (更多内容请点击查看)' : '')"
              language={getLanguageFromExt()}
              :show-line-numbers="true"
              style="max-height: 250px; overflow-y: auto;"
            />
          </div>

          <!-- 不支持的文件类型 -->
          <div v-else class="unsupported-preview">
            <NIcon :size="48" :component="GridOutline" color="#6b7280" />
            <p>此文件类型不支持在线预览</p>
            <p class="hint">点击下载按钮获取完整文件</p>
          </div>
        </div>

        <!-- 操作栏 -->
        <div class="full-actions">
          <NButton type="primary" @click="handleDownload">
            <template #icon><NIcon :component="DownloadOutline" /></template>
            下载文件
          </NButton>
          <NButton v-if="canPreviewAsText" secondary @click="handleCopyContent">
            <template #icon><NIcon :component="copied ? CheckmarkCircleOutline : CopyOutline" /></template>
            {{ copied ? '已复制' : '复制内容' }}
          </NButton>
          <NButton secondary @click="showDetailModal = true">
            <template #icon><NIcon :component="EyeOutline" /></template>
            查看详情
          </NButton>
        </div>
      </div>
    </template>

    <!-- 详情弹窗 -->
    <NModal
      v-model:show="showDetailModal"
      preset="card"
      :title="`文件：${file.fileName}`"
      style="max-width: 800px; width: 90vw;"
      :bordered="false"
      :segmented="{ content: true }"
    >
      <NCollapse v-model:value="activeTab">
        <!-- 内容预览 -->
        <NCollapseItem name="preview" title="📄 内容预览">
          <!-- 媒体文件 -->
          <div v-if="canInlinePreview && inlinePreviewUrl" class="modal-media-container">
            <img v-if="fileCategory === 'image'" :src="inlinePreviewUrl" :alt="file.fileName" style="max-width: 100%; border-radius: 8px;" />
            <video v-else-if="fileCategory === 'video'" :src="inlinePreviewUrl" controls style="max-width: 100%; border-radius: 8px;" />
            <audio v-else-if="fileCategory === 'audio'" :src="inlinePreviewUrl" controls style="width: 100%;" />
          </div>

          <!-- 文本内容 -->
          <NCode
            v-else-if="canPreviewAsText"
            :code="decodedContent"
            language={getLanguageFromExt()}
            :show-line-numbers="true"
            style="max-height: 500px; overflow-y: auto; font-size: 12px;"
          />

          <!-- 二进制/不支持 -->
          <div v-else class="modal-binary-hint">
            <p>该文件为二进制格式或当前不支持在线预览</p>
            <NButton type="primary" @click="handleDownload">下载文件</NButton>
          </div>
        </NCollapseItem>

        <!-- 文件信息 -->
        <NCollapseItem name="info" title="ℹ️ 文件信息">
          <table class="info-table">
            <tr><td>文件名</td><td>{{ file.fileName }}</td></tr>
            <tr><td>路径</td><td><code>{{ file.filePath }}</code></td></tr>
            <tr><td>类型</td><td>{{ categoryLabel }} (.{{ fileExtension || '无' }})</td></tr>
            <tr><td>MIME</td><td>{{ file.mimeType || guessMimeType() }}</td></tr>
            <tr><td>大小</td><td>{{ formattedSize }}</td></tr>
            <tr v-if="file.description"><td>描述</td><td>{{ file.description }}</td></tr>
          </table>
        </NCollapseItem>
      </NCollapse>
    </NModal>
  </div>
</template>

<script lang="ts">
/**
 * 从文件扩展名推断代码高亮语言
 */
function getLanguageFromExt(this: any): string {
  const ext = this?.fileExtension || ''
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    vue: 'html', py: 'python', java: 'java', go: 'go', rs: 'rust',
    c: 'c', cpp: 'cpp', rb: 'ruby', php: 'php', swift: 'swift',
    kt: 'kotlin', md: 'markdown', json: 'json', yaml: 'yaml',
    yml: 'yaml', html: 'html', css: 'css', scss: 'scss',
    sql: 'sql', sh: 'shell', bash: 'shell', xml: 'xml',
    toml: 'ini', env: 'env', txt: 'plaintext', log: 'plaintext',
  }
  return langMap[ext] || 'plaintext'
}
</script>

<style scoped>
.file-output-card {
  transition: all 0.2s ease;
}

/* ====== 紧凑模式样式 ====== */
.card-compact {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(30, 30, 60, 0.5);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.card-compact:hover {
  border-color: rgba(99, 102, 241, 0.35);
  background: rgba(40, 40, 80, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.card-icon {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  border: 1.5px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.card-name {
  font-size: 13px;
  font-weight: 600;
  color: #e5e7eb;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #9ca3af;
}

.meta-sep { opacity: 0.4; }

.card-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
}

.card-compact:hover .card-actions {
  opacity: 1;
}

/* ====== 完整模式样式 ====== */
.card-full {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: rgba(30, 30, 60, 0.5);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 12px;
}

.full-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.header-left {
  display: flex;
  gap: 12px;
  min-width: 0;
}

.card-icon-lg {
  width: 46px;
  height: 46px;
  border-radius: 11px;
  border: 1.5px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.full-filename {
  font-size: 15px;
  font-weight: 700;
  color: #e5e7eb;
}

.full-path {
  font-size: 11.5px;
  color: #6b7280;
  font-family: 'Monaco', 'Menlo', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.full-size {
  font-size: 12px;
  color: #9ca3af;
}

.full-desc {
  font-size: 12px;
  color: #9ca3af;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  line-height: 1.6;
}

/* 预览区域 */
.full-preview-area {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(99, 102, 241, 0.1);
  background: rgba(15, 15, 30, 0.6);
  min-height: 80px;
}

.inline-media-container {
  padding: 12px;
  display: flex;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
}

.media-preview-image {
  max-width: 100%;
  max-height: 300px;
  border-radius: 8px;
  object-fit: contain;
}

.media-preview-video {
  max-width: 100%;
  max-height: 350px;
  border-radius: 8px;
}

.media-preview-audio {
  width: 100%;
}

.text-preview-container {
  padding: 8px;
}

.unsupported-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  gap: 8px;
  color: #6b7280;
}

.unsupported-preview p {
  margin: 0;
  font-size: 13px;
}

.unsupported-preview .hint {
  font-size: 11px;
  color: #4b5563;
}

/* 操作栏 */
.full-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* 弹窗内的媒体容器 */
.modal-media-container {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}

.modal-binary-hint {
  text-align: center;
  padding: 24px;
  color: #9ca3af;
}

.modal-binary-hint p {
  margin-bottom: 12px;
}

/* 信息表格 */
.info-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.info-table td {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(99, 102, 241, 0.08);
}

.info-table td:first-child {
  color: #9ca3af;
  width: 100px;
  font-weight: 600;
  vertical-align: top;
}

.info-table td:last-child {
  color: #d1d5db;
  word-break: break-all;
}

.info-table code {
  background: rgba(99, 102, 241, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', monospace;
  color: #a5b4fc;
}

/* 类别特定边框 */
.category-image { border-left: 3px solid #f59e0b; }
.category-video { border-left: 3px solid #ef4444; }
.category-audio { border-left: 3px solid #a855f7; }
.category-archive { border-left: 3px solid #f97316; }
.category-document { border-left: 3px solid #3b82f6; }
.category-text { border-left: 3px solid #22c55e; }
</style>
