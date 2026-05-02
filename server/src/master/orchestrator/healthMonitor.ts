/**
 * 健康检查与自动恢复监控器
 *
 * 功能：
 * - 定期执行容器健康检查
 * - 自动检测故障容器并尝试恢复
 * - 智能休眠空闲容器（基于 WebSocket 连接状态）
 * - 支持容器重启和重新分配策略
 *
 * 休眠算法优化：
 * - 检查前端 WebSocket 连接数（有连接则不休眠）
 * - 检查 Worker WebSocket 连接状态（活跃则不休眠）
 * - 结合用户等级的 idleTimeoutMs 配置
 * - 避免误杀活跃用户的容器
 */

import type { UserContainerMapping, PoolConfig, RemoteWorkerInstance } from './types'
import { ContainerLifecycle } from './containerLifecycle'
import { getSchedulingPolicy } from './schedulingPolicy'
import { getRemoteWorkerRegistry } from './remoteWorkerRegistry'

// 类型别名
type RequiredPoolConfig = Required<PoolConfig>

/**
 * 用户等级枚举（本地定义，避免循环依赖）
 * 与 schedulingPolicy.ts 中的 UserTier 保持同步
 */
enum UserTier {
  VIP = 'vip',
  PREMIUM = 'premium',
  REGULAR = 'regular',
  TRIAL = 'trial'
}

// ==================== HealthMonitor 类 ====================

export class HealthMonitor {
  private config: RequiredPoolConfig
  private containerLifecycle: ContainerLifecycle
  private userMappings: Map<string, UserContainerMapping>
  private healthCheckTimer: NodeJS.Timeout | null = null
  private idleCheckTimer: NodeJS.Timeout | null = null
  private remoteWorkerCheckTimer: NodeJS.Timeout | null = null
  private masterToken: string

  constructor(
    config: RequiredPoolConfig,
    containerLifecycle: ContainerLifecycle,
    userMappings: Map<string, UserContainerMapping>
  ) {
    this.config = config
    this.containerLifecycle = containerLifecycle
    this.userMappings = userMappings
    this.masterToken = process.env.MASTER_INTERNAL_TOKEN || 'internal-master-worker-token-2024'
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

    // 启动空闲检测和智能休眠循环（每60秒检查一次）
    this.startIdleDetectionLoop()

    // 启动远程 Worker 健康检查循环
    this.startRemoteWorkerHealthCheckLoop()
  }

