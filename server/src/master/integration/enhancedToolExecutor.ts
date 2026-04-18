/**
 * Enhanced Tool Executor - 工具执行引擎（重构版）
 *
 * 功能：
 * - 协调各类工具的注册与执行
 * - 提供统一的工具调用接口
 * - 管理工具执行上下文
 *
 * 架构改进：
 * - 从 1900 行单体类拆分为轻量级协调器（~350 行）
 * - 具体工具实现委托给专门的工具模块
 * - 保持对外 API 完全兼容
 *
 * 子模块依赖：
 * - types/toolTypes.ts: 类型定义
 * - tools/fileTools.ts: 文件操作工具
 * - tools/shellTools.ts: Shell 执行工具
 */

import { v4 as uuidv4 } from 'uuid'
import { mkdir } from 'fs/promises'
import { resolve, relative, dirname } from 'path'
import type { EventSender, ToolCall } from './webStore'
import { BackgroundTaskManager, TaskPriority } from '../services/backgroundTaskManager'
import {
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolResult,
  type UserPermissions,
  DEFAULT_SANDBOX_CONFIG,
} from './types/toolTypes'
import { createFileTools } from './tools/fileTools'
import { createShellTools } from './tools/shellTools'

// ==================== 全局实例 ====================

/**
 * 全局后台任务管理器实例（供 enhancedToolExecutor 使用）
 */
const backgroundTaskManager = new BackgroundTaskManager({
  maxConcurrentTasks: 5,
  defaultPriority: TaskPriority.NORMAL,
  taskTimeout: 300000,
  enablePersistence: false,
})

// ==================== EnhancedToolExecutor 类 ====================

export class EnhancedToolExecutor {
  private tools: Map<string, ToolDefinition> = new Map()
  private executionHistory: ToolCall[] = []
  private maxHistory: number = 1000
  private context: ToolExecutionContext

  constructor(projectRoot?: string) {
    this.context = {
      userId: 'anonymous',
      projectRoot: projectRoot || this.getProjectRoot(),
    }
    this.registerBuiltInTools()
  }

  /**
   * 获取项目根目录
   */
  private getProjectRoot(): string {
    const currentDir = process.cwd()
    return currentDir
      .replace(/\\server\\src$/i, '')
      .replace(/\/server\/src$/, '')
      .replace(/\\server$/i, '')
      .replace(/\/server$/, '')
  }

  /**
   * 获取当前工具执行上下文
   */
  getContext(): ToolExecutionContext {
    return this.context
  }

  /**
   * 动态更新工具执行上下文（用于无感沙箱模式）
   */
  setContext(newContext: Partial<ToolExecutionContext>): void {
    this.context = { ...this.context, ...newContext }
  }

  // ==================== 工具注册管理 ====================

