/**
 * 从未知错误中提取错误消息
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown error occurred'
}

/**
 * 创建错误对象
 */
export function createError(message: string, code?: string): Error {
  const error = new Error(message)
  if (code) {
    Object.assign(error, { code })
  }
  return error
}

/**
 * 安全地执行异步函数，返回结果或错误
 */
export async function safeExecute<T>(
  fn: () => Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: Error }> {
  try {
    const data = await fn()
    return { success: true, data }
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error : new Error(String(error))
    }
  }
}

/**
 * 格式化持续时间（毫秒转为可读格式）
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}m ${seconds}s`
}
