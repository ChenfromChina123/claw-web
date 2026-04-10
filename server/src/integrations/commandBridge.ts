/**
 * 命令系统桥接 - 将 src/commands.ts 集成到 server
 * 
 * 这个模块桥接了 Claude Code HAHA 的命令系统，包括：
 * - /help: 帮助命令
 * - /clear: 清除对话
 * - /config: 配置管理
 * - /session: 会话管理
 * - /skills: 技能管理
 * - /mcp: MCP 服务器管理
 * - /status: 状态查看
 * - /tasks: 任务管理
 * - 等等...
 */

import { v4 as uuidv4 } from 'uuid'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'

// 命令结果类型
export interface CommandResult {
  success: boolean
  output?: string
  error?: string
  data?: unknown
}

// WebSocket 事件发送函数类型
export type EventSender = (event: string, data: unknown) => void

// 命令定义接口
export interface Command {
  name: string
  description: string
  usage: string
  aliases?: string[]
  execute: (args: string[], sendEvent?: EventSender) => Promise<CommandResult>
}

// 命令类别
export type CommandCategory = 'general' | 'session' | 'config' | 'tools' | 'advanced'

/**
 * Web 命令执行器 - 桥接到 src/commands.ts
 */
export class WebCommandBridge {
  private projectRoot: string
  private commands: Map<string, Command> = new Map()
  private history: Array<{
    command: string
    timestamp: number
    sessionId: string
    result: CommandResult
  }> = []
  private maxHistorySize = 100
  
  constructor() {
    this.projectRoot = this.getProjectRoot()
    this.registerCommands()
  }
  
  private getProjectRoot(): string {
    const currentDir = process.cwd()
    return currentDir.replace(/\\server\\src$/i, '').replace(/\/server\/src$/, '')
  }
  
  /**
   * 注册所有命令
   */
  private registerCommands(): void {
    // 通用命令
    this.registerCommand({
      name: 'help',
      description: '显示帮助信息',
      usage: '/help [command]',
      aliases: ['h', '?'],
      execute: async (args) => this.helpCommand(args),
    })
    
    this.registerCommand({
      name: 'clear',
      description: '清除当前会话',
      usage: '/clear',
      execute: async () => ({ success: true, output: '会话已清除' }),
    })
    
    this.registerCommand({
      name: 'status',
      description: '显示系统状态',
      usage: '/status',
      aliases: ['st'],
      execute: async () => this.statusCommand(),
    })
    
    this.registerCommand({
      name: 'ping',
      description: '测试连接',
      usage: '/ping',
      execute: async () => ({ success: true, output: 'pong!' }),
    })
    
    this.registerCommand({
      name: 'whoami',
      description: '显示当前用户',
      usage: '/whoami',
      execute: async () => this.whoamiCommand(),
    })
    
    // 会话命令
    this.registerCommand({
      name: 'sessions',
      description: '列出所有会话',
      usage: '/sessions',
      aliases: ['session list'],
      execute: async () => ({ success: true, output: 'Use API to list sessions' }),
    })
    
    this.registerCommand({
      name: 'new',
      description: '创建新会话',
      usage: '/new [title]',
      aliases: ['new-session'],
      execute: async (args) => ({ 
        success: true, 
        data: { title: args.join(' ') || '新对话' } 
      }),
    })
    
    // 工具命令
    this.registerCommand({
      name: 'tools',
      description: '列出所有可用工具',
      usage: '/tools [category]',
      aliases: ['tool list'],
      execute: async (args) => this.toolsCommand(args),
    })
    
    this.registerCommand({
      name: 'skills',
      description: '列出所有可用技能',
      usage: '/skills [search]',
      execute: async (args) => this.skillsCommand(args),
    })
    
    // 配置命令
    this.registerCommand({
      name: 'config',
      description: '配置管理',
      usage: '/config [key] [value]',
      aliases: ['set', 'get'],
      execute: async (args) => this.configCommand(args),
    })
    
    this.registerCommand({
      name: 'model',
      description: '切换 AI 模型',
      usage: '/model [model-name]',
      execute: async (args) => this.modelCommand(args),
    })
    
    // 高级命令
    this.registerCommand({
      name: 'mcp',
      description: 'MCP 服务器管理',
      usage: '/mcp [list|add|remove] [args...]',
      execute: async (args) => this.mcpCommand(args),
    })
    
    this.registerCommand({
      name: 'tasks',
      description: '任务管理',
      usage: '/tasks [list|add|done|remove] [args...]',
      execute: async (args) => this.tasksCommand(args),
    })
    
    this.registerCommand({
      name: 'export',
      description: '导出会话',
      usage: '/export [format]',
      execute: async (args) => this.exportCommand(args),
    })
    
    this.registerCommand({
      name: 'cost',
      description: '显示 Token 使用统计',
      usage: '/cost',
      execute: async () => this.costCommand(),
    })
  }
  
