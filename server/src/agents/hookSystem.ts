/**
 * Hook 系统
 * 
 * 实现 Agent 生命周期钩子，用于在关键事件发生时执行自定义逻辑
 */

import { EventEmitter } from 'events'

/**
 * Hook 类型枚举
 */
export enum HookType {
  /** 子 Agent 启动时 */
  SUBAGENT_START = 'SubagentStart',
  /** 子 Agent 完成时 */
  SUBAGENT_COMPLETE = 'SubagentComplete',
  /** 工具调用前 */
  TOOL_BEFORE_CALL = 'ToolBeforeCall',
  /** 工具调用后 */
  TOOL_AFTER_CALL = 'ToolAfterCall',
  /** Agent 出错时 */
  AGENT_ERROR = 'AgentError',
  /** Agent 正常结束时 */
  AGENT_COMPLETE = 'AgentComplete',
  /** Agent 启动时 */
  AGENT_START = 'AgentStart',
  /** 工具执行错误 */
  TOOL_ERROR = 'ToolError',
  /** 权限检查前 */
  PERMISSION_CHECK = 'PermissionCheck',
  /** 消息发送前 */
  MESSAGE_SEND = 'MessageSend',
}

/**
 * Hook 上下文
 */
export interface HookContext {
  /** 触发钩子的 Agent ID */
  agentId: string
  /** 触发钩子的 Agent 类型 */
  agentType: string
  /** 会话 ID */
  sessionId: string
  /** 时间戳 */
  timestamp: Date
  /** 额外的元数据 */
  metadata?: Record<string, unknown>
}

/**
 * 工具调用上下文 (ToolBeforeCall/AfterCall)
 */
export interface ToolHookContext extends HookContext {
  /** 工具名称 */
  toolName: string
  /** 工具输入参数 */
  toolInput: Record<string, unknown>
  /** 工具执行结果 (仅 AfterCall) */
  toolResult?: {
    success: boolean
    result?: unknown
    error?: string
  }
  /** 执行时长 (毫秒) */
  duration?: number
}

/**
 * Agent 错误上下文 (AgentError)
 */
export interface AgentErrorContext extends HookContext {
  /** 错误信息 */
  error: string
  /** 错误类型 */
  errorType: 'runtime' | 'timeout' | 'permission' | 'unknown'
  /** 栈跟踪 */
  stack?: string
}

/**
 * Agent 完成上下文 (AgentComplete)
 */
export interface AgentCompleteContext extends HookContext {
  /** 执行结果 */
  result: string
  /** 执行时长 (毫秒) */
  duration: number
  /** 总轮次 */
  totalTurns: number
  /** 工具调用次数 */
  toolCallCount: number
}

/**
 * 子 Agent 上下文 (SubagentStart/SubagentComplete)
 */
export interface SubagentContext extends HookContext {
  /** 子 Agent 名称 */
  subagentName: string
  /** 子 Agent 类型 */
  subagentType: string
  /** 父 Agent ID */
  parentAgentId?: string
}

/**
 * Hook 处理函���类型
 */
export type HookHandler<T extends HookContext = HookContext> = (
  context: T
) => void | Promise<void>

/**
 * 异步 Hook 处理函数类型
 */
export type AsyncHookHandler<T extends HookContext = HookContext> = (
  context: T
) => Promise<void>

/**
 * Hook 注册配置
 */
export interface HookRegistration {
  /** Hook 类型 */
  type: HookType
  /** 处理函数 */
  handler: HookHandler | AsyncHookHandler
  /** 优先级 (数字越小越先执行) */
  priority?: number
  /** 是否异步执行 */
  async?: boolean
  /** 过滤条件 */
  filter?: (context: HookContext) => boolean
  /** 超时时间 (毫秒) */
  timeout?: number
  /** Hook 名称 (用于日志) */
  name?: string
}

/**
 * Hook 条目
 */
interface HookEntry {
  handler: HookHandler | AsyncHookHandler
  priority: number
  async: boolean
  filter?: (context: HookContext) => boolean
  timeout: number
  name: string
}

/**
 * Hook 执行结果
 */
export interface HookExecutionResult {
  success: boolean
  results: Array<{
    hookName: string
    success: boolean
    error?: string
    duration?: number
  }>
  totalDuration: number
}

/**
 * Hook 系统
 */
export class HookSystem extends EventEmitter {
  private hooks: Map<HookType, HookEntry[]> = new Map()
  private executionHistory: Array<{
    type: HookType
    context: HookContext
    result: 'success' | 'partial' | 'failed'
    duration: number
    timestamp: Date
  }> = new Map()

  constructor() {
    super()

    // 初始化所有 Hook 类型
    for (const type of Object.values(HookType)) {
      this.hooks.set(type, [])
    }
  }

  /**
   * 注册 Hook
   */
  registerHook(config: HookRegistration): () => void {
    const entry: HookEntry = {
      handler: config.handler,
      priority: config.priority ?? 100,
      async: config.async ?? false,
      filter: config.filter,
      timeout: config.timeout ?? 30000,
      name: config.name || `hook_${Date.now()}`,
    }

    const entries = this.hooks.get(config.type) || []
    entries.push(entry)

    // 按优先级排序
    entries.sort((a, b) => a.priority - b.priority)
    this.hooks.set(config.type, entries)

    console.log(`[HookSystem] Registered ${config.type} hook: ${entry.name}`)

    // 返回取消注册函数
    return () => this.unregisterHook(config.type, entry.name)
  }

  /**
   * 注销 Hook
   */
  unregisterHook(type: HookType, name: string): boolean {
    const entries = this.hooks.get(type)
    if (!entries) return false

    const index = entries.findIndex(e => e.name === name)
    if (index !== -1) {
      entries.splice(index, 1)
      console.log(`[HookSystem] Unregistered ${type} hook: ${name}`)
      return true
    }

    return false
  }

