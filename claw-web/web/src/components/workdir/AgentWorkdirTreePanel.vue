<script setup lang="ts">
/**
 * AgentWorkdirTreePanel - 文件树面板组件
 *
 * 支持：刷新、多文件选择上传、拖拽上传到 uploads/、新建文件/文件夹、下载（文件 / 文件夹 ZIP）、右键菜单
 */

import {
  NTree,
  NSpin,
  NEmpty,
  NButton,
  NIcon,
  NTooltip,
  NModal,
  NInput,
  NDropdown,
  NDialog,
  useDialog,
  type TreeOption,
} from 'naive-ui'
import {
  Refresh,
  CloudUploadOutline,
  CreateOutline,
  FolderOpenOutline,
  DownloadOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import {
  ChatbubblesOutline,
  ListOutline,
} from '@vicons/ionicons5'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useWorkdirContext } from '@/composables/useAgentWorkdir'

const ctx = useWorkdirContext()
const dialog = useDialog()

const fileInputRef = ref<HTMLInputElement | null>(null)
const dragActive = ref(false)
let dragDepth = 0

const DEFAULT_UPLOAD_DIR = 'uploads'

/** 新建 */
const showCreateModal = ref(false)
const createKind = ref<'file' | 'directory'>('file')
const createNameDraft = ref('')

/** 右键菜单 */
const ctxMenuShow = ref(false)
const ctxMenuX = ref(0)
const ctxMenuY = ref(0)
const ctxMenuTarget = ref<{ path: string; isDirectory: boolean } | null>(null)

const ctxMenuOptions = computed(() => {
  if (!ctxMenuTarget.value) return []
  const dir = ctxMenuTarget.value.isDirectory
  return [
    { label: dir ? '下载文件夹 (ZIP)' : '下载文件', key: 'download' },
    { label: '删除', key: 'delete' }
  ]
})

const createParentHint = computed(() => ctx.getNewItemParentPath() || '/')

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

function openCreateModal(kind: 'file' | 'directory'): void {
  createKind.value = kind
  createNameDraft.value = ''
  showCreateModal.value = true
}

async function handleCreateConfirm(): Promise<boolean> {
  const ok = await ctx.createWorkdirEntry(createNameDraft.value, createKind.value)
  if (ok) {
    createNameDraft.value = ''
  }
  return ok
}

/**
 * 删除选中的文件或文件夹
 */
function handleDeleteSelected(): void {
  const key = ctx.selectedKey.value
  if (!key) {
    return
  }
  const node = findNodeByKey(ctx.treeData.value, key)
  const isDirectory = node ? node.isLeaf === false : false
  showDeleteConfirm(key, isDirectory)
}

/**
 * 显示删除确认对话框
 */
function showDeleteConfirm(path: string, isDirectory: boolean): void {
  const fileName = path.split(/[/\\]/).pop() || path
  const title = isDirectory ? '删除文件夹' : '删除文件'
  const content = isDirectory
    ? `确定要删除文件夹 "${fileName}" 及其所有内容吗？此操作不可恢复。`
    : `确定要删除文件 "${fileName}" 吗？此操作不可恢复。`

  dialog.warning({
    title,
    content,
    positiveText: '确定删除',
    negativeText: '取消',
    positiveButtonProps: {
      type: 'error',
    },
    onPositiveClick: async () => {
      await ctx.deleteWorkdirEntry(path, isDirectory)
    },
  })
}

/**
 * 在树中查找节点
 */
function findNodeByKey(nodes: any[], key: string): any {
  for (const node of nodes) {
    if (node.key === key) return node
    if (node.children && node.children.length > 0) {
      const found = findNodeByKey(node.children, key)
      if (found) return found
    }
  }
  return null
}

function workdirTreeNodeProps({ option }: { option: TreeOption }) {
  return {
    onContextmenu(e: MouseEvent) {
      e.preventDefault()
      ctxMenuTarget.value = {
        path: String(option.key),
        isDirectory: option.isLeaf === false,
      }
      ctxMenuX.value = e.clientX
      ctxMenuY.value = e.clientY
      ctxMenuShow.value = true
    },
  }
}

function onCtxMenuSelect(key: string | number): void {
  const t = ctxMenuTarget.value
  ctxMenuShow.value = false
  if (!t) return
  
  if (key === 'download') {
    if (t.isDirectory) {
      void ctx.downloadFolderZip(t.path)
    } else {
      const base = t.path.split('/').pop() || 'download'
      void ctx.downloadFile(t.path, base)
    }
  } else if (key === 'delete') {
    showDeleteConfirm(t.path, t.isDirectory)
  }
}

