/**
 * 工具生命周期事件系统
 *
 * 功能：
 * - 提供事件发射器模式（EventEmitter）
 * - 支持事件监听、一次性监听、移除监听
 * - 统一管理工具生命周期事件
 */

import type { ToolLifecycleEvent } from './toolRegistryTypes'

// ==================== ToolEventEmitter 类 ====================

export class ToolEventEmitter {
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map()

  /**
   * 注册事件监听器
   */
  on(event: ToolLifecycleEvent, handler: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
    
    // 返回取消订阅函数
    return () => {
      this.listeners.get(event)?.delete(handler)
    }
  }

  /**
   * 注册一次性事件监听器（触发后自动移除）
   */
  once(event: ToolLifecycleEvent, handler: (data: unknown) => void): void {
    const wrapper = (data: unknown) => {
      handler(data)
      this.listeners.get(event)?.delete(wrapper)
    }
    
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(wrapper)
  }

  /**
   * 触发事件
   */
  emit(event: ToolLifecycleEvent, data: unknown): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`[ToolEventEmitter] Event handler error for ${event}:`, error)
        }
      })
    }
  }

  /**
   * 移除指定事件的所有监听器
   */
  removeAllListeners(): void {
    this.listeners.clear()
  }

  /**
   * 获取监听器数量
   */
  getListenerCount(event?: ToolLifecycleEvent): number {
    if (event) {
      return this.listeners.get(event)?.size || 0
    }
    
    let total = 0
    for (const listeners of this.listeners.values()) {
      total += listeners.size
    }
    return total
  }
}
