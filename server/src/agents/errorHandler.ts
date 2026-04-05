/**
 * Agent 错误处理与恢复机制
 * 
 * 提供统一的错误处理策略，包括：
 * - Agent 类型不存在错误
 * - Agent 权限拒绝错误
 * - MCP 服务器不可用处理
 * - Fork 递归调用检测
 * - 用户中断处理
 * - API 错误重试
 * - 最大轮次达到处理
 * - 资源清理
 */

import { AgentStatus, AgentType } from './types'
import { RuntimeStatus, AgentRuntimeContext } from './runtimeContext'

// ==================== 错误类型定义 ====================

/**
 * 错误严重级别
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * 错误恢复策略
 */
export enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  SKIP = 'skip',
  ABORT = 'abort',
  ESCALATE = 'escalate'
}

/**
 * Agent 错误类型
 */
export enum AgentErrorType {
  // Agent 相关错误
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  AGENT_TYPE_NOT_FOUND = 'AGENT_TYPE_NOT_FOUND',
  AGENT_PERMISSION_DENIED = 'AGENT_PERMISSION_DENIED',
  AGENT_ALREADY_EXISTS = 'AGENT_ALREADY_EXISTS',
  
  // 执行错误
  EXECUTION_TIMEOUT = 'EXECUTION_TIMEOUT',
  MAX_TURNS_EXCEEDED = 'MAX_TURNS_EXCEEDED',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  EXECUTION_CANCELLED = 'EXECUTION_CANCELLED',
  
  // 上下文错误
  CONTEXT_ISOLATION_VIOLATION = 'CONTEXT_ISOLATION_VIOLATION',
  FORK_RECURSIVE_DETECTED = 'FORK_RECURSIVE_DETECTED',
  FORK_DEPTH_EXCEEDED = 'FORK_DEPTH_EXCEEDED',
  
  // MCP 相关错误
  MCP_SERVER_NOT_FOUND = 'MCP_SERVER_NOT_FOUND',
  MCP_SERVER_UNAVAILABLE = 'MCP_SERVER_UNAVAILABLE',
  MCP_TOOL_NOT_FOUND = 'MCP_TOOL_NOT_FOUND',
  MCP_CONNECTION_FAILED = 'MCP_CONNECTION_FAILED',
  
  // 工具相关错误
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_PERMISSION_DENIED = 'TOOL_PERMISSION_DENIED',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',
  
  // 用户中断
  USER_INTERRUPT = 'USER_INTERRUPT',
  
  // API 错误
  API_ERROR = 'API_ERROR',
  API_RATE_LIMIT = 'API_RATE_LIMIT',
  API_AUTH_FAILED = 'API_AUTH_FAILED',
  
  // 资源错误
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  OUT_OF_MEMORY = 'OUT_OF_MEMORY',
  
  // 未知错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Agent 错误类
 */
export class AgentError extends Error {
  public readonly type: AgentErrorType
  public readonly severity: ErrorSeverity
  public readonly recoverable: boolean
  public readonly recoveryStrategy: RecoveryStrategy
  public readonly agentId?: string
  public readonly agentType?: string
  public readonly context?: Record<string, unknown>
  public readonly timestamp: Date

  constructor(
    message: string,
    type: AgentErrorType,
    options: {
      severity?: ErrorSeverity
      recoverable?: boolean
      recoveryStrategy?: RecoveryStrategy
      agentId?: string
      agentType?: string
      context?: Record<string, unknown>
    } = {}
  ) {
    super(message)
    this.name = 'AgentError'
    this.type = type
    this.severity = options.severity || ErrorSeverity.MEDIUM
    this.recoverable = options.recoverable ?? false
    this.recoveryStrategy = options.recoveryStrategy || RecoveryStrategy.ABORT
    this.agentId = options.agentId
    this.agentType = options.agentType
    this.context = options.context
    this.timestamp = new Date()

    Error.captureStackTrace(this, this.constructor)
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      severity: this.severity,
      recoverable: this.recoverable,
      recoveryStrategy: this.recoveryStrategy,
      agentId: this.agentId,
      agentType: this.agentType,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack
    }
  }
}

// ==================== 错误工厂 ====================

/**
 * Agent 错误工厂
 */
export class AgentErrorFactory {
  /**
   * 创建 Agent 不存在错误
   */
  static agentNotFound(agentId: string): AgentError {
    return new AgentError(
      `Agent 不存在: ${agentId}`,
      AgentErrorType.AGENT_NOT_FOUND,
      {
        severity: ErrorSeverity.HIGH,
        recoverable: false,
        recoveryStrategy: RecoveryStrategy.ABORT,
        agentId
      }
    )
  }

