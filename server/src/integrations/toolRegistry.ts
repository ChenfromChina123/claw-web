/**
 * 工具注册中心 - 统一管理所有工具
 * 
 * 这个模块作为中央注册表，管理：
 * - 内置工具
 * - CLI 工具（动态加载）
 * - MCP 工具
 * - 自定义工具
 * 
 * 提供统一的工具查询和执行接口。
 * 
 * 特性：
 * - 工具生命周期事件
 * - 工具依赖声明与自动加载
 * - 执行超时控制
 * - 工具别名映射
 */

import { v4 as uuidv4 } from 'uuid'
import { normalizeToolName } from '../tools/toolAliases'

// ==================== 类型定义 ====================

/**
 * 工具生命周期事件类型
 */
export type ToolLifecycleEvent = 
  | 'tool.registered'
  | 'tool.unregistered'
  | 'tool.enabled'
  | 'tool.disabled'
  | 'tool.enabled_changed'
  | 'tool.loaded'
  | 'tool.execution_started'
  | 'tool.execution_progress'
  | 'tool.execution_completed'
  | 'tool.execution_failed'
  | 'tool.error'
  | 'tool.mcp_registered'
  | 'tool.mcp_removed'
  | 'tool_start'
  | 'tool_end'

/**
 * 工具注册配置
 */
export interface ToolRegistrationConfig {
  name: string
  displayName?: string
  description: string
  category: string
  inputSchema: Record<string, unknown>
  isReadOnly?: boolean
  isConcurrencySafe?: boolean
  aliases?: string[]
  permissions?: string[]
  handler?: (args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>
  dependencies?: string[]
  timeout?: number
}

/**
 * 工具依赖信息
 */
export interface ToolDependency {
  toolName: string
  version?: string
  loaded: boolean
  loadOrder: number
}

/**
 * 执行超时配置
 */
export interface ExecutionTimeoutConfig {
  defaultTimeout: number
  perToolTimeouts: Record<string, number>
  enableTimeout: boolean
}

export interface RegisteredTool {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  inputSchema: Record<string, unknown>
  source: 'builtin' | 'cli' | 'mcp' | 'custom'
  serverId?: string
  aliases: string[]
  isEnabled: boolean
  isReadOnly: boolean
  isConcurrencySafe: boolean
  permissions: string[]
  dependencies: string[]
  timeout: number
  handler?: (args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>
}

export interface ToolExecutionRequest {
  toolName: string
  toolInput: Record<string, unknown>
  sessionId?: string
  context?: Record<string, unknown>
  timeout?: number
}

export interface ToolExecutionResult {
  id: string
  toolName: string
  success: boolean
  result?: unknown
  error?: string
  output?: string
  duration: number
  timestamp: number
  timedOut?: boolean
}

/**
 * 工具执行事件数据类型
 */
export interface ToolExecutionEvent {
  toolName: string
  executionId: string
  sessionId?: string
  input?: Record<string, unknown>
  result?: ToolExecutionResult
  error?: string
  duration?: number
  timedOut?: boolean
  progress?: {
    type: 'start' | 'progress' | 'complete' | 'error'
    data?: unknown
  }
  timestamp: number
}

export interface ToolPermission {
  toolName: string
  allow: boolean
  reason?: string
}

export interface ToolRegistryConfig {
  projectRoot: string
  enableCLI: boolean
  enableMCP: boolean
  enableCustom: boolean
  defaultEnabled: boolean
  permissions?: ToolPermission[]
  defaultTimeout?: number
  enableTimeoutControl?: boolean
}

// ==================== 工具类别定义 ====================

export const TOOL_CATEGORIES = {
  FILE: { id: 'file', name: '文件操作', icon: 'file' },
  SHELL: { id: 'shell', name: 'Shell 命令', icon: 'terminal' },
  WEB: { id: 'web', name: '网络工具', icon: 'globe' },
  TASK: { id: 'task', name: '任务管理', icon: 'check-square' },
  AGENT: { id: 'agent', name: 'Agent', icon: 'bot' },
  MCP: { id: 'mcp', name: 'MCP', icon: 'plug' },
  SKILL: { id: 'skill', name: '技能', icon: 'star' },
  SYSTEM: { id: 'system', name: '系统', icon: 'settings' },
  PLAN: { id: 'plan', name: '计划模式', icon: 'map' },
  TEAM: { id: 'team', name: '团队协作', icon: 'users' },
  CRON: { id: 'cron', name: '定时任务', icon: 'clock' },
  OTHER: { id: 'other', name: '其他', icon: 'box' },
} as const

export type ToolCategoryId = typeof TOOL_CATEGORIES[keyof typeof TOOL_CATEGORIES]['id']

// ==================== 权限级别定义 ====================

export const PERMISSION_LEVELS = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
  EXECUTE: 3,
  ADMIN: 4,
} as const

// ==================== 工具注册中心 ====================

export class ToolRegistry {
  private projectRoot: string
  private builtinTools: Map<string, RegisteredTool> = new Map()
  private cliTools: Map<string, RegisteredTool> = new Map()
  private mcpTools: Map<string, RegisteredTool> = new Map()
  private customTools: Map<string, RegisteredTool> = new Map()
  private toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>> = new Map()
  private executionHistory: ToolExecutionResult[] = []
  private maxHistorySize: number = 1000
  private config: ToolRegistryConfig
  
