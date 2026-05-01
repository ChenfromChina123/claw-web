/**
 * Agent 系统桥接 - 将 src Agent 集成到 server
 * 
 * 这个模块桥接了 Claude Code HAHA 的 Agent 执行系统
 */

import { v4 as uuidv4 } from 'uuid'
import type { WebSocketData } from '../index'
import { llmService, type ChatMessage, type ToolDefinition } from '../services/llmService'
import { getToolRegistry } from '../integrations/toolRegistry'
import { AGENT_DEFAULTS } from '../../shared/constants'
import { truncateToolResult, TOOL_RESULT_LIMITS } from '../utils/fileLimits'

// Agent 消息类型
export interface AgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: AgentToolCall[]
}

export interface AgentToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  output?: unknown
  status: 'pending' | 'completed' | 'error'
}

// Agent 配置
export interface AgentConfig {
  model: string
  maxTokens: number
  temperature: number
  systemPrompt?: string
}

// Agent 执行结果
export interface AgentResult {
  message: string
  toolCalls: AgentToolCall[]
  finishReason: 'stop' | 'tool_use' | 'max_tokens' | 'error'
}

// WebSocket 事件发送函数类型
export type EventSender = (event: string, data: unknown) => void

/**
 * Web Agent 运行器 - 桥接到 src Agent 系统
 */
export class WebAgentRunner {
  private projectRoot: string
  private abortController?: AbortController
  
  constructor() {
    this.projectRoot = this.getProjectRoot()
  }
  
  private getProjectRoot(): string {
    const currentDir = process.cwd()
    return currentDir.replace(/\\server\\src$/i, '').replace(/\/server\/src$/, '')
  }

