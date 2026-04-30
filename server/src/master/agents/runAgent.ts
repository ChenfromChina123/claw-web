/**
 * runAgent - Agent 执行运行时
 * 
 * 实现 Agent 的完整执行链路：
 * 1. 初始化阶段
 * 2. Query 循环
 * 3. 资源清理
 */

import { v4 as uuidv4 } from 'uuid'
import type { AgentDefinition, AgentExecutionResult, IsolationMode } from './types'
import { createRuntimeContext, AgentRuntimeContext, RuntimeStatus, PermissionMode } from './runtimeContext'
import { getToolRegistry, RegisteredTool } from '../integrations/toolRegistry'
import type { IsolationContextConfig, WorktreeConfig, RemoteConfig } from './contextIsolation'
import { llmService, type ChatMessage, type ToolDefinition as LLMToolDef } from '../services/llmService'
import {
  getOutputEfficiencySection,
  isNumericLengthAnchorsEnabled,
  PROACTIVE_SECTION,
  FORK_BOILERPLATE,
} from '../prompts/efficiencyPrompts'
import { parseAndPushMessages } from './pushMessageParser'
import { getBackgroundTaskManager, TaskPriority, type BackgroundTask } from '../services/backgroundTaskManager'

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
  /** 用户 ID（用于 Worker 容器路由） */
  userId: string
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
  /** 隔离模式 (worktree/remote) */
  isolation?: IsolationMode
  /** Worktree 配置 */
  worktree?: WorktreeConfig
  /** Remote 配置 */
  remote?: RemoteConfig
  /** 隔离上下文 ID (如果已存在) */
  isolationContextId?: string
  /** 任务优先级 */
  taskPriority?: TaskPriority
  /** 父任务ID */
  parentTaskId?: string
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

  // 首先创建后台任务记录
  const taskManager = getBackgroundTaskManager()
  const promptContent = params.promptMessages[0]?.content || 'Agent任务'
  const task = taskManager.createTask({
    name: `Agent: ${params.agentDefinition.agentType}`,
    description: typeof promptContent === 'string' ? promptContent.substring(0, 200) : 'Agent执行',
    priority: params.taskPriority ?? TaskPriority.NORMAL,
    parentTaskId: params.parentTaskId,
    agentId: params.agentDefinition.agentType,
    metadata: {
      sessionId: params.sessionId,
      userId: params.userId,
      model: params.model,
      maxTurns: params.maxTurns || 100,
    },
  })

  console.log(`[runAgent] 创建任务: ${task.id}, Agent: ${params.agentDefinition.agentType}`)

  // 初始化隔离上下文
  let isolationContextId = params.isolationContextId
  let worktreePath: string | undefined

  // 如果需要创建新的隔离上下文
  if (params.isolation && !isolationContextId) {
    try {
      const { getIsolationManager, IsolationMode: ContextIsolationMode } = await import('./contextIsolation')
      const manager = getIsolationManager()

      const config: IsolationContextConfig = {
        isolationId: `iso_${uuidv4().slice(0, 8)}`,
        mode: params.isolation === 'worktree' ? ContextIsolationMode.WORKTREE : ContextIsolationMode.REMOTE,
        name: `agent-${params.agentDefinition.agentType}`,
        description: `隔离执行：${params.agentDefinition.agentType}`,
        workingDirectory: params.cwd || process.cwd(),
        cleanupPolicy: 'delayed',
        worktree: params.worktree,
        remote: params.remote,
      }

      isolationContextId = await manager.create(config)
      console.log(`[runAgent] 创建隔离上下文：${isolationContextId} (模式：${params.isolation})`)

      // 获取 worktree 路径（如果是 worktree 模式）
      if (params.isolation === 'worktree' && params.worktree) {
        worktreePath = manager.getWorktreePath(isolationContextId)
      }
    } catch (error) {
      console.error(`[runAgent] 创建隔离上下文失败:`, error)
      // 隔离创建失败，回退到普通执行
    }
  }

  // 确定最终的工作目录
  const finalCwd = worktreePath || params.cwd || process.cwd()

  // 创建运行时上下文
  const context = createRuntimeContext(params.agentDefinition, {
    sessionId: params.sessionId,
    cwd: finalCwd,
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

    // 清理隔离上下文（如果是新创建的）
    if (isolationContextId && !params.isolationContextId) {
      try {
        const { getIsolationManager } = await import('./contextIsolation')
        const manager = getIsolationManager()
        await manager.destroy(isolationContextId)
        console.log(`[runAgent] 已销毁隔离上下文：${isolationContextId}`)
      } catch (error) {
        console.error(`[runAgent] 销毁隔离上下文失败:`, error)
      }
    }
  })

  try {
    // 启动任务
    taskManager.startTask(task.id)

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
        // 取消任务
        taskManager.cancelTask(task.id)
        console.log(`[runAgent] 任务已取消: ${task.id}`)
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
            const toolResult = await executeTool(toolCall, context, params.userId)

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

    let finalMessage = lastAssistantMessage?.content || 'Agent 执行完成'

    // 解析并推送消息（如果响应中包含 push_message 代码块）
    if (params.userId && params.sessionId) {
      try {
        const pushResult = await parseAndPushMessages(
          finalMessage,
          params.userId,
          params.sessionId
        )

        if (pushResult.messageIds.length > 0) {
          console.log(`[runAgent] Pushed ${pushResult.messageIds.length} messages to user ${params.userId}`)
          // 使用处理后的内容（移除了 push_message 代码块）
          finalMessage = pushResult.processedContent
        }
      } catch (error) {
        console.error('[runAgent] Failed to parse/push messages:', error)
      }
    }

    // 完成任务
    taskManager.completeTask(task.id, { result: finalMessage, agentId: context.agentId })
    console.log(`[runAgent] 完成任务: ${task.id}`)

    yield { type: 'complete', agentId: context.agentId, result: finalMessage }

    params.onProgress?.({
      agentId: context.agentId,
      status: RuntimeStatus.COMPLETED,
      currentTurn: context.currentTurn,
      maxTurns: context.maxTurns,
      message: '执行完成',
    })

  } catch (error) {
    // 任务失败
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    taskManager.failTask(task.id, errorMessage)
    console.error(`[runAgent] 任务失败: ${task.id}, 错误: ${errorMessage}`)
    throw error
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

  // 添加输出效率指令（来自 claw-web）
  const efficiencySection = `
${getOutputEfficiencySection()}
${isNumericLengthAnchorsEnabled() ? '\n' + '' : ''}
`.trim()

  // 添加 Proactive 自驱模式规则（如果启用了主动模式）
  const proactiveSection = process.env.ENABLE_PROACTIVE === 'true' ? PROACTIVE_SECTION : ''

  // Fork Worker 模式：如果是子代理，注入强制规则覆盖默认行为
  const isForkWorker = !!context.parentAgentId
  const forkSection = isForkWorker ? '\n\n' + FORK_BOILERPLATE : ''

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

  // ==================== 安全约束（路径隔离）====================
  const securityConstraints = `
## [SECURITY] 安全约束 - 路径隔离（强制执行）

### [WARNING] 绝对禁止的操作

**1. 禁止访问父目录（上层目录）**
- [BLOCK] 严禁使用 "cd .." 或 "pushd .." 切换到父目录
- [BLOCK] 严禁在路径中使用 "../" 或 "..\\"
- [BLOCK] 严禁尝试查看或列出上层目录结构（如 "ls ../", "dir .."）
- Agent 必须始终保持在当前工作目录 ${context.cwd} 及其子目录内

**2. 禁止的路径遍历攻击**
- [BLOCK] cat ../../etc/passwd
- [BLOCK] cd .. && rm -rf important_files
- [BLOCK] cp /etc/shadow ./stolen
- [BLOCK] ls ../../../windows/

**3. 禁止访问的系统敏感路径**
- [BLOCK] /etc/, /usr/share/, /var/log/ (Linux)
- [BLOCK] C:\\Windows\\, C:\\Program Files\\ (Windows)
- [BLOCK] ~/.ssh/, ~/.aws/, .env, credentials 文件

### [ALLOWED] 允许的操作

- [OK] 在工作目录及其直接子目录内自由操作
- [OK] 使用相对路径访问项目文件：./src/, .config/
- [OK] 使用绝对路径但必须在工作目录范围内
- [OK] 创建新的子目录用于临时文件或构建输出

### [SHIELD] 安全机制说明

本系统已实施多层安全防护：
1. 命令层检测 - 自动拦截 cd .. 和包含 .. 的命令
2. 路径层验证 - 所有文件操作路径都会验证是否在工作目录内
3. 实时监控 - 所有工具调用都经过安全检查器过滤

违反安全约束的操作将被自动阻止并记录。

`.trim()

  return `${basePrompt}

${toolsSection}

${efficiencySection}
${proactiveSection ? '\n\n' + proactiveSection : ''}${forkSection}

${permissionSection}

${securityConstraints}

## 执行约束

- 最大轮次: ${context.maxTurns}
- 工作目录: ${context.cwd}
`.trim()
}

