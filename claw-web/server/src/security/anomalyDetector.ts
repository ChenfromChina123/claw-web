/**
 * 异常行为检测器 - Anomaly Detector
 * 
 * 检测用户行为模式中的异常：
 * - 快速连续的命令执行（可能是脚本攻击）
 * - 大量文件访问（可能是数据窃取）
 * - 异常的资源使用
 * - 逃逸尝试模式
 * 
 * @packageDocumentation
 */

import { EventEmitter } from 'events'

/**
 * 命令执行记录
 */
export interface CommandRecord {
  /** 命令内容 */
  command: string
  /** 执行时间戳 */
  timestamp: number
  /** 是否被阻止 */
  blocked: boolean
}

/**
 * 文件访问记录
 */
export interface FileAccessRecord {
  /** 文件路径 */
  path: string
  /** 访问类型 */
  type: 'read' | 'write' | 'delete'
  /** 时间戳 */
  timestamp: number
}

/**
 * 异常检测结果
 */
export interface AnomalyResult {
  /** 是否检测到异常 */
  isAnomaly: boolean
  /** 异常类型 */
  type?: string
  /** 异常描述 */
  description?: string
  /** 安全级别 */
  severity?: 'low' | 'medium' | 'high' | 'critical'
  /** 建议操作 */
  suggestion?: string
}

/**
 * 检测配置
 */
export interface DetectionConfig {
  /** 快速命令执行检测：时间窗口（毫秒） */
  rapidCommandWindowMs: number
  /** 快速命令执行检测：阈值 */
  rapidCommandThreshold: number
  /** 大量文件访问检测：时间窗口（毫秒） */
  massFileAccessWindowMs: number
  /** 大量文件访问检测：阈值 */
  massFileAccessThreshold: number
  /** 逃逸尝试检测：敏感度（1-10） */
  escapeSensitivity: number
}

/**
 * 默认检测配置
 */
const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  rapidCommandWindowMs: 5000, // 5 秒
  rapidCommandThreshold: 20, // 5 秒内 20 条命令
  massFileAccessWindowMs: 10000, // 10 秒
  massFileAccessThreshold: 50, // 10 秒内 50 次文件访问
  escapeSensitivity: 5, // 中等敏感度
}

/**
 * 异常行为检测器类
 */
export class AnomalyDetector extends EventEmitter {
  private config: DetectionConfig
  private commandHistory: Map<string, CommandRecord[]> = new Map() // userId -> commands
  private fileAccessHistory: Map<string, FileAccessRecord[]> = new Map() // userId -> file accesses
  private escapePatterns: RegExp[] = []

  constructor(config?: Partial<DetectionConfig>) {
    super()
    this.config = { ...DEFAULT_DETECTION_CONFIG, ...config }
    this.initializeEscapePatterns()
  }

  /**
   * 初始化逃逸模式
   */
  private initializeEscapePatterns(): void {
    this.escapePatterns = [
      // 路径遍历
      /\.\.[\/\\]/,
      /\/etc\//,
      /\/root\//,
      /\/proc\/\d+/,
      
      // 符号链接
      /ln\s+-s\s+\/[^\/]/,
      
      // 环境变量注入
      /export\s+HOME=\/(?!home)/,
      /export\s+PATH=\/(?!home)/,
      
      // LD_PRELOAD 注入
      /LD_PRELOAD=/,
      
      // 进程注入
      /\/dev\/tcp\//,
      /bash\s+-i\s+>&\s+\/dev/,
      
      // 提权尝试
      /sudo\s+su/,
      /pkexec/,
      /doas/,
    ]
  }

  /**
   * 记录命令执行
   */
  recordCommand(userId: string, command: string, blocked: boolean = false): void {
    const now = Date.now()
    
    if (!this.commandHistory.has(userId)) {
      this.commandHistory.set(userId, [])
    }

    const history = this.commandHistory.get(userId)!
    history.push({
      command,
      timestamp: now,
      blocked,
    })

    // 清理旧记录（保留 1 分钟）
    const cutoff = now - 60000
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift()
    }

