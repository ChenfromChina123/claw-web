/**
 * IDE 底部终端：偏好与按会话的文本缓冲持久化（localStorage）
 */

const PREFS_KEY = 'ideTerminalPrefsV1'
const LOG_PREFIX = 'ideTerminalLogV1_'
const MAX_LOG_CHARS = 180_000

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
