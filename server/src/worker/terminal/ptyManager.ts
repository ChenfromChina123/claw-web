/**
 * Worker PTY Manager - 在 Worker 容器中管理 PTY 会话
 *
 * 职责：
 * - 创建 PTY 会话
 * - 处理 PTY 输入输出
 * - 管理 PTY 生命周期
 */

import * as pty from 'node-pty'
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
    const sessionId = generateRequestId()
    const cols = options.cols || 120
    const rows = options.rows || 30
    const cwd = options.cwd || '/workspace'
    const shell = options.shell || (process.platform === 'win32' ? 'cmd.exe' : '/bin/bash')

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        HOME: cwd,
        USER: userId,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
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

    ptyProcess.onExit(() => {
      this.sessions.delete(sessionId)
    })

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
