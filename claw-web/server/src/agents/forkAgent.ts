/**
 * ForkAgent - Fork 子代理模块
 * 
 * 阶段四: 多 Agent 协作 (4.3 Fork 子代理模式)
 * 
 * 功能:
 * - Fork Agent 创建
 * - 上下文继承
 * - 工具池继承
 * - 缓存优化
 * - Fork 检测
 */

import { randomUUID } from 'crypto'
import type { AgentDefinition, AgentExecutionResult } from './types'
import { AgentRegistry, AgentRuntimeState } from './agentRegistry'
import { createRuntimeContext, AgentRuntimeContext } from './runtimeContext'
import { getToolRegistry } from '../integrations/toolRegistry'

/**
 * Fork 选项
 */
export interface ForkOptions {
  /** 父 Agent ID */
  parentAgentId: string
  /** 提示词 */
  prompt: string
  /** 继承消息历史 */
  inheritMessages?: boolean
  /** 继承工具池 */
  inheritTools?: boolean
  /** 继承权限模式 */
  inheritPermissionMode?: boolean
}

/**
 * Fork 结果
 */
export interface ForkResult {
  success: boolean
  forkAgentId?: string
  forkAgentType?: string
  error?: string
  cachedTools?: boolean
  sharedContext?: boolean
}

/**
 * 共享上下文缓存
 */
interface SharedContextCache {
  parentAgentId: string
  messages: Array<{
    role: string
    content: string
    timestamp: Date
  }>
  tools: string[]
  cachedAt: Date
}

/**
 * ForkAgent 错误类型
 */
export enum ForkErrorType {
  PARENT_NOT_FOUND = 'PARENT_NOT_FOUND',
  ONE_SHOT_AGENT = 'ONE_SHOT_AGENT',
  ALREADY_FORKED = 'ALREADY_FORKED',
  AGENT_RUNNING = 'AGENT_RUNNING',
  FORK_LIMIT_EXCEEDED = 'FORK_LIMIT_EXCEEDED',
}

/**
 * ForkAgent 异常
 */
export class ForkAgentError extends Error {
  constructor(
    public readonly errorType: ForkErrorType,
    message: string
  ) {
    super(message)
    this.name = 'ForkAgentError'
  }
}

/**
 * 缓存管理器 (用于上下文共享优化)
 */
class ForkContextCache {
  private static instance: ForkContextCache
  private cache: Map<string, SharedContextCache> = new Map()
  private maxCacheSize = 100
  private accessCount: Map<string, number> = new Map()

  private constructor() {}

  static getInstance(): ForkContextCache {
    if (!ForkContextCache.instance) {
      ForkContextCache.instance = new ForkContextCache()
    }
    return ForkContextCache.instance
  }

  /**
   * 设置缓存
   */
  set(parentAgentId: string, messages: Array<{ role: string; content: string }>, tools: string[]): void {
    // 如果缓存已满，删除最少使用的条目
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLeastUsed()
    }

    const cacheEntry: SharedContextCache = {
      parentAgentId,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: new Date(),
      })),
      tools,
      cachedAt: new Date(),
    }

    this.cache.set(parentAgentId, cacheEntry)
    this.accessCount.set(parentAgentId, 1)
  }

  /**
   * 获取缓存
   */
  get(parentAgentId: string): SharedContextCache | undefined {
    const cache = this.cache.get(parentAgentId)
    if (cache) {
      // 更新访问计数
      this.accessCount.set(parentAgentId, (this.accessCount.get(parentAgentId) || 0) + 1)
    }
    return cache
  }

  /**
   * 检查是否存在缓存
   */
  has(parentAgentId: string): boolean {
    return this.cache.has(parentAgentId)
  }

  /**
   * 删除缓存
   */
  delete(parentAgentId: string): boolean {
    this.accessCount.delete(parentAgentId)
    return this.cache.delete(parentAgentId)
  }

  /**
   * 清理最少使用的缓存条目
   */
  private evictLeastUsed(): void {
    let minAccess = Infinity
    let minKey: string | undefined

    for (const [key, count] of this.accessCount) {
      if (count < minAccess) {
        minAccess = count
        minKey = key
      }
    }

    if (minKey) {
      this.delete(minKey)
    }
  }

  /**
   * 清理过期缓存
   */
  cleanup(maxAgeMs: number = 3600000): number {
    const now = Date.now()
    let cleaned = 0

    for (const [key, cache] of this.cache) {
      if (now - cache.cachedAt.getTime() > maxAgeMs) {
        this.delete(key)
        cleaned++
      }
    }

    return cleaned
  }

  /**
   * 获取缓存统计
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    }
  }
}

/**
 * 预计算工具名称前缀哈希 (用于快速匹配)
 */
function computeToolPrefixHash(tools: string[]): Set<string> {
  const hashes = new Set<string>()
  for (const tool of tools) {
    // 添加完整名称
    hashes.add(tool)
    // 添加前缀 (用于 Glob 模式匹配)
    const parts = tool.split(/[./-_]/)
    for (const part of parts) {
      if (part.length > 2) {
        hashes.add(part.toLowerCase())
      }
    }
  }
  return hashes
}

/**
 * 创建 Fork Agent
 */