function onCtxMenuShowUpdate(show: boolean): void {
  ctxMenuShow.value = show
  if (!show) {
    ctxMenuTarget.value = null
  }
}

// 点击外部关闭菜单
function handleClickOutside(e: MouseEvent): void {
  if (!ctxMenuShow.value) return
  
  const target = e.target as HTMLElement
  const dropdownEl = document.querySelector('.n-dropdown')
  
  // 如果点击的不是下拉菜单本身，则关闭菜单
  if (dropdownEl && !dropdownEl.contains(target)) {
    ctxMenuShow.value = false
    ctxMenuTarget.value = null
  }
}

// 挂载和卸载时添加/移除全局点击监听
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
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

    <NDropdown
      trigger="manual"
      placement="bottom-start"
      :show="ctxMenuShow"
      :x="ctxMenuX"
      :y="ctxMenuY"
      :options="ctxMenuOptions"
      to="body"
      @select="onCtxMenuSelect"
      @update:show="onCtxMenuShowUpdate"
    >
      <div class="ctx-menu-anchor" aria-hidden="true" />
    </NDropdown>

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
              @click="openCreateModal('file')"
            >
              <template #icon>
                <NIcon><CreateOutline /></NIcon>
              </template>
            </NButton>
          </template>
          新建文件（位于当前选中目录或文件的父目录）
        </NTooltip>
        <NTooltip placement="bottom">
          <template #trigger>
            <NButton
              text
              size="small"
              :disabled="ctx.uploading.value"
              @click="openCreateModal('directory')"
            >
              <template #icon>
                <NIcon><FolderOpenOutline /></NIcon>
              </template>
            </NButton>
          </template>
          新建文件夹
        </NTooltip>
        <NTooltip placement="bottom">
          <template #trigger>
            <NButton
              text
              size="small"
              :disabled="ctx.uploading.value || !ctx.selectedKey.value"
              @click="ctx.downloadSelected"
            >
              <template #icon>
                <NIcon><DownloadOutline /></NIcon>
              </template>
            </NButton>
          </template>
          下载选中项（文件直接下载，文件夹打包为 ZIP）
        </NTooltip>
        <NTooltip placement="bottom">
          <template #trigger>
            <NButton
              text
              size="small"
              :disabled="ctx.uploading.value || !ctx.selectedKey.value"
              @click="handleDeleteSelected"
            >
              <template #icon>
                <NIcon><TrashOutline /></NIcon>
              </template>
            </NButton>
          </template>
          删除选中项
        </NTooltip>
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
          @click="() => { void ctx.refreshTree() }"
        >
          <template #icon>
            <NIcon><Refresh /></NIcon>
          </template>
        </NButton>
      </div>
    </div>

    <NModal
      v-model:show="showCreateModal"
      preset="dialog"
      :title="createKind === 'file' ? '新建文件' : '新建文件夹'"
      positive-text="创建"
      negative-text="取消"
      :show-icon="false"
      @positive-click="handleCreateConfirm"
    >
      <div class="create-dialog">
        <p class="create-hint">
          将创建于：<code>{{ createParentHint }}</code>
        </p>
        <NInput
          v-model:value="createNameDraft"
          :placeholder="createKind === 'file' ? '例如 notes.md' : '例如 my-folder'"
          maxlength="200"
          show-count
          @keydown.enter.prevent="void handleCreateConfirm()"
        />
      </div>
    </NModal>

    <!-- 文件树 -->
    <NSpin :show="ctx.loading.value || ctx.uploading.value" class="tree-container">
      <NTree
        v-if="ctx.treeData.value && ctx.treeData.value.length > 0"
        class="file-tree"
        :data="ctx.treeData.value"
        :expanded-keys="ctx.expandedKeys.value"
        :selected-keys="ctx.selectedKey.value ? [ctx.selectedKey.value] : []"
        :on-load="ctx.handleLoad"
        :node-props="workdirTreeNodeProps"
        :virtual-scroll="true"
        :height="400"
        selectable
        block-line
        @update:expanded-keys="(keys: string[]) => ctx.expandedKeys.value = keys"
        @update:selected-keys="ctx.handleSelect"
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

.ctx-menu-anchor {
  position: fixed;
  width: 1px;
  height: 1px;
  left: 0;
  top: 0;
  pointer-events: none;
  opacity: 0;
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
  gap: 8px;
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

.create-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 4px;
}

.create-hint {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.create-hint code {
  font-size: 12px;
  color: rgba(129, 140, 248, 0.95);
  word-break: break-all;
}
</style>
