/**
 * Worker Sandbox - 在 Worker 容器中安全执行命令
 *
 * 职责：
 * - 执行用户命令
 * - 限制文件系统访问
 * - 超时控制
 */

import { spawn } from 'child_process'
import { promisify } from 'util'
import { exec } from 'child_process'
import { isPathSafe, parseEnvironmentVariables } from '../../shared/utils'

const execAsync = promisify(exec)

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
      const { stdout } = await execAsync(`ls -la "${path}"`, { timeout: 5000, maxBuffer: 1024 * 1024 })
      const lines = stdout.split('\n').slice(1)
      const files = lines
        .filter(line => line.trim())
        .map(line => {
          const parts = line.split(/\s+/)
          if (parts.length < 9) return null
          const isDirectory = parts[0].startsWith('d')
          const size = parseInt(parts[4], 10) || 0
          const name = parts.slice(8).join(' ')
          return { name, isDirectory, size }
        })
        .filter((f): f is { name: string; isDirectory: boolean; size: number } => f !== null)

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
      const dir = path.substring(0, path.lastIndexOf('/'))
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

export const workerSandbox = new WorkerSandbox()