  /**
   * 注册单个工具
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  /**
   * 注销工具
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name)
  }

  /**
   * 获取工具定义
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  /**
   * 获取所有已注册的工具
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  /**
   * 转换工具定义为 Anthropic SDK 格式
   * 用于 Agent 对话中的工具调用
   */
  getAnthropicTools(): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
    return this.getAllTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: (typeof tool.inputSchema === 'object' && tool.inputSchema !== null && 'properties' in (tool.inputSchema as object)
        ? tool.inputSchema as { type?: string; properties?: Record<string, unknown>; required?: string[] }
        : { type: 'object', properties: (tool.inputSchema as Record<string, unknown>) || {}, required: [] }),
    }))
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name)
  }

  // ==================== 内置工具注册 ====================

  /**
   * 注册所有内置工具
   */
  private registerBuiltInTools(): void {
    // 文件操作工具
    const fileTools = createFileTools(
      (path: string) => this.resolvePath(path),
      (dir: string) => this.ensureDir(dir)
    )
    fileTools.forEach(tool => this.registerTool(tool))

    // Shell 执行工具
    const shellTools = createShellTools()
    shellTools.forEach(tool => this.registerTool(tool))
  }

  // ==================== 工具执行核心逻辑 ====================

  /**
   * 执行工具调用
   */
  async execute(
    toolName: string,
    input: Record<string, unknown>,
    options?: {
      userId?: string
      sessionId?: string
      sendEvent?: EventSender
      userPermissions?: UserPermissions
    }
  ): Promise<ToolResult> {
    const startTime = Date.now()

    try {
      // 1. 查找工具
      const tool = this.tools.get(toolName)
      if (!tool) {
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        }
      }

      // 2. 权限验证（如果有提供用户权限）
      if (options?.userPermissions) {
        const permissionCheck = this.checkPermissions(tool, options.userPermissions)
        if (!permissionCheck.allowed) {
          return {
            success: false,
            error: permissionCheck.reason || 'Permission denied',
          }
        }
      }

      // 3. 构建执行上下文
      const context: ToolExecutionContext = {
        ...this.context,
        userId: options?.userId || this.context.userId,
        sessionId: options?.sessionId || this.context.sessionId,
      }

      // 4. 执行工具处理函数
      const result = await tool.handler(input, context, options?.sendEvent)

      // 5. 记录执行历史
      const executionTime = Date.now() - startTime
      this.recordExecution({
        id: uuidv4(),
        toolName,
        input,
        result: result.success ? 'success' : 'failed',
        timestamp: new Date(),
        duration: executionTime,
      })

      // 6. 添加元数据
      return {
        ...result,
        metadata: {
          ...result.metadata,
          duration: executionTime,
        },
      }
    } catch (error) {
      const executionTime = Date.now() - startTime
      
      // 记录失败执行
      this.recordExecution({
        id: uuidv4(),
        toolName,
        input,
        result: 'error',
        timestamp: new Date(),
        duration: executionTime,
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
        metadata: {
          duration: executionTime,
        },
      }
    }
  }

  /**
   * 批量执行多个工具调用（并行）
   */
  async executeBatch(calls: Array<{
    toolName: string
    input: Record<string, unknown>
    options?: Parameters<typeof this.execute>[2]
  }>): Promise<ToolResult[]> {
    return Promise.all(
      calls.map(call => this.execute(call.toolName, call.input, call.options))
    )
  }

  // ==================== 权限验证系统 ====================

  /**
   * 检查工具权限
   */
  private checkPermissions(
    tool: ToolDefinition,
    permissions: UserPermissions
  ): { allowed: boolean; reason?: string } {
    // 检查工具是否在禁止列表中
    if (permissions.deniedTools.includes(tool.name)) {
      return { allowed: false, reason: `Tool '${tool.name}' is explicitly denied` }
    }

    // 如果有允许列表，检查工具是否在其中
    if (permissions.allowedTools.length > 0 && !permissions.allowedTools.includes(tool.name)) {
      return { allowed: false, reason: `Tool '${tool.name}' is not in allowed list` }
    }

    // 检查危险工具权限
    if (tool.permissions?.dangerous && !permissions.canExecuteDangerous) {
      return { allowed: false, reason: `Tool '${tool.name}' requires dangerous operation permission` }
    }

    return { allowed: true }
  }

  // ==================== 辅助方法 ====================

  /**
   * 解析相对路径为绝对路径
   */
  resolvePath(relativePath: string): string {
    if (resolve(relativePath) === relativePath) {
      return relativePath // Already absolute
    }
    return resolve(this.context.projectRoot, relativePath)
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true })
  }

  /**
   * 记录工具执行历史
   */
  private recordExecution(call: ToolCall): void {
    this.executionHistory.push(call)

    // 保持历史记录在限制范围内
    if (this.executionHistory.length > this.maxHistory) {
      this.executionHistory.shift()
    }
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory(limit?: number): ToolCall[] {
    if (limit && limit < this.executionHistory.length) {
      return this.executionHistory.slice(-limit)
    }
    return [...this.executionHistory]
  }

  /**
   * 清空执行历史
   */
  clearHistory(): void {
    this.executionHistory = []
  }

  // ==================== 统计信息 ====================

  /**
   * 获取工具使用统计
   */
  getStats(): {
    totalTools: number
    totalExecutions: number
    successRate: number
    popularTools: Array<{ name: string; count: number }>
  } {
    const totalExecutions = this.executionHistory.length
    const successfulExecutions = this.executionHistory.filter(e => e.result === 'success').length
    
    // 统计最常用工具
    const toolCounts = new Map<string, number>()
    for (const exec of this.executionHistory) {
      const count = toolCounts.get(exec.toolName) || 0
      toolCounts.set(exec.toolName, count + 1)
    }

    const popularTools = Array.from(toolCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      totalTools: this.tools.size,
      totalExecutions,
      successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
      popularTools,
    }
  }
}

// ==================== 单例模式 ====================

/**
 * 内部单例实例（私有）
 */
let _toolExecutorInstance: EnhancedToolExecutor | null = null

/**
 * 获取 EnhancedToolExecutor 单例实例
 */
export function getToolExecutor(projectRoot?: string): EnhancedToolExecutor {
  if (!_toolExecutorInstance) {
    _toolExecutorInstance = new EnhancedToolExecutor(projectRoot)
  }
  return _toolExecutorInstance
}

// 导出类型供其他模块使用
export type { ToolDefinition, ToolExecutionContext, ToolResult, UserPermissions, PermissionLevel }

/**
 * 获取或创建 EnhancedToolExecutor 单例实例
 * 提供便捷的命名导出供外部模块直接导入使用
 */
export const toolExecutor = getToolExecutor()

export default EnhancedToolExecutor
