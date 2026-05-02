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
import { getToolRegistry } from '../../integrations/toolRegistry'
import { shouldExecuteOnWorker } from '../../integrations/workerToolExecutor'
import { imageStorageService } from '../imageStorageService'
import { workerForwarder } from '../../websocket/workerForwarder'
import { getBackgroundTaskManager, type BackgroundTask } from '../backgroundTaskManager'
import type { ToolCall } from '../../models/types'
import type { EventSender } from '../../types'
import type { MessageContent, ImageContentBlock, ImageAttachment } from '../../models/imageTypes'
import { AGENT_DEFAULTS } from '../../../shared/constants'

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
      imageAttachments?: ImageAttachment[]
      userId?: string
    }
  ): Promise<void> {
    // 首先尝试从内存获取会话，如果不存在则从数据库加载
    let sessionDataTemp = sessionManager.getInMemorySession(sessionId)

    if (!sessionDataTemp) {
      console.log(`[SessionConversationManager] Session ${sessionId} not in memory, loading from database...`)
      sessionDataTemp = await sessionManager.loadSession(sessionId)
      if (!sessionDataTemp) {
        console.warn(`[SessionConversationManager] Session ${sessionId} not found in database, auto-creating...`)
      }
    }

    if (!sessionDataTemp) {
      const userId = options?.userId
      if (!userId) {
        console.error(`[SessionConversationManager] Cannot auto-create session: no userId`)
        sendEvent('error', { message: 'Session not found and cannot auto-create without userId' })
        return
      }
      try {
        const newSession = await sessionManager.createSession(userId, '新对话', model, true)
        console.log(`[SessionConversationManager] Auto-created session ${newSession.id} for user ${userId}`)
        sessionDataTemp = await sessionManager.loadSession(newSession.id)
        if (!sessionDataTemp) {
          sendEvent('error', { message: 'Failed to load auto-created session' })
          return
        }
        sendEvent('session_created', { session: newSession, isNew: true })
      } catch (err) {
        console.error(`[SessionConversationManager] Failed to auto-create session:`, err)
        sendEvent('error', { message: 'Session not found and auto-creation failed' })
        return
      }
    }

    const userId = sessionDataTemp?.session.userId

    console.log(`[SessionConversationManager] processMessage called: sessionId=${sessionId}, userId=${userId}, isolationManager=${!!this.isolationManager}`)

    // 0. 确保用户有活跃的 Worker 连接（关键：用户在线时保持 Worker 连接）
    if (userId) {
      console.log(`[SessionConversationManager] 确保用户 ${userId} 的 Worker 连接...`)
      const workerConnection = await workerForwarder.ensureUserWorkerConnection(userId)
      if (workerConnection) {
        console.log(`[SessionConversationManager] 用户 ${userId} Worker 连接已就绪`)
      } else {
        console.warn(`[SessionConversationManager] 用户 ${userId} Worker 连接建立失败，工具执行可能会受影响`)
      }
    }

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

    // 3. 保存用户消息到 session（支持图片附件）
    let userContent: MessageContent = userMessage
    const imageAttachments = options?.imageAttachments

    if (imageAttachments && imageAttachments.length > 0) {
      const contentBlocks: any[] = [{ type: 'text', text: userMessage }]
      for (const attachment of imageAttachments) {
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'url',
            url: `/api/chat/images/${attachment.imageId}`,
            media_type: attachment.mimeType || 'image/png',
          },
        })
      }
      userContent = contentBlocks
    }

    const savedUserMessage = sessionManager.addMessage(sessionId, 'user', userContent, imageAttachments)

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

    // 确保用户消息已保存到数据库，避免 AI 读取时消息还未落库
    await sessionManager.forceSaveSession(sessionId)

    console.log(`[${sessionId}] Starting Agent Loop with model: ${model}`)
    console.log(`[${sessionId}] Total messages in history: ${sessionData.messages.length}`)
    if (userId) {
      const isolationId = this.getSessionIsolationId(sessionId, userId)
      console.log(`[${sessionId}] Using isolation context: ${isolationId || 'none'}`)
    }

    const streamAbort = this.registerStreamAbort(sessionId)

    const taskManager = getBackgroundTaskManager()
    const taskEventHandler = (eventType: string, task: BackgroundTask) => {
      const previousStatusMap: Record<string, string> = {
        task_created: 'none',
        task_queued: 'created',
        task_started: 'queued',
        task_completed: 'running',
        task_failed: 'running',
        task_cancelled: 'running',
      }
      sendEvent('task_status_changed', {
        taskId: task.id,
        taskName: task.name,
        previousStatus: previousStatusMap[eventType] || 'unknown',
        newStatus: task.status,
        result: task.result ? JSON.stringify(task.result) : undefined,
        error: task.error,
        traceId: (task.metadata as Record<string, unknown>)?.traceId as string | undefined,
        sessionId: sessionId,
      })
    }
    taskManager.on('task_created', (task: BackgroundTask) => taskEventHandler('task_created', task))
    taskManager.on('task_started', (task: BackgroundTask) => taskEventHandler('task_started', task))
    taskManager.on('task_completed', (task: BackgroundTask) => taskEventHandler('task_completed', task))
    taskManager.on('task_failed', (task: BackgroundTask) => taskEventHandler('task_failed', task))
    taskManager.on('task_cancelled', (task: BackgroundTask) => taskEventHandler('task_cancelled', task))

    try {
      // 4. 进入 Agent Loop (使用配置的最大迭代次数，默认30次)
      const maxIterations = options?.maxIterations ?? AGENT_DEFAULTS.MAX_ITERATIONS
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
          
          // 确保工具调用和工具结果消息已保存到数据库，避免 AI 下一轮读取时数据还未落库
          await sessionManager.forceSaveSession(sessionId)
          
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
        console.log(`[${sessionId}] streamResult.text = "${streamResult.text}", length = ${streamResult.text?.length || 0}`)
        if (streamResult.text) {
          console.log(`[${sessionId}] Calling updateMessage with text: "${streamResult.text.substring(0, 50)}..."`)
          sessionManager.updateMessage(sessionId, assistantMessageId, streamResult.text, [])
          console.log(`[${sessionId}] updateMessage called successfully`)
        } else {
          console.log(`[${sessionId}] streamResult.text is empty, skipping updateMessage`)
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
      taskManager.off('task_created')
      taskManager.off('task_started')
      taskManager.off('task_completed')
      taskManager.off('task_failed')
      taskManager.off('task_cancelled')
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
    // 从数据库加载完整消息（包括 tool_result），确保AI获得完整上下文
    // 不使用内存中已过滤的消息，因为 tool_result 是AI上下文的重要组成部分
    const messages = await sessionManager.getMessagesForAI(sessionId)
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

    // 根据提供商选择不同的调用方式
    if (provider === 'qwen') {
      const systemPrompt = systemPromptSections.join('\n\n')
      return await this.callQwenWithStream(sessionId, model, messages, systemPrompt, sessionManager, sendEvent, signal)
    } else {
      return await this.callAnthropicWithStream(sessionId, model, messages, systemPromptSections, sessionManager, sendEvent, signal)
    }
  }

  /**
   * 使用 Anthropic SDK 调用 AI（Claude）
   */
  private async callAnthropicWithStream(
    sessionId: string,
    model: string,
    messages: any[],
    systemPromptSections: string[],
    sessionManager: SessionManager,
    sendEvent: EventSender,
    signal?: AbortSignal
  ): Promise<StreamResult> {
    const client = this.getAnthropicClient()
    let assistantText = ''
    let pendingToolCalls: Array<{ id: string; name: string; input: string }> = []

    // 构建带 cache_control 的系统提示
    const systemBlocks: Anthropic.TextBlockParam[] = systemPromptSections.map((text, idx) => ({
      type: 'text' as const,
      text,
      ...(idx === 0 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }))

    // 解析消息中的图片 URL 引用为 base64
    const resolvedMessages = await this.resolveMessagesForAnthropic(messages)

    // 在倒数第二个用户消息的最后一个内容块添加 cache_control（多轮对话缓存）
    const userMsgIndices = resolvedMessages
      .map((m, i) => m.role === 'user' ? i : -1)
      .filter(i => i >= 0)
    const secondLastUserMsgIdx = userMsgIndices.length >= 2
      ? userMsgIndices[userMsgIndices.length - 2]
      : -1

    const anthropicMessages = resolvedMessages.map((m, idx) => {
      let content = m.content

      if (typeof content === 'string' && m.role === 'user') {
        content = stripIdeUserDisplayLayer(content)
      }

      // 为倒数第二个用户消息的最后一个内容块添加 cache_control
      if (idx === secondLastUserMsgIdx && Array.isArray(content)) {
        const lastBlock = content[content.length - 1]
        if (lastBlock && typeof lastBlock === 'object') {
          lastBlock.cache_control = { type: 'ephemeral' as const }
        }
      }

      return {
        role: m.role as 'user' | 'assistant',
        content,
      }
    })

    // 调试日志：打印实际传递给 LLM 的消息
    console.log(`[${sessionId}] === 传递给 LLM 的消息 (Anthropic) ===`)
    for (let i = 0; i < anthropicMessages.length; i++) {
      const msg = anthropicMessages[i]
      if (msg.role === 'user') {
        const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        console.log(`[${sessionId}]   [${i}] USER: "${contentStr.substring(0, 100)}${contentStr.length > 100 ? '...' : ''}"`)
      } else if (msg.role === 'assistant') {
        const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        console.log(`[${sessionId}]   [${i}] ASSISTANT: "${contentStr.substring(0, 100)}${contentStr.length > 100 ? '...' : ''}"`)
      }
    }
    console.log(`[${sessionId}] === 共 ${anthropicMessages.length} 条消息 ===`)

    const allAnthropicTools = this.toolExecutor.getAnthropicTools() as Anthropic.Tool[]

    const streamParams: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      system: systemBlocks,
      tools: allAnthropicTools.length > 0 ? allAnthropicTools : undefined,
      messages: anthropicMessages,
    }

    if (!allAnthropicTools.length) {
      streamParams.tool_choice = { type: 'none' as const }
    }
    const stream = client.messages.stream(
      streamParams as any,
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
            sendEvent('content_block_start', {
              index: event.index,
              content_block: { type: event.content_block.type }
            })
            break

          case 'content_block_delta':
            if (event.delta.type === 'text_delta') {
              assistantText += event.delta.text
              sendEvent('message_delta', { delta: event.delta.text })
              sendEvent('content_block_delta', {
                index: event.index,
                delta: { type: 'text_delta', text: event.delta.text }
              })
            } else if (event.delta.type === 'input_json_delta') {
              if (pendingToolCalls.length > 0) {
                const lastTool = pendingToolCalls[pendingToolCalls.length - 1]
                lastTool.input += event.delta.partial_json
                sendEvent('tool_input_delta', {
                  id: lastTool.id,
                  partial_json: event.delta.partial_json
                })
              }
            } else if (event.delta.type === 'thinking_delta') {
              sendEvent('content_block_delta', {
                index: event.index,
                delta: { type: 'thinking_delta', thinking: event.delta.thinking }
              })
            }
            break

          case 'content_block_stop':
            sendEvent('content_block_stop', { index: event.index })
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

    const anthropicTools = this.toolExecutor.getAnthropicTools() as Anthropic.Tool[]
    const openaiTools = anthropicTools.length > 0 ? anthropicTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    })) : undefined

    /**
     * 将 Anthropic 格式消息转换为 OpenAI/Qwen 兼容格式
     * 处理 tool_result、tool_use 和 image 等特殊格式
     */
    const convertToOpenAIMessages = async (msgs: any[]): Promise<Array<any>> => {
      const result: Array<any> = []
      
      for (const m of msgs) {
        const content = m.content
        const role = m.role
        
        // 处理 tool_result 消息（Anthropic 格式 → OpenAI 格式）
        if (Array.isArray(content) && content.length > 0 && 
            content[0]?.type === 'tool_result') {
          for (const block of content) {
            if (block.type === 'tool_result') {
              result.push({
                role: 'tool',
                tool_call_id: block.tool_use_id,
                content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content || ''),
              })
            }
          }
          continue
        }
        
        // 处理 assistant 消息（可能包含 tool_use 块）
        if (role === 'assistant' && Array.isArray(content)) {
          let textContent = ''
          const toolCallsFromContent: Array<any> = []
          
          for (const block of content) {
            if (typeof block === 'string') {
              textContent += block
            } else if (block?.type === 'text') {
              textContent += block.text || ''
            } else if (block?.type === 'tool_use') {
              toolCallsFromContent.push({
                id: block.id,
                type: 'function',
                function: {
                  name: block.name,
                  arguments: JSON.stringify(block.input || {}),
                },
              })
            }
          }
          
          result.push({
            role: 'assistant',
            content: textContent || null,
            ...(toolCallsFromContent.length > 0 ? { tool_calls: toolCallsFromContent } : {}),
          })
          continue
        }
        
        // 处理包含图片的用户消息
        if (role === 'user' && Array.isArray(content)) {
          const parts: any[] = []
          for (const block of content) {
            if (block?.type === 'text') {
              parts.push({ type: 'text', text: stripIdeUserDisplayLayer(block.text || '') })
            } else if (block?.type === 'image') {
              try {
                const imageBlock = block as ImageContentBlock
                const resolved = await imageStorageService.resolveImageForOpenAI(imageBlock)
                parts.push(resolved)
              } catch (e) {
                console.warn(`[${sessionId}] 解析图片失败:`, e)
                parts.push({ type: 'text', text: '[图片加载失败]' })
              }
            }
          }
          result.push({ role: 'user', content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts })
          continue
        }
        
        // 处理普通 user 消息
        if (role === 'user' && typeof content === 'string') {
          result.push({ role: 'user', content: stripIdeUserDisplayLayer(content) })
          continue
        }
        
        // 默认处理
        result.push({
          role,
          content: typeof content === 'string' ? content : (Array.isArray(content) && content.length > 0 
            ? content.find(b => b.type === 'text')?.text || '' 
            : ''),
        })
      }
      
      return result
    }

    // 构建 OpenAI/Qwen 格式的消息列表
    const openaiMessages: Array<any> = [
      { role: 'system', content: systemPrompt },
      ...await convertToOpenAIMessages(messages),
    ]

    // 调试日志：打印实际传递给 LLM 的用户消息
    console.log(`[${sessionId}] === 传递给 LLM 的消息 ===`)
    for (let i = 0; i < openaiMessages.length; i++) {
      const msg = openaiMessages[i]
      if (msg.role === 'user') {
        console.log(`[${sessionId}]   [${i}] USER: "${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}"`)
      } else if (msg.role === 'assistant') {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        console.log(`[${sessionId}]   [${i}] ASSISTANT: "${content.substring(0, 100)}..."`)
      } else {
        console.log(`[${sessionId}]   [${i}] ${msg.role}`)
      }
    }
    console.log(`[${sessionId}] === 共 ${openaiMessages.length} 条消息 ===`)

    try {
      // 创建 AbortController 用于取消请求
      const abortController = new AbortController()
      if (signal) {
        signal.addEventListener('abort', () => abortController.abort(), { once: true })
      }

      const requestParams: Record<string, unknown> = {
        model,
        messages: openaiMessages,
        tools: openaiTools,
        max_tokens: 4096,
        temperature: 0.7,
        stream: true,
        stream_options: { include_usage: true },
      }

      if (!openaiTools) {
        requestParams.tool_choice = 'none'
      }

      const stream = await client.chat.completions.create(
        requestParams as any,
        { signal: abortController.signal }
      )

      let finishReason = ''

      for await (const chunk of stream) {
        if (signal?.aborted) break

        const delta = chunk.choices[0]?.delta

        // 处理文本内容
        if (delta?.content) {
          assistantText += delta.content
          sendEvent('message_delta', { delta: delta.content })
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

        let result: { success: boolean; result?: unknown; error?: string }

        if (shouldExecuteOnWorker(tool.name) && currentUserId) {
          console.log(`[${sessionId}] 危险工具 ${tool.name} 通过 Worker 容器执行 (userId=${currentUserId})`)
          const toolRegistry = getToolRegistry()
          const registryResult = await Promise.race([
            toolRegistry.executeTool({
              toolName: tool.name,
              toolInput: tool.input,
              sessionId,
              userId: currentUserId,
            }),
            timeoutPromise
          ]) as { success: boolean; result?: unknown; error?: string; output?: string }
          result = {
            success: registryResult.success,
            result: registryResult.result ?? registryResult.output,
            error: registryResult.error,
          }
        } else {
          result = await Promise.race([
            this.toolExecutor.execute(tool.name, tool.input, sendEvent, tool.id),
            timeoutPromise
          ]) as { success: boolean; result?: unknown; error?: string }
        }

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
          success: result.success,
          result: result.result,
          duration,
        })

        // 如果是文件操作工具，发送文件变更事件通知前端刷新文件树
        const fileOperationTools = ['FileWrite', 'FileEdit', 'Bash']
        if (fileOperationTools.includes(tool.name)) {
          sendEvent('workdir_changed', {
            sessionId,
            toolName: tool.name,
            timestamp: new Date().toISOString(),
          })
          console.log(`[${sessionId}] 文件操作工具执行完成，已发送 workdir_changed 事件`)
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
   * 解析消息中的图片 URL 引用为 Anthropic base64 格式
   */
  private async resolveMessagesForAnthropic(messages: any[]): Promise<any[]> {
    const resolved = []
    for (const m of messages) {
      const content = m.content

      if (!Array.isArray(content)) {
        resolved.push(m)
        continue
      }

      const resolvedBlocks: any[] = []
      for (const block of content) {
        if (block?.type === 'image' && block.source?.type === 'url') {
          try {
            const imageBlock = block as ImageContentBlock
            const resolvedBlock = await imageStorageService.resolveImageForAnthropic(imageBlock)
            resolvedBlocks.push(resolvedBlock)
          } catch (e) {
            console.warn('[SessionConversationManager] 解析图片失败:', e)
            resolvedBlocks.push({ type: 'text', text: '[图片加载失败]' })
          }
        } else {
          resolvedBlocks.push(block)
        }
      }

      resolved.push({ ...m, content: resolvedBlocks })
    }
    return resolved
  }

  /**
   * 分类错误类型
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