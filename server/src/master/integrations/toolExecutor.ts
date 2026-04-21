/**
 * 工具系统桥接 - 将 src/tools.ts 完整集成到 server
 * 
 * 这个模块桥接了完整的 Claude Code HAHA 工具系统，包括：
 * - BashTool: 执行 shell 命令
 * - FileReadTool: 读取文件
 * - FileWriteTool: 写入文件
 * - FileEditTool: 编辑文件
 * - GlobTool: 文件模式匹配
 * - GrepTool: 内容搜索
 * - WebSearchTool: 网络搜索
 * - WebFetchTool: 网页抓取
 * - AgentTool: Agent 调用
 * - SkillTool: 技能调用
 * - 等等...
 */

import { v4 as uuidv4 } from 'uuid'
import { readFile, writeFile, stat } from 'fs/promises'
import { join, resolve, relative } from 'path'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import crypto from 'crypto'
import os from 'os'
import dns from 'dns'
import { BackgroundTaskManager, TaskPriority } from '../services/backgroundTaskManager'
import { getPerformanceMonitor } from '../monitoring/PerformanceMonitor'
import { truncateToolResult, truncateFileRead, TOOL_RESULT_LIMITS, FILE_READ_LIMITS } from '../utils/fileLimits'
import { getPermissionPipeline, type ToolUseContext } from '../services/permissionPipeline'
import { getDenialTracker, integratedDenialCheck } from '../services/denialTracker'

const execAsync = promisify(exec)
const dnsLookup = promisify(dns.lookup)
const dnsResolve = promisify(dns.resolve)

/**
 * 全局后台任务管理器实例（供 toolExecutor 使用）
 */
export const backgroundTaskManager = new BackgroundTaskManager({
  maxConcurrentTasks: 5,
  defaultPriority: TaskPriority.NORMAL,
  taskTimeout: 300000,
  enablePersistence: false,
})

// 工具执行结果类型
export interface ToolResult {
  success: boolean
  result?: unknown
  error?: string
  output?: string
}

// WebSocket 事件发送函数类型
export type EventSender = (event: string, data: unknown) => void

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  sessionId?: string
  userId?: string
  workspaceRoot?: string
  permissionMode?: 'normal' | 'bypassPermissions' | 'readonly'
}

/**
 * 工具执行结果（增强版）
 */
export interface EnhancedToolResult {
  success: boolean
  result?: unknown
  error?: string
  output?: string
  truncated?: boolean
  originalSize?: number
  truncatedAt?: number
  permissionDenied?: boolean
  permissionReason?: string
}

/**
 * Web 工具执行器 - 桥接到 src/tools.ts
 */
export class WebToolExecutor {
  private projectRoot: string
  private auditLog: Array<{
    toolName: string
    input: Record<string, unknown>
    result: EnhancedToolResult
    duration: number
    sessionId: string
    timestamp: number
  }> = []
  private maxAuditSize = 1000
  
  // 限流配置
  private rateLimits: Map<string, { count: number; resetAt: number }> = new Map()
  private defaultRateLimit = 100  // 每分钟 100 次
  private rateLimitWindow = 60000 // 1 分钟
  
  constructor() {
    this.projectRoot = this.getProjectRoot()
  }
  
  private getProjectRoot(): string {
    // 从 server/src 向上两级到达项目根目录
    const currentDir = process.cwd()
    return currentDir.replace(/\\server\\src$/i, '').replace(/\/server\/src$/, '')
  }
  
  private resolvePath(relativePath: string): string {
    if (relativePath.startsWith('/') || /^[a-zA-Z]:/.test(relativePath)) {
      return relativePath
    }
    return resolve(this.projectRoot, relativePath)
  }
  