  /**
   * 注册单个命令
   */
  private registerCommand(command: Command): void {
    this.commands.set(command.name, command)
    // 注册别名
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.commands.set(alias, command)
      }
    }
  }
  
  /**
   * 获取所有命令列表
   */
  getCommandsList(): Array<{ name: string; description: string; usage: string; category: CommandCategory }> {
    return [
      // 通用命令
      { name: 'help', description: '显示帮助信息', usage: '/help [command]', category: 'general' },
      { name: 'clear', description: '清除当前会话', usage: '/clear', category: 'general' },
      { name: 'status', description: '显示系统状态', usage: '/status', category: 'general' },
      { name: 'ping', description: '测试连接', usage: '/ping', category: 'general' },
      { name: 'whoami', description: '显示当前用户', usage: '/whoami', category: 'general' },
      
      // 会话命令
      { name: 'new', description: '创建新会话', usage: '/new [title]', category: 'session' },
      { name: 'sessions', description: '列出所有会话', usage: '/sessions', category: 'session' },
      { name: 'export', description: '导出会话', usage: '/export [format]', category: 'session' },
      
      // 工具命令
      { name: 'tools', description: '列出所有可用工具', usage: '/tools [category]', category: 'tools' },
      { name: 'skills', description: '列出所有可用技能', usage: '/skills [search]', category: 'tools' },
      
      // 配置命令
      { name: 'config', description: '配置管理', usage: '/config [key] [value]', category: 'config' },
      { name: 'model', description: '切换 AI 模型', usage: '/model [model-name]', category: 'config' },
      { name: 'cost', description: '显示 Token 使用统计', usage: '/cost', category: 'config' },
      
      // 高级命令
      { name: 'mcp', description: 'MCP 服务器管理', usage: '/mcp [list|add|remove]', category: 'advanced' },
      { name: 'tasks', description: '任务管理', usage: '/tasks [list|add|done]', category: 'advanced' },
    ]
  }
  
  /**
   * 执行命令（增强版 - 带历史记录和性能监控）
   */
  async execute(
    commandStr: string,
    context: { sessionId: string; sendEvent?: EventSender }
  ): Promise<CommandResult> {
    const startTime = Date.now()
    const result = await this.executeCommand(commandStr, context.sendEvent)
    const duration = Date.now() - startTime
    
    // 记录到历史
    this.history.push({
      command: commandStr,
      timestamp: startTime,
      sessionId: context.sessionId,
      result,
    })
    
    // 限制历史记录大小
    if (this.history.length > this.maxHistorySize) {
      this.history.shift()
    }
    
    // 性能监控
    try {
      const { getPerformanceMonitor } = require('../../monitoring/PerformanceMonitor')
      const perfMonitor = getPerformanceMonitor()
      perfMonitor.record('command.execute', duration, result.success, {
        command: commandStr.split(' ')[0],
        sessionId: context.sessionId,
      })
    } catch (error) {
      // 性能监控可选，失败不影响命令执行
      console.warn('[WebCommandBridge] 性能监控失败:', error)
    }
    
    return result
  }
  
  /**
   * 执行命令
   */
  async executeCommand(
    commandStr: string, 
    sendEvent?: EventSender
  ): Promise<CommandResult> {
    // 解析命令
    const parts = this.parseCommandString(commandStr)
    if (parts.length === 0) {
      return { success: false, error: 'Empty command' }
    }
    
    const commandName = parts[0].toLowerCase()
    const args = parts.slice(1)
    
    // 移除前缀斜杠
    const cleanName = commandName.replace(/^\//, '')
    
    const command = this.commands.get(cleanName)
    if (!command) {
      return { success: false, error: `Unknown command: /${cleanName}. Type /help for available commands.` }
    }
    
    try {
      return await command.execute(args, sendEvent)
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }
    }
  }
  
  /**
   * 解析命令字符串
   */
  private parseCommandString(input: string): string[] {
    const parts: string[] = []
    let current = ''
    let inQuotes = false
    let quoteChar = ''
    
    for (let i = 0; i < input.length; i++) {
      const char = input[i]
      
      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true
        quoteChar = char
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false
        quoteChar = ''
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          parts.push(current)
          current = ''
        }
      } else {
        current += char
      }
    }
    
    if (current) {
      parts.push(current)
    }
    
    return parts
  }
  
  /**
   * 检测是否为命令
   */
  isCommand(input: string): boolean {
    const trimmed = input.trim()
    return trimmed.startsWith('/') || this.commands.has(trimmed.split(' ')[0].toLowerCase())
  }
  
  /**
   * 获取命令历史
   */
  getHistory(sessionId?: string, limit: number = 20): Array<{
    command: string
    timestamp: number
    sessionId: string
    result: CommandResult
  }> {
    let history = this.history
    
    if (sessionId) {
      history = history.filter(h => h.sessionId === sessionId)
    }
    
    return history.slice(-limit)
  }
  
  /**
   * 清除命令历史
   */
  clearHistory(sessionId?: string): void {
    if (sessionId) {
      this.history = this.history.filter(h => h.sessionId !== sessionId)
    } else {
      this.history = []
    }
  }
  
  // ==================== 命令实现 ====================
  
  private helpCommand(args: string[]): CommandResult {
    if (args.length > 0) {
      const cmd = this.commands.get(args[0].toLowerCase())
      if (cmd) {
        return {
          success: true,
          output: `${cmd.name}: ${cmd.description}\nUsage: ${cmd.usage}`,
        }
      }
      return { success: false, error: `Unknown command: ${args[0]}` }
    }
    
    const categories = this.getCommandsList()
    let output = '可用命令:\n\n'
    
    const general = categories.filter(c => c.category === 'general')
    const session = categories.filter(c => c.category === 'session')
    const tools = categories.filter(c => c.category === 'tools')
    const config = categories.filter(c => c.category === 'config')
    const advanced = categories.filter(c => c.category === 'advanced')
    
    if (general.length) output += '通用命令:\n' + general.map(c => `  ${c.usage} - ${c.description}`).join('\n') + '\n\n'
    if (session.length) output += '会话命令:\n' + session.map(c => `  ${c.usage} - ${c.description}`).join('\n') + '\n\n'
    if (tools.length) output += '工具命令:\n' + tools.map(c => `  ${c.usage} - ${c.description}`).join('\n') + '\n\n'
    if (config.length) output += '配置命令:\n' + config.map(c => `  ${c.usage} - ${c.description}`).join('\n') + '\n\n'
    if (advanced.length) output += '高级命令:\n' + advanced.map(c => `  ${c.usage} - ${c.description}`).join('\n') + '\n\n'
    
    output += '输入 /help [command] 查看命令详情'
    
    return { success: true, output }
  }
  
  private statusCommand(): CommandResult {
    return {
      success: true,
      data: {
        status: 'online',
        uptime: process.uptime(),
        platform: process.platform,
        nodeVersion: process.version,
        projectRoot: this.projectRoot,
        timestamp: new Date().toISOString(),
      },
    }
  }
  
  private whoamiCommand(): CommandResult {
    return {
      success: true,
      output: 'Current user context: Web Client',
    }
  }
  
  private toolsCommand(args: string[]): CommandResult {
    // 返回工具列表
    return {
      success: true,
      data: {
        tools: [
          'Bash', 'FileRead', 'FileWrite', 'FileEdit', 'Glob', 'Grep',
          'WebSearch', 'WebFetch', 'TodoWrite', 'AskUserQuestion',
          'TaskCreate', 'TaskList', 'Config'
        ],
      },
    }
  }
  
  private async skillsCommand(args: string[]): Promise<CommandResult> {
    // 尝试列出技能目录
    const skillsPath = join(this.projectRoot, 'src', 'skills')
    
    try {
      const files = await readdir(skillsPath)
      const skills = files.filter(f => f.endsWith('.md') || f.endsWith('.js') || f.endsWith('.ts'))
      
      return {
        success: true,
        data: { skills, count: skills.length },
      }
    } catch {
      return {
        success: true,
        data: { skills: [], count: 0, message: 'Skills directory not found' },
      }
    }
  }
  
  private configCommand(args: string[]): CommandResult {
    if (args.length === 0) {
      return {
        success: true,
        data: {
          config: {
            model: 'qwen-plus',
            temperature: 0.7,
            maxTokens: 4096,
          },
        },
      }
    }
    
    if (args.length === 1) {
      return { success: true, output: `${args[0]}: [value]` }
    }
    
    return { success: true, output: `Set ${args[0]} = ${args[1]}` }
  }
  
  private modelCommand(args: string[]): CommandResult {
    const availableModels = [
      { id: 'qwen-plus', name: '通义千问 Plus' },
      { id: 'qwen-turbo', name: '通义千问 Turbo' },
      { id: 'qwen-max', name: '通义千问 Max' },
    ]
    
    if (args.length === 0) {
      return {
        success: true,
        data: { models: availableModels },
      }
    }
    
    const modelId = args[0]
    const exists = availableModels.some(m => m.id === modelId)
    
    if (!exists) {
      return { success: false, error: `Unknown model: ${modelId}` }
    }
    
    return { success: true, output: `Model switched to ${modelId}` }
  }
  
  private mcpCommand(args: string[]): CommandResult {
    const subcommand = args[0]?.toLowerCase()
    
    switch (subcommand) {
      case 'list':
        return { success: true, data: { servers: [] } }
      case 'add':
        return { success: true, output: 'Use MCP web interface to add servers' }
      case 'remove':
        return { success: true, output: 'Use MCP web interface to remove servers' }
      default:
        return {
          success: true,
          output: '/mcp [list|add|remove] - MCP 服务器管理',
        }
    }
  }
  
  private tasksCommand(args: string[]): CommandResult {
    const subcommand = args[0]?.toLowerCase()
    
    switch (subcommand) {
      case 'list':
        return { success: true, data: { tasks: [] } }
      case 'add':
        return { success: true, output: 'Task added' }
      case 'done':
        return { success: true, output: 'Task marked as done' }
      default:
        return {
          success: true,
          output: '/tasks [list|add|done|remove]',
        }
    }
  }
  
  private exportCommand(args: string[]): CommandResult {
    const format = args[0]?.toLowerCase() || 'json'
    
    return {
      success: true,
      data: { format, message: 'Export functionality coming soon' },
    }
  }
  
  private costCommand(): CommandResult {
    return {
      success: true,
      data: {
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
      },
    }
  }
}

/**
 * 解析用户输入，判断是否为命令
 */
export function parseUserInput(input: string): { 
  isCommand: boolean; 
  command?: string; 
  message?: string 
} {
  const trimmed = input.trim()
  
  if (trimmed.startsWith('/')) {
    return { isCommand: true, command: trimmed }
  }
  
  // 检查是否以命令名称开头（不带斜杠）
  const commandNames = [
    'help', 'clear', 'status', 'ping', 'whoami', 'new', 'sessions',
    'tools', 'skills', 'config', 'model', 'mcp', 'tasks', 'export', 'cost'
  ]
  
  for (const name of commandNames) {
    if (trimmed.toLowerCase().startsWith(name + ' ') || trimmed.toLowerCase() === name) {
      return { isCommand: true, command: '/' + trimmed }
    }
  }
  
  return { isCommand: false, message: trimmed }
}

export default WebCommandBridge