  /**
   * 创建 Agent 类型不存在错误
   */
  static agentTypeNotFound(type: string): AgentError {
    return new AgentError(
      `Agent 类型不存在: ${type}`,
      AgentErrorType.AGENT_TYPE_NOT_FOUND,
      {
        severity: ErrorSeverity.HIGH,
        recoverable: false,
        recoveryStrategy: RecoveryStrategy.ABORT,
        agentType: type
      }
    )
  }

  /**
   * 创建权限拒绝错误
   */
  static permissionDenied(
    agentId: string,
    action: string,
    reason?: string
  ): AgentError {
    return new AgentError(
      `权限拒绝: ${action}${reason ? ` - ${reason}` : ''}`,
      AgentErrorType.AGENT_PERMISSION_DENIED,
      {
        severity: ErrorSeverity.MEDIUM,
        recoverable: false,
        recoveryStrategy: RecoveryStrategy.ESCALATE,
        agentId,
        context: { action, reason }
      }
    )
  }

  /**
   * 创建执行超时错误
   */
  static executionTimeout(
    agentId: string,
    timeoutMs: number
  ): AgentError {
    return new AgentError(
      `执行超时: ${timeoutMs}ms`,
      AgentErrorType.EXECUTION_TIMEOUT,
      {
        severity: ErrorSeverity.MEDIUM,
        recoverable: true,
        recoveryStrategy: RecoveryStrategy.RETRY,
        agentId,
        context: { timeoutMs }
      }
    )
  }

  /**
   * 创建最大轮次超限错误
   */
  static maxTurnsExceeded(
    agentId: string,
    maxTurns: number
  ): AgentError {
    return new AgentError(
      `超过最大轮次限制: ${maxTurns}`,
      AgentErrorType.MAX_TURNS_EXCEEDED,
      {
        severity: ErrorSeverity.MEDIUM,
        recoverable: false,
        recoveryStrategy: RecoveryStrategy.ABORT,
        agentId,
        context: { maxTurns }
      }
    )
  }

  /**
   * 创建 Fork 递归检测错误
   */
  static forkRecursiveDetected(agentId: string): AgentError {
    return new AgentError(
      `检测到 Fork 递归调用: ${agentId}`,
      AgentErrorType.FORK_RECURSIVE_DETECTED,
      {
        severity: ErrorSeverity.CRITICAL,
        recoverable: false,
        recoveryStrategy: RecoveryStrategy.ABORT,
        agentId
      }
    )
  }

  /**
   * 创建 Fork 深度超限错误
   */
  static forkDepthExceeded(
    agentId: string,
    maxDepth: number
  ): AgentError {
    return new AgentError(
      `Fork 深度超限: ${maxDepth}`,
      AgentErrorType.FORK_DEPTH_EXCEEDED,
      {
        severity: ErrorSeverity.HIGH,
        recoverable: false,
        recoveryStrategy: RecoveryStrategy.ABORT,
        agentId,
        context: { maxDepth }
      }
    )
  }

  /**
   * 创建 MCP 服务器不可用错误
   */
  static mcpServerUnavailable(serverId: string): AgentError {
    return new AgentError(
      `MCP 服务器不可用: ${serverId}`,
      AgentErrorType.MCP_SERVER_UNAVAILABLE,
      {
        severity: ErrorSeverity.HIGH,
        recoverable: true,
        recoveryStrategy: RecoveryStrategy.RETRY,
        context: { serverId }
      }
    )
  }

  /**
   * 创建 MCP 服务器未找到错误
   */
  static mcpServerNotFound(serverId: string): AgentError {
    return new AgentError(
      `MCP 服务器未找到: ${serverId}`,
      AgentErrorType.MCP_SERVER_NOT_FOUND,
      {
        severity: ErrorSeverity.HIGH,
        recoverable: false,
        recoveryStrategy: RecoveryStrategy.ABORT,
        context: { serverId }
      }
    )
  }

  /**
   * 创建用户中断错误
   */
  static userInterrupt(agentId: string): AgentError {
    return new AgentError(
      `用户中断执行: ${agentId}`,
      AgentErrorType.USER_INTERRUPT,
      {
        severity: ErrorSeverity.LOW,
        recoverable: false,
        recoveryStrategy: RecoveryStrategy.ABORT,
        agentId
      }
    )
  }

