<script setup lang="ts">
/**
 * AgentWorkDir - Agent 工作目录浏览器
 * 
 * 功能：
 * - 高性能文件树展示（虚拟滚动 + 懒加载）
 * - 文件/目录图标区分
 * - Monaco Editor 在线编辑（VS Code 内核）
 * - 左右分栏布局（25% 文件树 + 75% 编辑器）
 * 
 * 技术栈：
 * - naive-ui Tree 组件（虚拟滚动）
 * - Monaco Editor（VS Code 内核）
 * - Axios HTTP 请求
 */

import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { 
  NTree, 
  NIcon, 
  NSpin, 
  NEmpty, 
  NButton, 
  NText,
  NSpace,
  NTag,
  useMessage,
  type TreeOption
} from 'naive-ui'
import {
  FolderOpen,
  Folder,
  DocumentText,
  Code,
  Image,
  LogoMarkdown,
  Settings,
  Refresh,
  Save,
  Download
} from '@vicons/ionicons5'
import axios from 'axios'
import * as monaco from 'monaco-editor'

// Props
interface Props {
  sessionId: string
}

const props = defineProps<Props>()

const message = useMessage()

// ==================== 状态管理 ====================

/** 文件树数据 */
const treeData = ref<TreeOption[]>([])

/** 当前选中的文件路径 */
const currentFilePath = ref<string>('')

/** 当前文件内容 */
const fileContent = ref<string>('')

/** 当前文件语言类型 */
const fileLanguage = ref<string>('plaintext')

/** 是否正在加载 */
const loading = ref(false)

/** 编辑器是否已初始化 */
const editorInitialized = ref(false)

/** 文件是否有未保存的修改 */
const hasUnsavedChanges = ref(false)

/** 展开的节点 key */
const expandedKeys = ref<string[]>([])

/** 选中的节点 key */
const selectedKey = ref<string | null>(null)

// ==================== 编辑器相关 ====================

/** 编辑器容器引用 */
const editorContainer = ref<HTMLElement | null>(null)

/** Monaco Editor 实例 */
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null

// ==================== API 调用 ====================

const API_BASE = '/api/agent/workdir'

/**
 * 加载目录内容（懒加载）
 * @param nodeKey 节点路径
 * @returns 子项列表
 */
async function loadDirectory(nodeKey: string): Promise<TreeOption[]> {
  try {
    loading.value = true
    
    const response = await axios.get(`${API_BASE}/list`, {
      params: {
        sessionId: props.sessionId,
        path: nodeKey || '/'
      }
    })

    const items = response.data.data.items

    return items.map((item: any) => ({
      key: item.path || `/${item.name}`,
      label: item.name,
      prefix: () => getFileIcon(item.isDirectory, item.type, item.extension),
      isLeaf: !item.isDirectory,
      children: item.isDirectory ? undefined : undefined // 目录需要懒加载
    }))
  } catch (error: any) {
    console.error('[AgentWorkDir] 加载目录失败:', error)
    message.error(error.response?.data?.error?.message || '加载目录失败')
    return []
  } finally {
    loading.value = false
  }
}

/**
 * 加载文件内容到编辑器
 * @param filePath 文件路径
 */
async function loadFileContent(filePath: string) {
  try {
    loading.value = true
    currentFilePath.value = filePath

    const response = await axios.get(`${API_BASE}/content`, {
      params: {
        sessionId: props.sessionId,
        path: filePath
      }
    })

    const data = response.data.data
    fileContent.value = data.content
    fileLanguage.value = data.language || 'plaintext'

    // 更新编辑器内容
    if (editorInstance) {
      const model = editorInstance.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, fileLanguage.value)
        model.setValue(data.content)
      }
    }

    hasUnsavedChanges.value = false
  } catch (error: any) {
    console.error('[AgentWorkDir] 加载文件失败:', error)
    message.error(error.response?.data?.error?.message || '加载文件失败')
  } finally {
    loading.value = false
  }
}

/**
 * 保存当前文件
 */
