<script setup lang="ts">
/**
 * AgentWorkdirEditorPanel - 编辑器面板组件
 *
 * 复用 useWorkdirContext：Monaco + 多文件 Tab（VS Code 风格）
 * 支持文本文件（Monaco）和二进制文件（PreviewPanel）的条件渲染
 */

import {
  NButton,
  NText,
  NEmpty,
  NIcon,
  NSpace,
  useMessage,
} from 'naive-ui'
import {
  Save,
  Close,
} from '@vicons/ionicons5'
import {
  ref,
  reactive,
  watch,
  watchEffect,
  nextTick,
  onMounted,
  onBeforeUnmount,
  computed,
} from 'vue'
import * as monaco from 'monaco-editor'
import { useWorkdirContext } from '@/composables/useAgentWorkdir'
import { useIdeAppendToChat } from '@/composables/useIdeChatAppend'
import PreviewPanel from './PreviewPanel.vue'
import MarkdownPreviewPane from './MarkdownPreviewPane.vue'

const ctx = useWorkdirContext()
const message = useMessage()
const appendToChat = useIdeAppendToChat()

const editorPanelRef = ref<HTMLElement | null>(null)
const editorContainer = ref<HTMLElement | null>(null)
let containerObserver: MutationObserver | null = null

const selectionBar = reactive({
  visible: false,
  top: 0,
  left: 0,
})
let selectionBarDisposables: monaco.IDisposable[] = []

function positionSelectionFloatingBar(): void {
  const ed = ctx.editorInstance
  if (!ed || showPreview.value || !showMonaco.value) {
    selectionBar.visible = false
    return
  }
  const sel = ed.getSelection()
  if (!sel || sel.isEmpty()) {
    selectionBar.visible = false
    return
  }
  const end = sel.getEndPosition()
  const coords = ed.getScrolledVisiblePosition(end)
  const dom = ed.getDomNode()
  if (!coords || !dom) {
    selectionBar.visible = false
    return
  }
  const editorRect = dom.getBoundingClientRect()
  const barH = 34
  const gap = 6
  selectionBar.top = Math.max(8, editorRect.top + coords.top - barH - gap)
  selectionBar.left = Math.min(
    Math.max(8, editorRect.left + coords.left),
    window.innerWidth - 160,
  )
  selectionBar.visible = true
}

type MdViewMode = 'edit' | 'preview' | 'split'

const mdViewMode = ref<MdViewMode>('edit')
const mdSource = ref('')

const activeOpenFile = computed(() => {
  const id = ctx.activeFileId.value
  if (!id) return null
  return ctx.openFiles.value.find(f => f.id === id) ?? null
})

const isActiveMarkdown = computed(() => {
  const n = activeOpenFile.value?.name?.toLowerCase() ?? ''
  return n.endsWith('.md')
})

watch(isActiveMarkdown, (v) => {
  if (!v) mdViewMode.value = 'edit'
})

watchEffect((onCleanup) => {
  void ctx.editorInitialized.value
  void ctx.activeFileId.value
  void ctx.openFiles.value

  if (!isActiveMarkdown.value) {
    mdSource.value = ''
    return
  }
  if (!ctx.editorInitialized.value) return

  const ed = ctx.editorInstance
  if (!ed) return

  const sync = (): void => {
    const m = ed.getModel()
    mdSource.value = m ? m.getValue() : ''
  }
  sync()
  const d1 = ed.onDidChangeModelContent(() => sync())
  const d2 = ed.onDidChangeModel(() => sync())
  onCleanup(() => {
    d1.dispose()
    d2.dispose()
  })
})

watch([mdViewMode, isActiveMarkdown], () => {
  nextTick(() => ctx.editorInstance?.layout?.())
})

const breadcrumbText = computed(() => {
  const p = ctx.currentFilePath.value
  if (!p) return ''
  return p.replace(/[/\\]/g, ' > ')
})