  /**
   * 执行 Hook
   */
  async executeHook<T extends HookContext>(
    type: HookType,
    context: T
  ): Promise<HookExecutionResult> {
    const startTime = Date.now()
    const entries = this.hooks.get(type) || []

    if (entries.length === 0) {
      return { success: true, results: [], totalDuration: Date.now() - startTime }
    }

    const results: HookExecutionResult['results'] = []
    let allSuccess = true

    for (const entry of entries) {
      // 检查过滤条件
      if (entry.filter && !entry.filter(context)) {
        continue
      }

      const hookStart = Date.now()

      try {
        if (entry.async) {
          await this.executeWithTimeout(entry.handler, entry.timeout, context)
        } else {
          await Promise.resolve(entry.handler(context))
        }

        results.push({
          hookName: entry.name,
          success: true,
          duration: Date.now() - hookStart,
        })
      } catch (error) {
        allSuccess = false
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[HookSystem] Hook ${entry.name} failed:`, errorMessage)

        results.push({
          hookName: entry.name,
          success: false,
          error: errorMessage,
          duration: Date.now() - hookStart,
        })
      }
    }

    const totalDuration = Date.now() - startTime

    return {
      success: allSuccess,
      results,
      totalDuration,
    }
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout(
    handler: HookHandler | AsyncHookHandler,
    timeout: number,
    context: HookContext
  ): Promise<void> {
    return Promise.race([
      Promise.resolve(handler(context)),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Hook timed out after ${timeout}ms`)), timeout)
      ),
    ])
  }

  /**
   * 触发 SubagentStart 钩子
   */
  async onSubagentStart(context: SubagentContext): Promise<HookExecutionResult> {
    return this.executeHook(HookType.SUBAGENT_START, context)
  }

  /**
   * 触发 SubagentComplete 钩子
   */
  async onSubagentComplete(context: SubagentContext & { result: string; duration: number }): Promise<HookExecutionResult> {
    return this.executeHook(HookType.SUBAGENT_COMPLETE, context)
  }

  /**
   * 触发 ToolBeforeCall 钩子
   */
  async onToolBeforeCall(context: ToolHookContext): Promise<HookExecutionResult> {
    return this.executeHook(HookType.TOOL_BEFORE_CALL, context)
  }

  /**
   * 触发 ToolAfterCall 钩子
   */
  async onToolAfterCall(context: ToolHookContext): Promise<HookExecutionResult> {
    return this.executeHook(HookType.TOOL_AFTER_CALL, context)
  }

  /**
   * 触发 AgentError 钩子
   */
  async onAgentError(context: AgentErrorContext): Promise<HookExecutionResult> {
    return this.executeHook(HookType.AGENT_ERROR, context)
  }

  /**
   * 触发 AgentComplete 钩子
   */
  async onAgentComplete(context: AgentCompleteContext): Promise<HookExecutionResult> {
    return this.executeHook(HookType.AGENT_COMPLETE, context)
  }

  /**
   * 触发 AgentStart 钩子
   */
  async onAgentStart(context: HookContext): Promise<HookExecutionResult> {
    return this.executeHook(HookType.AGENT_START, context)
  }

  /**
   * 触发 ToolError 钩子
   */
  async onToolError(context: ToolHookContext): Promise<HookExecutionResult> {
    return this.executeHook(HookType.TOOL_ERROR, context)
  }

  /**
   * 获取已注册的 Hook 列表
   */
  getRegisteredHooks(): Array<{
    type: HookType
    name: string
    priority: number
    hasFilter: boolean
  }> {
    const list: Array<{
      type: HookType
      name: string
      priority: number
      hasFilter: boolean
    }> = []

    for (const [type, entries] of this.hooks) {
      for (const entry of entries) {
        list.push({
          type,
          name: entry.name,
          priority: entry.priority,
          hasFilter: !!entry.filter,
        })
      }
    }

    return list
  }

  /**
   * 获取 Hook 统计
   */
  getStats(): {
    totalHooks: number
    byType: Record<HookType, number>
  } {
    const byType = {} as Record<HookType, number>

    for (const type of Object.values(HookType)) {
      byType[type] = (this.hooks.get(type)?.length || 0)
    }

    return {
      totalHooks: Object.values(byType).reduce((a, b) => a + b, 0),
      byType,
    }
  }

  /**
   * 清除所有 Hook
   */
  clear(): void {
    for (const type of Object.values(HookType)) {
      this.hooks.set(type, [])
    }
    console.log('[HookSystem] All hooks cleared')
  }

  /**
   * 创建 Hook 装饰器 (用于类方法)
   */
  static hook(type: HookType, options?: { priority?: number; name?: string }) {
    return function (
      target: unknown,
      propertyKey: string,
      descriptor: PropertyDescriptor
    ) {
      const originalMethod = descriptor.value
      const hookName = options?.name || `${target.constructor.name}.${propertyKey}`

      descriptor.value = async function (...args: unknown[]) {
        const hookSystem = getHookSystem()
        const context = args[0] as HookContext

        await hookSystem.executeHook(type, {
          ...context,
          metadata: {
            ...context.metadata,
            methodName: propertyKey,
          },
        })

        return originalMethod.apply(this, args)
      }

      return descriptor
    }
  }
}

// 导出单例
let hookSystemInstance: HookSystem | null = null

export function getHookSystem(): HookSystem {
  if (!hookSystemInstance) {
    hookSystemInstance = new HookSystem()
  }
  return hookSystemInstance
}

export function createHookSystem(): HookSystem {
  if (hookSystemInstance) {
    hookSystemInstance.clear()
  }
  hookSystemInstance = new HookSystem()
  return hookSystemInstance
}
