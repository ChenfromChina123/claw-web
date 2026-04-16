/**
 * IDE 底部终端：偏好与按会话的文本缓冲持久化（localStorage）
 * 新增：终端引用（Terminal Reference）持久化
 */

const PREFS_KEY = 'ideTerminalPrefsV1'
const LOG_PREFIX = 'ideTerminalLogV1_'
const TERMINAL_REF_PREFIX = 'ideTerminalRefV1_'
const MAX_LOG_CHARS = 180_000
const MAX_REF_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7天过期

/** 终端引用数据结构 */
export interface TerminalReference {
  id: string
  preview: string
  content: string
  originalLength: number
  createdAt: number
  sessionId: string
}

export interface IdeTerminalPrefs {
  /** 将 Agent 的 Bash / PowerShell 工具流式输出镜像到底部终端 */
  mirrorAgentShell: boolean
}

const DEFAULT_PREFS: IdeTerminalPrefs = {
  mirrorAgentShell: true,
}

export function loadTerminalPrefs(): IdeTerminalPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const p = JSON.parse(raw) as Partial<IdeTerminalPrefs>
    return {
      mirrorAgentShell:
        typeof p.mirrorAgentShell === 'boolean'
          ? p.mirrorAgentShell
          : DEFAULT_PREFS.mirrorAgentShell,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function saveTerminalPrefs(prefs: IdeTerminalPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

function logKey(sessionId: string | undefined): string | null {
  if (!sessionId || !sessionId.trim()) return null
  return `${LOG_PREFIX}${sessionId}`
}

export function loadTerminalSessionLog(sessionId: string | undefined): string {
  const key = logKey(sessionId)
  if (!key) return ''
  try {
    const t = localStorage.getItem(key)
    if (!t) return ''
    return t.length > MAX_LOG_CHARS ? t.slice(-MAX_LOG_CHARS) : t
  } catch {
    return ''
  }
}

export function saveTerminalSessionLog(sessionId: string | undefined, text: string): void {
  const key = logKey(sessionId)
  if (!key) return
  try {
    let body = text
    if (body.length > MAX_LOG_CHARS) {
      body = body.slice(-MAX_LOG_CHARS)
    }
    localStorage.setItem(key, body)
  } catch {
    /* quota */
  }
}

export function exportTerminalLogBlob(text: string): Blob {
  return new Blob([text], { type: 'text/plain;charset=utf-8' })
}

// ==================== 终端引用（Terminal Reference）持久化 ====================

function refKey(sessionId: string | undefined): string | null {
  if (!sessionId || !sessionId.trim()) return null
  return `${TERMINAL_REF_PREFIX}${sessionId}`
}

/**
 * 保存终端引用到 localStorage
 */
export function saveTerminalReference(
  sessionId: string | undefined,
  ref: Omit<TerminalReference, 'createdAt' | 'sessionId'>
): void {
  const key = refKey(sessionId)
  if (!key) return
  try {
    const existing = loadTerminalReferences(sessionId)
    const newRef: TerminalReference = {
      ...ref,
      createdAt: Date.now(),
      sessionId: sessionId || '',
    }
    // 去重：相同 content 的引用只保留最新的
    const filtered = existing.filter(r => r.content !== ref.content)
    filtered.push(newRef)
    // 只保留最近 50 个引用，防止存储过大
    const trimmed = filtered.slice(-50)
    localStorage.setItem(key, JSON.stringify(trimmed))
  } catch {
    /* quota */
  }
}

/**
 * 加载指定会话的所有终端引用
 */
export function loadTerminalReferences(sessionId: string | undefined): TerminalReference[] {
  const key = refKey(sessionId)
  if (!key) return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const refs = JSON.parse(raw) as TerminalReference[]
    const now = Date.now()
    // 过滤掉过期的引用
    return refs.filter(r => now - r.createdAt < MAX_REF_AGE_MS)
  } catch {
    return []
  }
}

/**
 * 删除指定的终端引用
 */
export function removeTerminalReference(sessionId: string | undefined, refId: string): void {
  const key = refKey(sessionId)
  if (!key) return
  try {
    const refs = loadTerminalReferences(sessionId)
    const filtered = refs.filter(r => r.id !== refId)
    localStorage.setItem(key, JSON.stringify(filtered))
  } catch {
    /* ignore */
  }
}

/**
 * 清空指定会话的所有终端引用
 */
export function clearTerminalReferences(sessionId: string | undefined): void {
  const key = refKey(sessionId)
  if (!key) return
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
