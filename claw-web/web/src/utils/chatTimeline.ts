import { extractIdeUserDisplay } from '@/utils/ideUserMessageMarkers'
import type { Message } from '@/types'

/**
 * 将消息内容转为时间线预览文案（与气泡展示规则一致，含 IDE 双轨简短层）
 */
export function userMessageTimelinePreview(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') {
    return extractIdeUserDisplay(content).trim()
  }
  if (Array.isArray(content)) {
    const text = content
      .filter((b: unknown) => (b as { type?: string })?.type === 'text')
      .map((b: unknown) => String((b as { text?: string }).text || ''))
      .join('\n')
    return extractIdeUserDisplay(text).trim()
  }
  return extractIdeUserDisplay(String(content)).trim()
}

/**
 * 是否可作为时间线锚点：可见的用户提问（排除 tool_result 伪用户消息）
 */
export function isUserTimelineAnchor(message: Message): boolean {
  if (message.role !== 'user') return false
  const c = (message as { content?: unknown }).content
  if (Array.isArray(c) && c.some((b: unknown) => (b as { type?: string })?.type === 'tool_result')) {
    return false
  }
  return userMessageTimelinePreview(c).length > 0
}
