/**
 * LLM 服务模块
 * 
 * 统一封装多种 LLM 提供商的调用接口：
 * - Anthropic (Claude)
 * - 阿里云通义千问 (Qwen) - 通过 OpenAI 兼容接口
 * 
 * 支持：
 * - 流式/非流式响应
 * - 工具调用 (function calling / tool use)
 * - 多轮对话上下文
 * - 中断/取消支持
 */

import Anthropic from '@anthropic-ai/sdk'

// ==================== 类型定义 ====================

/**
 * LLM 提供商类型
 */
export type LLMProvider = 'anthropic' | 'qwen' | 'openai'

/**
 * LLM 配置选项
 */
export interface LLMConfig {
  /** 提供商 */
  provider: LLMProvider
  /** 模型名称 */
  model: string
  /** API 密钥 */
  apiKey?: string
  /** 自定义 Base URL */
  baseURL?: string
  /** 最大生成 token 数 */
  maxTokens?: number
  /** 温度参数 (0-1) */
  temperature?: number
  /** Top P 参数 */
  topP?: number
  /** 系统提示词 */
  systemPrompt?: string
}

/**
 * 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant'

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: MessageRole
  content: string | ContentBlock[]
}

/**
 * 内容块类型（支持多模态和工具调用）
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }

/**
 * 工具定义（Anthropic 格式）
 */
export interface ToolDefinition {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/**
 * LLM 响应结果
 */
export interface LLMResponse {
  /** 文本内容 */
  content: string
  /** 工具调用列表 */
  toolCalls?: Array<{
    id: string
    name: string
    input: Record<string, unknown>
  }>
  /** 停止原因 */
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | 'error'
  /** 使用的 token 数 */
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

/**
 * 流式响应块
 */
export interface StreamChunk {
  type: 'text' | 'tool_use' | 'done' | 'error'
  content?: string
  toolCall?: {
    id: string
    name: string
    input: Record<string, unknown>
  }
  error?: string
  isFinal?: boolean
}

// ==================== LLM 服务类 ====================

class LLMService {
  private anthropicClient: Anthropic | null = null
  private openAIClient: any = null // 动态导入 openai
  private defaultConfig: LLMConfig

  constructor(defaultConfig?: Partial<LLMConfig>) {
    // 先检测提供商
    const detectedProvider = this.detectProvider()
    
    // 再根据提供商检测模型（避免循环依赖）
    const detectedModel = this.detectModelByProvider(detectedProvider)
    
    // 最后合并配置
    this.defaultConfig = {
      provider: detectedProvider,
      model: detectedModel,
      maxTokens: 4096,
      temperature: 0.7,
      ...defaultConfig,
    }
  }

  /**
   * 自动检测 LLM 提供商
   */
  private detectProvider(): LLMProvider {
    if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
    if (process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY) return 'qwen'
    console.warn('[LLMService] 未检测到 API Key，默认使用 anthropic')
    return 'anthropic'
  }

  /**
   * 根据提供商自动检测模型名称
   */
  private detectModelByProvider(provider: LLMProvider): string {
    const envModel = process.env.LLM_MODEL || process.env.ANTHROPIC_MODEL || process.env.QWEN_MODEL
    if (envModel) return envModel
    
    // 根据提供商返回默认模型
    switch (provider) {
      case 'anthropic':
        return 'claude-sonnet-4-20250514'
      case 'qwen':
        return 'qwen-plus'
      default:
        return 'claude-sonnet-4-20250514'
    }
  }

  /**
   * 获取或创建 Anthropic 客户端
   */
  private getAnthropicClient(): Anthropic {
    if (!this.anthropicClient) {
      const options: ConstructorParameters<typeof Anthropic>[0] = {
        timeout: parseInt(process.env.API_TIMEOUT_MS || String(300000), 10),
        maxRetries: 2,
      }

      if (process.env.ANTHROPIC_API_KEY) options.apiKey = process.env.ANTHROPIC_API_KEY
      if (process.env.ANTHROPIC_AUTH_TOKEN) options.authToken = process.env.ANTHROPIC_AUTH_TOKEN
      if (process.env.ANTHROPIC_BASE_URL) options.baseURL = process.env.ANTHROPIC_BASE_URL

      this.anthropicClient = new Anthropic(options)
      console.log('[LLMService] Anthropic 客户端已初始化')
    }
    return this.anthropicClient
  }

