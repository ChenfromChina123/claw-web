/**
 * runAgent - Agent 执行运行时
 * 
 * 实现 Agent 的完整执行链路：
 * 1. 初始化阶段
 * 2. Query 循环
 * 3. 资源清理
 */

import { v4 as uuidv4 } from 'uuid'
import type { AgentDefinition, AgentExecutionResult } from './types'
import { createRuntimeContext, AgentRuntimeContext, RuntimeStatus, PermissionMode } from './runtimeContext'
import { getToolRegistry, RegisteredTool } from '../integrations/toolRegistry'

/**
 * Agent 消息类型
 */
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: AgentToolCall[]
  toolResults?: AgentToolResult[]
}

/**
 * Agent 工具调用
 */
export interface AgentToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

/**
 * Agent 工具结果
 */
export interface AgentToolResult {
  toolCallId: string
  toolName: string
  success: boolean
  result?: unknown
  error?: string
}

/**
 * runAgent 参数
 */
export interface RunAgentParams {
  /** Agent 定义 */
  agentDefinition: AgentDefinition
  /** 初始消息 */
  promptMessages: AgentMessage[]
  /** 会话 ID */
  sessionId: string
  /** 工作目录 */
  cwd?: string
  /** 最大轮次限制 */
  maxTurns?: number
  /** 权限模式 */
  permissionMode?: 'bypassPermissions' | 'acceptEdits' | 'auto' | 'plan' | 'bubble'
  /** 模型 */
  model?: string
  /** 父 Agent ID (Fork 模式) */
  parentAgentId?: string
  /** 团队名称 (Team 模式) */
  teamName?: string
  /** 团队成员名称 (Team 模式) */
  memberName?: string
  /** 允许的工具列表 */
  allowedTools?: string[]
  /** 禁止的工具列表 */
  deniedTools?: string[]
  /** AbortSignal 用于取消 */
  abortSignal?: AbortSignal
  /** 进度回调 */
  onProgress?: (progress: AgentProgress) => void
  /** 工具执行回调 */
  onToolCall?: (toolCall: AgentToolCall) => void
  /** 工具结果回调 */
  onToolResult?: (result: AgentToolResult) => void
}

/**
 * Agent 进度信息
 */
export interface AgentProgress {
  agentId: string
  status: RuntimeStatus
  currentTurn: number
  maxTurns: number
  message?: string
}

/**
 * runAgent 事件
 */
export type RunAgentEvent =
  | { type: 'start'; agentId: string }
  | { type: 'turn'; agentId: string; turn: number }
  | { type: 'tool_call'; agentId: string; toolCall: AgentToolCall }
  | { type: 'tool_result'; agentId: string; result: AgentToolResult }
  | { type: 'message'; agentId: string; message: AgentMessage }
  | { type: 'complete'; agentId: string; result: string }
  | { type: 'error'; agentId: string; error: string }
  | { type: 'cancelled'; agentId: string }

/**
 * runAgent 执行函数
 */
