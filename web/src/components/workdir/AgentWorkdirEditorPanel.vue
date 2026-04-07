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
} from 'naive-ui'
import {
  Save,
  Close,
} from '@vicons/ionicons5'
import { ref, watch, nextTick, onBeforeUnmount, computed } from 'vue'
import { useWorkdirContext } from '@/composables/useAgentWorkdir'
import PreviewPanel from './PreviewPanel.vue'

const ctx = useWorkdirContext()

const editorContainer = ref<HTMLElement | null>(null)
let containerObserver: MutationObserver | null = null

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

onBeforeUnmount(() => {
  if (containerObserver) {
    containerObserver.disconnect()
    containerObserver = null
  }
  ctx.destroyEditor()
})
</script>

<template>
  <div class="editor-panel">
    <template v-if="ctx.openFiles.value.length > 0">
      <div class="editor-tabs-row">
        <div class="file-tabs-scroll">
          <div class="file-tabs">
            <div
              v-for="file in ctx.openFiles.value"
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
              <span class="file-name" :title="file.path">{{ file.name }}</span>
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
            type="primary"
            size="small"
            :disabled="!ctx.hasUnsavedChanges.value"
            @click="ctx.saveCurrentFile"
          >
            <template #icon>
              <NIcon><Save /></NIcon>
            </template>
            保存
          </NButton>
        </div>
      </div>

      <div v-if="breadcrumbText" class="breadcrumb-bar">
        {{ breadcrumbText }}
      </div>

      <!-- Monaco editor (文本文件) -->
      <div
        v-show="showMonaco"
        ref="editorContainer"
        class="monaco-editor-container"
      />

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

.monaco-editor-container {
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: hidden;
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
</style>
