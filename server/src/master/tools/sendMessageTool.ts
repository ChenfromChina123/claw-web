/**
 * SendMessage 工具 - 向 Agent 发送消息继续执行
 *
 * 对齐 claw-web/src/tools/SendMessageTool/SendMessageTool.ts 设计：
 * - 使用 `to` 字段按名称路由（支持队友名称 + "*" 广播）
 * - 保留 `agentId` 字段按 ID 路由（向后兼容）
 * - 支持结构化消息（shutdown_request / plan_approval_response）
 * - 支持 `summary` 字段用于消息预览
 */

import { v4 as uuidv4 } from 'uuid'
import type { Tool } from '../integration/webStore'
import type { ToolResult, ToolExecutionContext } from '../integration/enhancedToolExecutor'

/**
 * 结构化消息类型
 */
export type StructuredMessage =
  | { type: 'shutdown_request'; reason?: string }
  | { type: 'shutdown_response'; request_id: string; approve: boolean; reason?: string }
  | { type: 'plan_approval_response'; request_id: string; approve: boolean; feedback?: string }

/**
 * SendMessage 输入接口
 * 对齐前端设计：to 字段为主路由方式，agentId 为向后兼容
 */
export interface SendMessageInput {
  /** 目标接收者：队友名称或 "*" 广播 */
  to?: string
  /** 消息内容（纯文本或结构化消息） */
  message: string | StructuredMessage
  /** 消息摘要（5-10 词预览） */
  summary?: string
  /** 目标 Agent ID（向后兼容，优先使用 to） */
  agentId?: string
  /** Agent 类型名称（用于验证是否为 One-shot Agent） */
  agentName?: string
}

/**
 * 消息路由信息
 */
export interface MessageRouting {
  method: 'name' | 'id' | 'broadcast'
  target: string
}

/**
 * SendMessage 输出接口
 */
export interface SendMessageOutput {
  messageId: string
  agentId?: string
  status: 'sent' | 'queued' | 'broadcast' | 'error'
  routing?: MessageRouting
  recipients?: string[]
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

  const record = input as Record<string, unknown>
  const { to, agentId, message } = record

  if (!to && !agentId) {
    errors.push('必须提供 to（名称路由）或 agentId（ID 路由）之一')
  }

  if (message === undefined || message === null) {
    errors.push('message 是必需参数')
  } else if (typeof message !== 'string' && typeof message !== 'object') {
    errors.push('message 必须是字符串或结构化消息对象')
  }

  if (typeof message === 'string' && message.trim().length === 0) {
    errors.push('message 不能为空')
  }

  if (typeof message === 'object' && message !== null) {
    const validTypes = ['shutdown_request', 'shutdown_response', 'plan_approval_response']
    const msgObj = message as Record<string, unknown>
    if (!msgObj.type || !validTypes.includes(msgObj.type as string)) {
      errors.push(`结构化消息的 type 必须是: ${validTypes.join(', ')}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 解析路由目标
 */
function resolveRouting(input: SendMessageInput): MessageRouting {
  if (input.to === '*') {
    return { method: 'broadcast', target: '*' }
  }
  if (input.to) {
    return { method: 'name', target: input.to }
  }
  if (input.agentId) {
    return { method: 'id', target: input.agentId }
  }
  return { method: 'name', target: '' }
}

/**
 * 格式化消息内容为字符串
 */
function formatMessageContent(message: string | StructuredMessage): string {
  if (typeof message === 'string') {
    return message
  }
  return JSON.stringify(message)
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

  const routing = resolveRouting(input)
  const messageContent = formatMessageContent(input.message)

  try {
    const oneShotAgents = ['Explore', 'Plan', 'claude-code-guide', 'statusline-setup']

    if (input.agentName && oneShotAgents.includes(input.agentName)) {
      return {
        success: false,
        error: `Agent 类型 "${input.agentName}" 是 One-shot Agent，不支持继续执行。One-shot Agent 必须在单次调用中完成所有任务。`,
      }
    }

    if (routing.method === 'name' && oneShotAgents.includes(routing.target)) {
      return {
        success: false,
        error: `Agent 类型 "${routing.target}" 是 One-shot Agent，不支持继续执行。`,
      }
    }

    const messageId = uuidv4()

    if (routing.method === 'broadcast') {
      return {
        success: true,
        result: {
          messageId,
          status: 'broadcast',
          routing,
          recipients: [],
          message: `广播消息已发送`,
        } as SendMessageOutput,
      }
    }

    return {
      success: true,
      result: {
        messageId,
        agentId: input.agentId || routing.target,
        status: 'queued',
        routing,
        message: `消息已发送给 ${routing.method === 'name' ? `Agent "${routing.target}"` : `Agent ${routing.target}`}`,
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
 * 对齐前端 Schema：to + message + summary
 */
export function createSendMessageToolDefinition(): Tool & { handler: any; permissions?: any } {
  return {
    name: 'SendMessage',
    description: '向运行中的 Agent 发送消息以继续其执行。使用 to 字段按名称路由（支持 "*" 广播），或使用 agentId 按 ID 路由。',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: '接收者：队友名称或 "*" 广播',
        },
        message: {
          type: 'string',
          description: '消息内容（纯文本或结构化消息 JSON）',
        },
        summary: {
          type: 'string',
          description: '5-10 词消息摘要，用于预览',
        },
        agentId: {
          type: 'string',
          description: '目标 Agent 的 ID（向后兼容，优先使用 to）',
        },
        agentName: {
          type: 'string',
          description: 'Agent 类型名称（用于验证是否为 One-shot Agent）',
        },
      },
      required: ['message'],
    },
    category: 'agent',
    permissions: { requiresAuth: true },
    handler: executeSendMessageTool,
  }
}
