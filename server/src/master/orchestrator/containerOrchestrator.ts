/**
 * ContainerOrchestrator - 容器编排调度器（重构版）
 *
 * 功能：
 * - 协调各子模块，提供统一的容器管理 API
 * - 管理用户到容器的映射与分配（一个用户一个容器）
 * - 提供容器生命周期的高级编排逻辑
 *
 * 架构改进：
 * - 从 2124 行单体类拆分为轻量级协调器（~300 行）
 * - 委托具体实现给专门的子模块
 * - 保持对外 API 完全兼容
 *
 * 子模块依赖：
 * - types.ts: 类型定义和配置
 * - containerOperations.ts: Docker 操作封装
 * - workspaceManager.ts: 工作空间管理
 * - containerLifecycle.ts: 容器生命周期
 * - healthMonitor.ts: 健康检查监控
 * - dockerCleanup.ts: Docker 清理服务
 * - mappingPersistence.ts: 映射持久化
 */

import type { UserContainerMapping, ContainerInstance, OrchestratorResult, PoolConfig, RemoteWorkerInstance } from './types'
import { DEFAULT_POOL_CONFIG } from './types'
import { UserTier } from '../config/hardwareResourceConfig'
import { ContainerOperations } from './containerOperations'
import { WorkspaceManager } from './workspaceManager'
import { ContainerLifecycle } from './containerLifecycle'
import { HealthMonitor } from './healthMonitor'
import { DockerCleanup } from './dockerCleanup'
import { MappingPersistence } from './mappingPersistence'
import { getRemoteWorkerRegistry, initializeRemoteWorkerRegistry } from './remoteWorkerRegistry'

// 用户容器分配锁（用于并发控制）
const userContainerLocks = new Map<string, { locked: boolean; timestamp: number }>()

// ==================== ContainerOrchestrator 类 ====================

export class ContainerOrchestrator {
  private config: Required<PoolConfig>
  private userMappings: Map<string, UserContainerMapping> = new Map()
  
  // 子模块实例
  private containerOps: ContainerOperations
  private workspaceManager: WorkspaceManager
  private containerLifecycle: ContainerLifecycle
  private healthMonitor: HealthMonitor
  private dockerCleanup: DockerCleanup
  private mappingPersistence: MappingPersistence

