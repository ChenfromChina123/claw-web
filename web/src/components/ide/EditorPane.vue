<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick, computed } from 'vue'
import {
  NIcon,
  NTag,
  NButton,
  NEmpty,
  useMessage,
  NSpin
} from 'naive-ui'
import { Close, Save } from '@vicons/ionicons5'
import apiClient from '@/api/client'
import * as monaco from 'monaco-editor'

interface Props {
  sessionId?: string
  filePath?: string
}

const props = defineProps<Props>()

const message = useMessage()

/**
 * 编辑器标签页接口
 */
interface EditorTab {
  id: string
  filePath: string
  fileName: string
  language: string
  content: string
  isDirty: boolean
}

/**
 * 打开的标签页列表
 */
const openTabs = ref<EditorTab[]>([])

/**
 * 当前激活的标签页 ID
 */
const activeTabId = ref<string | null>(null)

/**
 * 是否正在加载文件
 */
const loading = ref(false)

/**
 * 编辑器容器引用
 */
const editorContainer = ref<HTMLElement | null>(null)

/**
 * Monaco Editor 实例
 */
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null

/**
 * 是否已初始化编辑器
 */
const editorInitialized = ref(false)

/**
 * 获取当前激活的标签页
 */
const activeTab = computed(() => {
  if (!activeTabId.value) return null
  return openTabs.value.find(tab => tab.id === activeTabId.value) || null
})

/**
 * 获取当前文件名（用于显示在面板头部）
 */
const currentFileName = computed(() => {
  return activeTab.value?.fileName || props.filePath?.split('/').pop() || ''
})

/**
 * 获取当前语言类型
 */
const currentLanguage = computed(() => {
  return activeTab.value?.language || 'plaintext'
})

/**
 * 从文件路径生成唯一 ID
 */
function generateTabId(filePath: string): string {
  return `tab_${filePath.replace(/[/\\]/g, '_')}`
}

/**
 * 打开文件到编辑器
 * @param filePath 文件路径
 */
async function openFile(filePath: string) {
  const existingTab = openTabs.value.find(tab => tab.filePath === filePath)

  if (existingTab) {
    activeTabId.value = existingTab.id
    await switchToTab(existingTab.id)
    return
  }

  try {
    loading.value = true

    let params: any = { path: filePath }
    if (props.sessionId) {
      params.sessionId = props.sessionId
    }

    const response = await apiClient.get('/agent/workdir/content', { params }) as any
    const data = response.data.data

    const newTab: EditorTab = {
      id: generateTabId(filePath),
      filePath,
      fileName: filePath.split('/').pop() || 'untitled',
      language: data.language || 'plaintext',
      content: data.content || '',
      isDirty: false
    }

    openTabs.value.push(newTab)
    activeTabId.value = newTab.id

    await nextTick()
    initEditorIfNeeded()

    if (editorInstance) {
      const model = editorInstance.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, newTab.language)
        model.setValue(newTab.content)
      }
    }
  } catch (error: any) {
    console.error('[Editor] 加载文件失败:', error)
    message.error(error.response?.data?.error?.message || '加载文件失败')
  } finally {
    loading.value = false
  }
}

/**
 * 切换到指定标签页
 * @param tabId 标签页 ID
 */
async function switchToTab(tabId: string) {
  const tab = openTabs.value.find(t => t.id === tabId)
  if (!tab || !editorInstance) return

  activeTabId.value = tabId

  const model = editorInstance.getModel()
  if (model) {
    monaco.editor.setModelLanguage(model, tab.language)
    model.setValue(tab.content)
  }
}

/**
 * 关闭标签页
 * @param tabId 要关闭的标签页 ID
 */
async function closeTab(tabId: string, event?: Event) {
  if (event) {
    event.stopPropagation()
  }

  const tabIndex = openTabs.value.findIndex(t => t.id === tabId)
  if (tabIndex === -1) return

  const tab = openTabs.value[tabIndex]

  if (tab.isDirty) {
    const confirmed = confirm(`文件 ${tab.fileName} 有未保存的修改，确定要关闭吗？`)
    if (!confirmed) return
  }

  openTabs.value.splice(tabIndex, 1)

  if (activeTabId.value === tabId) {
    if (openTabs.value.length > 0) {
      const newIndex = Math.min(tabIndex, openTabs.value.length - 1)
      await switchToTab(openTabs.value[newIndex].id)
    } else {
      activeTabId.value = null
      if (editorInstance) {
        editorInstance.setValue('')
      }
    }
  }
}

/**
 * 保存当前文件
 */