  /**
   * 创建 API 错误
   */
  static apiError(
    message: string,
    statusCode?: number
  ): AgentError {
    const isRateLimit = statusCode === 429
    return new AgentError(
      `API 错误: ${message}`,
      isRateLimit ? AgentErrorType.API_RATE_LIMIT : AgentErrorType.API_ERROR,
      {
        severity: isRateLimit ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH,
        recoverable: isRateLimit,
        recoveryStrategy: isRateLimit ? RecoveryStrategy.RETRY : RecoveryStrategy.FALLBACK,
        context: { statusCode }
      }
    )
  }

  /**
   * 创建工具执行失败错误
   */
  static toolExecutionFailed(
    toolName: string,
    reason: string
  ): AgentError {
    return new AgentError(
      `工具执行失败: ${toolName} - ${reason}`,
      AgentErrorType.TOOL_EXECUTION_FAILED,
      {
        severity: ErrorSeverity.MEDIUM,
        recoverable: true,
        recoveryStrategy: RecoveryStrategy.RETRY,
        context: { toolName, reason }
      }
    )
  }
}

// ==================== 错误恢复处理器 ====================

/**
 * 重试配置
 */
export interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  backoffMultiplier: number
  retryableErrors?: AgentErrorType[]
}

/**
 * 错误恢复上下文
 */
export interface ErrorRecoveryContext {
  error: AgentError
  attempt: number
  startTime: Date
  totalAttempts: number
}

/**
 * 错误恢复处理器
 */
