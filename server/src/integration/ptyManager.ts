/**
 * Claude Code HAHA - PTY Session Manager
 * 
 * 管理后端真实的 shell 会话（PTY），支持：
 * - 创建/销毁 PTY 会话
 * - 双向数据流（输入/输出）
 * - 终端尺寸调整
 * - 会话复用
 */

import { spawn, ChildProcess, execSync } from 'child_process'
import { v4 as uuidv4 } from 'uuid'
import type { WebSocketConnection } from './wsBridge'

// 尝试导入 node-pty，如果不可用则使用降级方案
let ptyModule: typeof import('node-pty') | null = null
try {
  ptyModule = await import('node-pty')
  console.log('[PTY] node-pty loaded successfully')
} catch (err) {
  console.warn('[PTY] node-pty not available, using fallback spawn mode')
}

// ==================== Types ====================

export interface PTYSession {
  id: string
  connectionId: string
  userId: string | null   // 所属用户，Agent 终端工具需要
  process: ChildProcess | import('node-pty').IPty | null
  cwd: string
  shell: string
  createdAt: number
  lastActiveAt: number
  cols: number
  rows: number
  isAlive: boolean
}

export interface PTYCreateOptions {
  connectionId: string
  userId?: string          // 所属用户
  shell?: 'powershell' | 'cmd' | 'bash' | 'auto'
  cwd?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
}

export interface PTYOutput {
  sessionId: string
  data: string
  type: 'stdout' | 'stderr' | 'exit'
  exitCode?: number
}

type PTYEventCallback = (output: PTYOutput) => void

// ==================== PTY Session Manager ====================

export class PTYSessionManager {
  private sessions: Map<string, PTYSession> = new Map()
  private connectionSessions: Map<string, Set<string>> = new Map()
  private eventCallbacks: Map<string, PTYEventCallback> = new Map()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private idleTimeout = 30 * 60 * 1000 // 30 分钟空闲超时

