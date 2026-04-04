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
 */

import { v4 as uuidv4 } from 'uuid'
import { CLIToolLoader, getCLIToolLoader, type ToolDefinition, type CLIToolAdapter } from './cliToolLoader'

// ==================== 类型定义 ====================

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
  handler?: (args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>
}

export interface ToolExecutionRequest {
  toolName: string
  toolInput: Record<string, unknown>
  sessionId?: string
  context?: Record<string, unknown>
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
  private cliLoader: CLIToolLoader | null = null
  private builtinTools: Map<string, RegisteredTool> = new Map()
  private cliTools: Map<string, RegisteredTool> = new Map()
  private mcpTools: Map<string, RegisteredTool> = new Map()
  private customTools: Map<string, RegisteredTool> = new Map()
  private toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>> = new Map()
  private executionHistory: ToolExecutionResult[] = []
  private maxHistorySize: number = 1000
  private config: ToolRegistryConfig
  
  // 事件发射器
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map()
  
  constructor(config: ToolRegistryConfig) {
    this.projectRoot = config.projectRoot
    this.config = {
      enableCLI: true,
      enableMCP: true,
      enableCustom: true,
      defaultEnabled: true,
      ...config,
    }
    
    // 初始化内置工具
    this.registerBuiltinTools()
  }
  
  // ==================== 事件系统 ====================
  
