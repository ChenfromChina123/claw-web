import { ref, watch, h, computed, InjectionKey, provide, inject } from 'vue'
import {
  NIcon,
  useMessage,
  type TreeOption
} from 'naive-ui'
import {
  Folder,
  DocumentText,
  Code,
  Image,
  LogoMarkdown
} from '@vicons/ionicons5'
import apiClient from '@/api/client'
import * as monaco from 'monaco-editor'

/**
 * 已打开文件（多标签）
 */
export interface OpenFileEntry {
  id: string
  path: string
  name: string
  /** 'text' | 'binary' */
  mode?: 'text' | 'binary'
  /** MIME type for binary files */
  mimeType?: string
  /** Extension like .pdf, .png */
  ext?: string
  /** Whether this file is read-only (binary files) */
  readOnly?: boolean
}

/**
 * 工作目录上下文接口
 */
export interface WorkdirContext {
  // 状态
  treeData: ReturnType<typeof ref<TreeOption[]>>
  currentFilePath: ReturnType<typeof ref<string>>
  fileContent: ReturnType<typeof ref<string>>
  fileLanguage: ReturnType<typeof ref<string>>
  loading: ReturnType<typeof ref<boolean>>
  editorInitialized: ReturnType<typeof ref<boolean>>
  hasUnsavedChanges: ReturnType<typeof ref<boolean>>
  expandedKeys: ReturnType<typeof ref<string[]>>
  selectedKey: ReturnType<typeof ref<string | null>>
  uploading: ReturnType<typeof ref<boolean>>
  editorInstance: monaco.editor.IStandaloneCodeEditor | null
  openFiles: ReturnType<typeof ref<OpenFileEntry[]>>
  activeFileId: ReturnType<typeof ref<string | null>>
  /** 当前活跃文件是否是只读二进制文件 */
  activeIsReadOnly: ReturnType<typeof ref<boolean>>
  /** 当前活跃文件的 Blob URL（用于图片预览） */
  activeBlobUrl: ReturnType<typeof ref<string | null>>

  // 方法
  loadDirectory: (nodeKey: string, showLoading?: boolean) => Promise<TreeOption[]>
  loadFileContent: (filePath: string) => Promise<void>
  saveCurrentFile: () => Promise<void>
  handleLoad: (node: TreeOption) => Promise<TreeOption[]>
  handleSelect: (keys: Array<string | number>) => void
  refreshTree: (options?: { silent?: boolean }) => Promise<void>
  initTree: () => Promise<void>
  uploadWorkdirFiles: (files: File[], directory?: string) => Promise<{ uploaded: number; failed: number }>
  initEditor: (container: HTMLElement) => void
  destroyEditor: () => void
  selectOpenFile: (fileId: string) => Promise<void>
  closeOpenFile: (fileId: string) => Promise<void>
  tabLanguageLabel: (entry: OpenFileEntry) => string
  /** 调用浏览器下载 API 下载工作区文件 */
  downloadFile: (filePath: string, fileName: string) => Promise<void>

  // 计算属性
  panelTitle: { value: string }
}

/**
 * Injection Key
 */
export const WORKDIR_INJECTION_KEY: InjectionKey<WorkdirContext> = Symbol('workdir-context')

/**
 * API 基础路径
 */
const API_WORKDIR_BASE = '/agent/workdir'

/**
 * useAgentWorkdir Composable
 *
 * 抽取工作目录状态与逻辑，提供统一的 API。
 * 所有操作均针对用户统一工作目录，不再区分会话/主目录。
 */
