/**
 * Agent 路由器 - 负责 Agent 选择与路由分发
 * 
 * 支持三种路由模式：
 * 1. 普通 Agent: 根据 subagent_type 路由
 * 2. Team 模式: 根据 name + team_name 创建团队成员
 * 3. Fork 模式: 继承父 Agent 上下文
 */

import { v4 as uuidv4 } from 'uuid'
import type { AgentDefinition, BuiltInAgentDefinition } from './types'
import { getBuiltInAgents, getBuiltInAgentByType } from './builtInAgents'

/**
 * Agent 路由模式
 */
export enum AgentRouteMode {
  /** 普通 Agent 执行 */
  NORMAL = 'normal',
  /** Team 团队成员模式 */
  TEAM = 'team',
  /** Fork 分叉模式 */
  FORK = 'fork',
}

/**
 * Agent 路由请求
 */
export interface AgentRouteRequest {
  prompt: string
  description?: string
  subagent_type?: string
  model?: string
  name?: string
  team_name?: string
  mode?: string
  isolation?: 'worktree' | 'remote'
  cwd?: string
  max_turns?: number
  run_in_background?: boolean
  parentAgentId?: string
}

/**
 * Agent 路由结果
 */
export interface AgentRouteResult {
  /** 路由模式 */
  mode: AgentRouteMode
  /** 解析后的 Agent 定义 */
  agentDefinition?: AgentDefinition
  /** 团队成员信息 (Team 模式) */
  teammateInfo?: {
    teamName: string
    memberName: string
    agentType: string
  }
  /** Fork 父 Agent ID (Fork 模式) */
  parentAgentId?: string
  /** 是否异步执行 */
  isAsync: boolean
  /** 路由错误 (如果有) */
  error?: string
}

/**
 * 路由上下文
 */
export interface AgentRouteContext {
  /** 允许使用的 Agent 类型列表 */
  allowedAgentTypes?: string[]
  /** 禁止使用的 Agent 类型列表 */
  deniedAgentTypes?: string[]
  /** 允许使用的工具列表 */
  allowedTools?: string[]
  /** 禁止使用的工具列表 */
  deniedTools?: string[]
  /** 当前权限模式 */
  permissionMode?: string
  /** 是否允许后台执行 */
  allowBackground?: boolean
}

/**
 * 确定路由模式
 */
export function determineRouteMode(request: AgentRouteRequest): AgentRouteMode {
  // Team 模式: 同时有 name 和 team_name
  if (request.name && request.team_name) {
    return AgentRouteMode.TEAM
  }

  // Fork 模式: 有 parentAgentId
  if (request.parentAgentId) {
    return AgentRouteMode.FORK
  }

  // 普通模式
  return AgentRouteMode.NORMAL
}

/**
 * 验证 Agent 类型是否允许使用
 */
export function isAgentTypeAllowed(
  agentType: string,
  context: AgentRouteContext
): { allowed: boolean; reason?: string } {
  // 检查禁止列表
  if (context.deniedAgentTypes && context.deniedAgentTypes.length > 0) {
    if (context.deniedAgentTypes.includes(agentType)) {
      return {
        allowed: false,
        reason: `Agent 类型 "${agentType}" 被禁止使用`,
      }
    }

    // 支持通配符格式: "Agent(Explore)"
    for (const denied of context.deniedAgentTypes) {
      if (denied.startsWith('Agent(') && denied.endsWith(')')) {
        const deniedType = denied.slice(7, -1)
        if (deniedType === agentType) {
          return {
            allowed: false,
            reason: `Agent 类型 "${agentType}" 被禁止使用`,
          }
        }
      }
    }
  }

  // 检查允许列表
  if (context.allowedAgentTypes && context.allowedAgentTypes.length > 0) {
    if (!context.allowedAgentTypes.includes(agentType)) {
      return {
        allowed: false,
        reason: `Agent 类型 "${agentType}" 不在允许列表中`,
      }
    }
  }

  return { allowed: true }
}

/**
 * 路由到 Team 成员
 */
export function routeToTeamMember(request: AgentRouteRequest): AgentRouteResult {
  const agentType = request.subagent_type || 'general-purpose'
  const agentDefinition = getBuiltInAgentByType(agentType)

  if (!agentDefinition) {
    return {
      mode: AgentRouteMode.TEAM,
      isAsync: false,
      error: `未知的 Agent 类型: ${agentType}`,
    }
  }

  return {
    mode: AgentRouteMode.TEAM,
    agentDefinition,
    teammateInfo: {
      teamName: request.team_name!,
      memberName: request.name!,
      agentType,
    },
    isAsync: false,
  }
}

/**
 * 路由到普通 Agent
 */
