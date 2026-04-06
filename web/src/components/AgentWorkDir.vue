<script setup lang="ts">
/**
 * AgentWorkDir - Agent 工作目录浏览器
 *
 * 功能：
 * - 支持会话目录和用户主目录切换
 * - 高性能文件树展示（虚拟滚动 + 懒加载）
 * - 文件/目录图标区分
 * - Monaco Editor 在线编辑（VS Code 内核）
 * - 左右分栏布局（25% 文件树 + 75% 编辑器）
 */

import { ref, onMounted, onBeforeUnmount, watch, nextTick, h, computed } from 'vue'
import {
  NTree,
  NIcon,
  NSpin,
  NEmpty,
  NButton,
  NText,
  NSpace,
  NTag,
  NSwitch,
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
  Refresh,
  Save,
  Home,
  Briefcase
} from '@vicons/ionicons5'
import apiClient from '@/api/client'
import * as monaco from 'monaco-editor'

/**
 * 目录类型枚举
 */
type DirectoryType = 'session' | 'user'

/**
 * Props 接口
 */
interface Props {
  sessionId: string
}

const props = defineProps<Props>()

const message = useMessage()

/**
 * 当前目录类型
 */
const currentDirType = ref<DirectoryType>('session')

/**
 * 文件树数据
 */
const treeData = ref<TreeOption[]>([])

/**
 * 当前选中的文件路径
 */
const currentFilePath = ref<string>('')

/**
 * 当前文件内容
 */
const fileContent = ref<string>('')

/**
 * 当前文件语言类型
 */
const fileLanguage = ref<string>('plaintext')

/**
 * 是否正在加载
 */
const loading = ref(false)

/**
 * 编辑器是否已初始化
 */
const editorInitialized = ref(false)

/**
 * 文件是否有未保存的修改
 */
const hasUnsavedChanges = ref(false)

/**
 * 展开的节点 key
 */
const expandedKeys = ref<string[]>([])

/**
 * 选中的节点 key
 */
const selectedKey = ref<string | null>(null)

/**
 * 已加载的目录缓存（防止重复加载）
 */
const loadedPaths = new Map<string, TreeOption[]>()

/**
 * 正在加载的路径集合（防止并发重复请求）
 */
const loadingPaths = new Set<string>()

/**
 * 用户主目录信息
 */
const userDirInfo = ref<{
  workspaceId: string
  userId: string
  path: string
  skillsCount: number
} | null>(null)

/**
 * 编辑器容器引用
 */
const editorContainer = ref<HTMLElement | null>(null)

/**
 * Monaco Editor 实例
 */
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null

/**
 * 获取 API 基础路径
 */
const API_WORKDIR_BASE = '/api/agent/workdir'
const API_USERDIR_BASE = '/api/agent/userdir'

/**
 * 计算当前 API 基础路径
 */
const currentApiBase = computed(() => {
  return currentDirType.value === 'session' ? API_WORKDIR_BASE : API_USERDIR_BASE
})

/**
 * 计算面板标题
 */
const panelTitle = computed(() => {
  return currentDirType.value === 'session' ? '📁 会话目录' : '🏠 用户主目录'
})

/**
 * 切换目录类型
 */
async function switchDirectoryType(type: DirectoryType) {
  if (type === currentDirType.value) return

  currentDirType.value = type
  loadedPaths.clear()
  loadingPaths.clear()
  expandedKeys.value = []
  selectedKey.value = null
  currentFilePath.value = ''
  fileContent.value = ''

  if (type === 'user') {
    await loadUserDirInfo()
  }

  await refreshTree()
}

/**
 * 加载用户主目录信息
 */
async function loadUserDirInfo() {
  try {
    const response = await apiClient.get(`${API_USERDIR_BASE}/info`) as any
    if (response.data.success) {
      userDirInfo.value = response.data.data
    }
  } catch (error) {
    console.error('[AgentWorkDir] 加载用户目录信息失败:', error)
  }
}

/**
 * 加载目录内容（懒加载）
 */