export async function* runAgent(
  params: RunAgentParams
): AsyncGenerator<RunAgentEvent> {
  const startTime = Date.now()

  // 创建运行时上下文
  const context = createRuntimeContext(params.agentDefinition, {
    sessionId: params.sessionId,
    cwd: params.cwd,
    maxTurns: params.maxTurns || 100,
    permissionMode: (params.permissionMode as PermissionMode) || PermissionMode.AUTO,
    model: params.model,
    parentAgentId: params.parentAgentId,
    teamName: params.teamName,
    memberName: params.memberName,
  })

  // 添加资源清理钩子
  context.addCleanupHook(async () => {
    console.log(`[runAgent] Cleanup: closing resources for ${context.agentId}`)
  })

  try {
    // 初始化阶段
    context.start()
    yield { type: 'start', agentId: context.agentId }

    // 发送进度
    params.onProgress?.({
      agentId: context.agentId,
      status: context.status,
      currentTurn: context.currentTurn,
      maxTurns: context.maxTurns,
      message: '初始化中...',
    })

    // 获取可用的工具
    const toolRegistry = getToolRegistry()
    const allTools = toolRegistry.getAllTools()
    const availableTools = context.getAvailableTools(allTools.map(t => t.name))

    // 初始化 MCP 服务器 (如果有配置)
    let mcpCleanup: (() => Promise<void>) | undefined
    if (params.agentDefinition.mcpServers && params.agentDefinition.mcpServers.length > 0) {
      try {
        const { initializeAgentMCPServers } = await import('./mcpInitializer')
        const mcpResult = await initializeAgentMCPServers(params.agentDefinition.mcpServers)
        mcpCleanup = mcpResult.cleanup
        // 将 MCP 工具添加到可用工具列表
        for (const tool of mcpResult.tools) {
          if (context.canUseTool(tool.name)) {
            availableTools.push(tool.name)
          }
        }
      } catch (error) {
        console.warn(`[runAgent] MCP 初始化失败:`, error)
      }
    }

    // 注册 MCP 清理钩子
    if (mcpCleanup) {
      context.addCleanupHook(async () => {
        console.log(`[runAgent] 执行 MCP 清理`)
        await mcpCleanup!()
      })
    }

    // 构建系统提示
    const systemPrompt = buildSystemPrompt(context, availableTools)

    // 初始化消息列表
    const messages: AgentMessage[] = [
      { role: 'system', content: systemPrompt },
      ...params.promptMessages,
    ]

    // Query 循环
    context.run()

    let lastAssistantMessage: AgentMessage | null = null

    while (!context.hasReachedMaxTurns()) {
      // 检查是否已取消
      if (params.abortSignal?.aborted || context.getAbortSignal().aborted) {
        context.cancel()
        yield { type: 'cancelled', agentId: context.agentId }
        return
      }

      // 增加轮次
      const canContinue = context.incrementTurn()
      if (!canContinue) {
        break
      }

      yield { type: 'turn', agentId: context.agentId, turn: context.currentTurn }

      params.onProgress?.({
        agentId: context.agentId,
        status: RuntimeStatus.RUNNING,
        currentTurn: context.currentTurn,
        maxTurns: context.maxTurns,
        message: `执行中 (第 ${context.currentTurn} 轮)...`,
      })

      try {
        // 调用 AI API 获取响应
        context.waitForTool()

        const response = await callAI({
          model: context.model || 'qwen-plus',
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          abortSignal: context.getAbortSignal(),
        })

        if (!response) {
          // 被取消
          context.cancel()
          yield { type: 'cancelled', agentId: context.agentId }
          return
        }

        // 处理响应
        const assistantMessage: AgentMessage = {
          role: 'assistant',
          content: response.content,
          toolCalls: response.toolCalls?.map(tc => ({
            id: tc.id || uuidv4(),
            name: tc.name,
            input: tc.input,
          })),
        }

        lastAssistantMessage = assistantMessage
        messages.push(assistantMessage)

        yield { type: 'message', agentId: context.agentId, message: assistantMessage }

        // 如果没有工具调用，完成
        if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
          break
        }

        // 执行工具调用
        const toolResults: AgentToolResult[] = []

        for (const toolCall of assistantMessage.toolCalls) {
          // 检查工具权限
          if (!context.canUseTool(toolCall.name)) {
            const result: AgentToolResult = {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              success: false,
              error: `工具 "${toolCall.name}" 不可用或被禁用`,
            }
            toolResults.push(result)

            yield { type: 'tool_result', agentId: context.agentId, result }
            params.onToolResult?.(result)
            continue
          }

          // 发出工具调用事件
          yield { type: 'tool_call', agentId: context.agentId, toolCall }
          params.onToolCall?.(toolCall)

          // 执行工具
          try {
            const toolResult = await executeTool(toolCall, context)

            const result: AgentToolResult = {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              success: toolResult.success,
              result: toolResult.result,
              error: toolResult.error,
            }

            toolResults.push(result)

            yield { type: 'tool_result', agentId: context.agentId, result }
            params.onToolResult?.(result)

          } catch (error) {
            const result: AgentToolResult = {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }

            toolResults.push(result)

            yield { type: 'tool_result', agentId: context.agentId, result }
            params.onToolResult?.(result)
          }
        }

        // 将工具结果添加到消息
        if (toolResults.length > 0) {
          const toolResultMessage: AgentMessage = {
            role: 'user',
            content: '',
            toolResults,
          }
          messages.push(toolResultMessage)
        }

      } catch (error) {
        context.fail(error instanceof Error ? error.message : 'Unknown error')
        yield {
          type: 'error',
          agentId: context.agentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
        return
      }
    }

    // 达到最大轮次
    if (context.hasReachedMaxTurns()) {
      params.onProgress?.({
        agentId: context.agentId,
        status: RuntimeStatus.COMPLETED,
        currentTurn: context.currentTurn,
        maxTurns: context.maxTurns,
        message: '达到最大轮次限制',
      })
    }

    // 完成
    context.complete()

    const finalMessage = lastAssistantMessage?.content || 'Agent 执行完成'

    yield { type: 'complete', agentId: context.agentId, result: finalMessage }

    params.onProgress?.({
      agentId: context.agentId,
      status: RuntimeStatus.COMPLETED,
      currentTurn: context.currentTurn,
      maxTurns: context.maxTurns,
      message: '执行完成',
    })

  } finally {
    // 资源清理
    await context.cleanup()
  }
}