/**
 * AI 调用响应接口
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
 * 调用 AI API（真实实现）
 * 使用 LLM 服务模块调用 Anthropic/Qwen 等真实 LLM
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

  console.log(`[callAI] 调用真实 LLM: ${params.model}，消息数: ${params.messages.length}`)

  try {
    // 将消息格式转换为 LLM 服务需要的格式
    const chatMessages: ChatMessage[] = params.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }))

    // 获取可用工具定义（从工具注册表）
    const toolRegistry = getToolRegistry()
    const allTools = toolRegistry.getAllTools()
    
    // 转换为 LLM 工具格式
    const tools: LLMToolDef[] = allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: 'inputSchema' in tool ? tool.inputSchema : {},
    }))

    // 调用真实的 LLM 服务
    const response = await llmService.chat(
      chatMessages,
      { model: params.model },
      tools,
      params.abortSignal
    )

    console.log(`[callAI] LLM 响应成功，内容长度: ${response.content.length}, 工具调用数: ${response.toolCalls?.length || 0}`)

    // 转换响应格式
    return {
      content: response.content,
      toolCalls: response.toolCalls?.map(tc => ({
        id: tc.id,
        name: tc.name,
        input: tc.input,
      })),
    }
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      console.log('[callAI] 请求被取消')
      return null
    }
    
    console.error('[callAI] LLM 调用失败:', error)
    throw new Error(`LLM 调用失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 执行工具
 */
async function executeTool(
  toolCall: AgentToolCall,
  context: AgentRuntimeContext,
  userId: string
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
      userId,
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

  try {
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
  } catch (e) {
    // 捕获 runAgent 抛出的异常
    error = e instanceof Error ? e.message : String(e)
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