async function loadDirectory(nodeKey: string, showLoading = false): Promise<TreeOption[]> {
  console.log('[AgentWorkDir] loadDirectory called:', { nodeKey, showLoading, dirType: currentDirType.value })

  let normalizedPath = nodeKey || '/'
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath
  }

  const cacheKey = `${currentDirType.value}:${normalizedPath}`

  if (loadingPaths.has(cacheKey)) {
    console.log('[AgentWorkDir] Path is already loading, skipping:', cacheKey)
    return []
  }

  if (loadedPaths.has(cacheKey)) {
    console.log('[AgentWorkDir] Path already loaded, returning cached:', cacheKey)
    return loadedPaths.get(cacheKey) || []
  }

  try {
    loadingPaths.add(cacheKey)

    if (showLoading) {
      loading.value = true
    }

    const apiBase = currentApiBase.value
    let params: any = {}

    if (currentDirType.value === 'session') {
      params = {
        sessionId: props.sessionId,
        path: normalizedPath
      }
    } else {
      params = {
        path: normalizedPath
      }
    }

    const response = await apiClient.get(`${apiBase}/list`, { params }) as any

    console.log('[AgentWorkDir] API response:', response.data)

    const items = response.data.data.items || []

    const nodes = items.map((item: any) => {
      const node: TreeOption = {
        key: item.path || `/${item.name}`,
        label: item.name,
        prefix: () => getFileIcon(item.isDirectory, item.type, item.extension),
        isLeaf: !item.isDirectory,
        children: item.isDirectory ? [] : undefined
      }
      console.log('[AgentWorkDir] Created node:', { key: node.key, label: node.label, isLeaf: node.isLeaf, isDirectory: item.isDirectory })
      return node
    })

    loadedPaths.set(cacheKey, nodes)
    console.log('[AgentWorkDir] Returning nodes:', nodes.length)
    return nodes
  } catch (error: any) {
    console.error('[AgentWorkDir] 加载目录失败:', error)
    message.error(error.response?.data?.error?.message || '加载目录失败')
    return []
  } finally {
    loadingPaths.delete(cacheKey)
    if (showLoading) {
      loading.value = false
    }
  }
}

/**
 * 加载文件内容到编辑器
 */
async function loadFileContent(filePath: string) {
  console.log('[AgentWorkDir] loadFileContent called:', filePath)

  try {
    loading.value = true
    currentFilePath.value = filePath

    let apiBase = currentApiBase.value
    let params: any = {}

    if (currentDirType.value === 'session') {
      params = {
        sessionId: props.sessionId,
        path: filePath
      }
    } else {
      params = {
        path: filePath
      }
    }

    const response = await apiClient.get(`${apiBase}/content`, { params }) as any

    console.log('[AgentWorkDir] File content response:', response.data)

    const data = response.data.data
    fileContent.value = data.content
    fileLanguage.value = data.language || 'plaintext'

    await nextTick()

    if (!editorInstance && editorContainer.value) {
      console.log('[AgentWorkDir] Editor not initialized, initializing now...')
      initEditor()
    }

    if (editorInstance) {
      const model = editorInstance.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, fileLanguage.value)
        model.setValue(data.content)
        console.log('[AgentWorkDir] Editor content updated, length:', data.content.length)
      }
    } else {
      console.error('[AgentWorkDir] Editor instance is null after init!')
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

    let apiBase = currentApiBase.value
    let body: any = {}

    if (currentDirType.value === 'session') {
      body = {
        sessionId: props.sessionId,
        filePath: currentFilePath.value,
        content
      }
    } else {
      body = {
        filePath: currentFilePath.value,
        content
      }
    }

    await apiClient.post(`${apiBase}/save`, body)

    hasUnsavedChanges.value = false
    message.success('✅ 文件已保存')
  } catch (error: any) {
    console.error('[AgentWorkDir] 保存文件失败:', error)
    message.error(error.response?.data?.error?.message || '保存文件失败')
  } finally {
    loading.value = false
  }
}

/**
 * 处理树节点展开（懒加载子目录）
 */
async function handleLoad(node: TreeOption): Promise<TreeOption[]> {
  console.log('[AgentWorkDir] handleLoad called for node:', node.key)

  if (!node.key) {
    console.log('[AgentWorkDir] node.key is empty, returning []')
    return []
  }

  const children = await loadDirectory(node.key as string)
  console.log('[AgentWorkDir] Loaded children:', children.length, 'items for path:', node.key)

  return children
}

/**
 * 处理树节点选中
 */
