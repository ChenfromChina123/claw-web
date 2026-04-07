<script setup lang="ts">
import { ref, onMounted, watch, nextTick, h, computed } from 'vue'
import {
  NTree,
  NIcon,
  NSpin,
  NEmpty,
  NButton,
  NText,
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
  Refresh,
  Home,
  Briefcase
} from '@vicons/ionicons5'
import apiClient from '@/api/client'

interface Props {
  sessionId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  fileSelected: [filePath: string]
}>()

const message = useMessage()

/**
 * 当前目录类型
 */
type DirectoryType = 'session' | 'user'
const currentDirType = ref<DirectoryType>('session')

/**
 * 文件树数据
 */
const treeData = ref<TreeOption[]>([])

/**
 * 是否正在加载
 */
const loading = ref(false)

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
 * 获取 API 基础路径
 */
const API_WORKDIR_BASE = '/agent/workdir'
const API_USERDIR_BASE = '/agent/userdir'

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
  return currentDirType.value === 'session' ? 'EXPLORER' : 'USER DIR'
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
    console.error('[FileExplorer] 加载用户目录信息失败:', error)
  }
}

/**
 * 加载目录内容（懒加载）
 */
async function loadDirectory(nodeKey: string, showLoading = false): Promise<TreeOption[]> {
  let normalizedPath = nodeKey || '/'
  if (!normalizedPath.startsWith('/')) {
    normalizedPath = '/' + normalizedPath
  }

  const cacheKey = `${currentDirType.value}:${normalizedPath}`

  if (loadingPaths.has(cacheKey)) {
    return []
  }

  if (loadedPaths.has(cacheKey)) {
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

    const items = response.data.data.items || []

    const nodes = items.map((item: any) => {
      const node: TreeOption = {
        key: item.path || `/${item.name}`,
        label: item.name,
        prefix: () => getFileIcon(item.isDirectory, item.type, item.extension),
        isLeaf: !item.isDirectory,
        children: item.isDirectory ? [] : undefined
      }
      return node
    })

    loadedPaths.set(cacheKey, nodes)
    return nodes
  } catch (error: any) {
    console.error('[FileExplorer] 加载目录失败:', error)
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
 * 处理树节点展开（懒加载子目录）
 */
async function handleLoad(node: TreeOption): Promise<TreeOption[]> {
  if (!node.key) {
    return []
  }

  const children = await loadDirectory(node.key as string)
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
    emit('fileSelected', key)
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
 * 刷新文件树
 */
async function refreshTree() {
  loadedPaths.clear()
  loadingPaths.clear()
  treeData.value = await loadDirectory('/', true)
  message.success('已刷新')
}

onMounted(async () => {
  treeData.value = await loadDirectory('/', true)
})

watch(() => props.sessionId, async () => {
  if (props.sessionId) {
    loadedPaths.clear()
    loadingPaths.clear()
    treeData.value = await loadDirectory('/', true)
  }
})
</script>

<template>
  <div class="module-container">
    <div class="module-header">
      <span>{{ panelTitle }}</span>
      <div class="header-actions">
        <NTag
          :type="currentDirType === 'session' ? 'info' : 'default'"
          size="small"
          round
          :style="{ cursor: 'pointer', fontSize: '10px' }"
          @click="switchDirectoryType('session')"
        >
          <template #icon>
            <NIcon :size="12"><Briefcase /></NIcon>
          </template>
          会话
        </NTag>
        <NTag
          :type="currentDirType === 'user' ? 'warning' : 'default'"
          size="small"
          round
          :style="{ cursor: 'pointer', fontSize: '10px' }"
          @click="switchDirectoryType('user')"
        >
          <template #icon>
            <NIcon :size="12"><Home /></NIcon>
          </template>
          主目录
        </NTag>
        <NButton text size="small" @click="refreshTree">
          <template #icon>
            <NIcon :size="14"><Refresh /></NIcon>
          </template>
        </NButton>
      </div>
    </div>

    <!-- 用户主目录特殊提示 -->
    <div v-if="currentDirType === 'user' && userDirInfo" class="dir-info-bar">
      <NTag :bordered="false" size="small" type="success" :style="{ fontSize: '10px' }">
        {{ userDirInfo.skillsCount }} 个 Skills 已安装
      </NTag>
    </div>

    <div class="tree-wrapper">
      <NSpin :show="loading">
        <NTree
          v-if="treeData.length > 0"
          :data="treeData"
          :expanded-keys="expandedKeys"
          :selected-keys="selectedKey ? [selectedKey] : []"
          :on-load="handleLoad"
          :virtual-scroll="true"
          selectable
          block-line
          :style="{ background: 'transparent', color: '#ccc' }"
          @update:expanded-keys="(keys: string[]) => expandedKeys = keys"
          @update:selected-keys="handleSelect"
          class="file-tree"
        />

        <NEmpty
          v-else
          :description="currentDirType === 'session' ? '工作区为空' : '用户主目录为空'"
          :style="{ padding: '40px 20px' }"
        >
          <template #icon>
            <span style="font-size: 48px; opacity: 0.3;">
              {{ currentDirType === 'session' ? '📂' : '🏠' }}
            </span>
          </template>
        </NEmpty>
      </NSpin>
    </div>
  </div>
</template>

<style scoped>
.module-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--ide-sidebar);
  overflow: hidden;
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 12px;
  font-size: 11px;
  font-weight: bold;
  color: #969696;
  text-transform: uppercase;
  letter-spacing: 1px;
  flex-shrink: 0;
  user-select: none;
  border-bottom: 1px solid var(--ide-border);
  height: 35px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dir-info-bar {
  padding: 6px 12px;
  background: rgba(99, 102, 241, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tree-wrapper {
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
</style>
