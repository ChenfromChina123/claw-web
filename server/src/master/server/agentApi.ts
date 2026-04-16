/**
 * Agent 执行 API - Master 专用
 * 
 * 负责会话上下文管理和结果持久化
 * 
 * 架构说明：
 * - Master 加载会话上下文，构建 Agent 请求
 * - 调用 Worker 执行 Agent
 * - 流式转发响应给客户端
 * - 异步保存执行结果到数据库
 */

import { SessionManager, InMemorySession } from '../services/sessionManager'
import { getAgentTools } from '../tools'
import { getSchedulingPolicy } from '../orchestrator/schedulingPolicy'
import { getContainerOrchestrator } from '../orchestrator/containerOrchestrator'
import { SSEParser, type SSEParsedEvent } from './sseParser'
import { createSuccessResponse, createErrorResponse } from '../utils/response'
import type { Message, ToolCall } from '../models/types'

const sessionManager = SessionManager.getInstance()

/**
 * Agent 上下文
 */
export interface AgentContext {
  sessionId: string
  userId: string
  messages: Message[]
  tools: any[]
  quota: any
  systemPrompt: string
}

/**
 * Agent 执行结果
 */
export interface AgentExecutionResult {
  success: boolean
  error?: string
  sessionId?: string
  lastMessageId?: string
}

/**
 * 在 Worker 上执行 Agent - 流式版本
 * 
 * Master 负责：
 * 1. 加载会话上下文
 * 2. 构建 Agent 执行请求
 * 3. 调用 Worker API
 * 4. 流式转发响应
 * 5. 异步保存结果
 * 
 * @param workerUrl Worker 容器 URL
 * @param userId 用户ID
 * @param sessionId 会话ID
 * @param message 用户消息
 * @param sendEvent 发送事件到客户端的回调
 * @returns 执行结果
 */
