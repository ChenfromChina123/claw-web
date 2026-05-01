/**
 * Worker Sandbox - 在 Worker 容器中安全执行命令
 *
 * 职责：
 * - 执行用户命令（以 root 权限运行）
 * - 限制文件系统访问（仅限制路径遍历，不限制命令）
 * - 超时控制
 * - 基本安全验证（仅阻止容器破坏性操作）
 *
 * 权限说明：
 * - Worker 容器以 --privileged 模式运行
 * - 所有命令均以 root 权限执行
 * - AI Agent 需要完整的系统权限来执行管理任务
 */

import { spawn } from 'child_process'
import { promisify } from 'util'
import { exec } from 'child_process'
import { isPathSafe, isPathSafeAsync, parseEnvironmentVariables } from '../../shared/utils'

const execAsync = promisify(exec)

/**
 * 验证命令是否包含破坏性操作（宽松模式）
 * 只阻止真正危险的操作，允许系统管理命令
 *
 * @param command 要验证的命令
 * @returns 是否安全
 */
function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  // 仅阻止容器破坏性操作
  const destructivePatterns = [
    /shutdown|reboot|halt/i,        // 关机/重启
    /mkfs\b/,                        // 格式化
    /rm\s+-rf\s+\/($|\s)/,          // 删除根目录
    /dd\s+.*of=\/dev\//,             // 破坏性写入设备
    /:\(\)\{.*\};:/,                 // Fork bomb
  ]

  for (const pattern of destructivePatterns) {
    if (pattern.test(command)) {
      return { safe: false, reason: `检测到破坏性操作: ${pattern}` }
    }
  }

  // 允许所有其他命令（包括 sudo, systemctl, mount 等）
  return { safe: true }
}

export interface SandboxExecOptions {
  cwd?: string
  env?: Record<string, string>
  timeout?: number
  maxBuffer?: number
}

export interface SandboxExecResult {
  stdout: string
  stderr: string
  exitCode: number
  duration: number
  error?: string
}

export class WorkerSandbox {
  private workspaceDir: string
  private defaultTimeout: number
  private defaultMaxBuffer: number

  constructor(workspaceDir = '/workspace', defaultTimeout = 30000, defaultMaxBuffer = 1024 * 1024) {
    this.workspaceDir = workspaceDir
    this.defaultTimeout = defaultTimeout
    this.defaultMaxBuffer = defaultMaxBuffer
  }

  /**
   * 执行沙盒命令
   * @param command 要执行的命令
   * @param options 执行选项
   * @returns 执行结果
   */
  async exec(command: string, options: SandboxExecOptions = {}): Promise<SandboxExecResult> {
    const startTime = Date.now()
    const cwd = options.cwd || this.workspaceDir
    const env = parseEnvironmentVariables({
      ...process.env,
      ...options.env,
      HOME: this.workspaceDir,
    })
    const timeout = options.timeout || this.defaultTimeout
    const maxBuffer = options.maxBuffer || this.defaultMaxBuffer

    // 安全验证：检查命令是否包含危险路径遍历
    const commandSafety = isCommandSafe(command)
    if (!commandSafety.safe) {
      return {
        stdout: '',
        stderr: `安全限制: ${commandSafety.reason}`,
        exitCode: 1,
        duration: Date.now() - startTime,
        error: 'UNSAFE_COMMAND',
      }
    }

    if (!isPathSafe(cwd, this.workspaceDir)) {
      return {
        stdout: '',
        stderr: `Error: Working directory must be within ${this.workspaceDir}`,
        exitCode: 1,
        duration: Date.now() - startTime,
        error: 'INVALID_CWD',
      }
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        env,
        timeout,
        maxBuffer,
      })