export class ErrorRecoveryHandler {
  private retryConfig: RetryConfig
  private errorHandlers: Map<AgentErrorType, (error: AgentError, context: ErrorRecoveryContext) => Promise<void>>
  private onErrorCallbacks: Array<(error: AgentError, context: ErrorRecoveryContext) => void>

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.retryConfig = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      retryableErrors: [
        AgentErrorType.EXECUTION_TIMEOUT,
        AgentErrorType.MCP_SERVER_UNAVAILABLE,
        AgentErrorType.API_ERROR,
        AgentErrorType.API_RATE_LIMIT,
        AgentErrorType.TOOL_EXECUTION_FAILED,
        AgentErrorType.TOOL_TIMEOUT
      ],
      ...retryConfig
    }

    this.errorHandlers = new Map()
    this.onErrorCallbacks = []

    this.initializeDefaultHandlers()
  }

  /**
   * 初始化默认错误处理器
   */
  private initializeDefaultHandlers(): void {
    // 最大轮次超限处理
    this.registerHandler(
      AgentErrorType.MAX_TURNS_EXCEEDED,
      async (error) => {
        console.warn(`[ErrorRecovery] 最大轮次超限，Agent 已停止: ${error.agentId}`)
      }
    )

    // Fork 递归检测处理
    this.registerHandler(
      AgentErrorType.FORK_RECURSIVE_DETECTED,
      async (error) => {
        console.error(`[ErrorRecovery] 检测到 Fork 递归，强制停止: ${error.agentId}`)
      }
    )

    // 用户中断处理
    this.registerHandler(
      AgentErrorType.USER_INTERRUPT,
      async (error) => {
        console.log(`[ErrorRecovery] 用户中断执行: ${error.agentId}`)
      }
    )

    // MCP 服务器不可用处理
    this.registerHandler(
      AgentErrorType.MCP_SERVER_UNAVAILABLE,
      async (error, context) => {
        if (this.shouldRetry(error, context)) {
          await this.delay(this.calculateDelay(context.attempt))
          console.log(`[ErrorRecovery] 重试 MCP 操作 (尝试 ${context.attempt + 1}/${this.retryConfig.maxRetries})`)
        }
      }
    )

    // API 错误处理
    this.registerHandler(
      AgentErrorType.API_ERROR,
      async (error, context) => {
        if (this.shouldRetry(error, context)) {
          await this.delay(this.calculateDelay(context.attempt))
        }
      }
    )

    // 速率限制处理
    this.registerHandler(
      AgentErrorType.API_RATE_LIMIT,
      async (error, context) => {
        const retryAfter = (error.context?.retryAfter as number) || 60000
        console.log(`[ErrorRecovery] 速率限制，等待 ${retryAfter}ms 后重试`)
        await this.delay(retryAfter)
      }
    )

    // 执行超时处理
    this.registerHandler(
      AgentErrorType.EXECUTION_TIMEOUT,
      async (error, context) => {
        if (this.shouldRetry(error, context)) {
          const delay = this.calculateDelay(context.attempt)
          await this.delay(delay)
        }
      }
    )
  }

  /**
   * 注册自定义错误处理器
   */
  registerHandler(
    errorType: AgentErrorType,
    handler: (error: AgentError, context: ErrorRecoveryContext) => Promise<void>
  ): void {
    this.errorHandlers.set(errorType, handler)
  }

  /**
   * 添加错误回调
   */
  onError(callback: (error: AgentError, context: ErrorRecoveryContext) => void): void {
    this.onErrorCallbacks.push(callback)
  }

  /**
   * 处理错误
   */
  async handleError(
    error: AgentError,
    options: { attempt?: number; totalAttempts?: number } = {}
  ): Promise<boolean> {
    const attempt = options.attempt || 0
    const totalAttempts = options.totalAttempts || 0

    const context: ErrorRecoveryContext = {
      error,
      attempt,
      startTime: new Date(),
      totalAttempts
    }

    console.log(`[ErrorRecovery] 处理错误: ${error.type} - ${error.message}`)

    // 触发回调
    for (const callback of this.onErrorCallbacks) {
      try {
        await callback(error, context)
      } catch (e) {
        console.error(`[ErrorRecovery] 回调执行失败:`, e)
      }
    }

    // 获取错误处理器
    const handler = this.errorHandlers.get(error.type)

    if (handler) {
      try {
        await handler(error, context)
        return error.recoverable && this.shouldRetry(error, context)
      } catch (e) {
        console.error(`[ErrorRecovery] 错误处理器执行失败:`, e)
        return false
      }
    }

    // 默认处理
    return false
  }

  /**
   * 检查是否应该重试
   */
  shouldRetry(error: AgentError, context: ErrorRecoveryContext): boolean {
    if (!error.recoverable) {
      return false
    }

    if (!this.retryConfig.retryableErrors?.includes(error.type)) {
      return false
    }

    return context.attempt < this.retryConfig.maxRetries
  }

  /**
   * 计算重试延迟
   */
  calculateDelay(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, attempt),
      this.retryConfig.maxDelayMs
    )
    // 添加随机抖动
    return delay * (0.5 + Math.random() * 0.5)
  }

  /**
   * 带重试的执行包装器
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      operationName?: string
      onRetry?: (attempt: number, error: AgentError) => void
    } = {}
  ): Promise<T> {
    let lastError: AgentError | null = null

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        const agentError = error instanceof AgentError
          ? error
          : AgentErrorFactory.apiError(String(error))

        lastError = agentError

        if (options.onRetry && attempt < this.retryConfig.maxRetries) {
          options.onRetry(attempt, agentError)
        }

        const shouldContinue = await this.handleError(agentError, {
          attempt,
          totalAttempts: this.retryConfig.maxRetries + 1
        })

        if (!shouldContinue) {
          break
        }
      }
    }

    throw lastError || new AgentError(
      '操作失败',
      AgentErrorType.UNKNOWN_ERROR,
      { severity: ErrorSeverity.CRITICAL }
    )
  }

  /**
   * 延迟辅助函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// ==================== Fork 递归检测器 ====================

/**
 * Fork 调用栈条目
 */
export interface ForkCallEntry {
  agentId: string
  parentAgentId: string
  timestamp: Date
  depth: number
}

/**
 * Fork 递归检测器
 */
export class ForkRecursionDetector {
  private callStack: ForkCallEntry[] = []
  private maxDepth: number
  private agentCallHistory: Map<string, number> = new Map()

  constructor(maxDepth: number = 10) {
    this.maxDepth = maxDepth
  }

  /**
   * 记录 Fork 调用
   */
  recordFork(parentAgentId: string, childAgentId: string): void {
    const depth = this.getAgentDepth(parentAgentId) + 1

    const entry: ForkCallEntry = {
      agentId: childAgentId,
      parentAgentId,
      timestamp: new Date(),
      depth
    }

    this.callStack.push(entry)

    // 更新调用历史
    const count = this.agentCallHistory.get(childAgentId) || 0
    this.agentCallHistory.set(childAgentId, count + 1)
  }

  /**
   * 检查是否存在递归
   */
  checkRecursion(agentId: string): boolean {
    // 检查是否在调用栈中
    return this.callStack.some(entry => entry.agentId === agentId)
  }

  /**
   * 检查深度是否超限
   */
  checkDepthLimit(agentId: string): boolean {
    const depth = this.getAgentDepth(agentId)
    return depth >= this.maxDepth
  }

