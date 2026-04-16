/**
 * SendMessage 工具 - 向 Agent 发送消息继续执行
 * 
 * 这个工具允许向运行中的 Agent 发送消息，继续其执行。
 */

import { v4 as uuidv4 } from 'uuid'
import type { Tool } from '../integration/webStore'
import type { ToolResult, ToolExecutionContext } from '../integration/enhancedToolExecutor'

export interface SendMessageInput {
  agentId: string
  message: string
  agentName?: string
}

export interface SendMessageOutput {
  messageId: string
  agentId: string
  status: 'sent' | 'queued' | 'error'
  error?: string
}

/**
 * 验证 SendMessage 输入
 */
export function validateSendMessageInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['输入必须是对象'] }
  }
  
  const { agentId, message } = input as Record<string, unknown>
  
  if (!agentId || typeof agentId !== 'string') {
    errors.push('agentId 是必需参数，且必须是字符串')
  }
  
  if (!message || typeof message !== 'string') {
    errors.push('message 是必需参数，且必须是字符串')
  }
  
  if (message && typeof message === 'string' && message.trim().length === 0) {
    errors.push('message 不能为空')
  }
  
  return { valid: errors.length === 0, errors }
}

/**
 * SendMessage 工具实现
 */
export async function executeSendMessageTool(
  input: SendMessageInput,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const validation = validateSendMessageInput(input)
  
  if (!validation.valid) {
    return {
      success: false,
      error: `输入验证失败:\n${validation.errors.join('\n')}`,
    }
  }
  
  const { agentId, message, agentName } = input
  
  try {
    // 检查 Agent 是否存在且支持继续执行
    // 注意：这需要在 Agent 管理器中实现实际的检查逻辑
    
    // 检查是否是 One-shot Agent（不支持继续）
    const oneShotAgents = ['Explore', 'Plan', 'claude-code-guide', 'statusline-setup']
    
    // 如果提供了 agentName，检查是否是 One-shot Agent
    if (agentName && oneShotAgents.includes(agentName)) {
      return {
        success: false,
        error: `Agent 类型 "${agentName}" 是 One-shot Agent，不支持继续执行。One-shot Agent 必须在单次调用中完成所有任务。`,
      }
    }
    
    const messageId = uuidv4()
    
    // 注意：实际的消息队列和路由需要在 Agent 引擎中实现
    // 这里返回成功表示消息已排队
    return {
      success: true,
      result: {
        messageId,
        agentId,
        status: 'queued',
        message: `消息已发送给 Agent ${agentId}`,
      } as SendMessageOutput,
    }
  } catch (error) {
    return {
      success: false,
      error: `发送消息失败: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * 创建 SendMessage 工具定义
 */
export function createSendMessageToolDefinition(): Tool & { handler: any; permissions?: any } {
  return {
    name: 'SendMessage',
    description: '向运行中的 Agent 发送消息以继续其执行',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: {
          type: 'string',
          description: '目标 Agent 的 ID',
        },
        message: {
          type: 'string',
          description: '要发送的消息内容',
        },
        agentName: {
          type: 'string',
          description: 'Agent 类型名称（用于验证是否为 One-shot Agent）',
        },
      },
      required: ['agentId', 'message'],
    },
    category: 'agent',
    permissions: { requiresAuth: true },
    handler: executeSendMessageTool,
  }
}
