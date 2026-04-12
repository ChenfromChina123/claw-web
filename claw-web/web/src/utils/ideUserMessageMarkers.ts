/** IDE 双轨用户消息：气泡内仅展示 display，模型与历史存储使用完整 agent 正文 */

export const IDE_USER_DISPLAY_START = '<!--haha-ide-display-->'
export const IDE_USER_DISPLAY_END = '<!--/haha-ide-display-->'

/** 终端引用标记 */
export const TERMINAL_REF_START = '<!--haha-terminal-ref-->'
export const TERMINAL_REF_END = '<!--/haha-terminal-ref-->'

const WRAP_RE = new RegExp(
  `^${escapeRe(IDE_USER_DISPLAY_START)}\\n([\\s\\S]*?)\\n${escapeRe(IDE_USER_DISPLAY_END)}\\n([\\s\\S]*)$`,
)

/** 终端引用正则：匹配标记内的内容 */
const TERMINAL_REF_RE = new RegExp(
  `${escapeRe(TERMINAL_REF_START)}\\n([\\s\\S]*?)\\n${escapeRe(TERMINAL_REF_END)}`,
  'g'
)

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 终端引用数据结构 */
export interface TerminalRefInMessage {
  id: string
  preview: string
  lineRange: string
  content: string
  originalLength: number
}

/**
 * 从消息内容中提取终端引用
 */
export function extractTerminalRefs(content: string): TerminalRefInMessage[] {
  const refs: TerminalRefInMessage[] = []
  let match
  while ((match = TERMINAL_REF_RE.exec(content)) !== null) {
    try {
      const refData = JSON.parse(match[1]) as TerminalRefInMessage
      refs.push(refData)
    } catch {
      // 忽略解析失败的引用
    }
  }
  return refs
}

/**
 * 从消息内容中移除终端引用标记，返回纯文本
 */
export function stripTerminalRefs(content: string): string {
  return content.replace(TERMINAL_REF_RE, '').trim()
}

/**
 * 构建终端引用标记
 */
export function buildTerminalRefMarker(ref: TerminalRefInMessage): string {
  return `${TERMINAL_REF_START}\n${JSON.stringify(ref)}\n${TERMINAL_REF_END}`
}

export function buildIdeLayeredUserMessage(displayText: string, agentBody: string): string {
  const d = displayText.trimEnd()
  const a = agentBody.trim()
  return `${IDE_USER_DISPLAY_START}\n${d}\n${IDE_USER_DISPLAY_END}\n${a}`
}

export function extractIdeUserDisplay(stored: string): string {
  if (typeof stored !== 'string') return String(stored)
  const m = stored.match(WRAP_RE)
  if (m) return m[1]
  return stored
}

/** 发给模型时去掉展示层，只保留 agent 正文 */
export function stripIdeUserDisplayLayer(stored: string): string {
  if (typeof stored !== 'string') return stored
  const m = stored.match(WRAP_RE)
  if (m) return m[2].trim()
  return stored
}

export function isIdeLayeredUserMessage(stored: string): boolean {
  return typeof stored === 'string' && WRAP_RE.test(stored)
}