  /**
   * 获取或创建 OpenAI 兼容客户端（用于通义千问等）
   */
  private async getOpenAIClient() {
    if (!this.openAIClient) {
      try {
        const { default: OpenAI } = await import('openai')
        
        const apiKey = process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY
        const baseURL = process.env.QWEN_BASE_URL || process.env.OPENAI_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'

        this.openAIClient = new OpenAI({
          apiKey,
          baseURL,
          timeout: parseInt(process.env.API_TIMEOUT_MS || String(300000), 10),
        })
        
        console.log(`[LLMService] OpenAI 兼容客户端已初始化 (${baseURL})`)
      } catch (error) {
        console.error('[LLMService] 初始化 OpenAI 客户端失败:', error)
        throw new Error('需要安装 openai 包: npm install openai')
      }
    }
    return this.openAIClient
  }

  // ==================== 公共 API ====================

  /**
   * 发送聊天请求（非流式）
   * @param messages 消息历史
   * @param config 可选配置覆盖
   * @param tools 可用的工具定义列表
   * @param abortSignal 中断信号
   * @returns LLM 响应
   */
  async chat(
    messages: ChatMessage[],
    config?: Partial<LLMConfig>,
    tools?: ToolDefinition[],
    abortSignal?: AbortSignal
  ): Promise<LLMResponse> {
    const finalConfig = { ...this.defaultConfig, ...config }

    // 检查中断信号
    if (abortSignal?.aborted) {
      throw new DOMException('Request was cancelled', 'AbortError')
    }

    console.log(`[LLMService] 调用 ${finalConfig.provider}/${finalConfig.model}，消息数: ${messages.length}`)

    switch (finalConfig.provider) {
      case 'anthropic':
        return await this.chatAnthropic(messages, finalConfig, tools, abortSignal)
      case 'qwen':
      case 'openai':
        return await this.chatOpenAI(messages, finalConfig, tools, abortSignal)
      default:
        throw new Error(`不支持的 LLM 提供商: ${finalConfig.provider}`)
    }
  }

  /**
   * 发送流式聊天请求
   * @param messages 消息历史
   * @param config 可选配置覆盖
   * @param tools 可用的工具定义列表
   * @param abortSignal 中断信号
   * @returns 异步生成器，产出流式块
   */
  async *chatStream(
    messages: ChatMessage[],
    config?: Partial<LLMConfig>,
    tools?: ToolDefinition[],
    abortSignal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    const finalConfig = { ...this.defaultConfig, ...config }

    if (abortSignal?.aborted) {
      yield { type: 'error', error: 'Request was cancelled' }
      return
    }

    console.log(`[LLMService] 流式调用 ${finalConfig.provider}/${finalConfig.model}`)

    switch (finalConfig.provider) {
      case 'anthropic':
        yield* this.streamAnthropic(messages, finalConfig, tools, abortSignal)
        break
      case 'qwen':
      case 'openai':
        yield* this.streamOpenAI(messages, finalConfig, tools, abortSignal)
        break
      default:
        yield { type: 'error', error: `不支持的 LLM 提供商: ${finalConfig.provider}` }
    }
  }

  // ==================== Anthropic 实现 ====================

  /**
   * Anthropic 非流式调用
   */
  private async chatAnthropic(
    messages: ChatMessage[],
    config: LLMConfig,
    tools?: ToolDefinition[],
    abortSignal?: AbortSignal
  ): Promise<LLMResponse> {
    try {
      const client = this.getAnthropicClient()

      // 分离系统消息和对话消息
      let systemPrompt = config.systemPrompt || ''
      const chatMessages: Array<{ role: 'user' | 'assistant'; content: any[] }> = []

      for (const msg of messages) {
        if (msg.role === 'system') {
          systemPrompt += (systemPrompt ? '\n\n' : '') + (typeof msg.content === 'string' ? msg.content : '')
        } else {
          chatMessages.push({
            role: msg.role as 'user' | 'assistant',
            content: this.formatContentForAnthropic(msg.content),
          })
        }
      }

      // 如果没有用户消息，添加一个空消息
      if (chatMessages.length === 0) {
        chatMessages.push({ role: 'user', content: '请开始' })
      }

      const response = await client.messages.create(
        {
          model: config.model,
          max_tokens: config.maxTokens || 4096,
          temperature: config.temperature,
          system: systemPrompt || undefined,
          messages: chatMessages,
          tools: tools?.length ? tools as any : undefined,
        },
        { signal: abortSignal }
      )

      // 解析响应
      const contentBlocks = response.content
      let textContent = ''
      const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

      for (const block of contentBlocks) {
        if (block.type === 'text') {
          textContent += (block as any).text
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: (block as any).id,
            name: (block as any).name,
            input: (block as any).input,
          })
        }
      }

