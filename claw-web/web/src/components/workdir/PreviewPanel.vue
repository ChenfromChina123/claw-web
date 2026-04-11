<script setup lang="ts">
/**
 * PreviewPanel - 二进制文件预览面板
 *
 * 支持：
 * - 图片预览（Chessboard background for alpha channel images）
 * - PDF 预览（PDF.js）
 * - Office（doc/docx 等）：不可内嵌预览提示 + 下载
 * - 其他二进制文件：显示元数据 + 下载按钮
 */

import { computed, ref, shallowRef, watch } from 'vue'
import { NButton, NText, NSpin, NIcon } from 'naive-ui'
import { CloudDownloadOutline, DocumentOutline } from '@vicons/ionicons5'
import { useWorkdirContext, UNPREVIEWABLE_OFFICE_EXTS } from '@/composables/useAgentWorkdir'

const ctx = useWorkdirContext()

// ========== PDF.js lazy loading ==========
// PDF.js 使用 # 私有字段；必须用 shallowRef，避免 ref 的深度 Proxy 导致 getPage/render 报错
const pdfDoc = shallowRef<any>(null)
const pdfPageCount = ref(0)
const pdfCurrentPage = ref(1)
const pdfCanvasRef = ref<HTMLCanvasElement | null>(null)
const pdfRendering = ref(false)
const pdfError = ref<string | null>(null)
let pdfjsLib: any = null

async function loadPdfJs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString()
  pdfjsLib = pdfjs
  return pdfjsLib
}

async function renderPdfPage(pageNum: number): Promise<void> {
  if (!pdfjsLib || !pdfDoc.value || !pdfCanvasRef.value) return
  pdfRendering.value = true
  try {
    const page = await pdfDoc.value.getPage(pageNum)
    const canvas = pdfCanvasRef.value
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return
    const viewport = page.getViewport({ scale: 1.5 })
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: ctx2d, viewport }).promise
  } catch (e: any) {
    pdfError.value = e.message || 'PDF 渲染失败'
  } finally {
    pdfRendering.value = false
  }
}

watch(() => ctx.activeBlobUrl.value, async (url) => {
  if (!url) {
    pdfDoc.value = null
    pdfPageCount.value = 0
    pdfCurrentPage.value = 1
    return
  }
  const activeEntry = ctx.openFiles.value.find(f => f.id === ctx.activeFileId.value)
  if (!activeEntry || activeEntry.ext !== '.pdf') return

  pdfError.value = null
  try {
    const pdfjs = await loadPdfJs()
    const loadingTask = pdfjs.getDocument(url)
    pdfDoc.value = await loadingTask.promise
    pdfPageCount.value = pdfDoc.value.numPages
    pdfCurrentPage.value = 1
    await renderPdfPage(1)
  } catch (e: any) {
    pdfError.value = 'PDF 加载失败: ' + (e.message || '未知错误')
    pdfDoc.value = null
  }
})

function prevPage(): void {
  if (pdfCurrentPage.value > 1) {
    pdfCurrentPage.value--
    void renderPdfPage(pdfCurrentPage.value)
  }
}

function nextPage(): void {
  if (pdfCurrentPage.value < pdfPageCount.value) {
    pdfCurrentPage.value++
    void renderPdfPage(pdfCurrentPage.value)
  }
}

// ========== Image zoom & pan ==========
const imageZoom = ref(1)
const imageContainerRef = ref<HTMLDivElement | null>(null)
let isPanning = false
let panStart = { x: 0, y: 0 }
const imgPos = ref({ x: 0, y: 0 })

function zoomIn(): void { imageZoom.value = Math.min(imageZoom.value + 0.25, 5) }
function zoomOut(): void { imageZoom.value = Math.max(imageZoom.value - 0.25, 0.25) }
function resetZoom(): void { imageZoom.value = 1; imgPos.value = { x: 0, y: 0 } }

function onImageWheel(e: WheelEvent): void {
  e.preventDefault()
  if (e.deltaY < 0) zoomIn()
  else zoomOut()
}

