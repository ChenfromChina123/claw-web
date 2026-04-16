/**
 * 脚本运行时监控器 - Script Runtime Monitor
 * 
 * 监控脚本执行过程中的行为，检测异常模式：
 * - 子进程创建监控（防止 fork 炸弹）
 * - 文件操作监控（防止大量文件删除）
 * - 网络活动监控（防止反向 shell）
 * - 执行超时控制
 * 
 * @packageDocumentation
 */

import { spawn, ChildProcess } from 'child_process'
import { watch, FSWatcher } from 'fs'
import { join } from 'path'

/**
 * 脚本限制配置
 */
export interface ScriptLimits {
  /** 最大子进程数 */
  maxChildProcesses: number
  /** 最大文件描述符数 */
  maxFileDescriptors: number
  /** 最大内存使用（MB） */
  maxMemoryMB: number
  /** 最大执行时间（毫秒） */
  maxExecutionTimeMs: number
  /** 最大文件写入（字节） */
  maxFileSize: number
  /** 文件删除速率限制（5 秒内最多删除的文件数） */
  maxFileDeleteRate: number
}

/**
 * 监控会话信息
 */
export interface MonitoringSession {
  /** 会话 ID */
  id: string
  /** 脚本路径 */
  scriptPath: string
  /** 进程对象 */
  process: ChildProcess
  /** 开始时间 */
  startTime: number
  /** 子进程 PID 集合 */
  childProcesses: Set<number>
  /** 文件操作记录 */
  fileWrites: Array<{
    path: string
    type: string
    timestamp: number
  }>
  /** 网络连接记录 */
  networkConnections: Array<{
    remoteAddress: string
    remotePort: number
    state: string
  }>
  /** 是否已终止 */
  terminated: boolean
}

/**
 * 脚本告警信息
 */
export interface ScriptAlert {
  /** 告警类型 */
  type: string
  /** 告警消息 */
  message: string
  /** 安全级别 */
  severity: 'low' | 'medium' | 'high' | 'critical'
  /** 自动响应动作 */
  action?: 'log' | 'notify' | 'block' | 'terminate'
}

/**
 * 默认限制配置
 */
const DEFAULT_SCRIPT_LIMITS: ScriptLimits = {
  maxChildProcesses: 5,
  maxFileDescriptors: 100,
  maxMemoryMB: 256,
  maxExecutionTimeMs: 60000, // 60 秒
  maxFileSize: 50 * 1024 * 1024, // 50MB
  maxFileDeleteRate: 10, // 5 秒内最多 10 个文件
}

/**
 * 脚本运行时监控器类
 */
export class ScriptRuntimeMonitor {
  private activeSessions: Map<string, MonitoringSession> = new Map()
  private limits: ScriptLimits
  private userRoot: string

  constructor(userRoot: string, limits?: Partial<ScriptLimits>) {
    this.userRoot = userRoot
    this.limits = { ...DEFAULT_SCRIPT_LIMITS, ...limits }
  }

  /**
   * 开始监控脚本执行
   */
  async startMonitoring(
    scriptPath: string,
    process: ChildProcess
  ): Promise<MonitoringSession> {
    const sessionId = this.generateSessionId()

    const session: MonitoringSession = {
      id: sessionId,
      scriptPath,
      process,
      startTime: Date.now(),
      childProcesses: new Set(),
      fileWrites: [],
      networkConnections: [],
      terminated: false,
    }

    // 监控子进程创建
    this.monitorChildProcesses(session)

    // 监控文件操作
    this.monitorFileOperations(session)

    // 监控网络活动（可选，需要外部工具）
    // this.monitorNetworkActivity(session)

    // 设置执行超时
    this.setupTimeout(session)

    // 监听进程退出
    process.on('exit', () => {
      this.cleanupSession(session)
    })

    process.on('error', (error) => {
      this.triggerAlert(session, {
        type: 'process_error',
        message: `进程错误：${error.message}`,
        severity: 'medium',
        action: 'log',
      })
    })

    this.activeSessions.set(sessionId, session)

    return session
  }

  /**
   * 监控子进程创建
   */
  private monitorChildProcesses(session: MonitoringSession): void {
    const checkInterval = setInterval(() => {
      if (session.terminated || !session.process.pid) {
        clearInterval(checkInterval)
        return
      }

      try {
        // 使用系统命令获取子进程信息
        const childProcesses = this.getChildProcesses(session.process.pid)

        if (childProcesses.length > this.limits.maxChildProcesses) {
          this.triggerAlert(session, {
            type: 'too_many_child_processes',
            message: `脚本创建了 ${childProcesses.length} 个子进程，超过限制 ${this.limits.maxChildProcesses}`,
            severity: 'high',
            action: 'terminate',
          })
        }

        session.childProcesses = new Set(childProcesses.map((p) => p.pid))
      } catch (error) {
        // 忽略错误，继续监控
      }
    }, 1000)

    // 清理定时器
    session.process.on('exit', () => {
      clearInterval(checkInterval)
    })
  }

