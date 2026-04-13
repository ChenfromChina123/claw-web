/**
 * Structured Logger - 结构化日志系统
 *
 * 功能：
 * - JSON格式日志输出（便于ELK/Loki解析）
 * - 多级别日志（DEBUG/INFO/WARN/ERROR/FATAL）
 * - 上下文追踪（Request ID、User ID、Container ID）
 * - 性能计时器（自动记录耗时）
 * - 日志采样（高负载时自动降级）
 * - 敏感信息过滤
 *
 * 使用场景：
 * - 生产环境问题排查
 * - 安全审计日志
 * - 性能分析
 * - 分布式链路追踪
 */

// ==================== 类型定义 ====================

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * 日志条目
 */
export interface LogEntry {
  /** ISO时间戳 */
  timestamp: string
  /** 日志级别 */
  level: LogLevel
  /** 日志消息 */
  message: string
  /** 模块/组件名称 */
  module: string
  /** 额外上下文数据 */
  context?: Record<string, any>
  /** 堆栈跟踪（错误时）*/
  stack?: string
  /** 耗时（毫秒）*/
  durationMs?: number
  /** 关联的请求ID */
  requestId?: string
  /** 用户ID */
  userId?: string
  /** 容器ID */
  containerId?: string
  /** 元数据标签 */
  tags?: string[]
}

/**
 * 日志配置
 */
export interface LoggerConfig {
  /** 最小输出级别 */
  minLevel: LogLevel
  /** 是否启用JSON格式 */
  jsonFormat: boolean
  /** 是否包含时间戳 */
  includeTimestamp: boolean
  /** 是否彩色输出（非JSON模式）*/
  colors: boolean
  /** 采样率 (0-1)，1.0表示全部记录 */
  sampleRate: number
  /** 敏感字段列表（自动脱敏）*/
  sensitiveFields: string[]
  /** 输出目标 */
  targets?: Array<'console' | 'file' | 'remote'>
  /** 文件路径（如果启用文件输出）*/
  filePath?: string
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: Required<LoggerConfig> = {
  minLevel: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
  jsonFormat: process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production',
  includeTimestamp: true,
  colors: process.env.NODE_ENV !== 'production',
  sampleRate: parseFloat(process.env.LOG_SAMPLE_RATE || '1.0'),
  sensitiveFields: ['password', 'token', 'secret', 'apiKey', 'authorization'],
  targets: ['console']
}

// ==================== StructuredLogger 类 ====================

class StructuredLogger {
  private config: Required<LoggerConfig>
  private moduleContext: string
  private static instanceCount: number = 0

  constructor(moduleName: string, config?: Partial<LoggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.moduleContext = moduleName
    StructuredLogger.instanceCount++
  }

  /**
   * 记录DEBUG级别日志
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * 记录INFO级别日志
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context)
  }

  /**
   * 记录WARN级别日志
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context)
  }

  /**
   * 记录ERROR级别日志
   */
  error(message: string, error?: Error | Record<string, any>, context?: Record<string, any>): void {
    const errorContext = this.extractErrorInfo(error)

    this.log(
      LogLevel.ERROR,
      message,
      { ...context, ...errorContext }
    )
  }

  /**
   * 记录FATAL级别日志（严重错误，通常需要立即关注）
   */
  fatal(message: string, error?: Error | Record<string, any>, context?: Record<string, any>): void {
    const errorContext = this.extractErrorInfo(error)

    this.log(
      LogLevel.FATAL,
      message,
      { ...context, ...errorContext }
    )
  }

  /**
   * 创建子Logger（继承配置，可覆盖模块名）
   */
  child(childModuleName: string): StructuredLogger {
    return new StructuredLogger(
      `${this.moduleContext}:${childModuleName}`,
      this.config
    )
  }

  /**
   * 创建带计时的Logger包装器
   * @returns 包含start()和end()方法的对象
   */
  timer(operationName: string): {
    start: () => void
    end: (context?: Record<string, any>) => void
  } {
    let startTime: number | null = null

    return {
      start: () => {
        startTime = Date.now()
        this.debug(`${operationName} 开始`)
      },
      end: (context?: Record<string, any>) => {
        if (!startTime) return

        const durationMs = Date.now() - startTime
        const logLevel = durationMs > 1000 ? LogLevel.WARN : LogLevel.INFO

        this.log(
          logLevel,
          `${operationName} 完成`,
          {
            ...context,
            operationName,
            durationMs
          }
        )
      }
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 核心日志方法
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    // 级别过滤
    if (this.shouldLog(level)) {
      // 采样检查
      if (this.shouldSample()) {
        const entry = this.buildLogEntry(level, message, context)
        this.output(entry)
      }
    }
  }

  /**
   * 判断是否应该记录该级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL]
    return levels.indexOf(level) >= levels.indexOf(this.config.minLevel)
  }

  /**
   * 判断是否应该采样（随机抽样）
   */
  private shouldSample(): boolean {
    if (this.config.sampleRate >= 1) return true
    return Math.random() < this.config.sampleRate
  }

  /**
   * 构建完整的日志条目
   */
  private buildLogEntry(level: LogLevel, message: string, context?: Record<string, any>): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      module: this.moduleContext
    }