function onMouseDown(e: MouseEvent): void {
  isPanning = true
  panStart = { x: e.clientX - imgPos.value.x, y: e.clientY - imgPos.value.y }
}

function onMouseMove(e: MouseEvent): void {
  if (!isPanning) return
  imgPos.value = { x: e.clientX - panStart.x, y: e.clientY - panStart.y }
}

function onMouseUp(): void { isPanning = false }

// ========== Metadata formatting ==========
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const activeEntry = computed(() => {
  return ctx.openFiles.value.find(f => f.id === ctx.activeFileId.value) ?? null
})

const isImage = computed(() => {
  const ext = activeEntry.value?.ext?.toLowerCase()
  return !!ext && ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg'].includes(ext)
})

const isPdf = computed(() => activeEntry.value?.ext?.toLowerCase() === '.pdf')

const isUnpreviewableOffice = computed(() => {
  const ext = activeEntry.value?.ext?.toLowerCase()
  return !!ext && UNPREVIEWABLE_OFFICE_EXTS.has(ext)
})

const displayMimeType = computed(() => activeEntry.value?.mimeType ?? 'application/octet-stream')

/** 仅「当前文件内容还在拉取、尚无 blob」时遮罩；避免与 refreshTree 等共用 loading 导致已预览仍转圈 */
const showPreviewLoading = computed(
  () => ctx.loading.value && !ctx.activeBlobUrl.value
)

async function handleDownload(): Promise<void> {
  const entry = activeEntry.value
  if (!entry) return
  void ctx.downloadFile(entry.path, entry.name)
}
</script>

