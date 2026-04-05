/**
 * 会话标题生成服务
 * 
 * 基于用户第一个问题智能生成会话标题
 */

/**
 * 生成会话标题
 * @param userMessage 用户的第一个消息
 * @returns 生成的会话标题
 */
export function generateSessionTitle(userMessage: string): string {
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
  
  // 如果文本很长，截取前50个字符
  const maxLength = 50
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
      title = truncated.substring(0, cutIndex) + '...'
    } else {
      title = truncated + '...'
    }
  }
  
  // 4. 根据内容类型添加合适的前缀
  const lowerTitle = title.toLowerCase()
  
  // 检查是否是代码相关
  if (lowerTitle.includes('代码') || 
      lowerTitle.includes('编程') || 
      lowerTitle.includes('bug') || 
      lowerTitle.includes('error') ||
      lowerTitle.includes('function') ||
      lowerTitle.includes('class') ||
      lowerTitle.includes('javascript') ||
      lowerTitle.includes('python') ||
      lowerTitle.includes('typescript') ||
      lowerTitle.includes('vue') ||
      lowerTitle.includes('react') ||
      /^[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/.test(title) || // 函数调用
      /^import\s/.test(title) || // import 语句
      /^const\s|^let\s|^var\s/.test(title)) { // 变量声明
    return title
  }
  
  // 检查是否是问题
  if (title.includes('？') || 
      title.includes('?') || 
      lowerTitle.startsWith('什么') || 
      lowerTitle.startsWith('怎么') || 
      lowerTitle.startsWith('如何') ||
      lowerTitle.startsWith('为什么')) {
    return title
  }
  
  // 检查是否是需求
  if (lowerTitle.startsWith('帮我写') || 
      lowerTitle.startsWith('创建') || 
      lowerTitle.startsWith('实现') ||
      lowerTitle.startsWith('开发')) {
    return title
  }
  
  // 默认返回清理后的标题
  return title
}

/**
 * 判断是否是会话的第一个消息
 * @param messageCount 会话中的消息数量
 * @returns 是否是第一个消息
 */
export function isFirstMessage(messageCount: number): boolean {
  return messageCount === 0
}
