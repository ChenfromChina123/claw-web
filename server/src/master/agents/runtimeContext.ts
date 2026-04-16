/**
 * Agent 运行时上下文
 * 
 * 管理 Agent 执行时的完整上下文信息，包括：
 * - Agent 实例信息
 * - 工具池配置
 * - 权限设置
 * - 执行状态
 */

import { v4 as uuidv4 } from 'uuid'
import type { AgentDefinition, AgentStatus } from './types'
import { getAgentToolPool, isReadOnlyAgent } from './agentRouter'

/**
 * 运行时状态
 */
export enum RuntimeStatus {
  CREATED = 'created',
  INITIALIZING = 'initializing',
  RUNNING = 'running',
  WAITING_TOOL = 'waiting_tool',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * 权限模式
 */
export enum PermissionMode {
  BYPASS = 'bypassPermissions',
  ACCEPT_EDITS = 'acceptEdits',
  AUTO = 'auto',
  PLAN = 'plan',
  BUBBLE = 'bubble',
}

/**
 * 工具权限配置
 */
export interface ToolPermissionConfig {
  /** 允许的工具列表 (空数组表示全部允许) */
  allowedTools: string[]
  /** 禁止的工具列表 */
  deniedTools: string[]
  /** 是否是只读模式 */
  readOnly: boolean
}

/**
 * Agent 运行时上下文
 */
export class AgentRuntimeContext {
  /** 运行时 ID */
  readonly runtimeId: string

  /** Agent 实例 ID */
  readonly agentId: string

  /** Agent 定义 */
  readonly agentDefinition: AgentDefinition

  /** 父 Agent ID (Fork 模式) */
  readonly parentAgentId?: string

  /** 团队名称 (Team 模式) */
  readonly teamName?: string

  /** 团队成员名称 (Team 模式) */
  readonly memberName?: string

  /** 当前状态 */
  status: RuntimeStatus

  /** 权限模式 */
  permissionMode: PermissionMode

  /** 工具权限配置 */
  toolPermission: ToolPermissionConfig

  /** 当前轮次 */
  currentTurn: number

  /** 最大轮次限制 */
  maxTurns: number

  /** 开始时间 */
  startTime: Date

  /** 最后活动时间 */
  lastActivityTime: Date

  /** AbortController 用于取消执行 */
  private abortController: AbortController

  /** 资源清理钩子 */
  private cleanupHooks: Array<() => Promise<void> | void>

  /** 会话 ID */
  sessionId: string

  /** 工作目录 */
  cwd: string

  /** 模型配置 */
  model?: string

  /** 执行结果缓存 */
  private resultCache: Map<string, unknown>

  constructor(params: {
    agentId?: string
    agentDefinition: AgentDefinition
    parentAgentId?: string
    teamName?: string
    memberName?: string
    sessionId: string
    cwd?: string
    maxTurns?: number
    permissionMode?: PermissionMode | string
    model?: string
  }) {
    this.runtimeId = `runtime_${uuidv4().slice(0, 8)}`
    this.agentId = params.agentId || `agent_${uuidv4().slice(0, 8)}`
    this.agentDefinition = params.agentDefinition
    this.parentAgentId = params.parentAgentId
    this.teamName = params.teamName
    this.memberName = params.memberName
    this.sessionId = params.sessionId
    this.cwd = params.cwd || process.cwd()
    this.maxTurns = params.maxTurns || 100
    this.permissionMode = (params.permissionMode as PermissionMode) || PermissionMode.AUTO
    this.model = params.model || this.agentDefinition.model

    this.status = RuntimeStatus.CREATED
    this.currentTurn = 0
    this.startTime = new Date()
    this.lastActivityTime = new Date()
    this.abortController = new AbortController()
    this.cleanupHooks = []
    this.resultCache = new Map()

    // 初始化工具权限
    this.toolPermission = this.computeToolPermissions()
  }

  /**
   * 计算工具权限配置
   */
  private computeToolPermissions(): ToolPermissionConfig {
    const toolPool = getAgentToolPool(this.agentDefinition)

    // 只读 Agent 强制禁用写入工具
    const isReadOnly = isReadOnlyAgent(this.agentDefinition)
    // 写入类工具列表
    const writeTools = [
      'Write', 'FileWrite', 'Edit', 'FileEdit',
      'Delete', 'FileDelete', 'Bash', 'Shell',
    ]

    let deniedTools = [...toolPool.denied]
    let allowedTools = [...toolPool.allowed]

    // 如果没有配置允许列表（但有禁止列表），视为允许所有
    if (allowedTools.length === 0 && deniedTools.length > 0) {
      allowedTools = ['*']
    } else if (allowedTools.length === 0 && deniedTools.length === 0) {
      // 两个都为空，默认允许所有
      allowedTools = ['*']
    }

    // 根据权限模式调整
    switch (this.permissionMode) {
      case PermissionMode.BYPASS:
        // bypassPermissions: 允许所有工具
        return {
          allowedTools: ['*'],
          deniedTools: [],
          readOnly: false,
        }

      case PermissionMode.PLAN:
        // plan 模式: 只允许读取工具（禁止写入）
        return {
          allowedTools: ['*'], // 允许所有但后面会过滤
          deniedTools: [...new Set([...deniedTools, ...writeTools])],
          readOnly: true,
        }

      case PermissionMode.ACCEPT_EDITS:
        // acceptEdits: 允许编辑，但禁止危险命令
        return {
          allowedTools,
          deniedTools: [...new Set([...deniedTools, 'rm -rf', 'format', 'kill'])],
          readOnly: false,
        }

      default:
        // auto/bubble: 使用 Agent 定义的权限
        if (isReadOnly) {
          deniedTools = [...new Set([...deniedTools, ...writeTools])]
        }
        return {
          allowedTools,
          deniedTools,
          readOnly: isReadOnly,
        }
    }
  }

