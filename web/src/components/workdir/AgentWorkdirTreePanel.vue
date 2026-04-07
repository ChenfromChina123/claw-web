<script setup lang="ts">
/**
 * AgentWorkdirTreePanel - 文件树面板组件
 *
 * 支持：刷新、多文件选择上传、拖拽上传到 uploads/
 */

import {
  NTree,
  NSpin,
  NEmpty,
  NButton,
  NIcon,
  NTooltip,
} from 'naive-ui'
import {
  Refresh,
  CloudUploadOutline,
} from '@vicons/ionicons5'
import { ref } from 'vue'
import { useWorkdirContext } from '@/composables/useAgentWorkdir'

const ctx = useWorkdirContext()

const fileInputRef = ref<HTMLInputElement | null>(null)
const dragActive = ref(false)
let dragDepth = 0

const DEFAULT_UPLOAD_DIR = 'uploads'

function triggerFilePicker(): void {
  fileInputRef.value?.click()
}

function onFileInputChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  input.value = ''
  if (files.length) {
    void ctx.uploadWorkdirFiles(files, DEFAULT_UPLOAD_DIR)
  }
}

function onDragEnter(e: DragEvent): void {
  e.preventDefault()
  dragDepth++
  if (e.dataTransfer?.types?.includes('Files')) {
    dragActive.value = true
  }
}

function onDragOver(e: DragEvent): void {
  e.preventDefault()
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

function onDragLeave(e: DragEvent): void {
  e.preventDefault()
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) {
    dragActive.value = false
  }
}

function onDrop(e: DragEvent): void {
  e.preventDefault()
  dragDepth = 0
  dragActive.value = false
  const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : []
  if (files.length) {
    void ctx.uploadWorkdirFiles(files, DEFAULT_UPLOAD_DIR)
  }
}
</script>

<template>
  <div
    class="tree-panel"
    :class="{ 'drag-active': dragActive }"
    @dragenter="onDragEnter"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div v-if="dragActive" class="drag-overlay" aria-hidden="true">
      <span>松开鼠标上传到 {{ DEFAULT_UPLOAD_DIR }}/</span>
    </div>

    <!-- 面板头部 -->
    <div class="panel-header">
      <span class="panel-title">{{ ctx.panelTitle.value }}</span>
      <div class="header-actions">
        <input
          ref="fileInputRef"
          type="file"
          class="hidden-input"
          multiple
          @change="onFileInputChange"
        >
        <NTooltip placement="bottom">
          <template #trigger>
            <NButton
              text
              size="small"
              :disabled="ctx.uploading.value"
              @click="triggerFilePicker"
            >
              <template #icon>
                <NIcon><CloudUploadOutline /></NIcon>
              </template>
            </NButton>
          </template>
          上传文件到 /{{ DEFAULT_UPLOAD_DIR }}/
        </NTooltip>
        <NButton
          text
          size="small"
          :disabled="ctx.uploading.value"
          @click="ctx.refreshTree"
        >
          <template #icon>
            <NIcon><Refresh /></NIcon>
          </template>
        </NButton>
      </div>
    </div>

    <!-- 文件树 -->
    <NSpin :show="ctx.loading.value || ctx.uploading.value" class="tree-container">
      <NTree
        v-if="ctx.treeData.value && ctx.treeData.value.length > 0"
        :data="ctx.treeData.value"
        :expanded-keys="ctx.expandedKeys.value"
        :selected-keys="ctx.selectedKey.value ? [ctx.selectedKey.value] : []"
        :on-load="ctx.handleLoad"
        :virtual-scroll="true"
        :height="400"
        selectable
        block-line
        @update:expanded-keys="(keys: string[]) => ctx.expandedKeys.value = keys"
        @update:selected-keys="ctx.handleSelect"
        class="file-tree"
      />

      <NEmpty
        v-else
        description="工作区为空或尚未初始化"
        class="empty-state"
      >
        <template #icon>
          <span style="font-size: 48px; opacity: 0.3;">📂</span>
        </template>
        <template #extra>
          <span style="font-size: 12px; color: rgba(255,255,255,0.4);">
            可拖拽文件到此处上传到 /{{ DEFAULT_UPLOAD_DIR }}/
          </span>
        </template>
      </NEmpty>
    </NSpin>
  </div>
</template>

<style scoped>
.tree-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #1a1a1a;
  position: relative;
}

.tree-panel.drag-active {
  outline: 2px dashed rgba(64, 158, 255, 0.85);
  outline-offset: -3px;
  background: rgba(64, 158, 255, 0.06);
}

.drag-overlay {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: rgba(30, 30, 30, 0.55);
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.3px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.2);
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #fff);
  letter-spacing: 0.5px;
}

.header-actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
}

.hidden-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  opacity: 0;
}

.header-actions :deep(.n-button) {
  color: rgba(255, 255, 255, 0.55);
}

.header-actions :deep(.n-button:not(:disabled):hover) {
  color: #409eff;
}

.tree-container {
  flex: 1;
  overflow: hidden;
  padding: 4px 0;
}

.file-tree {
  --n-font-size: 13px;
  --n-text-color: rgba(255, 255, 255, 0.85);
  --n-text-color-active: #6366f1;
  --n-text-color-hover: rgba(99, 102, 241, 0.7);
}

.empty-state {
  padding: 40px 20px;
}
</style>