export async function forkAgent(
  options: ForkOptions
): Promise<ForkResult> {
  const agentRegistry = AgentRegistry.getInstance()
  const contextCache = ForkContextCache.getInstance()

  // 1. 检查父 Agent 是否存在
  const parentAgent = agentRegistry.getAgent(options.parentAgentId)
  if (!parentAgent) {
    throw new ForkAgentError(
      ForkErrorType.PARENT_NOT_FOUND,
      `父 Agent ${options.parentAgentId} 不存在`
    )
  }

  // 2. 检查是否 One-shot Agent (不可 Fork)
  const oneShotTypes = ['Explore', 'Plan', 'claude-code-guide', 'statusline-setup']
  if (oneShotTypes.includes(parentAgent.agentDefinition.agentType)) {
    throw new ForkAgentError(
      ForkErrorType.ONE_SHOT_AGENT,
      `Agent 类型 "${parentAgent.agentDefinition.agentType}" 是 One-shot Agent，不支持 Fork`
    )
  }

  // 3. 检查是否已经是 Fork 的 Agent (不允许嵌套 Fork)
  if (parentAgent.parentAgentId) {
    throw new ForkAgentError(
      ForkErrorType.ALREADY_FORKED,
      `Agent ${options.parentAgentId} 已经是 Fork 的 Agent，不允许嵌套 Fork`
    )
  }

  // 4. 检查 Fork 限制 (可以添加最大 Fork 层级限制)
  const maxForkDepth = 3 // 最大 Fork 深度
  let forkDepth = 0
  let currentAgent = parentAgent
  while (currentAgent.parentAgentId) {
    forkDepth++
    const parent = agentRegistry.getAgent(currentAgent.parentAgentId)
    if (!parent) break
    currentAgent = parent
  }
  if (forkDepth >= maxForkDepth) {
    throw new ForkAgentError(
      ForkErrorType.FORK_LIMIT_EXCEEDED,
      `Fork 深度超过限制 (最大 ${maxForkDepth} 层)`
    )
  }

  // 5. 获取/创建共享上下文缓存
  let cachedTools = false
  let sharedContext = false

  if (options.inheritTools !== false) {
    // 检查是否有缓存的工具列表
    const cached = contextCache.get(options.parentAgentId)
    if (cached) {
      cachedTools = true
      sharedContext = true
    }
  }

  // 6. 创建新的 Agent 定义 (继承父 Agent 的定义)
  const forkAgentDefinition: AgentDefinition = {
    ...parentAgent.agentDefinition,
    agentType: `${parentAgent.agentDefinition.agentType}-fork`,
  }

  // 7. 注册 Fork Agent
  const forkAgent = agentRegistry.register({
    agentDefinition: forkAgentDefinition,
    parentAgentId: options.parentAgentId,
  })

  console.log(`[ForkAgent] 创建 Fork: ${forkAgent.agentId} (父: ${options.parentAgentId})`)

  // 8. 如果需要继承消息历史
  if (options.inheritMessages !== false) {
    const parentMessages = agentRegistry.getMessageHistory(options.parentAgentId)
    for (const msg of parentMessages) {
      agentRegistry.addMessage(forkAgent.agentId, {
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      })
    }

    // 缓存消息历史供后续 Fork 使用
    const allMessages = agentRegistry.getMessageHistory(forkAgent.agentId)
    if (options.inheritTools !== false) {
      // 获取工具列表并缓存
      const toolRegistry = getToolRegistry()
      const allTools = toolRegistry.getAllTools()
      const availableTools = allTools.map(t => t.name)
      contextCache.set(forkAgent.agentId, allMessages, availableTools)
    }
  }

  return {
    success: true,
    forkAgentId: forkAgent.agentId,
    forkAgentType: forkAgentDefinition.agentType,
    cachedTools,
    sharedContext,
  }
}

/**
 * 检查是否可以 Fork
 */
export function canForkAgent(agentId: string): { canFork: boolean; reason?: string } {
  const agentRegistry = AgentRegistry.getInstance()
  const agent = agentRegistry.getAgent(agentId)

  if (!agent) {
    return { canFork: false, reason: `Agent ${agentId} 不存在` }
  }

  const oneShotTypes = ['Explore', 'Plan', 'claude-code-guide', 'statusline-setup']
  if (oneShotTypes.includes(agent.agentDefinition.agentType)) {
    return { canFork: false, reason: `${agent.agentDefinition.agentType} 是 One-shot Agent，不支持 Fork` }
  }

  if (agent.parentAgentId) {
    return { canFork: false, reason: `Agent 已经是 Fork 的 Agent，不允许嵌套 Fork` }
  }

  return { canFork: true }
}

/**
 * 获取 Fork 树
 */
export function getForkTree(rootAgentId: string): {
  root: string
  forks: Array<{
    agentId: string
    depth: number
    parentId: string
    status: string
  }>
} {
  const agentRegistry = AgentRegistry.getInstance()
  const forks: Array<{
    agentId: string
    depth: number
    parentId: string
    status: string
  }> = []

  function traverse(agentId: string, depth: number) {
    const agent = agentRegistry.getAgent(agentId)
    if (!agent) return

    // 找到所有以这个 Agent 为父的子 Agent
    const allAgents = agentRegistry.getActiveAgents()
    for (const child of allAgents) {
      if (child.parentAgentId === agentId) {
        forks.push({
          agentId: child.agentId,
          depth: depth + 1,
          parentId: agentId,
          status: child.status,
        })
        traverse(child.agentId, depth + 1)
      }
    }
  }

  traverse(rootAgentId, 0)

  return {
    root: rootAgentId,
    forks,
  }
}

/**
 * 获取缓存管理器
 */
export function getForkContextCache(): ForkContextCache {
  return ForkContextCache.getInstance()
}