function handleSelect(keys: Array<string | number>) {
  const key = keys[0] as string

  if (!key) return

  selectedKey.value = key

  const node = findNodeByKey(treeData.value, key)

  if (node && node.isLeaf !== false) {
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

/**
 * 获取文件/目录图标
 */
function getFileIcon(isDirectory: boolean, fileType?: string, extension?: string) {
  if (isDirectory) {
    return h(NIcon, { size: 16 }, { default: () => h(Folder) })
  }

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

/**
 * 初始化 Monaco Editor
 */
async function initEditor() {
  if (!editorContainer.value || editorInitialized.value) return

  try {
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

    editorInstance.onDidChangeModelContent(() => {
      hasUnsavedChanges.value = true
    })

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

/**
 * 刷新文件树
 */
async function refreshTree() {
  loadedPaths.clear()
  loadingPaths.clear()
  treeData.value = await loadDirectory('/', true)
  message.success('🔄 已刷新')
}

/**
 * 生命周期
 */
onMounted(async () => {
  treeData.value = await loadDirectory('/', true)

  await nextTick()
  initEditor()
})

onBeforeUnmount(() => {
  destroyEditor()
})

watch(() => props.sessionId, async (newSessionId) => {
  if (newSessionId) {
    loadedPaths.clear()
    loadingPaths.clear()

    treeData.value = await loadDirectory('/', true)

    if (editorInstance) {
      editorInstance.setValue('')
    }

    currentFilePath.value = ''
    fileContent.value = ''
    hasUnsavedChanges.value = false
  }
})

defineExpose({
  refresh: refreshTree
})
</script>

<template>
  <div class="agent-workdir">
    <!-- 左侧：文件树 -->
    <div class="file-tree-panel">
      <div class="panel-header">
        <div class="header-top">
          <span class="panel-title">{{ panelTitle }}</span>
          <div class="dir-type-switch">
            <NTag
              :type="currentDirType === 'session' ? 'info' : 'default'"
              size="small"
              round
              :style="{ cursor: 'pointer' }"
              @click="switchDirectoryType('session')"
            >
              <template #icon>
                <NIcon><Briefcase /></NIcon>
              </template>
              会话
            </NTag>
            <NTag
              :type="currentDirType === 'user' ? 'success' : 'default'"
              size="small"
              round
              :style="{ cursor: 'pointer' }"
              @click="switchDirectoryType('user')"
            >
              <template #icon>
                <NIcon><Home /></NIcon>
              </template>
              主目录
            </NTag>
          </div>
        </div>
        <NSpace :size="8">
          <NButton text size="small" @click="refreshTree">
            <template #icon>
              <NIcon><Refresh /></NIcon>
            </template>
          </NButton>
        </NSpace>
      </div>

      <!-- 用户主目录信息 -->
      <div v-if="currentDirType === 'user' && userDirInfo" class="user-dir-info">
        <NText depth="3" style="font-size: 11px;">
          Skills: {{ userDirInfo.skillsCount }} | 路径: {{ userDirInfo.path.split(/[/\\]/).pop() }}
        </NText>
      </div>

      <NSpin :show="loading" class="tree-container">
        <NTree
          v-if="treeData.length > 0"
          :data="treeData"
          :expanded-keys="expandedKeys"
          :selected-keys="selectedKey ? [selectedKey] : []"
          :on-load="handleLoad"
          :virtual-scroll="true"
          :height="400"
          selectable
          block-line
          @update:expanded-keys="(keys: string[]) => expandedKeys = keys"
          @update:selected-keys="handleSelect"
          class="file-tree"
        />

        <NEmpty
          v-else
          :description="currentDirType === 'session' ? '工作区为空或尚未初始化' : '用户主目录为空'"
          class="empty-state"
        >
          <template #icon>
            <span style="font-size: 48px; opacity: 0.3;">
              {{ currentDirType === 'session' ? '📂' : '🏠' }}
            </span>
          </template>
          <template #extra>
            <NText depth="3" style="font-size: 12px;">
              {{ currentDirType === 'session' ? '发送消息后将自动创建工作区' : '可以安装 skills 到此目录' }}
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
          <NTag v-if="currentDirType === 'user'" :bordered="false" size="small" type="success">
            主目录
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
  width: 300px;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(30, 30, 30, 0.6);
}

.panel-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.2);
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color, #fff);
  letter-spacing: 0.5px;
}

.dir-type-switch {
  display: flex;
  gap: 6px;
  align-items: center;
}

.user-dir-info {
  padding: 6px 14px;
  background: rgba(99, 102, 241, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
    width: 260px;
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
