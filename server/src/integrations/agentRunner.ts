/**
 * Agent 系统桥接 - 将 src Agent 集成到 server
 * 
 * 这个模块桥接了 Claude Code HAHA 的 Agent 执行系统
 */

import { v4 as uuidv4 } from 'uuid'
import type { WebSocketData } from '../index'

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
  
  constructor() {
    this.projectRoot = this.getProjectRoot()
  }
  
  private getProjectRoot(): string {
    const currentDir = process.cwd()
    return currentDir.replace(/\\server\\src$/i, '').replace(/\/server\/src$/, '')
  }
  
  /**
   * 处理用户消息并生成 Agent 响应
   */
  async processMessage(
    messages: AgentMessage[],
    config: AgentConfig,
    toolExecutor: unknown,
    sendEvent: EventSender
  ): Promise<AgentResult> {
    const result: AgentResult = {
      message: '',
      toolCalls: [],
      finishReason: 'stop',
    }
    
    sendEvent('agent_thinking', { status: 'processing' })
    
    // 这里会调用实际的 AI API
    // 暂时返回模拟响应
    result.message = 'Agent response placeholder - 需要接入实际 AI API'
    result.finishReason = 'stop'
    
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
    maxIterations: number = 10
  ): Promise<AgentResult> {
    const result: AgentResult = {
      message: '',
      toolCalls: [],
      finishReason: 'stop',
    }
    
    let iteration = 0
    
    while (iteration < maxIterations) {
      iteration++
      sendEvent('agent_iteration', { iteration, maxIterations })
      
      // 调用 AI API 获取响应
      // 这里需要接入实际的 API
      
      // 模拟响应
      result.finishReason = 'stop'
      result.message = 'Response generated'
      
      break // 单次响应，暂不实现多轮工具调用
    }
    
    return result
  }
}

export default WebAgentRunner
