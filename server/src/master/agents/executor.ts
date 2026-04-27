/**
 * Agent Executor - Worker 端 Agent 执行器
 *
 * 职责：
 * - 在 Worker 容器内执行 Agent 思考循环
 * - 通过 Master 代理调用 LLM API
 * - 在 Worker 沙箱内执行工具调用
 *
 * 注意：此模块为路径 B（Agent 整体转发到 Worker）的核心组件
 * 当前路径 A（工具级转发）已满足安全需求，路径 B 为未来优化预留
 *
 * 重要：Worker sandbox 使用动态导入，避免 Master 端加载时的依赖问题
 */

export interface AgentExecutorConfig {
  userId: string
  sessionId: string
  message: string
  messages: Array<{ role: string; content: string }>
  tools: Array<{ name: string; description: string; input_schema?: unknown }>
  quota?: unknown
  onEvent: (type: string, data: unknown) => void
}

export interface AgentExecutorResult {
  success: boolean
  message?: string
  error?: string
  toolCalls?: Array<{ name: string; input: unknown; result?: unknown }>
}

/**
 * Agent 执行器类
 */
class AgentExecutor {
  /**
   * 执行 Agent 任务
   */
  async execute(config: AgentExecutorConfig): Promise<AgentExecutorResult> {
    const { userId, sessionId, message, onEvent } = config

    onEvent('agent_start', { userId, sessionId })

    try {
      onEvent('agent_thinking', { status: 'processing' })

      const llmResponse = await this.callLLMViaMaster(config)

      if (!llmResponse) {
        onEvent('error', { message: 'LLM 调用失败：Master 代理未返回响应' })
        return { success: false, error: 'LLM 调用失败' }
      }

      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        const toolResults = []
        for (const toolCall of llmResponse.toolCalls) {
          onEvent('tool_call', { name: toolCall.name, input: toolCall.input })

          const toolResult = await this.executeToolInSandbox(
            toolCall.name,
            toolCall.input
          )

          onEvent('tool_result', {
            name: toolCall.name,
            success: toolResult.success,
            result: toolResult.result,
            error: toolResult.error,
          })

          toolResults.push({
            name: toolCall.name,
            input: toolCall.input,
            result: toolResult.success ? toolResult.result : toolResult.error,
          })
        }

        onEvent('agent_complete', { message: llmResponse.content || '' })
        return {
          success: true,
          message: llmResponse.content || '',
          toolCalls: toolResults,
        }
      }

      onEvent('agent_complete', { message: llmResponse.content || '' })
      return { success: true, message: llmResponse.content || '' }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      onEvent('error', { message: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 在 Worker 沙箱中执行工具（动态导入避免 Master 端依赖）
   */
  private async executeToolInSandbox(
    toolName: string,
    toolInput: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown; error?: string; output?: string }> {
    try {
      const { workerSandbox } = await import('../../worker/sandbox')
      return await workerSandbox.execTool(toolName, toolInput, { cwd: '/workspace' })
    } catch (error) {
      return {
        success: false,
        error: `Worker sandbox 不可用: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  /**
   * 通过 Master 代理调用 LLM
   */
  private async callLLMViaMaster(config: AgentExecutorConfig): Promise<{
    content?: string
    toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>
  } | null> {
    const masterToken = process.env.MASTER_INTERNAL_TOKEN || ''
    const masterUrl = process.env.MASTER_INTERNAL_URL || 'http://localhost:3000'

    try {
      const response = await fetch(`${masterUrl}/api/internal/llm/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Token': masterToken,
          'X-User-Id': config.userId,
        },
        body: JSON.stringify({
          messages: [
            ...config.messages,
            { role: 'user', content: config.message },
          ],
          tools: config.tools,
        }),
      })

      if (!response.ok) {
        console.error('[AgentExecutor] LLM 代理调用失败:', response.status)
        return null
      }

      return await response.json() as any
    } catch (error) {
      console.error('[AgentExecutor] LLM 代理调用异常:', error)
      return null
    }
  }
}

const agentExecutor = new AgentExecutor()

/**
 * 获取 Agent 执行器单例
 */
export function getAgentExecutor(): AgentExecutor {
  return agentExecutor
}

export default AgentExecutor
