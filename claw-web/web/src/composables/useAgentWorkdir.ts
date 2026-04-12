import { ref, watch, h, computed, InjectionKey, provide, inject, type Ref } from 'vue'
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
import { resolveBrowserApiBase } from '@/config/apiBase'
import * as monaco from 'monaco-editor'
import { sessionApi } from '@/api/sessionApi'

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
  /** 获取标签页显示名称（智能处理同名文件冲突） */
  getTabDisplayName: (entry: OpenFileEntry) => string
  /** 调用浏览器下载 API 下载工作区文件 */
  downloadFile: (filePath: string, fileName: string) => Promise<void>
  /** 将文件夹打包为 zip 下载 */
  downloadFolderZip: (folderPath: string) => Promise<void>
  /** 按当前树选中项：文件直接下载，文件夹打包下载 */
  downloadSelected: () => Promise<void>
  /** 在「当前选中目录或选中文件的父目录」下新建文件/文件夹 */
  createWorkdirEntry: (name: string, kind: 'file' | 'directory') => Promise<boolean>
  /** 新建条目时作为父目录的路径（以 / 开头） */
  getNewItemParentPath: () => string

  /** 删除文件或文件夹 */
  deleteWorkdirEntry: (path: string, isDirectory: boolean) => Promise<boolean>

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

/** Word/Excel/PPT：不在浏览器内嵌预览，PreviewPanel 显示说明并提供下载 */
export const UNPREVIEWABLE_OFFICE_EXTS = new Set([
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
])

/**
 * useAgentWorkdir Composable
 *
 * 抽取工作目录状态与逻辑，提供统一的 API。
 * 所有操作均针对用户统一工作目录，不再区分会话/主目录。
 */

