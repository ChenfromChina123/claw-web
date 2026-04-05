/**
 * 会话标题生成服务
 * 
 * 基于用户第一个问题使用 LLM 智能生成会话标题
 */

import Anthropic from '@anthropic-ai/sdk'

// 简单的内存缓存，避免重复生成标题
const titleCache = new Map<string, string>()

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
    
    const response = await client.messages.create({
      model: 'claude-3-haiku-20240307', // 使用轻量级模型，速度快且便宜
      max_tokens: 50,
      temperature: 0.3,
      system: `你是一个会话标题生成专家。请基于用户的第一条消息生成一个简洁、准确的会话标题。

规则：
1. 标题长度控制在 15-30 个字符之间
2. 去除常见的礼貌用语（请、你好、帮我等）
3. 保留核心意图和关键词
4. 如果是代码相关问题，保留技术关键词
5. 如果是问题，保留疑问词
6. 如果是需求，保留动作词
7. 不要包含引号
8. 直接返回标题，不要解释

示例：
输入: "你好，请帮我写一个Python脚本来处理Excel文件"
输出: Python处理Excel脚本

输入: "怎么修复Vue组件中的props类型错误？"
输出: Vue组件props类型错误修复

输入: "创建一个登录页面的功能"
输出: 创建登录页面功能`,
      messages: [
        {
          role: 'user',
          content: `请为以下用户消息生成一个简洁的会话标题（15-30字符）：\n\n${userMessage}`
        }
      ]
    })

    const title = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('')
      .trim()
      .replace(/^["']|["']$/g, '') // 移除首尾引号

    // 如果 LLM 返回空或太长，使用简单版本
    if (!title || title.length > 50) {
      const simpleTitle = generateSimpleTitle(userMessage)
      titleCache.set(cacheKey, simpleTitle)
      return simpleTitle
    }

    titleCache.set(cacheKey, title)
    return title
  } catch (error) {
    console.error('[SessionTitleGenerator] LLM title generation failed:', error)
    // LLM 失败时使用简单版本
    const simpleTitle = generateSimpleTitle(userMessage)
    titleCache.set(cacheKey, simpleTitle)
    return simpleTitle
  }
}

/**
 * 简单的标题生成（作为 LLM 的降级方案）
 * @param userMessage 用户的第一个消息
 * @returns 生成的会话标题
 */
export function generateSimpleTitle(userMessage: string): string {
  // 清理输入文本
  let cleanedText = userMessage.trim()
  
  // 1. 移除多余的空白字符
  cleanedText = cleanedText.replace(/\s+/g, ' ')
  
  // 2. 移除常见的前缀
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
  
  // 如果清理后为空，使用默认标题
  if (!cleanedText) {
    return '新对话'
  }
  
  // 3. 提取关键词或短句
  let title = cleanedText
  
  // 如果文本很长，截取前30个字符
  const maxLength = 30
  if (title.length > maxLength) {
    // 尝试在句子或单词边界处截断
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

// 为了保持向后兼容，保留原来的函数名
export { generateSimpleTitle as generateSessionTitle }

/**
 * 判断是否是会话的第一个消息
 * @param messageCount 会话中的消息数量
 * @returns 是否是第一个消息
 */
export function isFirstMessage(messageCount: number): boolean {
  return messageCount === 0
}