  /**
   * 获取所有可用工具的列表
   */
  getToolsList(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return [
      {
        name: 'Bash',
        description: 'Execute shell commands in terminal',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to execute' },
            cwd: { type: 'string', description: 'Working directory' },
            timeout: { type: 'number', description: 'Timeout in milliseconds' },
          },
          required: ['command'],
        },
      },
      {
        name: 'FileRead',
        description: 'Read contents of a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file' },
            limit: { type: 'number', description: 'Max lines to read' },
            offset: { type: 'number', description: 'Starting line number' },
          },
          required: ['path'],
        },
      },
      {
        name: 'FileWrite',
        description: 'Write content to a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file' },
            content: { type: 'string', description: 'Content to write' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'FileEdit',
        description: 'Edit a file by replacing text',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file' },
            old_string: { type: 'string', description: 'Text to find and replace' },
            new_string: { type: 'string', description: 'Replacement text' },
          },
          required: ['path', 'old_string', 'new_string'],
        },
      },
      {
        name: 'Glob',
        description: 'List files matching a glob pattern',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Glob pattern (e.g., **/*.ts)' },
            path: { type: 'string', description: 'Base directory' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'Grep',
        description: 'Search for patterns in files',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern to search' },
            path: { type: 'string', description: 'Directory or file to search' },
            output_mode: { type: 'string', description: 'Output format: content, files_with_matches, count' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'WebSearch',
        description: 'Search the web for information',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            search_term: { type: 'string', description: 'Alternative search term' },
          },
          required: ['query'],
        },
      },
      {
        name: 'WebFetch',
        description: 'Fetch content from a URL',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL to fetch' },
          },
          required: ['url'],
        },
      },
      {
        name: 'TodoWrite',
        description: 'Create or update a todo item',
        inputSchema: {
          type: 'object',
          properties: {
            todos: { 
              type: 'array', 
              description: 'Array of todo items',
              items: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['in_progress', 'pending', 'completed', 'cancelled'] },
                  content: { type: 'string', description: 'Todo content' },
                  id: { type: 'string', description: 'Todo ID' },
                },
              },
            },
            merge: { type: 'boolean', description: 'Merge with existing todos' },
          },
          required: ['todos'],
        },
      },
      {
        name: 'AskUserQuestion',
        description: 'Ask the user a question',
        inputSchema: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'Question to ask user' },
            options: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'Answer options (optional)',
            },
          },
          required: ['question'],
        },
      },
      {
        name: 'TaskCreate',
        description: 'Create a new task',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description' },
          },
          required: ['title'],
        },
      },
      {
        name: 'TaskList',
        description: 'List all tasks',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string', description: 'Filter by status' },
          },
        },
      },
      {
        name: 'Config',
        description: 'Get or set configuration values',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'Config key' },
            value: { type: 'string', description: 'Config value to set' },
          },
          required: ['key'],
        },
      },
    ]
  }
  
  /**
   * 执行工具（增强版 - 带限流、审计日志和性能监控）
   */
  async executeTool(
    name: string, 
    input: Record<string, unknown>, 
    sendEvent?: EventSender,
    sessionId: string = 'default'
  ): Promise<ToolResult> {
    const startTime = Date.now()
    const toolId = uuidv4()
    
    // 检查限流
    if (!this.checkRateLimit(name)) {
      const error = `Rate limit exceeded for tool: ${name}`
      sendEvent?.('tool_error', { id: toolId, name, error })
      return { success: false, error }
    }
    
    sendEvent?.('tool_start', { id: toolId, name, input })
    
    try {
      let result: unknown
      
      switch (name) {
        case 'Bash':
          result = await this.executeBash(input, sendEvent)
          break
        case 'FileRead':
          result = await this.readFileTool(input)
          break
        case 'FileWrite':
          result = await this.writeFileTool(input)
          break
        case 'FileEdit':
          result = await this.editFileTool(input)
          break
        case 'Glob':
          result = await this.globTool(input)
          break
        case 'Grep':
          result = await this.grepTool(input)
          break
        case 'WebSearch':
          result = await this.webSearch(input)
          break
        case 'WebFetch':
          result = await this.webFetch(input)
          break
        case 'HttpRequest':
          result = await this.httpRequest(input)
          break
        case 'TodoWrite':
          result = await this.todoWrite(input)
          break
        case 'TodoList':
          result = await this.todoList(input)
          break
        case 'TodoClear':
          result = await this.todoClear(input)
          break
        case 'AskUserQuestion':
          result = { message: 'Question sent to user', questionId: toolId }
          break
        case 'TaskCreate':
          result = await this.taskCreate(input)
          break
        case 'TaskList':
          result = await this.taskList(input)
          break
        case 'Config':
          result = await this.configTool(input)
          break
        // ========== 系统工具 ==========
        case 'ClipboardRead':
          result = await this.clipboardRead(input)
          break
        case 'ClipboardWrite':
          result = await this.clipboardWrite(input)
          break
        case 'SystemInfo':
          result = await this.systemInfo(input)
          break
        case 'ProcessList':
          result = await this.processList(input)
          break
        case 'EnvGet':
          result = await this.envGet(input)
          break
        case 'EnvSet':
          result = await this.envSet(input)
          break
        // ========== API 工具 ==========
        case 'JsonParse':
          result = await this.jsonParse(input)
          break
        case 'JsonFormat':
          result = await this.jsonFormat(input)
          break
        case 'Base64Encode':
          result = await this.base64Encode(input)
          break
        case 'Base64Decode':
          result = await this.base64Decode(input)
          break
        case 'UrlEncode':
          result = await this.urlEncode(input)
          break
        case 'UrlDecode':
          result = await this.urlDecode(input)
          break
        case 'HashCalculate':
          result = await this.hashCalculate(input)
          break
        case 'UuidGenerate':
          result = await this.uuidGenerate(input)
          break
        case 'Timestamp':
          result = await this.timestampTool(input)
          break
        case 'RandomGenerate':
          result = await this.randomGenerate(input)
          break
        case 'ColorConvert':
          result = await this.colorConvert(input)
          break
        // ========== 网络工具 ==========
        case 'Ping':
          result = await this.pingTool(input)
          break
        case 'DnsLookup':
          result = await this.dnsLookup(input)
          break
        case 'PortScan':
          result = await this.portScan(input)
          break
        case 'Traceroute':
          result = await this.traceroute(input)
          break
        case 'IpInfo':
          result = await this.ipInfo(input)
          break
        case 'NetworkInterfaces':
          result = await this.networkInterfaces(input)
          break
        case 'NetConnect':
          result = await this.netConnect(input)
          break
        case 'WhoisLookup':
          result = await this.whoisLookup(input)
          break
        // ========== 技能工具 ==========
        case 'SkillList':
          result = await this.skillList(input)
          break
        case 'SkillExecute':
          result = await this.skillExecute(input)
          break
        case 'SkillInfo':
          result = await this.skillInfo(input)
          break
        case 'TemplateRender':
          result = await this.templateRender(input)
          break
        case 'MacroExpand':
          result = await this.macroExpand(input)
          break
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
      
      sendEvent?.('tool_end', { id: toolId, name, result })
      
      const toolResult: ToolResult = { success: true, result }
      
      // 记录审计日志
      this.auditLog.push({
        toolName: name,
        input,
        result: toolResult,
        duration: Date.now() - startTime,
        sessionId,
        timestamp: startTime,
      })
      
      // 限制审计日志大小
      if (this.auditLog.length > this.maxAuditSize) {
        this.auditLog.shift()
      }
      
      // 性能监控
      try {
        const perfMonitor = getPerformanceMonitor()
        perfMonitor.record('tool.execute', Date.now() - startTime, true, {
          toolName: name,
          sessionId,
        })
      } catch (error) {
        // 性能监控可选，失败不影响工具执行
        console.warn('[WebToolExecutor] 性能监控失败:', error)
      }
      
      return toolResult
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      sendEvent?.('tool_error', { id: toolId, name, error: errorMessage })
      
      // 记录失败的审计日志
      this.auditLog.push({
        toolName: name,
        input,
        result: { success: false, error: errorMessage },
        duration: Date.now() - startTime,
        sessionId,
        timestamp: startTime,
      })
      
      // 性能监控（失败）
      try {
        const perfMonitor = getPerformanceMonitor()
        perfMonitor.record('tool.execute', Date.now() - startTime, false, {
          toolName: name,
          sessionId,
          error: errorMessage,
        })
      } catch (error) {
        console.warn('[WebToolExecutor] 性能监控失败:', error)
      }
      
      return { success: false, error: errorMessage }
    }
  }
  
  /**
   * 检查限流
   */
  private checkRateLimit(toolName: string): boolean {
    const now = Date.now()
    const limit = this.rateLimits.get(toolName)
    
    if (!limit || now > limit.resetAt) {
      this.rateLimits.set(toolName, {
        count: 1,
        resetAt: now + this.rateLimitWindow,
      })
      return true
    }
    
    if (limit.count >= this.defaultRateLimit) {
      return false
    }
    
    limit.count++
    return true
  }
  
  /**
   * 获取审计日志
   */
  getAuditLog(sessionId?: string, limit: number = 50): Array<{
    toolName: string
    input: Record<string, unknown>
    result: ToolResult
    duration: number
    sessionId: string
    timestamp: number
  }> {
    let log = this.auditLog
    
    if (sessionId) {
      log = log.filter(a => a.sessionId === sessionId)
    }
    
    return log.slice(-limit)
  }
  
  /**
   * 执行 Bash 命令
   */
  private async executeBash(
    input: Record<string, unknown>, 
    sendEvent?: EventSender
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const command = input.command as string
    const cwd = input.cwd as string || this.projectRoot
    const timeout = (input.timeout as number) || 60000
    
    sendEvent?.('tool_progress', { output: `$ ${command}\n` })
    
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32'
      const shell = isWindows ? 'powershell.exe' : '/bin/bash'
      const args = isWindows 
        ? ['-NoProfile', '-Command', command] 
        : ['-c', command]
      
      const child = spawn(shell, args, { 
        cwd, 
        timeout,
        env: { ...process.env }
      })
      
      let stdout = ''
      let stderr = ''
      
      child.stdout?.on('data', (data) => {
        const text = data.toString()
        stdout += text
        sendEvent?.('tool_progress', { output: text })
      })
      
      child.stderr?.on('data', (data) => {
        const text = data.toString()
        stderr += text
        sendEvent?.('tool_progress', { output: `[stderr] ${text}` })
      })
      
      child.on('error', (error) => {
        stderr += error.message
      })
      
      child.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0,
        })
      })
      
      // Timeout handling
      setTimeout(() => {
        child.kill()
        stderr += '\n[Process killed due to timeout]'
        resolve({ stdout, stderr, exitCode: 124 })
      }, timeout)
    })
  }
  
  /**
   * 读取文件
   */
  private async readFile(input: Record<string, unknown>): Promise<{ content: string; path: string }> {
    const filePath = this.resolvePath(input.path as string)
    const limit = input.limit as number
    const offset = input.offset as number
    
    try {
      let content = await readFile(filePath, 'utf-8')
      
      // 处理 offset 和 limit
      const lines = content.split('\n')
      if (offset && offset > 0) {
        content = lines.slice(offset).join('\n')
      }
      if (limit && limit > 0) {
        const lineOffset = offset || 0
        content = lines.slice(lineOffset, lineOffset + limit).join('\n')
      }
      
      return { content, path: filePath }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`)
      }
      throw error
    }
  }
  
  /**
   * 写入文件
   */
  private async writeFileTool(input: Record<string, unknown>): Promise<{ success: boolean; path: string }> {
    const filePath = this.resolvePath(input.path as string)
    const content = input.content as string
    
    await writeFile(filePath, content, 'utf-8')
    return { success: true, path: filePath }
  }
  
  /**
   * 编辑文件
   */
  private async editFile(input: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    const filePath = this.resolvePath(input.path as string)
    const oldString = input.old_string as string
    const newString = input.new_string as string
    
    const content = await readFile(filePath, 'utf-8')
    
    if (!content.includes(oldString)) {
      throw new Error(`Text not found in file: ${oldString.substring(0, 50)}...`)
    }
    
    const newContent = content.replace(oldString, newString)
    await writeFile(filePath, newContent, 'utf-8')
    
    return { success: true, message: 'File edited successfully' }
  }
  
  /**
   * Glob 文件搜索
   */
  private async glob(input: Record<string, unknown>): Promise<{ files: string[] }> {
    const { glob } = await import('glob')
    const pattern = input.pattern as string
    const searchPath = this.resolvePath((input.path as string) || '.')
    
    const files = await glob(pattern, { 
      cwd: searchPath,
      ignore: ['**/node_modules/**', '**/.git/**'],
    })
    
    return { files }
  }
  
  /**
   * Grep 搜索
   */
  private async grep(input: Record<string, unknown>): Promise<{ matches: string[] }> {
    const { glob } = await import('glob')
    const pattern = input.pattern as string
    const searchPath = this.resolvePath((input.path as string) || '.')
    const outputMode = (input.output_mode as string) || 'content'
    
    const matches: string[] = []
    
    // 创建正则表达式
    const regex = new RegExp(pattern, 'g')
    
    // 获取所有要搜索的文件
    const files = await glob('**/*.{ts,js,json,md,txt,html,css,py}', {
      cwd: searchPath,
      ignore: ['**/node_modules/**', '**/.git/**'],
    })
    
    for (const file of files) {
      try {
        const content = await readFile(join(searchPath, file), 'utf-8')
        
        if (outputMode === 'files_with_matches') {
          if (regex.test(content)) {
            matches.push(file)
          }
        } else {
          const lines = content.split('\n')
          lines.forEach((line, index) => {
            regex.lastIndex = 0
            if (regex.test(line)) {
              matches.push(`${file}:${index + 1}: ${line.trim()}`)
            }
          })
        }
      } catch {
        // 跳过无法读取的文件
      }
    }
    
    return { matches }
  }
  
  /**
   * 网络搜索 - 使用 DuckDuckGo Instant Answer API
   */
  private async webSearch(input: Record<string, unknown>): Promise<{ results: string[] }> {
    const query = (input.query as string) || (input.search_term as string)
    
    try {
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&skip_disambig=1`,
        { headers: { 'Accept': 'application/json' } }
      )
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      
      const data = await response.json() as {
        Heading?: string
        AbstractText?: string
        AbstractURL?: string
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>
      }
      
      const results: string[] = []
      
      if (data.AbstractText) {
        results.push(`[摘要] ${data.AbstractText}${data.AbstractURL ? ` (来源: ${data.AbstractURL})` : ''}`)
      }
      
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          if (topic.Text) {
            results.push(`• ${topic.Text}${topic.FirstURL ? ` - ${topic.FirstURL}` : ''}`)
          }
        }
      }
      
      if (results.length === 0) {
        results.push(`未找到 "${query}" 的详细信息。`)
        results.push(`你可以访问 https://duckduckgo.com/?q=${encodeURIComponent(query)} 查看更多搜索结果。`)
      }
      
      return { results }
    } catch (error) {
      console.error('WebSearch error:', error)
      return { 
        results: [
          `搜索 "${query}" 失败: ${error instanceof Error ? error.message : '网络错误'}`,
          '提示: 请检查网络连接或稍后重试'
        ] 
      }
    }
  }
  
  /**
   * 网页抓取
   */
  private async webFetch(input: Record<string, unknown>): Promise<{ content: string; url: string }> {
    const url = input.url as string
    
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const contentType = response.headers.get('content-type') || ''
      let content: string
      
      if (contentType.includes('application/json')) {
        const json = await response.json()
        content = JSON.stringify(json, null, 2)
      } else if (contentType.includes('text/')) {
        content = await response.text()
      } else {
        content = `[无法显示内容] Content-Type: ${contentType}, 大小: ${response.headers.get('content-length') || '未知'}`
      }
      
      if (content.length > 8000) {
        content = content.substring(0, 8000) + '\n\n... (内容已截断)'
      }
      
      return { content, url }
    } catch (error) {
      throw new Error(`Failed to fetch ${url}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  /**
   * Todo 写入
   */
  private async todoWrite(input: Record<string, unknown>): Promise<{ todos: Array<{ id: string; status: string; content: string }> }> {
    const todos = (input.todos as Array<{ status?: string; content?: string; id?: string }>) || []
    const merge = input.merge !== false
    
    // 存储到文件系统
    const todoPath = join(this.projectRoot, '.haha-todos.json')
    
    let existingTodos: Array<{ id: string; status: string; content: string }> = []
    
    if (merge) {
      try {
        const content = await readFile(todoPath, 'utf-8')
        existingTodos = JSON.parse(content)
      } catch {
        // 文件不存在，使用空数组
      }
    }
    
    const newTodos = todos.map(t => ({
      id: t.id || uuidv4(),
      status: t.status || 'pending',
      content: t.content || '',
    }))
    
    const allTodos = merge ? [...existingTodos, ...newTodos] : newTodos
    await writeFile(todoPath, JSON.stringify(allTodos, null, 2), 'utf-8')
    
    return { todos: allTodos }
  }
  
  /**
   * 创建任务
   */
  private async taskCreate(input: Record<string, unknown>): Promise<{ id: string; title: string; taskId: string }> {
    const title = input.title as string
    const description = input.description as string
    
    // 创建后台任务（使用共享的 backgroundTaskManager 实例）
    const task = backgroundTaskManager.createTask({
      name: title,
      description: description as string,
      priority: TaskPriority.NORMAL,
      metadata: {
        source: 'tool',
        createdAt: new Date().toISOString(),
      },
    })
    
    return {
      id: uuidv4(),
      title,
      taskId: task.id,
    }
  }
  
  /**
   * 列出任务
   */
  private async taskList(input: Record<string, unknown>): Promise<{ tasks: Array<{ id: string; title: string; status: string; taskId: string }> }> {
    const allTasks = backgroundTaskManager.getAllTasks()
    
    return {
      tasks: allTasks.map(t => ({
        id: t.id,
        title: t.name,
        status: t.status,
        taskId: t.id,
      })),
    }
  }
  
  /**
   * 配置工具
   */
  private async configTool(input: Record<string, unknown>): Promise<unknown> {
    const key = input.key as string
    const value = input.value as string | undefined
    
    const configPath = join(this.projectRoot, '.haha-config.json')
    
    let config: Record<string, string> = {}
    
    try {
      const content = await readFile(configPath, 'utf-8')
      config = JSON.parse(content)
    } catch {
      // 文件不存在
    }
    
    if (value !== undefined) {
      config[key] = value
      await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
      return { [key]: value }
    }
    
    return { [key]: config[key] || null }
  }

  // ========== 私有工具方法 ==========

  /**
   * 读取文件工具
   */
  private async readFileTool(input: Record<string, unknown>): Promise<{ content: string; path: string }> {
    const path = input.path as string
    const limit = input.limit as number | undefined
    const offset = input.offset as number | undefined

    const resolvedPath = resolve(this.projectRoot, path)
    let content = await readFile(resolvedPath, 'utf-8')

    if (offset) {
      const lines = content.split('\n')
      content = lines.slice(offset).join('\n')
    }

    if (limit) {
      const lines = content.split('\n')
      content = lines.slice(0, limit).join('\n')
    }

    if (content.length > TOOL_RESULT_LIMITS.MAX_CHARS) {
      content = content.substring(0, TOOL_RESULT_LIMITS.MAX_CHARS) + '\n... (内容已截断)'
    }

    return { content, path: resolvedPath }
  }

  /**
   * 编辑文件工具
   */
  private async editFileTool(input: Record<string, unknown>): Promise<{ success: boolean }> {
    const path = input.path as string
    const oldString = input.old_string as string
    const newString = input.new_string as string

    const resolvedPath = resolve(this.projectRoot, path)
    let content = await readFile(resolvedPath, 'utf-8')

    if (!content.includes(oldString)) {
      throw new Error(`未找到要替换的文本: ${oldString.substring(0, 50)}...`)
    }

    content = content.replace(oldString, newString)
    await writeFile(resolvedPath, content, 'utf-8')

    return { success: true }
  }

  /**
   * Glob 工具
   */
  private async globTool(input: Record<string, unknown>): Promise<{ files: string[] }> {
    const { default: glob } = await import('glob')
    const pattern = input.pattern as string
    const path = input.path as string || this.projectRoot

    const files = await glob(pattern, { cwd: path, absolute: false })
    return { files: files.slice(0, 500) }
  }

  /**
   * Grep 工具
   */
  private async grepTool(input: Record<string, unknown>): Promise<{ matches: string[] }> {
    const { default: glob } = await import('glob')
    const { default: grep } = await import('grep-async')

    const pattern = input.pattern as string
    const path = input.path as string || this.projectRoot
    const globPattern = input.glob as string || '**/*'

    const files = await glob(globPattern, { cwd: path, ignore: ['node_modules/**', '.git/**'] })
    const matches: string[] = []

    for (const file of files.slice(0, 100)) {
      try {
        const content = await readFile(resolve(path, file), 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (new RegExp(pattern).test(lines[i])) {
            matches.push(`${file}:${i + 1}: ${lines[i].substring(0, 200)}`)
            if (matches.length >= 250) break
          }
        }
      } catch {
        // 跳过无法读取的文件
      }
      if (matches.length >= 250) break
    }

    return { matches }
  }

  // ========== Todo 列表工具 ==========

  /**
   * Todo 列表
   */
  private async todoList(input: Record<string, unknown>): Promise<{ todos: Array<{ id: string; status: string; content: string }> }> {
    const todoPath = join(this.projectRoot, '.haha-todos.json')

    try {
      const content = await readFile(todoPath, 'utf-8')
      return { todos: JSON.parse(content) }
    } catch {
      return { todos: [] }
    }
  }

  /**
   * Todo 清除
   */
  private async todoClear(input: Record<string, unknown>): Promise<{ success: boolean; cleared: number }> {
    const all = input.all as boolean || false
    const todoPath = join(this.projectRoot, '.haha-todos.json')

    if (all) {
      await writeFile(todoPath, '[]', 'utf-8')
      return { success: true, cleared: 0 }
    }

    try {
      const content = await readFile(todoPath, 'utf-8')
      const todos = JSON.parse(content)
      const remaining = todos.filter((t: any) => t.status !== 'completed')
      const cleared = todos.length - remaining.length
      await writeFile(todoPath, JSON.stringify(remaining, null, 2), 'utf-8')
      return { success: true, cleared }
    } catch {
      return { success: true, cleared: 0 }
    }
  }

  // ========== 系统工具 ==========

  /**
   * 读取剪贴板
   */
  private async clipboardRead(input: Record<string, unknown>): Promise<{ content: string }> {
    try {
      if (process.platform === 'win32') {
        const { stdout } = await execAsync('powershell -Command "Get-Clipboard"')
        return { content: stdout.trim() }
      } else {
        const { stdout } = await execAsync('pbpaste 2>/dev/null || xclip -selection clipboard -o 2>/dev/null || echo ""')
        return { content: stdout.trim() }
      }
    } catch {
      return { content: '' }
    }
  }

  /**
   * 写入剪贴板
   */
  private async clipboardWrite(input: Record<string, unknown>): Promise<{ success: boolean; length: number }> {
    const content = input.content as string
    const newline = input.newline as boolean || false
    let text = content
    if (newline) text += '\n'

    try {
      if (process.platform === 'win32') {
        const escaped = text.replace(/'/g, "''")
        await execAsync(`powershell -Command "Set-Clipboard -Value '${escaped}'"`)
      } else if (process.platform === 'darwin') {
        await execAsync(`echo '${text.replace(/'/g, "\\'")}' | pbcopy`)
      } else {
        await execAsync(`echo '${text}' | xclip -selection clipboard`)
      }
      return { success: true, length: text.length }
    } catch (error) {
      throw new Error(`剪贴板写入失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 系统信息
   */
  private async systemInfo(input: Record<string, unknown>): Promise<{ info: Record<string, unknown> }> {
    const memory = { total: os.totalmem(), free: os.freemem() }
    memory.total - memory.free

    return {
      info: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpuCores: os.cpus().length,
        cpuModel: os.cpus()[0]?.model || 'Unknown',
        totalMemory: memory.total,
        freeMemory: memory.free,
        uptime: os.uptime(),
        nodeVersion: process.version,
        workingDirectory: process.cwd(),
      },
    }
  }

  /**
   * 进程列表
   */
  private async processList(input: Record<string, unknown>): Promise<{ processes: Array<{ pid: number; name: string }> }> {
    const limit = (input.limit as number) || 20

    try {
      let command: string
      if (process.platform === 'win32') {
        command = 'powershell -Command "Get-Process | Select-Object -First 20 Id,ProcessName | ConvertTo-Json"'
      } else {
        command = 'ps aux --no-headers | head -20'
      }

      const { stdout } = await execAsync(command)

      if (process.platform === 'win32') {
        const procs = JSON.parse(stdout)
        const arr = Array.isArray(procs) ? procs : [procs]
        return {
          processes: arr.map((p: any) => ({ pid: p.Id, name: p.ProcessName })).slice(0, limit),
        }
      } else {
        const lines = stdout.split('\n').filter(Boolean)
        return {
          processes: lines.slice(0, limit).map((line) => {
            const parts = line.trim().split(/\s+/)
            return { pid: parseInt(parts[1]) || 0, name: parts[10] || 'unknown' }
          }),
        }
      }
    } catch {
      return { processes: [] }
    }
  }

  /**
   * 获取环境变量
   */
  private async envGet(input: Record<string, unknown>): Promise<{ value: string | null; all?: Record<string, string> }> {
    const key = input.key as string | undefined
    const prefix = input.prefix as string | undefined

    if (key) {
      return { value: process.env[key] || null }
    }

    const env = process.env
    let keys = Object.keys(env)

    if (prefix) {
      keys = keys.filter((k) => k.startsWith(prefix))
    }

    keys.sort()
    const all: Record<string, string> = {}
    for (const k of keys) {
      all[k] = env[k] || ''
    }

    return { value: null, all }
  }

  /**
   * 设置环境变量
   */
  private async envSet(input: Record<string, unknown>): Promise<{ success: boolean; key: string; value: string }> {
    const key = input.key as string
    const value = input.value as string
    const append = input.append as boolean || false

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error('无效的环境变量名称')
    }

    if (append && process.env[key]) {
      process.env[key] = process.env[key] + value
    } else {
      process.env[key] = value
    }

    return { success: true, key, value: process.env[key] || value }
  }

  // ========== API 工具 ==========

  /**
   * JSON 解析
   */
  private async jsonParse(input: Record<string, unknown>): Promise<{ parsed: unknown }> {
    const json = input.json as string
    const strict = input.strict as boolean || false

    try {
      let parseStr = json
      if (!strict) {
        parseStr = json.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      }
      const parsed = JSON.parse(parseStr)
      return { parsed }
    } catch (error) {
      throw new Error(`JSON 解析错误: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * JSON 格式化
   */
  private async jsonFormat(input: Record<string, unknown>): Promise<{ formatted: string }> {
    const json = input.json as string
    const indent = (input.indent as number) || 2
    const minify = input.minify as boolean || false

    try {
      const parsed = JSON.parse(json)
      const formatted = minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, indent)
      return { formatted }
    } catch (error) {
      throw new Error(`JSON 格式化错误: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Base64 编码
   */
  private async base64Encode(input: Record<string, unknown>): Promise<{ encoded: string }> {
    const text = input.text as string
    const urlSafe = input.urlSafe as boolean || false

    const encoded = Buffer.from(text).toString('base64')
    const output = urlSafe ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : encoded

    return { encoded: output }
  }

  /**
   * Base64 解码
   */
  private async base64Decode(input: Record<string, unknown>): Promise<{ decoded: string }> {
    const encoded = input.encoded as string
    const encoding = input.encoding as string || 'utf8'

    try {
      let stdEncoded = encoded.replace(/-/g, '+').replace(/_/g, '/')
      while (stdEncoded.length % 4) stdEncoded += '='
      const decoded = Buffer.from(stdEncoded, 'base64').toString(encoding)
      return { decoded }
    } catch {
      throw new Error('无效的 Base64 字符串')
    }
  }

  /**
   * URL 编码
   */
  private async urlEncode(input: Record<string, unknown>): Promise<{ encoded: string }> {
    const text = input.text as string
    const component = input.component !== false

    const encoded = component ? encodeURIComponent(text) : encodeURI(text)
    return { encoded }
  }

  /**
   * URL 解码
   */
  private async urlDecode(input: Record<string, unknown>): Promise<{ decoded: string }> {
    const text = input.text as string

    try {
      const decoded = decodeURIComponent(text)
      return { decoded }
    } catch {
      throw new Error('无效的 URL 编码字符串')
    }
  }

  /**
   * 计算哈希
   */
  private async hashCalculate(input: Record<string, unknown>): Promise<{ hash: string }> {
    const text = input.text as string
    const algorithm = input.algorithm as string || 'sha256'
    const encoding = input.encoding as string || 'hex'

    const hash = crypto.createHash(algorithm)
    hash.update(text, 'utf8')
    return { hash: hash.digest(encoding as crypto.BinaryToTextEncoding) }
  }

  /**
   * 生成 UUID
   */
  private async uuidGenerate(input: Record<string, unknown>): Promise<{ uuids: string[] }> {
    const count = Math.min((input.count as number) || 1, 100)
    const format = input.format as string || 'standard'

    const uuids: string[] = []
    for (let i = 0; i < count; i++) {
      let uuid = uuidv4()
      if (format === 'no-dash') {
        uuid = uuid.replace(/-/g, '')
      }
      uuids.push(uuid)
    }

    return { uuids }
  }

  /**
   * 时间戳
   */
  private async timestampTool(input: Record<string, unknown>): Promise<{ timestamp: number; iso: string; relative?: string }> {
    const time = input.time as string | undefined
    const format = input.format as string || 'iso'

    let date: Date
    if (time) {
      if (/^\d+$/.test(time)) {
        date = new Date(parseInt(time) < 10000000000 ? parseInt(time) * 1000 : parseInt(time))
      } else {
        date = new Date(time)
      }
    } else {
      date = new Date()
    }

    if (isNaN(date.getTime())) {
      throw new Error('无效的时间格式')
    }

    const result: { timestamp: number; iso: string; relative?: string } = {
      timestamp: Math.floor(date.getTime() / 1000),
      iso: date.toISOString(),
    }

    if (format === 'relative') {
      const diff = Date.now() - date.getTime()
      result.relative = this.formatRelativeTime(diff)
    }

    return result
  }

  private formatRelativeTime(ms: number): string {
    const abs = Math.abs(ms)
    const suffix = ms < 0 ? 'later' : 'ago'
    if (abs < 60000) return `${Math.floor(abs / 1000)}s ${suffix}`
    if (abs < 3600000) return `${Math.floor(abs / 60000)}m ${suffix}`
    if (abs < 86400000) return `${Math.floor(abs / 3600000)}h ${suffix}`
    return `${Math.floor(abs / 86400000)}d ${suffix}`
  }

  /**
   * 生成随机数据
   */
  private async randomGenerate(input: Record<string, unknown>): Promise<{ value: string | number }> {
    const type = input.type as string || 'string'
    const length = (input.length as number) || 32
    const min = (input.min as number) || 0
    const max = (input.max as number) || 100

    switch (type) {
      case 'string': {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        const value = Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
        return { value }
      }
      case 'number':
        return { value: Math.floor(Math.random() * (max - min + 1)) + min }
      case 'hex':
        return { value: crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length) }
      case 'base64':
        return { value: crypto.randomBytes(Math.ceil(length * 0.75)).toString('base64').slice(0, length) }
      case 'uuid':
        return { value: uuidv4() }
      default:
        return { value: crypto.randomBytes(length).toString('hex') }
    }
  }

  /**
   * 颜色转换
   */
  private async colorConvert(input: Record<string, unknown>): Promise<{ hex: string; rgb: string; hsl: string }> {
    const color = input.color as string
    const to = input.to as string || 'all'

    let r = 0, g = 0, b = 0

    if (color.startsWith('#')) {
      const hex = color.slice(1)
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16)
        g = parseInt(hex[1] + hex[1], 16)
        b = parseInt(hex[2] + hex[2], 16)
      } else {
        r = parseInt(hex.slice(0, 2), 16)
        g = parseInt(hex.slice(2, 4), 16)
        b = parseInt(hex.slice(4, 6), 16)
      }
    } else if (color.startsWith('rgb')) {
      const match = color.match(/\d+/g)
      if (match && match.length >= 3) {
        r = parseInt(match[0]); g = parseInt(match[1]); b = parseInt(match[2])
      }
    }

    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    const rgb = `rgb(${r}, ${g}, ${b})`

    r /= 255; g /= 255; b /= 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h = 0, s = 0, l = (max + min) / 2

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
        case g: h = ((b - r) / d + 2) / 6; break
        case b: h = ((r - g) / d + 4) / 6; break
      }
    }

    const hsl = `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`

    if (to === 'hex') return { hex, rgb: '', hsl: '' }
    if (to === 'rgb') return { hex: '', rgb, hsl: '' }
    if (to === 'hsl') return { hex: '', rgb: '', hsl }

    return { hex, rgb, hsl }
  }

  // ========== 网络工具 ==========

  /**
   * Ping
   */
  private async pingTool(input: Record<string, unknown>): Promise<{ success: boolean; stats?: Record<string, unknown> }> {
    const host = input.host as string
    const count = (input.count as number) || 4
    const timeout = (input.timeout as number) || 5

    try {
      const command = process.platform === 'win32'
        ? `ping -n ${count} -w ${timeout * 1000} ${host}`
        : `ping -c ${count} -W ${timeout} ${host}`

      const { stdout } = await execAsync(command, { timeout: (timeout + 5) * 1000 })

      return { success: stdout.includes('TTL=') || stdout.includes('ttl='), stats: { raw: stdout } }
    } catch (error) {
      return { success: false }
    }
  }

  /**
   * DNS 查询
   */
  private async dnsLookup(input: Record<string, unknown>): Promise<{ address?: string; records?: unknown }> {
    const domain = input.domain as string
    const type = input.type as string || 'A'

    try {
      if (type === 'A' || type === 'AAAA') {
        const addr = await dnsLookup(domain)
        return { address: addr.address }
      } else {
        const records = await dnsResolve(domain, type)
        return { records }
      }
    } catch (error) {
      throw new Error(`DNS 查询失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 端口扫描
   */
  private async portScan(input: Record<string, unknown>): Promise<{ openPorts: number[] }> {
    const host = input.host as string
    const portsStr = input.ports as string
    const timeout = (input.timeout as number) || 1000

    const commonPorts = [21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 995, 3306, 3389, 5432, 6379, 8080, 8443]
    let ports: number[]

    if (!portsStr || portsStr === 'common') {
      ports = commonPorts
    } else {
      ports = portsStr.split(',').map((p) => parseInt(p.trim())).filter((p) => !isNaN(p))
    }

    const { Socket } = await import('net')
    const openPorts: number[] = []

    for (const port of ports) {
      try {
        await new Promise<void>((resolve, reject) => {
          const socket = new Socket()
          socket.setTimeout(timeout)

          socket.on('connect', () => { socket.destroy(); resolve() })
          socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')) })
          socket.on('error', () => { socket.destroy(); reject(new Error('closed')) })

          socket.connect(port, host)
        })
        openPorts.push(port)
      } catch {
        // 端口关闭
      }
    }

    return { openPorts }
  }

  /**
   * 路由追踪
   */
  private async traceroute(input: Record<string, unknown>): Promise<{ output: string }> {
    const host = input.host as string
    const maxHops = (input.maxHops as number) || 30

    try {
      const command = process.platform === 'win32'
        ? `tracert -h ${maxHops} ${host}`
        : `traceroute -m ${maxHops} ${host}`

      const { stdout } = await execAsync(command, { timeout: 60000 })
      return { output: stdout }
    } catch (error) {
      throw new Error(`路由追踪失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * IP 信息
   */
  private async ipInfo(input: Record<string, unknown>): Promise<{ ip: string }> {
    const targetIp = input.ip as string | undefined

    if (targetIp) {
      return { ip: targetIp }
    }

    try {
      const { stdout } = await execAsync('curl -s ifconfig.me', { timeout: 10000 })
      return { ip: stdout.trim() }
    } catch {
      return { ip: '127.0.0.1' }
    }
  }

  /**
   * 网络接口
   */
  private async networkInterfaces(input: Record<string, unknown>): Promise<{ interfaces: Record<string, unknown> }> {
    const family = input.family as string || 'all'
    const includeInternal = input.internal !== false

    const interfaces = os.networkInterfaces()
    const result: Record<string, unknown> = {}

    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue
      if (!includeInternal && name.toLowerCase().includes('loopback')) continue

      const filtered = addrs.filter((addr: any) => {
        if (family === 'IPv4' && addr.family !== 'IPv4') return false
        if (family === 'IPv6' && addr.family !== 'IPv6') return false
        return true
      })

      if (filtered.length > 0) {
        result[name] = filtered
      }
    }

    return { interfaces: result }
  }

  /**
   * TCP 连接测试
   */
  private async netConnect(input: Record<string, unknown>): Promise<{ success: boolean; latency?: number }> {
    const host = input.host as string
    const port = input.port as number
    const timeout = (input.timeout as number) || 5000

    const start = Date.now()

    try {
      const { Socket } = await import('net')

      await new Promise<void>((resolve, reject) => {
        const socket = new Socket()
        socket.setTimeout(timeout)

        socket.on('connect', () => { socket.destroy(); resolve() })
        socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')) })
        socket.on('error', (err) => { socket.destroy(); reject(err) })

        socket.connect(port, host)
      })

      return { success: true, latency: Date.now() - start }
    } catch {
      return { success: false }
    }
  }

  /**
   * WHOIS 查询
   */
  private async whoisLookup(input: Record<string, unknown>): Promise<{ domain: string; info?: string }> {
    const domain = input.domain as string

    try {
      const { default: fetch } = await import('node-fetch')
      const response = await fetch(`http://ip-api.com/json/${domain}`)
      const data = await response.json() as any

      if (data.status === 'success') {
        return {
          domain,
          info: `${data.country}, ${data.regionName}, ${data.city}`,
        }
      }
    } catch {
      // API 失败
    }

    return { domain, info: 'WHOIS 信息不可用' }
  }

  // ========== 技能工具 ==========

  /**
   * 技能列表
   */
  private async skillList(input: Record<string, unknown>): Promise<{ skills: Array<{ name: string; description: string }> }> {
    const search = (input.search as string)?.toLowerCase()

    const builtInSkills = [
      { name: 'code-review', description: '代码审查' },
      { name: 'explain-code', description: '代码解释' },
      { name: 'generate-docs', description: '生成文档' },
      { name: 'test-generator', description: '生成测试' },
      { name: 'refactor', description: '代码重构' },
      { name: 'summarize', description: '文本摘要' },
      { name: 'regex-builder', description: '正则构建器' },
    ]

    const skills = search
      ? builtInSkills.filter((s) => s.name.includes(search) || s.description.includes(search))
      : builtInSkills

    return { skills }
  }

  /**
   * 执行技能
   */
  private async skillExecute(input: Record<string, unknown>): Promise<{ success: boolean; result?: unknown }> {
    const name = input.name as string
    const skillInput = input.input as Record<string, unknown> || {}

    const skills: Record<string, (input: Record<string, unknown>) => Promise<unknown>> = {
      'summarize': async (inp) => {
        const text = inp.text as string
        const maxLength = (inp.maxLength as number) || 100
        let summary = text.trim().replace(/\s+/g, ' ')
        if (summary.length > maxLength) {
          summary = summary.slice(0, maxLength - 3) + '...'
        }
        return { summary, wordCount: text.split(/\s+/).length }
      },
      'regex-builder': async (inp) => {
        const pattern = inp.pattern as string
        const flags = inp.flags as string || ''
        try {
          new RegExp(pattern, flags)
          return { valid: true, pattern, flags }
        } catch (error) {
          return { valid: false, error: error instanceof Error ? error.message : 'Invalid regex' }
        }
      },
    }

    const handler = skills[name]
    if (!handler) {
      throw new Error(`未知技能: ${name}`)
    }

    const result = await handler(skillInput)
    return { success: true, result }
  }

  /**
   * 技能信息
   */
  private async skillInfo(input: Record<string, unknown>): Promise<{ name: string; description: string; category: string }> {
    const name = input.name as string

    const skills: Record<string, { description: string; category: string }> = {
      'code-review': { description: '代码审查', category: 'development' },
      'explain-code': { description: '代码解释', category: 'education' },
      'generate-docs': { description: '生成文档', category: 'documentation' },
      'test-generator': { description: '生成测试', category: 'development' },
      'refactor': { description: '代码重构', category: 'development' },
      'summarize': { description: '文本摘要', category: 'utility' },
      'regex-builder': { description: '正则构建器', category: 'development' },
    }

    const skill = skills[name]
    if (!skill) {
      throw new Error(`未知技能: ${name}`)
    }

    return { name, ...skill }
  }

  /**
   * 模板渲染
   */
  private async templateRender(input: Record<string, unknown>): Promise<{ rendered: string }> {
    const template = input.template as string
    const variables = (input.variables as Record<string, string>) || {}

    let rendered = template

    for (const [key, value] of Object.entries(variables)) {
      const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
      rendered = rendered.replace(re, String(value))
    }

    return { rendered }
  }

  /**
   * 宏展开
   */
  private async macroExpand(input: Record<string, unknown>): Promise<{ expanded: string }> {
    const text = input.text as string
    const now = new Date()

    let expanded = text
    expanded = expanded.replace(/\{\{DATE\}\}/g, now.toISOString().split('T')[0])
    expanded = expanded.replace(/\{\{YEAR\}\}/g, String(now.getFullYear()))
    expanded = expanded.replace(/\{\{MONTH\}\}/g, String(now.getMonth() + 1).padStart(2, '0'))
    expanded = expanded.replace(/\{\{DAY\}\}/g, String(now.getDate()).padStart(2, '0'))
    expanded = expanded.replace(/\{\{TIME\}\}/g, now.toTimeString().slice(0, 8))
    expanded = expanded.replace(/\{\{TIMESTAMP\}\}/g, String(Math.floor(now.getTime() / 1000)))
    expanded = expanded.replace(/\{\{PLATFORM\}\}/g, process.platform)
    expanded = expanded.replace(/\{\{ARCH\}\}/g, process.arch)

    return { expanded }
  }

  /**
   * HTTP 请求
   */
  private async httpRequest(input: Record<string, unknown>): Promise<{ status: number; body: string; headers: Record<string, string> }> {
    const url = input.url as string
    const method = input.method as string || 'GET'
    const headers = (input.headers as Record<string, string>) || {}
    const body = input.body as string | undefined
    const timeout = (input.timeout as number) || 30000

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout),
      })

      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      let responseBody: string
      const contentType = response.headers.get('content-type') || ''

      if (contentType.includes('application/json')) {
        const json = await response.json()
        responseBody = JSON.stringify(json, null, 2)
      } else {
        responseBody = await response.text()
      }

      if (responseBody.length > 50000) {
        responseBody = responseBody.substring(0, 50000) + '\n... (内容已截断)'
      }

      return { status: response.status, body: responseBody, headers: responseHeaders }
    } catch (error) {
      throw new Error(`HTTP 请求失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export default WebToolExecutor