  // 依赖管理
  private toolDependencies: Map<string, ToolDependency> = new Map()
  private loadOrder: string[] = []
  
  // 超时控制
  private timeoutConfig: ExecutionTimeoutConfig = {
    defaultTimeout: 60000,
    perToolTimeouts: {},
    enableTimeout: true,
  }
  
  // 事件发射器
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map()
  
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
    
    this.timeoutConfig.defaultTimeout = this.config.defaultTimeout || 60000
    this.timeoutConfig.enableTimeout = this.config.enableTimeoutControl !== false
    
    this.registerBuiltinTools()
  }
  
  // ==================== 生命周期事件系统 ====================
  
  on(event: ToolLifecycleEvent, handler: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    return () => { this.listeners.get(event)?.delete(handler) }
  }
  
  once(event: ToolLifecycleEvent, handler: (data: unknown) => void): void {
    const wrapper = (data: unknown) => {
      handler(data)
      this.listeners.get(event)?.delete(wrapper)
    }
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(wrapper)
  }
  
  private emit(event: ToolLifecycleEvent, data: unknown): void {
    this.listeners.get(event)?.forEach(handler => {
      try {
        handler(data)
      } catch (error) {
        console.error(`[ToolRegistry] Event handler error for ${event}:`, error)
      }
    })
  }
  
  removeAllListeners(): void {
    this.listeners.clear()
  }
  
  getListenerCount(event?: ToolLifecycleEvent): number {
    if (event) {
      return this.listeners.get(event)?.size || 0
    }
    let total = 0
    for (const listeners of this.listeners.values()) {
      total += listeners.size
    }
    return total
  }
  
  // ==================== 依赖管理 ====================
  
  registerDependency(dependentTool: string, dependencyTool: string): void {
    if (!this.toolDependencies.has(dependentTool)) {
      this.toolDependencies.set(dependentTool, {
        toolName: dependentTool,
        loaded: false,
        loadOrder: this.loadOrder.length,
      })
    }
    
    const dep = this.toolDependencies.get(dependentTool)!
    if (!dep.version) {
      this.toolDependencies.set(dependentTool, {
        toolName: dependentTool,
        loaded: false,
        loadOrder: this.loadOrder.length,
      })
    }
  }
  
