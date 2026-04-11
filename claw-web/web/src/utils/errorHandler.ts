/**
 * 错误处理工具
 * 提供统一的错误处理和格式化功能
 */

export interface AppError {
  code: string
  message: string
  details?: unknown
  timestamp: number
  stack?: string
}

export class ErrorHandler {
  private errors: AppError[] = []
  private maxErrors = 100
  private listeners: Set<(error: AppError) => void> = new Set()

  /**
   * 创建错误
   */
  static createError(
    code: string,
    message: string,
    details?: unknown
  ): AppError {
    return {
      code,
      message,
      details,
      timestamp: Date.now(),
      stack: new Error().stack,
    }
  }

  /**
   * 处理错误
   */
  handle(error: unknown): AppError {
    const appError = this.normalizeError(error)
    this.errors.unshift(appError)
    
    // 限制错误数量
    if (this.errors.length > this.maxErrors) {
      this.errors.pop()
    }

    // 通知监听器
    this.notifyListeners(appError)

    // 控制台输出
    console.error(`[Error] ${appError.code}: ${appError.message}`, appError.details)

    return appError
  }

  /**
   * 规范化错误
   */
  private normalizeError(error: unknown): AppError {
    if (error instanceof Error) {
      return {
        code: 'UNKNOWN_ERROR',
        message: error.message,
        details: error,
        timestamp: Date.now(),
        stack: error.stack,
      }
    }

    if (typeof error === 'string') {
      return {
        code: 'STRING_ERROR',
        message: error,
        timestamp: Date.now(),
      }
    }

    if (error && typeof error === 'object') {
      const obj = error as Record<string, unknown>
      return {
        code: (obj.code as string) || 'OBJECT_ERROR',
        message: (obj.message as string) || 'Unknown error',
        details: error,
        timestamp: Date.now(),
      }
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
      timestamp: Date.now(),
    }
  }

  /**
   * 获取错误历史
   */
  getErrors(limit?: number): AppError[] {
    return limit ? this.errors.slice(0, limit) : [...this.errors]
  }

  /**
   * 清除错误历史
   */
  clearErrors(): void {
    this.errors = []
  }

  /**
   * 订阅错误
   */
  subscribe(listener: (error: AppError) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(error: AppError): void {
    for (const listener of this.listeners) {
      try {
        listener(error)
      } catch (e) {
        console.error('Error in error listener:', e)
      }
    }
  }
}

// 错误代码常量
export const ErrorCodes = {
  // 认证错误
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_PERMISSION_DENIED: 'AUTH_PERMISSION_DENIED',
  
  // 网络错误
  NETWORK_ERROR: 'NETWORK_ERROR',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_OFFLINE: 'NETWORK_OFFLINE',
  
  // WebSocket 错误
  WS_CONNECTION_FAILED: 'WS_CONNECTION_FAILED',
  WS_DISCONNECTED: 'WS_DISCONNECTED',
  WS_MESSAGE_FAILED: 'WS_MESSAGE_FAILED',
  
  // 工具执行错误
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED: 'TOOL_EXECUTION_FAILED',
  TOOL_PERMISSION_DENIED: 'TOOL_PERMISSION_DENIED',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  
  // MCP 错误
  MCP_SERVER_NOT_FOUND: 'MCP_SERVER_NOT_FOUND',
  MCP_CONNECTION_FAILED: 'MCP_CONNECTION_FAILED',
  MCP_TOOL_NOT_FOUND: 'MCP_TOOL_NOT_FOUND',
  
  // 会话错误
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_CREATION_FAILED: 'SESSION_CREATION_FAILED',
  
  // API 错误
  API_ERROR: 'API_ERROR',
  API_PARSE_ERROR: 'API_PARSE_ERROR',
  API_VALIDATION_ERROR: 'API_VALIDATION_ERROR',
  
  // 通用错误
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

// 全局错误处理器
export const globalErrorHandler = new ErrorHandler()

// Vue 组合式函数
export function useErrorHandler() {
  const handle = (error: unknown) => globalErrorHandler.handle(error)
  const errors = () => globalErrorHandler.getErrors()
  const clear = () => globalErrorHandler.clearErrors()
  const subscribe = (listener: (error: AppError) => void) => globalErrorHandler.subscribe(listener)

  return {
    handle,
    errors,
    clear,
    subscribe,
    ErrorCodes,
  }
}

export default ErrorHandler
