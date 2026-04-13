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

/** 右键菜单 - 与终端使用相同的自定义HTML菜单 */
const ctxMenuShow = ref(false)
const ctxMenuX = ref(0)
const ctxMenuY = ref(0)
const ctxMenuTarget = ref<{ path: string; isDirectory: boolean } | null>(null)

/** 计算当前右键菜单选项 */
const ctxMenuItems = computed(() => {
  if (!ctxMenuTarget.value) return []
  const dir = ctxMenuTarget.value.isDirectory
  const items: Array<{ label: string; key: string }> = []
  
  // 文件夹特有功能
  if (dir) {
    items.push(
      { label: '新建文件', key: 'new-file' },
      { label: '新建文件夹', key: 'new-folder' }
    )
  }
  
  // 通用功能
  items.push(
    { label: dir ? '下载文件夹 (ZIP)' : '下载文件', key: 'download' },
    { label: '删除', key: 'delete' }
  )
  
  // 上传和刷新
  items.push(
    { label: '上传文件', key: 'upload' },
    { label: '刷新', key: 'refresh' }
  )
  
  return items
})

/** 是否显示分割线（在删除和上传之间） */
const hasDividerBeforeIndex = computed(() => {
  if (!ctxMenuTarget.value) return -1
  const dir = ctxMenuTarget.value.isDirectory
  // 删除是第3或第2个选项，分割线在其后
  return dir ? 3 : 1
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
function findNodeByKey(nodes: any[] | undefined, key: string): any {
  if (!nodes) return null
  for (const node of nodes) {
    if (node.key === key) return node
    if (node.children && node.children.length > 0) {
      const found = findNodeByKey(node.children, key)
      if (found) return found
    }
  }
  return null
}

/**
 * 显示右键菜单 - 与终端相同的方式
 */
function showContextMenu(e: MouseEvent) {
  e.preventDefault()
  ctxMenuX.value = e.clientX
  ctxMenuY.value = e.clientY
  ctxMenuShow.value = true
  document.addEventListener('click', hideContextMenu)
}

/**
 * 隐藏右键菜单
 */
function hideContextMenu() {
  ctxMenuShow.value = false
  document.removeEventListener('click', hideContextMenu)
}

/**
 * 处理右键菜单项点击
 */
function handleCtxMenuItemClick(key: string): void {
  const t = ctxMenuTarget.value
  hideContextMenu()
  if (!t) return
  
  if (key === 'new-file') {
    openCreateModal('file')
  } else if (key === 'new-folder') {
    openCreateModal('directory')
  } else if (key === 'download') {
    if (t.isDirectory) {
      void ctx.downloadFolderZip(t.path)
    } else {
      const base = t.path.split('/').pop() || 'download'
      void ctx.downloadFile(t.path, base)
    }
  } else if (key === 'delete') {
    showDeleteConfirm(t.path, t.isDirectory)
  } else if (key === 'upload') {
    triggerFilePicker()
  } else if (key === 'refresh') {
    void ctx.refreshTree()
  }
}

function workdirTreeNodeProps({ option }: { option: TreeOption }) {
  return {
    onContextmenu(e: MouseEvent) {
      ctxMenuTarget.value = {
        path: String(option.key),
        isDirectory: option.isLeaf === false,
      }
      showContextMenu(e)
    },
  }
}

onUnmounted(() => {
  document.removeEventListener('click', hideContextMenu)
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

    <!-- 自定义右键菜单 - 与终端样式完全一致 -->
    <div
      v-if="ctxMenuShow"
      class="context-menu"
      :style="{ left: ctxMenuX + 'px', top: ctxMenuY + 'px' }"
      @click.stop
    >
      <template v-for="(item, index) in ctxMenuItems" :key="item.key">
        <!-- 分割线 -->
        <div
          v-if="index === hasDividerBeforeIndex"
          class="context-menu-divider"
        />
        <!-- 菜单项 -->
        <div
          class="context-menu-item"
          @click="handleCtxMenuItemClick(item.key)"
        >
          {{ item.label }}
        </div>
      </template>
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

/* 右键菜单样式 - 与终端完全一致 */
.context-menu {
  position: fixed;
  background: #2d2d2d;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 4px 0;
  min-width: 140px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 10000;
}

.context-menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #ddd;
}

.context-menu-item:hover {
  background: #4a4a4a;
}

.context-menu-divider {
  height: 1px;
  background: #555;
  margin: 4px 0;
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
