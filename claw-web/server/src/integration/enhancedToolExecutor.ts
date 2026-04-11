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
import { BackgroundTaskManager, TaskPriority } from '../services/backgroundTaskManager'
import { 
  createAgentToolDefinition, 
  createSendMessageToolDefinition,
  createExitPlanModeToolDefinition,
  createSleepToolDefinition,
  createLSPToolDefinition,
  createPowerShellToolDefinition,
  createDatabaseQueryToolDefinition,
  createDockerManagerToolDefinition,
  createGitAdvancedToolDefinition,
} from '../tools'
import { executeImageRead } from '../tools/imageReadTool'
import {
  normalizeToolName,
  isValidToolName,
  getStandardToolName,
  TOOL_ALIASES,
} from '../tools/toolAliases'
import { 
  validateToolInput,
  validateInputAgainstSchema,
} from '../tools/toolValidator'
import {
  validateCommandForTraversal,
  validateCommandSecurity,
  containsParentDirectoryReference,
} from '../utils/pathSecurity'

const execAsync = promisify(exec)

/**
 * 全局后台任务管理器实例（供 enhancedToolExecutor 使用）
 */
const backgroundTaskManager = new BackgroundTaskManager({
  maxConcurrentTasks: 5,
  defaultPriority: TaskPriority.NORMAL,
  taskTimeout: 300000,
  enablePersistence: false,
})

// ==================== Types ====================

export interface ToolExecutionContext {
  userId: string
  sessionId?: string
  projectRoot: string
  workingDirectory?: string
  sandboxed?: boolean
  allowedPaths?: string[]
  deniedPaths?: string[]
  allowedTools?: string[]
  deniedTools?: string[]
  maxExecutionTime?: number
  /** 中断信号，用于取消长时间运行的操作 */
  abortSignal?: AbortSignal
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
    sandboxed?: boolean
  }
}

// 权限级别
export type PermissionLevel = 'none' | 'read' | 'write' | 'execute' | 'admin'

// 用户权限配置
export interface UserPermissions {
  level: PermissionLevel
  allowedTools: string[]
  deniedTools: string[]
  allowedPaths: string[]
  deniedPaths: string[]
  canExecuteDangerous: boolean
  canAccessNetwork: boolean
  maxExecutionTime: number
}

// 沙箱配置
export interface SandboxConfig {
  enabled: boolean
  allowedPaths: string[]
  deniedPaths: string[]
  maxFileSize: number
  maxExecutionTime: number
  allowNetwork: boolean
  allowChildProcess: boolean
}

// 默认沙箱配置
const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  enabled: false,
  allowedPaths: [],
  deniedPaths: ['**/node_modules/**', '**/.git/**', '**/windows/**', '**/System32/**'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxExecutionTime: 60000, // 1 minute
  allowNetwork: true,
  allowChildProcess: false,
}

