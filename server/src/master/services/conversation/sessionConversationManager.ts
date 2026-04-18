/**
 * SessionConversationManager - 会话对话管理器
 * 
 * 负责处理用户消息的 Agent Loop，包括：
 * - 初始化会话工作区
 * - 初始化会话隔离上下文
 * - 调用 AI API 进行流式响应
 * - 执行工具调用
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { v4 as uuidv4 } from 'uuid'
import { SessionManager } from '../sessionManager'
import { toolExecutor, EnhancedToolExecutor } from '../../integration/enhancedToolExecutor'
import { WebCommandBridge, parseUserInput } from '../../integrations/commandBridge'
import { WebAgentRunner } from '../../integrations/agentRunner'
import { WebSessionBridge } from '../../integrations/sessionBridge'
import { getWorkspaceManager } from '../workspaceManager'
import { stripIdeUserDisplayLayer } from '../../utils/ideUserMessageMarkers'
import { buildCompleteSystemPrompt } from '../../prompts/contextBuilder'
import type { ToolCall } from '../../models/types'
import type { EventSender } from '../../types'

interface StreamResult {
  text?: string
  toolCalls: Array<{ id: string; name: string; input: any }>
  aborted?: boolean
}

export class SessionConversationManager {
  private toolExecutor: EnhancedToolExecutor
  private commandBridge: WebCommandBridge
  private agentRunner: WebAgentRunner
  private sessionBridge: WebSessionBridge
  private isolationManager: any = null
  private workspaceManager = getWorkspaceManager()
  /** 每个会话当前一次 AI 流式请求的 AbortController，供 WS interrupt_generation 中止 */
  private streamAbortBySession = new Map<string, AbortController>()

  constructor() {
    this.toolExecutor = toolExecutor
    this.commandBridge = new WebCommandBridge()
    this.agentRunner = new WebAgentRunner()
    this.sessionBridge = new WebSessionBridge()
  }

  /**
   * 获取 Anthropic 客户端实例
   */
  private getAnthropicClient(): Anthropic {
    const clientOptions: ConstructorParameters<typeof Anthropic>[0] = {
      timeout: parseInt(process.env.API_TIMEOUT_MS || String(300000), 10),
      maxRetries: 0,
    }

    if (process.env.ANTHROPIC_API_KEY) clientOptions.apiKey = process.env.ANTHROPIC_API_KEY
    if (process.env.ANTHROPIC_AUTH_TOKEN) clientOptions.authToken = process.env.ANTHROPIC_AUTH_TOKEN
    if (process.env.ANTHROPIC_BASE_URL) clientOptions.baseURL = process.env.ANTHROPIC_BASE_URL

    return new Anthropic(clientOptions)
  }

  /**
   * 获取 OpenAI 兼容客户端实例（用于通义千问等）
   */
  private async getOpenAIClient(): Promise<OpenAI> {
    const apiKey = process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY
    const baseURL = process.env.QWEN_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'

    return new OpenAI({
      apiKey,
      baseURL,
      timeout: parseInt(process.env.API_TIMEOUT_MS || String(300000), 10),
    })
  }

  /**
   * 检测当前使用的 LLM 提供商
   */
  private detectLLMProvider(): 'anthropic' | 'qwen' {
    const provider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase()
    if (provider === 'qwen' && (process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY)) {
      return 'qwen'
    }
    return 'anthropic'
  }

  /**
   * 初始化用户主工作目录
   */
  private async initializeSessionWorkspace(sessionId: string, userId: string): Promise<void> {
    try {
      const workspace = await this.workspaceManager.getOrCreateUserWorkspace(userId)
      console.log(`[SessionWorkspace] User workspace ready for session ${sessionId}:`, workspace.path)
    } catch (error) {
      console.error(`[SessionWorkspace] Failed to initialize workspace for session ${sessionId}:`, error)
    }
  }

  /**
   * 初始化会话的隔离上下文（沙箱/Worktree）
   */
  private async initializeSessionIsolation(sessionId: string, userId: string): Promise<void> {
    try {
      const { getIsolationManager, IsolationMode } = await import('../../agents/contextIsolation')
      this.isolationManager = getIsolationManager()

      const contexts = this.isolationManager.getContextsByUser(userId)
      const existingContext = contexts.find(ctx => ctx.name === `session_${sessionId}`)

      if (existingContext) {
        console.log(`[SessionIsolation] Reusing existing isolation context: ${existingContext.isolationId}`)
        return
      }

      const isolationId = await this.isolationManager.create({
        isolationId: `iso_${userId}_${sessionId}`,
        userId,
        mode: IsolationMode.WORKTREE,
        name: `session_${sessionId}`,
        description: `Isolation context for session ${sessionId}`,
        workingDirectory: process.cwd().replace(/\\server\\src$/i, '').replace(/\/server\/src$/, ''),
        cleanupPolicy: 'delayed',
      })

      const context = this.isolationManager.getContext(isolationId)
      console.log(`[SessionIsolation] Created isolation context for session ${sessionId}:`, context)
    } catch (error) {
      console.error(`[SessionIsolation] Failed to initialize isolation for session ${sessionId}:`, error)
    }
  }

  /**
   * 获取会话的隔离上下文 ID
   */
  private getSessionIsolationId(sessionId: string, userId: string): string | undefined {
    if (!this.isolationManager) return undefined
    
    const contexts = this.isolationManager.getContextsByUser(userId)
    const context = contexts.find(ctx => ctx.name === `session_${sessionId}`)
    return context?.isolationId
  }

  /**
   * 用户点击「停止」：中止该会话正在进行的 LLM 流式请求
   */
  interruptSessionGeneration(sessionId: string): boolean {
    const ac = this.streamAbortBySession.get(sessionId)
    if (!ac) return false
    ac.abort()
    console.log(`[SessionConversationManager] interruptSessionGeneration: aborted stream for ${sessionId}`)
    return true
  }

  private registerStreamAbort(sessionId: string): AbortController {
    const prev = this.streamAbortBySession.get(sessionId)
    if (prev) prev.abort()
    const ac = new AbortController()
    this.streamAbortBySession.set(sessionId, ac)
    return ac
  }

  private clearStreamAbort(sessionId: string): void {
    this.streamAbortBySession.delete(sessionId)
  }

  /**
   * 处理用户消息并启动 Agent Loop
   */
  async processMessage(
    sessionId: string,
    userMessage: string,
    model: string,
    sessionManager: SessionManager,
    sendEvent: EventSender,
    options?: {
      maxIterations?: number
      debugMode?: boolean
      timeout?: number
    }
  ): Promise<void> {
    // 首先尝试从内存获取会话，如果不存在则从数据库加载
    let sessionDataTemp = sessionManager.getInMemorySession(sessionId)

    if (!sessionDataTemp) {
      console.log(`[SessionConversationManager] Session ${sessionId} not in memory, loading from database...`)
      sessionDataTemp = await sessionManager.loadSession(sessionId)
      if (!sessionDataTemp) {
        console.error(`[SessionConversationManager] Session ${sessionId} not found in database`)
        sendEvent('error', { message: 'Session not found' })
        return
      }
      console.log(`[SessionConversationManager] Session ${sessionId} loaded from database`)
    }

    const userId = sessionDataTemp?.session.userId

    console.log(`[SessionConversationManager] processMessage called: sessionId=${sessionId}, userId=${userId}, isolationManager=${!!this.isolationManager}`)

    // 1. 初始化隔离上下文
    if (userId && !this.isolationManager) {
      console.log(`[SessionIsolation] Initializing isolation context for session ${sessionId}, userId=${userId}`)
      await this.initializeSessionIsolation(sessionId, userId)
    } else if (!userId) {
      console.warn(`[SessionIsolation] Cannot initialize: userId is missing`)
    }

    // 1.1 初始化工作目录
    if (userId) {
      console.log(`[SessionWorkspace] Initializing workspace for session ${sessionId}, userId=${userId}`)
      await this.initializeSessionWorkspace(sessionId, userId)
    }

    // 2. 检查是否为命令
    const parsed = parseUserInput(userMessage)
    if (parsed.isCommand && parsed.command) {
      const result = await this.commandBridge.executeCommand(parsed.command, sendEvent)
      sendEvent('command_result', result)
      return
    }

    // 3. 保存用户消息到 session
    const savedUserMessage = sessionManager.addMessage(sessionId, 'user', userMessage)

    const sessionData = sessionManager.getInMemorySession(sessionId)
    if (!sessionData) {
      sendEvent('error', { message: 'Session not found' })
      return
    }

    // 4. 发送 message_saved 事件
    if (savedUserMessage) {
      sendEvent('message_saved', {
        sessionId,
        messageId: savedUserMessage.id,
        role: 'user',
      })
    }

    console.log(`[${sessionId}] Starting Agent Loop with model: ${model}`)
    console.log(`[${sessionId}] Total messages in history: ${sessionData.messages.length}`)
    if (userId) {
      const isolationId = this.getSessionIsolationId(sessionId, userId)
      console.log(`[${sessionId}] Using isolation context: ${isolationId || 'none'}`)
    }

    const streamAbort = this.registerStreamAbort(sessionId)
    try {
      // 4. 进入 Agent Loop (使用配置的最大迭代次数，默认10次)
      const maxIterations = options?.maxIterations ?? 10
      let actualIterations = 0
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        actualIterations = iteration + 1
        console.log(`[${sessionId}] Agent Loop iteration ${actualIterations}/${maxIterations}`)

        // 4.1 创建助手消息占位符
        const assistantMessage = sessionManager.addMessage(sessionId, 'assistant', '')
        if (!assistantMessage) {
          console.error(`[${sessionId}] Failed to create assistant message`)
          sendEvent('error', { message: 'Failed to create assistant message' })
          return
        }
        const assistantMessageId = assistantMessage.id

        // 4.2 发送 message_start 事件
        sendEvent('message_start', { 
          messageId: assistantMessageId, 
          iteration: actualIterations
        })

        // 4.3 调用 AI API (streaming)
        console.log(`[${sessionId}] Calling AI API for iteration ${actualIterations}...`)
        const streamResult = await this.callAIWithStream(
          sessionId, 
          model, 
          sessionManager, 
          sendEvent,
          streamAbort.signal
        )
        console.log(`[${sessionId}] AI response received, text length: ${streamResult.text?.length || 0}, toolCalls: ${streamResult.toolCalls?.length || 0}`)

        if (streamResult.aborted) {
          const tail =
            streamResult.text?.trim() !== ''
              ? streamResult.text
              : '（生成已由用户停止）'
          sessionManager.updateMessage(sessionId, assistantMessageId, tail, [])
          sendEvent('message_stop', { stop_reason: 'user_cancelled', iteration: actualIterations })
          sendEvent('message_saved', {
            sessionId,
            messageId: assistantMessageId,
            role: 'assistant',
          })
          console.log(`[${sessionId}] Stream aborted by user at iteration ${actualIterations}`)
          return
        }

        // 4.4 如果有工具调用
        if (streamResult.toolCalls && streamResult.toolCalls.length > 0) {
          console.log(`[${sessionId}] AI requested ${streamResult.toolCalls.length} tool(s)`)
          
          await this.executeToolCalls(
            sessionId, 
            streamResult.toolCalls, 
            assistantMessageId,
            sessionManager, 
            sendEvent
          )
          console.log(`[${sessionId}] Tool execution completed`)
          
          if (streamResult.text || streamResult.toolCalls.length > 0) {
            const content: any[] = []
            if (streamResult.text) {
              content.push({ type: 'text', text: streamResult.text })
            }
            for (const tc of streamResult.toolCalls) {
              let toolInput = tc.input || '{}'
              if (typeof toolInput === 'string') {
                try {
                  toolInput = JSON.parse(toolInput)
                } catch (e) {
                  console.warn(`[${sessionId}] Failed to parse tool input, using as string:`, toolInput)
                }
              }
              content.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input: toolInput
              })
            }
            
            sessionManager.updateMessage(
              sessionId, 
              assistantMessageId, 
              content, 
              streamResult.toolCalls.map(tc => ({
                id: tc.id,
                messageId: assistantMessageId,
                sessionId,
                toolName: tc.name,
                toolInput: tc.input,
                toolOutput: null,
                status: 'pending' as const,
                createdAt: new Date(),
              }))
            )
          }
          
          console.log(`[${sessionId}] Tool execution completed, continuing to next iteration...`)

          // 发送 message_stop 事件，让前端正确完成当前轮次
          sendEvent('message_stop', { stop_reason: 'tool_use', iteration: actualIterations })

          // 发送 message_saved 事件确认消息已保存
          sendEvent('message_saved', {
            sessionId,
            messageId: assistantMessageId,
            role: 'assistant',
          })

          continue
        }

        // 4.5 无工具调用 - 更新消息并结束循环
        console.log(`[${sessionId}] No tool calls requested, ending conversation`)
        if (streamResult.text) {
          sessionManager.updateMessage(sessionId, assistantMessageId, streamResult.text, [])
        }

        sendEvent('message_stop', { stop_reason: 'end_turn', iteration: actualIterations })
        
        sendEvent('message_saved', {
          sessionId,
          messageId: assistantMessageId,
          role: 'assistant',
        })
        
        const finalSession = sessionManager.getInMemorySession(sessionId)
        sendEvent('conversation_end', { 
          totalMessages: finalSession?.messages?.length || 0 
        })
        
        console.log(`[${sessionId}] Conversation completed at iteration ${actualIterations}`)
        break
      }

      if (actualIterations >= maxIterations) {
        console.warn(`[${sessionId}] Max iterations (${maxIterations}) reached`)
        sendEvent('max_iterations_reached', { iterations: maxIterations })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[${sessionId}] Agent Loop error:`, errorMessage)
      sendEvent('error', { message: errorMessage })
    } finally {
      this.clearStreamAbort(sessionId)
    }
  }

  /**
   * 调用 AI API 并处理流式响应
   * 支持 Anthropic (Claude) 和 OpenAI 兼容接口（通义千问等）
   */
  private async callAIWithStream(
    sessionId: string,
    model: string,
    sessionManager: SessionManager,
    sendEvent: EventSender,
    signal?: AbortSignal
  ): Promise<StreamResult> {
    const messages = sessionManager.getInMemorySession(sessionId)?.messages || []
    const provider = this.detectLLMProvider()

    let assistantText = ''
    let pendingToolCalls: Array<{ id: string; name: string; input: string }> = []

    console.log(`[${sessionId}] Calling AI API with ${messages.length} messages (provider: ${provider}, model: ${model})`)

    // 获取工作区信息
    let workspaceSummary: string | null = null
    let userId: string | null = null
    try {
      const session = sessionManager.getInMemorySession(sessionId)
      userId = session?.session.userId ?? null
      if (userId) {
        workspaceSummary = await this.workspaceManager.getUserWorkspaceSummaryForContext(userId)
        console.log(`[${sessionId}] Workspace info retrieved for user ${userId}`)
      }
    } catch (error) {
      console.warn(`[${sessionId}] Failed to get workspace summary:`, error)
    }

    // 构建系统提示（静态部分可缓存，动态部分包含工作区摘要）
    const systemPromptSections = await buildCompleteSystemPrompt({
      cwd: process.cwd(),
      workspaceSummary,
      injectRules: true,
      useGlobalCacheScope: true,
    })
    const systemPrompt = systemPromptSections.join('\n\n')

    // 根据提供商选择不同的调用方式
    if (provider === 'qwen') {
      return await this.callQwenWithStream(sessionId, model, messages, systemPrompt, sessionManager, sendEvent, signal)
    } else {
      return await this.callAnthropicWithStream(sessionId, model, messages, systemPrompt, sessionManager, sendEvent, signal)
    }
  }

  /**
   * 使用 Anthropic SDK 调用 AI（Claude）
   */
  private async callAnthropicWithStream(
    sessionId: string,
    model: string,
    messages: any[],
    systemPrompt: string,
    sessionManager: SessionManager,
    sendEvent: EventSender,
    signal?: AbortSignal
  ): Promise<StreamResult> {
    const client = this.getAnthropicClient()
    let assistantText = ''
    let pendingToolCalls: Array<{ id: string; name: string; input: string }> = []

    const streamParams = {
      model,
      max_tokens: 4096,
      system: systemPrompt || undefined,
      tools: this.toolExecutor.getAnthropicTools() as Anthropic.Tool[],
      messages: messages.map(m => {
        let content: unknown = Array.isArray(m.content) ? m.content : m.content
        if (m.role === 'user' && typeof content === 'string') {
          content = stripIdeUserDisplayLayer(content)
        }
        return {
          role: m.role as 'user' | 'assistant',
          content,
        }
      }),
    }
    const stream = client.messages.stream(
      streamParams,
      signal ? { signal } : undefined
    )

    try {
      for await (const event of stream) {
        if (signal?.aborted) break
        switch (event.type) {
          case 'content_block_start':
            if (event.content_block.type === 'tool_use') {
              const toolId = event.content_block.id || uuidv4()
              const toolName = event.content_block.name || ''
              console.log(`[${sessionId}] Tool use started: ${toolName}`)
              pendingToolCalls.push({ id: toolId, name: toolName, input: '' })

              sendEvent('tool_use', { id: toolId, name: toolName })
            }
            break

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              assistantText += event.delta.text
              sendEvent('content_block_delta', { text: event.delta.text })
            } else if (event.delta.type === 'input_json_delta') {
              if (pendingToolCalls.length > 0) {
                const lastTool = pendingToolCalls[pendingToolCalls.length - 1]
                lastTool.input += event.delta.partial_json
                sendEvent('tool_input_delta', {
                  id: lastTool.id,
                  partial_json: event.delta.partial_json
                })
              }
            }
            break

          case 'content_block_stop':
            break

          case 'message_delta':
            if (event.delta.stop_reason) {
              console.log(`[${sessionId}] Stream stop reason: ${event.delta.stop_reason}`)
            }
            break

          case 'message_stop':
            console.log(`[${sessionId}] Message stream completed`)
            break
        }
      }

      // 解析工具调用
      const finalMessage = await stream.finalMessage()
      if (finalMessage.content) {
        for (const block of finalMessage.content) {
          if (block.type === 'tool_use') {
            const existingCall = pendingToolCalls.find(tc => tc.id === block.id)
            if (existingCall) {
              existingCall.input = block.input as any
            } else {
              pendingToolCalls.push({
                id: block.id,
                name: block.name,
                input: JSON.stringify(block.input),
              })
            }
          }
        }
      }

      return {
        text: assistantText,
        toolCalls: pendingToolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          input: typeof tc.input === 'string' ? JSON.parse(tc.input || '{}') : tc.input,
        })),
      }
    } catch (err) {
      const aborted =
        signal?.aborted === true ||
        (err instanceof Error &&
          (err.name === 'AbortError' ||
            err.message?.toLowerCase().includes('abort') ||
            (err as Error & { cause?: { name?: string } }).cause?.name === 'AbortError'))
      if (aborted) {
        console.log(`[${sessionId}] AI stream aborted (user stop)`)
        return { text: assistantText, toolCalls: [], aborted: true }
      }
      throw err
    }
  }

  /**
   * 使用 OpenAI 兼容接口调用 AI（通义千问等）
   */
  private async callQwenWithStream(
    sessionId: string,
    model: string,
    messages: any[],
    systemPrompt: string,
    sessionManager: SessionManager,
    sendEvent: EventSender,
    signal?: AbortSignal
  ): Promise<StreamResult> {
    const client = await this.getOpenAIClient()
    let assistantText = ''
    let pendingToolCalls: Array<{ id: string; name: string; input: any }> = []

    // 转换工具定义格式为 OpenAI function calling 格式
    const anthropicTools = this.toolExecutor.getAnthropicTools() as Anthropic.Tool[]
    const openaiTools = anthropicTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }))

    /**
     * 转换消息内容格式为 Qwen 兼容格式
     * Qwen API 要求：content 不能为空数组，必须是字符串或有效的 content 数组
     */
    const formatMessageContent = (role: string, content: any): string | Array<any> => {
      if (typeof content === 'string') {
        return role === 'user' ? stripIdeUserDisplayLayer(content) : content
      }
      
      if (Array.isArray(content)) {
        if (content.length === 0) {
          return ''
        }
        
        const formatted = content.map((item: any) => {
          if (typeof item === 'string') return { type: 'text', text: item }
          if (item && typeof item === 'object' && item.type) return item
          return { type: 'text', text: String(item) }
        })
        
        return formatted
      }
      
      return String(content || '')
    }

    // 构建 OpenAI 格式的消息列表（兼容 Qwen API）
    const openaiMessages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string | Array<any>; name?: string; tool_call_id?: string }> = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role,
        content: formatMessageContent(m.role, m.content),
        ...(m.name ? { name: m.name } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
      })),
    ]

    try {
      // 创建 AbortController 用于取消请求
      const abortController = new AbortController()
      if (signal) {
        signal.addEventListener('abort', () => abortController.abort(), { once: true })
      }

      const stream = await client.chat.completions.create({
        model,
        messages: openaiMessages,
        tools: openaiTools,
        max_tokens: 4096,
        temperature: 0.7,
        stream: true,
        stream_options: { include_usage: true },
      }, { signal: abortController.signal })

      let finishReason = ''

      for await (const chunk of stream) {
        if (signal?.aborted) break

        const delta = chunk.choices[0]?.delta

        // 处理文本内容
        if (delta?.content) {
          assistantText += delta.content
          sendEvent('content_block_delta', { text: delta.content })
        }

        // 处理工具调用
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.type === 'function') {
              const idx = toolCall.index ?? 0

              // 确保有足够的 pendingToolCalls 元素
              while (pendingToolCalls.length <= idx) {
                pendingToolCalls.push({ id: '', name: '', input: {} })
              }

              if (!pendingToolCalls[idx].id) {
                // 新的工具调用开始
                pendingToolCalls[idx] = {
                  id: `tool_${Date.now()}_${idx}`,
                  name: toolCall.function?.name || '',
                  input: '',
                }
                console.log(`[${sessionId}] Tool use started: ${toolCall.function?.name}`)
                sendEvent('tool_use', { id: pendingToolCalls[idx].id, name: toolCall.function?.name })
              }

              // 更新参数
              if (toolCall.function?.arguments) {
                try {
                  const args = typeof toolCall.function.arguments === 'string'
                    ? JSON.parse(toolCall.function.arguments)
                    : toolCall.function.arguments
                  if (typeof pendingToolCalls[idx].input === 'string') {
                    pendingToolCalls[idx].input += toolCall.function.arguments as string
                  } else {
                    Object.assign(pendingToolCalls[idx].input, args)
                  }
                  sendEvent('tool_input_delta', {
                    id: pendingToolCalls[idx].id,
                    partial_json: toolCall.function.arguments,
                  })
                } catch (e) {
                  // JSON 解析失败，累积原始字符串
                  if (typeof pendingToolCalls[idx].input !== 'string') {
                    pendingToolCalls[idx].input = ''
                  }
                  pendingToolCalls[idx].input += toolCall.function.arguments as string
                }
              }
            }
          }
        }

        // 检查完成原因
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason
          console.log(`[${sessionId}] Qwen stream stop reason: ${finishReason}`)
        }
      }

      // 过滤掉空的 pendingToolCalls
      const validToolCalls = pendingToolCalls.filter(tc => tc.name)

      console.log(`[${sessionId}] Qwen response completed. Text length: ${assistantText.length}, Tools: ${validToolCalls.length}`)

      return {
        text: assistantText,
        toolCalls: validToolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          input: typeof tc.input === 'string' ? JSON.parse(tc.input || '{}') : tc.input,
        })),
      }
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.message?.includes('abort')) throw error
      console.error(`[${sessionId}] Qwen stream error:`, error)
      throw error
    }
  }

  /**
   * 执行工具调用并发送完整的事件序列
   */
  private async executeToolCalls(
    sessionId: string,
    toolCalls: Array<{id: string; name: string; input: any}>,
    messageId: string,
    sessionManager: SessionManager,
    sendEvent: EventSender
  ): Promise<void> {
    for (const tool of toolCalls) {
      console.log(`[${sessionId}] Executing tool: ${tool.name}`)

      sendEvent('tool_start', { 
        id: tool.id, 
        name: tool.name, 
        input: tool.input,
        sessionId 
      })

      const startTime = Date.now()
      const toolCall: ToolCall = {
        id: tool.id,
        messageId: messageId,
        sessionId,
        toolName: tool.name,
        toolInput: tool.input,
        toolOutput: null,
        status: 'executing',
        createdAt: new Date(),
      }

      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Tool execution timeout')), 30000)
        })

        let workspaceDir = ''
        let currentUserId: string | null = null
        try {
          const sm = SessionManager.getInstance()
          const session = sm.getInMemorySession(sessionId)
          currentUserId = session?.session.userId ?? null
          if (currentUserId) {
            workspaceDir = await this.workspaceManager.getRealHomeDirectory(currentUserId)
            console.log(`[${sessionId}] Workspace using user home: ${workspaceDir}`)
          }
        } catch (e) {
          console.warn(`[${sessionId}] 获取工作目录失败:`, e)
        }

        if (workspaceDir) {
          this.toolExecutor.setContext({
            ...this.toolExecutor.getContext(),
            projectRoot: workspaceDir,
            workingDirectory: workspaceDir,
            sessionId: sessionId,
            userId: currentUserId || 'anonymous',
          })
        }

        const result = await Promise.race([
          this.toolExecutor.execute(tool.name, tool.input, sendEvent, tool.id),
          timeoutPromise
        ]) as { success: boolean; result?: unknown; error?: string }

        const duration = Date.now() - startTime

        toolCall.toolOutput = result.result as Record<string, unknown>
        toolCall.status = result.success ? 'completed' : 'error'
        toolCall.completedAt = new Date()

        sessionManager.addToolCall(sessionId, toolCall)
        sessionManager.addToolResultMessage(
          sessionId,
          tool.id,
          tool.name,
          result.result,
          result.error
        )

        sendEvent('tool_end', {
          id: tool.id,
          name: tool.name,
          success: true,
          result: result.result,
          duration,
        })

        // 如果是文件操作工具，发送文件变更事件通知前端刷新文件树
        const fileOperationTools = ['FileWrite', 'FileEdit', 'FileDelete', 'FileRename', 'Bash', 'PowerShell']
        if (fileOperationTools.includes(tool.name)) {
          sendEvent('workdir-changed', {
            sessionId,
            toolName: tool.name,
            timestamp: new Date().toISOString(),
          })
          console.log(`[${sessionId}] 文件操作工具执行完成，已发送 workdir-changed 事件`)
        }

        console.log(`[${sessionId}] Tool ${tool.name} completed in ${duration}ms`)

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const duration = Date.now() - startTime

        toolCall.toolOutput = { error: errorMessage }
        toolCall.status = 'error'
        toolCall.completedAt = new Date()

        sessionManager.addToolCall(sessionId, toolCall)
        sessionManager.addToolResultMessage(
          sessionId,
          tool.id,
          tool.name,
          undefined,
          errorMessage
        )

        sendEvent('tool_error', {
          id: tool.id,
          name: tool.name,
          error: errorMessage,
          errorType: this.classifyErrorType(error),
          duration,
        })

        console.error(`[${sessionId}] Tool ${tool.name} error after ${duration}ms:`, errorMessage)
      }
    }
  }

  /**
   * 分类错误���型
   */
  private classifyErrorType(error: unknown): string {
    const msg = error instanceof Error ? error.message : String(error)
    
    if (msg.includes('ENOENT') || msg.includes('not found')) return 'NOT_FOUND'
    if (msg.includes('EACCES') || msg.includes('permission')) return 'PERMISSION'
    if (msg.includes('timeout') || msg.includes('TIMEOUT')) return 'TIMEOUT'
    if (msg.includes('syntax') || msg.includes('parse')) return 'INVALID_INPUT'
    
    return 'UNKNOWN'
  }
}

// 单例导出
export const sessionConversationManager = new SessionConversationManager()