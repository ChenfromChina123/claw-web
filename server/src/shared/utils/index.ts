/**
 * Shared Utils - Master 和 Worker 共用的工具函数
 */

export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

export function isValidUserId(userId: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(userId)
}

export function sanitizePath(path: string, baseDir: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\.\./g, '')
  if (normalized.startsWith('/')) {
    return normalized
  }
  return `${baseDir}/${normalized}`.replace(/\/+/g, '/')
}

/**
 * 危险路径前缀（禁止访问的特殊文件系统）
 */
const DANGEROUS_PATH_PREFIXES = [
  '/proc',
  '/sys',
  '/dev',
  '/etc/shadow',
  '/etc/passwd',
  '/root',
  '/var/run/docker.sock'
]

/**
 * 增强版路径安全检查
 *
 * 在基础检查之上增加：
 * - 符号链接解析（防止通过符号链接逃逸）
 * - 危险路径保护（禁止访问 /proc, /sys, /dev 等）
 * - 路径规范化（去除多余分隔符、尾随斜杠）
 *
 * @param path 待检查的路径
 * @param allowedBaseDir 允许的基础目录
 * @returns 路径是否安全
 */
export function isPathSafe(path: string, allowedBaseDir: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
  const normalizedBase = allowedBaseDir.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')

  if (!normalizedPath.startsWith(normalizedBase)) {
    return false
  }

  if (normalizedPath.includes('..')) {
    return false
  }

  for (const dangerousPrefix of DANGEROUS_PATH_PREFIXES) {
    if (normalizedPath.startsWith(dangerousPrefix) || normalizedPath === dangerousPrefix) {
      return false
    }
  }

  return true
}

/**
 * 异步版路径安全检查（包含符号链接解析）
 *
 * 在同步版基础上增加符号链接解析，防止通过符号链接逃逸沙箱。
 * 例如：/workspace/link -> /etc/passwd 应被阻止
 *
 * @param path 待检查的路径
 * @param allowedBaseDir 允许的基础目录
 * @returns 路径是否安全
 */
export async function isPathSafeAsync(path: string, allowedBaseDir: string): Promise<boolean> {
  if (!isPathSafe(path, allowedBaseDir)) {
    return false
  }

  try {
    const fs = require('fs/promises')
    const realPath = await fs.realpath(path)
    const normalizedReal = realPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
    const normalizedBase = allowedBaseDir.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')

    if (!normalizedReal.startsWith(normalizedBase)) {
      return false
    }

    for (const dangerousPrefix of DANGEROUS_PATH_PREFIXES) {
      if (normalizedReal.startsWith(dangerousPrefix) || normalizedReal === dangerousPrefix) {
        return false
      }
    }

    return true
  } catch {
    return true
  }
}

export function parseEnvironmentVariables(env: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`
  }
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(0)
  return `${minutes}m ${seconds}s`
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
  })
  return Promise.race([promise, timeoutPromise])
}

export function getContainerRole(): 'master' | 'worker' {
  return process.env.CONTAINER_ROLE as 'master' | 'worker' || 'master'
}

export function isMasterContainer(): boolean {
  return getContainerRole() === 'master'
}

export function isWorkerContainer(): boolean {
  return getContainerRole() === 'worker'
}

export function getWorkerInternalPort(): number {
  return parseInt(process.env.WORKER_INTERNAL_PORT || '4000', 10)
}

/**
 * 默认 Token 值，用于检测是否使用了不安全的默认配置
 */
const DEFAULT_MASTER_TOKEN = 'internal-master-worker-token-2024'

/**
 * 运行时生成的随机 Token（当检测到默认 Token 时使用）
 */
let runtimeGeneratedToken: string | null = null

/**
 * 生成加密安全的随机 Token
 */
function generateSecureToken(): string {
  const crypto = require('crypto')
  return `claw-${crypto.randomBytes(32).toString('hex')}`
}

export function getMasterInternalToken(): string {
  const envToken = process.env.MASTER_INTERNAL_TOKEN || ''

  if (envToken && envToken !== DEFAULT_MASTER_TOKEN) {
    return envToken
  }

  if (!runtimeGeneratedToken) {
    if (envToken === DEFAULT_MASTER_TOKEN) {
      console.warn(
        '[Security] 检测到使用默认 MASTER_INTERNAL_TOKEN，已自动生成随机 Token。' +
        '请在 .env 文件中设置自定义 MASTER_INTERNAL_TOKEN 以确保安全。'
      )
    } else {
      console.warn(
        '[Security] 未配置 MASTER_INTERNAL_TOKEN，已自动生成随机 Token。' +
        '请在 .env 文件中设置 MASTER_INTERNAL_TOKEN 以确保安全。'
      )
    }
    runtimeGeneratedToken = generateSecureToken()
  }

  return runtimeGeneratedToken
}

export function validateMasterToken(token: string): boolean {
  return token === getMasterInternalToken()
}

/**
 * 检查是否使用了不安全的默认 Token
 */
export function isUsingDefaultToken(): boolean {
  const envToken = process.env.MASTER_INTERNAL_TOKEN || ''
  return envToken === DEFAULT_MASTER_TOKEN || envToken === ''
}
