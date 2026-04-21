/**
 * Worker PTY Manager - 在 Worker 容器中管理 PTY 会话
 *
 * 职责：
 * - 创建 PTY 会话
 * - 处理 PTY 输入输出
 * - 管理 PTY 生命周期
 */

import * as pty from 'node-pty'
import * as fs from 'fs'
import { generateRequestId } from '../../shared/utils'

export interface PTYSession {
  id: string
  userId: string
  pty: pty.IPty
  cwd: string
  cols: number
  rows: number
  createdAt: Date
}

export interface PTYOptions {
  cols?: number
  rows?: number
  cwd?: string
  shell?: string
}

export class WorkerPTYManager {
  private sessions: Map<string, PTYSession> = new Map()

  create(userId: string, options: PTYOptions = {}): PTYSession {
    // 检查 PTY 是否启用
    if (process.env.PTY_ENABLED !== 'true') {
      throw new Error('PTY 功能已禁用（PTY_ENABLED !== "true"）')
    }

    const sessionId = generateRequestId()
    const cols = options.cols || 120
    const rows = options.rows || 30
    const defaultCwd = '/workspace'
    let cwd = options.cwd || defaultCwd
    
    // 确保 cwd 存在，如果不存在则使用默认值
    try {
      if (!fs.existsSync(cwd)) {
        console.warn(`[PTY Manager] cwd ${cwd} 不存在，使用默认值 ${defaultCwd}`)
        cwd = defaultCwd
      }
    } catch (error) {
      console.warn(`[PTY Manager] 检查 cwd 失败，使用默认值 ${defaultCwd}`)
      cwd = defaultCwd
    }
    
    const shell = options.shell || (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash')

    console.log(`[PTY Manager] 创建 PTY: userId=${userId}, shell=${shell}, cwd=${cwd}, cols=${cols}, rows=${rows}`)

    /**
     * 使用 --login 参数确保 bash 作为登录 shell 启动
     * 这可以避免某些配置文件导致的问题
     */
    const shellArgs = shell.includes('bash') ? ['--login'] : []

    const ptyProcess = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        HOME: cwd,
        USER: 'root',  // 使用 root 用户，确保 AI Agent 有完整权限
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        LANG: 'en_US.UTF-8',
        // 添加 root 环境变量，确保命令执行时有最高权限
        LOGNAME: 'root',
        SHELL: shell,
      } as Record<string, string>,
    })

    const session: PTYSession = {
      id: sessionId,
      userId,
      pty: ptyProcess,
      cwd,
      cols,
      rows,
      createdAt: new Date(),
    }

    this.sessions.set(sessionId, session)

    ptyProcess.onExit((event: { exitCode: number; signal?: number }) => {
      console.log(`[PTY Manager] PTY 退出: sessionId=${sessionId}, exitCode=${event.exitCode}, signal=${event.signal}`)
      this.sessions.delete(sessionId)
    })

    // 延迟检查 PTY 状态
    setTimeout(() => {
      if (this.sessions.has(sessionId)) {
        const session = this.sessions.get(sessionId)
        console.log(`[PTY Manager] PTY 运行状态检查: sessionId=${sessionId}, pid=${session?.pty.pid}`)
      } else {
        console.log(`[PTY Manager] PTY 已不存在: sessionId=${sessionId}`)
      }
    }, 2000)

    return session
  }

  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return false
    }
    session.pty.write(data)
    return true
  }

  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return false
    }
    session.cols = cols
    session.rows = rows
    session.pty.resize(cols, rows)
    return true
  }

  destroy(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return false
    }
    session.pty.kill()
    this.sessions.delete(sessionId)
    return true
  }

  get(sessionId: string): PTYSession | undefined {
    return this.sessions.get(sessionId)
  }

  listByUser(userId: string): PTYSession[] {
    return Array.from(this.sessions.values()).filter(s => s.userId === userId)
  }

  listAll(): PTYSession[] {
    return Array.from(this.sessions.values())
  }

  destroyAll(): void {
    for (const session of this.sessions.values()) {
      session.pty.kill()
    }
    this.sessions.clear()
  }

  getStats(): { total: number; byUser: Record<string, number> } {
    const byUser: Record<string, number> = {}
    for (const session of this.sessions.values()) {
      byUser[session.userId] = (byUser[session.userId] || 0) + 1
    }
    return {
      total: this.sessions.size,
      byUser,
    }
  }
}

export const workerPTYManager = new WorkerPTYManager()