      return {
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        stopReason: response.stop_reason as any,
        usage: response.usage ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        } : undefined,
      }
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        throw new DOMException('Request was cancelled', 'AbortError')
      }
      console.error('[LLMService] Anthropic API 调用失败:', error)
      throw new Error(`LLM 调用失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Anthropic 流式调用
   */
  private async *streamAnthropic(
    messages: ChatMessage[],
    config: LLMConfig,
    tools?: ToolDefinition[],
    abortSignal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    try {
      const client = this.getAnthropicClient()

      let systemPrompt = config.systemPrompt || ''
      const chatMessages: Array<{ role: 'user' | 'assistant'; content: any[] }> = []

      for (const msg of messages) {
        if (msg.role === 'system') {
          systemPrompt += (systemPrompt ? '\n\n' : '') + (typeof msg.content === 'string' ? msg.content : '')
        } else {
          chatMessages.push({
            role: msg.role as 'user' | 'assistant',
            content: this.formatContentForAnthropic(msg.content),
          })
        }
      }

      if (chatMessages.length === 0) {
        chatMessages.push({ role: 'user', content: '请开始' })
      }

      const stream = client.messages.stream(
        {
          model: config.model,
          max_tokens: config.maxTokens || 4096,
          temperature: config.temperature,
          system: systemPrompt || undefined,
          messages: chatMessages,
          tools: tools?.length ? tools as any : undefined,
        },
        { signal: abortSignal }
      )

      // 监听文本增量
      stream.on('text', (text: string) => {
        // 这里不能 yield，需要在异步迭代器中处理
      })

      // 最终消息
      const message = await stream.finalMessage()

      let textContent = ''
      const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

      for (const block of message.content) {
        if (block.type === 'text') {
          textContent += (block as any).text
          yield { type: 'text', content: (block as any).text }
        } else if (block.type === 'tool_use') {
          const toolCall = {
            id: (block as any).id,
            name: (block as any).name,
            input: (block as any).input,
          }
          toolCalls.push(toolCall)
          yield { type: 'tool_use', toolCall }
        }
      }

      yield {
        type: 'done',
        content: textContent,
        isFinal: true,
      }

    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        yield { type: 'error', error: 'Request was cancelled' }
        return
      }
      console.error('[LLMService] Anthropic 流式调用失败:', error)
      yield { type: 'error', error: error instanceof Error ? error.message : String(error) }
    }
  }

  // ==================== OpenAI/Qwen 实现 ====================

  /**
   * OpenAI 兼容接口非流式调用
   */
  private async chatOpenAI(
    messages: ChatMessage[],
    config: LLMConfig,
    tools?: ToolDefinition[],
    abortSignal?: AbortSignal
  ): Promise<LLMResponse> {
    try {
      const client = await this.getOpenAIClient()

      // 格式化消息为 OpenAI 格式
      const formattedMessages = this.formatMessagesForOpenAI(messages, config.systemPrompt)

      // 如果没有用户消息，添加一个空消息
      if (!formattedMessages.some(m => m.role === 'user')) {
        formattedMessages.push({ role: 'user', content: '请开始' })
      }

      // 转换工具格式
      const openAITools = tools?.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      }))

      const response = await client.chat.completions.create(
        {
          model: config.model,
          messages: formattedMessages as any,
          max_tokens: config.maxTokens || 4096,
          temperature: config.temperature,
          tools: openAITools,
        },
        { signal: abortSignal as any }
      )

      const choice = response.choices[0]
      const message = choice.message

      // 解析工具调用
      const toolCalls = message.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      })) || []

      return {
        content: message.content || '',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        stopReason: this.mapStopReason(choice.finish_reason),
        usage: response.usage ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        } : undefined,
      }
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        throw new DOMException('Request was cancelled', 'AbortError')
      }
      console.error('[LLMService] OpenAI API 调用失败:', error)
      throw new Error(`LLM 调用失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * OpenAI 兼容接口流式调用
   */
  private async *streamOpenAI(
    messages: ChatMessage[],
    config: LLMConfig,
    tools?: ToolDefinition[],
    abortSignal?: AbortSignal
  ): AsyncGenerator<StreamChunk> {
    try {
      const client = await this.getOpenAIClient()

      const formattedMessages = this.formatMessagesForOpenAI(messages, config.systemPrompt)

      if (!formattedMessages.some(m => m.role === 'user')) {
        formattedMessages.push({ role: 'user', content: '请开始' })
      }

      const openAITools = tools?.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      }))

