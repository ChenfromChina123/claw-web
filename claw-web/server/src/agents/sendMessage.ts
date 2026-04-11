/**
 * SendMessage - 向 Agent 发送消息继续执行
 * 
 * 阶段四: 多 Agent 协作 (4.2 SendMessage 机制)
 * 
 * 功能:
 * - 向运行中的 Agent 发送消息
 * - 按 Agent ID 或团队成员名称路由
 * - One-shot Agent 排除
 * - 消息队列集成
 */

import type { AgentRuntimeState } from './agentRegistry'
import { AgentRegistry } from './agentRegistry'
import { MailboxManager } from './mailbox'
import { TeamManager } from './teamManager'

/**
 * SendMessage 选项
 */
export interface SendMessageOptions {
  /** 目标 Agent ID */
  agentId?: string
  /** 团队名称 */
  teamName?: string
  /** 团队成员名称 */
  memberName?: string
  /** 消息内容 */
  message: string
  /** 来源 Agent ID */
  fromAgentId?: string
}

/**
 * SendMessage 结果
 */
export interface SendMessageResult {
  success: boolean
  messageId?: string
  status?: 'sent' | 'queued' | 'error'
  error?: string
  agentId?: string
  isOneShot?: boolean
}

/**
 * SendMessage 错误类型
 */
export enum SendMessageErrorType {
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  ONE_SHOT_AGENT = 'ONE_SHOT_AGENT',
  AGENT_COMPLETED = 'AGENT_COMPLETED',
  TEAM_NOT_FOUND = 'TEAM_NOT_FOUND',
  MEMBER_NOT_FOUND = 'MEMBER_NOT_FOUND',
  EMPTY_MESSAGE = 'EMPTY_MESSAGE',
}

/**
 * One-shot Agent 列表
 */
export const ONE_SHOT_AGENTS = ['Explore', 'Plan', 'claude-code-guide', 'statusline-setup'] as const

/**
 * 检查是否是 One-shot Agent
 */
export function isOneShotAgent(agentType: string): boolean {
  return ONE_SHOT_AGENTS.includes(agentType as typeof ONE_SHOT_AGENTS[number])
}

/**
 * 获取 One-shot Agent 列表
 */
export function getOneShotAgents(): readonly string[] {
  return ONE_SHOT_AGENTS
}

/**
 * 发送消息到 Agent
 */
export async function sendMessage(options: SendMessageOptions): Promise<SendMessageResult> {
  const agentRegistry = AgentRegistry.getInstance()
  const mailboxManager = MailboxManager.getInstance()

  // 验证消息内容
  if (!options.message || options.message.trim().length === 0) {
    return {
      success: false,
      status: 'error',
      error: '消息内容不能为空',
    }
  }

  // 优先按 Agent ID 发送
  if (options.agentId) {
    return await sendToAgent(options.agentId, options.message, options.fromAgentId)
  }

  // 按团队成员名称发送
  if (options.teamName && options.memberName) {
    return await sendToTeamMember(options.teamName, options.memberName, options.message, options.fromAgentId)
  }

  return {
    success: false,
    status: 'error',
    error: '必须提供 agentId 或 (teamName + memberName)',
  }
}

/**
 * 向指定 Agent 发送消息
 */
async function sendToAgent(
  agentId: string,
  message: string,
  fromAgentId?: string
): Promise<SendMessageResult> {
  const agentRegistry = AgentRegistry.getInstance()
  const mailboxManager = MailboxManager.getInstance()

  // 检查 Agent 是否存在
  const agent = agentRegistry.getAgent(agentId)
  if (!agent) {
    return {
      success: false,
      status: 'error',
      error: `Agent ${agentId} 不存在`,
    }
  }

  // 检查是否是 One-shot Agent
  if (isOneShotAgent(agent.agentDefinition.agentType)) {
    return {
      success: false,
      status: 'error',
      error: `Agent 类型 "${agent.agentDefinition.agentType}" 是 One-shot Agent，不支持继续执行。One-shot Agent 必须在单次调用中完成所有任务。`,
      agentId,
      isOneShot: true,
    }
  }

  // 检查 Agent 状态
  if (agent.status === 'completed') {
    return {
      success: false,
      status: 'error',
      error: `Agent ${agentId} 已完成，无法继续执行`,
    }
  }

  if (agent.status === 'failed' || agent.status === 'cancelled') {
    return {
      success: false,
      status: 'error',
      error: `Agent ${agentId} 状态为 ${agent.status}，无法继续执行`,
    }
  }

  // 发送消息到邮件箱
  const deliveryResult = mailboxManager.send(agentId, {
    fromAgentId: fromAgentId || 'external',
    toAgentId: agentId,
    content: message,
  })

  if (deliveryResult.success) {
    // 添加消息到 Agent 历史
    agentRegistry.addMessage(agentId, {
      role: 'user',
      content: message,
      fromAgentId: fromAgentId,
    })

    return {
      success: true,
      messageId: deliveryResult.messageId,
      status: 'sent',
      agentId,
    }
  }

  return {
    success: false,
    status: deliveryResult.queued ? 'queued' : 'error',
    error: deliveryResult.error,
    agentId,
  }
}