  constructor() {
    // 启动定期清理
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions()
    }, 5 * 60 * 1000) // 每 5 分钟检查一次
  }

  /**
   * 获取系统默认 shell
   */
  private getDefaultShell(): string {
    const platform = process.platform
    if (platform === 'win32') {
      // Windows 上优先使用 PowerShell
      const psPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      try {
        const exists = execSync(`if exist "${psPath}" echo yes`, { encoding: 'utf8' }).trim()
        if (exists === 'yes') return psPath
      } catch {}
      return 'powershell.exe'
    }
    // Linux/macOS 使用 bash 或 zsh
    const shells = ['/bin/bash', '/bin/zsh', '/bin/sh']
    for (const shell of shells) {
      try {
        require('fs').existsSync(shell) && (shell as string)
        return shell
      } catch {}
    }
    return '/bin/bash'
  }

  /**
   * 确定要使用的 shell
   */
  private resolveShell(shellOption?: string): string {
    if (!shellOption || shellOption === 'auto') {
      return this.getDefaultShell()
    }
    
    const platform = process.platform
    if (platform === 'win32') {
      switch (shellOption) {
        case 'powershell':
          return 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
        case 'cmd':
          return 'cmd.exe'
        case 'bash':
          // WSL 或 Git Bash
          const gitBash = 'C:\\Program Files\\Git\\bin\\bash.exe'
          try {
            const exists = execSync(`if exist "${gitBash}" echo yes`, { encoding: 'utf8' }).trim()
            if (exists === 'yes') return gitBash
          } catch {}
          // 尝试 WSL bash
          try {
            execSync('wsl which bash', { encoding: 'utf8' })
            return 'bash'
          } catch {}
          return 'powershell.exe'
        default:
          return 'powershell.exe'
      }
    }
    return shellOption === 'bash' ? '/bin/bash' : shellOption
  }

  /**
   * 创建新的 PTY 会话
   */
  createSession(options: PTYCreateOptions): PTYSession {
    const sessionId = uuidv4()
    const shell = this.resolveShell(options.shell)
    const cwd = options.cwd || process.cwd()
    const cols = options.cols || 120
    const rows = options.rows || 30

    console.log(`[PTY] Creating session ${sessionId} with shell: ${shell}`)

    let childProcess: ChildProcess | import('node-pty').IPty

    // 准备环境变量
    const envVars: { [key: string]: string } = {}
    // 复制 process.env
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        envVars[key] = value
      }
    }
    // 复制自定义 env
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        envVars[key] = value
      }
    }
    envVars['TERM'] = 'xterm-256color'
    // 覆盖可能被 Windows 宿主机污染的环境变量
    envVars['HOME'] = '/home/bun'
    envVars['USER'] = 'bun'
    delete envVars['APPDATA']
    delete envVars['LOCALAPPDATA']
    delete envVars['ProgramFiles']
    delete envVars['SystemRoot']
    delete envVars['windir']

    // 优先使用 node-pty（支持真正的 PTY）
    if (ptyModule) {
      // 使用 node-pty
      // bash: -i 交互模式, --norc/--noprofile 跳过启动文件, --noediting 禁用 readline(避免 node-pty 中退出)
      const shellArgs = shell.includes('bash') ? ['--norc', '--noprofile', '--noediting', '-i'] : []
      
      console.log(`[PTY] DEBUG: shell=${shell}, args=${JSON.stringify(shellArgs)}, HOME=${envVars.HOME}, cwd=${cwd}`)
      
      childProcess = ptyModule.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: envVars,
      })

      console.log(`[PTY] node-pty spawn success, pid: ${(childProcess as import('node-pty').IPty).pid}`)

      // 打印完整启动输出（诊断 bash 立即退出问题）
      let startupBuffer = ''
      const timer = setTimeout(() => {
        if (startupBuffer) {
          console.log(`[PTY] Startup output for ${sessionId}: ${JSON.stringify(startupBuffer)}`)
        }
      }, 2000)

      // 设置输出处理
      childProcess.onData((data: string) => {
        startupBuffer += data
        console.log(`[PTY] Data received: ${data.length} chars`)
        this.handleOutput(sessionId, 'stdout', data)
      })

      childProcess.onExit(({ exitCode }: { exitCode: number }) => {
        clearTimeout(timer)
        if (startupBuffer) {
          console.log(`[PTY] Startup output for ${sessionId}: ${JSON.stringify(startupBuffer)}`)
        }
        console.log(`[PTY] Session ${sessionId} exited with code: ${exitCode}`)
        this.handleOutput(sessionId, 'exit', '', exitCode)
      })
    } else {
      // 降级方案：使用普通 spawn
      childProcess = this.createFallbackProcess(shell, cwd, options.env, sessionId)
    }

    // 创建会话对象
    const session: PTYSession = {
      id: sessionId,
      connectionId: options.connectionId,
      userId: options.userId ?? null,
      process: childProcess,
      cwd,
      shell,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      cols,
      rows,
      isAlive: true,
    }

    // 保存会话
    this.sessions.set(sessionId, session)

    // 更新连接与会话的映射
    if (!this.connectionSessions.has(options.connectionId)) {
      this.connectionSessions.set(options.connectionId, new Set())
    }
    this.connectionSessions.get(options.connectionId)!.add(sessionId)

    console.log(`[PTY] Session ${sessionId} created successfully`)
    return session
  }

  /**
   * 创建降级方案进程（普通 spawn）
   */
  private createFallbackProcess(
    shell: string,
    cwd: string,
    env: Record<string, string> | undefined,
    sessionId: string
  ): ChildProcess {
    let childProcess: ChildProcess

    if (process.platform === 'win32') {
      // Windows: 使用 /c 参数运行命令
      const isPowerShell = shell.toLowerCase().includes('powershell')
      if (isPowerShell) {
        childProcess = spawn('powershell.exe', [
          '-NoLogo',
          '-NoExit',
          '-Command',
          `Set-Location '${cwd.replace(/'/g, "''")}'; Clear-Host`
        ], {
          shell: false,
          cwd,
          env: {
            ...process.env,
            ...env,
            TERM: 'xterm-256color',
          },
          windowsHide: true,
        })
      } else {
        childProcess = spawn('cmd.exe', ['/c', `cd /d "${cwd}" && cls`], {
          shell: false,
          cwd,
          env: {
            ...process.env,
            ...env,
            TERM: 'xterm-256color',
          },
          windowsHide: true,
        })
      }
    } else {
      // Unix 降级：stdio 是 pipe，不是 TTY。bash --login 仍会判为非交互，stdin 无数据即 EOF → 立刻以 0 退出。
      // 与 node-pty 分支对齐：--noediting 禁用 readline, -i 强制交互
      let args: string[] = []
      if (shell.includes('bash')) {
        args = ['--norc', '--noprofile', '--noediting', '-i']
      } else if (shell.includes('zsh')) {
        args = ['-i']
      }
      childProcess = spawn(shell, args, {
        cwd,
        env: {
          ...process.env,
          ...env,
          TERM: 'xterm-256color',
        },
      })
    }

    // 设置输出处理
    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        this.handleOutput(sessionId, 'stdout', data.toString())
      })
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        this.handleOutput(sessionId, 'stderr', data.toString())
      })
    }

    if (childProcess.stdout || childProcess.stderr) {
      childProcess.on('close', (code: number | null) => {
        console.log(`[PTY] Session ${sessionId} exited with code: ${code}`)
        this.handleOutput(sessionId, 'exit', '', code ?? undefined)
      })
    }

    childProcess.on('error', (err: Error) => {
      console.error(`[PTY] Session ${sessionId} error:`, err)
      this.handleOutput(sessionId, 'stderr', `Error: ${err.message}\r\n`)
    })

    return childProcess
  }

  /**
   * 处理 PTY 输出
   */
  private handleOutput(sessionId: string, type: 'stdout' | 'stderr' | 'exit', data: string, exitCode?: number): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    session.lastActiveAt = Date.now()

    if (type === 'exit') {
      session.isAlive = false
    }

    const output: PTYOutput = {
      sessionId,
      data,
      type,
      exitCode,
    }

    // 通知所有监听器
    const callback = this.eventCallbacks.get(sessionId)
    if (callback) {
      callback(output)
    }
  }

  /**
   * 发送输入到 PTY
   */
  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || !session.isAlive) {
      console.warn(`[PTY] Cannot write to session ${sessionId}: session not found or not alive`)
      return false
    }

    session.lastActiveAt = Date.now()

    try {
      // 检查是否是 node-pty 进程
      if (ptyModule && 'write' in session.process!) {
        // node-pty 模式
        ;(session.process as import('node-pty').IPty).write(data)
        return true
      } else {
        // 降级方案：普通 spawn
        const childProcess = session.process as ChildProcess
        if (childProcess?.stdin && !childProcess.stdin.writableEnded) {
          childProcess.stdin.write(data)
          return true
        }
      }
      
      console.warn(`[PTY] Cannot write to session ${sessionId}: stdin not available`)
      return false
    } catch (error) {
      console.error(`[PTY] Write error for session ${sessionId}:`, error)
      return false
    }
  }

  /**
   * 调整终端尺寸
   */
  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) {
      console.warn(`[PTY] Cannot resize session ${sessionId}: session not found`)
      return false
    }

    session.cols = cols
    session.rows = rows
    session.lastActiveAt = Date.now()

    // 如果是 node-pty，调用 resize 方法
    if (ptyModule && 'resize' in session.process!) {
      try {
        ;(session.process as import('node-pty').IPty).resize(cols, rows)
      } catch (err) {
        console.error(`[PTY] Error resizing session ${sessionId}:`, err)
      }
    }

    console.log(`[PTY] Resized session ${sessionId} to ${cols}x${rows}`)
    return true
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): PTYSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * 获取连接的所有会话
   */
  getConnectionSessions(connectionId: string): PTYSession[] {
    const sessionIds = this.connectionSessions.get(connectionId)
    if (!sessionIds) return []
    
    return Array.from(sessionIds)
      .map(id => this.sessions.get(id))
      .filter((s): s is PTYSession => s !== undefined)
  }

  /**
   * 获取用户的所有会话（跨连接，用于 Agent 终端工具）
   */
  getSessionsForUser(userId: string): PTYSession[] {
    const result: PTYSession[] = []
    for (const session of this.sessions.values()) {
      if (session.userId === userId) {
        result.push(session)
      }
    }
    return result
  }

  /**
   * 校验会话是否属于指定用户（归属校验）
   */
  sessionBelongsToUser(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId)
    return session?.userId === userId
  }

  /**
   * 销毁会话
   */
  destroySession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) {
      console.warn(`[PTY] Cannot destroy session ${sessionId}: session not found`)
      return false
    }

    console.log(`[PTY] Destroying session ${sessionId}`)

    // 移除事件回调
    this.eventCallbacks.delete(sessionId)

    // 终止进程
    if (session.process) {
      try {
        // 检查是否是 node-pty 进程
        if (ptyModule && 'kill' in session.process) {
          // node-pty 模式
          ;(session.process as import('node-pty').IPty).kill()
        } else {
          // 降级方案：普通 spawn
          const childProcess = session.process as ChildProcess
          // 尝试优雅关闭
          if (childProcess.stdin) {
            childProcess.stdin.write('exit\r\n')
          }
          
          // 等待一小段时间后强制终止
          setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              try {
                process.platform === 'win32'
                  ? execSync(`taskkill /pid ${childProcess.pid} /T /F`, { windowsHide: true })
                  : childProcess.kill('SIGTERM')
              } catch {}
            }
          }, 500)
        }
      } catch (error) {
        console.error(`[PTY] Error destroying session ${sessionId}:`, error)
      }
      session.process = null
    }

    // 从映射中移除
    const connectionSessions = this.connectionSessions.get(session.connectionId)
    if (connectionSessions) {
      connectionSessions.delete(sessionId)
      if (connectionSessions.size === 0) {
        this.connectionSessions.delete(session.connectionId)
      }
    }

    // 移除会话
    this.sessions.delete(sessionId)
    session.isAlive = false

    console.log(`[PTY] Session ${sessionId} destroyed`)
    return true
  }

  /**
   * 销毁连接的所有会话
   */
  destroyConnectionSessions(connectionId: string): number {
    const sessions = this.getConnectionSessions(connectionId)
    let count = 0
    for (const session of sessions) {
      if (this.destroySession(session.id)) {
        count++
      }
    }
    console.log(`[PTY] Destroyed ${count} sessions for connection ${connectionId}`)
    return count
  }

  /**
   * 注册输出回调
   */
  onOutput(sessionId: string, callback: PTYEventCallback): void {
    this.eventCallbacks.set(sessionId, callback)
  }

  /**
   * 取消注册输出回调
   */
  offOutput(sessionId: string): void {
    this.eventCallbacks.delete(sessionId)
  }

  /**
   * 执行单条命令（不保持会话）
   */
  async executeCommand(
    command: string,
    options: { cwd?: string; shell?: string; timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const shell = this.resolveShell(options.shell)
      const cwd = options.cwd || process.cwd()
      const timeout = options.timeout || 30000

      let stdout = ''
      let stderr = ''
      let killed = false

      const proc = spawn(shell, process.platform === 'win32' 
        ? ['/c', command] 
        : ['-c', command], {
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' },
        timeout,
      })

      if (proc.stdout) {
        proc.stdout.on('data', (data: Buffer) => {
          stdout += data.toString()
        })
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data: Buffer) => {
          stderr += data.toString()
        })
      }

      const timer = setTimeout(() => {
        killed = true
        try {
          process.platform === 'win32'
            ? execSync(`taskkill /pid ${proc.pid} /T /F`, { windowsHide: true })
            : proc.kill('SIGKILL')
        } catch {}
      }, timeout)

      proc.on('close', (code: number | null) => {
        clearTimeout(timer)
        resolve({
          stdout,
          stderr,
          exitCode: code ?? (killed ? -1 : 0),
        })
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        resolve({
          stdout,
          stderr: err.message,
          exitCode: -1,
        })
      })
    })
  }

  /**
   * 清理空闲会话
   */
  private cleanupIdleSessions(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [sessionId, session] of this.sessions) {
      if (session.isAlive && now - session.lastActiveAt > this.idleTimeout) {
        console.log(`[PTY] Cleaning up idle session ${sessionId}`)
        this.destroySession(sessionId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[PTY] Cleaned up ${cleaned} idle sessions`)
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalSessions: number
    aliveSessions: number
    connections: number
  } {
    let aliveSessions = 0
    for (const session of this.sessions.values()) {
      if (session.isAlive) aliveSessions++
    }

    return {
      totalSessions: this.sessions.size,
      aliveSessions,
      connections: this.connectionSessions.size,
    }
  }

  /**
   * 关闭并清理所有会话
   */
  shutdown(): void {
    console.log('[PTY] Shutting down PTY manager...')

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    for (const sessionId of this.sessions.keys()) {
      this.destroySession(sessionId)
    }

    this.sessions.clear()
    this.connectionSessions.clear()
    this.eventCallbacks.clear()

    console.log('[PTY] PTY manager shutdown complete')
  }
}

// ==================== Singleton Instance ====================

export const ptyManager = new PTYSessionManager()