export async function executeAgentOnWorker(
  workerUrl: string,
  userId: string,
  sessionId: string,
  message: string,
  sendEvent: (event: string, data: unknown) => void
): Promise<AgentExecutionResult> {
  
  const debug = process.env.DEBUG === 'agent'
  if (debug) {
    console.log(`[AgentAPI] 加载会话上下文: sessionId=${sessionId}`)
  }
  
  const sessionData = await sessionManager.loadSession(sessionId)
  if (!sessionData) {
    return { success: false, error: 'Session not found' }
  }

  // 验证用户权限
  if (sessionData.session.userId !== userId) {
    return { success: false, error: 'Access denied' }
  }

  // 2. 获取用户配额
  let quota = {}
  try {
    const { getQuotaService } = await import('../security/quotaService')
    const quotaService = getQuotaService()
    quota = await quotaService.getUserQuota(userId)
  } catch (error) {
    console.warn('[AgentAPI] 获取用户配额失败，使用默认配额:', error)
  }

  // 3. 构建 Agent 执行请求
  const requestBody = {
    userId,
    sessionId,
    message,
    context: {
      messages: sessionData.messages,
      tools: getAgentTools(),
      quota,
    },
    stream: true,
  }

  const debug = process.env.DEBUG === 'agent'
  if (debug) {
    console.log(`[AgentAPI] 调用 Worker 执行 Agent`)
  }
  
  const masterToken = process.env.MASTER_INTERNAL_TOKEN
  
  let response: Response
  try {
    response = await fetch(`${workerUrl}/api/internal/agent/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Token': masterToken || '',
        'X-User-Id': userId,
      },
      body: JSON.stringify(requestBody),
    })
  } catch (error) {
    console.error('[AgentAPI] Worker 请求失败:', error)
    return { success: false, error: `Worker error: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[AgentAPI] Worker 返回错误: ${response.status} - ${errorText}`)
    return { success: false, error: `Worker error: ${response.status}` }
  }

  // 5. 流式转发 - 使用 TransformStream 透明中转
  // 策略：Master 收到 Chunk 立即转发，不解析内容，不阻塞
  const stream = response.body!
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TransformStream({
      transform(chunk, controller) {
        // 收到一行，立刻转发，不解析内容
        controller.enqueue(chunk)
        
        // 同时发送给客户端
        sendEvent('stream', { chunk })
      }
    }))

  // 6. 创建 SSE 解析器用于异步保存
  const sseParser = new SSEParser()
  
  // 创建流式读取器来解析事件并异步保存
  const reader = stream.getReader()
  
  try {
    let lastMessageId: string | undefined
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const text = new TextDecoder().decode(value)
      
      // 解析 SSE 事件
      const events = sseParser.parse(text)
      
      for (const event of events) {
        // 发送事件到客户端
        sendEvent(event.type, event.data)
        
        // 异步保存（不阻塞）
        saveEventAsync(sessionId, event)
        
        // 记录最后的消息ID
        if (event.type === 'message' || event.type === 'message_complete') {
          if (event.data?.id) {
            lastMessageId = event.data.id
          }
        }
      }
    }
    
    return { success: true, sessionId, lastMessageId }
  } catch (error) {
    console.error('[AgentAPI] 流式处理异常:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Stream processing error' }
  } finally {
    reader.releaseLock()
  }
}

/**
 * 异步保存 SSE 事件 - Fire and Forget
 * 
 * 不阻塞流式输出
 */
async function saveEventAsync(sessionId: string, event: SSEParsedEvent): Promise<void> {
  // 使用 setImmediate 不阻塞事件循环
  setImmediate(async () => {
    try {
      if (event.type === 'tool_result') {
        await saveToolResultAsync(sessionId, event.data)
      } else if (event.type === 'message_complete') {
        await saveMessageAsync(sessionId, event.data)
      } else if (event.type === 'tool_call') {
        await saveToolCallAsync(sessionId, event.data)
      }
    } catch (error) {
      console.error('[AgentAPI] 异步保存失败:', error)
      // 保存失败不影响主流程
    }
  })
}

/**
 * 异步保存工具调用结果
 */
async function saveToolResultAsync(sessionId: string, toolResult: any): Promise<void> {
  try {
    if (toolResult && toolResult.toolUseId) {
      // 更新工具调用结果
      sessionManager.updateToolCall(
        sessionId,
        toolResult.id,
        toolResult.result || {},
        toolResult.error ? 'error' : 'completed'
      )
    }
  } catch (error) {
    console.error('[AgentAPI] 保存工具结果失败:', error)
  }
}

/**
 * 异步保存工具调用
 */
async function saveToolCallAsync(sessionId: string, toolCall: any): Promise<void> {
  try {
    if (toolCall && toolCall.id) {
      sessionManager.addToolCall(sessionId, toolCall)
    }
  } catch (error) {
    console.error('[AgentAPI] 保存工具调用失败:', error)
  }
}

/**
 * 异步保存消息
 */
async function saveMessageAsync(sessionId: string, messageData: any): Promise<void> {
  try {
    if (messageData && messageData.content) {
      // 添加消息到会话（会自动保存）
      sessionManager.addMessage(
        sessionId,
        messageData.role || 'assistant',
        messageData.content,
        messageData.toolCalls,
        messageData.id
      )
    }
  } catch (error) {
    console.error('[AgentAPI] 保存消息失败:', error)
  }
}

/**
 * 为 Agent 执行准备上下文
 * 
 * Master 专用方法，用于构建 Agent 执行所需的上下文
 */
export async function prepareAgentContext(
  sessionId: string,
  userId: string
): Promise<AgentContext | null> {
  // 加载会话
  const sessionData = await sessionManager.loadSession(sessionId)
  if (!sessionData) {
    console.error(`[AgentAPI] Session not found: ${sessionId}`)
    return null
  }

  // 验证权限
  if (sessionData.session.userId !== userId) {
    console.error(`[AgentAPI] Access denied: user ${userId} cannot access session ${sessionId}`)
    return null
  }

  // 获取用户配额
  let quota = {}
  try {
    const { getQuotaService } = await import('../security/quotaService')
    const quotaService = getQuotaService()
    quota = await quotaService.getUserQuota(userId)
  } catch (error) {
    console.warn('[AgentAPI] 获取用户配额失败:', error)
  }

  // 获取可用工具
  const tools = getAgentTools()

  // 构建系统提示词
  const systemPrompt = buildSystemPrompt(quota)

  return {
    sessionId,
    userId,
    messages: sessionData.messages,
    tools,
    quota,
    systemPrompt,
  }
}

/**
 * 保存 Agent 执行结果
 * 
 * Master 专用方法，用于保存 Agent 执行的结果
 */
export async function saveAgentResult(
  sessionId: string,
  userMessage: Message,
  assistantMessage: Message,
  toolCalls: ToolCall[]
): Promise<void> {
  try {
    // 添加用户消息
    sessionManager.addMessage(
      sessionId,
      'user',
      userMessage.content,
      undefined,
      userMessage.id
    )

    // 添加助手消息
    sessionManager.addMessage(
      sessionId,
      'assistant',
      assistantMessage.content,
      toolCalls,
      assistantMessage.id
    )

    // 添加工具调用
    for (const toolCall of toolCalls) {
      sessionManager.addToolCall(sessionId, toolCall)
    }

    console.log(`[AgentAPI] 保存执行结果: session=${sessionId}, messages=${2 + toolCalls.length}`)
  } catch (error) {
    console.error('[AgentAPI] 保存执行结果失败:', error)
    throw error
  }
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(quota: any): string {
  // TODO: 根据用户配额构建系统提示词
  return `你是一个智能助手，可以帮助用户完成各种任务。
  
当前可用工具：
- 文件操作：读取、写入、创建、删除文件
- 终端操作：执行命令
- 搜索：搜索文件和内容
- 网络操作：发送 HTTP 请求

请根据用户的需求，合理使用工具来完成任务。
`
}

/**
 * 使用 pipeThrough 实现透明中转
 * 
 * 策略：Master 收到 Worker 的 SSE 流，直接转发给客户端
 * 不等待 JSON 解析，不阻塞
 */
export function createStreamProxy(
  workerResponse: Response,
  sendToClient: (chunk: string) => void
): ReadableStream {
  return workerResponse.body!
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TransformStream({
      transform(chunk, controller) {
        const text = chunk as string
        // 立即转发
        sendToClient(text)
        controller.enqueue(chunk)
      }
    }))
}