  /**
   * 获取 Agent 的深度
   */
  getAgentDepth(agentId: string): number {
    const entry = this.callStack.find(e => e.agentId === agentId)
    return entry?.depth || 0
  }

  /**
   * 获取调用计数
   */
  getCallCount(agentId: string): number {
    return this.agentCallHistory.get(agentId) || 0
  }

  /**
   * 清除特定 Agent 的调用记录
   */
  clearAgentRecords(agentId: string): void {
    this.callStack = this.callStack.filter(e => e.agentId !== agentId)
    this.agentCallHistory.delete(agentId)
  }

  /**
   * 清除所有记录
   */
  clearAll(): void {
    this.callStack = []
    this.agentCallHistory.clear()
  }

  /**
   * 获取当前调用栈
   */
  getCallStack(): ForkCallEntry[] {
    return [...this.callStack]
  }

  /**
   * 验证 Fork 操作
   */
  validateFork(parentAgentId: string, childAgentId: string): {
    valid: boolean
    error?: AgentError
  } {
    if (this.checkRecursion(childAgentId)) {
      return {
        valid: false,
        error: AgentErrorFactory.forkRecursiveDetected(childAgentId)
      }
    }

    if (this.checkDepthLimit(parentAgentId)) {
      return {
        valid: false,
        error: AgentErrorFactory.forkDepthExceeded(parentAgentId, this.maxDepth)
      }
    }

    // 检查父 Agent 是否已被该子 Agent 调用
    const parentInStack = this.callStack.some(
      e => e.agentId === parentAgentId && e.parentAgentId === childAgentId
    )
    if (parentInStack) {
      return {
        valid: false,
        error: AgentErrorFactory.forkRecursiveDetected(childAgentId)
      }
    }

    return { valid: true }
  }
}

// ==================== 用户中断处理器 ====================

/**
 * 中断请求接口
 */
export interface InterruptRequest {
  agentId: string
  reason: string
  timestamp: Date
  forced?: boolean
}

/**
 * 用户中断处理器
 */
export class UserInterruptHandler {
  private interruptRequests: Map<string, InterruptRequest> = new Map()
  private abortControllers: Map<string, AbortController> = new Map()
  private onInterruptCallbacks: Array<(request: InterruptRequest) => void>

  constructor() {
    this.onInterruptCallbacks = []
  }

  /**
   * 注册 Agent 的中断控制器
   */
  registerAgent(agentId: string): AbortController {
    const existing = this.abortControllers.get(agentId)
    if (existing) {
      return existing
    }

    const controller = new AbortController()
    this.abortControllers.set(agentId, controller)
    return controller
  }

  /**
   * 注销 Agent
   */
  unregisterAgent(agentId: string): void {
    this.abortControllers.delete(agentId)
    this.interruptRequests.delete(agentId)
  }

  /**
   * 请求中断
   */
  requestInterrupt(agentId: string, reason: string = '用户请求中断', forced: boolean = false): void {
    const request: InterruptRequest = {
      agentId,
      reason,
      timestamp: new Date(),
      forced
    }

    this.interruptRequests.set(agentId, request)

    const controller = this.abortControllers.get(agentId)
    if (controller) {
      controller.abort()
    }

    // 触发回调
    for (const callback of this.onInterruptCallbacks) {
      try {
        callback(request)
      } catch (e) {
        console.error(`[InterruptHandler] 回调执行失败:`, e)
      }
    }

    console.log(`[InterruptHandler] 中断请求已发送: ${agentId} - ${reason}`)
  }

  /**
   * 检查是否有待处理的中断请求
   */
  hasInterruptRequest(agentId: string): boolean {
    return this.interruptRequests.has(agentId)
  }

  /**
   * 获取中断请求
   */
  getInterruptRequest(agentId: string): InterruptRequest | undefined {
    return this.interruptRequests.get(agentId)
  }

  /**
   * 清除中断请求
   */
  clearInterrupt(agentId: string): void {
    this.interruptRequests.delete(agentId)
  }

  /**
   * 获取 AbortSignal
   */
  getAbortSignal(agentId: string): AbortSignal | undefined {
    return this.abortControllers.get(agentId)?.signal
  }

  /**
   * 添加中断回调
   */
  onInterrupt(callback: (request: InterruptRequest) => void): void {
    this.onInterruptCallbacks.push(callback)
  }

  /**
   * 检查是否已中止
   */
  isAborted(agentId: string): boolean {
    return this.abortControllers.get(agentId)?.signal.aborted ?? false
  }
}

