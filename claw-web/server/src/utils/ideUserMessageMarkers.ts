/**
 * 与 web/src/utils/ideUserMessageMarkers.ts 保持同步（用户消息双轨展示）
 * 使用字符串查找代替正则，提高跨平台兼容性
 */

export const IDE_USER_DISPLAY_START = '<!--haha-ide-display-->'
export const IDE_USER_DISPLAY_END = '<!--/haha-ide-display-->'

/** 规范化换行符为 LF (Unix 风格)，兼容 Windows/macOS */
function normalizeLineBreaks(str: string): string {
  return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
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

/**
 * 使用字符串查找提取 IDE 显示层内容
 */
export function extractIdeUserDisplay(stored: string): string {
  if (typeof stored !== 'string') return String(stored)
  const normalized = normalizeLineBreaks(stored)

  const startIdx = normalized.indexOf(IDE_USER_DISPLAY_START)
  if (startIdx === -1) return stored

  const contentStart = startIdx + IDE_USER_DISPLAY_START.length
  const endIdx = normalized.indexOf(IDE_USER_DISPLAY_END, contentStart)
  if (endIdx === -1) return stored

  return normalized.slice(contentStart, endIdx)
}