async function saveCurrentFile() {
  if (!currentFilePath.value || !editorInstance) {
    message.warning('没有可保存的文件')
    return
  }

  try {
    loading.value = true

    const content = editorInstance.getValue()

    await axios.post(`${API_BASE}/save`, {
      sessionId: props.sessionId,
      filePath: currentFilePath.value,
      content
    })

    hasUnsavedChanges.value = false
    message.success('✅ 文件已保存')
  } catch (error: any) {
    console.error('[AgentWorkDir] 保存文件失败:', error)
    message.error(error.response?.data?.error?.message || '保存文件失败')
  } finally {
    loading.value = false
  }
}

// ==================== 树节点处理 ====================

/**
 * 处理树节点展开（懒加载子目录）
 */
async function handleLoad(node: TreeOption) {
  if (!node.key) return []

  return await loadDirectory(node.key as string)
}

/**
 * 处理树节点选中
 */
function handleSelect(keys: Array<string | number>) {
  const key = keys[0] as string
  
  if (!key) return

  selectedKey.value = key

  // 检查是否是叶子节点（文件）
  const node = findNodeByKey(treeData.value, key)
  
  if (node && node.isLeaf !== false) {
    // 是文件，加载内容
    loadFileContent(key)
  }
}

/**
 * 递归查找树节点
 */
function findNodeByKey(nodes: TreeOption[], key: string): TreeOption | null {
  for (const node of nodes) {
    if (node.key === key) {
      return node
    }
    
    if (node.children && node.children.length > 0) {
      const found = findNodeByKey(node.children, key)
      if (found) return found
    }
  }
  
  return null
}

// ==================== 图标渲染 ====================

/**
 * 获取文件/目录图标
 */
function getFileIcon(isDirectory: boolean, fileType?: string, extension?: string) {
  if (isDirectory) {
    return h(NIcon, { size: 16 }, { default: () => h(Folder) })
  }

  // 根据文件类型返回不同图标
  switch (fileType) {
    case 'code':
      return h(NIcon, { size: 16 }, { default: () => h(Code) })
    case 'doc':
    case 'markdown':
      return h(NIcon, { size: 16 }, { default: () => h(LogoMarkdown) })
    case 'image':
      return h(NIcon, { size: 16 }, { default: () => h(Image) })
    default:
      return h(NIcon, { size: 16 }, { default: () => h(DocumentText) })
  }
}

// ==================== 编辑器初始化 ====================

/**
 * 初始化 Monaco Editor
 */
async function initEditor() {
  if (!editorContainer.value || editorInitialized.value) return

  try {
    // 创建编辑器实例
    editorInstance = monaco.editor.create(editorContainer.value, {
      value: '',
      language: 'plaintext',
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      lineNumbers: 'on',
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      tabSize: 2,
      insertSpaces: true,
      renderWhitespace: 'selection',
      folding: true,
      bracketPairColorization: { enabled: true },
      guides: {
        indentation: true,
        bracketPairs: true
      },
      padding: { top: 10, bottom: 10 }
    })

    // 监听内容变化（标记未保存）
    editorInstance.onDidChangeModelContent(() => {
      hasUnsavedChanges.value = true
    })

    // 快捷键：Ctrl+S 保存
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveCurrentFile()
    })

    editorInitialized.value = true
    console.log('[AgentWorkDir] Monaco Editor 初始化成功')
  } catch (error) {
    console.error('[AgentWorkDir] 初始化编辑器失败:', error)
    message.error('编辑器初始化失败')
  }
}

/**
 * 销毁编辑器实例
 */
function destroyEditor() {
  if (editorInstance) {
    editorInstance.dispose()
    editorInstance = null
    editorInitialized.value = false
  }
}

// ==================== 生命周期 ====================

onMounted(async () => {
  // 初始化文件树根目录
  treeData.value = await loadDirectory('/')
  
  // 等待 DOM 更新后初始化编辑器
  await nextTick()
  initEditor()
})

onBeforeUnmount(() => {
  destroyEditor()
})

// 监听 sessionId 变化
watch(() => props.sessionId, async (newSessionId) => {
  if (newSessionId) {
    // 重新加载目录
    treeData.value = await loadDirectory('/')
    
    // 清空编辑器
    if (editorInstance) {
      editorInstance.setValue('')
    }
    
    currentFilePath.value = ''
    fileContent.value = ''
    hasUnsavedChanges.value = false
  }
})