// ==================== Tool Registry ====================

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type?: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  } | Record<string, unknown>
  category: 'file' | 'shell' | 'web' | 'system' | 'ai' | 'mcp' | 'agent' | 'plan' | 'development' | 'database' | 'devops' | 'vcs'
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

  /**
   * 获取当前工具执行上下文
   */
  getContext(): ToolExecutionContext {
    return this.context
  }

  /**
   * 动态更新工具执行上下文（用于无感沙箱模式）
   * @param newContext 新的上下文配置
   */
  setContext(newContext: Partial<ToolExecutionContext>): void {
    this.context = { ...this.context, ...newContext }
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

  /**
   * 检查用户是否有权执行指定工具
   */
  canExecuteTool(toolName: string, userId?: string): { allowed: boolean; reason?: string } {
    // 管理员可以执行任何工具
    if (userId === 'admin') {
      return { allowed: true }
    }

    const tool = this.tools.get(toolName)
    if (!tool) {
      return { allowed: false, reason: `Tool '${toolName}' not found` }
    }

    // 检查是否在沙箱模式且工具需要特殊权限
    if (this.context.sandboxed) {
      if (tool.permissions?.dangerous) {
        return { allowed: false, reason: `Tool '${toolName}' is not allowed in sandboxed mode` }
      }
    }

    // 检查用户是否被拒绝使用该工具
    if (this.context.deniedTools?.includes(toolName)) {
      return { allowed: false, reason: `Tool '${toolName}' is denied for this user` }
    }

    // 如果用户有 allowedTools 列表，检查是否在列表中
    if (this.context.allowedTools && this.context.allowedTools.length > 0) {
      if (!this.context.allowedTools.includes(toolName)) {
        return { allowed: false, reason: `Tool '${toolName}' is not in the allowed tools list` }
      }
    }

    return { allowed: true }
  }

  /**
   * 检查路径是否在允许范围内
   */
  isPathAllowed(filePath: string): boolean {
    const { allowedPaths, deniedPaths } = this.context

    // 如果有拒绝路径配置
    if (deniedPaths && deniedPaths.length > 0) {
      for (const pattern of deniedPaths) {
        if (this.matchPathPattern(filePath, pattern)) {
          return false
        }
      }
    }

    // 如果有允许路径配置
    if (allowedPaths && allowedPaths.length > 0) {
      for (const pattern of allowedPaths) {
        if (this.matchPathPattern(filePath, pattern)) {
          return true
        }
      }
      return false
    }

    return true
  }

  /**
   * 简单的路径模式匹配
   */
  private matchPathPattern(path: string, pattern: string): boolean {
    // 将 glob 模式转换为正则表达式
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{DOUBLE_STAR}}')
      .replace(/\*/g, '[^/\\\\]*')
      .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')

    try {
      const regex = new RegExp(regexPattern, 'i')
      return regex.test(path)
    } catch {
      return false
    }
  }

  /**
   * 在沙箱中执行工具
   */
  private async executeInSandbox(
    tool: ToolDefinition,
    input: Record<string, unknown>,
    toolId: string,
    startTime: number,
    sendEvent?: EventSender
  ): Promise<ToolResult> {
    const sandboxConfig = this.getSandboxConfig()

    // 检查路径访问权限
    if (input.path && typeof input.path === 'string') {
      if (!this.isPathAllowed(input.path)) {
        return { success: false, error: `Access to path '${input.path}' is denied` }
      }
    }

    // 检查文件大小限制（如果适用）
    if (input.content && typeof input.content === 'string') {
      if (input.content.length > sandboxConfig.maxFileSize) {
        return { success: false, error: `Content size exceeds maximum allowed (${sandboxConfig.maxFileSize} bytes)` }
      }
    }

    try {
      sendEvent?.('tool_progress', { id: toolId, output: '[Sandbox] Executing in restricted mode...\n' })

      const result = await tool.handler(input, {
        ...this.context,
        sandboxed: true,
      }, sendEvent)

      return {
        ...result,
        metadata: {
          ...result.metadata,
          duration: Date.now() - startTime,
          sandboxed: true,
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * 获取沙箱配置
   */
  private getSandboxConfig(): SandboxConfig {
    // 可以从环境变量或配置文件中读取
    return {
      ...DEFAULT_SANDBOX_CONFIG,
      enabled: process.env.SANDBOX_ENABLED === 'true',
      allowedPaths: process.env.ALLOWED_PATHS?.split(',') || [],
      deniedPaths: process.env.DENIED_PATHS?.split(',') || DEFAULT_SANDBOX_CONFIG.deniedPaths,
      maxExecutionTime: parseInt(process.env.SANDBOX_MAX_EXECUTION_TIME || '60000', 10),
    }
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    sendEvent?: EventSender,
    streamToolUseId?: string
  ): Promise<ToolResult> {
    // 1. 解析工具名称别名
    const normalizedName = normalizeToolName(name)
    const actualName = normalizedName || name
    
    // 查找工具（尝试标准化名称）
    let tool = this.tools.get(actualName)
    
    // 如果找不到，尝试原始名称
    if (!tool) {
      tool = this.tools.get(name)
    }
    
    if (!tool) {
      // 提供友好的错误信息，包括可能的别名建议
      const availableTools = Array.from(this.tools.keys())
      let errorMsg = `Tool not found: ${name}`
      
      if (normalizedName && normalizedName !== name) {
        errorMsg += `\n注意: "${name}" 不是标准名称，标准名称是 "${normalizedName}"`
      }
      
      // 提供最接近的匹配建议
      const suggestions = this.findSimilarToolNames(name, availableTools)
      if (suggestions.length > 0) {
        errorMsg += `\n您是否在寻找: ${suggestions.join(', ')}`
      }
      
      return { success: false, error: errorMsg }
    }

    const toolId = streamToolUseId || uuidv4()
    const startTime = Date.now()

    sendEvent?.('tool_start', { id: toolId, name: tool.name, input })

    const toolCall: ToolCall = {
      id: toolId,
      name: tool.name, // 使用标准化名称
      input,
      status: 'pending',
      startedAt: startTime,
    }

    try {
      // 2. 输入验证（使用 JSON Schema）
      if (tool.inputSchema) {
        const validationResult = validateInputAgainstSchema(input, tool.inputSchema)
        if (!validationResult.valid) {
          const errorMessages = validationResult.errors.map(
            e => `  - ${e.field}: ${e.message}`
          ).join('\n')
          throw new Error(`输入验证失败:\n${errorMessages}`)
        }
        
        // 输出警告（如果有）
        if (validationResult.warnings && validationResult.warnings.length > 0) {
          console.warn(`[Tool Executor] 工具 ${tool.name} 验证警告:`, validationResult.warnings)
        }
      }
      
      // 权限检查
      const permissionCheck = this.canExecuteTool(tool.name, this.context.userId)
      if (!permissionCheck.allowed) {
        throw new Error(permissionCheck.reason)
      }

      // 沙箱检查
      const sandboxConfig = this.getSandboxConfig()
      if (sandboxConfig.enabled || this.context.sandboxed) {
        if (tool.permissions?.dangerous) {
          throw new Error(`Tool '${tool.name}' requires elevated permissions`)
        }
        return await this.executeInSandbox(tool, input, toolId, startTime, sendEvent)
      }

      // ==================== 路径安全检查（防止目录遍历）====================
      if (tool.name === 'Bash' || tool.name === 'PowerShell') {
        const command = (input.command || '') as string
        const workingDir = (input.cwd || this.context.projectRoot) as string
        const cmdType = tool.name === 'PowerShell' ? 'powershell' : 'bash'
        
        // 1. 检测目录遍历攻击（cd .. 等）
        const traversalCheck = validateCommandForTraversal(command)
        if (!traversalCheck.allowed && traversalCheck.severity === 'block') {
          throw new Error(traversalCheck.reason || '安全限制：禁止访问父目录')
        }

        // 2. 综合命令安全性验证
        const securityCheck = validateCommandSecurity(command, workingDir, cmdType as 'bash' | 'powershell')
        if (!securityCheck.allowed && securityCheck.severity === 'block') {
          throw new Error(securityCheck.reason || '安全限制：命令包含不安全的操作')
        }

        // 3. 警告但不阻止的情况
        if (!securityCheck.allowed && securityCheck.severity === 'warn') {
          sendEvent?.('tool_progress', { 
            output: `⚠️ 安全警告: ${securityCheck.reason}\n` 
          })
        }
      }

      // 文件操作工具的路径检查（与 resolvePath 一致：前导 / 视为工作区根下的相对路径）
      const fileToolPaths: string[] = []
      if (tool.name === 'FileRename') {
        if (typeof input.oldPath === 'string' && input.oldPath) fileToolPaths.push(input.oldPath)
        if (typeof input.newPath === 'string' && input.newPath) fileToolPaths.push(input.newPath)
      } else if (
        [
          'FileRead',
          'FileWrite',
          'FileEdit',
          'FileDelete',
          'Glob',
          'Grep',
          'ImageRead',
          'NotebookEdit',
        ].includes(tool.name)
      ) {
        const p = (input.filepath || input.path || input.notebook_path) as string
        if (typeof p === 'string' && p) fileToolPaths.push(p)
      }

      for (const rawPath of fileToolPaths) {
        if (containsParentDirectoryReference(rawPath)) {
          throw new Error(
            '🚫 安全限制：文件路径不能包含 ".."（父目录引用）。Agent 只能访问当前工作目录及其子目录。'
          )
        }
        const resolvedForCheck = this.resolvePath(rawPath)
        const pathCheck = await import('../utils/pathSecurity').then((m) =>
          m.validatePathWithinRoot(resolvedForCheck, this.context.projectRoot)
        )
        if (pathCheck && !pathCheck.allowed && pathCheck.severity === 'block') {
          throw new Error(pathCheck.reason || '安全限制：文件路径超出工作目录范围')
        }
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

      sendEvent?.('tool_end', { id: toolId, name: tool.name, result })
      this.updateHistory(toolCall)

      return result
    } catch (error) {
      toolCall.status = 'error'
      toolCall.error = error instanceof Error ? error.message : String(error)
      this.updateHistory(toolCall)

      sendEvent?.('tool_error', { id: toolId, name: tool.name, error: toolCall.error })
      return { success: false, error: toolCall.error }
    }
  }

  // ==================== Helper Functions ====================

  /**
   * 查找相似的工具名称（用于错误提示）
   */
  private findSimilarToolNames(input: string, tools: string[]): string[] {
    const normalizedInput = input.toLowerCase()
    const suggestions: Array<{ name: string; score: number }> = []

    for (const tool of tools) {
      // 直接匹配
      if (tool.toLowerCase() === normalizedInput) {
        continue // 完全匹配不应该作为建议
      }

      // 检查是否是输入的开头
      if (tool.toLowerCase().startsWith(normalizedInput)) {
        suggestions.push({ name: tool, score: 10 })
        continue
      }

      // 计算编辑距离
      const distance = this.levenshteinDistance(normalizedInput, tool.toLowerCase())
      const maxLen = Math.max(normalizedInput.length, tool.length)
      const similarity = ((maxLen - distance) / maxLen) * 100

      if (similarity > 50) {
        suggestions.push({ name: tool, score: similarity })
      }
    }

    // 返回得分最高的前 3 个
    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => s.name)
  }

  /**
   * 计算两个字符串的 Levenshtein 距离
   */
  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length

    const matrix: number[][] = []

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        }
      }
    }

    return matrix[b.length][a.length]
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

        const st = await stat(filePath)
        if (st.isDirectory()) {
          return {
            success: false,
            error:
              '路径是文件夹，无法按文件打开。请在文件浏览器中选择具体文件，或使用 FileList 查看目录内容。',
          }
        }

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
        const rel = relative(this.context.projectRoot, filePath)
        const virtualPath =
          '/' + rel.split(/[/\\]/).filter(Boolean).join('/')

        return {
          success: true,
          result: {
            path: filePath,
            /** 与工作区文件树一致的虚拟路径，如 /skills/README.md */
            virtualPath,
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
      description: 'Create a new task - IMPORTANT: DO NOT use this to update existing tasks, use TaskUpdate instead',
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
        // 创建后台任务
        const task = backgroundTaskManager.createTask({
          name: input.title as string,
          description: input.description as string || '',
          priority: TaskPriority.NORMAL,
          metadata: {
            source: 'agent_tool',
            priority: input.priority,
          },
        })
        
        const taskResult = {
          id: task.id,
          title: task.name,
          description: task.description,
          status: task.status,
          priority: input.priority || 'medium',
          createdAt: task.createdAt.getTime(),
          updatedAt: task.createdAt.getTime(),
        }

        return {
          success: true,
          result: taskResult,
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
        // 从后台任务管理器获取任务
        let allTasks = backgroundTaskManager.getAllTasks()
        
        // 筛选
        if (input.status) {
          allTasks = allTasks.filter(t => t.status === input.status)
        }
        if (input.priority) {
          allTasks = allTasks.filter(t => t.priority === TaskPriority.NORMAL)
        }
        
        const limit = (input.limit as number) || 50
        const tasks = allTasks.slice(0, limit).map(t => ({
          id: t.id,
          title: t.name,
          description: t.description,
          status: t.status,
          priority: 'normal',
          createdAt: t.createdAt.getTime(),
        }))
        
        return {
          success: true,
          result: { tasks, total: allTasks.length },
        }
      },
    })

    this.registerTool({
      name: 'TaskGet',
      description: 'Get a specific task by ID',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID to retrieve' },
        },
        required: ['taskId'],
      },
      category: 'system',
      handler: async (input) => {
        const taskId = input.taskId as string
        
        if (!taskId) {
          return { success: false, error: 'Task ID is required' }
        }
        
        const task = backgroundTaskManager.getTask(taskId)
        
        if (!task) {
          return { success: false, error: `Task not found: ${taskId}` }
        }
        
        const taskResult = {
          id: task.id,
          title: task.name,
          description: task.description,
          status: task.status,
          priority: 'normal',
          createdAt: task.createdAt.getTime(),
        }
        
        return {
          success: true,
          result: taskResult,
        }
      },
    })

    this.registerTool({
      name: 'TaskUpdate',
      description: 'Update a task (use this to change task status, mark as completed, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID to update' },
          status: { 
            type: 'string', 
            enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'], 
            description: 'New task status' 
          },
          title: { type: 'string', description: 'New task title (optional)' },
          description: { type: 'string', description: 'New task description (optional)' },
        },
        required: ['taskId'],
      },
      category: 'system',
      handler: async (input) => {
        const taskId = input.taskId as string
        
        if (!taskId) {
          return { success: false, error: 'Task ID is required' }
        }
        
        const task = backgroundTaskManager.getTask(taskId)
        
        if (!task) {
          return { success: false, error: `Task not found: ${taskId}` }
        }
        
        // 更新任务状态
        if (input.status) {
          const status = input.status as string
          if (status === 'completed') {
            backgroundTaskManager.completeTask(taskId)
          } else if (status === 'failed') {
            backgroundTaskManager.failTask(taskId, 'Updated via TaskUpdate')
          } else if (status === 'in_progress') {
            // 对于 in_progress，我们可以直接更新状态
            ;(task as any).status = status
          } else {
            ;(task as any).status = status
          }
        }
        
        // 更新标题和描述
        if (input.title) {
          ;(task as any).name = input.title as string
        }
        if (input.description) {
          ;(task as any).description = input.description as string
        }
        
        const taskResult = {
          id: task.id,
          title: task.name,
          description: task.description,
          status: task.status,
          priority: 'normal',
          createdAt: task.createdAt.getTime(),
          updatedAt: Date.now(),
        }
        
        return {
          success: true,
          result: taskResult,
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

    // === Agent Tools ===

    // Agent 工具 - 启动子代理
    const agentTool = createAgentToolDefinition()
    if ('handler' in agentTool && typeof agentTool.handler === 'function') {
      this.registerTool({
        name: agentTool.name,
        description: agentTool.description,
        inputSchema: agentTool.inputSchema,
        category: 'agent',
        permissions: { requiresAuth: true },
        handler: agentTool.handler,
      })
    }

    // SendMessage 工具 - 向 Agent 发送消息
    const sendMessageTool = createSendMessageToolDefinition()
    if ('handler' in sendMessageTool && typeof sendMessageTool.handler === 'function') {
      this.registerTool({
        name: sendMessageTool.name,
        description: sendMessageTool.description,
        inputSchema: sendMessageTool.inputSchema,
        category: 'agent',
        permissions: { requiresAuth: true },
        handler: sendMessageTool.handler,
      })
    }

    // ExitPlanMode 工具 - 退出计划模式
    const exitPlanModeTool = createExitPlanModeToolDefinition()
    if ('handler' in exitPlanModeTool && typeof exitPlanModeTool.handler === 'function') {
      this.registerTool({
        name: exitPlanModeTool.name,
        description: exitPlanModeTool.description,
        inputSchema: exitPlanModeTool.inputSchema,
        category: 'plan',
        handler: exitPlanModeTool.handler,
      })
    }

    // Sleep 工具 - 暂停执行
    const sleepTool = createSleepToolDefinition()
    if ('handler' in sleepTool && typeof sleepTool.handler === 'function') {
      this.registerTool({
        name: sleepTool.name,
        description: sleepTool.description,
        inputSchema: sleepTool.inputSchema,
        category: 'system',
        handler: sleepTool.handler,
      })
    }

    // UserTerminal 工具 - 列出用户在 IDE 中打开的 PTY 会话
    this.registerTool({
      name: 'UserTerminalList',
      description: '列出当前用户在 IDE 中打开的所有终端会话。包括会话 ID、Shell 类型、工作目录、连接状态等信息。注意：用户须在浏览器中打开了 IDE 终端面板才可能有会话。',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      category: 'system',
      handler: async (_, ctx) => {
        if (!ctx.userId) return { success: false, error: '需要登录后才能使用此工具' }
        // 直接 import ptyManager（避免循环依赖）
        const { ptyManager } = await import('./ptyManager')
        const sessions = ptyManager.getSessionsForUser(ctx.userId)
        return {
          success: true,
          result: {
            count: sessions.length,
            sessions: sessions.map(s => ({
              id: s.id,
              shell: s.shell,
              cwd: s.cwd,
              cols: s.cols,
              rows: s.rows,
              isAlive: s.isAlive,
              createdAt: new Date(s.createdAt).toISOString(),
              lastActiveAt: new Date(s.lastActiveAt).toISOString(),
            })),
          },
        }
      },
    })

    // UserTerminalWrite 工具 - 向指定终端会话写入输入
    this.registerTool({
      name: 'UserTerminalWrite',
      description: '向用户在 IDE 中打开的指定终端会话写入输入（按键序列）。sessionId 通过 UserTerminalList 获取。此工具无法读取终端输出，只负责发送按键。',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '终端会话 ID（来自 UserTerminalList）' },
          input: { type: 'string', description: '要发送的输入文本（如命令字符串，会自动追加换行）' },
        },
        required: ['sessionId', 'input'],
      },
      category: 'system',
      handler: async (input, ctx) => {
        if (!ctx.userId) return { success: false, error: '需要登录后才能使用此工具' }
        const { sessionId, input: text } = input as { sessionId: string; input: string }
        const { ptyManager } = await import('./ptyManager')
        if (!ptyManager.sessionBelongsToUser(sessionId, ctx.userId)) {
          return { success: false, error: '无权操作此终端会话' }
        }
        const written = ptyManager.write(sessionId, text.endsWith('\r') || text.endsWith('\n') ? text : text + '\r')
        return { success: written, result: { sessionId, bytesWritten: written ? text.length : 0 } }
      },
    })

    // UserTerminalKill 工具 - 销毁指定终端会话
    this.registerTool({
      name: 'UserTerminalKill',
      description: '关闭用户在 IDE 中打开的指定终端会话。sessionId 通过 UserTerminalList 获取。',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: '终端会话 ID（来自 UserTerminalList）' },
        },
        required: ['sessionId'],
      },
      category: 'system',
      handler: async (input, ctx) => {
        if (!ctx.userId) return { success: false, error: '需要登录后才能使用此工具' }
        const { sessionId } = input as { sessionId: string }
        const { ptyManager } = await import('./ptyManager')
        if (!ptyManager.sessionBelongsToUser(sessionId, ctx.userId)) {
          return { success: false, error: '无权操作此终端会话' }
        }
        const destroyed = ptyManager.destroySession(sessionId)
        return { success: destroyed, result: { sessionId, destroyed } }
      },
    })

    // ImageRead 工具 - 读取和查看图片
    this.registerTool({
      name: 'ImageRead',
      description: '读取图片文件并使用大模型视觉 API 分析图片内容。支持 PNG、JPG、JPEG、GIF、WebP、SVG、BMP、TIFF 格式。自动调用大模型分析图片并返回详细的文字描述，而不是直接返回图片数据。',
      inputSchema: {
        type: 'object',
        properties: {
          path: { 
            type: 'string', 
            description: '图片文件路径（支持绝对路径或相对路径）' 
          },
          maxWidth: { 
            type: 'number', 
            description: '最大输出宽度（像素），默认 2048',
            maximum: 4096,
            minimum: 100
          },
          maxHeight: { 
            type: 'number', 
            description: '最大输出高度（像素），默认 2048',
            maximum: 4096,
            minimum: 100
          },
          quality: { 
            type: 'number', 
            description: '图片质量 (0-100)，默认 80。值越小文件越小但质量越低',
            maximum: 100,
            minimum: 1
          },
          fullSize: { 
            type: 'boolean', 
            description: '是否返回原始尺寸图片（不压缩）。注意：大图可能消耗大量 token',
            default: false
          },
        },
        required: ['path'],
      },
      category: 'file',
      permissions: { requiresAuth: false },
      handler: async (input, context, sendEvent) => {
        const imagePath = input.path as string
        
        sendEvent?.('tool_progress', { 
          output: `📷 正在读取并分析图片：${imagePath}\n` 
        })
        
        const result = await executeImageRead(
          {
            path: imagePath,
            maxWidth: input.maxWidth as number,
            maxHeight: input.maxHeight as number,
            quality: input.quality as number,
            fullSize: input.fullSize as boolean,
          },
          context.projectRoot
        )
        
        if (!result.success) {
          return {
            success: false,
            error: result.error
          }
        }
        
        if (!result.result) {
          return {
            success: false,
            error: '图片处理结果为空'
          }
        }
        
        const { analysis, metadata, path } = result.result
        
        sendEvent?.('tool_progress', { 
          output: `✅ 图片分析完成\n` 
        })
        
        // 只返回分析结果，不返回 base64 数据（避免数据库存储问题）
        return {
          success: true,
          result: {
            analysis: analysis || '无法分析图片内容',
            metadata: {
              format: metadata.format,
              dimensions: `${metadata.originalWidth} × ${metadata.originalHeight}`,
              fileSize: `${(metadata.originalSize / 1024).toFixed(1)} KB`,
            },
            path,
          }
        }
      },
    })

    // ==================== 高级工具桥接 ====================

    // LSP 工具 - 语言服务器协议
    const lspTool = createLSPToolDefinition()
    this.registerTool({
      name: lspTool.name,
      description: lspTool.description,
      inputSchema: lspTool.inputSchema,
      category: 'development',
      permissions: { requiresAuth: false },
      isReadOnly: true,
      handler: lspTool.handler,
    })

    // PowerShell 工具 - Windows PowerShell 命令执行
    const powerShellTool = createPowerShellToolDefinition()
    this.registerTool({
      name: powerShellTool.name,
      description: powerShellTool.description,
      inputSchema: powerShellTool.inputSchema,
      category: 'shell',
      permissions: { dangerous: true },
      handler: powerShellTool.handler,
    })

    // DatabaseQuery 工具 - 数据库查询
    const databaseQueryTool = createDatabaseQueryToolDefinition()
    this.registerTool({
      name: databaseQueryTool.name,
      description: databaseQueryTool.description,
      inputSchema: databaseQueryTool.inputSchema,
      category: 'database',
      permissions: { dangerous: true },
      handler: databaseQueryTool.handler,
    })

    // DockerManager 工具 - Docker 容器管理
    const dockerManagerTool = createDockerManagerToolDefinition()
    this.registerTool({
      name: dockerManagerTool.name,
      description: dockerManagerTool.description,
      inputSchema: dockerManagerTool.inputSchema,
      category: 'devops',
      permissions: { dangerous: true },
      handler: dockerManagerTool.handler,
    })

    // GitAdvanced 工具 - Git 高级操作
    const gitAdvancedTool = createGitAdvancedToolDefinition()
    this.registerTool({
      name: gitAdvancedTool.name,
      description: gitAdvancedTool.description,
      inputSchema: gitAdvancedTool.inputSchema,
      category: 'vcs',
      permissions: { dangerous: true },
      handler: gitAdvancedTool.handler,
    })

    // SkillTool - Skills执行工具
    const { createSkillToolDefinition } = await import('../tools/skillTool')
    const skillTool = createSkillToolDefinition()
    this.registerTool({
      name: skillTool.name,
      description: skillTool.description,
      inputSchema: skillTool.inputSchema,
      category: skillTool.category,
      handler: skillTool.handler,
    })

    console.log('[EnhancedToolExecutor] 已注册所有内置工具，包括高级桥接工具：LSP、PowerShell、DatabaseQuery、DockerManager、GitAdvanced、SkillTool')
  }

  // ==================== Helper Methods ====================

  /**
   * 将 Agent 传入的路径解析为磁盘绝对路径。
   * 前导 `/` 在 IDE/Agent 约定中表示「工作区根下的相对路径」，不得当作系统根目录（否则与文件树、FileWrite 展示不一致）。
   * Windows 绝对路径 `C:\...` 仍按绝对路径处理。
   */
  private resolvePath(relativePath: string): string {
    const root = this.context.projectRoot
    const trimmed = (relativePath || '').trim()
    if (!trimmed) {
      return root || resolve('.')
    }
    if (!root) {
      return resolve(trimmed)
    }

    // Windows 绝对路径：C:\ 或 C:/
    if (/^[a-zA-Z]:[\\/]/.test(trimmed)) {
      return resolve(trimmed)
    }

    // UNC
    if (trimmed.startsWith('\\\\')) {
      return resolve(trimmed)
    }

    // 前导斜杠：工作区根相对（与 /api/agent/workdir 虚拟路径一致）
    if (trimmed.startsWith('/')) {
      const without = trimmed.replace(/^\/+/, '')
      return without ? resolve(root, without) : root
    }

    return resolve(root, trimmed)
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

// Export background task manager for use in other modules
export { backgroundTaskManager }