/**
 * 构建系统提示
 */
function buildSystemPrompt(context: AgentRuntimeContext, availableTools: string[]): string {
  const basePrompt = context.agentDefinition.getSystemPrompt()

  // 添加工具信息
  const toolsSection = `
## 可用工具

${availableTools.map(tool => `- ${tool}`).join('\n')}

${context.toolPermission.readOnly ? '**注意**: 此 Agent 是只读模式，不能执行写入操作。' : ''}
`.trim()

  // 添加权限模式信息
  let permissionSection = ''
  switch (context.permissionMode) {
    case PermissionMode.BYPASS:
      permissionSection = '**权限模式**: bypassPermissions - 所有操作都被允许'
      break
    case PermissionMode.PLAN:
      permissionSection = '**权限模式**: plan - 仅允许读取操作，禁止写入'
      break
    case PermissionMode.ACCEPT_EDITS:
      permissionSection = '**权限模式**: acceptEdits - 允许编辑，但禁止危险操作'
      break
    default:
      permissionSection = '**权限模式**: auto - 根据 Agent 类型自动设置权限'
  }

  return `${basePrompt}

${toolsSection}

${permissionSection}

## 执行约束

- 最大轮次: ${context.maxTurns}
- 工作目录: ${context.cwd}
`.trim()
}

/**
 * AI 调用接口
 */
interface AICallResponse {
  content: string
  toolCalls?: Array<{
    id?: string
    name: string
    input: Record<string, unknown>
  }>
}

/**
 * 调用 AI API
 */
async function callAI(params: {
  model: string
  messages: Array<{ role: string; content: string }>
  abortSignal?: AbortSignal
}): Promise<AICallResponse | null> {
  // 检查是否已取消
  if (params.abortSignal?.aborted) {
    return null
  }

  // TODO: 实现实际的 AI API 调用
  // 目前返回模拟响应
  console.log(`[callAI] Calling ${params.model} with ${params.messages.length} messages`)

  // 模拟 API 调用
  await new Promise(resolve => setTimeout(resolve, 100))

  // 返回模拟响应
  return {
    content: '这是模拟的 Agent 响应。在实际实现中，这里会调用真实的 AI API。',
  }
}

/**
 * 执行工具
 */
async function executeTool(
  toolCall: AgentToolCall,
  context: AgentRuntimeContext
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  try {
    const toolRegistry = getToolRegistry()
    const tool = toolRegistry.getTool(toolCall.name)

    if (!tool) {
      return {
        success: false,
        error: `工具 "${toolCall.name}" 不存在`,
      }
    }

    const result = await toolRegistry.executeTool({
      toolName: toolCall.name,
      toolInput: toolCall.input,
      sessionId: context.sessionId,
      timeout: tool.timeout,
    })

    return {
      success: result.success,
      result: result.result,
      error: result.error,
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * 执行 Agent 并返回结果
 */
export async function executeAgent(
  params: RunAgentParams
): Promise<AgentExecutionResult> {
  const startTime = Date.now()
  let finalResult = ''
  let error: string | undefined

  for await (const event of runAgent(params)) {
    switch (event.type) {
      case 'complete':
        finalResult = event.result
        break
      case 'error':
        error = event.error
        break
      case 'cancelled':
        error = 'Agent 执行被取消'
        break
    }
  }

  return {
    agentId: params.agentDefinition.agentType,
    status: error ? 'error' : 'completed',
    content: finalResult,
    durationMs: Date.now() - startTime,
    error,
  }
}

/**
 * 获取运行时状态摘要
 */
export function getRuntimeStatusSummary(
  context: AgentRuntimeContext
): {
  agentId: string
  status: string
  currentTurn: number
  maxTurns: number
  duration: number
} {
  return {
    agentId: context.agentId,
    status: context.status,
    currentTurn: context.currentTurn,
    maxTurns: context.maxTurns,
    duration: context.getDuration(),
  }
}
