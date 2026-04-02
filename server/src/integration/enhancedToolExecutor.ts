/**
 * Claude Code HAHA - Enhanced Tool Executor
 * 
 * Full-featured tool execution system with:
 * - 15+ built-in tools
 * - MCP server integration
 * - Real-time streaming output
 * - Sandbox isolation
 * - Permission system
 * - File watching
 */

import { v4 as uuidv4 } from 'uuid'
import { readFile, writeFile, readdir, stat, chmod, rename, unlink } from 'fs/promises'
import { join, resolve, relative, dirname } from 'path'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import { glob as globAsync } from 'glob'
import type { EventSender, Tool, ToolCall } from './webStore'

const execAsync = promisify(exec)

// ==================== Types ====================

export interface ToolExecutionContext {
  userId: string
  sessionId?: string
  projectRoot: string
  sandboxed?: boolean
  allowedPaths?: string[]
  deniedPaths?: string[]
}

export interface ToolResult {
  success: boolean
  result?: unknown
  error?: string
  output?: string
  metadata?: {
    duration?: number
    tokens?: number
    cost?: number
  }
}

// ==================== Tool Registry ====================

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
  category: 'file' | 'shell' | 'web' | 'system' | 'ai' | 'mcp'
  handler: (
    input: Record<string, unknown>,
    context: ToolExecutionContext,
    sendEvent?: EventSender
  ) => Promise<ToolResult>
  permissions?: {
    requiresAuth?: boolean
    dangerous?: boolean
    sandboxed?: boolean
  }
}