  /**
   * 中断当前正在执行的 Agent
   */
  interrupt(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = undefined
    }
  }

  /**
   * 处理用户消息并生成 Agent 响应
   */
  async processMessage(
    messages: AgentMessage[],
    config: AgentConfig,
    toolExecutor: {
      executeTool: (name: string, input: Record<string, unknown>, sendEvent?: EventSender) => Promise<{ success: boolean; result?: unknown; error?: string }>
    },
    sendEvent: EventSender
  ): Promise<AgentResult> {
    const result: AgentResult = {
      message: '',
      toolCalls: [],
      finishReason: 'stop',
    }
    
    sendEvent('agent_thinking', { status: 'processing' })
    
    // 创建新的 AbortController 用于本次请求
    this.abortController = new AbortController()
    
    try {
      // 获取工具注册表
      const toolRegistry = getToolRegistry()
      const allTools = toolRegistry.getAllTools()
      
      // 转换工具格式
      const tools: ToolDefinition[] = allTools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        input_schema: tool.inputSchema as ToolDefinition['input_schema'],
      }))
      
      // 准备消息格式
      const chatMessages: ChatMessage[] = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }))
      
      // 调用真实的 LLM 服务
      console.log(`[WebAgentRunner] 调用 LLM: ${config.model}, 消息数: ${chatMessages.length}`)
      
      const response = await llmService.chat(
        chatMessages,
        {
          model: config.model,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
          systemPrompt: config.systemPrompt,
        },
        tools,
        this.abortController.signal
      )
      
      // 解析响应
      result.message = response.content
      
      if (response.toolCalls && response.toolCalls.length > 0) {
        result.finishReason = 'tool_use'
        result.toolCalls = response.toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          input: tc.input,
          status: 'pending' as const,
        }))
        
        sendEvent('agent_thinking', { status: 'tool_use', toolCalls: result.toolCalls.map(tc => tc.name) })
        
        // 执行工具调用
        for (const toolCall of result.toolCalls) {
          sendEvent('tool_call', { id: toolCall.id, name: toolCall.name, input: toolCall.input })

          try {
            const toolResult = await toolExecutor.executeTool(
              toolCall.name,
              toolCall.input,
              sendEvent
            )

            toolCall.output = toolResult.result
            toolCall.status = toolResult.success ? 'completed' : 'error'

            sendEvent('tool_result', {
              id: toolCall.id,
              name: toolCall.name,
              success: toolResult.success,
              result: toolResult.result,
              error: toolResult.error,
            })
            
            // 将工具结果添加到消息列表继续对话
            const toolResultMessage: AgentMessage = {
              role: 'user',
              content: `工具 ${toolCall.name} 执行结果: ${safeStringifyToolResult(toolResult.success ? toolResult.result : toolResult.error)}`,
            }
            
            // 递归调用获取最终响应
            const followUpResult = await this.processMessage(
              [...messages, toolResultMessage],
              config,
              toolExecutor,
              sendEvent
            )
            
            result.message = followUpResult.message
            result.finishReason = followUpResult.finishReason
            result.toolCalls = followUpResult.toolCalls
            
          } catch (error) {
            toolCall.output = { error: error instanceof Error ? error.message : String(error) }
            toolCall.status = 'error'
            
            sendEvent('tool_error', {
              name: toolCall.name,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
      } else {
        result.finishReason = 'stop'
        sendEvent('agent_thinking', { status: 'completed' })
      }
      
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        result.message = '请求已被取消'
        result.finishReason = 'error'
        sendEvent('agent_interrupted', {})
      } else {
        console.error('[WebAgentRunner] LLM 调用失败:', error)
        result.message = `错误: ${error instanceof Error ? error.message : String(error)}`
        result.finishReason = 'error'
        sendEvent('agent_error', { error: result.message })
      }
    } finally {
      this.abortController = undefined
    }
    
    return result
  }
  
  /**
   * 获取可用的 Agent 模型
   */
  getAvailableModels(): Array<{ id: string; name: string; provider: string }> {
    return [
      { id: 'qwen-plus', name: '通义千问 Plus', provider: 'aliyun' },
      { id: 'qwen-turbo', name: '通义千问 Turbo', provider: 'aliyun' },
      { id: 'qwen-max', name: '通义千问 Max', provider: 'aliyun' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic' },
    ]
  }
  
  /**
   * 创建系统提示词
   */
  createSystemPrompt(userContext?: {
    username?: string
    workspace?: string
  }): string {
    const basePrompt = `你是一个智能 AI 助手，可以帮助用户完成各种任务。

你可以使用以下工具：
- Bash: 执行 Shell 命令
- FileRead: 读取文件
- FileWrite: 写入文件
- FileEdit: 编辑文件
- Glob: 文件搜索
- Grep: 内容搜索
- WebSearch: 网络搜索
- WebFetch: 网页抓取
- TodoWrite: 任务管理

当需要使用工具时，请按照以下格式：
{
  "type": "tool_use",
  "name": "工具名称",
  "input": { ... }
}

请始终用中文回复。`
    
    if (userContext?.username) {
      return `用户名称: ${userContext.username}\n\n${basePrompt}`
    }
    
    return basePrompt
  }
  
  /**
   * 执行 Agent 思考循环
   */
  async runAgentLoop(
    messages: AgentMessage[],
    config: AgentConfig,
    toolExecutor: {
      executeTool: (name: string, input: Record<string, unknown>, sendEvent?: EventSender) => Promise<{ success: boolean; result?: unknown; error?: string }>
    },
    sendEvent: EventSender,
    maxIterations: number = AGENT_DEFAULTS.MAX_ITERATIONS
  ): Promise<AgentResult> {
    const result: AgentResult = {
      message: '',
      toolCalls: [],
      finishReason: 'stop',
    }
    
    // 创建 AbortController
    const abortController = new AbortController()
    
    // 获取工具注册表
    const toolRegistry = getToolRegistry()
    const allTools = toolRegistry.getAllTools()
    
    // 转换工具格式
    const tools: ToolDefinition[] = allTools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.inputSchema as ToolDefinition['input_schema'],
    }))
    
    let iteration = 0
    let conversationMessages = [...messages]
    
    // 如果有系统提示，添加到消息开头
    if (config.systemPrompt) {
      conversationMessages = [
        { role: 'system' as const, content: config.systemPrompt },
        ...conversationMessages,
      ]
    }
    
    while (iteration < maxIterations) {
      iteration++
      sendEvent('agent_iteration', { iteration, maxIterations })
      
      try {
        // 调用真实的 LLM API
        const chatMessages: ChatMessage[] = conversationMessages.map(msg => ({
          role: msg.role,
          content: msg.content,
        }))
        
        console.log(`[WebAgentRunner.runAgentLoop] 第 ${iteration} 轮，调用 LLM`)
        
        const response = await llmService.chat(
          chatMessages,
          {
            model: config.model,
            maxTokens: config.maxTokens,
            temperature: config.temperature,
          },
          tools,
          abortController.signal
        )
        
        result.message = response.content
        result.finishReason = response.stopReason === 'tool_use' ? 'tool_use' : 'stop'
        
        // 如果有工具调用，执行它们
        if (response.toolCalls && response.toolCalls.length > 0) {
          result.toolCalls = response.toolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            input: tc.input,
            status: 'pending' as const,
          }))
          
          // 将助手消息添加到对话
          conversationMessages.push({
            role: 'assistant',
            content: response.content,
            toolCalls: result.toolCalls,
          })
          
          // 执行工具
          for (const toolCall of result.toolCalls) {
            sendEvent('tool_call', { id: toolCall.id, name: toolCall.name, input: toolCall.input })

            const toolResult = await toolExecutor.executeTool(
              toolCall.name,
              toolCall.input,
              sendEvent
            )

            toolCall.output = toolResult.success ? toolResult.result : toolResult.error
            toolCall.status = toolResult.success ? 'completed' : 'error'

            sendEvent('tool_result', {
              id: toolCall.id,
              name: toolCall.name,
              success: toolResult.success,
              result: toolResult.result,
              error: toolResult.error,
            })

            /**
             * 检测文件操作工具并发送 workdir_changed 事件
             * 解决 Agent 执行文件操作后前端不同步的问题
             */
            const fileOperationTools = ['FileWrite', 'FileEdit', 'Bash']
            if (toolResult.success && fileOperationTools.includes(toolCall.name)) {
              sendEvent('workdir_changed', {
                sessionId: config.sessionId || '',
                toolName: toolCall.name,
                timestamp: new Date().toISOString(),
              })
              console.log(`[WebAgentRunner] 文件操作工具 ${toolCall.name} 执行完成，已发送 workdir_changed 事件`)
            }

            // 将工具结果添加到对话
            conversationMessages.push({
              role: 'user',
              content: `工具 ${toolCall.name} 执行结果: ${safeStringifyToolResult(toolResult.success ? toolResult.result : { error: toolResult.error })}`,
            })
          }
          
          // 继续下一轮
          continue
        } else {
          // 没有工具调用，结束循环
          sendEvent('agent_completed', { message: result.message })
          break
        }
        
      } catch (error) {
        if ((error as any)?.name === 'AbortError') {
          result.message = '请求已被取消'
          result.finishReason = 'error'
          sendEvent('agent_interrupted', {})
          break
        }
        
        console.error(`[WebAgentRunner.runAgentLoop] 第 ${iteration} 轮错误:`, error)
        result.message = `执行错误: ${error instanceof Error ? error.message : String(error)}`
        result.finishReason = 'error'
        sendEvent('agent_error', { error: result.message })
        break
      }
    }
    
    if (iteration >= maxIterations) {
      result.message += '\n\n[达到最大迭代次数限制]'
      sendEvent('agent_max_iterations', { iterations: iteration })
    }
    
    return result
  }
}

export default WebAgentRunner

/**
 * 安全序列化工具结果，自动截断大内容防止 Token 超限
 */
function safeStringifyToolResult(data: unknown): string {
  if (data === undefined || data === null) return '(无结果)'
  if (typeof data === 'string') {
    if (data.length > TOOL_RESULT_LIMITS.MAX_CHARS) {
      return truncateToolResult(data, 'AgentRunner', TOOL_RESULT_LIMITS.MAX_CHARS).result
    }
    return data
  }
  const jsonStr = JSON.stringify(data)
  if (jsonStr.length > TOOL_RESULT_LIMITS.MAX_CHARS) {
    return truncateToolResult(jsonStr, 'AgentRunner', TOOL_RESULT_LIMITS.MAX_CHARS).result
  }
  return jsonStr
}