  /**
   * 停止健康检查循环
   */
  stopHealthCheckLoop(): void {
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
    // 同时停止空闲检测循环
    if (this.idleCheckTimer) {
      clearTimeout(this.idleCheckTimer)
      this.idleCheckTimer = null
    }
    // 停止远程 Worker 健康检查循环
    if (this.remoteWorkerCheckTimer) {
      clearTimeout(this.remoteWorkerCheckTimer)
      this.remoteWorkerCheckTimer = null
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

  // ==================== 智能休眠算法 ====================

  /**
   * 启动空闲检测和智能休眠循环
   *
   * 核心算法：
   * 1. 遍历所有非休眠状态的用户容器
   * 2. 检查每个用户的空闲时间是否超过阈值
   * 3. 如果超过阈值，进一步检查是否有活跃的 WebSocket 连接
   * 4. 只有在无活跃连接时才执行休眠
   */
  private startIdleDetectionLoop(): void {
    const idleDetectionInterval = 60000 // 每60秒检查一次

    const idleCheckLoop = async () => {
      try {
        const schedulingPolicy = getSchedulingPolicy()

        for (const [userId, mapping] of this.userMappings) {
          // 跳过已休眠的容器
          if (mapping.container.status === 'paused') {
            continue
          }

          // 获取用户等级配置
          const tierConfig = schedulingPolicy.getTierConfig(this.determineUserTier(userId)) as any
          const idleTimeoutMs = tierConfig?.idleTimeoutMs ?? this.config.idleTimeoutMs

          // idleTimeoutMs 为 0 表示永不回收（如 VIP 用户）
          if (idleTimeoutMs === 0) {
            continue
          }

          // 计算空闲时间
          const now = Date.now()
          const idleTime = now - mapping.lastActivityAt.getTime()

          // 如果未超过空闲阈值，跳过
          if (idleTime < idleTimeoutMs) {
            continue
          }

          // 检查是否有活跃的 WebSocket 连接
          const hasActiveConnections = await this.checkUserActiveConnections(userId)

          if (hasActiveConnections) {
            // 有活跃连接，更新最后活动时间并跳过休眠
            console.log(`[HealthMonitor] 用户 ${userId} 有活跃 WebSocket 连接，跳过休眠（空闲 ${Math.round(idleTime / 1000)}s）`)
            mapping.lastActivityAt = new Date()
            mapping.container.lastActivityAt = new Date()
            continue
          }

          // 无活跃连接且超过空闲时间，执行休眠
          console.log(`[HealthMonitor] 用户 ${userId} 空闲超时（${Math.round(idleTime / 1000)}s），无活跃连接，开始休眠...`)
          await this.pauseIdleUserContainer(userId, idleTime)
        }
      } catch (error) {
        console.error('[HealthMonitor] 空闲检测循环出错:', error)
      } finally {
        if (this.idleCheckTimer) {
          this.idleCheckTimer = setTimeout(idleCheckLoop, idleDetectionInterval) as any
        }
      }
    }

    this.idleCheckTimer = setTimeout(idleCheckLoop, idleDetectionInterval) as any
    console.log('[HealthMonitor] 智能休眠检测已启动（基于 WebSocket 连接状态）')
  }

  /**
   * 检查用户是否有活跃的 WebSocket 连接或活跃部署
   *
   * 检测维度：
   * 1. 前端 WebSocket 连接数（wsManager）
   * 2. Worker WebSocket 连接状态（workerForwarder）
   * 3. Worker 内是否有活跃的部署项目（防休眠关键）
   *
   * @param userId 用户ID
   * @returns 是否有活跃连接或部署
   */
  private async checkUserActiveConnections(userId: string): Promise<boolean> {
    try {
      // 动态导入避免循环依赖
      const { wsManager } = await import('../integration/wsBridge')
      const { workerForwarder } = await import('../websocket/workerForwarder')

      // 1. 检查前端 WebSocket 连接
      const allConnections = wsManager.getAllConnections()
      const userFrontendConnections = Array.from(allConnections.values()).filter(
        conn => conn.meta?.userId === userId && conn.ws.readyState === 1 // WebSocket.OPEN = 1
      )

      if (userFrontendConnections.length > 0) {
        console.log(`[HealthMonitor] 用户 ${userId} 有 ${userFrontendConnections.length} 个活跃前端连接`)
        return true
      }

      // 2. 检查 Worker WebSocket 连接
      const workerForwarderInstance = workerForwarder
      if (workerForwarderInstance) {
        const workerConnection = workerForwarderInstance.getConnection(userId)
        if (workerConnection && workerConnection.ws.readyState === 1) { // WebSocket.OPEN = 1
          // 进一步检查前端是否通过 Worker 转发器有活跃连接
          if (workerConnection.frontendWs && workerConnection.frontendWs.readyState === 1) {
            console.log(`[HealthMonitor] 用户 ${userId} 有活跃的 Worker-前端桥接连接`)
            return true
          }
        }
      }

      // 3. 检查 Worker 内是否有活跃的部署项目
      const hasActiveDeployments = await this.checkActiveDeployments(userId)
      if (hasActiveDeployments) {
        console.log(`[HealthMonitor] 用户 ${userId} 有活跃部署项目，跳过休眠`)
        return true
      }

      return false
    } catch (error) {
      console.warn(`[HealthMonitor] 检查用户 ${userId} 连接状态失败:`, error)
      // 出错时保守处理：假设有连接，不执行休眠
      return true
    }
  }

  /**
   * 检查用户 Worker 内是否有活跃的部署项目
   *
   * 如果有正在运行的持久化部署，则不应休眠容器，
   * 否则会导致部署的服务中断。
   *
   * @param userId 用户ID
   * @returns 是否有活跃部署
   */
  private async checkActiveDeployments(userId: string): Promise<boolean> {
    try {
      const mapping = this.userMappings.get(userId)
      if (!mapping || mapping.container.status === 'paused') {
        return false
      }

      const { getWorkerDeploymentClient } = await import('../integrations/workerDeploymentClient')
      const client = getWorkerDeploymentClient()
      const activeDeployments = await client.getActiveDeployments(mapping.container)

      if (activeDeployments.length > 0) {
        console.log(
          `[HealthMonitor] 用户 ${userId} 有 ${activeDeployments.length} 个活跃部署: ` +
          activeDeployments.map(d => d.projectId).join(', ')
        )
        return true
      }

      return false
    } catch (error) {
      console.warn(`[HealthMonitor] 检查用户 ${userId} 活跃部署失败:`, error)
      // 出错时保守处理：假设有活跃部署，不执行休眠
      return true
    }
  }

  /**
   * 简单的用户等级判断（根据映射信息推断）
   * @param userId 用户ID
   * @returns 用户等级
   */
  private determineUserTier(userId: string): UserTier {
    // 默认返回普通用户等级
    return UserTier.REGULAR
  }

  /**
   * 休眠空闲用户的容器
   * @param userId 用户ID
   * @param idleTime 空闲时间（毫秒）
   */
  private async pauseIdleUserContainer(userId: string, idleTime: number): Promise<void> {
    try {
      const mapping = this.userMappings.get(userId)
      if (!mapping) {
        return
      }

      // 调用容器的释放方法（会触发休眠而非销毁）
      const { getContainerOrchestrator } = require('./containerOrchestrator')
      const orchestrator = getContainerOrchestrator()

      await orchestrator.releaseUserContainer(userId, false) // force=false 表示休眠而非销毁

      console.log(`[HealthMonitor] 用户 ${userId} 的容器已休眠（空闲 ${Math.round(idleTime / 1000)}s）`)
    } catch (error) {
      console.error(`[HealthMonitor] 休眠用户 ${userId} 容器失败:`, error)
    }
  }

  // ==================== 远程 Worker 健康检查 ====================

  /**
   * 启动远程 Worker 健康检查循环
   * 注意：远程 Worker 使用更宽松的检查策略，只标记状态不关闭
   */
  private startRemoteWorkerHealthCheckLoop(): void {
    const REMOTE_WORKER_CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 分钟检查一次
    const REMOTE_WORKER_TIMEOUT_MS = 30000 // 30 秒超时

    const checkLoop = async () => {
      try {
        const registry = getRemoteWorkerRegistry()
        const runningWorkers = registry.getAllWorkers().filter(
          w => w.status === 'running'
        )

        for (const worker of runningWorkers) {
          const isHealthy = await this.checkRemoteWorkerHealth(worker, REMOTE_WORKER_TIMEOUT_MS)

          if (isHealthy) {
            if (worker.healthStatus !== 'healthy') {
              console.log(`[HealthMonitor] 远程 Worker 恢复健康: ${worker.workerId}`)
              await registry.updateWorker(worker.workerId, {
                healthStatus: 'healthy',
                lastHeartbeatAt: new Date()
              })
            }
          } else {
            if (worker.healthStatus !== 'unhealthy') {
              console.warn(`[HealthMonitor] 远程 Worker 不健康: ${worker.workerId}`)
              await registry.updateWorker(worker.workerId, {
                healthStatus: 'unhealthy',
                lastHeartbeatAt: new Date()
              })
            }
          }
        }
      } catch (error) {
        console.error('[HealthMonitor] 远程 Worker 健康检查循环出错:', error)
      } finally {
        if (this.remoteWorkerCheckTimer) {
          this.remoteWorkerCheckTimer = setTimeout(checkLoop, REMOTE_WORKER_CHECK_INTERVAL_MS) as any
        }
      }
    }

    this.remoteWorkerCheckTimer = setTimeout(checkLoop, REMOTE_WORKER_CHECK_INTERVAL_MS) as any
    console.log('[HealthMonitor] 远程 Worker 健康检查已启动（间隔: 5分钟，超时: 30秒）')
  }

  /**
   * 检查远程 Worker 健康状态
   * @param worker 远程 Worker 实例
   * @param timeoutMs 超时时间（毫秒）
   * @returns 是否健康
   */
  private async checkRemoteWorkerHealth(
    worker: RemoteWorkerInstance,
    timeoutMs: number
  ): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(`http://${worker.host}:${worker.port}/internal/health`, {
        method: 'GET',
        headers: { 'X-Master-Token': this.masterToken },
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      return response.ok
    } catch (error) {
      return false
    }
  }
}