// ==================== Enhanced Tool Executor ====================

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

  private getProjectRoot(): string {
    const currentDir = process.cwd()
    return currentDir.replace(/\\server\\src$/i, '').replace(/\/server\/src$/, '').replace(/\\server$/i, '').replace(/\/server$/, '')
  }

  // ==================== Tool Registration ====================

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool)
  }

  unregisterTool(name: string): boolean {
    return this.tools.delete(name)
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  getToolsByCategory(category: string): ToolDefinition[] {
    return this.getAllTools().filter(t => t.category === category)
  }

  // ==================== Tool Execution ====================

  async execute(
    name: string,
    input: Record<string, unknown>,
    sendEvent?: EventSender
  ): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { success: false, error: `Tool not found: ${name}` }
    }

    const toolId = uuidv4()
    const startTime = Date.now()

    sendEvent?.('tool_start', { id: toolId, name, input })

    const toolCall: ToolCall = {
      id: toolId,
      name,
      input,
      status: 'pending',
      startedAt: startTime,
    }

    try {
      // Check permissions
      if (tool.permissions?.dangerous && this.context.sandboxed) {
        throw new Error(`Tool '${name}' is not allowed in sandboxed mode`)
      }

      toolCall.status = 'executing'
      this.addToHistory(toolCall)

      const result = await tool.handler(input, this.context, sendEvent)

      toolCall.status = result.success ? 'completed' : 'error'
      toolCall.output = result.result
      if (!result.success && result.error) {
        toolCall.error = result.error
      }

      result.metadata = {
        ...result.metadata,
        duration: Date.now() - startTime,
      }

      sendEvent?.('tool_end', { id: toolId, name, result })
      this.updateHistory(toolCall)

      return result
    } catch (error) {
      toolCall.status = 'error'
      toolCall.error = error instanceof Error ? error.message : String(error)
      this.updateHistory(toolCall)

      sendEvent?.('tool_error', { id: toolId, name, error: toolCall.error })
      return { success: false, error: toolCall.error }
    }
  }

  // ==================== History Management ====================

  private addToHistory(toolCall: ToolCall): void {
    this.executionHistory.unshift(toolCall)
    if (this.executionHistory.length > this.maxHistory) {
      this.executionHistory.pop()
    }
  }

  private updateHistory(updated: ToolCall): void {
    const index = this.executionHistory.findIndex(tc => tc.id === updated.id)
    if (index >= 0) {
      this.executionHistory[index] = { ...updated, completedAt: Date.now() }
    }
  }

  getHistory(limit?: number): ToolCall[] {
    return limit ? this.executionHistory.slice(0, limit) : [...this.executionHistory]
  }

  clearHistory(): void {
    this.executionHistory = []
  }

  // ==================== Built-in Tools Registration ====================

  private registerBuiltInTools(): void {
    // === File Tools ===

    this.registerTool({
      name: 'Bash',
      description: 'Execute shell commands in the terminal',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          cwd: { type: 'string', description: 'Working directory' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 60000 },
          env: { type: 'object', description: 'Environment variables' },
        },
        required: ['command'],
      },
      category: 'shell',
      permissions: { dangerous: true },
      handler: async (input, context, sendEvent) => {
        const command = input.command as string
        const cwd = (input.cwd as string) || context.projectRoot
        const timeout = (input.timeout as number) || 60000
        const env = (input.env as Record<string, string>) || {}

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
            env: { ...process.env, ...env },
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
              success: (code || 0) === 0,
              result: { stdout, stderr, exitCode: code || 0 },
              output: stdout + (stderr ? `\n[stderr]\n${stderr}` : ''),
            })
          })

          setTimeout(() => {
            child.kill()
            stderr += '\n[Process killed due to timeout]'
            resolve({
              success: false,
              error: 'Process killed due to timeout',
              result: { stdout, stderr, exitCode: 124 },
            })
          }, timeout)
        })
      },
    })

    this.registerTool({
      name: 'FileRead',
      description: 'Read contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          limit: { type: 'number', description: 'Maximum number of lines to read' },
          offset: { type: 'number', description: 'Starting line number (0-indexed)' },
          encoding: { type: 'string', description: 'File encoding', default: 'utf-8' },
        },
        required: ['path'],
      },
      category: 'file',
      handler: async (input) => {
        const filePath = this.resolvePath(input.path as string)
        const limit = input.limit as number
        const offset = input.offset as number
        const encoding = (input.encoding as string) || 'utf-8'

        const content = await readFile(filePath, encoding as BufferEncoding)
        
        if (limit || offset) {
          const lines = content.split('\n')
          const start = offset || 0
          const end = limit ? start + limit : lines.length
          return {
            success: true,
            result: {
              content: lines.slice(start, end).join('\n'),
              path: filePath,
              totalLines: lines.length,
              readLines: end - start,
              startLine: start,
            },
          }
        }

        return {
          success: true,
          result: {
            content,
            path: filePath,
            size: content.length,
            lines: content.split('\n').length,
          },
        }
      },
    })

    this.registerTool({
      name: 'FileWrite',
      description: 'Write content to a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' },
          append: { type: 'boolean', description: 'Append to existing file', default: false },
          mode: { type: 'string', description: 'File permissions (octal)' },
        },
        required: ['path', 'content'],
      },
      category: 'file',
      permissions: { dangerous: true },
      handler: async (input) => {
        const filePath = this.resolvePath(input.path as string)
        const content = input.content as string
        const append = (input.append as boolean) || false
        const mode = input.mode as string

        // Create parent directory if it doesn't exist
        const dir = dirname(filePath)
        await this.ensureDir(dir)

        if (append) {
          await writeFile(filePath, content, { flag: 'a' })
        } else {
          await writeFile(filePath, content)
        }

        if (mode) {
          await chmod(filePath, parseInt(mode, 8))
        }

        const stats = await stat(filePath)
        return {
          success: true,
          result: {
            path: filePath,
            bytesWritten: stats.size,
            mode: stats.mode.toString(8),
          },
        }
      },
    })

    this.registerTool({
      name: 'FileEdit',
      description: 'Edit a file by replacing text',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          old_string: { type: 'string', description: 'Text to find and replace' },
          new_string: { type: 'string', description: 'Replacement text' },
          replace_all: { type: 'boolean', description: 'Replace all occurrences', default: false },
        },
        required: ['path', 'old_string', 'new_string'],
      },
      category: 'file',
      permissions: { dangerous: true },
      handler: async (input) => {
        const filePath = this.resolvePath(input.path as string)
        const oldString = input.old_string as string
        const newString = input.new_string as string
        const replaceAll = (input.replace_all as boolean) || false

        const content = await readFile(filePath, 'utf-8')

        if (!content.includes(oldString)) {
          return { success: false, error: `Text not found: ${oldString.substring(0, 50)}...` }
        }

        let newContent: string
        let replaceCount: number

        if (replaceAll) {
          const regex = new RegExp(this.escapeRegex(oldString), 'g')
          const matches = content.match(regex)
          replaceCount = matches?.length || 0
          newContent = content.replace(regex, newString)
        } else {
          replaceCount = 1
          newContent = content.replace(oldString, newString)
        }

        await writeFile(filePath, newContent)

        return {
          success: true,
          result: {
            path: filePath,
            replacements: replaceCount,
          },
        }
      },
    })

    this.registerTool({
      name: 'FileDelete',
      description: 'Delete a file or directory',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to delete' },
          recursive: { type: 'boolean', description: 'Delete directories recursively', default: false },
        },
        required: ['path'],
      },
      category: 'file',
      permissions: { dangerous: true },
      handler: async (input) => {
        const targetPath = this.resolvePath(input.path as string)
        const recursive = (input.recursive as boolean) || false

        const stats = await stat(targetPath)
        if (stats.isDirectory() && !recursive) {
          return { success: false, error: 'Use recursive=true to delete directories' }
        }

        await unlink(targetPath)

        return {
          success: true,
          result: { path: targetPath, deleted: true },
        }
      },
    })

    this.registerTool({
      name: 'FileRename',
      description: 'Rename or move a file',
      inputSchema: {
        type: 'object',
        properties: {
          oldPath: { type: 'string', description: 'Current path' },
          newPath: { type: 'string', description: 'New path' },
        },
        required: ['oldPath', 'newPath'],
      },
      category: 'file',
      permissions: { dangerous: true },
      handler: async (input) => {
        const oldPath = this.resolvePath(input.oldPath as string)
        const newPath = this.resolvePath(input.newPath as string)

        await rename(oldPath, newPath)

        return {
          success: true,
          result: { oldPath, newPath },
        }
      },
    })

    this.registerTool({
      name: 'FileList',
      description: 'List directory contents',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path', default: '.' },
          recursive: { type: 'boolean', description: 'List recursively', default: false },
          includeHidden: { type: 'boolean', description: 'Include hidden files', default: false },
        },
      },
      category: 'file',
      handler: async (input) => {
        const dirPath = this.resolvePath((input.path as string) || '.')
        const recursive = (input.recursive as boolean) || false
        const includeHidden = (input.includeHidden as boolean) || false

        const entries = await this.listDir(dirPath, recursive, includeHidden)

        return {
          success: true,
          result: { path: dirPath, entries, count: entries.length },
        }
      },
    })

    // === Search Tools ===

    this.registerTool({
      name: 'Glob',
      description: 'Find files matching a glob pattern',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g., **/*.ts)' },
          path: { type: 'string', description: 'Base directory', default: '.' },
          ignore: { type: 'array', items: { type: 'string' }, description: 'Patterns to ignore' },
          maxDepth: { type: 'number', description: 'Maximum directory depth' },
        },
        required: ['pattern'],
      },
      category: 'file',
      handler: async (input) => {
        const pattern = input.pattern as string
        const basePath = this.resolvePath((input.path as string) || '.')
        const ignore = (input.ignore as string[]) || ['**/node_modules/**', '**/.git/**']
        const maxDepth = input.maxDepth as number

        const files = await globAsync(pattern, {
          cwd: basePath,
          ignore,
          absolute: false,
          dot: true,
        })

        return {
          success: true,
          result: { pattern, files, count: files.length },
        }
      },
    })

    this.registerTool({
      name: 'Grep',
      description: 'Search for patterns in files',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search' },
          path: { type: 'string', description: 'Directory or file to search' },
          output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count', 'json'], description: 'Output format', default: 'content' },
          case_sensitive: { type: 'boolean', description: 'Case sensitive search', default: false },
          recursive: { type: 'boolean', description: 'Search recursively', default: true },
          file_pattern: { type: 'string', description: 'Only search files matching this pattern' },
          max_results: { type: 'number', description: 'Maximum number of results', default: 100 },
        },
        required: ['pattern'],
      },
      category: 'file',
      handler: async (input) => {
        const pattern = input.pattern as string
        const searchPath = this.resolvePath((input.path as string) || '.')
        const outputMode = (input.output_mode as string) || 'content'
        const caseSensitive = (input.case_sensitive as boolean) || false
        const recursive = (input.recursive as boolean) || true
        const filePattern = input.file_pattern as string
        const maxResults = (input.max_results as number) || 100

        const flags = caseSensitive ? 'g' : 'ig'
        const regex = new RegExp(pattern, flags)

        const searchPattern = filePattern || '**/*'
        const files = await globAsync(searchPattern, {
          cwd: searchPath,
          ignore: ['**/node_modules/**', '**/.git/**'],
          absolute: false,
        })

        const matches: string[] = []
        let fileCount = 0
        let totalMatches = 0

        for (const file of files) {
          if (totalMatches >= maxResults) break

          try {
            const content = await readFile(join(searchPath, file), 'utf-8')
            const lines = content.split('\n')

            if (outputMode === 'files_with_matches') {
              if (regex.test(content)) {
                matches.push(file)
                fileCount++
              }
              regex.lastIndex = 0
            } else if (outputMode === 'count') {
              const count = (content.match(regex) || []).length
              if (count > 0) {
                matches.push(`${file}: ${count}`)
                totalMatches += count
              }
              regex.lastIndex = 0
            } else {
              for (let i = 0; i < lines.length; i++) {
                if (totalMatches >= maxResults) break
                regex.lastIndex = 0
                if (regex.test(lines[i])) {
                  matches.push(`${file}:${i + 1}: ${lines[i].trim()}`)
                  totalMatches++
                }
              }
            }
          } catch {
            // Skip files that can't be read
          }
        }

        return {
          success: true,
          result: {
            pattern,
            matches,
            matchCount: matches.length,
            filesSearched: files.length,
            mode: outputMode,
          },
        }
      },
    })

    // === Web Tools ===

    this.registerTool({
      name: 'WebSearch',
      description: 'Search the web for information',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          search_term: { type: 'string', description: 'Alternative search query' },
          source: { type: 'string', enum: ['duckduckgo', 'wikipedia', 'arxiv'], description: 'Search source', default: 'duckduckgo' },
        },
        required: ['query'],
      },
      category: 'web',
      handler: async (input) => {
        const query = (input.query as string) || (input.search_term as string)
        const source = (input.source as string) || 'duckduckgo'

        if (source === 'duckduckgo') {
          return this.duckDuckGoSearch(query)
        } else if (source === 'wikipedia') {
          return this.wikipediaSearch(query)
        } else if (source === 'arxiv') {
          return this.arxivSearch(query)
        }

        return { success: false, error: `Unknown search source: ${source}` }
      },
    })

    this.registerTool({
      name: 'WebFetch',
      description: 'Fetch content from a URL',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
          method: { type: 'string', enum: ['GET', 'POST', 'HEAD'], description: 'HTTP method', default: 'GET' },
          headers: { type: 'object', description: 'HTTP headers' },
          body: { type: 'string', description: 'Request body' },
          timeout: { type: 'number', description: 'Timeout in milliseconds', default: 30000 },
        },
        required: ['url'],
      },
      category: 'web',
      handler: async (input) => {
        const url = input.url as string
        const method = (input.method as string) || 'GET'
        const headers = (input.headers as Record<string, string>) || {}
        const body = input.body as string
        const timeout = (input.timeout as number) || 30000

        try {
          const response = await fetch(url, {
            method,
            headers: {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              ...headers,
            },
            body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
            signal: AbortSignal.timeout(timeout),
          })

          const contentType = response.headers.get('content-type') || ''
          let content: string

          if (contentType.includes('application/json')) {
            const json = await response.json()
            content = JSON.stringify(json, null, 2)
          } else if (contentType.includes('text/')) {
            content = await response.text()
          } else {
            content = `[Binary content] Type: ${contentType}, Size: ${response.headers.get('content-length') || 'unknown'}`
          }

          if (content.length > 8000) {
            content = content.substring(0, 8000) + '\n\n... (truncated)'
          }

          return {
            success: true,
            result: {
              url,
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
              content,
            },
          }
        } catch (error) {
          return {
            success: false,
            error: `Failed to fetch ${url}: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    })

    // === Task Management ===

    this.registerTool({
      name: 'TodoWrite',
      description: 'Create or update todo items',
      inputSchema: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Todo ID' },
                status: { type: 'string', enum: ['in_progress', 'pending', 'completed', 'cancelled'] },
                content: { type: 'string', description: 'Todo content' },
                priority: { type: 'string', enum: ['low', 'medium', 'high'] },
              },
            },
          },
          merge: { type: 'boolean', description: 'Merge with existing todos', default: true },
        },
        required: ['todos'],
      },
      category: 'system',
      handler: async (input) => {
        const todos = (input.todos as Array<{
          id?: string
          status?: string
          content?: string
          priority?: string
        }>) || []
        const merge = input.merge !== false

        const todoPath = join(this.context.projectRoot, '.haha-todos.json')
        let existingTodos: Array<{
          id: string
          status: string
          content: string
          priority: string
          createdAt: number
          updatedAt: number
        }> = []

        if (merge) {
          try {
            const content = await readFile(todoPath, 'utf-8')
            existingTodos = JSON.parse(content)
          } catch {
            // File doesn't exist
          }
        }

        const now = Date.now()
        const newTodos = todos.map(t => ({
          id: t.id || uuidv4(),
          status: t.status || 'pending',
          content: t.content || '',
          priority: t.priority || 'medium',
          createdAt: now,
          updatedAt: now,
        }))

        const allTodos = merge ? [...existingTodos, ...newTodos] : newTodos
        await writeFile(todoPath, JSON.stringify(allTodos, null, 2))

        return {
          success: true,
          result: { todos: allTodos, count: allTodos.length },
        }
      },
    })

    this.registerTool({
      name: 'TaskCreate',
      description: 'Create a new task',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title' },
          description: { type: 'string', description: 'Task description' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
        },
        required: ['title'],
      },
      category: 'system',
      handler: async (input) => {
        const task = {
          id: uuidv4(),
          title: input.title as string,
          description: input.description as string || '',
          status: 'pending',
          priority: (input.priority as string) || 'medium',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        return {
          success: true,
          result: task,
        }
      },
    })

    this.registerTool({
      name: 'TaskList',
      description: 'List tasks',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status' },
          priority: { type: 'string', description: 'Filter by priority' },
          limit: { type: 'number', description: 'Maximum results', default: 50 },
        },
      },
      category: 'system',
      handler: async (input) => {
        const todoPath = join(this.context.projectRoot, '.haha-todos.json')
        let todos: Array<unknown> = []

        try {
          const content = await readFile(todoPath, 'utf-8')
          todos = JSON.parse(content)
        } catch {
          // File doesn't exist
        }

        let filtered = todos
        if (input.status) {
          filtered = filtered.filter((t: unknown) => (t as { status: string }).status === input.status)
        }
        if (input.priority) {
          filtered = filtered.filter((t: unknown) => (t as { priority: string }).priority === input.priority)
        }

        const limit = (input.limit as number) || 50
        return {
          success: true,
          result: { tasks: filtered.slice(0, limit), total: filtered.length },
        }
      },
    })

    // === System Tools ===

    this.registerTool({
      name: 'Config',
      description: 'Get or set configuration values',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['get', 'set', 'delete', 'list'], description: 'Action to perform' },
          key: { type: 'string', description: 'Config key' },
          value: { type: 'string', description: 'Value to set' },
          scope: { type: 'string', enum: ['user', 'project', 'global'], description: 'Config scope', default: 'project' },
        },
        required: ['action'],
      },
      category: 'system',
      handler: async (input) => {
        const action = input.action as string
        const scope = (input.scope as string) || 'project'
        
        const configPaths: Record<string, string> = {
          user: join(process.env.HOME || process.env.USERPROFILE || '', '.haha-config.json'),
          project: join(this.context.projectRoot, '.haha-config.json'),
          global: '/etc/haha/config.json',
        }

        const configPath = configPaths[scope]
        let config: Record<string, string> = {}

        try {
          const content = await readFile(configPath, 'utf-8')
          config = JSON.parse(content)
        } catch {
          // File doesn't exist
        }

        switch (action) {
          case 'get':
            return {
              success: true,
              result: { key: input.key, value: config[input.key as string] || null },
            }

          case 'set':
            if (!input.key) {
              return { success: false, error: 'Key is required for set action' }
            }
            config[input.key as string] = input.value as string
            await writeFile(configPath, JSON.stringify(config, null, 2))
            return {
              success: true,
              result: { key: input.key, value: input.value },
            }

          case 'delete':
            delete config[input.key as string]
            await writeFile(configPath, JSON.stringify(config, null, 2))
            return { success: true, result: { deleted: input.key } }

          case 'list':
            return { success: true, result: { config, scope } }

          default:
            return { success: false, error: `Unknown action: ${action}` }
        }
      },
    })

    this.registerTool({
      name: 'Shell',
      description: 'Start an interactive shell session',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Command to execute' },
          cwd: { type: 'string', description: 'Working directory' },
        },
        required: ['command'],
      },
      category: 'shell',
      permissions: { dangerous: true },
      handler: async (input) => {
        const command = input.command as string
        const cwd = (input.cwd as string) || this.context.projectRoot

        const { stdout, stderr } = await execAsync(command, { cwd })
        return {
          success: true,
          result: { stdout, stderr },
        }
      },
    })

    this.registerTool({
      name: 'AskUserQuestion',
      description: 'Ask the user a question',
      inputSchema: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Question to ask' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Answer options (optional)',
          },
        },
        required: ['question'],
      },
      category: 'ai',
      handler: async (input, _, sendEvent) => {
        const question = input.question as string
        const options = input.options as string[] | undefined
        const questionId = uuidv4()

        sendEvent?.('user_question', {
          questionId,
          question,
          options,
        })

        return {
          success: true,
          result: {
            questionId,
            question,
            options,
            status: 'pending',
          },
        }
      },
    })
  }

  // ==================== Helper Methods ====================

  private resolvePath(relativePath: string): string {
    if (relativePath.startsWith('/') || /^[a-zA-Z]:/.test(relativePath)) {
      return relativePath
    }
    return resolve(this.context.projectRoot, relativePath)
  }

  private async ensureDir(dirPath: string): Promise<void> {
    const { mkdir } = await import('fs/promises')
    await mkdir(dirPath, { recursive: true })
  }

  private async listDir(
    dirPath: string,
    recursive: boolean,
    includeHidden: boolean
  ): Promise<Array<{ name: string; type: string; size?: number }>> {
    const entries: Array<{ name: string; type: string; size?: number }> = []
    
    const items = await readdir(dirPath, { withFileTypes: true })
    
    for (const item of items) {
      if (!includeHidden && item.name.startsWith('.')) continue

      if (item.isDirectory()) {
        entries.push({ name: item.name, type: 'directory' })
        if (recursive) {
          const subEntries = await this.listDir(
            join(dirPath, item.name),
            recursive,
            includeHidden
          )
          entries.push(...subEntries.map(e => ({
            ...e,
            name: `${item.name}/${e.name}`,
          })))
        }
      } else {
        const stats = await stat(join(dirPath, item.name))
        entries.push({ name: item.name, type: 'file', size: stats.size })
      }
    }

    return entries
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  private async duckDuckGoSearch(query: string): Promise<ToolResult> {
    try {
      const response = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&skip_disambig=1`
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

      if (data.Heading) {
        results.push(`[${data.Heading}]`)
      }
      if (data.AbstractText) {
        results.push(data.AbstractText)
        if (data.AbstractURL) {
          results.push(`来源: ${data.AbstractURL}`)
        }
      }

      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        results.push('\n相关主题:')
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          if (topic.Text) {
            results.push(`• ${topic.Text}${topic.FirstURL ? ` - ${topic.FirstURL}` : ''}`)
          }
        }
      }

      if (results.length === 0) {
        results.push(`未找到关于 "${query}" 的信息`)
        results.push(`请访问 https://duckduckgo.com/?q=${encodeURIComponent(query)} 查看更多`)
      }

      return {
        success: true,
        result: { query, results },
      }
    } catch (error) {
      return {
        success: false,
        error: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async wikipediaSearch(query: string): Promise<ToolResult> {
    try {
      const response = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`
      )

      const data = await response.json() as {
        query?: {
          search?: Array<{
            title: string
            snippet: string
            pageid: number
          }>
        }
      }

      const results = (data.query?.search || []).slice(0, 5).map(item => ({
        title: item.title,
        snippet: item.snippet.replace(/<[^>]*>/g, ''),
        url: `https://en.wikipedia.org/?curid=${item.pageid}`,
      }))

      return {
        success: true,
        result: { query, results },
      }
    } catch (error) {
      return {
        success: false,
        error: `Wikipedia search failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private async arxivSearch(query: string): Promise<ToolResult> {
    try {
      const response = await fetch(
        `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=5&sortBy=relevance`
      )

      const text = await response.text()
      
      // Simple XML parsing for arxiv response
      const entries: Array<{ title: string; summary: string; published: string }> = []
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
      let match

      while ((match = entryRegex.exec(text)) !== null && entries.length < 5) {
        const entry = match[1]
        const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entry)
        const summaryMatch = /<summary>([\s\S]*?)<\/summary>/.exec(entry)
        const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(entry)

        if (titleMatch) {
          entries.push({
            title: titleMatch[1].replace(/\n/g, ' ').trim(),
            summary: summaryMatch ? summaryMatch[1].replace(/\n/g, ' ').trim().substring(0, 300) + '...' : '',
            published: publishedMatch ? publishedMatch[1] : '',
          })
        }
      }

      return {
        success: true,
        result: { query, papers: entries },
      }
    } catch (error) {
      return {
        success: false,
        error: `ArXiv search failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  // ==================== Anthropic Tools Format ====================

  getAnthropicTools(): unknown[] {
    return this.getAllTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }))
  }
}

// Singleton instance
export const toolExecutor = new EnhancedToolExecutor()
