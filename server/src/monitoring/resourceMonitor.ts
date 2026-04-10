/**
 * 资源监控器 - Resource Monitor
 * 
 * 监控系统资源使用情况：
 * - CPU 使用率
 * - 内存使用
 * - 进程数
 * - 文件描述符
 * - PTY 会话数
 * 
 * @packageDocumentation
 */

import { cpus, totalmem, freemem } from 'os'
import { EventEmitter } from 'events'

/**
 * CPU 使用指标
 */
export interface CPUUsage {
  /** CPU 使用百分比 */
  percent: number
  /** 用户态时间 */
  userTime: number
  /** 系统态时间 */
  systemTime: number
  /** 核心数 */
  cores: number
}

/**
 * 内存使用指标
 */
export interface MemoryUsage {
  /** 常驻集大小（RSS） */
  rss: number
  /** 已用堆内存 */
  heapUsed: number
  /** 总堆内存 */
  heapTotal: number
  /** 外部内存 */
  external: number
  /** 系统总内存 */
  totalMemory: number
  /** 系统空闲内存 */
  freeMemory: number
  /** 内存使用百分比 */
  percent: number
}

/**
 * 资源指标
 */
export interface ResourceMetrics {
  /** CPU 使用 */
  cpuUsage: CPUUsage
  /** 内存使用 */
  memoryUsage: MemoryUsage
  /** 进程数 */
  processCount: number
  /** 文件描述符数 */
  fileDescriptorCount: number
  /** PTY 会话数 */
  ptySessionCount: number
  /** 时间戳 */
  timestamp: Date
}

/**
 * 资源限制配置
 */
export interface ResourceLimits {
  /** 最大 CPU 使用百分比 */
  maxCPUPercent: number
  /** 最大内存使用（MB） */
  maxMemoryMB: number
  /** 最大进程数 */
  maxProcessCount: number
  /** 最大文件描述符数 */
  maxFileDescriptors: number
  /** 最大 PTY 会话数 */
  maxPTYSessions: number
}

/**
 * 资源限制违规
 */
export interface LimitViolation {
  /** 违规类型 */
  type: 'cpu' | 'memory' | 'process' | 'fd' | 'pty'
  /** 当前值 */
  currentValue: number
  /** 限制值 */
  limitValue: number
  /** 消息 */
  message: string
  /** 安全级别 */
  severity: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * 默认资源限制
 */
const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxCPUPercent: 80,
  maxMemoryMB: 512,
  maxProcessCount: 100,
  maxFileDescriptors: 1000,
  maxPTYSessions: 50,
}

/**
 * 资源监控器类
 */
export class ResourceMonitor extends EventEmitter {
  private limits: ResourceLimits
  private monitoringInterval: NodeJS.Timeout | null = null
  private lastCPUTimes: Array<{ user: number; sys: number }> = []
  private violationCallbacks: Array<(violation: LimitViolation) => void> = []

  constructor(limits?: Partial<ResourceLimits>) {
    super()
    this.limits = { ...DEFAULT_RESOURCE_LIMITS, ...limits }
  }