async function saveCurrentFile() {
  if (!activeTab.value || !editorInstance) return

  try {
    loading.value = true

    const content = editorInstance.getValue()
    const tab = activeTab.value

    let body: any = {
      filePath: tab.filePath,
      content
    }

    if (props.sessionId) {
      body.sessionId = props.sessionId
    }

    await apiClient.post('/agent/workdir/save', body)

    tab.content = content
    tab.isDirty = false

    message.success('文件已保存')
  } catch (error: any) {
    console.error('[Editor] 保存文件失败:', error)
    message.error(error.response?.data?.error?.message || '保存文件失败')
  } finally {
    loading.value = false
  }
}

/**
 * 初始化 Monaco Editor（如果尚未初始化）
 */
function initEditorIfNeeded() {
  if (editorInitialized.value || !editorContainer.value) return

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
      if (activeTab.value) {
        activeTab.value.isDirty = true
      }
    })

    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveCurrentFile()
    })

    editorInitialized.value = true
  } catch (error) {
    console.error('[Editor] 初始化编辑器失败:', error)
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

onMounted(async () => {
  await nextTick()
  initEditorIfNeeded()

  if (props.filePath) {
    await openFile(props.filePath)
  }
})

onBeforeUnmount(() => {
  destroyEditor()
})

watch(() => props.filePath, async (newPath) => {
  if (newPath && !openTabs.value.find(t => t.filePath === newPath)) {
    await openFile(newPath)
  }
})
</script>

<template>
  <div class="module-container" style="background: #1e1e1e;">
    <!-- 面板头部 -->
    <div class="module-header" style="background: #252526;">
      <span>{{ currentFileName || '编辑器' }}</span>
      <div v-if="currentFileName" class="header-tags">
        <NTag :bordered="false" size="small" type="default" :style="{ fontSize: '10px' }">
          {{ currentLanguage.toUpperCase() }}
        </NTag>
        <NTag v-if="activeTab?.isDirty" :bordered="false" size="small" type="warning" :style="{ fontSize: '10px' }">
          未保存
        </NTag>
      </div>
    </div>

    <!-- 标签页栏 -->
    <div v-if="openTabs.length > 0" class="tabs-bar">
      <div
        v-for="tab in openTabs"
        :key="tab.id"
        class="tab-item"
        :class="{ active: tab.id === activeTabId }"
        @click="switchToTab(tab.id)"
      >
        <span class="tab-name">{{ tab.fileName }}</span>
        <span v-if="tab.isDirty" class="dirty-indicator">●</span>
        <NIcon
          class="tab-close"
          :size="14"
          @click="(e) => closeTab(tab.id, e)"
        >
          <Close />
        </NIcon>
      </div>

      <div class="tab-actions">
        <NButton text size="small" :disabled="!activeTab?.isDirty" @click="saveCurrentFile">
          <template #icon>
            <NIcon :size="14"><Save /></NIcon>
          </template>
        </NButton>
      </div>
    </div>

    <!-- 编辑器区域 -->
    <div class="editor-wrapper">
      <NSpin :show="loading">
        <div
          v-if="openTabs.length > 0 || currentFileName"
          ref="editorContainer"
          class="monaco-editor-container"
        ></div>

        <NEmpty
          v-else
          description="选择一个文件以开始编辑"
          :style="{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }"
        >
          <template #icon>
            <span style="font-size: 64px; opacity: 0.2;">📝</span>
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
  background: #1e1e1e;
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
  background: #252526;
}

.header-tags {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tabs-bar {
  display: flex;
  align-items: center;
  background: #252526;
  border-bottom: 1px solid var(--ide-border);
  height: 35px;
  padding: 0 4px;
  flex-shrink: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.tabs-bar::-webkit-scrollbar {
  height: 3px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  cursor: pointer;
  color: var(--ide-text-secondary);
  font-size: 13px;
  white-space: nowrap;
  border-radius: 4px 4px 0 0;
  transition: all 0.15s ease;
  user-select: none;
}

.tab-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.tab-item.active {
  background: #1e1e1e;
  color: #fff;
  border-top: 1px solid var(--ide-accent);
}

.tab-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dirty-indicator {
  color: #f59e0b;
  font-size: 10px;
}

.tab-close {
  opacity: 0;
  transition: opacity 0.15s;
  cursor: pointer;
  color: inherit;
}

.tab-item:hover .tab-close {
  opacity: 0.7;
}

.tab-close:hover {
  opacity: 1 !important;
  color: #fff !important;
}

.tab-actions {
  margin-left: auto;
  padding-right: 4px;
}

.editor-wrapper {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.monaco-editor-container {
  width: 100%;
  height: 100%;
}
</style>