      const stream = await client.chat.completions.create(
        {
          model: config.model,
          messages: formattedMessages as any,
          max_tokens: config.maxTokens || 4096,
          temperature: config.temperature,
          tools: openAITools,
          stream: true,
        },
        { signal: abortSignal as any }
      )

      let fullContent = ''
      const toolCalls: any[] = []
      const toolCallMap: Map<number, any> = new Map()

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta

        if (delta?.content) {
          fullContent += delta.content
          yield { type: 'text', content: delta.content }
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!toolCallMap.has(tc.index)) {
                const newTC = { id: tc.id || '', name: '', arguments: '' }
                toolCallMap.set(tc.index, newTC)
                toolCalls.push(newTC)
              }
              const existingTC = toolCallMap.get(tc.index)!
              if (tc.id) existingTC.id = tc.id
              if (tc.function?.name) existingTC.name += tc.function.name
              if (tc.function?.arguments) existingTC.arguments += tc.function.arguments
            }
          }
        }
      }

      // 输出完整的工具调用
      for (const tc of toolCalls) {
        yield {
          type: 'tool_use',
          toolCall: {
            id: tc.id,
            name: tc.name,
            input: JSON.parse(tc.arguments || '{}'),
          },
        }
      }

      yield {
        type: 'done',
        content: fullContent,
        isFinal: true,
      }

    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        yield { type: 'error', error: 'Request was cancelled' }
        return
      }
      console.error('[LLMService] OpenAI 流式调用失败:', error)
      yield { type: 'error', error: error instanceof Error ? error.message : String(error) }
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 格式化内容为 Anthropic API 格式
   */
  private formatContentForAnthropic(content: string | ContentBlock[]): any[] {
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }]
    }

    return content.map(block => {
      switch (block.type) {
        case 'text':
          return { type: 'text', text: block.text }
        case 'tool_use':
          return block
        case 'tool_result':
          return block
        case 'image':
          return block
        default:
          return { type: 'text', text: JSON.stringify(block) }
      }
    })
  }

  /**
   * 格式化消息为 OpenAI API 格式
   */
  private formatMessagesForOpenAI(
    messages: ChatMessage[],
    systemPrompt?: string
  ): Array<{ role: string; content: any }> {
    const result: Array<{ role: string; content: any }> = []

    // 添加系统消息
    if (systemPrompt) {
      result.push({ role: 'system', content: systemPrompt })
    }

    for (const msg of messages) {
      if (msg.role === 'system') continue // 已在上面处理

      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content })
      } else {
        // 复杂内容（包含工具调用等）
        const parts: any[] = []
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ type: 'text', text: block.text })
          } else if (block.type === 'tool_use') {
            parts.push({
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input,
            })
          } else if (block.type === 'tool_result') {
            parts.push({
              type: 'tool_result',
              tool_use_id: block.tool_use_id,
              content: block.content,
            })
          }
        }
        result.push({ role: msg.role, content: parts.length === 1 ? parts[0].text : parts })
      }
    }

    return result
  }

  /**
   * 映射停止原因
   */
  private mapStopReason(finishReason: string): LLMResponse['stopReason'] {
    switch (finishReason) {
      case 'stop':
        return 'end_turn'
      case 'tool_calls':
      case 'function_call':
        return 'tool_use'
      case 'length':
        return 'max_tokens'
      default:
        return 'end_turn'
    }
  }

  /**
   * 测试连接
   */
  async testConnection(config?: Partial<LLMConfig>): Promise<boolean> {
    try {
      const testConfig = { ...this.defaultConfig, ...config }
      
      const response = await this.chat(
        [{ role: 'user', content: 'Hi' }],
        { ...testConfig, maxTokens: 10 }
      )
      
      console.log(`[LLMService] 连接测试成功: ${testConfig.provider}/${testConfig.model}`)
      return true
    } catch (error) {
      console.error('[LLMService] 连接测试失败:', error)
      return false
    }
  }

  /**
   * 获取可用模型列表
   */
  getAvailableModels(): Array<{ id: string; name: string; provider: LLMProvider }> {
    return [
      // Anthropic 模型
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic' },
      // 通义千问模型
      { id: 'qwen-plus', name: '通义千问 Plus', provider: 'qwen' },
      { id: 'qwen-turbo', name: '通义千问 Turbo', provider: 'qwen' },
      { id: 'qwen-max', name: '通义千问 Max', provider: 'qwen' },
      { id: 'qwen-long', name: '通义千问 Long', provider: 'qwen' },
    ]
  }
}

// ==================== 单例导出 ====================

/** 全局 LLM 服务实例 */
export const llmService = new LLMService()

export default LLMService
