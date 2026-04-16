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

export function isPathSafe(path: string, allowedBaseDir: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/')
  const normalizedBase = allowedBaseDir.replace(/\\/g, '/')

  if (!normalizedPath.startsWith(normalizedBase)) {
    return false
  }

  if (normalizedPath.includes('..')) {
    return false
  }

  return true
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

export function getMasterInternalToken(): string {
  return process.env.MASTER_INTERNAL_TOKEN || ''
}

export function validateMasterToken(token: string): boolean {
  return token === getMasterInternalToken()
}
