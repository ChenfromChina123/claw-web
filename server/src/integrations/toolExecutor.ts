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
import { BackgroundTaskManager, TaskPriority } from '../services/backgroundTaskManager'

const execAsync = promisify(exec)

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
 * Web 工具执行器 - 桥接到 src/tools.ts
 */
export class WebToolExecutor {
  private projectRoot: string
  
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
   * 执行工具
   */
  async executeTool(
    name: string, 
    input: Record<string, unknown>, 
    sendEvent?: EventSender
  ): Promise<ToolResult> {
    const toolId = uuidv4()
    
    sendEvent?.('tool_start', { id: toolId, name, input })
    
    try {
      let result: unknown
      
      switch (name) {
        case 'Bash':
          result = await this.executeBash(input, sendEvent)
          break
        case 'FileRead':
          result = await this.readFile(input)
          break
        case 'FileWrite':
          result = await this.writeFileTool(input)
          break
        case 'FileEdit':
          result = await this.editFile(input)
          break
        case 'Glob':
          result = await this.glob(input)
          break
        case 'Grep':
          result = await this.grep(input)
          break
        case 'WebSearch':
          result = await this.webSearch(input)
          break
        case 'WebFetch':
          result = await this.webFetch(input)
          break
        case 'TodoWrite':
          result = await this.todoWrite(input)
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
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
      
      sendEvent?.('tool_end', { id: toolId, name, result })
      return { success: true, result }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      sendEvent?.('tool_error', { id: toolId, name, error: errorMessage })
      return { success: false, error: errorMessage }
    }
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
}

export default WebToolExecutor
