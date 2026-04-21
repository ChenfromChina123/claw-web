/**
 * Agent 工具提供者
 *
 * 功能：
 * - 从 ToolRegistry 获取所有已注册工具
 * - 转换为 Agent 可用的工具定义格式
 * - 提供 getAgentTools() 函数供 agentApi.ts 和 sessionManager.ts 使用
 */

import { getToolRegistry } from '../integrations/toolRegistry'
import type { RegisteredTool } from '../integrations/types/toolRegistryTypes'

/**
 * Agent 工具定义格式（与 AI 模型交互的标准格式）
 */
export interface AgentTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/**
 * 获取所有可用于 Agent 的工具列表
 *
 * 功能：
 * - 从 ToolRegistry 获取所有已启用的工具
 * - 转换为 AgentTool 标准格式
 * - 按类别分组返回
 *
 * @returns AgentTool[] 工具列表
 */
export function getAgentTools(): AgentTool[] {
  try {
    const registry = getToolRegistry()
    const tools = registry.getAllTools()

    // 过滤出已启用的工具，并转换为 Agent 格式
    return tools
      .filter((tool) => tool.isEnabled)
      .map((tool) => convertToAgentTool(tool))
  } catch (error) {
    console.error('[AgentToolsProvider] 获取工具列表失败:', error)
    return []
  }
}

/**
 * 按类别分组获取 Agent 工具
 *
 * @returns Record<string, AgentTool[]> 按类别分组的工具
 */
export function getAgentToolsByCategory(): Record<string, AgentTool[]> {
  try {
    const registry = getToolRegistry()
    const grouped = registry.getToolsGroupedByCategory()
    const result: Record<string, AgentTool[]> = {}

    for (const [category, tools] of Object.entries(grouped)) {
      result[category] = tools
        .filter((tool) => tool.isEnabled)
        .map((tool) => convertToAgentTool(tool))
    }

    return result
  } catch (error) {
    console.error('[AgentToolsProvider] 获取分类工具列表失败:', error)
    return {}
  }
}

/**
 * 获取工具名称列表（用于提示词注入）
 *
 * @returns string[] 工具名称列表
 */
export function getAgentToolNames(): string[] {
  try {
    const registry = getToolRegistry()
    return registry
      .getAllTools()
      .filter((tool) => tool.isEnabled)
      .map((tool) => tool.name)
  } catch (error) {
    console.error('[AgentToolsProvider] 获取工具名称失败:', error)
    return []
  }
}

/**
 * 获取网络相关工具列表
 *
 * @returns AgentTool[] 网络工具列表
 */
export function getNetworkTools(): AgentTool[] {
  const networkToolNames = ['WebSearch', 'WebFetch', 'HttpRequest']
  const allTools = getAgentTools()
  return allTools.filter((tool) => networkToolNames.includes(tool.name))
}

/**
 * 将 RegisteredTool 转换为 AgentTool 格式
 *
 * @param tool 注册工具
 * @returns AgentTool Agent 工具格式
 */
function convertToAgentTool(tool: RegisteredTool): AgentTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema || {},
  }
}

/**
 * 生成工具使用指导文本（用于系统提示词）
 *
 * @returns string 工具使用指导
 */
export function generateToolGuidance(): string {
  const tools = getAgentTools()
  const networkTools = getNetworkTools()

  let guidance = '\n## 可用工具\n\n'

  // 按类别分组
  const grouped = getAgentToolsByCategory()
  for (const [category, categoryTools] of Object.entries(grouped)) {
    if (categoryTools.length === 0) continue

    guidance += `### ${category}\n`
    for (const tool of categoryTools) {
      guidance += `- **${tool.name}**: ${tool.description}\n`
    }
    guidance += '\n'
  }

  // 特别标注网络工具
  if (networkTools.length > 0) {
    guidance += '### 网络搜索工具（特别重要）\n'
    guidance += '当用户询问需要实时信息、最新数据、新闻、天气、股价等内容时，**必须**使用以下工具：\n\n'
    for (const tool of networkTools) {
      guidance += `- **${tool.name}**: ${tool.description}\n`
    }
    guidance += '\n**重要提示**：\n'
    guidance += '- 不要说你无法访问互联网，你拥有 WebSearch 工具可以实时搜索网络内容\n'
    guidance += '- 当用户询问时效性信息时，优先使用 WebSearch 而不是猜测\n'
    guidance += '- WebFetch 可以获取特定网页的详细内容\n'
    guidance += '- HttpRequest 可以发送自定义 HTTP 请求\n\n'
  }

  return guidance
}