      return {
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0,
        duration: Date.now() - startTime,
      }
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || 'Execution failed',
        exitCode: error.code || 1,
        duration: Date.now() - startTime,
        error: error.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'EXECUTION_ERROR',
      }
    }
  }

  async listDir(path: string): Promise<{ files: Array<{ name: string; isDirectory: boolean; size: number }>; error?: string }> {
    if (!isPathSafe(path, this.workspaceDir)) {
      return { files: [], error: 'INVALID_PATH' }
    }

    try {
      // 使用 Node.js fs 模块跨平台读取目录
      const fs = await import('fs/promises')
      const pathModule = await import('path')
      const entries = await fs.readdir(path, { withFileTypes: true })
      
      const files = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = pathModule.join(path, entry.name)
          let size = 0
          try {
            const stats = await fs.stat(fullPath)
            size = stats.size
          } catch {
            // 忽略无法访问的文件
          }
          return {
            name: entry.name,
            isDirectory: entry.isDirectory(),
            size,
          }
        })
      )

      return { files }
    } catch (error: any) {
      return { files: [], error: error.message }
    }
  }

  async readFile(path: string, encoding: BufferEncoding = 'utf8'): Promise<{ content: string | Buffer; error?: string }> {
    if (!isPathSafe(path, this.workspaceDir) || !(await isPathSafeAsync(path, this.workspaceDir))) {
      return { content: '', error: 'INVALID_PATH' }
    }

    try {
      const fs = await import('fs/promises')
      const content = await fs.readFile(path, encoding)
      return { content }
    } catch (error: any) {
      return { content: '', error: error.message }
    }
  }

  async writeFile(path: string, content: string | Buffer): Promise<{ success: boolean; error?: string }> {
    if (!isPathSafe(path, this.workspaceDir) || !(await isPathSafeAsync(path, this.workspaceDir))) {
      return { success: false, error: 'INVALID_PATH' }
    }

    try {
      const fs = await import('fs/promises')
      const pathModule = await import('path')
      const dir = pathModule.dirname(path)
      if (dir) {
        await fs.mkdir(dir, { recursive: true })
      }
      await fs.writeFile(path, content)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  async deleteFile(path: string): Promise<{ success: boolean; error?: string }> {
    if (!isPathSafe(path, this.workspaceDir) || !(await isPathSafeAsync(path, this.workspaceDir))) {
      return { success: false, error: 'INVALID_PATH' }
    }

    try {
      const fs = await import('fs/promises')
      const stat = await fs.stat(path)
      if (stat.isDirectory()) {
        await fs.rm(path, { recursive: true })
      } else {
        await fs.unlink(path)
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 执行 Agent 工具（在 Worker 沙箱中安全执行）
   * @param toolName 工具名称
   * @param toolInput 工具输入参数
   * @param options 执行选项
   * @returns 执行结果
   */
  async execTool(
    toolName: string,
    toolInput: Record<string, unknown>,
    options: { cwd?: string; timeout?: number } = {}
  ): Promise<{ success: boolean; result?: unknown; output?: string; error?: string }> {
    const startTime = Date.now()
    const cwd = options.cwd || this.workspaceDir
    const timeout = options.timeout || this.defaultTimeout

    // 验证工作目录安全
    if (!isPathSafe(cwd, this.workspaceDir)) {
      return {
        success: false,
        error: `Error: Working directory must be within ${this.workspaceDir}`,
      }
    }

    try {
      let result: unknown
      let output: string | undefined

      switch (toolName) {
        case 'Bash':
        case 'Exec': {
          const command = toolInput.command as string
          const cmdCwd = (toolInput.cwd as string) || cwd
          if (!isPathSafe(cmdCwd, this.workspaceDir)) {
            return { success: false, error: `Invalid cwd: ${cmdCwd}` }
          }
          const execResult = await this.exec(command, { cwd: cmdCwd, timeout })
          result = {
            stdout: execResult.stdout,
            stderr: execResult.stderr,
            exitCode: execResult.exitCode,
          }
          output = execResult.stdout
          break
        }

        case 'FileRead': {
          const path = toolInput.path as string
          const resolvedPath = this.resolveWorkspacePath(path)
          if (!isPathSafe(resolvedPath, this.workspaceDir)) {
            return { success: false, error: `Invalid path: ${path}` }
          }
          const readResult = await this.readFile(resolvedPath, 'utf8')
          if (readResult.error) {
            return { success: false, error: readResult.error }
          }
          let content = readResult.content as string
          const limit = toolInput.limit as number | undefined
          const offset = toolInput.offset as number | undefined
          if (offset && offset > 0) {
            const lines = content.split('\n')
            content = lines.slice(offset).join('\n')
          }
          if (limit && limit > 0) {
            const lines = content.split('\n')
            content = lines.slice(0, limit).join('\n')
          }
          result = { content, path: resolvedPath }
          output = content
          break
        }

        case 'FileWrite': {
          const path = toolInput.path as string
          const content = toolInput.content as string
          const resolvedPath = this.resolveWorkspacePath(path)
          if (!isPathSafe(resolvedPath, this.workspaceDir)) {
            return { success: false, error: `Invalid path: ${path}` }
          }
          const writeResult = await this.writeFile(resolvedPath, content)
          if (!writeResult.success) {
            return { success: false, error: writeResult.error }
          }
          result = { success: true, path: resolvedPath }
          break
        }

        case 'FileEdit': {
          const path = toolInput.path as string
          const oldString = toolInput.old_string as string
          const newString = toolInput.new_string as string
          const resolvedPath = this.resolveWorkspacePath(path)
          if (!isPathSafe(resolvedPath, this.workspaceDir)) {
            return { success: false, error: `Invalid path: ${path}` }
          }
          const fs = await import('fs/promises')
          let content = await fs.readFile(resolvedPath, 'utf8')
          if (!content.includes(oldString)) {
            return { success: false, error: `Text not found: ${oldString.substring(0, 50)}...` }
          }
          content = content.replace(oldString, newString)
          await fs.writeFile(resolvedPath, content)
          result = { success: true }
          break
        }

        case 'Glob': {
          const { glob } = await import('glob')
          const pattern = toolInput.pattern as string
          const searchPath = (toolInput.path as string) || this.workspaceDir
          if (!isPathSafe(searchPath, this.workspaceDir)) {
            return { success: false, error: `Invalid path: ${searchPath}` }
          }
          const files = await glob(pattern, {
            cwd: searchPath,
            ignore: ['**/node_modules/**', '**/.git/**'],
          })
          result = { files }
          break
        }

        case 'Grep': {
          const { glob } = await import('glob')
          const pattern = toolInput.pattern as string
          const searchPath = (toolInput.path as string) || this.workspaceDir
          const outputMode = (toolInput.output_mode as string) || 'content'
          if (!isPathSafe(searchPath, this.workspaceDir)) {
            return { success: false, error: `Invalid path: ${searchPath}` }
          }
          const matches: string[] = []
          const regex = new RegExp(pattern, 'g')
          const files = await glob('**/*.{ts,js,json,md,txt,html,css,py}', {
            cwd: searchPath,
            ignore: ['**/node_modules/**', '**/.git/**'],
          })
          for (const file of files.slice(0, 100)) {
            try {
              const fs = await import('fs/promises')
              const filePath = (await import('path')).join(searchPath, file)
              const fileContent = await fs.readFile(filePath, 'utf8')
              if (outputMode === 'files_with_matches') {
                if (regex.test(fileContent)) matches.push(file)
              } else {
                const lines = fileContent.split('\n')
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
          result = { matches }
          break
        }

        default:
          return { success: false, error: `Unknown tool: ${toolName}` }
      }

      return { success: true, result, output }
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * 解析工作空间路径（将相对路径转换为绝对路径）
   */
  private resolveWorkspacePath(inputPath: string): string {
    const pathModule = require('path')
    if (pathModule.isAbsolute(inputPath)) {
      return inputPath
    }
    return pathModule.join(this.workspaceDir, inputPath)
  }
}

// 在 Windows 上映射 /workspace 到实际路径
const workspaceDir = process.platform === 'win32' 
  ? (process.env.WORKSPACE_DIR || 'C:\\workspace') 
  : '/workspace'

export const workerSandbox = new WorkerSandbox(workspaceDir)