// 是否显示 Monaco（文本文件且编辑器已初始化）
const showMonaco = computed(() =>
  ctx.openFiles.value.length > 0 &&
  !ctx.activeIsReadOnly.value &&
  editorContainer.value !== null
)

// 是否显示预览面板（二进制文件）
const showPreview = computed(() =>
  ctx.openFiles.value.length > 0 && ctx.activeIsReadOnly.value
)

watch(
  () =>
    [
      ctx.editorInitialized.value,
      ctx.editorInstance,
      showPreview.value,
      showMonaco.value,
    ] as const,
  () => {
    selectionBarDisposables.forEach(d => d.dispose())
    selectionBarDisposables = []
    const ed = ctx.editorInstance
    if (!ed || showPreview.value) {
      selectionBar.visible = false
      return
    }
    const run = (): void => {
      requestAnimationFrame(() => positionSelectionFloatingBar())
    }
    selectionBarDisposables.push(ed.onDidChangeCursorSelection(run))
    selectionBarDisposables.push(ed.onDidScrollChange(run))
    selectionBarDisposables.push(ed.onDidLayoutChange(run))
    run()
  },
  { flush: 'post' },
)

watch(editorContainer, (container) => {
  containerObserver?.disconnect()
  containerObserver = null
  if (container && ctx.openFiles.value.length > 0) {
    nextTick(() => {
      ctx.initEditor(container)
    })
    containerObserver = new MutationObserver(() => {
      if (ctx.editorInitialized.value && editorContainer.value) {
        ctx.editorInstance?.layout?.()
      }
    })
    containerObserver.observe(container, { attributes: true, attributeFilter: ['style'] })
  }
}, { immediate: true })

watch(
  () => ctx.openFiles.value.length,
  (n) => {
    if (n > 0 && editorContainer.value) {
      nextTick(() => {
        ctx.initEditor(editorContainer.value!)
      })
    }
  }
)

function sendSelectionToChat(): void {
  if (!appendToChat) {
    message.warning('当前页面不支持引用到对话')
    return
  }
  if (showPreview.value) {
    message.warning('二进制文件无法从编辑器引用，请下载后使用')
    return
  }

  const ed = ctx.editorInstance
  const model = ed?.getModel()
  if (ed && model) {
    const range = ed.getSelection()
    if (range) {
    const text = model.getValueInRange(range).trim()
    if (text) {
      const lang = model.getLanguageId()
      const fileName =
        activeOpenFile.value?.name ??
        ctx.currentFilePath.value.split(/[/\\]/).pop() ??
        ''
      const filePath = ctx.currentFilePath.value || fileName
      appendToChat(text, {
        language: lang && lang !== 'plaintext' ? lang : undefined,
        codeRef: {
          filePath,
          fileName: fileName || filePath,
          startLine: range.startLineNumber,
          endLine: range.endLineNumber,
          language: lang && lang !== 'plaintext' ? lang : undefined,
          snippet: text,
        },
      })
      message.success('已添加到对话输入框（芯片展示路径与行号）')
      ed.setSelection({
        startLineNumber: range.endLineNumber,
        startColumn: range.endColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn,
      })
      selectionBar.visible = false
      return
    }
    }
  }

  if (
    isActiveMarkdown.value &&
    (mdViewMode.value === 'preview' || mdViewMode.value === 'split')
  ) {
    const sel = window.getSelection()?.toString() ?? ''
    if (sel.trim()) {
      const name = activeOpenFile.value?.name
      appendToChat(sel.trim(), {
        sourceLabel: name ? `Markdown 预览 · ${name}` : 'Markdown 预览',
      })
      message.success('已插入到对话输入框，可补充说明后发送')
      window.getSelection()?.removeAllRanges()
      selectionBar.visible = false
      return
    }
  }

  message.warning('请先选中要发送的代码或文本')
}

