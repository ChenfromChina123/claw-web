/** IDE 双轨用户消息：气泡内仅展示 display，模型与历史存储使用完整 agent 正文 */

export const IDE_USER_DISPLAY_START = '<!--haha-ide-display-->'
export const IDE_USER_DISPLAY_END = '<!--/haha-ide-display-->'

/** 终端引用标记 */
export const TERMINAL_REF_START = '<!--haha-terminal-ref-->'
export const TERMINAL_REF_END = '<!--/haha-terminal-ref-->'

/** 规范化换行符为 LF (Unix 风格)，兼容 Windows/macOS */
function normalizeLineBreaks(str: string): string {
  return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** 使用字符串查找提取两个标记之间的内容（更可靠的正则替代方案） */
function extractBetweenMarkers(text: string, startMarker: string, endMarker: string): string | null {
  const normalized = normalizeLineBreaks(text)
  const startIdx = normalized.indexOf(startMarker)
  if (startIdx === -1) return null
  const contentStart = startIdx + startMarker.length
  const endIdx = normalized.indexOf(endMarker, contentStart)
  if (endIdx === -1) return null
  return normalized.slice(contentStart, endIdx)
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
 * 从消息内容中提取终端引用（使用字符串查找，更可靠）
 */
export function extractTerminalRefs(content: string): TerminalRefInMessage[] {
  const refs: TerminalRefInMessage[] = []
  const normalized = normalizeLineBreaks(content)
  let searchStart = 0

  while (true) {
    const startIdx = normalized.indexOf(TERMINAL_REF_START, searchStart)
    if (startIdx === -1) break
    const contentStart = startIdx + TERMINAL_REF_START.length
    const endIdx = normalized.indexOf(TERMINAL_REF_END, contentStart)
    if (endIdx === -1) break

    const jsonContent = normalized.slice(contentStart, endIdx)
    try {
      const refData = JSON.parse(jsonContent) as TerminalRefInMessage
      refs.push(refData)
    } catch {
      // 忽略解析失败的引用
    }
    searchStart = endIdx + TERMINAL_REF_END.length
  }
  return refs
}

/**
 * 从消息内容中移除终端引用标记，返回纯文本
 */
export function stripTerminalRefs(content: string): string {
  const normalized = normalizeLineBreaks(content)
  let result = normalized
  let searchStart = 0

  while (true) {
    const startIdx = result.indexOf(TERMINAL_REF_START, searchStart)
    if (startIdx === -1) break
    const endIdx = result.indexOf(TERMINAL_REF_END, startIdx + TERMINAL_REF_START.length)
    if (endIdx === -1) break
    result = result.slice(0, startIdx) + result.slice(endIdx + TERMINAL_REF_END.length)
    searchStart = startIdx
  }

  return result.replace(/\n+/g, '\n').trim()
}

/**
 * 构建终端引用标记
 */
export function buildTerminalRefMarker(ref: TerminalRefInMessage): string {
  return `${TERMINAL_REF_START}\n${JSON.stringify(ref)}\n${TERMINAL_REF_END}`
}

export function buildIdeLayeredUserMessage(displayText: string, agentBody: string): string {
  const d = normalizeLineBreaks(displayText).trimEnd()
  const a = normalizeLineBreaks(agentBody).trim()
  return `${IDE_USER_DISPLAY_START}\n${d}\n${IDE_USER_DISPLAY_END}\n${a}`
}

/**
 * 使用字符串查找提取 IDE 显示层内容
 */
export function extractIdeUserDisplay(stored: string): string {
  if (typeof stored !== 'string') return String(stored)
  const content = extractBetweenMarkers(stored, IDE_USER_DISPLAY_START, IDE_USER_DISPLAY_END)
  return content !== null ? content : stored
}

/**
 * 发给模型时去掉展示层，只保留 agent 正文（使用字符串查找，更可靠）
 */
export function stripIdeUserDisplayLayer(stored: string): string {
  if (typeof stored !== 'string') return stored
  const normalized = normalizeLineBreaks(stored)

  const startIdx = normalized.indexOf(IDE_USER_DISPLAY_START)
  if (startIdx === -1) return stored

  const contentStart = startIdx + IDE_USER_DISPLAY_START.length
  const endIdx = normalized.indexOf(IDE_USER_DISPLAY_END, contentStart)
  if (endIdx === -1) return stored

  const afterEnd = endIdx + IDE_USER_DISPLAY_END.length
  return normalized.slice(afterEnd).trim()
}

export function isIdeLayeredUserMessage(stored: string): boolean {
  if (typeof stored !== 'string') return false
  const normalized = normalizeLineBreaks(stored)
  return normalized.includes(IDE_USER_DISPLAY_START) && normalized.includes(IDE_USER_DISPLAY_END)
}
