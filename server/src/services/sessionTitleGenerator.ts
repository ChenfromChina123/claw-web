/**
 * 会话标题生成服务
 * 
 * 基于用户第一个问题使用 LLM 智能生成会话标题
 */

import Anthropic from '@anthropic-ai/sdk'

// 简单的内存缓存，避免重复生成标题
const titleCache = new Map<string, string>()

/**
 * 简单的标题生成（作为 LLM 的降级方案）
 * @param userMessage 用户的第一个消息
 * @returns 生成的会话标题
 */
function generateSimpleTitle(userMessage: string): string {
  // 清理输入文本
  let cleanedText = userMessage.trim()
  
  // 移除多余的空白字符
  cleanedText = cleanedText.replace(/\s+/g, ' ')
  
  // 移除常见的前缀
  const prefixesToRemove = [
    /^请[问帮我]/i,
    /^你好/i,
    /^嗨/i,
    /^您好/i,
    /^Hello/i,
    /^Hi/i,
    /^Hey/i,
    /^我想/i,
    /^我需要/i,
    /^帮我/i,
    /^帮我看看/i,
    /^看看/i,
  ]
  
  for (const prefix of prefixesToRemove) {
    cleanedText = cleanedText.replace(prefix, '')
  }
  
  cleanedText = cleanedText.trim()
  
  // 如果移除前缀后为空，就用原始消息（至少保留问候语）
  if (!cleanedText) {
    cleanedText = userMessage.trim()
  }
  
  // 如果还是空（不应该发生），才返回默认标题
  if (!cleanedText) {
    return '新对话'
  }
  
  let title = cleanedText
  
  const maxLength = 30
  if (title.length > maxLength) {
    const truncated = title.substring(0, maxLength)
    const lastSpace = truncated.lastIndexOf(' ')
    const lastPunctuation = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('！'),
      truncated.lastIndexOf('？'),
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?'),
      truncated.lastIndexOf('，'),
      truncated.lastIndexOf(',')
    )
    
    const cutIndex = Math.max(lastSpace, lastPunctuation)
    if (cutIndex > 10) {
      title = truncated.substring(0, cutIndex)
    } else {
      title = truncated
    }
  }
  
  return title
}

/**
 * 获取 Anthropic 客户端
 */
function getAnthropicClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? undefined,
    authToken: process.env.ANTHROPIC_AUTH_TOKEN ?? undefined,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  })
}

/**
 * 使用 LLM 生成会话标题
 * @param userMessage 用户的第一个消息
 * @returns 生成的会话标题
 */
export async function generateSessionTitleWithLLM(userMessage: string): Promise<string> {
  // 检查缓存
  const cacheKey = userMessage.slice(0, 100)
  if (titleCache.has(cacheKey)) {
    return titleCache.get(cacheKey)!
  }

  // 如果消息很短（少于10个字符），直接返回清理后的版本
  if (userMessage.trim().length < 10) {
    const simpleTitle = generateSimpleTitle(userMessage)
    titleCache.set(cacheKey, simpleTitle)
    return simpleTitle
  }

  try {
    const client = getAnthropicClient()
    
    const systemPrompt = '你是一个会话标题生成专家。请基于用户的第一条消息生成一个简洁、准确的会话标题。\n\n规则：\n1. 标题长度控制在 15-30 个字符之间\n2. 去除常见的礼貌用语（请、你好、帮我等）\n3. 保留核心意图和关键词\n4. 如果是代码相关问题，保留技术关键词\n5. 如果是问题，保留疑问词\n6. 如果是需求，保留动作词\n7. 不要包含引号\n8. 直接返回标题，不要解释'
    
    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 50,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: '请为以下用户消息生成一个简洁的会话标题（15-30字符）：\n\n' + userMessage
        }
      ]
    })

    const title = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('')
      .trim()
      .replace(/^["']|["']$/g, '')

    if (!title || title.length > 50) {
      const simpleTitle = generateSimpleTitle(userMessage)
      titleCache.set(cacheKey, simpleTitle)
      return simpleTitle
    }

    titleCache.set(cacheKey, title)
    return title
  } catch (error) {
    console.error('[SessionTitleGenerator] LLM title generation failed:', error)
    const simpleTitle = generateSimpleTitle(userMessage)
    titleCache.set(cacheKey, simpleTitle)
    return simpleTitle
  }
}

// 为了保持向后兼容，保留原来的函数名
export { generateSimpleTitle as generateSessionTitle }
export { generateSimpleTitle }

/**
 * 判断是否是会话的第一个消息
 */
export function isFirstMessage(messageCount: number): boolean {
  return messageCount === 0
}