  /**
   * 注册事件监听器
   */
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    
    // 返回取消订阅函数
    return () => {
      this.listeners.get(event)?.delete(handler)
    }
  }
  
  /**
   * 发射事件
   */
  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach(handler => {
      try {
        handler(data)
      } catch (error) {
        console.error(`[ToolRegistry] Event handler error for ${event}:`, error)
      }
    })
  }
  
  /**
   * 广播工具执行事件到 WebSocket 客户端
   */
  private broadcastExecutionEvent(
    eventType: 'tool.execution_started' | 'tool.execution_progress' | 'tool.execution_completed' | 'tool.execution_failed',
    eventData: ToolExecutionEvent
  ): void {
    // 发射内部事件
    this.emit(eventType, eventData)
    
    // 通过 WebSocket 广播到客户端（如果 wsManager 可用）
    try {
      // 动态导入以避免循环依赖
      import('./wsBridge').then(({ wsManager }) => {
        wsManager.broadcastToolEvent(eventType, eventData)
      }).catch(() => {
        // wsBridge 可能不存在，忽略错误
      })
    } catch (error) {
      console.error('[ToolRegistry] WebSocket broadcast error:', error)
    }
    
    console.log(`[ToolRegistry] 广播事件：${eventType} for ${eventData.toolName}`)
  }
  
  // ==================== 初始化 ====================
  
  /**
   * 初始化工具注册中心
   */
  async initialize(): Promise<void> {
    console.log('[ToolRegistry] 初始化中...')
    
    // 加载 CLI 工具
    if (this.config.enableCLI) {
      await this.loadCLITools()
    }
    
    console.log(`[ToolRegistry] 初始化完成`)
    console.log(`  - 内置工具: ${this.builtinTools.size}`)
    console.log(`  - CLI 工具: ${this.cliTools.size}`)
    console.log(`  - MCP 工具: ${this.mcpTools.size}`)
    console.log(`  - 自定义工具: ${this.customTools.size}`)
    console.log(`  - 总计: ${this.getAllTools().length}`)
  }
  
  /**
   * 加载 CLI 工具
   */
  private async loadCLITools(): Promise<void> {
    try {
      this.cliLoader = getCLIToolLoader(this.projectRoot)
      await this.cliLoader.loadTools()
      
      // 注册 CLI 工具
      for (const tool of this.cliLoader.getAllTools()) {
        this.registerToolFromAdapter(tool, 'cli')
      }
      
      console.log(`[ToolRegistry] 加载了 ${this.cliTools.size} 个 CLI 工具`)
    } catch (error) {
      console.error('[ToolRegistry] 加载 CLI 工具失败:', error)
    }
  }
  
  /**
   * 注册内置工具
   */
  private registerBuiltinTools(): void {
    // 文件操作工具
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
      handler: async (args) => {
        const { readFile } = await import('fs/promises')
        const path = args.path as string
        const limit = args.limit as number
        const offset = args.offset as number
        
        let content = await readFile(path, 'utf-8')
        const lines = content.split('\n')
        
        if (offset && offset > 0) {
          content = lines.slice(offset).join('\n')
        }
        if (limit && limit > 0) {
          const lineOffset = offset || 0
          content = lines.slice(lineOffset, lineOffset + limit).join('\n')
        }
        
        return { success: true, result: { content, path, lines: lines.length } }
      },
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
      handler: async (args) => {
        const { writeFile } = await import('fs/promises')
        await writeFile(args.path as string, args.content as string, 'utf-8')
        return { success: true, result: { path: args.path, written: true } }
      },
    })
    
    this.registerBuiltinTool({
      name: 'FileEdit',
      displayName: '编辑文件',
      description: '编辑文件内容（替换）',
      category: TOOL_CATEGORIES.FILE.id,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径' },
          old_string: { type: 'string', description: '要替换的文本' },
          new_string: { type: 'string', description: '替换后的文本' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
      isReadOnly: false,
      isConcurrencySafe: false,
      handler: async (args) => {
        const { readFile, writeFile } = await import('fs/promises')
        const path = args.path as string
        const content = await readFile(path, 'utf-8')
        
        if (!content.includes(args.old_string as string)) {
          return { success: false, error: '未找到要替换的文本' }
        }
        
        const newContent = content.replace(args.old_string as string, args.new_string as string)
        await writeFile(path, newContent, 'utf-8')
        
        return { success: true, result: { path, edited: true } }
      },
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
      handler: async (args) => {
        const { glob } = await import('glob')
        const files = await glob(args.pattern as string, {
          cwd: (args.path as string) || this.projectRoot,
          ignore: ['**/node_modules/**', '**/.git/**'],
        })
        return { success: true, result: { files, count: files.length } }
      },
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
      handler: async (args) => {
        const { glob } = await import('glob')
        const { readFile } = await import('fs/promises')
        const { join } = await import('path')
        
        const pattern = new RegExp(args.pattern as string, 'gi')
        const files = await glob('**/*.{ts,js,json,md}', {
          cwd: (args.path as string) || this.projectRoot,
          ignore: ['**/node_modules/**'],
        })
        
        const matches: string[] = []
        for (const file of files.slice(0, 50)) {
          try {
            const content = await readFile(join((args.path as string) || this.projectRoot, file), 'utf-8')
            const lines = content.split('\n')
            lines.forEach((line, i) => {
              if (pattern.test(line)) {
                matches.push(`${file}:${i + 1}: ${line.trim()}`)
              }
            })
            pattern.lastIndex = 0
          } catch { /* skip */ }
        }
        
        return { success: true, result: { matches, count: matches.length } }
      },
    })
    
    // Shell 工具
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
      handler: async (args) => {
        const { spawn } = await import('child_process')
        
        return new Promise((resolve) => {
          const isWindows = process.platform === 'win32'
          const shell = isWindows ? 'powershell.exe' : '/bin/bash'
          const shellArgs = isWindows 
            ? ['-NoProfile', '-Command', args.command as string]
            : ['-c', args.command as string]
          
          const child = spawn(shell, shellArgs, {
            cwd: (args.cwd as string) || this.projectRoot,
            timeout: (args.timeout as number) || 60000,
          })
          
          let stdout = ''
          let stderr = ''
          
          child.stdout?.on('data', (data) => { stdout += data.toString() })
          child.stderr?.on('data', (data) => { stderr += data.toString() })
          
          child.on('close', (code) => {
            resolve({ 
              success: code === 0, 
              result: { stdout, stderr, exitCode: code },
              error: code !== 0 ? stderr : undefined,
            })
          })
          
          child.on('error', (err) => {
            resolve({ success: false, error: err.message })
          })
          
          setTimeout(() => {
            child.kill()
            resolve({ success: false, error: '命令执行超时' })
          }, (args.timeout as number) || 60000)
        })
      },
    })
    
    // Web 工具
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
      handler: async (args) => {
        const query = args.query as string
        const response = await fetch(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`,
          { headers: { 'Accept': 'application/json' } }
        )
        
        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` }
        }
        
        const data = await response.json() as { AbstractText?: string; RelatedTopics?: Array<{ Text?: string }> }
        const results: string[] = []
        
        if (data.AbstractText) {
          results.push(data.AbstractText)
        }
        if (data.RelatedTopics) {
          results.push(...data.RelatedTopics.slice(0, 5).map(t => t.Text || '').filter(Boolean))
        }
        
        return { success: true, result: { query, results, count: results.length } }
      },
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
      handler: async (args) => {
        const url = args.url as string
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        })
        
        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}` }
        }
        
        const contentType = response.headers.get('content-type') || ''
        let content: string
        
        if (contentType.includes('application/json')) {
          const json = await response.json()
          content = JSON.stringify(json, null, 2)
        } else {
          content = await response.text()
        }
        
        if (content.length > 8000) {
          content = content.substring(0, 8000) + '\n\n... (内容已截断)'
        }
        
        return { success: true, result: { url, content, contentType } }
      },
    })
    
    // 任务管理工具
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
      handler: async (args) => {
        const { readFile, writeFile } = await import('fs/promises')
        const { join } = await import('path')
        
        const todoPath = join(this.projectRoot, '.haha-todos.json')
        let existingTodos: Array<{ id: string; status: string; content: string }> = []
        
        if (args.merge !== false) {
          try {
            const content = await readFile(todoPath, 'utf-8')
            existingTodos = JSON.parse(content)
          } catch { /* ignore */ }
        }
        
        const todos = ((args.todos as Array<{ status?: string; content?: string; id?: string }>) || []).map(t => ({
          id: t.id || uuidv4(),
          status: t.status || 'pending',
          content: t.content || '',
        }))
        
        const allTodos = (args.merge !== false) ? [...existingTodos, ...todos] : todos
        await writeFile(todoPath, JSON.stringify(allTodos, null, 2), 'utf-8')
        
        return { success: true, result: { todos: allTodos, count: allTodos.length } }
      },
    })
    
    // 配置工具
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
      handler: async (args) => {
        const { readFile, writeFile } = await import('fs/promises')
        const { join } = await import('path')
        
        const configPath = join(this.projectRoot, '.haha-config.json')
        let config: Record<string, string> = {}
        
        try {
          const content = await readFile(configPath, 'utf-8')
          config = JSON.parse(content)
        } catch { /* ignore */ }
        
        if (args.list) {
          return { success: true, result: { config, count: Object.keys(config).length } }
        }
        
        if (args.value !== undefined) {
          config[args.key as string] = args.value as string
          await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
          return { success: true, result: { [args.key as string]: args.value } }
        }
        
        return { success: true, result: { [args.key as string]: config[args.key as string] || null } }
      },
    })
    
    console.log(`[ToolRegistry] 注册了 ${this.builtinTools.size} 个内置工具`)
  }
  
  /**
   * 注册内置工具
   */
  registerBuiltinTool(tool: Omit<RegisteredTool, 'id' | 'source' | 'isEnabled' | 'permissions'>): void {
    const id = uuidv4()
    const registeredTool: RegisteredTool = {
      id,
      source: 'builtin',
      isEnabled: true,
      permissions: [],
      ...tool,
    }
    
    this.builtinTools.set(tool.name, registeredTool)
    
    // 注册别名
    if (tool.aliases) {
      for (const alias of tool.aliases) {
        this.builtinTools.set(alias, registeredTool)
      }
    }
    
    // 注册处理器
    if (tool.handler) {
      this.toolHandlers.set(tool.name, tool.handler)
    }
  }
  
  /**
   * 从 CLI 适配器注册工具
   */
  private registerToolFromAdapter(adapter: CLIToolAdapter, source: 'cli' | 'mcp' = 'cli'): void {
    const tool: RegisteredTool = {
      id: uuidv4(),
      name: adapter.name,
      displayName: adapter.name,
      description: adapter.description,
      category: adapter.category,
      inputSchema: adapter.inputSchema,
      source,
      aliases: adapter.aliases,
      isEnabled: adapter.isEnabled(),
      isReadOnly: adapter.isReadOnly(),
      isConcurrencySafe: adapter.isConcurrencySafe(),
      permissions: [],
      handler: (args) => adapter.call(args),
    }
    
    const map = source === 'cli' ? this.cliTools : this.mcpTools
    map.set(adapter.name, tool)
    
    if (adapter.handler) {
      this.toolHandlers.set(adapter.name, adapter.handler)
    }
  }
  
  // ==================== 工具查询 ====================
  
  /**
   * 获取所有工具
   */
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
  
  /**
   * 通过名称获取工具
   */
  getTool(name: string): RegisteredTool | undefined {
    return (
      this.builtinTools.get(name) ||
      this.cliTools.get(name) ||
      this.mcpTools.get(name) ||
      this.customTools.get(name)
    )
  }
  
  /**
   * 按类别获取工具
   */
  getToolsByCategory(category: string): RegisteredTool[] {
    return this.getAllTools().filter(t => t.category === category)
  }
  
  /**
   * 获取工具列表（简化格式）
   */
  getToolList(): ToolDefinition[] {
    return this.getAllTools().map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      category: t.category,
      aliases: t.aliases,
      isEnabled: t.isEnabled,
      isReadOnly: t.isReadOnly,
    }))
  }
  
  /**
   * 获取按类别分组的工具
   */
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
  
  /**
   * 搜索工具
   */
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
  
  /**
   * 执行工具
   */
  async executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const id = uuidv4()
    const startTime = Date.now()
    
    this.emit('tool_start', { id, ...request })
    
    // 创建执行事件数据
    const eventBase: Omit<ToolExecutionEvent, 'progress' | 'timestamp'> = {
      toolName: request.toolName,
      executionId: id,
      sessionId: request.sessionId,
      input: request.toolInput,
    }
    
    // 触发 tool.execution_started 事件
    const startEvent: ToolExecutionEvent = {
      ...eventBase,
      timestamp: startTime,
      progress: { type: 'start', data: request.toolInput },
    }
    this.broadcastExecutionEvent('tool.execution_started', startEvent)
    
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
      this.emit('tool_end', result)
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
      this.emit('tool_end', result)
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
      this.emit('tool_end', result)
      return result
    }
    
    try {
      const response = await handler(request.toolInput)
      
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
      this.emit('tool_end', result)
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
      this.emit('tool_end', result)
      return result
    }
  }
  
  /**
   * 添加到执行历史
   */
  private addToHistory(result: ToolExecutionResult): void {
    this.executionHistory.unshift(result)
    
    // 限制历史大小
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(0, this.maxHistorySize)
    }
  }
  
  /**
   * 获取执行历史
   */
  getHistory(limit: number = 50): ToolExecutionResult[] {
    return this.executionHistory.slice(0, limit)
  }
  
  /**
   * 清空历史
   */
  clearHistory(): void {
    this.executionHistory = []
  }
  
  // ==================== 工具管理 ====================
  
  /**
   * 注册自定义工具
   */
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
    
    this.emit('tool_registered', registeredTool)
  }
  
  /**
   * 移除自定义工具
   */
  removeCustomTool(name: string): boolean {
    this.toolHandlers.delete(name)
    const removed = this.customTools.delete(name)
    if (removed) {
      this.emit('tool_unregistered', { name })
    }
    return removed
  }
  
  /**
   * 启用/禁用工具
   */
  setToolEnabled(name: string, enabled: boolean): boolean {
    const tool = this.getTool(name)
    if (tool) {
      tool.isEnabled = enabled
      this.emit('tool_enabled_changed', { name, enabled })
      return true
    }
    return false
  }
  
  // ==================== MCP 工具管理 ====================
  
  /**
   * 注册 MCP 工具
   */
  registerMCPTool(tool: RegisteredTool, serverId: string): void {
    tool.serverId = serverId
    tool.source = 'mcp'
    this.mcpTools.set(tool.name, tool)
    
    if (tool.handler) {
      this.toolHandlers.set(tool.name, tool.handler)
    }
    
    this.emit('mcp_tool_registered', tool)
  }
  
  /**
   * 移除 MCP 服务器的所有工具
   */
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
      this.emit('mcp_tools_removed', { serverId, tools: toolsToRemove })
    }
  }
  
  // ==================== 统计信息 ====================
  
  /**
   * 获取统计信息
   */
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
      
      if (tool.isEnabled) {
        enabled++
      } else {
        disabled++
      }
      
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

/**
 * 获取工具注册中心单例
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
 * 初始化工具注册中心
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
  
  await toolRegistryInstance.initialize()
  return toolRegistryInstance
}

export default ToolRegistry