// 暴露方法给父组件
defineExpose({
  refresh: async () => {
    treeData.value = await loadDirectory('/')
    message.success('🔄 已刷新')
  }
})
</script>

<template>
  <div class="agent-workdir">
    <!-- 左侧：文件树 -->
    <div class="file-tree-panel">
      <div class="panel-header">
        <span class="panel-title">📁 工作目录</span>
        <NSpace :size="8">
          <NButton 
            text 
            size="small" 
            @click="() => { treeData = []; loadDirectory('/').then(d => treeData = d) }"
          >
            <template #icon>
              <NIcon><Refresh /></NIcon>
            </template>
          </NButton>
        </NSpace>
      </div>

      <NSpin :show="loading" class="tree-container">
        <NTree
          v-if="treeData.length > 0"
          :data="treeData"
          :expanded-keys="expandedKeys"
          :selected-keys="selectedKey ? [selectedKey] : []"
          :load="handleLoad"
          :virtual-scroll="true"
          :height="500"
          expand-on-click
          selectable
          block-line
          @update:expanded-keys="(keys: string[]) => expandedKeys = keys"
          @update:selected-keys="handleSelect"
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
            <NText depth="3" style="font-size: 12px;">
              发送消息后将自动创建工作区
            </NText>
          </template>
        </NEmpty>
      </NSpin>
    </div>

    <!-- 右侧：编辑器 -->
    <div class="editor-panel">
      <!-- 编辑器头部工具栏 -->
      <div v-if="currentFilePath" class="editor-toolbar">
        <div class="toolbar-left">
          <NTag :bordered="false" size="small" type="info">
            {{ currentFilePath.split('/').pop() }}
          </NTag>
          <NTag :bordered="false" size="small" type="default">
            {{ fileLanguage.toUpperCase() }}
          </NTag>
          <NText v-if="hasUnsavedChanges" depth="3" style="font-size: 12px;">
            ● 未保存
          </NText>
        </div>

        <NSpace :size="8">
          <NButton 
            type="primary" 
            size="small"
            :disabled="!hasUnsavedChanges"
            @click="saveCurrentFile"
          >
            <template #icon>
              <NIcon><Save /></NIcon>
            </template>
            保存
          </NButton>
        </NSpace>
      </div>

      <!-- 编辑器容器 -->
      <div 
        v-if="currentFilePath" 
        ref="editorContainer" 
        class="monaco-editor-container"
      ></div>

      <!-- 空状态：未选择文件 -->
      <div v-else class="no-file-selected">
        <NEmpty description="选择一个文件以查看和编辑">
          <template #icon>
            <span style="font-size: 64px; opacity: 0.2;">📝</span>
          </template>
          <template #extra>
            <NText depth="3" style="font-size: 13px;">
              从左侧文件树中选择文件开始编辑
            </NText>
          </template>
        </NEmpty>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { h } from 'vue'
export default {
  components: {
    FolderOpen,
    Folder,
    DocumentText,
    Code,
    Image,
    LogoMarkdown,
    Settings,
    Refresh,
    Save,
    Download
  }
}
</script>

<style scoped>
.agent-workdir {
  display: flex;
  width: 100%;
  height: 100%;
  gap: 1px;
  background: var(--card-color, #1e1e1e);
  border-radius: 8px;
  overflow: hidden;
}

/* 左侧文件树面板 */
.file-tree-panel {
  width: 280px;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(30, 30, 30, 0.6);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.2);
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #fff);
  letter-spacing: 0.5px;
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

/* 右侧编辑器面板 */
.editor-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #1e1e1e;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.monaco-editor-container {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 400px;
  overflow: hidden;
}

.no-file-selected {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 30, 30, 0.4);
}

/* 响应式调整 */
@media (max-width: 1200px) {
  .file-tree-panel {
    width: 240px;
    min-width: 180px;
  }
}

@media (max-width: 900px) {
  .agent-workdir {
    flex-direction: column;
  }

  .file-tree-panel {
    width: 100%;
    max-height: 300px;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .editor-panel {
    min-height: 400px;
  }
}
</style>