    // 检测快速命令执行
    this.detectRapidCommandExecution(userId)
  }

  /**
   * 记录文件访问
   */
  recordFileAccess(userId: string, path: string, type: 'read' | 'write' | 'delete'): void {
    const now = Date.now()
    
    if (!this.fileAccessHistory.has(userId)) {
      this.fileAccessHistory.set(userId, [])
    }

    const history = this.fileAccessHistory.get(userId)!
    history.push({
      path,
      type,
      timestamp: now,
    })

    // 清理旧记录（保留 1 分钟）
    const cutoff = now - 60000
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift()
    }

    // 检测大量文件访问
    this.detectMassFileAccess(userId)
  }

  /**
   * 检测快速连续的命令执行
   */
  detectRapidCommandExecution(userId: string): AnomalyResult {
    const history = this.commandHistory.get(userId) || []
    const now = Date.now()
    const windowStart = now - this.config.rapidCommandWindowMs

    // 统计时间窗口内的命令数
    const commandsInWindow = history.filter(
      (cmd) => cmd.timestamp >= windowStart
    )

    if (commandsInWindow.length > this.config.rapidCommandThreshold) {
      const result: AnomalyResult = {
        isAnomaly: true,
        type: 'rapid_command_execution',
        description: `检测到快速命令执行（${this.config.rapidCommandWindowMs}ms 内 ${commandsInWindow.length} 条命令）`,
        severity: 'medium',
        suggestion: '可能是脚本攻击或自动化操作',
      }

      this.emit('anomaly', result)
      return result
    }

    return { isAnomaly: false }
  }

  /**
   * 检测大量文件访问
   */
  detectMassFileAccess(userId: string): AnomalyResult {
    const history = this.fileAccessHistory.get(userId) || []
    const now = Date.now()
    const windowStart = now - this.config.massFileAccessWindowMs

    // 统计时间窗口内的文件访问数
    const accessesInWindow = history.filter(
      (access) => access.timestamp >= windowStart
    )

    if (accessesInWindow.length > this.config.massFileAccessThreshold) {
      // 检查是否有大量删除操作
      const deletesInWindow = accessesInWindow.filter(
        (a) => a.type === 'delete'
      )

      let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
      if (deletesInWindow.length > this.config.massFileAccessThreshold / 2) {
        severity = 'critical' // 大量删除操作
      }

      const result: AnomalyResult = {
        isAnomaly: true,
        type: 'mass_file_access',
        description: `检测到大量文件访问（${this.config.massFileAccessWindowMs}ms 内 ${accessesInWindow.length} 次访问，${deletesInWindow.length} 次删除）`,
        severity,
        suggestion: '可能是数据窃取或破坏行为',
      }

      this.emit('anomaly', result)
      return result
    }

    return { isAnomaly: false }
  }

  /**
   * 检测异常的资源使用
   */
  detectResourceAbuse(
    userId: string,
    metrics: {
      cpuPercent: number
      memoryMB: number
      processCount: number
    }
  ): AnomalyResult {
    const { cpuPercent, memoryMB, processCount } = metrics

    // 检查 CPU 使用
    if (cpuPercent > 90) {
      const result: AnomalyResult = {
        isAnomaly: true,
        type: 'cpu_abuse',
        description: `CPU 使用率异常高：${cpuPercent}%`,
        severity: 'high',
        suggestion: '可能是计算密集型攻击或死循环',
      }
      this.emit('anomaly', result)
      return result
    }

    // 检查内存使用
    if (memoryMB > 400) {
      const result: AnomalyResult = {
        isAnomaly: true,
        type: 'memory_abuse',
        description: `内存使用异常：${memoryMB.toFixed(2)}MB`,
        severity: 'high',
        suggestion: '可能是内存泄漏或耗尽攻击',
      }
      this.emit('anomaly', result)
      return result
    }

    // 检查进程数
    if (processCount > 50) {
      const result: AnomalyResult = {
        isAnomaly: true,
        type: 'process_abuse',
        description: `进程数异常：${processCount}`,
        severity: 'high',
        suggestion: '可能是 fork 炸弹',
      }
      this.emit('anomaly', result)
      return result
    }

    return { isAnomaly: false }
  }

  /**
   * 检测逃逸尝试模式
   */
  detectEscapePattern(userId: string, commands: string[]): AnomalyResult {
    const escapeAttempts: string[] = []

    for (const command of commands) {
      for (const pattern of this.escapePatterns) {
        if (pattern.test(command)) {
          escapeAttempts.push(command)
          break
        }
      }
    }

    if (escapeAttempts.length > 0) {
      const severity: 'low' | 'medium' | 'high' | 'critical' = 
        escapeAttempts.length >= 3 ? 'critical' : 
        escapeAttempts.length >= 2 ? 'high' : 'medium'

      const result: AnomalyResult = {
        isAnomaly: true,
        type: 'escape_attempt',
        description: `检测到 ${escapeAttempts.length} 次逃逸尝试`,
        severity,
        suggestion: '用户可能尝试突破沙箱限制',
      }

      this.emit('anomaly', result)
      return result
    }

    return { isAnomaly: false }
  }

  /**
   * 检测单个命令的逃逸模式
   */
  detectCommandEscape(userId: string, command: string): AnomalyResult {
    for (const pattern of this.escapePatterns) {
      if (pattern.test(command)) {
        const result: AnomalyResult = {
          isAnomaly: true,
          type: 'command_escape_pattern',
          description: `命令包含逃逸模式：${pattern.source}`,
          severity: 'high',
          suggestion: '命令可能尝试突破沙箱限制',
        }

        this.emit('anomaly', result)
        return result
      }
    }

    return { isAnomaly: false }
  }

  /**
   * 获取用户行为统计
   */
  getUserBehaviorStats(userId: string): {
    totalCommands: number
    blockedCommands: number
    totalFileAccesses: number
    anomalyCount: number
  } {
    const commandHistory = this.commandHistory.get(userId) || []
    const fileAccessHistory = this.fileAccessHistory.get(userId) || []

    return {
      totalCommands: commandHistory.length,
      blockedCommands: commandHistory.filter((c) => c.blocked).length,
      totalFileAccesses: fileAccessHistory.length,
      anomalyCount: 0, // 需要从事件记录中统计
    }
  }

  /**
   * 清除用户数据
   */
  clearUserData(userId: string): void {
    this.commandHistory.delete(userId)
    this.fileAccessHistory.delete(userId)
  }

  /**
   * 更新检测配置
   */
  updateConfig(config: Partial<DetectionConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

/**
 * 创建异常行为检测器的工厂函数
 */
export function createAnomalyDetector(
  config?: Partial<DetectionConfig>
): AnomalyDetector {
  return new AnomalyDetector(config)
}