  /**
   * 获取子进程列表
   */
  private getChildProcesses(parentPid: number): Array<{ pid: number; command: string }> {
    try {
      if (process.platform === 'win32') {
        // Windows: 使用 tasklist
        const { execSync } = require('child_process')
        const output = execSync(`tasklist /FI "PPID eq ${parentPid}" /FO CSV`, {
          encoding: 'utf8',
        })
        
        // 解析 CSV 输出
        const lines = output.trim().split('\n').slice(1) // 跳过标题行
        return lines.map((line: string) => {
          const parts = line.split(',')
          const pid = parseInt(parts[1].replace(/"/g, ''))
          const command = parts[0].replace(/"/g, '')
          return { pid, command }
        }).filter((p: any) => !isNaN(p.pid))
      } else {
        // Linux/Mac: 使用 pgrep
        const { execSync } = require('child_process')
        const output = execSync(`pgrep -P ${parentPid}`, {
          encoding: 'utf8',
        })
        
        return output
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((pid: string) => ({
            pid: parseInt(pid),
            command: 'unknown',
          }))
          .filter((p: any) => !isNaN(p.pid))
      }
    } catch (error) {
      return []
    }
  }

  /**
   * 监控文件操作
   */
  private monitorFileOperations(session: MonitoringSession): void {
    try {
      const watcher = watch(this.userRoot, {
        recursive: true,
        persistent: false,
      })

      watcher.on('change', (filename: string | null, event: any) => {
        if (!filename) return

        session.fileWrites.push({
          path: filename.toString(),
          type: event,
          timestamp: Date.now(),
        })

        // 检测大量文件删除
        this.detectMassFileDeletion(session)
      })

      // 清理 watcher
      session.process.on('exit', () => {
        watcher.close()
      })
    } catch (error) {
      // 忽略文件监控错误
    }
  }

  /**
   * 检测大量文件删除
   */
  private detectMassFileDeletion(session: MonitoringSession): void {
    const now = Date.now()
    const recentDeletes = session.fileWrites.filter(
      (w) => w.type === 'rename' && now - w.timestamp < 5000 // 5 秒内
    )

    if (recentDeletes.length > this.limits.maxFileDeleteRate) {
      this.triggerAlert(session, {
        type: 'mass_file_deletion',
        message: `检测到大量文件删除（5 秒内 ${recentDeletes.length} 个文件）`,
        severity: 'critical',
        action: 'terminate',
      })
    }
  }

  /**
   * 设置执行超时
   */
  private setupTimeout(session: MonitoringSession): void {
    const timeout = setTimeout(() => {
      if (!session.terminated) {
        this.triggerAlert(session, {
          type: 'execution_timeout',
          message: `脚本执行超过 ${this.limits.maxExecutionTimeMs}ms`,
          severity: 'medium',
          action: 'terminate',
        })
      }
    }, this.limits.maxExecutionTimeMs)

    // 清理定时器
    session.process.on('exit', () => {
      clearTimeout(timeout)
    })

    session.process.on('error', () => {
      clearTimeout(timeout)
    })
  }

  /**
   * 触发告警
   */
  private triggerAlert(
    session: MonitoringSession,
    alert: ScriptAlert
  ): void {
    // 记录告警
    console.warn(`[ScriptRuntimeMonitor][${alert.type}] ${alert.message}`)

    // 发送告警事件
    this.emitAlert(session, alert)

    // 自动响应
    if (alert.action === 'terminate') {
      this.terminateSession(session)
    }
  }

  /**
   * 发送告警事件
   */
  private emitAlert(session: MonitoringSession, alert: ScriptAlert): void {
    // 可以通过 EventEmitter 或回调发送告警
    const alertEvent = {
      sessionId: session.id,
      scriptPath: session.scriptPath,
      timestamp: new Date(),
      ...alert,
    }

    // 发送到审计日志
    console.log('[AUDIT]', JSON.stringify(alertEvent))
  }

  /**
   * 终止会话
   */
  private terminateSession(session: MonitoringSession): void {
    if (session.terminated) return

    session.terminated = true

    console.log(`[ScriptRuntimeMonitor] Terminating session: ${session.id}`)

    // 终止主进程
    try {
      if (session.process.pid) {
        if (process.platform === 'win32') {
          // Windows: 使用 taskkill
          const { execSync } = require('child_process')
          execSync(`taskkill /PID ${session.process.pid} /T /F`)
        } else {
          // Linux/Mac: 使用 kill
          process.kill(-session.process.pid, 'SIGKILL') // 负数 PID 表示整个进程组
        }
      }
    } catch (error) {
      console.error('Failed to terminate process:', error)
    }

    // 终止所有子进程
    session.childProcesses.forEach((pid) => {
      try {
        if (process.platform === 'win32') {
          const { execSync } = require('child_process')
          execSync(`taskkill /PID ${pid} /F`)
        } else {
          process.kill(pid, 'SIGKILL')
        }
      } catch (error) {
        // 进程可能已经退出
      }
    })

    // 清理会话
    this.cleanupSession(session)
  }

  /**
   * 清理会话
   */
  private cleanupSession(session: MonitoringSession): void {
    this.activeSessions.delete(session.id)
  }

  /**
   * 生成会话 ID
   */
  private generateSessionId(): string {
    return `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 获取活跃会话数
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): MonitoringSession[] {
    return Array.from(this.activeSessions.values())
  }

  /**
   * 更新限制配置
   */
  updateLimits(limits: Partial<ScriptLimits>): void {
    this.limits = { ...this.limits, ...limits }
  }
}

/**
 * 创建脚本运行时监控器的工厂函数
 */
export function createScriptRuntimeMonitor(
  userRoot: string,
  limits?: Partial<ScriptLimits>
): ScriptRuntimeMonitor {
  return new ScriptRuntimeMonitor(userRoot, limits)
}
