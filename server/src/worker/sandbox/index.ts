/**
 * Worker Sandbox - 在 Worker 容器中安全执行命令
 *
 * 职责：
 * - 执行用户命令
 * - 限制文件系统访问
 * - 超时控制
 * - 命令安全验证
 */

import { spawn } from 'child_process'
import { promisify } from 'util'
import { exec } from 'child_process'
import { isPathSafe, parseEnvironmentVariables } from '../../shared/utils'

const execAsync = promisify(exec)

/**
 * 验证命令是否包含危险的路径遍历
 * @param command 要验证的命令
 * @returns 是否安全
 */
function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  // 检测 cd .. 切换到父目录
  if (/^\s*(cd|pushd)\s+\.\./.test(command)) {
    return { safe: false, reason: '禁止使用 "cd .." 切换到父目录' }
  }
  
  // 检测路径中的 ..
  if (/\.\.[\/\\]/.test(command) || /[\/\\]\.\./.test(command)) {
    return { safe: false, reason: '检测到路径包含 ".."（父目录引用）' }
  }
  
  // 检测敏感系统路径
  const sensitivePaths = ['/etc/passwd', '/etc/shadow', '/etc/ssh', '.ssh/', 'credentials']
  const commandLower = command.toLowerCase()
  for (const sensitive of sensitivePaths) {
    if (commandLower.includes(sensitive.toLowerCase())) {
      return { safe: false, reason: `尝试访问敏感路径: ${sensitive}` }
    }
  }
  
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
    if (!isPathSafe(path, this.workspaceDir)) {
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
    if (!isPathSafe(path, this.workspaceDir)) {
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
    if (!isPathSafe(path, this.workspaceDir)) {
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
}

// 在 Windows 上映射 /workspace 到实际路径
const workspaceDir = process.platform === 'win32' 
  ? (process.env.WORKSPACE_DIR || 'C:\\workspace') 
  : '/workspace'

export const workerSandbox = new WorkerSandbox(workspaceDir)
