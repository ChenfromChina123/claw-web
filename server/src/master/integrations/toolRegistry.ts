/**
 * ToolRegistry - 工具注册中心（重构版）
 *
 * 功能：
 * - 协调所有子模块，提供统一的工具管理 API
 * - 管理工具的注册、查询、执行
 * - 维护工具生命周期和依赖关系
 *
 * 架构改进：
 * - 从 1222 行单体类拆分为轻量级协调器 (~380 行)
 * - 具体实现委托给专门的子模块
 * - 保持对外 API 完全兼容
 *
 * 子模块依赖：
 * - types/toolRegistryTypes.ts: 类型定义与常量
 * - core/toolLifecycle.ts: 生命周期事件系统
 * - core/toolDependency.ts: 依赖管理
 * - core/toolTimeout.ts: 超时控制
 * - core/builtinTools.ts: 内置工具注册
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  ToolRegistrationConfig,
  RegisteredTool,
  ToolExecutionRequest,
  ToolExecutionResult,
  ToolRegistryConfig,
} from './types/toolRegistryTypes'
import { TOOL_CATEGORIES } from './types/toolRegistryTypes'
import { normalizeToolName } from '../tools/toolAliases'
import { ToolEventEmitter } from './core/toolLifecycle'
import { ToolDependencyManager } from './core/toolDependency'
import { ToolTimeoutManager } from './core/toolTimeout'
import { BuiltinToolRegistrar } from './core/builtinTools'

// ==================== ToolRegistry 类 ====================

export class ToolRegistry {
  private projectRoot: string
  private config: ToolRegistryConfig
  
  // 工具存储（按来源分类）
  private builtinTools: Map<string, RegisteredTool> = new Map()
  private cliTools: Map<string, RegisteredTool> = new Map()
  private mcpTools: Map<string, RegisteredTool> = new Map()
  private customTools: Map<string, RegisteredTool> = new Map()
  
  // 处理器映射
  private toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>> = new Map()
  
  // 执行历史
  private executionHistory: ToolExecutionResult[] = []
  private maxHistorySize: number = 1000
  
  // 子模块实例
  private eventEmitter: ToolEventEmitter
  private dependencyManager: ToolDependencyManager
  private timeoutManager: ToolTimeoutManager

  constructor(config: ToolRegistryConfig) {
    this.projectRoot = config.projectRoot
    this.config = {
      enableCLI: true,
      enableMCP: true,
      enableCustom: true,
      defaultEnabled: true,
      defaultTimeout: 60000,
      enableTimeoutControl: true,
      ...config,
    }
    
    // 初始化子模块
    this.eventEmitter = new ToolEventEmitter()
    this.dependencyManager = new ToolDependencyManager()
    this.timeoutManager = new ToolTimeoutManager(this.config.defaultTimeout || 60000)
    
    // 注册内置工具
    this.registerBuiltinTools()
    
    console.log(`[ToolRegistry] 初始化完成，项目根目录: ${this.projectRoot}`)
  }

  // ==================== 生命周期事件代理 ====================

  on(event: Parameters<ToolEventEmitter['on']>[0], handler: Parameters<ToolEventEmitter['on']>[1]): ReturnType<ToolEventEmitter['on']> {
    return this.eventEmitter.on(event, handler)
  }

  once(event: Parameters<ToolEventEmitter['once']>[0], handler: Parameters<ToolEventEmitter['once']>[1]): void {
    this.eventEmitter.once(event, handler)
  }

  removeAllListeners(): void {
    this.eventEmitter.removeAllListeners()
  }

  getListenerCount(event?: Parameters<ToolEventEmitter['getListenerCount']>[0]): number {
    return this.eventEmitter.getListenerCount(event)
  }

  // ==================== 依赖管理代理 ====================

  registerDependency(dependentTool: string, dependencyTool: string): void {
    this.dependencyManager.registerDependency(dependentTool, dependencyTool)
  }

  getLoadOrder(): string[] {
    return this.dependencyManager.getLoadOrder(
      () => this.getAllTools(),
      (name) => this.dependencyManager.getDependencies(name, (n) => this.getTool(n))
    )
  }

  getDependencies(toolName: string): string[] {
    return this.dependencyManager.getDependencies(toolName, (name) => this.getTool(name))
  }

  areDependenciesLoaded(toolName: string): ReturnType<ToolDependencyManager['areDependenciesLoaded']> {
    return this.dependencyManager.areDependenciesLoaded(
      toolName,
      (name) => this.dependencyManager.getDependencies(name, (n) => this.getTool(n)),
      (name) => this.getTool(name)
    )
  }

  // ==================== 超时控制代理 ====================

  setToolTimeout(toolName: string, timeout: number): void {
    this.timeoutManager.setToolTimeout(toolName, timeout)
  }

  getToolTimeout(toolName: string): number {
    return this.timeoutManager.getToolTimeout(toolName)
  }

  setDefaultTimeout(timeout: number): void {
    this.timeoutManager.setDefaultTimeout(timeout)
  }

  getTimeoutConfig() {
    return this.timeoutManager.getConfig()
  }

  setTimeoutEnabled(enabled: boolean): void {
    this.timeoutManager.setEnabled(enabled)
  }

  // ==================== 工具注册核心 ====================

  registerBuiltinTool(config: ToolRegistrationConfig): void {
    const id = uuidv4()
    const registeredTool: RegisteredTool = {
      id,
      source: 'builtin',
      isEnabled: true,
      permissions: [],
      dependencies: config.dependencies || [],
      timeout: config.timeout || this.timeoutManager.getToolTimeout(config.name),
      displayName: config.displayName || config.name,
      isReadOnly: config.isReadOnly ?? false,
      isConcurrencySafe: config.isConcurrencySafe ?? true,
      aliases: config.aliases || [],
      name: config.name,
      description: config.description,
      category: config.category,
      inputSchema: config.inputSchema,
    }
    
    this.builtinTools.set(config.name, registeredTool)
    
    // 处理别名
    if (config.aliases) {
      for (const alias of config.aliases) {
        const normalized = normalizeToolName(alias)
        if (normalized) {
          this.builtinTools.set(normalized, registeredTool)
        }
        this.builtinTools.set(alias, registeredTool)
      }
    }
    
    // 注册处理器
    if (config.handler) {
      this.toolHandlers.set(config.name, config.handler)
    }
    
    // 注册依赖关系
    if (config.dependencies) {
      for (const dep of config.dependencies) {
        this.dependencyManager.registerDependency(config.name, dep)
      }
    }
    
    this.eventEmitter.emit('tool.registered', { tool: registeredTool, timestamp: Date.now() })
  }

  /**
   * 注册所有内置工具（委托给 BuiltinToolRegistrar）
   */
  private registerBuiltinTools(): void {
    BuiltinToolRegistrar.registerAll((config) => this.registerBuiltinTool(config))
    console.log(`[ToolRegistry] 已注册 ${BuiltinToolRegistrar.getToolCount()} 个内置工具`)
  }

  // ==================== 工具查询 ====================

  getAllTools(): RegisteredTool[] {
    const tools = new Map<string, RegisteredTool>()
    
    for (const [sourceMap] of [
      [this.builtinTools, 'builtin'],
      [this.cliTools, 'cli'],
      [this.mcpTools, 'mcp'],
      [this.customTools, 'custom'],
    ] as Array<[Map<string, RegisteredTool>, string]>) {
      for (const tool of sourceMap[0].values()) {
        if (!tools.has(tool.name)) {
          tools.set(tool.name, tool)
        }
      }
    }
    
    return Array.from(tools.values())
  }

  getTool(name: string): RegisteredTool | undefined {
    return (
      this.builtinTools.get(name) ||
      this.cliTools.get(name) ||
      this.mcpTools.get(name) ||
      this.customTools.get(name)
    )
  }

  getToolsByCategory(category: string): RegisteredTool[] {
    return this.getAllTools().filter(t => t.category === category)
  }

  getToolsGroupedByCategory(): Record<string, RegisteredTool[]> {
    const grouped: Record<string, RegisteredTool[]> = {}
    
    for (const tool of this.getAllTools()) {
      if (!grouped[tool.category]) {
        grouped[tool.category] = []
      }
      grouped[tool.category].push(tool)
    }
    
    return grouped
  }

  searchTools(query: string): RegisteredTool[] {
    const lowerQuery = query.toLowerCase()
    return this.getAllTools().filter(tool => {
      return (
        tool.name.toLowerCase().includes(lowerQuery) ||
        tool.description.toLowerCase().includes(lowerQuery) ||
        tool.aliases.some(alias => alias.toLowerCase().includes(lowerQuery))
      )
    })
  }

  // ==================== 工具执行 ====================

  async executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const id = uuidv4()
    const startTime = Date.now()
    const timeout = request.timeout || this.timeoutManager.getToolTimeout(request.toolName)
    
    const eventBase = {
      toolName: request.toolName,
      executionId: id,
      sessionId: request.sessionId,
      input: request.toolInput,
    }
    
    this.eventEmitter.emit('tool.execution_started', { ...eventBase, timestamp: startTime })
    
    // 查找工具
    const tool = this.getTool(request.toolName)
    if (!tool) {
      const result = this.createFailedResult(id, request.toolName, `工具未找到: ${request.toolName}`, startTime)
      this.addToHistory(result)
      this.eventEmitter.emit('tool.execution_failed', { ...eventBase, error: result.error, duration: result.duration })
      return result
    }
    
    // 检查是否启用
    if (!tool.isEnabled) {
      const result = this.createFailedResult(id, request.toolName, `工具已禁用: ${request.toolName}`, startTime)
      this.addToHistory(result)
      this.eventEmitter.emit('tool.execution_failed', { ...eventBase, error: result.error, duration: result.duration })
      return result
    }
    
    // 检查依赖
    const depCheck = this.areDependenciesLoaded(request.toolName)
    if (!depCheck.loaded) {
      const result = this.createFailedResult(id, request.toolName, `工具依赖未满足: 缺少 ${depCheck.missing.join(', ')}`, startTime)
      this.addToHistory(result)
      this.eventEmitter.emit('tool.execution_failed', { ...eventBase, error: result.error, duration: result.duration })
      return result
    }
    
    // 查找处理器
    const handler = this.toolHandlers.get(tool.name)
    if (!handler) {
      const result = this.createFailedResult(id, request.toolName, `工具处理器未注册: ${request.toolName}`, startTime)
      this.addToHistory(result)
      this.eventEmitter.emit('tool.execution_failed', { ...eventBase, error: result.error, duration: result.duration })
      return result
    }
    
    // 执行工具（带超时控制）
    try {
      const { result: response, timedOut, error: execError } = await this.timeoutManager.executeWithTimeout(
        () => handler(request.toolInput),
        request.toolName,
        timeout
      )
      
      if (timedOut) {
        const result: ToolExecutionResult = {
          id,
          toolName: request.toolName,
          success: false,
          error: `工具执行超时 (${timeout}ms)`,
          duration: Date.now() - startTime,
          timestamp: startTime,
          timedOut: true,
        }
        this.addToHistory(result)
        this.eventEmitter.emit('tool.execution_failed', { ...eventBase, error: result.error, duration: result.duration, timedOut: true })
        return result
      }
      
      if (execError) {
        throw new Error(execError)
      }
      
      const result: ToolExecutionResult = {
        id,
        toolName: request.toolName,
        success: response.success,
        result: response.result,
        error: response.error,
        duration: Date.now() - startTime,
        timestamp: startTime,
      }
      
      this.addToHistory(result)
      
      if (response.success) {
        this.eventEmitter.emit('tool.execution_completed', { ...eventBase, result, duration: result.duration, timestamp: Date.now() })
      } else {
        this.eventEmitter.emit('tool.execution_failed', { ...eventBase, error: response.error, duration: result.duration, timestamp: Date.now() })
      }
      
      return result
    } catch (error) {
      const result: ToolExecutionResult = {
        id,
        toolName: request.toolName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        timestamp: startTime,
      }
      
      this.addToHistory(result)
      this.eventEmitter.emit('tool.execution_failed', { ...eventBase, error: result.error, duration: result.duration, timestamp: Date.now() })
      return result
    }
  }

  /**
   * 创建失败结果对象
   */
  private createFailedResult(
    id: string,
    toolName: string,
    error: string,
    startTime: number
  ): ToolExecutionResult {
    return {
      id,
      toolName,
      success: false,
      error,
      duration: Date.now() - startTime,
      timestamp: startTime,
    }
  }

  /**
   * 添加到执行历史
   */
  private addToHistory(result: ToolExecutionResult): void {
    this.executionHistory.unshift(result)
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(0, this.maxHistorySize)
    }
  }

  getHistory(limit: number = 50): ToolExecutionResult[] {
    return this.executionHistory.slice(0, limit)
  }

  clearHistory(): void {
    this.executionHistory = []
  }

  // ==================== 工具管理 ====================

  registerCustomTool(tool: Omit<RegisteredTool, 'id' | 'source'>): void {
    const id = uuidv4()
    const registeredTool: RegisteredTool = {
      id,
      source: 'custom',
      ...tool,
    }
    
    this.customTools.set(tool.name, registeredTool)
    
    if (tool.handler) {
      this.toolHandlers.set(tool.name, tool.handler)
    }
    
    this.eventEmitter.emit('tool.registered', { tool: registeredTool, timestamp: Date.now() })
  }

  removeCustomTool(name: string): boolean {
    this.toolHandlers.delete(name)
    const removed = this.customTools.delete(name)
    if (removed) {
      this.eventEmitter.emit('tool.unregistered', { name })
    }
    return removed
  }

  setToolEnabled(name: string, enabled: boolean): boolean {
    const tool = this.getTool(name)
    if (tool) {
      tool.isEnabled = enabled
      this.eventEmitter.emit('tool.enabled_changed', { name, enabled })
      return true
    }
    return false
  }

  registerMCPTool(tool: RegisteredTool, serverId: string): void {
    tool.serverId = serverId
    tool.source = 'mcp'
    this.mcpTools.set(tool.name, tool)
    
    if (tool.handler) {
      this.toolHandlers.set(tool.name, tool.handler)
    }
    
    this.eventEmitter.emit('tool.mcp_registered', tool)
  }

  removeMCPServerTools(serverId: string): void {
    const toolsToRemove: string[] = []
    
    for (const [name, tool] of this.mcpTools) {
      if (tool.serverId === serverId) {
        toolsToRemove.push(name)
        this.toolHandlers.delete(name)
      }
    }
    
    for (const name of toolsToRemove) {
      this.mcpTools.delete(name)
    }
    
    if (toolsToRemove.length > 0) {
      this.eventEmitter.emit('tool.mcp_removed', { serverId, tools: toolsToRemove })
    }
  }

  // ==================== 统计信息 ====================

  getStats(): {
    total: number
    builtin: number
    cli: number
    mcp: number
    custom: number
    enabled: number
    disabled: number
    categories: Record<string, number>
  } {
    const tools = this.getAllTools()
    const categories: Record<string, number> = {}
    
    let builtin = 0
    let cli = 0
    let mcp = 0
    let custom = 0
    let enabled = 0
    let disabled = 0
    
    for (const tool of tools) {
      switch (tool.source) {
        case 'builtin': builtin++; break
        case 'cli': cli++; break
        case 'mcp': mcp++; break
        case 'custom': custom++; break
      }
      
      if (tool.isEnabled) enabled++
      else disabled++
      
      categories[tool.category] = (categories[tool.category] || 0) + 1
    }
    
    return {
      total: tools.length,
      builtin,
      cli,
      mcp,
      custom,
      enabled,
      disabled,
      categories,
    }
  }
}

// ==================== 单例模式 ====================

let toolRegistryInstance: ToolRegistry | null = null

/**
 * 获取 ToolRegistry 单例实例
 */
export function getToolRegistry(): ToolRegistry {
  if (!toolRegistryInstance) {
    const projectRoot = process.cwd().replace(/\\server\\src$/i, '').replace(/\/server\/src$/, '')
    toolRegistryInstance = new ToolRegistry({
      projectRoot,
      enableCLI: true,
      enableMCP: true,
      enableCustom: true,
      defaultEnabled: true,
    })
  }
  return toolRegistryInstance
}

/**
 * 初始化工具注册中心（支持自定义项目根目录）
 */
export async function initializeToolRegistry(projectRoot?: string): Promise<ToolRegistry> {
  if (toolRegistryInstance) {
    return toolRegistryInstance
  }
  
  const root = projectRoot || process.cwd().replace(/\\server\\src$/i, '').replace(/\/server\/src$/, '')
  toolRegistryInstance = new ToolRegistry({
    projectRoot: root,
    enableCLI: true,
    enableMCP: true,
    enableCustom: true,
    defaultEnabled: true,
  })
  
  return toolRegistryInstance
}

export default ToolRegistry