export function useAgentWorkdir(sessionIdRef: { value: string }, options?: { provided?: boolean }) {
  const message = useMessage()

  // ========== 状态 ==========

  const treeData = ref<TreeOption[]>([])
  const currentFilePath = ref<string>('')
  const fileContent = ref<string>('')
  const fileLanguage = ref<string>('plaintext')
  const loading = ref(false)
  const editorInitialized = ref(false)
  const hasUnsavedChanges = ref(false)
  const expandedKeys = ref<string[]>([])
  const selectedKey = ref<string | null>(null)
  const uploading = ref(false)

  /** 路径 → 子节点缓存（必须带 sessionId，避免切换会话后旧请求写错缓存 / 覆盖 UI） */
  const loadedPaths = new Map<string, TreeOption[]>()
  const loadingPaths = new Set<string>()
  const loadingNodes = new Set<string>()

  function pathCacheKey(sessionId: string, normalizedPath: string): string {
    return `${sessionId}:${normalizedPath}`
  }

  const openFiles = ref<OpenFileEntry[]>([])
  const activeFileId = ref<string | null>(null)
  const activeIsReadOnly = ref(false)
  const activeBlobUrl = ref<string | null>(null)

  /** Each open file maps to a Monaco model with independent undo stack */
  const modelMap = new Map<string, monaco.editor.ITextModel>()
  /** The model.getAlternativeVersionId() at the last save/server sync */
  const savedVersionId = new Map<string, number>()

  // Monaco Editor instance
  let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null

  // ========== 计算属性 ==========

  const panelTitle = computed(() => '📁 工作目录')

  function tabLanguageLabel(entry: OpenFileEntry): string {
    if (entry.mode === 'binary') return '🔒'
    const ext = entry.name.includes('.')
      ? entry.name.split('.').pop()?.toLowerCase() || ''
      : ''
    const map: Record<string, string> = {
      ts: 'TS', tsx: 'TSX',
      js: 'JS', jsx: 'JSX',
      vue: 'VUE', md: 'MD',
      json: 'JSON', css: 'CSS',
      scss: 'SCSS', html: 'HTML',
      py: 'PY', rs: 'RS', go: 'GO',
      pdf: 'PDF', png: 'PNG', jpg: 'JPG', gif: 'GIF',
    }
    if (ext && map[ext]) return map[ext]
    if (ext) return ext.slice(0, 4).toUpperCase()
    return 'TXT'
  }

  function disposeAllOpenTabs(): void {
    if (editorInstance) {
      editorInstance.setModel(null)
    }
    for (const m of modelMap.values()) {
      m.dispose()
    }
    modelMap.clear()
    savedVersionId.clear()
    for (const url of blobUrlRegistry.values()) {
      URL.revokeObjectURL(url)
    }
    blobUrlRegistry.clear()
    openFiles.value = []
    activeFileId.value = null
    currentFilePath.value = ''
    fileContent.value = ''
    hasUnsavedChanges.value = false
    activeIsReadOnly.value = false
    if (activeBlobUrl.value) {
      URL.revokeObjectURL(activeBlobUrl.value)
      activeBlobUrl.value = null
    }
  }

  function isModelDirty(fileId: string): boolean {
    const model = modelMap.get(fileId)
    if (!model) return false
    const saved = savedVersionId.get(fileId)
    if (saved === undefined) return false
    return model.getAlternativeVersionId() !== saved
  }

  function syncActiveDirtyState(): void {
    const id = activeFileId.value
    hasUnsavedChanges.value = id ? isModelDirty(id) : false
  }

  /** Blob URL registry — revoke on tab close to avoid memory leaks */
  const blobUrlRegistry = new Map<string, string>()

  async function fetchFileContentFromApi(filePath: string): Promise<{
    mode: 'text' | 'binary'
    content?: string
    language?: string
    mimeType?: string
    ext?: string
  }> {
    const response = await apiClient.get(`${API_WORKDIR_BASE}/content`, {
      params: { sessionId: sessionIdRef.value, path: filePath }
    }) as any
    const data = response.data.data
    return {
      mode: data.mode || 'text',
      content: data.content,
      language: data.language || 'plaintext',
      mimeType: data.mimeType,
      ext: data.ext,
    }
  }

  async function activateOpenFile(fileId: string): Promise<void> {
    const entry = openFiles.value.find(f => f.id === fileId)
    if (!entry) return

    selectedKey.value = entry.path
    currentFilePath.value = entry.path
    activeFileId.value = fileId
    fileContent.value = ''

    // Clean up previous Blob URL if any
    if (activeBlobUrl.value) {
      URL.revokeObjectURL(activeBlobUrl.value)
      activeBlobUrl.value = null
    }

    // 二进制预览不依赖 Monaco；必须先处理，否则在编辑器未 init 时会被下方 return 挡掉（PDF/Office 一直「加载失败」）
    if (entry.mode === 'binary') {
      activeIsReadOnly.value = true
      try {
        loading.value = true
        const { content, mimeType } = await fetchFileContentFromApi(entry.path)
        const resolvedMime =
          mimeType || entry.mimeType || 'application/octet-stream'
        if (content) {
          const b64 = content.replace(/\s/g, '')
          const binaryData = atob(b64)
          const len = binaryData.length
          const buf = new Uint8Array(len)
          for (let i = 0; i < len; i++) buf[i] = binaryData.charCodeAt(i)
          const blob = new Blob([buf], { type: resolvedMime })
          activeBlobUrl.value = URL.createObjectURL(blob)
          blobUrlRegistry.set(fileId, activeBlobUrl.value)
        } else {
          message.error('服务端未返回文件内容，请尝试「下载文件」或刷新后重试')
        }
      } catch (error: any) {
        console.error('[useAgentWorkdir] 加载二进制文件失败:', error)
        message.error(error.response?.data?.error?.message || '加载文件失败')
      } finally {
        loading.value = false
      }
      return
    }

    if (!editorInstance) return

    // Text file → Monaco editor
    activeIsReadOnly.value = false

    let model = modelMap.get(fileId)
    if (!model) {
      try {
        loading.value = true
        const { content, language } = await fetchFileContentFromApi(entry.path)
        const uri = monaco.Uri.parse(`workdir:${encodeURIComponent(entry.path)}`)
        model = monaco.editor.createModel(content ?? '', language ?? 'plaintext', uri)
        modelMap.set(fileId, model)
        savedVersionId.set(fileId, model.getAlternativeVersionId())
      } catch (error: any) {
        console.error('[useAgentWorkdir] 加载文件失败:', error)
        message.error(error.response?.data?.error?.message || '加载文件失败')
        loading.value = false
        return
      } finally {
        loading.value = false
      }
    }

    editorInstance.setModel(model)
    fileLanguage.value = model.getLanguageId()
    syncActiveDirtyState()
  }

  const BINARY_EXTS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg',
    '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.wmv', '.flv',
    '.ttf', '.otf', '.woff', '.woff2', '.eot',
    '.exe', '.dll', '.so', '.dylib',
  ])

  const MIME_MAP: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
    '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }

  function detectFileMode(name: string): { mode: 'text' | 'binary'; mimeType?: string; ext: string } {
    const dot = name.lastIndexOf('.')
    const ext = dot === -1 ? '' : name.substring(dot).toLowerCase()
    if (BINARY_EXTS.has(ext)) {
      return { mode: 'binary', mimeType: MIME_MAP[ext], ext }
    }
    return { mode: 'text', ext }
  }

  async function openFileFromExplorer(path: string): Promise<void> {
    const id = path
    const name = path.split(/[/\\]/).pop() || path
    const { mode, mimeType, ext } = detectFileMode(name)

    if (!openFiles.value.some(f => f.id === id)) {
      openFiles.value.push({ id, path, name, mode, mimeType, ext, readOnly: mode === 'binary' })
    }
    activeFileId.value = id
    selectedKey.value = path
    currentFilePath.value = path
    await activateOpenFile(id)
  }

  async function selectOpenFile(fileId: string): Promise<void> {
    if (activeFileId.value === fileId) return
    await activateOpenFile(fileId)
  }

  async function closeOpenFile(fileId: string): Promise<void> {
    if (isModelDirty(fileId)) {
      const ok = window.confirm('该文件未保存，确定关闭标签？')
      if (!ok) return
    }

    const model = modelMap.get(fileId)
    if (model) {
      model.dispose()
      modelMap.delete(fileId)
    }
    savedVersionId.delete(fileId)

    // Revoke Blob URL to prevent memory leak
    const blob = blobUrlRegistry.get(fileId)
    if (blob) {
      URL.revokeObjectURL(blob)
      blobUrlRegistry.delete(fileId)
    }
    if (activeBlobUrl.value && activeBlobUrl.value === blob) {
      activeBlobUrl.value = null
    }

    const idx = openFiles.value.findIndex(f => f.id === fileId)
    if (idx === -1) return
    openFiles.value.splice(idx, 1)

    const wasActive = activeFileId.value === fileId
    if (!wasActive) return

    if (openFiles.value.length === 0) {
      activeFileId.value = null
      currentFilePath.value = ''
      fileLanguage.value = 'plaintext'
      hasUnsavedChanges.value = false
      activeIsReadOnly.value = false
      disposeMonacoWidget()
      return
    }

    const next = openFiles.value[Math.min(idx, openFiles.value.length - 1)]
    await activateOpenFile(next.id)
  }

  /**
   * Download a workspace file via the download API (opens in browser / triggers download)
   */
  async function downloadFile(filePath: string, fileName: string): Promise<void> {
    const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
    const url = `${baseUrl}${API_WORKDIR_BASE}/download?sessionId=${encodeURIComponent(sessionIdRef.value)}&path=${encodeURIComponent(filePath)}`
    const token = localStorage.getItem('token')
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      message.error('下载失败')
      return
    }
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
    message.success(`已下载 ${fileName}`)
  }

  // ========== 核心方法 ==========

  /**
   * 加载目录内容（懒加载）
   */
  async function loadDirectory(nodeKey: string, showLoading = false): Promise<TreeOption[]> {
    const sid = sessionIdRef.value
    console.log('[useAgentWorkdir] loadDirectory called:', { nodeKey, showLoading, sid })

    if (!sid) {
      return []
    }

    let normalizedPath = nodeKey || '/'
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath
    }

    const cacheKey = pathCacheKey(sid, normalizedPath)

    if (loadingPaths.has(cacheKey)) {
      console.log('[useAgentWorkdir] Path is already loading, skipping:', cacheKey)
      return []
    }

    if (loadedPaths.has(cacheKey)) {
      console.log('[useAgentWorkdir] Path already loaded, returning cached:', cacheKey)
      return loadedPaths.get(cacheKey) || []
    }

    try {
      loadingPaths.add(cacheKey)

      if (showLoading) loading.value = true

      const response = await apiClient.get(`${API_WORKDIR_BASE}/list`, {
        params: { sessionId: sid, path: normalizedPath }
      }) as any

      if (sessionIdRef.value !== sid) {
        console.log('[useAgentWorkdir] 会话已切换，忽略目录列表响应:', { sid, now: sessionIdRef.value })
        return []
      }

      console.log('[useAgentWorkdir] API response:', response.data)

      const items = response.data.data.items || []

      const nodes = items.map((item: any) => {
        const node: TreeOption = {
          key: item.path || `/${item.name}`,
          label: item.name,
          prefix: () => getFileIcon(item.isDirectory, item.type),
          isLeaf: !item.isDirectory,
          children: item.isDirectory ? [] : undefined
        }
        console.log('[useAgentWorkdir] Created node:', {
          key: node.key, label: node.label, isLeaf: node.isLeaf, isDirectory: item.isDirectory, hasChildren: !!node.children
        })
        return node
      })

      loadedPaths.set(cacheKey, nodes)
      console.log('[useAgentWorkdir] Returning nodes:', nodes.length)
      return nodes
    } catch (error: any) {
      if (sessionIdRef.value !== sid) {
        return []
      }
      console.error('[useAgentWorkdir] 加载目录失败:', error)
      message.error(error.response?.data?.error?.message || '加载目录失败')
      return []
    } finally {
      loadingPaths.delete(cacheKey)
      if (showLoading) loading.value = false
    }
  }

  /**
   * 加载文件内容到编辑器
   */
  async function loadFileContent(filePath: string) {
    console.log('[useAgentWorkdir] loadFileContent called:', filePath)
    await openFileFromExplorer(filePath)
  }

  /**
   * 保存当前文件
   */
  async function saveCurrentFile() {
    const id = activeFileId.value
    const entry = id ? openFiles.value.find(f => f.id === id) : null
    if (!entry || !editorInstance) {
      message.warning('没有可保存的文件')
      return
    }

    const model = editorInstance.getModel()
    if (!model) {
      message.warning('没有可保存的文件')
      return
    }

    try {
      loading.value = true
      const content = model.getValue()

      await apiClient.post(`${API_WORKDIR_BASE}/save`, {
        sessionId: sessionIdRef.value,
        filePath: entry.path,
        content
      })

      savedVersionId.set(entry.id, model.getAlternativeVersionId())
      hasUnsavedChanges.value = false
      message.success('✅ 文件已保存')
    } catch (error: any) {
      console.error('[useAgentWorkdir] 保存文件失败:', error)
      message.error(error.response?.data?.error?.message || '保存文件失败')
    } finally {
      loading.value = false
    }
  }

  /**
   * 处理树节点展开（懒加载子目录）
   */
  async function handleLoad(node: TreeOption): Promise<TreeOption[]> {
    console.log('[useAgentWorkdir] handleLoad called for node:', node.key)
    if (!node.key) return []

    const nodeKey = String(node.key)

    if (loadingNodes.has(nodeKey)) {
      console.log('[useAgentWorkdir] Node is already loading, skipping:', nodeKey)
      return []
    }

    loadingNodes.add(nodeKey)
    try {
      const children = await loadDirectory(nodeKey)
      console.log('[useAgentWorkdir] Loaded children:', children.length, 'items for path:', nodeKey)
      return children
    } finally {
      loadingNodes.delete(nodeKey)
    }
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
      void loadFileContent(key)
    }
  }

  /**
   * 递归查找树节点
   */
  function findNodeByKey(nodes: TreeOption[], key: string): TreeOption | null {
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
   * 获取文件/目录图标
   */
  function getFileIcon(isDirectory: boolean, fileType?: string) {
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
  function initEditor(container: HTMLElement) {
    if (!container || editorInitialized.value) return

    try {
      editorInstance = monaco.editor.create(container, {
        model: null,
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
        guides: { indentation: true, bracketPairs: true },
        padding: { top: 10, bottom: 10 }
      })

      editorInstance.onDidChangeModelContent(() => {
        syncActiveDirtyState()
      })

      editorInstance.onDidChangeModel(() => {
        syncActiveDirtyState()
      })

      editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void saveCurrentFile()
      })

      editorInitialized.value = true
      console.log('[useAgentWorkdir] Monaco Editor 初始化成功')

      if (activeFileId.value) {
        void activateOpenFile(activeFileId.value)
      }
    } catch (error) {
      console.error('[useAgentWorkdir] 初始化编辑器失败:', error)
      message.error('编辑器初始化失败')
    }
  }

  function disposeMonacoWidget(): void {
    if (editorInstance) {
      editorInstance.dispose()
      editorInstance = null
    }
    editorInitialized.value = false
  }

  /**
   * 销毁编辑器实例（含所有打开的标签与 model）
   */
  function destroyEditor() {
    disposeAllOpenTabs()
    disposeMonacoWidget()
  }

  /**
   * 重建根节点后，把仍处在展开状态的目录重新拉取子节点。
   * 否则 NTree 懒加载不会在「已展开」节点上再次触发 on-load，会表现为文件夹展开但下面空白（上传/刷新后常见）。
   */
  async function hydrateExpandedDirectoryChildren(expanded: string[]): Promise<void> {
    const sorted = [...expanded].filter(k => k && k !== '/').sort((a, b) => a.length - b.length)
    for (const key of sorted) {
      const node = findNodeByKey(treeData.value, key)
      if (!node || node.isLeaf) continue
      const children = await loadDirectory(key)
      node.children = children.length ? children : []
    }
  }

  /**
   * 刷新文件树
   */
  async function refreshTree(options?: { silent?: boolean }) {
    const sid = sessionIdRef.value
    if (!sid) return

    const prevExpanded = [...expandedKeys.value]
    loadedPaths.clear()
    loadingPaths.clear()
    loadingNodes.clear()
    const nodes = await loadDirectory('/', true)
    if (sessionIdRef.value !== sid) return

    treeData.value = nodes
    await hydrateExpandedDirectoryChildren(prevExpanded)
    if (!options?.silent) {
      message.success('🔄 已刷新')
    }
  }

  /**
   * 上传多个文件到工作区子目录（默认 uploads/，需 multipart 接口 POST /agent/workdir/upload）
   */
  async function uploadWorkdirFiles(
    files: File[],
    directory = 'uploads'
  ): Promise<{ uploaded: number; failed: number }> {
    const list = files.filter(f => f.size > 0)
    if (list.length === 0) {
      message.warning('没有可上传的文件')
      return { uploaded: 0, failed: 0 }
    }

    if (!sessionIdRef.value) {
      message.warning('请先选择或创建会话后再上传')
      return { uploaded: 0, failed: list.length }
    }

    const dirNorm = directory.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/') || 'uploads'
    if (dirNorm.includes('..')) {
      message.error('非法上传目录')
      return { uploaded: 0, failed: list.length }
    }

    const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
    const url = `${baseUrl}${API_WORKDIR_BASE}/upload`

    uploading.value = true
    try {
      const form = new FormData()
      form.append('sessionId', sessionIdRef.value)
      form.append('directory', dirNorm)
      for (const f of list) {
        form.append('files', f, f.name)
      }

      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null
      const res = await fetch(url, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form
      })

      const json = (await res.json()) as {
        success?: boolean
        data?: { uploaded?: { path: string; name: string; size: number }[]; failed?: { name: string; reason: string }[] }
        error?: { message?: string }
      }

      if (!res.ok || json.success === false) {
        message.error(json.error?.message || `上传失败 (${res.status})`)
        return { uploaded: 0, failed: list.length }
      }

      const up = json.data?.uploaded?.length ?? 0
      const fail = json.data?.failed?.length ?? 0

      if (up > 0) {
        const uploadDirKey = `/${dirNorm}`.replace(/\/+/g, '/')
        if (!expandedKeys.value.includes(uploadDirKey)) {
          expandedKeys.value = [...expandedKeys.value, uploadDirKey]
        }
        await refreshTree({ silent: true })
        if (fail > 0) {
          message.warning(`已上传 ${up} 个文件，${fail} 个失败`)
        } else {
          message.success(`已上传 ${up} 个文件到 ${uploadDirKey}`)
        }
      } else {
        message.error(json.error?.message || '上传失败')
      }

      return { uploaded: up, failed: fail }
    } catch (e: any) {
      console.error('[useAgentWorkdir] 上传失败:', e)
      message.error(e?.message || '上传失败')
      return { uploaded: 0, failed: list.length }
    } finally {
      uploading.value = false
    }
  }

  // ========== 监听 sessionId 变化 ==========
  // immediate：从 localStorage 恢复的会话 ID 在首屏不会「变化」，若无 immediate 则永远不会拉取根目录（刷新后树为空，只能靠上传触发的 refreshTree）

  // 不再用 immediate watch 隐式触发加载，避免与 IdeWorkbench onMounted 里的 loadSession 竞态
  // 改为由调用方（IdeWorkbench）显式调用 initTree() 初始化根目录
  async function initTree(): Promise<void> {
    if (!sessionIdRef.value) return

    disposeAllOpenTabs()
    disposeMonacoWidget()
    loadedPaths.clear()
    loadingPaths.clear()
    loadingNodes.clear()
    expandedKeys.value = []
    selectedKey.value = null
    treeData.value = []

    const nodes = await loadDirectory('/', true)
    if (sessionIdRef.value === undefined) return

    treeData.value = nodes
    currentFilePath.value = ''
    fileContent.value = ''
    hasUnsavedChanges.value = false
    activeIsReadOnly.value = false
  }

  // ========== 提供上下文 ==========

  const context: WorkdirContext = {
    treeData,
    currentFilePath,
    fileContent,
    fileLanguage,
    loading,
    editorInitialized,
    hasUnsavedChanges,
    expandedKeys,
    selectedKey,
    uploading,
    get editorInstance() {
      return editorInstance
    },
    openFiles,
    activeFileId,
    activeIsReadOnly,
    activeBlobUrl,
    loadDirectory,
    loadFileContent,
    saveCurrentFile,
    handleLoad,
    handleSelect,
    refreshTree,
    initTree,
    uploadWorkdirFiles,
    initEditor,
    destroyEditor,
    selectOpenFile,
    closeOpenFile,
    tabLanguageLabel,
    downloadFile,
    panelTitle
  }

  if (options?.provided !== false) {
    provide(WORKDIR_INJECTION_KEY, context)
  }

  return context
}

/**
 * 注入工作目录上下文（必须在 provide 的组件树内调用）
 */
export function useWorkdirContext(): WorkdirContext {
  const context = inject(WORKDIR_INJECTION_KEY)
  if (!context) {
    throw new Error('useWorkdirContext() 必须在 WorkdirContext 提供者的组件树内调用')
  }
  return context
}
