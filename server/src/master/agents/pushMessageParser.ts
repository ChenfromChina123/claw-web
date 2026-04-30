/**
 * Agent 推送消息解析器
 *
 * 解析 Agent 响应中的 push_message 代码块，并调用推送服务
 */

import { getAgentPushService } from '../services/agentPushService'

/**
 * 推送消息代码块正则表达式
 * 匹配 ```push_message 和 ``` 之间的 JSON 内容
 */
const PUSH_MESSAGE_REGEX = /```push_message\s*\n([\s\S]*?)\n```/g

/**
 * 推送消息数据结构
 */
interface ParsedPushMessage {
  category: 'credential' | 'notification' | 'alert' | 'info'
  title: string
  content: string
  sensitiveData?: Record<string, string>
  priority?: 'low' | 'normal' | 'high' | 'urgent'
  expiresInMinutes?: number
}

/**
 * 解析结果
 */
export interface ParsePushMessageResult {
  /** 是否成功解析并推送 */
  success: boolean
  /** 推送的消息ID列表 */
  messageIds: string[]
  /** 错误信息 */
  error?: string
  /** 处理后的响应内容（移除了 push_message 代码块） */
  processedContent: string
}

/**
 * 解析 Agent 响应中的 push_message 代码块
 * 并调用推送服务发送消息
 *
 * @param content Agent 响应内容
 * @param userId 用户ID
 * @param sessionId 会话ID
 * @returns 解析结果
 */
export async function parseAndPushMessages(
  content: string,
  userId: string,
  sessionId: string
): Promise<ParsePushMessageResult> {
  const messageIds: string[] = []
  const errors: string[] = []
  let processedContent = content

  // 重置正则表达式
  PUSH_MESSAGE_REGEX.lastIndex = 0

  // 查找所有 push_message 代码块
  let match: RegExpExecArray | null
  const matches: Array<{ fullMatch: string; jsonContent: string }> = []

  while ((match = PUSH_MESSAGE_REGEX.exec(content)) !== null) {
    matches.push({
      fullMatch: match[0],
      jsonContent: match[1].trim(),
    })
  }

  // 如果没有找到任何 push_message 代码块，直接返回
  if (matches.length === 0) {
    return {
      success: true,
      messageIds: [],
      processedContent: content,
    }
  }

  const agentPushService = getAgentPushService()

  // 处理每个匹配的代码块
  for (const { fullMatch, jsonContent } of matches) {
    try {
      // 解析 JSON
      const message: ParsedPushMessage = JSON.parse(jsonContent)

      // 验证必需字段
      if (!message.category || !message.title || !message.content) {
        errors.push(`Missing required fields: category, title, or content`)
        continue
      }

      // 验证 category 是否有效
      const validCategories = ['credential', 'notification', 'alert', 'info']
      if (!validCategories.includes(message.category)) {
        errors.push(`Invalid category: ${message.category}`)
        continue
      }

      // 发送推送
      const messageId = await agentPushService.sendPush({
        userId,
        sessionId,
        category: message.category,
        title: message.title,
        content: message.content,
        sensitiveData: message.sensitiveData,
        priority: message.priority || 'normal',
        expiresInMinutes: message.expiresInMinutes,
      })

      messageIds.push(messageId)

      // 从响应内容中移除 push_message 代码块
      processedContent = processedContent.replace(fullMatch, '')

      console.log(`[PushMessageParser] Pushed message: ${messageId}, category: ${message.category}`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      errors.push(`Failed to parse/parse push message: ${errorMsg}`)
      console.error('[PushMessageParser] Error:', errorMsg)
    }
  }

  // 清理处理后的内容（移除多余的空行）
  processedContent = processedContent.replace(/\n{3,}/g, '\n\n').trim()

  return {
    success: errors.length === 0,
    messageIds,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    processedContent,
  }
}

/**
 * 检查响应内容是否包含 push_message 代码块
 *
 * @param content Agent 响应内容
 * @returns 是否包含 push_message 代码块
 */
export function hasPushMessageBlock(content: string): boolean {
  PUSH_MESSAGE_REGEX.lastIndex = 0
  return PUSH_MESSAGE_REGEX.test(content)
}

/**
 * 提取 push_message 代码块（不移除）
 * 用于预览或调试
 *
 * @param content Agent 响应内容
 * @returns 提取的 push_message 数据列表
 */
export function extractPushMessages(content: string): Array<{
  category: string
  title: string
  content: string
  rawJson: string
}> {
  const messages: Array<{
    category: string
    title: string
    content: string
    rawJson: string
  }> = []

  PUSH_MESSAGE_REGEX.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = PUSH_MESSAGE_REGEX.exec(content)) !== null) {
    try {
      const jsonContent = match[1].trim()
      const message = JSON.parse(jsonContent) as ParsedPushMessage

      messages.push({
        category: message.category,
        title: message.title,
        content: message.content,
        rawJson: jsonContent,
      })
    } catch {
      // 忽略解析错误
    }
  }

  return messages
}