    // 添加上下文数据（脱敏处理）
    if (context && Object.keys(context).length > 0) {
      entry.context = this.sanitizeContext(context)
    }

    // 添加请求ID（如果有）
    const requestId = this.getCurrentRequestId()
    if (requestId) {
      entry.requestId = requestId
    }

    // 添加用户ID（如果有）
    const userId = this.getCurrentUserId()
    if (userId) {
      entry.userId = userId
    }

    return entry
  }

  /**
   * 输出日志到控制台或文件
   */
  private output(entry: LogEntry): void {
    try {
      if (this.config.jsonFormat) {
        console.log(JSON.stringify(entry))
      } else {
        this.outputColored(entry)
      }
    } catch (e) {
      // 防止日志系统本身出错导致崩溃
      console.error('[StructuredLogger] Output error:', e)
    }
  }

  /**
   * 彩色控制台输出
   */
  private outputColored(entry: LogEntry): void {
    const colorMap: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: '\x1b[36m',  // 青色
      [LogLevel.INFO]: '\x1b[32m',   // 绿色
      [LogLevel.WARN]: '\x1b[33m',   // 黄色
      [LogLevel.ERROR]: '\x1b[31m',  // 红色
      [LogLevel.FATAL]: '\x1b[35m'   // 紫红色
    }

    const resetColor = '\x1b[0m'
    const color = this.config.colors ? (colorMap[entry.level] || '') : ''
    const timestamp = this.config.includeTimestamp ? `[${entry.timestamp}] ` : ''

    let output = `${color}${timestamp}[${entry.level.toUpperCase()}] ${resetColor}`
    output += `[${entry.module}] `
    output += entry.message

    if (entry.context) {
      output += ` ${JSON.stringify(entry.context)}`
    }

    if (entry.durationMs) {
      output += ` (${entry.durationMs}ms)`
    }

    if (entry.stack) {
      output += `\n${entry.stack}`
    }

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(output)
        break
      case LogLevel.INFO:
        console.info(output)
        break
      case LogLevel.WARN:
        console.warn(output)
        break
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(output)
        break
      default:
        console.log(output)
    }
  }

  /**
   * 提取错误信息
   */
  private extractErrorInfo(error?: Error | Record<string, any>): Record<string, any> {
    if (!error) return {}

    if (error instanceof Error) {
      return {
        errorType: error.name,
        errorMessage: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')  // 只保留前5行堆栈
      }
    }

    return error
  }

  /**
   * 脱敏处理（移除敏感字段值）
   */
  private sanitizeContext(context: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {}

    for (const [key, value] of Object.entries(context)) {
      if (this.config.sensitiveFields.some(field =>
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        sanitized[key] = '[REDACTED]'
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = JSON.parse(JSON.stringify(value))
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * 获取当前请求ID（从async storage或全局变量）
   */
  private getCurrentRequestId(): string | undefined {
    // 实际项目中应该从AsyncLocalStorage获取
    return (global as any).__currentRequestId
  }

  /**
   * 获取当前用户ID
   */
  private getCurrentUserId(): string | undefined {
    return (global as any).__currentUserId
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建结构化日志实例
 * @param moduleName 模块名称（用于标识日志来源）
 * @param config 可选配置
 */
export function createLogger(moduleName: string, config?: Partial<LoggerConfig>): StructuredLogger {
  return new StructuredLogger(moduleName, config)
}

/**
 * 快捷方式：创建默认logger
 */
export function getLogger(moduleName: string): StructuredLogger {
  return createLogger(moduleName)
}

// ==================== 全局中间件辅助函数 ====================

/**
 * Express中间件：为每个请求设置requestId
 */
export function requestIdMiddleware(req: any, res: any, next: Function): void {
  const requestId = req.headers['x-request-id'] ||
                    req.headers['x-trace-id'] ||
                    generateUUID()

  ;(global as any).__currentRequestId = requestId
  res.setHeader('X-Request-Id', requestId)

  next()
}

/**
 * 生成UUID v4（简化版）
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

export default StructuredLogger