export function routeToNormalAgent(
  request: AgentRouteRequest,
  context: AgentRouteContext
): AgentRouteResult {
  const agentType = request.subagent_type || 'general-purpose'

  // 权限检查
  const permissionCheck = isAgentTypeAllowed(agentType, context)
  if (!permissionCheck.allowed) {
    return {
      mode: AgentRouteMode.NORMAL,
      isAsync: false,
      error: permissionCheck.reason,
    }
  }

  // 获取 Agent 定义
  const agentDefinition = getBuiltInAgentByType(agentType)
  if (!agentDefinition) {
    return {
      mode: AgentRouteMode.NORMAL,
      isAsync: false,
      error: `未知的 Agent 类型: ${agentType}`,
    }
  }

  // 确定是否异步执行
  let isAsync = request.run_in_background || false
  // 只有在明确禁用后台执行时才设置为 false
  if (context.allowBackground === false) {
    isAsync = false
  }

  return {
    mode: AgentRouteMode.NORMAL,
    agentDefinition,
    isAsync,
  }
}

/**
 * 路由到 Fork Agent
 */
export function routeToForkAgent(request: AgentRouteRequest): AgentRouteResult {
  const agentType = request.subagent_type || 'general-purpose'

  // 获取 Agent 定义
  const agentDefinition = getBuiltInAgentByType(agentType)
  if (!agentDefinition) {
    return {
      mode: AgentRouteMode.FORK,
      isAsync: false,
      error: `未知的 Agent 类型: ${agentType}`,
    }
  }

  return {
    mode: AgentRouteMode.FORK,
    agentDefinition,
    parentAgentId: request.parentAgentId,
    isAsync: false,
  }
}

/**
 * 主路由函数
 */
export function routeAgent(
  request: AgentRouteRequest,
  context: AgentRouteContext = {}
): AgentRouteResult {
  const mode = determineRouteMode(request)

  switch (mode) {
    case AgentRouteMode.TEAM:
      return routeToTeamMember(request)

    case AgentRouteMode.FORK:
      return routeToForkAgent(request)

    case AgentRouteMode.NORMAL:
    default:
      return routeToNormalAgent(request, context)
  }
}

/**
 * 获取所有可用的 Agent 类型
 */
export function getAvailableAgentTypes(context?: AgentRouteContext): string[] {
  const allTypes = getBuiltInAgents().map(a => a.agentType)

  if (!context) {
    return allTypes
  }

  // 过滤禁止的 Agent 类型
  let filtered = allTypes
  if (context.deniedAgentTypes && context.deniedAgentTypes.length > 0) {
    filtered = filtered.filter(type => {
      if (context.deniedAgentTypes!.includes(type)) {
        return false
      }
      // 检查通配符格式
      for (const denied of context.deniedAgentTypes!) {
        if (denied.startsWith('Agent(') && denied.endsWith(')')) {
          const deniedType = denied.slice(7, -1)
          if (deniedType === type) {
            return false
          }
        }
      }
      return true
    })
  }

  // 过滤允许列表
  if (context.allowedAgentTypes && context.allowedAgentTypes.length > 0) {
    filtered = filtered.filter(type => context.allowedAgentTypes!.includes(type))
  }

  return filtered
}

/**
 * 检查 Agent 是否是 One-shot 类型 (不可继续)
 */
export function isOneShotAgent(agentType: string): boolean {
  const oneShotAgents = ['Explore', 'Plan', 'claude-code-guide', 'statusline-setup']
  return oneShotAgents.includes(agentType)
}

/**
 * 获取 Agent 描述信息
 */
export function getAgentDescription(agentType: string): string | undefined {
  const agent = getBuiltInAgentByType(agentType)
  return agent?.whenToUse
}

/**
 * 创建 Agent 执行 ID
 */
export function createAgentId(prefix: string = 'agent'): string {
  return `${prefix}_${uuidv4().slice(0, 8)}`
}

/**
 * 获取 Agent 的工具池
 */
export function getAgentToolPool(
  agentDefinition: AgentDefinition
): { allowed: string[]; denied: string[] } {
  // 如果 Agent 有 disallowedTools，使用禁止列表
  if (agentDefinition.disallowedTools && agentDefinition.disallowedTools.length > 0) {
    return {
      allowed: [], // 空数组表示使用全部工具
      denied: agentDefinition.disallowedTools,
    }
  }

  // 如果 Agent 有 tools 列表，使用允许列表
  if (agentDefinition.tools && agentDefinition.tools.length > 0) {
    return {
      allowed: agentDefinition.tools,
      denied: [],
    }
  }

  // 默认: 使用全部工具
  return {
    allowed: ['*'],
    denied: [],
  }
}

/**
 * 判断 Agent 是否是只读模式
 */
export function isReadOnlyAgent(agentDefinition: AgentDefinition): boolean {
  return agentDefinition.isReadOnly === true ||
    agentDefinition.agentType === 'Explore' ||
    agentDefinition.agentType === 'Plan'
}