// ========== 初始化 composable ==========
export function useAgentWorkdir(sessionIdRef: Ref<string>, options?: { provided?: boolean }) {
  const message = useMessage()

  // ========== 持久化：已打开文件的记录（使用数据库，跨会话统一工作区）==========

  /**
   * 从数据库获取全局已打开文件记录（跨会话统一）
   */
  async function fetchPersistedOpenFiles(): Promise<{ openFilePaths: string[]; activeFilePath: string | null }> {
    try {
      const sid = sessionIdRef.value
      if (!sid) {
        return { openFilePaths: [], activeFilePath: null }
      }
      const result = await sessionApi.getOpenFiles(sid)
      // API 响应格式：{ success: true, data: { openFilePaths, activeFilePath } }
      // sessionApi.getOpenFiles 返回整个 ApiResponse，所以需要取 result.data
      // result.data 结构: { openFilePaths: string[]; activeFilePath: string | null }
      const record = (result as { data?: { openFilePaths?: string[]; activeFilePath?: string | null } }).data
      return {
        openFilePaths: record?.openFilePaths || [],
        activeFilePath: record?.activeFilePath || null,
      }
    } catch (error) {
      console.warn('[useAgentWorkdir] 获取已打开文件记录失败:', error)
      return { openFilePaths: [], activeFilePath: null }
    }
  }

  /**
   * 保存全局已打开文件记录到数据库（跨会话统一）
   */
  async function persistOpenFilesToDb(openFilePaths: string[], activeFilePath: string | null): Promise<void> {
    try {
      const sid = sessionIdRef.value
      if (!sid) return
      await sessionApi.saveOpenFiles(sid, openFilePaths, activeFilePath)
    } catch (error) {
      console.warn('[useAgentWorkdir] 保存已打开文件记录失败:', error)
    }
  }

  /**
   * 清除全局已打开文件记录（从数据库）
   */
  async function clearPersistedOpenFilesFromDb(): Promise<void> {
    try {
      const sid = sessionIdRef.value
      if (!sid) return
      await sessionApi.deleteOpenFiles(sid)
    } catch (error) {
      console.warn('[useAgentWorkdir] 清除已打开文件记录失败:', error)
    }
  }

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

  /** 路径 → 子节点缓存（统一工作区，sessionId 不再作为缓存 key 的一部分） */
  const loadedPaths = new Map<string, TreeOption[]>()
  const loadingPaths = new Set<string>()
  /** 同一目录并发 loadDirectory（如 NTree watchEffect 与 hydrateExpanded 同时拉取）合并为一次请求，避免另一路拿到 [] 误判已加载 */
  const dirLoadPromises = new Map<string, Promise<TreeOption[]>>()
  const loadingNodes = new Set<string>()
  /** 记录加载失败的路径，避免重复请求失败的后端（防止频繁重试） */
  const failedPaths = new Set<string>()

  /** 标记 restoreOpenFiles 是否正在进行，防止 watch sessionIdRef 多次触发导致重复请求 */
  let isRestoringOpenFiles = false

  function pathCacheKey(normalizedPath: string): string {
    return normalizedPath
  }

  function normalizeListPath(nodeKey: string): string {
    let p = nodeKey || '/'
    if (!p.startsWith('/')) {
      p = '/' + p
    }
    return p
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

  /**
   * 获取标签页显示名称（智能处理同名文件）
   * 当存在多个同名文件时，自动添加父目录前缀以区分
   * @param entry 文件条目
   * @returns 显示名称（可能包含路径前缀）
   */
  function getTabDisplayName(entry: OpenFileEntry): string {
    const sameNameFiles = openFiles.value.filter(f => f.name === entry.name && f.id !== entry.id)

    if (sameNameFiles.length === 0) {
      return entry.name
    }

    const pathParts = entry.path.split(/[/\\]/).filter(part => part !== '')
    if (pathParts.length <= 1) {
      return entry.name
    }

    const parentDir = pathParts[pathParts.length - 2]
    return `${parentDir}/${entry.name}`
  }

  function disposeAllOpenTabs(): void {
    // 切换会话前，保存当前已打开文件的记录
    if (sessionIdRef.value && openFiles.value.length > 0) {
      const paths = openFiles.value.map(f => f.path)
      const activePath = activeFileId.value
        ? openFiles.value.find(f => f.id === activeFileId.value)?.path || null
        : null
      void persistOpenFilesToDb(paths, activePath)
    }

    if (editorInstance) {
      editorInstance.setModel(null)
    }
    // 清理已追踪的模型
    for (const m of modelMap.values()) {
      m.dispose()
    }
    modelMap.clear()
    savedVersionId.clear()
    // 清理所有 Monaco 内部已打开的 workdir 模型，防止 model already exists 错误
    const toDispose: monaco.editor.ITextModel[] = []
    for (const m of monaco.editor.getModels()) {
      if (m.uri.scheme === 'workdir') {
        toDispose.push(m)
      }
    }
    for (const m of toDispose) {
      m.dispose()
    }
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

  function isHttp404(err: unknown): boolean {
    const e = err as { response?: { status?: number } }
    return e?.response?.status === 404
  }

  /**
   * 根目录误写路径的常见纠正（Agent 常把 skills/foo 记成 /foo）
   * 仅当直接路径 404 时按顺序尝试
   */
  function workdirContentFallbackPaths(requested: string): string[] {
    const n = requested.replace(/\\/g, '/')
    if (!n.startsWith('/')) return []
    const rest = n.slice(1)
    if (rest.includes('/')) return []
    if (!rest.includes('.')) return []
    return [`/skills/${rest}`, `/scripts/${rest}`, `/src/${rest}`, `/config/${rest}`, `/outputs/${rest}`, `/uploads/${rest}`, `/docs/${rest}`]
  }

  /**
   * 拉取文件内容；若根路径 404 则尝试 skills/ 等候选路径，并返回实际路径供标签页纠正
   */
  async function fetchFileContentFromApi(filePath: string): Promise<{
    resolvedPath: string
    mode: 'text' | 'binary'
    content?: string
    language?: string
    mimeType?: string
    ext?: string
  }> {
    const tryPaths = [filePath, ...workdirContentFallbackPaths(filePath)]
    const unique = [...new Set(tryPaths)]
    let lastErr: unknown
    for (const p of unique) {
      try {
        const response = await apiClient.get(`${API_WORKDIR_BASE}/content`, {
          params: { sessionId: sessionIdRef.value, path: p }
        }) as { data?: { data?: Record<string, unknown>; success?: boolean } }
        const data = response.data?.data as Record<string, unknown> | undefined
        if (!data) {
          lastErr = new Error('empty response')
          continue
        }
        return {
          resolvedPath: p,
          mode: (data.mode as 'text' | 'binary') || 'text',
          content: data.content as string | undefined,
          language: (data.language as string) || 'plaintext',
          mimeType: data.mimeType as string | undefined,
          ext: data.ext as string | undefined,
        }
      } catch (err: unknown) {
        lastErr = err
        if (isHttp404(err) && unique.indexOf(p) < unique.length - 1) {
          continue
        }
        throw err
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('加载文件失败')
  }

  /** 将标签页从错误路径纠正为服务端实际路径（与 model id 一致） */
  function remapOpenFileTab(oldPath: string, newPath: string): void {
    if (oldPath === newPath) return
    const idx = openFiles.value.findIndex(f => f.id === oldPath)
    if (idx === -1) return
    const entry = openFiles.value[idx]
    const name = newPath.split(/[/\\]/).pop() || newPath
    openFiles.value[idx] = {
      ...entry,
      id: newPath,
      path: newPath,
      name,
    }
    if (activeFileId.value === oldPath) activeFileId.value = newPath
    if (currentFilePath.value === oldPath) currentFilePath.value = newPath
    const oldModel = modelMap.get(oldPath)
    if (oldModel) {
      oldModel.dispose()
      modelMap.delete(oldPath)
      savedVersionId.delete(oldPath)
    }
    void persistOpenFiles()
  }

  /**
   * 激活已打开的文件（加载内容到编辑器）
   * @param fileId 文件ID
   * @param options 可选配置
   * @param options.silent 是否静默模式（恢复文件列表时不显示警告）
   * @returns 是否成功加载，失败时返回 false（用于恢复标签页时跳过无效文件）
   */
  async function activateOpenFile(fileId: string, options?: { silent?: boolean }): Promise<boolean> {
    const silent = options?.silent ?? false
    let entry = openFiles.value.find(f => f.id === fileId)
    if (!entry) return false

    await revealPathInTree(entry.path)
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
      const extLower = (entry.ext || '').toLowerCase()
      // Word/Excel/PPT 不在此内嵌预览，不拉取整文件，避免大文档 base64 解码卡顿与黑屏
      if (UNPREVIEWABLE_OFFICE_EXTS.has(extLower)) {
        return false
      }
      try {
        loading.value = true
        const fetched = await fetchFileContentFromApi(entry.path)
        const { content, mimeType, resolvedPath } = fetched
        if (resolvedPath !== entry.path) {
          remapOpenFileTab(entry.path, resolvedPath)
          entry = openFiles.value.find(f => f.id === resolvedPath) || entry
        }
        const blobKey = entry.path
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
          blobUrlRegistry.set(blobKey, activeBlobUrl.value)
        } else {
          message.error('服务端未返回文件内容，请尝试「下载文件」或刷新后重试')
          return false
        }
      } catch (error: unknown) {
        console.error('[useAgentWorkdir] 加载二进制文件失败:', error)
        const err = error as { response?: { status?: number; data?: { error?: { message?: string } } } }
        const status = err?.response?.status
        if (status === 404) {
          // 静默模式下不显示警告（恢复文件列表时）
          if (!silent) {
            message.warning(`文件不存在: ${entry.path}`)
          }
          const idx = openFiles.value.findIndex(f => f.id === fileId)
          if (idx !== -1) openFiles.value.splice(idx, 1)
          if (activeFileId.value === fileId) {
            activeFileId.value = openFiles.value[0]?.id || null
            if (activeFileId.value) {
              await activateOpenFile(activeFileId.value, { silent })
            } else {
              currentFilePath.value = ''
            }
          }
          const remainingPaths = openFiles.value.map(f => f.path)
          await persistOpenFilesToDb(remainingPaths, activeFileId.value)
        } else {
          if (!silent) {
            message.error(err?.response?.data?.error?.message || '加载文件失败')
          }
        }
        return false
      } finally {
        loading.value = false
      }
      return true
    }

    if (!editorInstance) return false

    // Text file → Monaco editor
    activeIsReadOnly.value = false

    let model = modelMap.get(fileId)
    console.log('[activateOpenFile] fileId:', fileId, 'modelMap 中是否存在 model:', !!model)
    if (!model) {
      // 再次检查 Monaco 内部模型（防止 URI 冲突）
      const uri = monaco.Uri.parse(`workdir:${encodeURIComponent(entry.path)}`)
      const existingModel = monaco.editor.getModel(uri)
      if (existingModel) {
        model = existingModel
        modelMap.set(fileId, model)
        savedVersionId.set(fileId, model.getAlternativeVersionId())
      }
    }
    if (!model) {
      try {
        loading.value = true
        const fetched = await fetchFileContentFromApi(entry.path)
        let { content, language, resolvedPath } = fetched
        if (resolvedPath !== entry.path) {
          remapOpenFileTab(entry.path, resolvedPath)
          entry = openFiles.value.find(f => f.id === resolvedPath) || entry
        }
        const effectiveId = entry.path
        const uri2 = monaco.Uri.parse(`workdir:${encodeURIComponent(resolvedPath)}`)
        // 双重检查（可能另一个窗口已创建）
        let existing = monaco.editor.getModel(uri2)
        if (existing) {
          model = existing
        } else {
          model = monaco.editor.createModel(content ?? '', language ?? 'plaintext', uri2)
        }
        modelMap.set(effectiveId, model)
        savedVersionId.set(effectiveId, model.getAlternativeVersionId())
      } catch (error: unknown) {
        console.error('[useAgentWorkdir] 加载文件失败:', error)
        const err = error as { response?: { status?: number; data?: { error?: { message?: string } } } }
        const status = err?.response?.status

        if (status === 404) {
          // 静默模式下不显示警告（恢复文件列表时）
          if (!silent) {
            message.warning(`文件不存在: ${entry.path}`)
          }

          const idx = openFiles.value.findIndex(f => f.id === fileId)
          if (idx !== -1) openFiles.value.splice(idx, 1)

          if (activeFileId.value === fileId) {
            activeFileId.value = openFiles.value[0]?.id || null
            if (activeFileId.value) {
              await activateOpenFile(activeFileId.value, { silent })
            } else {
              editorInstance?.setModel(null)
              currentFilePath.value = ''
            }
          }

          // 更新持久化记录
          const remainingPaths = openFiles.value.map(f => f.path)
          await persistOpenFilesToDb(remainingPaths, activeFileId.value)
        } else {
          if (!silent) {
            message.error(err?.response?.data?.error?.message || '加载文件失败')
          }
        }
        loading.value = false
        return false
      } finally {
        loading.value = false
      }
    }

    editorInstance.setModel(model)
    fileLanguage.value = model.getLanguageId()
    syncActiveDirtyState()
    return true
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

  async function openFileFromExplorer(path: string, options?: { silent?: boolean }): Promise<boolean> {
    const id = path
    const name = path.split(/[/\\]/).pop() || path
    const { mode, mimeType, ext } = detectFileMode(name)

    // 文件名相同时，只保留一个标签（按路径 id 查重）
    if (openFiles.value.some(f => f.id === id)) {
      activeFileId.value = id
      currentFilePath.value = path
      return true
    }
    openFiles.value.push({ id, path, name, mode, mimeType, ext, readOnly: mode === 'binary' })
    activeFileId.value = id
    currentFilePath.value = path
    const success = await activateOpenFile(id, options)

    // 持久化记录
    persistOpenFiles()
    return success
  }

  /**
   * 持久化当前已打开文件列表到数据库
   */
  function persistOpenFiles(): void {
    const sid = sessionIdRef.value
    if (!sid) return
    const paths = openFiles.value.map(f => f.path)
    const activePath = activeFileId.value
      ? openFiles.value.find(f => f.id === activeFileId.value)?.path || null
      : null
    // 使用 async 但不阻塞主流程
    void persistOpenFilesToDb(paths, activePath)
  }

  /**
   * 从数据库持久化记录中恢复已打开的文件（跨会话统一）
   * 按顺序打开文件，最后激活上次活跃的文件
   * 文件不存在时自动从记录中移除，避免刷屏重试
   */
  async function restoreOpenFiles(): Promise<void> {
    const sid = sessionIdRef.value
    if (!sid) return
    if (isRestoringOpenFiles) return
    isRestoringOpenFiles = true

    try {
      const record = await fetchPersistedOpenFiles()
      if (!record || !record.openFilePaths || record.openFilePaths.length === 0) {
        return
      }

      console.log('[useAgentWorkdir] 恢复已打开文件:', record.openFilePaths)

      const validPaths: string[] = []

      // 按顺序打开文件，跳过不存在的文件（成功后写入实际路径，含 content fallback remap）
      for (const filePath of record.openFilePaths) {
        const exists = findNodeByKey(treeData.value, filePath)
        if (!exists) {
          console.log('[useAgentWorkdir] 文件未在树中找到，跳过预验证，直接尝试打开:', filePath)
        }
        // 静默模式：恢复文件列表时不显示文件不存在的警告
        const ok = await openFileFromExplorer(filePath, { silent: true })
        if (ok) {
          const resolved = activeFileId.value || filePath
          validPaths.push(resolved)
        }
      }

      const pathsDiffer =
        validPaths.length !== record.openFilePaths.length ||
        validPaths.some((p, i) => p !== record.openFilePaths[i])

      /** 持久化里的 active 可能是旧路径（如 /foo.py），打开后已 remap 为 /skills/foo.py */
      const resolveRestoredActiveId = (saved: string | null): string | null => {
        if (!saved) return openFiles.value[0]?.id ?? null
        if (openFiles.value.some(f => f.id === saved)) return saved
        const base = saved.split(/[/\\]/).pop() || ''
        return openFiles.value.find(f => f.name === base)?.id ?? openFiles.value[0]?.id ?? null
      }

      const resolvedActive = resolveRestoredActiveId(record.activeFilePath)
      if (resolvedActive) {
        await activateOpenFile(resolvedActive)
      }

      const activeDiffer = resolvedActive !== record.activeFilePath
      if (pathsDiffer || activeDiffer) {
        console.log('[useAgentWorkdir] 同步已打开文件记录:', { validPaths, resolvedActive })
        await persistOpenFilesToDb(validPaths, resolvedActive)
      }
    } finally {
      isRestoringOpenFiles = false
    }
  }

  async function selectOpenFile(fileId: string): Promise<void> {
    if (activeFileId.value === fileId) return
    await activateOpenFile(fileId)
    // 持久化
    persistOpenFiles()
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
    if (!wasActive) {
      // 仅关闭了非活跃标签，也需要持久化
      persistOpenFiles()
      return
    }

    if (openFiles.value.length === 0) {
      activeFileId.value = null
      currentFilePath.value = ''
      fileLanguage.value = 'plaintext'
      hasUnsavedChanges.value = false
      activeIsReadOnly.value = false
      disposeMonacoWidget()
      // 清空记录
      void clearPersistedOpenFilesFromDb()
      return
    }

    const next = openFiles.value[Math.min(idx, openFiles.value.length - 1)]
    await activateOpenFile(next.id)
    // 持久化
    persistOpenFiles()
  }

  /**
   * Download a workspace file via the download API (opens in browser / triggers download)
   */
  async function downloadFile(filePath: string, fileName: string): Promise<void> {
    const baseUrl = resolveBrowserApiBase().replace(/\/$/, '')
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

  async function downloadFolderZip(folderPath: string): Promise<void> {
    const baseUrl = resolveBrowserApiBase().replace(/\/$/, '')
    const url = `${baseUrl}${API_WORKDIR_BASE}/download-zip?sessionId=${encodeURIComponent(sessionIdRef.value)}&path=${encodeURIComponent(folderPath)}`
    const token = localStorage.getItem('token')
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const ct = res.headers.get('content-type') || ''
    if (!res.ok) {
      if (ct.includes('application/json')) {
        try {
          const j = (await res.json()) as { error?: { message?: string } }
          message.error(j.error?.message || '打包下载失败')
        } catch {
          message.error('打包下载失败')
        }
      } else {
        message.error('打包下载失败')
      }
      return
    }
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const baseName = folderPath.split('/').filter(Boolean).pop() || 'folder'
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `${baseName}.zip`
    a.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
    message.success(`已下载 ${baseName}.zip`)
  }

  function getNewItemParentPath(): string {
    const key = selectedKey.value
    if (!key) return '/'
    const node = findNodeByKey(treeData.value, key)
    if (node && node.isLeaf === false) {
      return normalizeListPath(String(node.key))
    }
    const f = normalizeListPath(String(key))
    const i = f.lastIndexOf('/')
    if (i <= 0) return '/'
    return f.slice(0, i) || '/'
  }

  async function downloadSelected(): Promise<void> {
    const key = selectedKey.value
    if (!key) {
      message.warning('请先在树中选择文件或文件夹')
      return
    }
    const node = findNodeByKey(treeData.value, key)
    if (node?.isLeaf === false) {
      await downloadFolderZip(String(key))
      return
    }
    const fileName = String(key).split('/').pop() || 'download'
    await downloadFile(String(key), fileName)
  }

  async function createWorkdirEntry(name: string, kind: 'file' | 'directory'): Promise<boolean> {
    const trimmed = name.trim()
    if (!trimmed) {
      message.warning('请输入名称')
      return false
    }
    if (trimmed.includes('/') || trimmed.includes('\\')) {
      message.warning('名称中不要包含路径分隔符')
      return false
    }
    if (!sessionIdRef.value) {
      message.warning('请先选择或创建会话后再试')
      return false
    }

    const parent = normalizeListPath(getNewItemParentPath())
    const targetPath =
      parent === '/'
        ? `/${trimmed}`
        : `${parent.replace(/\/+$/, '')}/${trimmed}`.replace(/\/+/g, '/')

    try {
      await apiClient.post(`${API_WORKDIR_BASE}/create`, {
        sessionId: sessionIdRef.value,
        targetPath,
        kind,
      })
      message.success(kind === 'directory' ? '文件夹已创建' : '文件已创建')
      const expandKey = parent === '/' ? null : parent
      if (expandKey && !expandedKeys.value.includes(expandKey)) {
        expandedKeys.value = [...expandedKeys.value, expandKey]
      }
      await refreshTree({ silent: true })
      return true
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: { message?: string } } } }
      console.error('[useAgentWorkdir] 创建失败:', error)
      message.error(err.response?.data?.error?.message || '创建失败')
      return false
    }
  }

  // ========== 核心方法 ==========

  /**
   * 加载目录内容（懒加载）
   */
  async function loadDirectory(nodeKey: string, showLoading = false): Promise<TreeOption[]> {
    const sid = sessionIdRef.value

    if (!sid) {
      return []
    }

    const normalizedPath = normalizeListPath(nodeKey)

    const cacheKey = pathCacheKey(normalizedPath)

    if (loadedPaths.has(cacheKey)) {
      return loadedPaths.get(cacheKey) || []
    }

    // 防止频繁请求失败的路径（1 分钟内不重复请求）
    if (failedPaths.has(cacheKey)) {
      return []
    }

    const existing = dirLoadPromises.get(cacheKey)
    if (existing) {
      return existing
    }

    const promise = (async (): Promise<TreeOption[]> => {
      try {
        loadingPaths.add(cacheKey)

        if (showLoading) loading.value = true

        // 设置超时：10 秒内无响应则放弃
        const timeoutMs = 10000
        let timeoutId: ReturnType<typeof setTimeout> | null = null

        const response = await Promise.race([
          apiClient.get(`${API_WORKDIR_BASE}/list`, {
            params: { sessionId: sid, path: normalizedPath }
          }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error(`加载目录超时: ${normalizedPath}`))
            }, timeoutMs)
          })
        ]) as any

        // 清理超时
        if (timeoutId) clearTimeout(timeoutId)

        if (sessionIdRef.value !== sid) {
          return []
        }

        const items = response.data.data.items || []

        const nodes = items.map((item: any) => {
          const node: TreeOption = {
            key: item.path || `/${item.name}`,
            label: item.name,
            prefix: () => getFileIcon(item.isDirectory, item.type),
            isLeaf: !item.isDirectory
          }
          return node
        })

        loadedPaths.set(cacheKey, nodes)
        failedPaths.delete(cacheKey)
        return nodes
      } catch (error: unknown) {
        if (sessionIdRef.value !== sid) {
          return []
        }
        console.error('[useAgentWorkdir] 加载目录失败:', error)

        // 标记为失败路径，1 分钟内不重试
        failedPaths.add(cacheKey)
        setTimeout(() => failedPaths.delete(cacheKey), 60000)

        const err = error as { response?: { data?: { error?: { message?: string } } }; message?: string }
        const errorMessage = err.response?.data?.error?.message || err.message || '加载目录失败'
        if (errorMessage.includes('超时')) {
          message.warning(`加载 ${normalizedPath} 超时，请检查网络或刷新重试`)
        } else {
          message.error(errorMessage)
        }
        return []
      } finally {
        loadingPaths.delete(cacheKey)
        dirLoadPromises.delete(cacheKey)
        if (showLoading) loading.value = false
      }
    })()

    dirLoadPromises.set(cacheKey, promise)
    return promise
  }

  /**
   * 加载文件内容到编辑器
   */
  async function loadFileContent(filePath: string) {
    console.log('[loadFileContent] 开始加载:', filePath)
    console.log('[loadFileContent] 当前 openFiles:', openFiles.value.map(f => ({ id: f.id, path: f.path, name: f.name })))
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
      message.success('文件已保存')
    } catch (error: unknown) {
      console.error('[useAgentWorkdir] 保存文件失败:', error)
      const err = error as { response?: { data?: { error?: { message?: string } } } }
      message.error(err.response?.data?.error?.message || '保存文件失败')
    } finally {
      loading.value = false
    }
  }

  /**
   * 处理树节点展开（懒加载子目录）
   */
  async function handleLoad(node: TreeOption): Promise<TreeOption[]> {
    if (!node.key) return []

    const nodeKey = String(node.key)

    if (loadingNodes.has(nodeKey)) {
      return []
    }

    // 检查是否加载失败过
    const sid = sessionIdRef.value
    if (!sid) return []
    const cacheKey = pathCacheKey(normalizeListPath(nodeKey))
    if (failedPaths.has(cacheKey)) {
      if (!Array.isArray(node.children)) {
        node.children = []
      }
      return node.children
    }

    loadingNodes.add(nodeKey)
    try {
      const children = await loadDirectory(nodeKey)
      // NTree 的 onLoad 返回值不会自动赋给节点；treemate 要求 isLeaf===false 时 children 为数组才算 shallowLoaded，
      // 否则 watchEffect 会反复 triggerLoading，造成控制台死循环日志与 CPU 占满。
      node.children = children
      return children
    } finally {
      loadingNodes.delete(nodeKey)
    }
  }

  /**
   * 处理树节点选中
   */
  function handleSelect(keys: Array<string | number>) {
    // 确保只选中一个节点，避免同名文件同时高亮
    if (!keys || keys.length === 0) {
      selectedKey.value = null
      return
    }

    const key = String(keys[0])
    if (!key) return

    // 避免重复触发（当 key 与当前选中项相同时）
    if (selectedKey.value === key) return

    selectedKey.value = key
    const node = findNodeByKey(treeData.value, key)

    console.log('[handleSelect] key:', key, 'node:', node ? { label: node.label, isLeaf: node.isLeaf } : null)

    // 只有当节点是叶子节点（文件）时才加载内容
    if (node && node.isLeaf === true) {
      console.log('[handleSelect] 加载文件内容:', key)
      void loadFileContent(key)
    } else if (node && node.isLeaf === false) {
      console.log('[handleSelect] 目录节点，不加载内容:', key)
    } else if (!node) {
      console.warn('[handleSelect] 未找到节点:', key)
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
   * 路径（文件或目录）在树中需展开的祖先目录 key，由浅到深；根下文件如 /README.md 返回 []
   */
  function ancestorDirectoryKeysForPath(normalizedPath: string): string[] {
    const p = normalizedPath.replace(/\/+$/, '')
    const lastSlash = p.lastIndexOf('/')
    if (lastSlash <= 0) return []
    const parent = p.slice(0, lastSlash) || '/'
    if (parent === '/') return []
    const parts = parent.split('/').filter(Boolean)
    const keys: string[] = []
    let acc = ''
    for (const part of parts) {
      acc += `/${part}`
      keys.push(acc)
    }
    return keys
  }

  /**
   * 在资源管理器中展开路径上的目录、懒加载子节点，并选中目标（恢复会话 / 切换标签时与编辑器同步）
   */
  async function revealPathInTree(targetPath: string): Promise<void> {
    if (!sessionIdRef.value || treeData.value.length === 0) return
    const norm = normalizeListPath(targetPath)
    const dirKeys = ancestorDirectoryKeysForPath(norm)

    const merged = new Set(expandedKeys.value)
    for (const k of dirKeys) {
      merged.add(k)
    }
    expandedKeys.value = [...merged]

    for (const dirKey of dirKeys) {
      const node = findNodeByKey(treeData.value, dirKey)
      if (!node || node.isLeaf) continue
      const children = await loadDirectory(dirKey)
      node.children = children.length ? children : []
    }

    selectedKey.value = norm
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
    dirLoadPromises.clear()
    loadingNodes.clear()
    failedPaths.clear()
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

    const baseUrl = resolveBrowserApiBase().replace(/\/$/, '')
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
    } catch (e: unknown) {
      console.error('[useAgentWorkdir] 上传失败:', e)
      const err = e as { message?: string }
      message.error(err?.message || '上传失败')
      return { uploaded: 0, failed: list.length }
    } finally {
      uploading.value = false
    }
  }

  // ========== 监听 sessionId 变化 ==========
  // 由于工作目录现在统一（不区分会话），切换会话时文件树内容不变，但需要：
  // 1. 切换会话后自动刷新文件树（因为后端仍需要 sessionId 参数）
  // 2. 不再清除/重置已打开的文件（统一工作区，跨会话共享）
  watch<string>(sessionIdRef, async (newSid, oldSid) => {
    if (!newSid) return
    // 防止 restoreOpenFiles 未完成时重复触发
    if (isRestoringOpenFiles) return
    // sessionId 变化时，重新加载文件树（但保留已打开的文件状态）
    console.log('[useAgentWorkdir] sessionId 变化:', oldSid, '->', newSid)
    loadedPaths.clear()
    loadingPaths.clear()
    dirLoadPromises.clear()
    loadingNodes.clear()
    failedPaths.clear()
    expandedKeys.value = []
    selectedKey.value = null
    treeData.value = []
    const nodes = await loadDirectory('/', true)
    if (sessionIdRef.value !== newSid) {
      // sessionId 可能在等待期间再次变化，取消本次操作
      return
    }
    treeData.value = nodes
    currentFilePath.value = ''
    fileContent.value = ''
    hasUnsavedChanges.value = false
    activeIsReadOnly.value = false
    // 恢复上次打开的文件（跨会话统一）
    await restoreOpenFiles()
  })

  // 不再用 immediate watch 隐式触发加载，避免与 IdeWorkbench onMounted 里的 loadSession 竞态
  // 改为由调用方（IdeWorkbench）显式调用 initTree() 初始化根目录
  async function initTree(): Promise<void> {
    if (!sessionIdRef.value) return

    // 注意：由于现在有 watch sessionIdRef，这里不再做完整重置
    // 只清理编辑器状态，保留文件树相关状态（让 watch 来处理）
    disposeAllOpenTabs()
    disposeMonacoWidget()

    const nodes = await loadDirectory('/', true)
    if (sessionIdRef.value === undefined) return

    treeData.value = nodes
    currentFilePath.value = ''
    fileContent.value = ''
    hasUnsavedChanges.value = false
    activeIsReadOnly.value = false

    // 文件树加载完成后，恢复上次已打开的文件
    await restoreOpenFiles()
  }

  // ========== 监听 Agent 文件变更事件 ==========
  // 当 Agent 通过工具修改文件后，后端会发送 workdir-changed 事件
  // 这里监听全局事件并自动刷新文件树和已打开的文件内容
  if (typeof window !== 'undefined') {
    window.addEventListener('workdir-changed', ((event: CustomEvent) => {
      const detail = event.detail as { sessionId?: string; toolName?: string; timestamp?: string }
      if (!detail?.sessionId) return

      // 只处理当前会话的文件变更
      if (detail.sessionId !== sessionIdRef.value) return

      console.log('[useAgentWorkdir] 收到文件变更事件，准备刷新:', detail.toolName)

      // 延迟刷新，避免与工具执行冲突
      setTimeout(async () => {
        // 1. 刷新文件树
        await refreshTree({ silent: true })

        // 2. 检查并刷新当前活跃文件的内容（如果该文件可能被修改）
        const activeId = activeFileId.value
        if (activeId && editorInstance) {
          const activeEntry = openFiles.value.find(f => f.id === activeId)
          if (activeEntry && activeEntry.mode === 'text') {
            // 对于文本文件，检查是否有未保存的更改
            const model = modelMap.get(activeId)
            if (model && !isModelDirty(activeId)) {
              // 文件没有未保存的更改，可以安全地重新加载
              console.log('[useAgentWorkdir] 重新加载当前活跃文件内容:', activeId)
              try {
                await activateOpenFile(activeId, { silent: true })
              } catch (error) {
                console.warn('[useAgentWorkdir] 重新加载文件失败:', error)
              }
            } else if (model && isModelDirty(activeId)) {
              // 文件有未保存的更改，提示用户
              console.warn('[useAgentWorkdir] 当前文件有未保存的更改，跳过自动重新加载')
              // 可以选择性地显示一个提示消息，但为了避免打扰用户，暂时只记录日志
            }
          }
        }

        console.log('[useAgentWorkdir] 文件变更处理完成')
      }, 500)
    }) as EventListener)
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
    getTabDisplayName,
    downloadFile,
    downloadFolderZip,
    downloadSelected,
    createWorkdirEntry,
    getNewItemParentPath,
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
