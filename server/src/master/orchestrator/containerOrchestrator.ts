/**
 * ContainerOrchestrator - 容器编排调度器
 *
 * 功能：
 * - 容器生命周期管理（创建、休眠、恢复、销毁）
 * - 用户到容器的映射与分配（一个用户一个容器）
 * - 容器休眠/恢复机制（Docker pause/unpause）
 * - 资源监控与健康检查
 * - 故障检测与自动恢复
 *
 * 架构原则：
 * - 一个用户 = 一个 Worker 容器 = 一个工作空间
 * - 用户离开时休眠容器（CPU=0，保留所有状态）
 * - 用户回来时秒级恢复容器（状态丝毫不丢）
 *
 * 使用场景：
 * - Master服务中调度Worker容器
 * - 多用户隔离环境中的容器管理
 */

import { DEFAULT_WORKER_PORT } from '../../shared/constants'
import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs/promises'
import { getHardwareResourceManager, UserTier } from '../config/hardwareResourceConfig'
import { getPool } from '../db/mysql'
import { v4 as uuidv4 } from 'uuid'

/**
 * 获取Worker容器内部端口（用于容器内健康检查）
 */
function getWorkerInternalPort(): number {
  return DEFAULT_WORKER_PORT
}

const execAsync = promisify(exec)

// 容器操作状态跟踪（用于幂等性和并发控制）
const destroyingContainers = new Set<string>() // 正在销毁的容器ID集合
const userContainerLocks = new Map<string, { locked: boolean; timestamp: number }>() // 用户容器分配锁

// ==================== 类型定义 ====================

/**
 * 容器实例信息
 */
export interface ContainerInstance {
  /** 容器ID */
  containerId: string
  /** 容器名称 */
  containerName: string
  /** 映射到宿主机的端口 */
  hostPort: number
  /** 容器状态 */
  status: 'running' | 'stopped' | 'creating' | 'error' | 'assigned' | 'paused'
  /** 关联的用户ID（如果有） */
  assignedUserId?: string
  /** 创建时间 */
  createdAt: Date
  /** 最后活动时间 */
  lastActivityAt: Date
  /** 资源使用情况 */
  resourceUsage?: {
    memoryMB: number
    cpuPercent: number
  }
}

/**
 * 用户容器映射信息
 */
export interface UserContainerMapping {
  /** 用户ID */
  userId: string
  /** 用户名（可选） */
  username?: string
  /** 用户等级（可选） */
  userTier?: UserTier
  /** 容器实例 */
  container: ContainerInstance
  /** 分配时间 */
  assignedAt: Date
  /** 会话统计 */
  sessionCount: number
  /** 最后活动时间 */
  lastActivityAt: Date
}

/**
 * 容器池配置
 */
export interface PoolConfig {
  /** 容器健康检查间隔（毫秒）*/
  healthCheckIntervalMs: number
  /** Docker镜像名称 */
  imageName: string
  /**
   * 网络名称
   * 安全说明：Worker 容器应该使用与 MySQL 隔离的网络（如 worker-network）
   * 以防止 Worker 容器直接访问数据库，即使应用层被绕过也无法连接 MySQL
   */
  networkName: string
  /** 基础端口号（从该端口开始分配）*/
  basePort: number
  /** 宿主机工作空间根目录（Bind Mount 目标）*/
  hostWorkspacePath: string
  /** 磁盘空间告警阈值（百分比）*/
  diskWarningThreshold: number
  /** 磁盘空间严重告警阈值（百分比）*/
  diskCriticalThreshold: number
  /** 是否启用自动 Docker 清理 */
  enableAutoCleanup: boolean
  /** Docker 清理间隔（毫秒），默认 1 小时 */
  cleanupIntervalMs: number
  /** Docker 清理时是否删除未使用的镜像 */
  cleanupUnusedImages: boolean
  /** Docker 清理时是否删除孤立卷 */
  cleanupOrphanedVolumes: boolean
}

/**
 * 编排结果
 */
export interface OrchestratorResult<T = any> {
  success: boolean
  data?: T
  error?: string
  code?: string
}

/**
 * 默认配置（优先从环境变量读取，提供合理的默认值）
 */
const DEFAULT_POOL_CONFIG: Required<PoolConfig> = {
  healthCheckIntervalMs: parseInt(process.env.CONTAINER_HEALTH_CHECK_INTERVAL || '60000', 10),
  imageName: process.env.WORKER_IMAGE_NAME || 'claw-web-backend-worker:latest',
  networkName: process.env.DOCKER_NETWORK_NAME || 'claw-web_worker-network',
  basePort: parseInt(process.env.CONTAINER_BASE_PORT || '3100', 10),
  hostWorkspacePath: process.env.HOST_WORKSPACE_PATH || '/data/claws/workspaces',
  diskWarningThreshold: parseInt(process.env.DISK_WARNING_THRESHOLD || '80', 10),
  diskCriticalThreshold: parseInt(process.env.DISK_CRITICAL_THRESHOLD || '90', 10),
  enableAutoCleanup: process.env.ENABLE_DOCKER_AUTO_CLEANUP === 'true',
  cleanupIntervalMs: parseInt(process.env.DOCKER_CLEANUP_INTERVAL_MS || '3600000', 10),
  cleanupUnusedImages: process.env.DOCKER_CLEANUP_IMAGES !== 'false',
  cleanupOrphanedVolumes: process.env.DOCKER_CLEANUP_VOLUMES === 'true',
}

// ==================== ContainerOrchestrator 类 ====================

class ContainerOrchestrator {
  private config: Required<PoolConfig>
  private userMappings: Map<string, UserContainerMapping> = new Map()
  private healthCheckTimer: NodeJS.Timeout | null = null
  private dockerCleanupTimer: NodeJS.Timeout | null = null
  private lastContainerCreationTime: number = 0
  private consecutiveFailures: number = 0

