/**
 * 工具执行超时控制系统
 *
 * 功能：
 * - 管理工具执行的默认超时和单个工具超时
 * - 提供带超时的 Promise 包装器
 * - 支持全局启用/禁用超时控制
 */

import type { ExecutionTimeoutConfig } from '../types/toolRegistryTypes'

// ==================== ToolTimeoutManager 类 ====================

export class ToolTimeoutManager {
  private config: ExecutionTimeoutConfig = {
    defaultTimeout: 60000,
    perToolTimeouts: {},
    enableTimeout: true,
  }

  constructor(defaultTimeout?: number) {
    if (defaultTimeout) {
      this.config.defaultTimeout = defaultTimeout
    }
  }

  /**
   * 设置单个工具的超时时间
   */
  setToolTimeout(toolName: string, timeout: number): void {
    this.config.perToolTimeouts[toolName] = timeout
  }

  /**
   * 获取工具的超时时间（优先使用工具特定配置，否则使用默认值）
   */
  getToolTimeout(toolName: string): number {
    return this.config.perToolTimeouts[toolName] || this.config.defaultTimeout
  }

  /**
   * 设置默认超时时间
   */
  setDefaultTimeout(timeout: number): void {
    this.config.defaultTimeout = timeout
  }

  /**
   * 获取完整的超时配置
   */
  getConfig(): ExecutionTimeoutConfig {
    return { ...this.config }
  }

  /**
   * 启用或禁用超时控制
   */
  setEnabled(enabled: boolean): void {
    this.config.enableTimeout = enabled
  }

  /**
   * 带超时的 Promise 执行包装器
   */
  async executeWithTimeout<T>(
    fn: () => Promise<T>,
    toolName: string,
    customTimeout?: number
  ): Promise<{ result?: T; timedOut: boolean; error?: string }> {
    // 如果禁用了超时控制，直接执行
    if (!this.config.enableTimeout) {
      try {
        const result = await fn()
        return { result, timedOut: false }
      } catch (error) {
        return { timedOut: false, error: String(error) }
      }
    }

    const timeout = customTimeout || this.getToolTimeout(toolName)
    
    return new Promise((resolve) => {
      let timedOut = false
      let settled = false
      
      // 设置超时定时器
      const timer = setTimeout(() => {
        if (!settled) {
          timedOut = true
          settled = true
          resolve({ timedOut: true })
        }
      }, timeout)
      
      // 执行实际函数
      fn()
        .then((result) => {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            resolve({ result, timedOut: false })
          }
        })
        .catch((error) => {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            resolve({ timedOut: false, error: String(error) })
          }
        })
    })
  }
}