/**
 * 向团队成员发送消息
 */
async function sendToTeamMember(
  teamName: string,
  memberName: string,
  message: string,
  fromAgentId?: string
): Promise<SendMessageResult> {
  const agentRegistry = AgentRegistry.getInstance()
  const mailboxManager = MailboxManager.getInstance()
  const teamManager = TeamManager.getInstance()

  // 构建成员 ID
  const memberId = `${teamName}:${memberName}`

  // 检查成员是否存在
  const memberMailbox = mailboxManager.hasMailbox(memberId)
  if (!memberMailbox) {
    return {
      success: false,
      status: 'error',
      error: `团队 ${teamName} 中没有成员 ${memberName}`,
    }
  }

  // 检查 Agent 类型 - 通过 AgentRegistry 或 TeamManager
  const teamMembers = agentRegistry.getAgentsByTeam(teamName)
  const registryMember = teamMembers.find(m => m.memberName === memberName)

  // 如果在 AgentRegistry 中找到，检查是否是 One-shot Agent
  if (registryMember) {
    if (isOneShotAgent(registryMember.agentDefinition.agentType)) {
      return {
        success: false,
        status: 'error',
        error: `团队成员 "${memberName}" 是 One-shot Agent，不支持继续执行`,
        agentId: memberId,
        isOneShot: true,
      }
    }
  } else {
    // 如果在 AgentRegistry 中没找到，尝试从 TeamManager 获取
    const team = teamManager.getTeam(teamName)
    if (team) {
      const member = team.getMember(memberName)
      if (member) {
        // 检查内置 Agent 类型
        const oneShotTypes = ['Explore', 'Plan', 'claude-code-guide', 'statusline-setup']
        if (oneShotTypes.includes(member.agentType)) {
          return {
            success: false,
            status: 'error',
            error: `团队成员 "${memberName}" 是 One-shot Agent，不支持继续执行`,
            agentId: memberId,
            isOneShot: true,
          }
        }
      }
    }
  }

  // 发送消息
  const deliveryResult = mailboxManager.sendToMember(teamName, memberName, fromAgentId || 'external', message)

  if (deliveryResult.success) {
    // 添加消息到 Agent 历史
    agentRegistry.addMessage(memberId, {
      role: 'user',
      content: message,
      fromAgentId: fromAgentId,
    })

    return {
      success: true,
      messageId: deliveryResult.messageId,
      status: 'sent',
      agentId: memberId,
    }
  }

  return {
    success: false,
    status: deliveryResult.queued ? 'queued' : 'error',
    error: deliveryResult.error,
    agentId: memberId,
  }
}

/**
 * 获取 Agent 的待处理消息
 */
export function getPendingMessages(agentId: string): {
  count: number
  messages: Array<{
    id: string
    fromAgentId: string
    content: string
    timestamp: Date
  }>
} {
  const mailboxManager = MailboxManager.getInstance()
  const mailbox = mailboxManager.getMailbox(agentId)

  const { messages } = mailbox.query({ unreadOnly: true })

  return {
    count: messages.length,
    messages: messages.map(m => ({
      id: m.id,
      fromAgentId: m.fromAgentId,
      content: m.content,
      timestamp: m.timestamp,
    })),
  }
}

/**
 * 标记消息为已读
 */
export function markMessageAsRead(agentId: string, messageId: string): boolean {
  const mailboxManager = MailboxManager.getInstance()
  const mailbox = mailboxManager.getMailbox(agentId)
  return mailbox.markAsRead(messageId)
}

/**
 * 检查 Agent 是否有待处理消息
 */
export function hasPendingMessages(agentId: string): boolean {
  const mailboxManager = MailboxManager.getInstance()
  const mailbox = mailboxManager.getMailbox(agentId)
  return mailbox.hasPendingNotifications()
}