// ==================== 资源清理管理器 ====================

/**
 * 清理任务
 */
interface CleanupTask {
  id: string
  name: string
  task: () => Promise<void> | void
  priority: number
  timeout?: number
}

/**
 * 资源清理管理器
 */
export class ResourceCleanupManager {
  private cleanupTasks: Map<string, CleanupTask[]> = new Map()
  private inProgress: Set<string> = new Set()

  /**
   * 注册清理任务
   */
  register(contextId: string, task: Omit<CleanupTask, 'id'>): string {
    const id = `cleanup_${Date.now()}_${Math.random().toString(36).slice(2)}`

    if (!this.cleanupTasks.has(contextId)) {
      this.cleanupTasks.set(contextId, [])
    }

    this.cleanupTasks.get(contextId)!.push({
      ...task,
      id
    })

    return id
  }

  /**
   * 从 RuntimeContext 注册清理钩子
   */
  registerFromRuntime(runtime: AgentRuntimeContext): void {
    runtime.addCleanupHook(async () => {
      await this.cleanup(runtime.runtimeId)
    })
  }

  /**
   * 执行清理
   */
  async cleanup(contextId: string): Promise<void> {
    if (this.inProgress.has(contextId)) {
      console.warn(`[CleanupManager] 清理已在进行中: ${contextId}`)
      return
    }

    this.inProgress.add(contextId)
    const tasks = this.cleanupTasks.get(contextId) || []

    // 按优先级排序
    tasks.sort((a, b) => a.priority - b.priority)

    console.log(`[CleanupManager] 开始清理 ${contextId}，共 ${tasks.length} 个任务`)

    for (const task of tasks) {
      try {
        if (task.timeout) {
          await this.executeWithTimeout(task.task, task.timeout)
        } else {
          await task.task()
        }
        console.log(`[CleanupManager] 清理任务完成: ${task.name}`)
      } catch (error) {
        console.error(`[CleanupManager] 清理任务失败: ${task.name}`, error)
      }
    }

    // 清除任务列表
    this.cleanupTasks.delete(contextId)
    this.inProgress.delete(contextId)

    console.log(`[CleanupManager] 清理完成: ${contextId}`)
  }

  /**
   * 清理所有资源
   */
  async cleanupAll(): Promise<void> {
    const contextIds = Array.from(this.cleanupTasks.keys())
    for (const contextId of contextIds) {
      await this.cleanup(contextId)
    }
  }

  /**
   * 移除清理任务
   */
  removeTask(contextId: string, taskId: string): void {
    const tasks = this.cleanupTasks.get(contextId)
    if (tasks) {
      const index = tasks.findIndex(t => t.id === taskId)
      if (index !== -1) {
        tasks.splice(index, 1)
      }
    }
  }

  /**
   * 获取清理任务数量
   */
  getTaskCount(contextId?: string): number {
    if (contextId) {
      return this.cleanupTasks.get(contextId)?.length || 0
    }
    return Array.from(this.cleanupTasks.values()).reduce((sum, tasks) => sum + tasks.length, 0)
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout<T>(
    task: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      task(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`清理任务超时: ${timeout}ms`)), timeout)
      )
    ])
  }
}

// ==================== 全局实例 ====================

let errorRecoveryHandler: ErrorRecoveryHandler | null = null
let forkRecursionDetector: ForkRecursionDetector | null = null
let userInterruptHandler: UserInterruptHandler | null = null
let resourceCleanupManager: ResourceCleanupManager | null = null

export function getErrorRecoveryHandler(): ErrorRecoveryHandler {
  if (!errorRecoveryHandler) {
    errorRecoveryHandler = new ErrorRecoveryHandler()
  }
  return errorRecoveryHandler
}

export function getForkRecursionDetector(): ForkRecursionDetector {
  if (!forkRecursionDetector) {
    forkRecursionDetector = new ForkRecursionDetector()
  }
  return forkRecursionDetector
}

export function getUserInterruptHandler(): UserInterruptHandler {
  if (!userInterruptHandler) {
    userInterruptHandler = new UserInterruptHandler()
  }
  return userInterruptHandler
}

export function getResourceCleanupManager(): ResourceCleanupManager {
  if (!resourceCleanupManager) {
    resourceCleanupManager = new ResourceCleanupManager()
  }
  return resourceCleanupManager
}

// ==================== 导出所有类型 ====================

export type {
  RetryConfig,
  ErrorRecoveryContext,
  ForkCallEntry,
  InterruptRequest,
  CleanupTask
}