<template>
  <div class="preview-panel">
    <!-- NSpin 无 default 插槽时 naive-ui 会始终渲染 description，show=false 也挡不住，故用 v-if -->
    <div v-if="showPreviewLoading" class="preview-loading-mask">
      <NSpin :show="true" size="large" description="加载中..." />
    </div>

    <!-- Image preview -->
    <template v-if="isImage && ctx.activeBlobUrl.value">
      <div class="preview-toolbar">
        <NText depth="3" style="font-size: 12px; flex: 1;">
          📷 图片预览 · {{ activeEntry?.name }}
        </NText>
        <NButton size="tiny" @click="zoomOut" title="缩小">−</NButton>
        <NText depth="3" style="font-size: 12px; min-width: 42px; text-align: center;">{{ Math.round(imageZoom * 100) }}%</NText>
        <NButton size="tiny" @click="zoomIn" title="放大">+</NButton>
        <NButton size="tiny" text @click="resetZoom" title="重置">↺</NButton>
        <NButton size="tiny" text @click="handleDownload" title="下载">
          <template #icon><NIcon><CloudDownloadOutline /></NIcon></template>
        </NButton>
      </div>

      <div
        ref="imageContainerRef"
        class="image-scroll-container"
        @wheel.prevent="onImageWheel"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
      >
        <img
          :src="ctx.activeBlobUrl.value ?? ''"
          class="preview-image"
          :style="{
            transform: `scale(${imageZoom}) translate(${imgPos.x / imageZoom}px, ${imgPos.y / imageZoom}px)`
          }"
          :alt="activeEntry?.name"
          draggable="false"
        />
      </div>
    </template>

    <!-- PDF preview -->
    <template v-else-if="isPdf && ctx.activeBlobUrl.value">
      <div class="preview-toolbar">
        <NText depth="3" style="font-size: 12px; flex: 1;">
          📄 PDF · {{ activeEntry?.name }}
        </NText>
        <NButton size="tiny" :disabled="pdfCurrentPage <= 1" @click="prevPage">‹</NButton>
        <NText depth="3" style="font-size: 12px; min-width: 60px; text-align: center;">
          {{ pdfCurrentPage }} / {{ pdfPageCount || '—' }}
        </NText>
        <NButton size="tiny" :disabled="pdfCurrentPage >= pdfPageCount" @click="nextPage">›</NButton>
        <NButton size="tiny" text @click="handleDownload" title="下载">
          <template #icon><NIcon><CloudDownloadOutline /></NIcon></template>
        </NButton>
      </div>

      <div class="pdf-scroll-container">
        <canvas ref="pdfCanvasRef" class="pdf-canvas" />
        <div v-if="pdfError" class="pdf-error">
          <NText type="error">{{ pdfError }}</NText>
        </div>
      </div>
    </template>

    <!-- Word / Excel / PowerPoint：不提供内嵌预览 -->
    <template v-else-if="isUnpreviewableOffice && !ctx.loading.value">
      <div class="preview-toolbar">
        <NText depth="3" style="font-size: 12px; flex: 1;">
          📎 {{ activeEntry?.name }}
        </NText>
        <NButton size="tiny" text @click="handleDownload" title="下载">
          <template #icon><NIcon><CloudDownloadOutline /></NIcon></template>
        </NButton>
      </div>
      <div class="binary-placeholder office-no-preview">
        <NIcon :size="64" style="color: rgba(255,255,255,0.15);">
          <DocumentOutline />
        </NIcon>
        <NText style="font-size: 15px; color: rgba(255,255,255,0.75); margin-top: 16px; text-align: center; max-width: 360px;">
          此格式不支持在编辑器内预览
        </NText>
        <NText depth="3" style="font-size: 12px; margin-top: 8px; text-align: center; max-width: 400px; line-height: 1.5;">
          .doc / .docx / .xls / .xlsx / .ppt / .pptx 请下载后使用 WPS、Microsoft Office 等本地应用打开。
        </NText>
        <NText depth="3" style="font-size: 11px; margin-top: 6px;">
          类型: {{ displayMimeType }}
        </NText>
        <NButton type="primary" style="margin-top: 22px;" @click="handleDownload">
          <template #icon><NIcon><CloudDownloadOutline /></NIcon></template>
          下载文件
        </NButton>
      </div>
    </template>

    <!-- Generic binary file placeholder -->
    <template v-else-if="activeEntry && activeEntry.mode === 'binary' && !ctx.loading.value && !ctx.activeBlobUrl.value">
      <div class="binary-placeholder">
        <NIcon :size="64" style="color: rgba(255,255,255,0.15);">
          <DocumentOutline />
        </NIcon>
        <NText style="font-size: 14px; color: rgba(255,255,255,0.5); margin-top: 12px;">
          {{ activeEntry.name }}
        </NText>
        <NText depth="3" style="font-size: 12px; margin-top: 4px;">
          类型: {{ displayMimeType }}
        </NText>
        <NButton type="primary" style="margin-top: 20px;" @click="handleDownload">
          <template #icon><NIcon><CloudDownloadOutline /></NIcon></template>
          下载文件
        </NButton>
      </div>
    </template>
  </div>
</template>

<style scoped>
.preview-panel {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #1a1a1a;
  min-height: 0;
}

.preview-loading-mask {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(26, 26, 26, 0.72);
}

/* Toolbar */
.preview-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #252526;
  border-bottom: 1px solid #1a1a1a;
}

/* ========== Image ========== */
.image-scroll-container {
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  /* Alpha-channel chessboard background */
  background-image:
    linear-gradient(45deg, #333 25%, transparent 25%),
    linear-gradient(-45deg, #333 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #333 75%),
    linear-gradient(-45deg, transparent 75%, #333 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  background-color: #2a2a2a;
}

.image-scroll-container:active {
  cursor: grabbing;
}

.preview-image {
  max-width: none;
  image-rendering: auto;
  user-select: none;
  transition: transform 0.1s ease;
}

/* ========== PDF ========== */
.pdf-scroll-container {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
  gap: 8px;
  background: #2a2a2a;
}

.pdf-canvas {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.pdf-error {
  padding: 16px;
  color: #f56c6c;
}

/* ========== Generic binary ========== */
.binary-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.office-no-preview {
  padding: 24px 16px;
}
</style>
