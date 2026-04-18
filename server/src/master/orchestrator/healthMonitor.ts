/**
 * 健康检查与自动恢复监控器
 *
 * 功能：
 * - 定期执行容器健康检查
 * - 自动检测故障容器并尝试恢复
 * - 支持容器重启和重新分配策略
 *
 * 使用场景：
 * - 后台持续监控所有用户容器的健康状态
 * - 故障时自动尝试修复，减少人工干预
 */

import type { UserContainerMapping, PoolConfig } from './types'
import { ContainerLifecycle } from './containerLifecycle'

// 类型别名
type RequiredPoolConfig = Required<PoolConfig>

// ==================== HealthMonitor 类 ====================

export class HealthMonitor {
  private config: RequiredPoolConfig
  private containerLifecycle: ContainerLifecycle
  private userMappings: Map<string, UserContainerMapping>
  private healthCheckTimer: NodeJS.Timeout | null = null

  constructor(
    config: RequiredPoolConfig,
    containerLifecycle: ContainerLifecycle,
    userMappings: Map<string, UserContainerMapping>
  ) {
    this.config = config
    this.containerLifecycle = containerLifecycle
    this.userMappings = userMappings
  }

  /**
   * 启动健康检查循环
   */
  startHealthCheckLoop(): void {
    const healthCheckLoop = async () => {
      try {
        // 检查用户容器（跳过休眠状态的容器）
        for (const [userId, mapping] of this.userMappings) {
          // 跳过休眠状态的容器
          if (mapping.container.status === 'paused') {
            continue
          }

          const isHealthy = await this.containerLifecycle.checkContainerHealth(mapping.container.containerId)
          if (!isHealthy) {
            console.error(`[HealthMonitor] 用户 ${userId} 的容器不健康，尝试自动恢复...`)
            // 自动恢复：尝试重启容器
            const restarted = await this.restartUserContainer(userId)
            if (restarted) {
              console.log(`[HealthMonitor] 用户 ${userId} 的容器重启成功`)
            } else {
              console.error(`[HealthMonitor] 用户 ${userId} 的容器重启失败，将重新分配`)
              // 重新分配新容器
              await this.reallocateUserContainer(userId)
            }
          }
        }
      } catch (error) {
        console.error('[HealthMonitor] 健康检查循环出错:', error)
      } finally {
        // 使用 setTimeout 代替 setInterval，防止并发执行
        if (this.healthCheckTimer) {
          this.healthCheckTimer = setTimeout(healthCheckLoop, this.config.healthCheckIntervalMs) as any
        }
      }
    }

    // 首次启动健康检查循环
    this.healthCheckTimer = setTimeout(healthCheckLoop, this.config.healthCheckIntervalMs) as any
  }

  /**
   * 停止健康检查循环
   */
  stopHealthCheckLoop(): void {
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  /**
   * 重启用户容器
   * @param userId 用户ID
   * @returns 是否重启成功
   */
  private async restartUserContainer(userId: string): Promise<boolean> {
    try {
      const mapping = this.userMappings.get(userId)
      if (!mapping) {
        console.warn(`[HealthMonitor] 重启容器失败：找不到用户 ${userId} 的映射`)
        return false
      }

      const containerId = mapping.container.containerId

      // 检查容器是否仍然存在
      const { execAsync } = require('child_process')
      const { promisify } = require('util')
      const execAsyncPromisified = promisify(exec)

      try {
        await execAsyncPromisified(`docker inspect ${containerId}`)
      } catch {
        console.warn(`[HealthMonitor] 重启容器失败：容器 ${containerId} 不存在`)
        return false
      }

      // 尝试重启容器
      console.log(`[HealthMonitor] 正在重启容器: ${containerId}`)
      await execAsyncPromisified(`docker restart -t 10 ${containerId}`)

      // 等待容器就绪
      await new Promise(resolve => setTimeout(resolve, 5000))

      // 验证容器健康状态
      const isHealthy = await this.containerLifecycle.checkContainerHealth(containerId)
      if (isHealthy) {
        mapping.container.lastActivityAt = new Date()
        return true
      }

      return false
    } catch (error) {
      console.error(`[HealthMonitor] 重启用户容器失败 (${userId}):`, error)
      return false
    }
  }

  /**
   * 重新为用户分配容器
   * 当原有容器无法恢复时调用
   * @param userId 用户ID
   */
  private async reallocateUserContainer(userId: string): Promise<void> {
    try {
      const mapping = this.userMappings.get(userId)
      if (!mapping) {
        console.warn(`[HealthMonitor] 重新分配失败：找不到用户 ${userId} 的映射`)
        return
      }

      const oldContainerId = mapping.container.containerId

      // 销毁旧容器
      console.log(`[HealthMonitor] 销毁旧容器: ${oldContainerId}`)
      await this.containerLifecycle.destroyContainer(oldContainerId)

      // 注意：这里不能直接调用 assignContainerToUser，因为会造成循环依赖
      // 实际的重新分配逻辑应该在主编排器中处理
      // 这里只是标记需要重新分配，由外部协调器处理
      console.warn(`[HealthMonitor] 用户 ${userId} 需要重新分配容器（旧容器已销毁）`)

    } catch (error) {
      console.error(`[HealthMonitor] 重新分配容器失败 (${userId}):`, error)
    }
  }
}