  /**
   * 获取可用的工具列表
   */
  getAvailableTools(allTools: string[]): string[] {
    const { allowedTools, deniedTools } = this.toolPermission

    // 如果允许列表包含 '*'，返回所有工具 (减去禁止列表)
    if (allowedTools.includes('*')) {
      return allTools.filter(tool => !deniedTools.includes(tool))
    }

    // 否则返回允许列表 (减去禁止列表)
    return allowedTools.filter(tool => !deniedTools.includes(tool))
  }

  /**
   * 检查工具是否可用
   */
  canUseTool(toolName: string): boolean {
    const { allowedTools, deniedTools } = this.toolPermission

    // 检查是否在禁止列表
    if (deniedTools.includes(toolName)) {
      return false
    }

    // 如果允许列表包含 '*'，则允许
    if (allowedTools.includes('*')) {
      return true
    }

    // 否则检查是否在允许列表
    return allowedTools.includes(toolName)
  }

  /**
   * 开始执行
   */
  start(): void {
    this.status = RuntimeStatus.INITIALIZING
    this.startTime = new Date()
    this.lastActivityTime = new Date()
  }

  /**
   * 进入运行状态
   */
  run(): void {
    this.status = RuntimeStatus.RUNNING
    this.lastActivityTime = new Date()
  }

  /**
   * 进入等待工具执行状态
   */
  waitForTool(): void {
    this.status = RuntimeStatus.WAITING_TOOL
    this.lastActivityTime = new Date()
  }

  /**
   * 完成执行
   */
  complete(): void {
    this.status = RuntimeStatus.COMPLETED
    this.lastActivityTime = new Date()
  }

  /**
   * 执行失败
   */
  fail(error?: string): void {
    this.status = RuntimeStatus.FAILED
    this.lastActivityTime = new Date()
    if (error) {
      this.resultCache.set('lastError', error)
    }
  }

  /**
   * 取消执行
   */
  cancel(): void {
    this.status = RuntimeStatus.CANCELLED
    this.abortController.abort()
    this.lastActivityTime = new Date()
  }

  /**
   * 请求取消
   */
  requestAbort(): void {
    this.abortController.abort()
  }

  /**
   * 获取 AbortSignal
   */
  getAbortSignal(): AbortSignal {
    return this.abortController.signal
  }

  /**
   * 增加轮次
   */
  incrementTurn(): boolean {
    this.currentTurn++
    this.lastActivityTime = new Date()
    return this.currentTurn <= this.maxTurns
  }

  /**
   * 检查是否达到最大轮次
   */
  hasReachedMaxTurns(): boolean {
    return this.currentTurn >= this.maxTurns
  }

  /**
   * 获取执行时长 (毫秒)
   */
  getDuration(): number {
    return Date.now() - this.startTime.getTime()
  }

  /**
   * 添加清理钩子
   */
  addCleanupHook(hook: () => Promise<void> | void): void {
    this.cleanupHooks.push(hook)
  }

  /**
   * 执行清理
   */
  async cleanup(): Promise<void> {
    console.log(`[AgentRuntimeContext] Running cleanup for ${this.runtimeId}`)

    for (const hook of this.cleanupHooks) {
      try {
        await hook()
      } catch (error) {
        console.error(`[AgentRuntimeContext] Cleanup hook error:`, error)
      }
    }

    this.cleanupHooks = []
  }

  /**
   * 设置缓存
   */
  setCache(key: string, value: unknown): void {
    this.resultCache.set(key, value)
  }

  /**
   * 获取缓存
   */
  getCache<T>(key: string): T | undefined {
    return this.resultCache.get(key) as T | undefined
  }

  /**
   * 获取状态摘要
   */
  getStatusSummary(): {
    runtimeId: string
    agentId: string
    agentType: string
    status: RuntimeStatus
    currentTurn: number
    maxTurns: number
    duration: number
    isReadOnly: boolean
    permissionMode: PermissionMode
  } {
    return {
      runtimeId: this.runtimeId,
      agentId: this.agentId,
      agentType: this.agentDefinition.agentType,
      status: this.status,
      currentTurn: this.currentTurn,
      maxTurns: this.maxTurns,
      duration: this.getDuration(),
      isReadOnly: this.toolPermission.readOnly,
      permissionMode: this.permissionMode,
    }
  }

  /**
   * 检查是否可以执行写入操作
   */
  canWrite(): boolean {
    return !this.toolPermission.readOnly &&
      this.permissionMode !== PermissionMode.PLAN
  }

  /**
   * 检查是否可以执行危险命令
   */
  canExecuteDangerous(): boolean {
    return this.permissionMode === PermissionMode.BYPASS
  }
}

/**
 * 创建 Agent 运行时上下文
 */
export function createRuntimeContext(
  agentDefinition: AgentDefinition,
  params: {
    agentId?: string
    parentAgentId?: string
    teamName?: string
    memberName?: string
    sessionId: string
    cwd?: string
    maxTurns?: number
    permissionMode?: PermissionMode | string
    model?: string
  }
): AgentRuntimeContext {
  return new AgentRuntimeContext({
    agentDefinition,
    ...params,
  })
}
