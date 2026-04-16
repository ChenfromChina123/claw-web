/**
 * Worker Logger - Worker 容器轻量级日志系统
 * 
 * 功能：
 * - 结构化日志输出（JSON/彩色控制台）
 * - 日志级别控制（DEBUG/INFO/WARN/ERROR）
 * - Request ID 追踪（从 Master 传递）
 * - 敏感信息自动脱敏
 * - 性能计时器
 * 
 * 设计原则：
 * - 轻量级：Worker 不需要完整的功能，保持简洁
 * - 快速：不阻塞主线程
 * - 安全：自动脱敏敏感信息
 */

/**
 * 日志级别
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * 日志条目
 */
export interface WorkerLogEntry {
  timestamp: string
  level: LogLevel
  message: string
  module: string
  context?: Record<string, any>
  requestId?: string
  userId?: string
  durationMs?: number
}

/**
 * 日志配置
 */
export interface WorkerLoggerConfig {
  minLevel: LogLevel
  jsonFormat: boolean
  colors: boolean
  sensitiveFields: string[]
}

const DEFAULT_CONFIG: WorkerLoggerConfig = {
  minLevel: (process.env.WORKER_LOG_LEVEL as LogLevel) || LogLevel.INFO,
  jsonFormat: process.env.WORKER_LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production',
  colors: process.env.NODE_ENV !== 'production',
  sensitiveFields: ['password', 'token', 'secret', 'apiKey', 'authorization', 'master-token']
}

/**
 * 脱敏处理上下文数据
 */
function sanitizeContext(context: Record<string, any>, sensitiveFields: string[]): Record<string, any> {
  const sanitized: Record<string, any> = {}
  
  for (const [key, value] of Object.entries(context)) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]'
    } else {
      sanitized[key] = value
    }
  }
  
  return sanitized
}

/**
 * 判断是否应该记录该级别的日志
 */
function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
  return levels.indexOf(level) >= levels.indexOf(minLevel)
}

/**
 * WorkerLogger 类
 */
export class WorkerLogger {
  private config: WorkerLoggerConfig
  private module: string

  constructor(moduleName: string, config?: Partial<WorkerLoggerConfig>) {
    this.module = moduleName
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context)
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context)
  }

  error(message: string, error?: Error | Record<string, any>, context?: Record<string, any>): void {
    const errorContext = this.extractErrorInfo(error)
    this.log(LogLevel.ERROR, message, { ...context, ...errorContext })
  }

  timer(operationName: string): { start: () => void; end: (context?: Record<string, any>) => void } {
    let startTime: number | null = null

    return {
      start: () => {
        startTime = Date.now()
        this.debug(`${operationName} 开始`)
      },
      end: (context?: Record<string, any>) => {
        if (!startTime) return
        const durationMs = Date.now() - startTime
        this.log(
          durationMs > 1000 ? LogLevel.WARN : LogLevel.INFO,
          `${operationName} 完成`,
          { ...context, operationName, durationMs }
        )
      }
    }
  }

  child(childModuleName: string): WorkerLogger {
    return new WorkerLogger(`${this.module}:${childModuleName}`, this.config)
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (!shouldLog(level, this.config.minLevel)) return

    const entry: WorkerLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      module: this.module
    }

    if (context && Object.keys(context).length > 0) {
      entry.context = sanitizeContext(context, this.config.sensitiveFields)
    }

    const requestId = (global as any).__currentRequestId
    if (requestId) entry.requestId = requestId

    const userId = (global as any).__currentUserId
    if (userId) entry.userId = userId

    this.output(entry)
  }

  private output(entry: WorkerLogEntry): void {
    try {
      if (this.config.jsonFormat) {
        console.log(JSON.stringify(entry))
      } else {
        this.outputColored(entry)
      }
    } catch (e) {
      console.error('[WorkerLogger] Output error:', e)
    }
  }

  private outputColored(entry: WorkerLogEntry): void {
    const colorMap: Record<LogLevel, string> = {
      [LogLevel.DEBUG]: '\x1b[36m',
      [LogLevel.INFO]: '\x1b[32m',
      [LogLevel.WARN]: '\x1b[33m',
      [LogLevel.ERROR]: '\x1b[31m'
    }

    const resetColor = '\x1b[0m'
    const color = this.config.colors ? (colorMap[entry.level] || '') : ''
    const timestamp = `[${entry.timestamp.split('T')[1].split('.')[0]}]`

    let output = `${color}${timestamp} [${entry.level.toUpperCase()}]${resetColor}`
    output += ` [${entry.module}] `
    output += entry.message

    if (entry.requestId) {
      output += ` (reqId: ${entry.requestId.substring(0, 8)}...)`
    }

    if (entry.context) {
      output += ` ${JSON.stringify(entry.context)}`
    }

    if (entry.durationMs) {
      output += ` (${entry.durationMs}ms)`
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
        console.error(output)
        break
    }
  }

  private extractErrorInfo(error?: Error | Record<string, any>): Record<string, any> {
    if (!error) return {}

    if (error instanceof Error) {
      return {
        errorType: error.name,
        errorMessage: error.message,
        stack: error.stack?.split('\n').slice(0, 3).join('\n')
      }
    }

    return error
  }
}

/**
 * 创建 Worker Logger 实例
 */
export function createWorkerLogger(moduleName: string, config?: Partial<WorkerLoggerConfig>): WorkerLogger {
  return new WorkerLogger(moduleName, config)
}