  constructor(config?: Partial<PoolConfig>) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config }
    
    // 初始化所有子模块
    this.containerOps = new ContainerOperations(this.config)
    this.workspaceManager = new WorkspaceManager(this.config, this.containerOps)
    this.containerLifecycle = new ContainerLifecycle(
      this.config,
      this.containerOps,
      this.workspaceManager,
      this.userMappings
    )
    this.healthMonitor = new HealthMonitor(
      this.config,
      this.containerLifecycle,
      this.userMappings
    )
    this.dockerCleanup = new DockerCleanup(this.config, this.workspaceManager)
    this.mappingPersistence = new MappingPersistence(this.userMappings)
    
    console.log('[ContainerOrchestrator] 初始化完成（重构版），配置:', JSON.stringify(this.config, null, 2))
  }

  /**
   * 初始化编排器（预启动热容器池）
   * @returns 初始化结果
   */
  async initialize(): Promise<OrchestratorResult<void>> {
    try {
      console.log('[ContainerOrchestrator] 开始初始化...')

      // 检查Docker是否可用
      const dockerAvailable = await this.containerOps.checkDockerAvailability()
      if (!dockerAvailable) {
        return {
          success: false,
          error: 'Docker服务不可用，请确保Docker已启动',
          code: 'DOCKER_UNAVAILABLE'
        }
      }

      // 确保网络存在
      const networkCreated = await this.containerOps.ensureNetworkExists()
      if (!networkCreated) {
        return {
          success: false,
          error: `无法创建或访问网络 ${this.config.networkName}`,
          code: 'NETWORK_ERROR'
        }
      }

      // 初始化宿主机工作空间目录（Bind Mount 根目录）
      await this.workspaceManager.ensureHostWorkspaceExists()

      // 检查磁盘空间
      const diskStatus = await this.workspaceManager.checkDiskSpace()
      if (diskStatus.critical) {
        console.error(`[ContainerOrchestrator] 磁盘空间严重不足: ${diskStatus.used}%`)
        return {
          success: false,
          error: `磁盘空间严重不足 (${diskStatus.used}%)，无法创建容器`,
          code: 'DISK_SPACE_CRITICAL'
        }
      }
      if (diskStatus.warning) {
        console.warn(`[ContainerOrchestrator] 磁盘空间告警: ${diskStatus.used}%`)
      }

      // 从数据库加载用户映射（Master 重启后恢复）
      console.log('[ContainerOrchestrator] 从数据库加载用户映射...')
      await this.mappingPersistence.loadUserMappingsFromDB()

      // 扫描Docker中已运行的用户容器并恢复映射（兼容旧版本未持久化的容器）
      console.log('[ContainerOrchestrator] 扫描Docker中已运行的用户容器...')
      await this.mappingPersistence.scanAndRecoverUserContainers()

      // 启动健康检查定时任务
      this.healthMonitor.startHealthCheckLoop()

      // 启动 Docker 系统清理定时任务
      if (this.config.enableAutoCleanup) {
        this.dockerCleanup.startDockerCleanupLoop()
        console.log(`[ContainerOrchestrator] Docker 自动清理已启用（间隔: ${this.config.cleanupIntervalMs}ms）`)
      }

      // 初始化远程 Worker 注册表
      try {
        console.log('[ContainerOrchestrator] 初始化远程 Worker 注册表...')
        await initializeRemoteWorkerRegistry()
        console.log('[ContainerOrchestrator] 远程 Worker 注册表初始化完成')
      } catch (error) {
        console.warn('[ContainerOrchestrator] 远程 Worker 注册表初始化失败:', error)
      }

      console.log('[ContainerOrchestrator] 初始化完成')
      return { success: true }

    } catch (error) {
      console.error('[ContainerOrchestrator] 初始化失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '初始化失败',
        code: 'INIT_FAILED'
      }
    }
  }

  /**
   * 为用户分配容器（从热池获取或新建）
   * 使用分布式锁防止并发请求创建重复容器
   * @param userId 用户ID
   * @param username 用户名（可选）
   * @param userTier 用户等级（可选，默认为free）
   * @returns 分配结果
   */
  async assignContainerToUser(userId: string, username?: string, userTier?: UserTier): Promise<OrchestratorResult<UserContainerMapping>> {
    const lockKey = `user_container_${userId}`
    const now = Date.now()
    const existingLock = userContainerLocks.get(lockKey)

    // 检查锁是否存在且未过期（锁超时时间：120秒，确保覆盖容器创建时间）
    const LOCK_TIMEOUT_MS = 120000
    if (existingLock && (now - existingLock.timestamp) < LOCK_TIMEOUT_MS) {
      console.warn(`[ContainerOrchestrator] 用户 ${userId} 的容器分配锁已被持有，跳过重复创建（锁时间: ${new Date(existingLock.timestamp).toISOString()})`)
      // 返回当前已有的映射（如果有）
      const existingMapping = this.userMappings.get(userId)
      if (existingMapping) {
        console.log(`[ContainerOrchestrator] 用户 ${userId} 已有容器，直接返回现有映射`)
        return { success: true, data: existingMapping }
      }
      // 如果锁存在但容器还未创建，返回创建中状态
      return {
        success: false,
        error: '容器创建中，请稍后重试',
        code: 'CONTAINER_CREATION_IN_PROGRESS'
      }
    }

    // 获取锁（原子操作）
    userContainerLocks.set(lockKey, { locked: true, timestamp: now })
    console.log(`[ContainerOrchestrator] 获取用户容器分配锁: ${userId}`)

    try {
      return await this.assignContainerToUserInternal(userId, username, userTier, lockKey)
    } catch (error) {
      console.error(`[ContainerOrchestrator] 为用户 ${userId} 分配容器失败:`, error)
      // 发生异常时也要释放锁
      userContainerLocks.delete(lockKey)

      return {
        success: false,
        error: error instanceof Error ? error.message : '分配容器失败',
        code: 'ASSIGN_FAILED'
      }
    }
  }

  /**
   * 内部容器分配逻辑（已持有锁）
   * 新逻辑：优先检查用户是否已有容器（包括休眠状态），否则新建
   */
  private async assignContainerToUserInternal(userId: string, username?: string, userTier?: UserTier, lockKey?: string): Promise<OrchestratorResult<UserContainerMapping>> {
    try {
      // ========== 再次检查用户是否已有容器（锁内二次确认） ==========
      const existingMapping = this.userMappings.get(userId)
      if (existingMapping) {
        // 恢复容器（如果是暂停状态）
        if (existingMapping.container.status === 'paused') {
          console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器处于休眠状态，正在恢复...`)
          const unpaused = await this.containerLifecycle.unpauseContainer(existingMapping.container.containerId)
          if (unpaused) {
            existingMapping.container.status = 'assigned'
            existingMapping.container.lastActivityAt = new Date()
            existingMapping.lastActivityAt = new Date()
            console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器已恢复`)
          } else {
            console.warn(`[ContainerOrchestrator] 用户 ${userId} 的容器恢复失败，将销毁并重建`)
            await this.containerLifecycle.destroyContainer(existingMapping.container.containerId)
            this.userMappings.delete(userId)
            // 继续创建新容器
          }
        } else {
          // 更新最后活动时间
          existingMapping.lastActivityAt = new Date()
          existingMapping.container.lastActivityAt = new Date()
          console.log(`[ContainerOrchestrator] 用户 ${userId} 已有容器（锁内二次确认）: ${existingMapping.container.containerId}`)
          return { success: true, data: existingMapping }
        }
      }

      // ========== 确保用户工作空间目录存在 ==========
      const workspaceResult = await this.workspaceManager.ensureUserWorkspaceExists(userId)
      if (!workspaceResult.success) {
        console.warn(`[ContainerOrchestrator] 确保工作空间目录存在失败: ${workspaceResult.error}`)
      }

      // ========== 创建新的用户专用容器 ==========
      const createResult = await this.containerLifecycle.createContainer(userId, username, userTier)
      if (!createResult.success) {
        console.error(`[ContainerOrchestrator] 用户 ${userId} 容器创建失败: ${createResult.error}`)
        return createResult as OrchestratorResult<UserContainerMapping>
      }
      const container = createResult.data!

      // ========== 创建用户映射 ==========
      const mapping: UserContainerMapping = {
        userId,
        container,
        assignedAt: new Date(),
        sessionCount: 0,
        lastActivityAt: new Date()
      }

      this.userMappings.set(userId, mapping)
      console.log(`[ContainerOrchestrator] 成功为用户 ${userId} 分配容器：${container.containerId}`)

      // ========== 保存映射到数据库 ==========
      await this.mappingPersistence.saveUserMappingToDB(mapping)

      return { success: true, data: mapping }

    } finally {
      // ========== 释放锁 ==========
      if (lockKey) {
        userContainerLocks.delete(lockKey)
        console.log(`[ContainerOrchestrator] 释放用户容器分配锁: ${userId}`)
      }
    }
  }

  /**
   * 释放用户容器（当用户所有活动都结束时调用）
   * 一个用户一个容器，不区分会话
   * 
   * 新逻辑：休眠容器而不是销毁
   * 
   * @param userId 用户ID
   * @param force 是否强制销毁（不推荐，除非用户明确要求）
   * @returns 释放结果
   */
  async releaseUserContainer(userId: string, force: boolean = false): Promise<OrchestratorResult<void>> {
    try {
      const mapping = this.userMappings.get(userId)
      if (!mapping) {
        console.warn(`[ContainerOrchestrator] 用户 ${userId} 没有关联的容器`)
        return { success: true }
      }

      const container = mapping.container

      if (force) {
        // 强制销毁容器（创建快照后销毁）
        await this.containerLifecycle.destroyContainer(container.containerId)
        console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器已强制销毁`)
      } else {
        // 休眠容器（推荐）
        const paused = await this.containerLifecycle.pauseContainer(container.containerId)
        if (paused) {
          container.status = 'paused'
          console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器已休眠，可秒级恢复`)
        } else {
          console.error(`[ContainerOrchestrator] 用户 ${userId} 的容器休眠失败`)
          return {
            success: false,
            error: '容器休眠失败',
            code: 'PAUSE_FAILED'
          }
        }
      }

      // 更新最后活动时间
      mapping.lastActivityAt = new Date()
      console.log(`[ContainerOrchestrator] 已释放用户 ${userId} 的容器`)

      // 更新数据库状态
      await this.mappingPersistence.updateUserMappingStatusInDB(userId, force ? 'destroyed' : 'paused')

      return { success: true }

    } catch (error) {
      console.error(`[ContainerOrchestrator] 释放用户 ${userId} 容器失败:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '释放容器失败',
        code: 'RELEASE_FAILED'
      }
    }
  }

  /**
   * 按名称移除残留容器（不触发完整销毁流程）
   * @param containerName 容器名称
   */
  async removeContainerByName(containerName: string): Promise<void> {
    await this.containerLifecycle.removeContainerByName(containerName)
  }

  /**
   * 获取用户的容器映射
   * @param userId 用户 ID
   * @returns 映射信息
   */
  getUserMapping(userId: string): UserContainerMapping | undefined {
    return this.userMappings.get(userId)
  }

  /**
   * 获取或加载用户的容器映射（从内存或数据库）
   * @param userId 用户 ID
   * @returns 映射信息
   */
  async getOrLoadUserMapping(userId: string): Promise<UserContainerMapping | undefined> {
    return await this.mappingPersistence.getOrLoadUserMapping(userId)
  }

  /**
   * 扫描Docker中指定用户的已运行容器并恢复映射
   * @param userId 用户ID
   * @returns 恢复的映射，如果未找到则返回 undefined
   */
  async scanAndRecoverUserContainer(userId: string): Promise<UserContainerMapping | undefined> {
    return await this.mappingPersistence.scanAndRecoverUserContainer(userId)
  }

  /**
   * 获取容器的IP地址（在Docker网络中）
   * @param containerId 容器ID
   * @returns 容器IP地址，如果获取失败则返回 null
   */
  async getContainerIp(containerId: string): Promise<string | null> {
    return await this.containerOps.getContainerIp(containerId)
  }

  /**
   * 获取所有活跃的用户容器映射
   * @returns 映射列表
   */
  getAllUserMappings(): UserContainerMapping[] {
    return Array.from(this.userMappings.values())
  }

  /**
   * 获取热池状态统计
   * @returns 统计信息
   */
  getPoolStats(): {
    totalContainers: number
    idleContainers: number
    activeUsers: number
    poolUtilization: number
  } {
    let pausedCount = 0
    for (const mapping of this.userMappings.values()) {
      if (mapping.container.status === 'paused') {
        pausedCount++
      }
    }

    return {
      totalContainers: this.userMappings.size,
      idleContainers: pausedCount,
      activeUsers: this.userMappings.size,
      poolUtilization: this.userMappings.size > 0
        ? Math.round(((this.userMappings.size - pausedCount) / this.userMappings.size) * 10000) / 100
        : 0
    }
  }

  /**
   * 获取热池状态（getPoolStats 的别名，供 schedulingPolicy 使用）
   * @returns 统计信息
   */
  getPoolStatus(): {
    totalContainers: number
    idleContainers: number
    activeUsers: number
    poolUtilization: number
  } {
    return this.getPoolStats()
  }

  /**
   * 获取用户工作目录路径
   * @param userId 用户ID
   * @returns 工作空间路径
   */
  getUserWorkspacePath(userId: string): string {
    return this.workspaceManager.getUserWorkspacePath(userId)
  }

  /**
   * 检查磁盘空间状态
   */
  async checkDiskSpace(): Promise<{
    total: number
    used: number
    available: number
    warning: boolean
    critical: boolean
  }> {
    return await this.workspaceManager.checkDiskSpace()
  }

  /**
   * 获取工作空间统计信息
   */
  async getWorkspaceStats(): Promise<{
    userCount: number
    totalSizeMB: number
  }> {
    return await this.workspaceManager.getWorkspaceStats()
  }

  /**
   * 关闭编排器（停止所有定时任务，清理资源）
   */
  async shutdown(): Promise<void> {
    console.log('[ContainerOrchestrator] 正在关闭编排器...')

    // 停止健康检查循环
    this.healthMonitor.stopHealthCheckLoop()

    // 停止 Docker 清理定时任务
    this.dockerCleanup.stopDockerCleanupLoop()

    // 停止远程 Worker 健康检查
    try {
      const registry = getRemoteWorkerRegistry()
      registry.stopHealthCheckLoop()
    } catch (error) {
      // 忽略错误
    }

    // 注意：不主动销毁用户容器，因为可能还有活跃会话
    // 用户容器会在下次健康检查时根据状态决定是否休眠

    console.log('[ContainerOrchestrator] 编排器已关闭')
  }

  // ==================== 远程 Worker 管理 ====================

  /**
   * 获取远程 Worker 注册表
   */
  getRemoteWorkerRegistry() {
    return getRemoteWorkerRegistry()
  }

  /**
   * 获取可用的 Worker（本地或远程）
   * 优先返回本地容器，如果没有则返回远程 Worker
   */
  async getAvailableWorker(userId: string): Promise<{ type: 'local' | 'remote'; worker: ContainerInstance | RemoteWorkerInstance } | null> {
    // 首先检查本地容器
    const localMapping = this.userMappings.get(userId)
    if (localMapping && localMapping.container.status === 'running') {
      return { type: 'local', worker: localMapping.container }
    }

    // 如果没有本地容器，尝试获取远程 Worker
    try {
      const registry = getRemoteWorkerRegistry()
      const remoteWorker = registry.selectWorker()
      if (remoteWorker) {
        return { type: 'remote', worker: remoteWorker }
      }
    } catch (error) {
      console.warn('[ContainerOrchestrator] 获取远程 Worker 失败:', error)
    }

    return null
  }

  /**
   * 获取所有远程 Worker 列表
   */
  getRemoteWorkers(): RemoteWorkerInstance[] {
    try {
      const registry = getRemoteWorkerRegistry()
      return registry.getAllWorkers()
    } catch (error) {
      console.warn('[ContainerOrchestrator] 获取远程 Worker 列表失败:', error)
      return []
    }
  }

  /**
   * 获取远程 Worker 统计信息
   */
  getRemoteWorkerStats() {
    try {
      const registry = getRemoteWorkerRegistry()
      return registry.getStats()
    } catch (error) {
      console.warn('[ContainerOrchestrator] 获取远程 Worker 统计失败:', error)
      return { total: 0, running: 0, healthy: 0, unhealthy: 0, offline: 0, error: 0 }
    }
  }
}

// ==================== 单例模式 ====================

let containerOrchestrator: ContainerOrchestrator | null = null

/**
 * 获取ContainerOrchestrator单例实例
 * @param config 可选配置
 * @returns 编排器实例
 */
export function getContainerOrchestrator(config?: Partial<PoolConfig>): ContainerOrchestrator {
  if (!containerOrchestrator) {
    containerOrchestrator = new ContainerOrchestrator(config)
  }
  return containerOrchestrator
}

// 导出类型供其他模块使用
export type { ContainerInstance, UserContainerMapping, PoolConfig, OrchestratorResult }
export { DEFAULT_POOL_CONFIG }

export default ContainerOrchestrator
