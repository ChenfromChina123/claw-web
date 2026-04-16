/**
 * Master Logger - 生产环境日志工具
 * 
 * 用于替换 console.log/warn/error 调用
 * 支持日志级别控制和敏感信息脱敏
 */

/**
 * 日志级别配置
 * - production: 仅输出 ERROR/WARN
 * - development: 输出 INFO/WARN/ERROR
 * - debug: 输出所有日志（含 DEBUG）
 */
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info')

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const currentLevel = LOG_LEVELS[LOG_LEVEL as keyof typeof LOG_LEVELS] ?? 1

/**
 * 判断是否应该输出日志
 */
function shouldLog(level: keyof typeof LOG_LEVELS): boolean {
  return LOG_LEVELS[level] >= currentLevel
}

/**
 * 脱敏敏感信息
 */
function sanitize(data: any): any {
  if (!data) return data
  
  const sensitive = ['token', 'secret', 'password', 'apiKey', 'authorization']
  if (typeof data === 'object') {
    const sanitized = { ...data }
    for (const key of Object.keys(sanitized)) {
      if (sensitive.some(s => key.toLowerCase().includes(s))) {
        sanitized[key] = '[REDACTED]'
      }
    }
    return sanitized
  }
  return data
}

/**
 * 安全日志输出（生产环境推荐）
 * 自动过滤敏感信息，支持级别控制
 */
export function masterLog(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: any): void {
  if (!shouldLog(level)) return
  
  const sanitizedContext = context ? sanitize(context) : null
  const prefix = `[${new Date().toISOString().split('T')[1].split('.')[0]}] [${level.toUpperCase()}]`
  
  switch (level) {
    case 'debug':
      console.debug(prefix, message, sanitizedContext || '')
      break
    case 'info':
      console.info(prefix, message, sanitizedContext || '')
      break
    case 'warn':
      console.warn(prefix, message, sanitizedContext || '')
      break
    case 'error':
      console.error(prefix, message, sanitizedContext || '')
      break
  }
}

/**
 * 快捷方法
 */
export const debug = (msg: string, ctx?: any) => masterLog('debug', msg, ctx)
export const info = (msg: string, ctx?: any) => masterLog('info', msg, ctx)
export const warn = (msg: string, ctx?: any) => masterLog('warn', msg, ctx)
export const error = (msg: string, ctx?: any) => masterLog('error', msg, ctx)