  constructor(config?: Partial<PoolConfig>) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config }
    console.log('[ContainerOrchestrator] 初始化完成，配置:', JSON.stringify(this.config, null, 2))
  }


  /**
   * 初始化编排器（预启动热容器池）
   * @returns 初始化结果
   */
  async initialize(): Promise<OrchestratorResult<void>> {
    try {
      console.log('[ContainerOrchestrator] 开始初始化...')

      // 检查Docker是否可用
      const dockerAvailable = await this.checkDockerAvailability()
      if (!dockerAvailable) {
        return {
          success: false,
          error: 'Docker服务不可用，请确保Docker已启动',
          code: 'DOCKER_UNAVAILABLE'
        }
      }

      // 确保网络存在
      const networkCreated = await this.ensureNetworkExists()
      if (!networkCreated) {
        return {
          success: false,
          error: `无法创建或访问网络 ${this.config.networkName}`,
          code: 'NETWORK_ERROR'
        }
      }

      // 初始化宿主机工作空间目录（Bind Mount 根目录）
      await this.ensureHostWorkspaceExists()

      // 检查磁盘空间
      const diskStatus = await this.checkDiskSpace()
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
      await this.loadUserMappingsFromDB()

      // 扫描Docker中已运行的用户容器并恢复映射（兼容旧版本未持久化的容器）
      console.log('[ContainerOrchestrator] 扫描Docker中已运行的用户容器...')
      await this.scanAndRecoverUserContainers()

      // 启动健康检查定时任务
      this.startHealthCheckLoop()

      // 启动 Docker 系统清理定时任务
      if (this.config.enableAutoCleanup) {
        this.startDockerCleanupLoop()
        console.log(`[ContainerOrchestrator] Docker 自动清理已启用（间隔: ${this.config.cleanupIntervalMs}ms）`)
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
          const unpaused = await this.unpauseContainer(existingMapping.container.containerId)
          if (unpaused) {
            existingMapping.container.status = 'assigned'
            existingMapping.container.lastActivityAt = new Date()
            existingMapping.lastActivityAt = new Date()
            console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器已恢复`)
          } else {
            console.warn(`[ContainerOrchestrator] 用户 ${userId} 的容器恢复失败，将销毁并重建`)
            await this.destroyContainer(existingMapping.container.containerId)
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
      const workspaceResult = await this.ensureUserWorkspaceExists(userId)
      if (!workspaceResult.success) {
        console.warn(`[ContainerOrchestrator] 确保工作空间目录存在失败: ${workspaceResult.error}`)
      }

      // ========== 创建新的用户专用容器 ==========
      const createResult = await this.createContainer(userId, username, userTier)
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
      await this.saveUserMappingToDB(mapping)

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
        await this.createSnapshotBeforeDestroy(container.containerId)
        await this.destroyContainer(container.containerId)
        console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器已强制销毁`)
      } else {
        // 休眠容器（推荐）
        const paused = await this.pauseContainer(container.containerId)
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
      await this.updateUserMappingStatusInDB(userId, force ? 'destroyed' : 'paused')

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
   * 创建新的用户专用容器
   * @param userId 用户ID
   * @param username 用户名
   * @param userTier 用户等级（可选，默认为free）
   * @returns 创建结果
   */
  private async createContainer(userId: string, username?: string, userTier?: UserTier): Promise<OrchestratorResult<ContainerInstance>> {
    try {
      // 生成唯一容器名：用户ID前12位 + 时间戳后6位 + 随机4位
      // 确保同一用户的多次会话也不会冲突
      const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 12)
      const timestamp = Date.now().toString(36).slice(-6)
      const randomSuffix = Math.random().toString(36).substring(2, 6)
      const containerName = `claude-user-${safeUserId}-${timestamp}-${randomSuffix}`

      // 原子性保障：在创建前强制清理可能存在的同名残留容器（只清理非运行中的）
      console.log(`[ContainerOrchestrator] 清理残留容器: ${containerName}`)
      try {
        // 先检查是否存在同名容器，如果存在则清理
        const existing = await execAsync(`docker ps -a --filter "name=${containerName}" --format "{{.ID}}" 2>/dev/null || echo ""`)
        if (existing.stdout.trim()) {
          await execAsync(`docker rm -f ${containerName} 2>/dev/null || true`)
        }
      } catch (e) {
        // 忽略清理错误，继续创建流程
      }

      // 分配端口（异步，带冲突检测）
      const port = await this.allocatePort()

      // 获取用户等级的硬件配额
      const tier = userTier || UserTier.FREE
      const hardwareManager = getHardwareResourceManager()
      const quota = hardwareManager.getUserQuota(userId, tier)
      const resourceArgs = hardwareManager.generateDockerResourceArgs(quota)

      // ========== Bind Mount: 宿主机工作空间挂载 ==========
      // 安全说明：
      // - 文件直接写入宿主机磁盘，容器崩溃也不会丢失
      // - Agent 看到的是 /workspace（容器内路径）
      // - 实际上对应宿主机 /data/claws/workspaces/users/{userId}
      // - pathSandbox.ts 已经限制了路径，Agent 只能访问 /workspace
      //
      // 架构原则：工作空间按用户隔离，不按会话隔离
      const hostWorkspacePath = `${this.config.hostWorkspacePath}/users/${userId}`

      // 确保宿主机目录存在
      try {
        await fs.mkdir(hostWorkspacePath, { recursive: true })
        await this.ensurePathPermissions(hostWorkspacePath)
      } catch (error) {
        console.warn(`[ContainerOrchestrator] 创建宿主机工作空间目录失败（非致命）: ${error}`)
      }
      // ========== Bind Mount 结束 ==========

      // 使用统一方法构建 Docker 命令
      const dockerCmd = this.buildDockerRunCommand({
        containerName,
        port,
        workspacePath: hostWorkspacePath,
        resourceArgs,
        userId,
        userTier: tier,
        quota: {
          storageQuotaMB: quota.storageQuotaMB,
          maxSessions: quota.maxSessions,
          maxPtyProcesses: quota.maxPtyProcesses,
          maxFiles: quota.maxFiles,
          maxFileSizeMB: quota.maxFileSizeMB
        }
      })

      console.log(`[ContainerOrchestrator] 创建用户容器 (等级: ${tier}): ${dockerCmd}`)

      const { stdout } = await execAsync(dockerCmd)
      const containerId = stdout.trim()

      const instance: ContainerInstance = {
        containerId,
        containerName,
        hostPort: port,
        status: 'creating',
        assignedUserId: userId,
        createdAt: new Date(),
        lastActivityAt: new Date()
      }

      // 使用重试机制等待容器就绪（最多等待90秒）
      const maxWaitMs = 90000
      const retryIntervalMs = 3000
      const startTime = Date.now()
      let healthy = false

      while (Date.now() - startTime < maxWaitMs) {
        // 检查容器是否还存在
        try {
          await execAsync(`docker inspect ${containerId}`)
        } catch {
          instance.status = 'error'
          return {
            success: false,
            error: '容器在启动过程中消失',
            code: 'CONTAINER_DISAPPEARED'
          }
        }

        // 验证容器健康状态
        healthy = await this.checkContainerHealth(containerId)
        if (healthy) {
          instance.status = 'running'
          break
        }

        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, retryIntervalMs))
      }

      if (!healthy) {
        instance.status = 'error'
        return {
          success: false,
          error: '容器启动超时（超过90秒）',
          code: 'HEALTH_CHECK_TIMEOUT'
        }
      }

      return { success: true, data: instance }

    } catch (error) {
      console.error(`[ContainerOrchestrator] 创建容器失败:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建容器失败',
        code: 'CREATE_FAILED'
      }
    }
  }

  /**
   * 按名称移除残留容器（不触发完整销毁流程）
   * @param containerName 容器名称
   */
  async removeContainerByName(containerName: string): Promise<void> {
    try {
      await execAsync(`docker rm -f ${containerName}`)
    } catch (error) {
      console.warn(`[ContainerOrchestrator] 清理残留容器失败: ${containerName}`, error)
    }
  }

  /**
   * 休眠容器（用户离开时调用）
   * 使用 docker pause 冻结容器进程，CPU 占用降为 0
   * 保留所有状态：文件、环境、进程、内存数据
   * 
   * @param containerId 容器 ID
   * @returns 是否成功
   */
  async pauseContainer(containerId: string): Promise<boolean> {
    try {
      console.log(`[ContainerOrchestrator] 休眠容器: ${containerId}`)
      await execAsync(`docker pause ${containerId}`)
      console.log(`[ContainerOrchestrator] 容器已休眠: ${containerId}`)
      return true
    } catch (error) {
      console.error(`[ContainerOrchestrator] 休眠容器失败 (${containerId}):`, error)
      return false
    }
  }

  /**
   * 恢复容器（用户回来时调用）
   * 使用 docker unpause 秒级恢复容器
   * 所有状态丝毫不丢
   * 
   * @param containerId 容器 ID
   * @returns 是否成功
   */
  async unpauseContainer(containerId: string): Promise<boolean> {
    try {
      console.log(`[ContainerOrchestrator] 恢复容器: ${containerId}`)
      await execAsync(`docker unpause ${containerId}`)
      console.log(`[ContainerOrchestrator] 容器已恢复: ${containerId}`)
      return true
    } catch (error) {
      console.error(`[ContainerOrchestrator] 恢复容器失败 (${containerId}):`, error)
      return false
    }
  }

  /**
   * 检查容器是否处于暂停状态
   */
  async isContainerPaused(containerId: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `docker inspect --format='{{.State.Status}}' ${containerId}`
      )
      return stdout.trim() === 'paused'
    } catch {
      return false
    }
  }

  /**
   * 销毁容器（支持幂等性，防止重复销毁）
   * @param containerId 容器ID
   * @returns 是否成功
   */
  async destroyContainer(containerId: string): Promise<boolean> {
    try {
      // ========== 幂等性检查 1：容器是否正在销毁中 ==========
      if (destroyingContainers.has(containerId)) {
        console.log(`[ContainerOrchestrator] 容器 ${containerId} 正在销毁中，跳过重复调用（幂等性保护）`)

        const maxWaitMs = 30000
        const start = Date.now()
        while (destroyingContainers.has(containerId) && Date.now() - start < maxWaitMs) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }

        if (destroyingContainers.has(containerId)) {
          console.warn(`[ContainerOrchestrator] 容器 ${containerId} 销毁超时，但已接受幂等性请求`)
        }

        return true
      }

      // ========== 幂等性检查 2：容器是否已不存在 ==========
      let containerPort: number | undefined
      for (const mapping of this.userMappings.values()) {
        if (mapping.container.containerId === containerId) {
          containerPort = mapping.container.hostPort
          break
        }
      }

      let containerExists = true
      try {
        await execAsync(`docker inspect ${containerId}`)
      } catch (error) {
        console.warn(`[ContainerOrchestrator] 容器不存在，跳过销毁: ${containerId}`)
        containerExists = false
      }

      if (!containerExists) {
        for (const [userId, mapping] of this.userMappings) {
          if (mapping.container.containerId === containerId) {
            this.userMappings.delete(userId)
            break
          }
        }
        return true
      }

      // ========== 标记为正在销毁（防止并发重复调用） ==========
      destroyingContainers.add(containerId)

      try {
        // 销毁前：尝试保存工作快照
        await this.createSnapshotBeforeDestroy(containerId)

        console.log(`[ContainerOrchestrator] 停止容器: ${containerId}`)
        await execAsync(`docker stop -t 5 ${containerId}`)

        console.log(`[ContainerOrchestrator] 删除容器: ${containerId}`)
        await execAsync(`docker rm ${containerId}`)

        for (const [userId, mapping] of this.userMappings) {
          if (mapping.container.containerId === containerId) {
            this.userMappings.delete(userId)
            break
          }
        }

        console.log(`[ContainerOrchestrator] 容器已销毁: ${containerId}`)
        return true

      } finally {
        destroyingContainers.delete(containerId)
      }

    } catch (error) {
      console.error(`[ContainerOrchestrator] 销毁容器失败 (${containerId}):`, error)
      for (const [userId, mapping] of this.userMappings) {
        if (mapping.container.containerId === containerId) {
          this.userMappings.delete(userId)
          break
        }
      }
      destroyingContainers.delete(containerId)
      return false
    }
  }

  /**
   * 在容器销毁前创建快照（使用增强型快照服务）
   */
  private async createSnapshotBeforeDestroy(containerId: string): Promise<void> {
    try {
      // 查找对应的用户信息
      let userId: string | null = null

      // 在 userMappings 中查找（用户分配的容器）
      for (const [uid, mapping] of this.userMappings) {
        if (mapping.container.containerId === containerId) {
          userId = uid
          break
        }
      }

      // 如果没有找到对应的用户，跳过快照
      if (!userId) {
        console.log(`[ContainerOrchestrator] 无法找到容器对应的用户，跳过快照: ${containerId}`)
        return
      }

      // 使用增强型快照服务
      const { getEnhancedSnapshotService } = await import('../services/enhancedSnapshotService')
      const snapshotService = getEnhancedSnapshotService()

      // 获取该用户的最新会话（用于快照关联）
      const { getDB } = await import('../db/connection')
      const db = getDB()
      const [recentSession] = await db.query(
        'SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
        [userId]
      )

      if (!recentSession || recentSession.length === 0) {
        console.log(`[ContainerOrchestrator] 用户 ${userId} 没有会话记录，跳过快照`)
        return
      }

      const sessionId = recentSession[0].id

      // 获取上次快照作为基础（用于增量备份）
      const lastSnapshot = await snapshotService.getLatestSnapshot(sessionId)

      const metadata = await snapshotService.createSnapshot({
        userId,
        sessionId,
        containerId,
        snapshotType: 'final',
        baseSnapshotId: lastSnapshot?.id,
        includeGitState: true,
        includeExecutionState: true
      })

      console.log(`[ContainerOrchestrator] 容器销毁前快照已保存: ${containerId}, 快照ID=${metadata.id}, 大小=${metadata.sizeBytes}`)
    } catch (error) {
      console.error(`[ContainerOrchestrator] 创建销毁前快照失败 (${containerId}):`, error)
    }
  }

  /**
   * 检查容器健康状态
   * @param containerId 容器ID或名称
   * @returns 是否健康
   */
  async checkContainerHealth(containerId: string): Promise<boolean> {
    try {
      // 检查容器是否存在
      try {
        await execAsync(`docker inspect ${containerId}`)
      } catch (error) {
        console.warn(`[ContainerOrchestrator] 容器不存在: ${containerId}`)
        return false
      }

      // 先检查容器运行状态
      const { stdout: inspectOutput } = await execAsync(
        `docker inspect --format='{{.State.Running}}' ${containerId}`
      )

      if (inspectOutput.trim() !== 'true') {
        return false
      }

      // 获取容器映射的端口
      const container = this.findContainerById(containerId)
      if (!container) {
        return false
      }

      // 使用Docker exec在容器内部执行健康检查
      // 这样可以避免网络映射问题
      try {
        const { stdout: healthOutput } = await execAsync(
          `docker exec ${containerId} curl -s -o /dev/null -w "%{http_code}" http://localhost:${getWorkerInternalPort()}/internal/health || echo "000"`
        )
        const statusCode = parseInt(healthOutput.trim(), 10)
        // 只要HTTP服务器能够响应（状态码小于500），就认为容器健康
        if (statusCode > 0 && statusCode < 500) {
          return true
        }
      } catch (execError) {
        // Docker exec失败，容器可能还在启动中
        console.warn(`[ContainerOrchestrator] 容器 ${containerId} 健康检查Docker exec失败`)
      }

      return false

    } catch (error) {
      console.error(`[ContainerOrchestrator] 健康检查异常 (${containerId}):`, error)
      return false
    }
  }

  /**
   * 从数据库加载用户映射
   */
  private async loadUserMappingsFromDB(): Promise<void> {
    try {
      const pool = getPool()
      if (!pool) {
        console.log('[ContainerOrchestrator] 数据库不可用，跳过加载用户映射')
        return
      }

      const [rows] = await pool.execute(
        `SELECT * FROM user_worker_mappings WHERE status = 'active' ORDER BY last_activity_at DESC`
      )

      const dbRows = rows as any[]
      if (dbRows.length === 0) {
        console.log('[ContainerOrchestrator] 数据库中没有活跃的用户映射')
        return
      }

      for (const row of dbRows) {
        // 检查内存中是否已有映射
        if (this.userMappings.has(row.user_id)) {
          console.log(`[ContainerOrchestrator] 用户 ${row.user_id} 已有映射，跳过数据库加载`)
          continue
        }

        // 检查容器是否还在运行
        try {
          const { stdout } = await execAsync(
            `docker ps --filter "id=${row.container_id}" --filter "status=running" --format "{{.ID}}|{{.Names}}|{{.Ports}}"`
          )

          if (!stdout.trim()) {
            console.log(`[ContainerOrchestrator] 用户 ${row.user_id} 的容器 ${row.container_id} 已停止，跳过`)
            // 更新数据库状态
            await pool.execute(
              `UPDATE user_worker_mappings SET status = 'released' WHERE id = ?`,
              [row.id]
            )
            continue
          }

          const [containerId, containerName, ports] = stdout.trim().split('|')
          const portMatch = ports.match(/0\.0\.0\.0:(\d+)->(3000|4000)\/tcp/)
          if (!portMatch) {
            console.log(`[ContainerOrchestrator] 无法解析容器 ${containerId} 的端口`)
            continue
          }

          const hostPort = parseInt(portMatch[1], 10)

          // 创建映射
          const mapping: UserContainerMapping = {
            userId: row.user_id,
            container: {
              containerId: row.container_id,
              containerName: row.container_name,
              hostPort: row.host_port || hostPort,
              status: 'running',
              assignedUserId: row.user_id,
              createdAt: new Date(row.created_at),
              lastActivityAt: new Date(row.last_activity_at),
            },
            assignedAt: new Date(row.assigned_at),
            sessionCount: row.session_count || 0,
            lastActivityAt: new Date(row.last_activity_at),
          }

          this.userMappings.set(row.user_id, mapping)
          console.log(`[ContainerOrchestrator] 从数据库恢复用户 ${row.user_id} 的映射：${containerName}`)
        } catch (error) {
          console.error(`[ContainerOrchestrator] 检查容器 ${row.container_id} 状态失败:`, error)
        }
      }

      console.log(`[ContainerOrchestrator] 从数据库恢复了 ${this.userMappings.size} 个用户映射`)
    } catch (error) {
      console.error('[ContainerOrchestrator] 从数据库加载用户映射失败:', error)
    }
  }

  /**
   * 扫描Docker中已运行的用户容器并恢复映射（用于Master重启后恢复旧版本未持久化的容器）
   */
  private async scanAndRecoverUserContainers(): Promise<void> {
    try {
      // 获取所有正在运行的用户容器
      const { stdout } = await execAsync(
        `docker ps --filter "name=claude-user-" --filter "status=running" --format "{{.ID}}|{{.Names}}|{{.Ports}}"`
      )

      if (!stdout.trim()) {
        console.log('[ContainerOrchestrator] 未发现已运行的用户容器')
        return
      }

      const containers = stdout.trim().split('\n')
      let recoveredCount = 0

      for (const containerLine of containers) {
        const parts = containerLine.split('|')
        if (parts.length < 3) continue

        const [containerId, containerName, ports] = parts

        if (!containerId || !containerName) continue

        // 解析端口映射
        const portMatch = ports.match(/0\.0\.0\.0:(\d+)->(3000|4000)\/tcp/)
        if (!portMatch) {
          console.warn(`[ContainerOrchestrator] 无法解析容器 ${containerName} 的端口`)
          continue
        }

        const hostPort = parseInt(portMatch[1], 10)

        // 从环境变量中提取userId、username和tier
        let userId: string | undefined
        let username: string | undefined
        let userTier: UserTier = UserTier.REGULAR

        try {
          const { stdout: envOutput } = await execAsync(
            `docker inspect --format '{{json .Config.Env}}' ${containerId}`
          )
          const envVars: string[] = JSON.parse(envOutput.trim())

          for (const env of envVars) {
            if (env.startsWith('TENANT_USER_ID=')) {
              userId = env.substring('TENANT_USER_ID='.length)
            } else if (env.startsWith('USER_USERNAME=')) {
              username = env.substring('USER_USERNAME='.length)
            } else if (env.startsWith('USER_TIER=')) {
              const tier = env.substring('USER_TIER='.length)
              userTier = tier as UserTier
            }
          }
        } catch (error) {
          console.warn(`[ContainerOrchestrator] 解析容器 ${containerName} 环境变量失败`)
          continue
        }

        // 如果没有找到userId，跳过
        if (!userId) {
          console.warn(`[ContainerOrchestrator] 容器 ${containerName} 中未找到TENANT_USER_ID环境变量`)
          continue
        }

        // 检查内存中是否已有映射
        if (this.userMappings.has(userId)) {
          console.log(`[ContainerOrchestrator] 用户 ${userId} 已有映射，跳过恢复`)
          continue
        }

        // 创建映射
        const mapping: UserContainerMapping = {
          userId,
          username,
          userTier,
          container: {
            containerId,
            containerName,
            hostPort,
            status: 'running',
            assignedUserId: userId,
            createdAt: new Date(), // 无法从Docker获取真实创建时间
            lastActivityAt: new Date(),
          },
          assignedAt: new Date(),
          sessionCount: 0,
          lastActivityAt: new Date(),
        }

        this.userMappings.set(userId, mapping)
        recoveredCount++

        // 保存到数据库（如果可用）
        try {
          await this.saveUserMappingToDB(mapping)
        } catch (error) {
          console.warn(`[ContainerOrchestrator] 保存恢复的映射到数据库失败: ${error}`)
        }

        console.log(`[ContainerOrchestrator] 从Docker恢复用户容器: ${userId} -> ${containerName} (端口: ${hostPort})`)
      }

      if (recoveredCount > 0) {
        console.log(`[ContainerOrchestrator] 成功从Docker恢复 ${recoveredCount} 个用户容器映射`)
      }
    } catch (error) {
      console.error('[ContainerOrchestrator] 扫描并恢复用户容器失败:', error)
    }
  }

  /**
   * 扫描Docker中指定用户的已运行容器并恢复映射
   * @param userId 用户ID
   * @returns 恢复的映射，如果未找到则返回 undefined
   */
  async scanAndRecoverUserContainer(userId: string): Promise<UserContainerMapping | undefined> {
    try {
      // 获取所有正在运行的用户容器
      const { stdout } = await execAsync(
        `docker ps --filter "name=claude-user-" --filter "status=running" --format "{{.ID}}|{{.Names}}|{{.Ports}}"`
      )

      if (!stdout.trim()) {
        return undefined
      }

      const containers = stdout.trim().split('\n')

      for (const containerLine of containers) {
        const parts = containerLine.split('|')
        if (parts.length < 3) continue

        const [containerId, containerName, ports] = parts

        if (!containerId || !containerName) continue

        // 从环境变量中提取userId
        let foundUserId: string | undefined
        let username: string | undefined
        let userTier: UserTier = UserTier.REGULAR

        try {
          const { stdout: envOutput } = await execAsync(
            `docker inspect --format '{{json .Config.Env}}' ${containerId}`
          )
          const envVars: string[] = JSON.parse(envOutput.trim())

          for (const env of envVars) {
            if (env.startsWith('TENANT_USER_ID=')) {
              foundUserId = env.substring('TENANT_USER_ID='.length)
            } else if (env.startsWith('USER_USERNAME=')) {
              username = env.substring('USER_USERNAME='.length)
            } else if (env.startsWith('USER_TIER=')) {
              const tier = env.substring('USER_TIER='.length)
              userTier = tier as UserTier
            }
          }
        } catch {
          continue
        }

        // 检查是否匹配目标用户
        if (!foundUserId || foundUserId !== userId) {
          continue
        }

        // 解析端口映射
        const portMatch = ports.match(/0\.0\.0\.0:(\d+)->(3000|4000)\/tcp/)
        if (!portMatch) {
          console.warn(`[ContainerOrchestrator] 无法解析容器 ${containerName} 的端口`)
          continue
        }

        const hostPort = parseInt(portMatch[1], 10)

        // 检查内存中是否已有映射
        if (this.userMappings.has(userId)) {
          return this.userMappings.get(userId)
        }

        // 创建映射
        const mapping: UserContainerMapping = {
          userId,
          username,
          userTier,
          container: {
            containerId,
            containerName,
            hostPort,
            status: 'running',
            assignedUserId: userId,
            createdAt: new Date(),
            lastActivityAt: new Date(),
          },
          assignedAt: new Date(),
          sessionCount: 0,
          lastActivityAt: new Date(),
        }

        this.userMappings.set(userId, mapping)

        // 保存到数据库
        try {
          await this.saveUserMappingToDB(mapping)
        } catch (error) {
          console.warn(`[ContainerOrchestrator] 保存恢复的映射到数据库失败: ${error}`)
        }

        console.log(`[ContainerOrchestrator] 从Docker恢复用户容器: ${userId} -> ${containerName} (端口: ${hostPort})`)
        return mapping
      }

      return undefined
    } catch (error) {
      console.error(`[ContainerOrchestrator] 扫描用户 ${userId} 的容器失败:`, error)
      return undefined
    }
  }

  /**
   * 保存用户映射到数据库
   */
  private async saveUserMappingToDB(mapping: UserContainerMapping): Promise<void> {
    try {
      const pool = getPool()
      if (!pool) {
        console.warn('[ContainerOrchestrator] 数据库不可用，跳过保存用户映射')
        return
      }

      const mappingId = uuidv4()
      await pool.execute(
        `INSERT INTO user_worker_mappings 
         (id, user_id, container_id, container_name, host_port, assigned_at, last_activity_at, session_count, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE 
         container_id = VALUES(container_id),
         container_name = VALUES(container_name),
         host_port = VALUES(host_port),
         last_activity_at = VALUES(last_activity_at),
         session_count = VALUES(session_count),
         updated_at = CURRENT_TIMESTAMP`,
        [
          mappingId,
          mapping.userId,
          mapping.container.containerId,
          mapping.container.containerName,
          mapping.container.hostPort,
          mapping.assignedAt,
          mapping.lastActivityAt,
          mapping.sessionCount,
        ]
      )
      console.log(`[ContainerOrchestrator] 用户映射已保存到数据库：${mapping.userId} -> ${mapping.container.containerName}`)
    } catch (error) {
      console.error('[ContainerOrchestrator] 保存用户映射到数据库失败:', error)
    }
  }

  /**
   * 更新数据库中的用户映射状态
   */
  private async updateUserMappingStatusInDB(userId: string, status: 'active' | 'released' | 'error'): Promise<void> {
    try {
      const pool = getPool()
      if (!pool) return

      await pool.execute(
        `UPDATE user_worker_mappings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        [status, userId]
      )
      console.log(`[ContainerOrchestrator] 用户映射状态已更新：${userId} -> ${status}`)
    } catch (error) {
      console.error('[ContainerOrchestrator] 更新用户映射状态失败:', error)
    }
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
    // 先从内存获取
    let mapping = this.userMappings.get(userId)
    if (mapping) {
      return mapping
    }

    // 内存中没有，尝试从数据库加载
    try {
      const pool = getPool()
      if (!pool) {
        return undefined
      }

      const [rows] = await pool.execute(
        `SELECT * FROM user_worker_mappings WHERE user_id = ? AND status = 'active' LIMIT 1`,
        [userId]
      )

      const dbRows = rows as any[]
      if (dbRows.length === 0) {
        return undefined
      }

      const row = dbRows[0]

      // 检查容器是否还在运行
      try {
        const { stdout } = await execAsync(
          `docker ps --filter "id=${row.container_id}" --filter "status=running" --format "{{.ID}}|{{.Names}}|{{.Ports}}"`
        )

        if (!stdout.trim()) {
          console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器 ${row.container_id} 已停止`)
          // 更新数据库状态
          await pool.execute(
            `UPDATE user_worker_mappings SET status = 'released' WHERE user_id = ?`,
            [userId]
          )
          return undefined
        }

        const [containerId, containerName, ports] = stdout.trim().split('|')
        const portMatch = ports.match(/0\.0\.0\.0:(\d+)->(3000|4000)\/tcp/)
        if (!portMatch) {
          return undefined
        }

        const hostPort = parseInt(portMatch[1], 10)

        // 创建映射
        mapping = {
          userId: row.user_id,
          container: {
            containerId: row.container_id,
            containerName: row.container_name,
            hostPort: row.host_port || hostPort,
            status: 'running',
            assignedUserId: row.user_id,
            createdAt: new Date(row.created_at),
            lastActivityAt: new Date(row.last_activity_at),
          },
          assignedAt: new Date(row.assigned_at),
          sessionCount: row.session_count || 0,
          lastActivityAt: new Date(row.last_activity_at),
        }

        this.userMappings.set(userId, mapping)
        console.log(`[ContainerOrchestrator] 从数据库加载用户 ${userId} 的映射：${containerName}`)
        return mapping
      } catch (error) {
        console.error(`[ContainerOrchestrator] 检查容器状态失败:`, error)
        return undefined
      }
    } catch (error) {
      console.error('[ContainerOrchestrator] 从数据库加载用户映射失败:', error)
      return undefined
    }
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
   * 关闭编排器（停止所有定时任务，清理资源）
   */
  async shutdown(): Promise<void> {
    console.log('[ContainerOrchestrator] 正在关闭编排器...')

    // 停止定时任务（healthCheckTimer 现在是 setTimeout）
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer)
      this.healthCheckTimer = null
    }

    if (this.dockerCleanupTimer) {
      clearTimeout(this.dockerCleanupTimer)
      this.dockerCleanupTimer = null
    }

    // 注意：不主动销毁用户容器，因为可能还有活跃会话
    // 用户容器会在下次健康检查时根据状态决定是否休眠

    console.log('[ContainerOrchestrator] 编排器已关闭')
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 确保路径具有正确的权限（跨平台兼容）
   * @param targetPath 目标路径
   */
  private async ensurePathPermissions(targetPath: string): Promise<void> {
    try {
      if (process.platform === 'win32') {
        // Windows: 使用 icacls 设置权限
        // 允许 Everyone 完全控制（生产环境应限制为特定用户）
        await execAsync(`icacls "${targetPath}" /grant Everyone:F /T`)
        console.log(`[ContainerOrchestrator] 已设置目录权限 (Windows): ${targetPath}`)
      } else {
        // Linux/Mac: 使用 chmod
        await execAsync(`chmod 755 "${targetPath}"`)
        console.log(`[ContainerOrchestrator] 已设置目录权限: ${targetPath}`)
      }
    } catch (error) {
      console.warn(`[ContainerOrchestrator] 设置目录权限失败（非致命）: ${targetPath}`, error)
    }
  }

  /**
   * 构建 Docker 容器创建命令（统一方法）
   * @param config 容器配置
   * @returns docker run 命令字符串
   */
  private buildDockerRunCommand(config: {
    containerName: string
    port: number
    workspacePath?: string | null
    resourceArgs: string[]
    userId?: string
    userTier?: UserTier
    quota?: {
      storageQuotaMB: number
      maxSessions: number
      maxPtyProcesses: number
      maxFiles: number
      maxFileSizeMB: number
    }
  }): string {
    const { containerName, port, workspacePath, resourceArgs, userId, userTier, quota } = config

    // 基础安全加固参数
    // 使用 --privileged 提供最高权限，确保 PTY 功能正常工作
    const securityArgs = [
      '--privileged',
      '--tty',
      '--pids-limit 100',
      '--ulimit nproc=100:100',
      '--ulimit nofile=1024:1024'
    ]

    // 基础环境变量
    // 注意：LLM 服务统一在 Master 中，Worker 通过 MASTER_INTERNAL_TOKEN 访问 Master 的 LLM API
    const baseEnvVars = [
      `-e CONTAINER_ROLE=worker`,
      `-e NODE_ENV=production`,
      `-e MASTER_INTERNAL_TOKEN=${process.env.MASTER_INTERNAL_TOKEN || ''}`,
      `-e MASTER_HOST=${process.env.MASTER_HOST || 'claude-backend-master'}`,
      `-e MASTER_PORT=${process.env.MASTER_PORT || '3000'}`,
      `-e HOST=0.0.0.0`,
      `-e PORT=4000`,
      `-e WORKER_INTERNAL_PORT=4000`,
      `-e PTY_ENABLED=${process.env.PTY_ENABLED || 'true'}`
    ]

    // 用户相关环境变量（使用配额配置）
    const userEnvVars = userId
      ? [
          `-e TENANT_USER_ID=${userId}`,
          `-e WORKSPACE_BASE_DIR=/workspace`,
          `-e USER_STORAGE_QUOTA_MB=${quota?.storageQuotaMB || 500}`,
          `-e USER_SESSION_LIMIT=${quota?.maxSessions || 5}`,
          `-e USER_PTY_LIMIT=${quota?.maxPtyProcesses || 2}`,
          `-e MAX_FILES_PER_USER=${quota?.maxFiles || 500}`,
          `-e MAX_FILE_SIZE_MB=${quota?.maxFileSizeMB || 10}`
        ]
      : [
          `-e WORKSPACE_BASE_DIR=/workspace`,
          `-e USER_STORAGE_QUOTA_MB=${quota?.storageQuotaMB || 200}`,
          `-e USER_SESSION_LIMIT=${quota?.maxSessions || 5}`,
          `-e USER_PTY_LIMIT=${quota?.maxPtyProcesses || 2}`,
          `-e MAX_FILES_PER_USER=${quota?.maxFiles || 100}`,
          `-e MAX_FILE_SIZE_MB=${quota?.maxFileSizeMB || 10}`
        ]

    // Bind Mount 配置
    // 安全修复：只挂载当前用户的工作目录，避免路径重叠和覆盖问题
    //
    // 设计原则：
    // - 每个容器只有一个主要工作目录挂载到 /workspace
    // - 避免嵌套挂载导致的路径冲突
    // - 实现用户间完全隔离
    // - 热池容器不挂载工作空间（workspacePath 为 null）
    const bindMounts = []

    // 挂载用户工作空间目录
    if (workspacePath) {
      bindMounts.push(`-v ${workspacePath}:/workspace`)
    }

    // 开发模式说明：
    // 代码修改后需要重新构建镜像：docker-compose build worker
    // Bind Mount 在 Windows Docker Desktop 上不稳定，暂不使用

    // 构建完整命令
    const dockerCmd = [
      'docker run -d',
      `--name ${containerName}`,
      `-p ${port}:4000`,
      `--network ${this.config.networkName}`,
      '--restart unless-stopped',
      ...securityArgs,
      ...resourceArgs,
      ...bindMounts,
      ...baseEnvVars,
      ...userEnvVars,
      this.config.imageName
    ].join(' ')

    return dockerCmd
  }

  /**
   * 检查Docker服务是否可用
   */
  private async checkDockerAvailability(): Promise<boolean> {
    try {
      // 尝试多种方式检测Docker
      // 1. 直接执行docker命令
      await execAsync('docker info')
      return true
    } catch (error) {
      console.warn('[ContainerOrchestrator] Docker命令执行失败:', error)
      
      try {
        // 2. 检查Docker socket文件是否存在
        const fs = require('fs')
        const socketPath = '/var/run/docker.sock'
        if (fs.existsSync(socketPath)) {
          console.log('[ContainerOrchestrator] Docker socket存在，假设Docker可用')
          return true
        }
      } catch (error) {
        console.warn('[ContainerOrchestrator] 检查Docker socket失败:', error)
      }
      
      return false
    }
  }

  /**
   * 检查并创建Docker网络（如果不存在）
   */
  private async ensureNetworkExists(): Promise<boolean> {
    try {
      // 检查网络是否存在
      await execAsync(`docker network inspect ${this.config.networkName}`)
      console.log(`[ContainerOrchestrator] 网络 ${this.config.networkName} 已存在`)
      return true
    } catch (error) {
      // 网络不存在，尝试创建网络
      try {
        await execAsync(`docker network create ${this.config.networkName}`)
        console.log(`[ContainerOrchestrator] 网络 ${this.config.networkName} 创建成功`)
        return true
      } catch (createError: any) {
        // 如果创建失败是因为网络已存在（并发情况），也认为是成功的
        if (createError?.message?.includes('already exists')) {
          console.log(`[ContainerOrchestrator] 网络 ${this.config.networkName} 已存在（并发创建）`)
          return true
        }
        // 如果是 Docker 客户端版本问题，记录警告但继续运行
        // 因为网络可能已经在 docker-compose 中创建
        console.warn(`[ContainerOrchestrator] 创建网络 ${this.config.networkName} 失败:`, createError)
        console.warn(`[ContainerOrchestrator] 将继续运行，假设网络已由 docker-compose 创建`)
        return true
      }
    }
  }

  /**
   * 分配下一个可用端口（带冲突检测）
   */
  private async allocatePort(): Promise<number> {
    const maxPort = this.config.basePort + 200 // 最大尝试端口范围

    for (let offset = 0; offset < 200; offset++) {
      const port = this.config.basePort + offset

      // 检查端口是否已被系统占用
      const isAvailable = await this.isPortAvailable(port)
      if (isAvailable) {
        console.log(`[ContainerOrchestrator] 成功分配端口: ${port}`)
        return port
      }

      console.warn(`[ContainerOrchestrator] 端口 ${port} 已被占用，尝试下一个端口`)
    }

    throw new Error(`无法分配可用端口，范围 ${this.config.basePort}-${maxPort} 已被耗尽`)
  }

  /**
   * 检查端口是否可用（使用多种方法）
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    try {
      // 方法1: 使用 net 模块检查本地端口
      const net = require('net')
      const isLocalAvailable = await new Promise<boolean>((resolve) => {
        const server = net.createServer()
        
        server.once('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            resolve(false)
          } else {
            resolve(true)
          }
        })
        
        server.once('listening', () => {
          server.close()
          resolve(true)
        })
        
        server.listen(port, '0.0.0.0')
      })
      
      if (!isLocalAvailable) {
        return false
      }
      
      // 方法2: 检查 Docker 是否已在使用该端口
      try {
        const { stdout } = await execAsync(`docker ps --filter "publish=${port}" --format "{{.Names}}"`)
        if (stdout.trim()) {
          console.warn(`[ContainerOrchestrator] 端口 ${port} 已被 Docker 容器使用: ${stdout.trim()}`)
          return false
        }
      } catch {
        // 命令失败，继续检查
      }
      
      // 方法3: 检查系统中是否有进程在监听该端口
      try {
        const isWindows = process.platform === 'win32'
        if (isWindows) {
          // Windows: 使用 netstat 检查
          const { stdout } = await execAsync(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`)
          if (stdout.trim()) {
            console.warn(`[ContainerOrchestrator] 端口 ${port} 已被系统进程占用`)
            return false
          }
        } else {
          // Linux/Mac: 使用 ss 或 netstat 检查
          try {
            const { stdout } = await execAsync(`ss -tln | grep ":${port} " || netstat -tln | grep ":${port} "`)
            if (stdout.trim()) {
              console.warn(`[ContainerOrchestrator] 端口 ${port} 已被系统进程占用`)
              return false
            }
          } catch {
            // 命令失败，假设端口可用
          }
        }
      } catch {
        // 命令失败，继续
      }
      
      return true
    } catch (error) {
      console.error(`[ContainerOrchestrator] 检查端口 ${port} 状态时出错:`, error)
      // 出错时保守处理，假设端口不可用
      return false
    }
  }

  /**
   * 根据ID查找容器实例
   */
  private findContainerById(containerId: string): ContainerInstance | undefined {
    // 在用户映射中查找
    for (const mapping of this.userMappings.values()) {
      if (mapping.container.containerId === containerId) {
        return mapping.container
      }
    }

    return undefined
  }

  /**
   * 通过名称获取容器信息
   */
  private async getContainerInfoByName(name: string): Promise<ContainerInstance | null> {
    try {
      const { stdout } = await execAsync(
        `docker inspect --format='{{.Id}} {{.State.Status}}' ${name}`
      )
      const [id, status] = stdout.trim().split(' ')

      // 获取端口映射
      const { stdout: portOutput } = await execAsync(
        `docker port ${name} 3000`
      )
      const portMatch = portOutput.match(/:(\d+)/)
      const port = portMatch ? parseInt(portMatch[1], 10) : 0

      return {
        containerId: id,
        containerName: name,
        hostPort: port,
        status: status as ContainerInstance['status'],
        createdAt: new Date(),
        lastActivityAt: new Date()
      }

    } catch {
      return null
    }
  }

  /**
   * 检查容器是否存在
   */
  private async containerExists(name: string): Promise<boolean> {
    try {
      await execAsync(`docker inspect ${name}`)
      return true
    } catch {
      return false
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
        console.warn(`[ContainerOrchestrator] 重启容器失败：找不到用户 ${userId} 的映射`)
        return false
      }

      const containerId = mapping.container.containerId

      // 检查容器是否仍然存在
      const exists = await this.containerExists(containerId)
      if (!exists) {
        console.warn(`[ContainerOrchestrator] 重启容器失败：容器 ${containerId} 不存在`)
        return false
      }

      // 尝试重启容器
      console.log(`[ContainerOrchestrator] 正在重启容器: ${containerId}`)
      await execAsync(`docker restart -t 10 ${containerId}`)

      // 等待容器就绪
      await new Promise(resolve => setTimeout(resolve, 5000))

      // 验证容器健康状态
      const isHealthy = await this.checkContainerHealth(containerId)
      if (isHealthy) {
        mapping.container.lastActivityAt = new Date()
        return true
      }

      return false
    } catch (error) {
      console.error(`[ContainerOrchestrator] 重启用户容器失败 (${userId}):`, error)
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
        console.warn(`[ContainerOrchestrator] 重新分配失败：找不到用户 ${userId} 的映射`)
        return
      }

      const oldContainerId = mapping.container.containerId

      // 销毁旧容器
      console.log(`[ContainerOrchestrator] 销毁旧容器: ${oldContainerId}`)
      await this.destroyContainer(oldContainerId)

      // 重新分配新容器
      const assignResult = await this.assignContainerToUser(userId)
      if (assignResult.success) {
        console.log(`[ContainerOrchestrator] 用户 ${userId} 已重新分配新容器: ${assignResult.data?.container.containerId}`)
      } else {
        console.error(`[ContainerOrchestrator] 用户 ${userId} 重新分配容器失败: ${assignResult.error}`)
      }
    } catch (error) {
      console.error(`[ContainerOrchestrator] 重新分配容器失败 (${userId}):`, error)
    }
  }

  /**
   * 启动健康检查循环
   */
  private startHealthCheckLoop(): void {
    const healthCheckLoop = async () => {
      try {
        // 检查用户容器（跳过休眠状态的容器）
        for (const [userId, mapping] of this.userMappings) {
          // 跳过休眠状态的容器
          if (mapping.container.status === 'paused') {
            continue
          }

          const isHealthy = await this.checkContainerHealth(mapping.container.containerId)
          if (!isHealthy) {
            console.error(`[ContainerOrchestrator] 用户 ${userId} 的容器不健康，尝试自动恢复...`)
            // 自动恢复：尝试重启容器
            const restarted = await this.restartUserContainer(userId)
            if (restarted) {
              console.log(`[ContainerOrchestrator] 用户 ${userId} 的容器重启成功`)
            } else {
              console.error(`[ContainerOrchestrator] 用户 ${userId} 的容器重启失败，将重新分配`)
              // 重新分配新容器
              await this.reallocateUserContainer(userId)
            }
          }
        }
      } catch (error) {
        console.error('[ContainerOrchestrator] 健康检查循环出错:', error)
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
   * 启动 Docker 系统清理定时任务
   */
  private startDockerCleanupLoop(): void {
    this.dockerCleanupTimer = setInterval(async () => {
      await this.executeDockerCleanup()
    }, this.config.cleanupIntervalMs)
  }

  /**
   * 执行 Docker 系统清理
   * 清理未使用的镜像、停止的容器、孤立卷等
   */
  private async executeDockerCleanup(): Promise<void> {
    if (!this.config.enableAutoCleanup) {
      return
    }

    console.log('[ContainerOrchestrator] 开始执行 Docker 系统清理...')

    try {
      // 检查磁盘空间
      const diskStatus = await this.checkDiskSpace()
      if (diskStatus.critical) {
        console.warn(`[ContainerOrchestrator] 磁盘空间严重不足 (${diskStatus.used}%)，执行紧急清理`)
      }

      let totalReclaimed = 0
      const actions: string[] = []

      // 1. 清理停止的容器
      try {
        const { stdout } = await execAsync('docker container prune -f')
        if (stdout.includes('Total reclaimed space')) {
          const match = stdout.match(/Total reclaimed space:\s*(.+)/)
          if (match) {
            totalReclaimed += this.parseSizeToBytes(match[1])
            actions.push('停止的容器')
          }
        }
        console.log(`[ContainerOrchestrator] 容器清理完成`)
      } catch (error) {
        console.warn(`[ContainerOrchestrator] 清理停止容器失败:`, error)
      }

      // 2. 清理未使用的镜像（可选）
      if (this.config.cleanupUnusedImages) {
        try {
          const { stdout } = await execAsync('docker image prune -f')
          if (stdout.includes('Total reclaimed space')) {
            const match = stdout.match(/Total reclaimed space:\s*(.+)/)
            if (match) {
              totalReclaimed += this.parseSizeToBytes(match[1])
              actions.push('未使用的镜像')
            }
          }
          console.log(`[ContainerOrchestrator] 镜像清理完成`)
        } catch (error) {
          console.warn(`[ContainerOrchestrator] 清理未使用镜像失败:`, error)
        }
      }

      // 3. 清理孤立卷（可选，因为可能丢失用户数据）
      if (this.config.cleanupOrphanedVolumes) {
        try {
          const { stdout } = await execAsync('docker volume prune -f')
          if (stdout.includes('Total reclaimed space')) {
            const match = stdout.match(/Total reclaimed space:\s*(.+)/)
            if (match) {
              totalReclaimed += this.parseSizeToBytes(match[1])
              actions.push('孤立卷')
            }
          }
          console.log(`[ContainerOrchestrator] 卷清理完成`)
        } catch (error) {
          console.warn(`[ContainerOrchestrator] 清理孤立卷失败:`, error)
        }
      }

      // 4. 清理构建缓存
      try {
        const { stdout } = await execAsync('docker builder prune -f')
        if (stdout.includes('Total reclaimed space')) {
          const match = stdout.match(/Total reclaimed space:\s*(.+)/)
          if (match) {
            totalReclaimed += this.parseSizeToBytes(match[1])
            actions.push('构建缓存')
          }
        }
        console.log(`[ContainerOrchestrator] 构建缓存清理完成`)
      } catch (error) {
        console.warn(`[ContainerOrchestrator] 清理构建缓存失败:`, error)
      }

      // 记录清理结果
      if (totalReclaimed > 0) {
        const reclaimedMB = Math.round(totalReclaimed / (1024 * 1024) * 100) / 100
        console.log(`[ContainerOrchestrator] Docker 清理完成: 释放 ${reclaimedMB}MB (${actions.join(', ')})`)
      } else {
        console.log(`[ContainerOrchestrator] Docker 清理完成: 无空间释放`)
      }

    } catch (error) {
      console.error(`[ContainerOrchestrator] Docker 清理执行失败:`, error)
    }
  }

  /**
   * 解析 Docker 返回的大小字符串为字节数
   * @param sizeStr 例如 "123.4MB", "1.2GB"
   */
  private parseSizeToBytes(sizeStr: string): number {
    const match = sizeStr.trim().match(/^([\d.]+)\s*([KMGT]?B?)/i)
    if (!match) return 0

    const value = parseFloat(match[1])
    const unit = match[2].toUpperCase()

    switch (unit) {
      case 'B': return value
      case 'K': case 'KB': return value * 1024
      case 'M': case 'MB': return value * 1024 * 1024
      case 'G': case 'GB': return value * 1024 * 1024 * 1024
      case 'T': case 'TB': return value * 1024 * 1024 * 1024 * 1024
      default: return value
    }
  }

  // ==================== Bind Mount 宿主机关联 ====================

  /**
   * 获取用户工作目录路径
   * 格式: /data/claws/workspaces/users/{userId}
   *
   * 架构原则：工作空间按用户隔离，不按会话隔离
   * 同一用户的所有会话共享同一个工作空间
   */
  getUserWorkspacePath(userId: string): string {
    return `${this.config.hostWorkspacePath}/users/${userId}`
  }

  /**
   * 确保宿主主机工作空间目录存在
   * 在初始化时调用，创建根目录
   */
  private async ensureHostWorkspaceExists(): Promise<void> {
    const workspaceRoot = this.config.hostWorkspacePath

    try {
      // 检查目录是否存在
      await fs.access(workspaceRoot)
      console.log(`[ContainerOrchestrator] 宿主机工作空间目录已存在: ${workspaceRoot}`)
    } catch {
      // 目录不存在，创建它
      console.log(`[ContainerOrchestrator] 创建宿主机工作空间目录: ${workspaceRoot}`)
      await fs.mkdir(workspaceRoot, { recursive: true })
    }

    // 设置目录权限（允许 Docker 容器访问）
    await this.ensurePathPermissions(workspaceRoot)
  }

  /**
   * 为用户创建工作空间目录
   * Master 在分配容器前调用此方法确保目录存在
   *
   * 架构原则：工作空间按用户隔离，不按会话隔离
   */
  async ensureUserWorkspaceExists(userId: string): Promise<{ success: boolean; workspacePath?: string; error?: string }> {
    const workspacePath = this.getUserWorkspacePath(userId)

    try {
      // 创建用户工作空间目录
      await fs.mkdir(workspacePath, { recursive: true })

      // 设置权限（允许容器内的非 root 用户访问）
      await this.ensurePathPermissions(workspacePath)

      console.log(`[ContainerOrchestrator] 已创建用户工作空间: ${workspacePath}`)
      return { success: true, workspacePath }
    } catch (error) {
      console.error(`[ContainerOrchestrator] 创建用户工作空间失败: ${workspacePath}`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create workspace'
      }
    }
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
    try {
      const result = await execAsync(`df -h ${this.config.hostWorkspacePath} | tail -1`)
      const output = result.stdout.trim()

      // 解析 df 输出: Filesystem Size Used Avail Use% Mounted on
      const parts = output.split(/\s+/)
      if (parts.length < 5) {
        return { total: 0, used: 0, available: 0, warning: false, critical: false }
      }

      const total = this.parseSizeToMB(parts[1])
      const usedPercent = parseInt(parts[4].replace('%', ''), 10)
      const available = this.parseSizeToMB(parts[3])
      const used = Math.round(total * (usedPercent / 100))

      return {
        total,
        used,
        available,
        warning: usedPercent >= this.config.diskWarningThreshold,
        critical: usedPercent >= this.config.diskCriticalThreshold,
      }
    } catch (error) {
      console.warn('[ContainerOrchestrator] 检查磁盘空间失败:', error)
      return { total: 0, used: 0, available: 0, warning: false, critical: false }
    }
  }

  /**
   * 解析大小字符串（如 "100G"）为 MB
   */
  private parseSizeToMB(size: string): number {
    const match = size.match(/^([\d.]+)([KMGT]?)/i)
    if (!match) return 0

    const value = parseFloat(match[1])
    const unit = match[2].toUpperCase()

    switch (unit) {
      case 'K': return Math.round(value / 1024)
      case 'M': return value
      case 'G': return Math.round(value * 1024)
      case 'T': return Math.round(value * 1024 * 1024)
      default: return value
    }
  }

  /**
   * 获取工作空间统计信息
   */
  async getWorkspaceStats(): Promise<{
    userCount: number
    totalSizeMB: number
  }> {
    try {
      const workspaceRoot = this.config.hostWorkspacePath

      // 统计用户目录数量
      const users = await fs.readdir(workspaceRoot)
      let totalSize = 0

      for (const userId of users) {
        const userPath = `${workspaceRoot}/users/${userId}`
        try {
          const size = await this.getDirectorySize(userPath)
          totalSize += size
        } catch {
          // 忽略读取错误
        }
      }

      return {
        userCount: users.length,
        totalSizeMB: Math.round(totalSize / (1024 * 1024)),
      }
    } catch (error) {
      console.warn('[ContainerOrchestrator] 获取工作空间统计失败:', error)
      return { userCount: 0, totalSizeMB: 0 }
    }
  }

  /**
   * 获取目录大小（递归）
   */
  private async getDirectorySize(path: string): Promise<number> {
    try {
      const result = await execAsync(`du -sb ${path} | cut -f1`)
      return parseInt(result.stdout.trim(), 10) || 0
    } catch {
      return 0
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

export default ContainerOrchestrator
