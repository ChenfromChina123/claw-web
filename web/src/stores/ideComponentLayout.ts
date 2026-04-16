/**
 * IDE 组件布局设置 Store
 * 管理 IDE 工作台中各个组件的展开/收起状态
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ComponentLayoutState {
  /** 左侧资源管理器/文件管理器面板 */
  explorerVisible: boolean
  /** 编辑器面板 */
  editorVisible: boolean
  /** 终端面板 */
  terminalVisible: boolean
  /** AI Agent/聊天面板 */
  chatVisible: boolean
}

const STORAGE_KEY = 'ideComponentLayoutV1'

const DEFAULT_STATE: ComponentLayoutState = {
  explorerVisible: true,
  editorVisible: true,
  terminalVisible: true,
  chatVisible: true,
}

export const useIdeComponentLayoutStore = defineStore('ideComponentLayout', () => {
  const explorerVisible = ref(DEFAULT_STATE.explorerVisible)
  const editorVisible = ref(DEFAULT_STATE.editorVisible)
  const terminalVisible = ref(DEFAULT_STATE.terminalVisible)
  const chatVisible = ref(DEFAULT_STATE.chatVisible)

  const allVisible = computed(() => {
    return explorerVisible.value && editorVisible.value && terminalVisible.value && chatVisible.value
  })

  const visibleCount = computed(() => {
    let count = 0
    if (explorerVisible.value) count++
    if (editorVisible.value) count++
    if (terminalVisible.value) count++
    if (chatVisible.value) count++
    return count
  })

  function loadState(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<ComponentLayoutState>
      if (parsed.explorerVisible !== undefined) explorerVisible.value = parsed.explorerVisible
      if (parsed.editorVisible !== undefined) editorVisible.value = parsed.editorVisible
      if (parsed.terminalVisible !== undefined) terminalVisible.value = parsed.terminalVisible
      if (parsed.chatVisible !== undefined) chatVisible.value = parsed.chatVisible
    } catch {
      /* ignore */
    }
  }

  function saveState(): void {
    try {
      const state: ComponentLayoutState = {
        explorerVisible: explorerVisible.value,
        editorVisible: editorVisible.value,
        terminalVisible: terminalVisible.value,
        chatVisible: chatVisible.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }

  function toggleExplorer(): void {
    explorerVisible.value = !explorerVisible.value
    saveState()
  }

  function toggleEditor(): void {
    editorVisible.value = !editorVisible.value
    saveState()
  }

  function toggleTerminal(): void {
    terminalVisible.value = !terminalVisible.value
    saveState()
  }

  function toggleChat(): void {
    chatVisible.value = !chatVisible.value
    saveState()
  }

  function toggleAll(): void {
    if (allVisible.value) {
      explorerVisible.value = false
      editorVisible.value = false
      terminalVisible.value = false
      chatVisible.value = false
    } else {
      explorerVisible.value = true
      editorVisible.value = true
      terminalVisible.value = true
      chatVisible.value = true
    }
    saveState()
  }

  function reset(): void {
    explorerVisible.value = DEFAULT_STATE.explorerVisible
    editorVisible.value = DEFAULT_STATE.editorVisible
    terminalVisible.value = DEFAULT_STATE.terminalVisible
    chatVisible.value = DEFAULT_STATE.chatVisible
    saveState()
  }

  loadState()

  return {
    explorerVisible,
    editorVisible,
    terminalVisible,
    chatVisible,
    allVisible,
    visibleCount,
    toggleExplorer,
    toggleEditor,
    toggleTerminal,
    toggleChat,
    toggleAll,
    reset,
  }
})
