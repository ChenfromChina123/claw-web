/**
 * WebSearch 工具提示词模块
 * 
 * 从 claw-web/src/tools/WebSearchTool/prompt.ts 移植的核心机制：
 * - 搜索结果必须包含 Sources
 * - 域名过滤支持
 * - 使用当前年份进行搜索
 */

/**
 * 获取当前年月（用于 WebSearch 提示词）
 * 返回格式："Month YYYY"（例如 "February 2026"）
 */
function getLocalMonthYear(): string {
  const date = process.env.CLAUDE_CODE_OVERRIDE_DATE
    ? new Date(process.env.CLAUDE_CODE_OVERRIDE_DATE)
    : new Date()
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export const WEB_SEARCH_TOOL_NAME = 'WebSearch'

/**
 * 获取 WebSearch 工具的提示词
 * 
 * 这个提示词定义了如何使用网络搜索工具的规范
 */
export function getWebSearchPrompt(): string {
  const currentMonthYear = getLocalMonthYear()
  return `
- Allows Claude to search the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks, including links as markdown hyperlinks
- Use this tool for accessing information beyond Claude's knowledge cutoff
- Searches are performed automatically within a single API call

CRITICAL REQUIREMENT - You MUST follow this:
  - After answering the user's question, you MUST include a "Sources:" section at the end of your response
  - In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
  - This is MANDATORY - never skip including sources in your response
  - Example format:

    [Your answer here]

    Sources:
    - [Source Title 1](https://example.com/1)
    - [Source Title 2](https://example.com/2)

Usage notes:
  - Domain filtering is supported to include or block specific websites
  - Web search is only available in the US

IMPORTANT - Use the correct year in search queries:
  - The current month is ${currentMonthYear}. You MUST use this year when searching for recent information, documentation, or current events.
  - Example: If the user asks for "latest React docs", search for "React documentation" with the current year, NOT last year
`
}

/**
 * 获取 WebSearch 工具的使用说明
 */
export function getWebSearchUsageGuidance(): string {
  return `使用 WebSearch 工具时，请遵循以下规范：
  
1. 搜索时机：
   - 当用户询问当前事件、最新新闻、实时数据时使用
   - 当需要访问超出模型知识截止日期的信息时使用
   - 当用户明确要求搜索时使用

2. 搜索质量：
   - 使用精确的搜索关键词
   - 包含必要的限定词（如时间、品牌、技术栈）
   - 使用当前年份确保结果时效性

3. 结果引用：
   - 在回复末尾必须包含 "Sources:" 部分
   - 列出所有使用的搜索结果 URL
   - 使用 markdown 链接格式：[标题](URL)

4. 域名过滤：
   - 可以通过 allowed_domains 限制搜索结果来源
   - 可以通过 blocked_domains 排除特定网站
   - 示例：只搜索 Stack Overflow 和 GitHub

5. 常见问题：
   - 如果搜索失败，检查网络连接
   - 如果没有结果，尝试更换关键词
   - 注意结果的时效性，避免使用过时信息`
}

export default getWebSearchPrompt