function onKeyAppendChat(e: KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return
  if (e.key.toLowerCase() !== 'l') return
  const root = editorPanelRef.value
  if (!root) return
  const ae = document.activeElement
  if (!ae || !root.contains(ae)) return
  e.preventDefault()
  sendSelectionToChat()
}

onMounted(() => {
  document.addEventListener('keydown', onKeyAppendChat, true)
})

onBeforeUnmount(() => {
  selectionBarDisposables.forEach(d => d.dispose())
  selectionBarDisposables = []
  document.removeEventListener('keydown', onKeyAppendChat, true)
  if (containerObserver) {
    containerObserver.disconnect()
    containerObserver = null
  }
  ctx.destroyEditor()
})
</script>

<template>
  <div ref="editorPanelRef" class="editor-panel">
    <Teleport to="body">
      <div
        v-show="selectionBar.visible && appendToChat && !showPreview"
        class="ide-editor-sel-bar"
        :style="{ top: selectionBar.top + 'px', left: selectionBar.left + 'px' }"
        @mousedown.prevent
      >
        <button type="button" class="ide-editor-sel-bar-btn" @click="sendSelectionToChat">
          添加到对话
        </button>
      </div>
    </Teleport>

    <template v-if="(ctx.openFiles.value?.length ?? 0) > 0">
      <div class="editor-tabs-row">
        <div class="file-tabs-scroll">
          <div class="file-tabs">
            <div
              v-for="file in ctx.openFiles.value ?? []"
              :key="file.id"
              class="tab-item"
              :class="{
                active: ctx.activeFileId.value === file.id,
                'read-only': file.mode === 'binary'
              }"
              @click="ctx.selectOpenFile(file.id)"
            >
              <span class="file-icon" :class="{ 'read-only-icon': file.mode === 'binary' }">
                {{ ctx.tabLanguageLabel(file) }}
              </span>
              <span class="file-name" :title="file.path">{{ ctx.getTabDisplayName(file) }}</span>
              <button
                type="button"
                class="close-icon"
                aria-label="关闭"
                @click.stop="ctx.closeOpenFile(file.id)"
              >
                <NIcon :size="14"><Close /></NIcon>
              </button>
            </div>
          </div>
        </div>

        <div class="tabs-actions">
          <NText v-if="ctx.hasUnsavedChanges.value" depth="3" class="dirty-dot">
            ● 未保存
          </NText>
          <NButton
            quaternary
            circle
            size="small"
            :disabled="!ctx.hasUnsavedChanges.value"
            @click="ctx.saveCurrentFile"
          >
            <template #icon>
              <NIcon :size="18"><Save /></NIcon>
            </template>
          </NButton>
        </div>
      </div>

      <div v-if="breadcrumbText" class="breadcrumb-bar">
        {{ breadcrumbText }}
      </div>

      <div v-if="isActiveMarkdown" class="md-toolbar">
        <NText depth="3" class="md-toolbar-label">Markdown</NText>
        <NSpace :size="6" class="md-toolbar-btns">
          <NButton
            size="tiny"
            :type="mdViewMode === 'edit' ? 'primary' : 'default'"
            @click="mdViewMode = 'edit'"
          >
            编辑
          </NButton>
          <NButton
            size="tiny"
            :type="mdViewMode === 'preview' ? 'primary' : 'default'"
            @click="mdViewMode = 'preview'"
          >
            预览
          </NButton>
          <NButton
            size="tiny"
            :type="mdViewMode === 'split' ? 'primary' : 'default'"
            @click="mdViewMode = 'split'"
          >
            分栏
          </NButton>
        </NSpace>
      </div>

      <!-- 文本：Monaco ± Markdown 预览（v-show 避免切到二进制标签时卸载 Monaco） -->
      <div
        v-show="!showPreview"
        class="editor-main"
        :class="{
          'md-split': isActiveMarkdown && mdViewMode === 'split',
        }"
      >
        <div
          v-show="showMonaco && !(isActiveMarkdown && mdViewMode === 'preview')"
          ref="editorContainer"
          class="monaco-editor-container"
          :class="{ 'md-pane': isActiveMarkdown && mdViewMode === 'split' }"
        />
        <MarkdownPreviewPane
          v-if="isActiveMarkdown && mdViewMode !== 'edit'"
          class="markdown-preview-container"
          :class="{ 'md-pane': mdViewMode === 'split' }"
          :source="mdSource"
        />
      </div>

      <!-- Preview panel (二进制文件) -->
      <PreviewPanel v-if="showPreview" />
    </template>

    <div v-else class="no-file-selected">
      <NEmpty description="选择一个文件以查看和编辑">
        <template #icon>
          <span class="empty-emoji">📝</span>
        </template>
        <template #extra>
          <NText depth="3" class="empty-hint">
            从左侧文件树中选择文件；可同时打开多个标签页
          </NText>
        </template>
      </NEmpty>
    </div>
  </div>