  /**
   * 启动监控
   */
  startMonitoring(intervalMs: number = 5000): void {
    if (this.monitoringInterval) {
      this.stopMonitoring()
    }

    // 初始化 CPU 时间
    this.lastCPUTimes = this.getCPUTimes()

    this.monitoringInterval = setInterval(() => {
      this.checkLimits()
    }, intervalMs)

    console.log('[ResourceMonitor] Started monitoring with interval:', intervalMs, 'ms')
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
      console.log('[ResourceMonitor] Stopped monitoring')
    }
  }

  /**
   * 获取当前资源指标
   */
  getMetrics(): ResourceMetrics {
    return {
      cpuUsage: this.getCPUUsage(),
      memoryUsage: this.getMemoryUsage(),
      processCount: this.getProcessCount(),
      fileDescriptorCount: this.getFileDescriptorCount(),
      ptySessionCount: this.getPTYSessionCount(),
      timestamp: new Date(),
    }
  }

  /**
   * 获取 CPU 使用率
   */
  private getCPUUsage(): CPUUsage {
    const currentCPUTimes = this.getCPUTimes()
    const cpuCount = cpus().length

    if (this.lastCPUTimes.length === 0) {
      this.lastCPUTimes = currentCPUTimes
      return {
        percent: 0,
        userTime: 0,
        systemTime: 0,
        cores: cpuCount,
      }
    }

    let totalUser = 0
    let totalSys = 0
    let totalDelta = 0

    for (let i = 0; i < cpuCount; i++) {
      const current = currentCPUTimes[i]
      const last = this.lastCPUTimes[i]

      const userDelta = current.user - last.user
      const sysDelta = current.sys - last.sys
      const idleDelta = current.idle - last.idle

      totalUser += userDelta
      totalSys += sysDelta
      totalDelta += userDelta + sysDelta + idleDelta
    }

    const cpuPercent = totalDelta > 0 ? ((totalUser + totalSys) / totalDelta) * 100 : 0

    this.lastCPUTimes = currentCPUTimes

    return {
      percent: Math.round(cpuPercent * 100) / 100,
      userTime: totalUser,
      systemTime: totalSys,
      cores: cpuCount,
    }
  }

  /**
   * 获取 CPU 时间
   */
  private getCPUTimes(): Array<{ user: number; sys: number; idle: number }> {
    return cpus().map((cpu) => ({
      user: cpu.times.user,
      sys: cpu.times.sys,
      idle: cpu.times.idle,
    }))
  }

  /**
   * 获取内存使用
   */
  private getMemoryUsage(): MemoryUsage {
    const memUsage = process.memoryUsage()
    const total = totalmem()
    const free = freemem()
    const used = total - free

    return {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      totalMemory: total,
      freeMemory: free,
      percent: Math.round((used / total) * 100 * 100) / 100,
    }
  }

  /**
   * 获取进程数
   */
  private getProcessCount(): number {
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process')
        const output = execSync('tasklist', { encoding: 'utf8' })
        return output.trim().split('\n').length - 1 // 减去标题行
      } else {
        const { execSync } = require('child_process')
        const output = execSync('ps -e | wc -l', { encoding: 'utf8' })
        return parseInt(output.trim()) - 1
      }
    } catch (error) {
      return 0
    }
  }

  /**
   * 获取文件描述符数
   */
  private getFileDescriptorCount(): number {
    try {
      if (process.platform === 'win32') {
        // Windows: 估算值
        return process.getuid ? process.getuid() : 0
      } else {
        // Linux/Mac: 读取 /proc/self/fd
        const { execSync } = require('child_process')
        const output = execSync('ls /proc/self/fd | wc -l', { encoding: 'utf8' })
        return parseInt(output.trim())
      }
    } catch (error) {
      return 0
    }
  }

  /**
   * 获取 PTY 会话数
   */
  private getPTYSessionCount(): number {
    // 这个需要从 PTY Manager 获取，这里返回 0 作为占位
    // 实际使用时应该通过回调或参数传入
    return 0
  }

  /**
   * 设置 PTY 会话数
   */
  setPTYSessionCount(count: number): void {
    // 用于更新 PTY 会话数
  }

  /**
   * 检查资源限制
   */
  checkLimits(): LimitViolation[] {
    const metrics = this.getMetrics()
    const violations: LimitViolation[] = []

    // 检查 CPU
    if (metrics.cpuUsage.percent > this.limits.maxCPUPercent) {
      const violation: LimitViolation = {
        type: 'cpu',
        currentValue: metrics.cpuUsage.percent,
        limitValue: this.limits.maxCPUPercent,
        message: `CPU 使用率 ${metrics.cpuUsage.percent}% 超过限制 ${this.limits.maxCPUPercent}%`,
        severity: metrics.cpuUsage.percent > 95 ? 'critical' : 'high',
      }
      violations.push(violation)
      this.emitViolation(violation)
    }

    // 检查内存
    const memoryMB = metrics.memoryUsage.rss / 1024 / 1024
    if (memoryMB > this.limits.maxMemoryMB) {
      const violation: LimitViolation = {
        type: 'memory',
        currentValue: memoryMB,
        limitValue: this.limits.maxMemoryMB,
        message: `内存使用 ${memoryMB.toFixed(2)}MB 超过限制 ${this.limits.maxMemoryMB}MB`,
        severity: memoryMB > this.limits.maxMemoryMB * 1.2 ? 'critical' : 'high',
      }
      violations.push(violation)
      this.emitViolation(violation)
    }

    // 检查进程数
    if (metrics.processCount > this.limits.maxProcessCount) {
      const violation: LimitViolation = {
        type: 'process',
        currentValue: metrics.processCount,
        limitValue: this.limits.maxProcessCount,
        message: `进程数 ${metrics.processCount} 超过限制 ${this.limits.maxProcessCount}`,
        severity: 'medium',
      }
      violations.push(violation)
      this.emitViolation(violation)
    }

    // 检查文件描述符
    if (metrics.fileDescriptorCount > this.limits.maxFileDescriptors) {
      const violation: LimitViolation = {
        type: 'fd',
        currentValue: metrics.fileDescriptorCount,
        limitValue: this.limits.maxFileDescriptors,
        message: `文件描述符数 ${metrics.fileDescriptorCount} 超过限制 ${this.limits.maxFileDescriptors}`,
        severity: 'medium',
      }
      violations.push(violation)
      this.emitViolation(violation)
    }

    return violations
  }

  /**
   * 发出违规事件
   */
  private emitViolation(violation: LimitViolation): void {
    this.emit('violation', violation)
    this.violationCallbacks.forEach((cb) => cb(violation))
  }

  /**
   * 注册违规回调
   */
  onLimitViolation(callback: (violation: LimitViolation) => void): void {
    this.violationCallbacks.push(callback)
  }

  /**
   * 获取当前限制配置
   */
  getLimits(): ResourceLimits {
    return this.limits
  }

  /**
   * 更新限制配置
   */
  updateLimits(limits: Partial<ResourceLimits>): void {
    this.limits = { ...this.limits, ...limits }
    console.log('[ResourceMonitor] Updated limits:', this.limits)
  }
}

/**
 * 创建资源监控器的工厂函数
 */
export function createResourceMonitor(
  limits?: Partial<ResourceLimits>
): ResourceMonitor {
  return new ResourceMonitor(limits)
}
