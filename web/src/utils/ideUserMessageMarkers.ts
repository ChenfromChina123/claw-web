/** IDE 双轨用户消息：气泡内仅展示 display，模型与历史存储使用完整 agent 正文 */

export const IDE_USER_DISPLAY_START = '<!--haha-ide-display-->'
export const IDE_USER_DISPLAY_END = '<!--/haha-ide-display-->'

const WRAP_RE = new RegExp(
  `^${escapeRe(IDE_USER_DISPLAY_START)}\\n([\\s\\S]*?)\\n${escapeRe(IDE_USER_DISPLAY_END)}\\n([\\s\\S]*)$`,
)

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
