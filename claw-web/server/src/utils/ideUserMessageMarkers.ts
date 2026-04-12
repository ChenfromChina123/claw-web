/**
 * 与 web/src/utils/ideUserMessageMarkers.ts 保持同步（用户消息双轨展示）
 */

export const IDE_USER_DISPLAY_START = '<!--haha-ide-display-->'
export const IDE_USER_DISPLAY_END = '<!--/haha-ide-display-->'

const WRAP_RE = new RegExp(
  `^${escapeRe(IDE_USER_DISPLAY_START)}\\n([\\s\\S]*?)\\n${escapeRe(IDE_USER_DISPLAY_END)}\\n([\\s\\S]*)$`,
)

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function stripIdeUserDisplayLayer(stored: string): string {
  if (typeof stored !== 'string') return stored
  const normalized = stored.replace(/\r\n/g, '\n')
  const m = normalized.match(WRAP_RE)
  if (m) return m[2].trim()
  return stored
}

export function extractIdeUserDisplay(stored: string): string {
  if (typeof stored !== 'string') return String(stored)
  const normalized = stored.replace(/\r\n/g, '\n')
  const m = normalized.match(WRAP_RE)
  if (m) return m[1]
  return stored
}