</template>

<style scoped>
.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #1e1e1e;
}

.editor-tabs-row {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  min-height: 36px;
  max-height: 36px;
  background: #252526;
  border-bottom: 1px solid #1a1a1a;
}

.file-tabs-scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.file-tabs-scroll::-webkit-scrollbar {
  height: 4px;
}

.file-tabs-scroll::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 2px;
}

.file-tabs {
  display: flex;
  align-items: flex-end;
  flex-wrap: nowrap;
  height: 100%;
  padding: 0 4px;
  gap: 1px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 200px;
  height: 35px;
  padding: 0 10px 0 12px;
  margin-top: 1px;
  font-family: var(--font-family-mono, 'Consolas', 'Menlo', monospace);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
  background: #2d2d2d;
  border: none;
  border-radius: 0;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  transition: background 0.12s ease, color 0.12s ease;
}

.tab-item:hover {
  background: #323232;
  color: rgba(255, 255, 255, 0.9);
}

.tab-item.active {
  background: #1e1e1e;
  color: #fff;
}

.tab-item.active::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: #007acc;
}

.file-icon {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  color: #569cd6;
  min-width: 22px;
  text-align: center;
}

.tab-item.active .file-icon {
  color: #4fc3f7;
}

.read-only-icon {
  color: rgba(255, 165, 0, 0.7) !important;
}

.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  margin-right: -4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.close-icon:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.tabs-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px 0 8px;
  border-left: 1px solid #1a1a1a;
  background: #252526;
}

.dirty-dot {
  font-size: 12px;
  white-space: nowrap;
}

.breadcrumb-bar {
  flex-shrink: 0;
  height: 24px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  font-family: var(--font-family-mono, 'Consolas', monospace);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  background: #252526;
  border-bottom: 1px solid #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.editor-main.md-split {
  flex-direction: row;
}

.md-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  background: #252526;
  border-bottom: 1px solid #1a1a1a;
}

.md-toolbar-label {
  font-size: 11px;
  letter-spacing: 0.02em;
}

.md-toolbar-btns {
  flex: 1;
}

.monaco-editor-container {
  flex: 1;
  width: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.monaco-editor-container.md-pane {
  flex: 1;
  border-right: 1px solid #2a2a2a;
}

.markdown-preview-container {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.markdown-preview-container.md-pane {
  flex: 1;
}

.no-file-selected {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 30, 30, 0.5);
}

.empty-emoji {
  font-size: 64px;
  opacity: 0.2;
}

.empty-hint {
  font-size: 13px;
}

.ide-editor-sel-bar {
  position: fixed;
  z-index: 5000;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 8px;
  background: #2d2d30;
  border: 1px solid #3f3f46;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  font-size: 12px;
  color: #e4e4e7;
  pointer-events: auto;
}

.ide-editor-sel-bar-btn {
  margin: 0;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: #0e639c;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.ide-editor-sel-bar-btn:hover {
  background: #1177bb;
}
</style>