  getLoadOrder(): string[] {
    const ordered: string[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()
    
    const visit = (toolName: string) => {
      if (visited.has(toolName)) return
      if (visiting.has(toolName)) {
        console.warn(`[ToolRegistry] 检测到循环依赖: ${toolName}`)
        return
      }
      
      visiting.add(toolName)
      const deps = this.getDependencies(toolName)
      for (const dep of deps) {
        visit(dep)
      }
      
      visiting.delete(toolName)
      visited.add(toolName)
      ordered.push(toolName)
    }
    
    for (const tool of this.getAllTools()) {
      visit(tool.name)
    }
    
    this.loadOrder = ordered
    return ordered
  }
  
  getDependencies(toolName: string): string[] {
    const tool = this.getTool(toolName)
    return tool?.dependencies || []
  }
  
  areDependenciesLoaded(toolName: string): { loaded: boolean; missing: string[] } {
    const deps = this.getDependencies(toolName)
    const missing: string[] = []
    
    for (const dep of deps) {
      if (!this.getTool(dep)) {
        missing.push(dep)
      }
    }
    
    return { loaded: missing.length === 0, missing }
  }
  
  // ==================== 超时控制 ====================
  
  setToolTimeout(toolName: string, timeout: number): void {
    this.timeoutConfig.perToolTimeouts[toolName] = timeout
  }
  
  getToolTimeout(toolName: string): number {
    return this.timeoutConfig.perToolTimeouts[toolName] || this.timeoutConfig.defaultTimeout
  }
  
  setDefaultTimeout(timeout: number): void {
    this.timeoutConfig.defaultTimeout = timeout
  }
  
  getTimeoutConfig(): ExecutionTimeoutConfig {
    return { ...this.timeoutConfig }
  }
  
  setTimeoutEnabled(enabled: boolean): void {
    this.timeoutConfig.enableTimeout = enabled
  }
  
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<{ result?: T; timedOut: boolean; error?: string }> {
    return new Promise((resolve) => {
      let timedOut = false
      let settled = false
      
      const timer = setTimeout(() => {
        if (!settled) {
          timedOut = true
          settled = true
          resolve({ timedOut: true })
        }
      }, timeout)
      
      fn()
        .then((result) => {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            resolve({ result, timedOut: false })
          }
        })
        .catch((error) => {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            resolve({ timedOut: false, error: String(error) })
          }
        })
    })
  }
  
  // ==================== 工具注册 ====================
  
  registerBuiltinTool(config: ToolRegistrationConfig): void {
    const id = uuidv4()
    const registeredTool: RegisteredTool = {
      id,
      source: 'builtin',
      isEnabled: true,
      permissions: [],
      dependencies: config.dependencies || [],
      timeout: config.timeout || this.timeoutConfig.defaultTimeout,
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
    
    if (config.aliases) {
      for (const alias of config.aliases) {
        const normalized = normalizeToolName(alias)
        if (normalized) {
          this.builtinTools.set(normalized, registeredTool)
        }
        this.builtinTools.set(alias, registeredTool)
      }
    }
    
    if (config.handler) {
      this.toolHandlers.set(config.name, config.handler)
    }
    
    if (config.dependencies) {
      for (const dep of config.dependencies) {
        this.registerDependency(config.name, dep)
      }
    }
    
    this.emit('tool.registered', { tool: registeredTool, timestamp: Date.now() })
  }
  
  // ==================== 内置工具注册 ====================
  
  private registerBuiltinTools(): void {
    this.registerBuiltinTool({
      name: 'FileRead',
      displayName: '读取文件',
      description: '读取文件内容，支持分页和偏移',
      category: TOOL_CATEGORIES.FILE.id,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          limit: { type: 'number', description: '最大行数' },
          offset: { type: 'number', description: '起始行号' },
        },
        required: ['path'],
      },
      isReadOnly: true,
      isConcurrencySafe: true,
    })
    
    this.registerBuiltinTool({
      name: 'FileWrite',
      displayName: '写入文件',
      description: '写入内容到文件',
      category: TOOL_CATEGORIES.FILE.id,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          content: { type: 'string', description: '内容' },
        },
        required: ['path', 'content'],
      },
      isReadOnly: false,
      isConcurrencySafe: false,
    })
    
    this.registerBuiltinTool({
      name: 'Glob',
      displayName: '文件搜索',
      description: '查找匹配模式的文件',
      category: TOOL_CATEGORIES.FILE.id,
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob 模式' },
          path: { type: 'string', description: '搜索目录' },
        },
        required: ['pattern'],
      },
      isReadOnly: true,
      isConcurrencySafe: true,
      aliases: ['file_glob', 'find'],
    })
    
    this.registerBuiltinTool({
      name: 'Grep',
      displayName: '内容搜索',
      description: '在文件中搜索正则表达式',
      category: TOOL_CATEGORIES.FILE.id,
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: '正则表达式' },
          path: { type: 'string', description: '搜索目录' },
        },
        required: ['pattern'],
      },
      isReadOnly: true,
      isConcurrencySafe: true,
      aliases: ['search', 'find_content'],
    })
    
    this.registerBuiltinTool({
      name: 'Bash',
      displayName: '执行命令',
      description: '执行 Shell 命令',
      category: TOOL_CATEGORIES.SHELL.id,
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '命令' },
          cwd: { type: 'string', description: '工作目录' },
          timeout: { type: 'number', description: '超时(毫秒)' },
        },
        required: ['command'],
      },
      isReadOnly: false,
      isConcurrencySafe: false,
      aliases: ['shell', 'exec', 'run'],
    })
    
    this.registerBuiltinTool({
      name: 'WebSearch',
      displayName: '网络搜索',
      description: '搜索网络信息',
      category: TOOL_CATEGORIES.WEB.id,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索查询' },
        },
        required: ['query'],
      },
      isReadOnly: true,
      isConcurrencySafe: true,
      aliases: ['search', 'websearch'],
    })
    
    this.registerBuiltinTool({
      name: 'WebFetch',
      displayName: '获取网页',
      description: '获取网页内容',
      category: TOOL_CATEGORIES.WEB.id,
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL' },
        },
        required: ['url'],
      },
      isReadOnly: true,
      isConcurrencySafe: true,
      aliases: ['fetch', 'curl', 'wget'],
    })
    
    this.registerBuiltinTool({
      name: 'TodoWrite',
      displayName: '待办事项',
      description: '创建或更新待办事项',
      category: TOOL_CATEGORIES.TASK.id,
      inputSchema: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                content: { type: 'string' },
                id: { type: 'string' },
              },
            },
          },
          merge: { type: 'boolean' },
        },
        required: ['todos'],
      },
      isReadOnly: false,
      isConcurrencySafe: false,
      aliases: ['todo', 'todos'],
    })
    
    this.registerBuiltinTool({
      name: 'Config',
      displayName: '配置管理',
      description: '获取或设置配置值',
      category: TOOL_CATEGORIES.SYSTEM.id,
      inputSchema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: '配置键' },
          value: { type: 'string', description: '配置值' },
          list: { type: 'boolean', description: '列出所有' },
        },
        required: ['key'],
      },
      isReadOnly: true,
      isConcurrencySafe: true,
      aliases: ['get', 'set', 'setting', 'config_get', 'config_set'],
    })
    
    this.registerBuiltinTool({
      name: 'Agent',
      displayName: 'Agent 工具',
      description: '启动子代理来完成任务',
      category: TOOL_CATEGORIES.AGENT.id,
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '给子代理的任务描述' },
          subagent_type: { type: 'string', description: '子代理类型' },
        },
        required: ['prompt'],
      },
      isReadOnly: false,
      isConcurrencySafe: false,
    })
    
    this.registerBuiltinTool({
      name: 'SendMessage',
      displayName: '发送消息',
      description: '向运行中的 Agent 发送消息以继续其执行',
      category: TOOL_CATEGORIES.AGENT.id,
      inputSchema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: '目标 Agent 的 ID' },
          message: { type: 'string', description: '要发送的消息内容' },
        },
        required: ['agentId', 'message'],
      },
      isReadOnly: true,
      isConcurrencySafe: true,
    })
    
    this.registerBuiltinTool({
      name: 'Sleep',
      displayName: '暂停执行',
      description: '暂停执行指定的时间（毫秒）',
      category: TOOL_CATEGORIES.SYSTEM.id,
      inputSchema: {
        type: 'object',
        properties: {
          duration: { type: 'number', description: '暂停时长（毫秒）', minimum: 0, maximum: 300000 },
        },
        required: ['duration'],
      },
      isReadOnly: true,
      isConcurrencySafe: true,
    })
    
    this.registerBuiltinTool({
      name: 'ExitPlanMode',
      displayName: '退出计划模式',
      description: '退出计划模式，继续实际执行或取消任务',
      category: TOOL_CATEGORIES.PLAN.id,
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', description: '操作模式', enum: ['approve', 'reject', 'cancel'] },
          reason: { type: 'string', description: '原因或备注' },
        },
      },
      isReadOnly: true,
      isConcurrencySafe: true,
    })
    
    console.log(`[ToolRegistry] 注册了 ${this.builtinTools.size} 个内置工具`)
  }
  
  // ==================== 工具查询 ====================
  
  getAllTools(): RegisteredTool[] {
    const tools = new Map<string, RegisteredTool>()
    
    for (const tool of this.builtinTools.values()) {
      if (!tools.has(tool.name)) {
        tools.set(tool.name, tool)
      }
    }
    
    for (const tool of this.cliTools.values()) {
      if (!tools.has(tool.name)) {
        tools.set(tool.name, tool)
      }
    }
    
    for (const tool of this.mcpTools.values()) {
      if (!tools.has(tool.name)) {
        tools.set(tool.name, tool)
      }
    }
    
    for (const tool of this.customTools.values()) {
      if (!tools.has(tool.name)) {
        tools.set(tool.name, tool)
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
    const timeout = request.timeout || this.getToolTimeout(request.toolName)
    
    const eventBase = {
      toolName: request.toolName,
      executionId: id,
      sessionId: request.sessionId,
      input: request.toolInput,
    }
    
    this.emit('tool.execution_started', { ...eventBase, timestamp: startTime })
    
    const tool = this.getTool(request.toolName)
    
    if (!tool) {
      const result: ToolExecutionResult = {
        id,
        toolName: request.toolName,
        success: false,
        error: `工具未找到: ${request.toolName}`,
        duration: Date.now() - startTime,
        timestamp: startTime,
      }
      this.addToHistory(result)
      this.emit('tool.execution_failed', { ...eventBase, error: result.error, duration: result.duration })
      return result
    }
    
    if (!tool.isEnabled) {
      const result: ToolExecutionResult = {
        id,
        toolName: request.toolName,
        success: false,
        error: `工具已禁用: ${request.toolName}`,
        duration: Date.now() - startTime,
        timestamp: startTime,
      }
      this.addToHistory(result)
      this.emit('tool.execution_failed', { ...eventBase, error: result.error, duration: result.duration })
      return result
    }
    
    const depCheck = this.areDependenciesLoaded(request.toolName)
    if (!depCheck.loaded) {
      const result: ToolExecutionResult = {
        id,
        toolName: request.toolName,
        success: false,
        error: `工具依赖未满足: 缺少 ${depCheck.missing.join(', ')}`,
        duration: Date.now() - startTime,
        timestamp: startTime,
      }
      this.addToHistory(result)
      this.emit('tool.execution_failed', { ...eventBase, error: result.error, duration: result.duration })
      return result
    }
    
    const handler = this.toolHandlers.get(tool.name)
    
    if (!handler) {
      const result: ToolExecutionResult = {
        id,
        toolName: request.toolName,
        success: false,
        error: `工具处理器未注册: ${request.toolName}`,
        duration: Date.now() - startTime,
        timestamp: startTime,
      }
      this.addToHistory(result)
      this.emit('tool.execution_failed', { ...eventBase, error: result.error, duration: result.duration })
      return result
    }
    
    try {
      const { result: response, timedOut, error: execError } = await this.executeWithTimeout(
        () => handler(request.toolInput),
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
        this.emit('tool.execution_failed', { ...eventBase, error: result.error, duration: result.duration, timedOut: true })
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
        this.emit('tool.execution_completed', { ...eventBase, result, duration: result.duration, timestamp: Date.now() })
      } else {
        this.emit('tool.execution_failed', { ...eventBase, error: response.error, duration: result.duration, timestamp: Date.now() })
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
      this.emit('tool.execution_failed', { ...eventBase, error: result.error, duration: result.duration, timestamp: Date.now() })
      return result
    }
  }
  
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
    
    this.emit('tool.registered', { tool: registeredTool, timestamp: Date.now() })
  }
  
  removeCustomTool(name: string): boolean {
    this.toolHandlers.delete(name)
    const removed = this.customTools.delete(name)
    if (removed) {
      this.emit('tool.unregistered', { name })
    }
    return removed
  }
  
  setToolEnabled(name: string, enabled: boolean): boolean {
    const tool = this.getTool(name)
    if (tool) {
      tool.isEnabled = enabled
      this.emit('tool.enabled_changed', { name, enabled })
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
    
    this.emit('tool.mcp_registered', tool)
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
      this.emit('tool.mcp_removed', { serverId, tools: toolsToRemove })
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

// ==================== 单例实例 ====================

let toolRegistryInstance: ToolRegistry | null = null

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
