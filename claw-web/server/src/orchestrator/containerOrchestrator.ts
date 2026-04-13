/**
 * ContainerOrchestrator - 容器编排调度器
 *
 * 功能：
 * - 容器生命周期管理（创建、启动、停止、销毁）
 * - 用户到容器的映射与分配
 * - 热容器池维护（预启动、获取、归还）
 * - 资源监控与健康检查
 * - 故障检测与自动恢复
 *
 * 使用场景：
 * - Master服务中调度Worker容器
 * - 多用户隔离环境中的容器管理
 * - 动态扩缩容支持
 */

import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs/promises'

const execAsync = promisify(exec)

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
  status: 'running' | 'stopped' | 'creating' | 'error' | 'idle' | 'assigned'
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
  /** 最小热容器数量 */
  minPoolSize: number
  /** 最大热容器数量 */
  maxPoolSize: number
  /** 空闲超时时间（毫秒）*/
  idleTimeoutMs: number
  /** 容器健康检查间隔（毫秒）*/
  healthCheckIntervalMs: number
  /** Docker镜像名称 */
  imageName: string
  /** 网络名称 */
  networkName: string
  /** 基础端口号（从该端口开始分配）*/
  basePort: number
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

// ==================== 默认配置 ====================

const DEFAULT_POOL_CONFIG: Required<PoolConfig> = {
  minPoolSize: parseInt(process.env.CONTAINER_POOL_MIN_SIZE || '3', 10),
  maxPoolSize: parseInt(process.env.CONTAINER_POOL_MAX_SIZE || '10', 10),
  idleTimeoutMs: parseInt(process.env.CONTAINER_IDLE_TIMEOUT_MS || '300000', 10), // 5分钟
  healthCheckIntervalMs: parseInt(process.env.CONTAINER_HEALTH_CHECK_INTERVAL || '15000', 10),
  imageName: process.env.WORKER_IMAGE_NAME || 'claw-web-backend-worker:latest',
  networkName: process.env.DOCKER_NETWORK_NAME || 'claude-network',
  basePort: parseInt(process.env.CONTAINER_BASE_PORT || '3100', 10)
}

// ==================== ContainerOrchestrator 类 ====================

class ContainerOrchestrator {
  private config: Required<PoolConfig>
  private warmPool: Map<string, ContainerInstance> = new Map()
  private userMappings: Map<string, UserContainerMapping> = new Map()
  private portCounter: number = 0
  private healthCheckTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null
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

      // 预启动热容器池（带间隔延迟，避免资源竞争）
      console.log(`[ContainerOrchestrator] 预启动 ${this.config.minPoolSize} 个热容器...`)
      for (let i = 0; i < this.config.minPoolSize; i++) {
        const created = await this.prewarmContainer()
        if (created) {
          this.lastContainerCreationTime = Date.now()
          this.consecutiveFailures = 0
        } else {
          this.consecutiveFailures++
        }
        // 每个容器之间等待10秒，避免同时创建导致资源竞争
        if (i < this.config.minPoolSize - 1) {
          console.log(`[ContainerOrchestrator] 等待10秒后创建下一个容器...`)
          await new Promise(resolve => setTimeout(resolve, 10000))
        }
      }

      // 启动健康检查定时任务
      this.startHealthCheckLoop()

      // 启动空闲清理定时任务
      this.startIdleCleanupLoop()
      console.log('[ContainerOrchestrator] 健康检查和空闲清理已启用')

      console.log(`[ContainerOrchestrator] 初始化完成，当前热池大小: ${this.warmPool.size}`)
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
   * @param userId 用户ID
   * @param username 用户名（可选）
   * @returns 分配结果
   */
  async assignContainerToUser(userId: string, username?: string): Promise<OrchestratorResult<UserContainerMapping>> {
    try {
      // 检查用户是否已有容器
      const existingMapping = this.userMappings.get(userId)
      if (existingMapping) {
        // 更新最后活动时间
        existingMapping.lastActivityAt = new Date()
        existingMapping.container.lastActivityAt = new Date()
        console.log(`[ContainerOrchestrator] 用户 ${userId} 已有容器: ${existingMapping.container.containerId}`)
        return { success: true, data: existingMapping }
      }

      // 尝试从热池获取可用容器
      let container = await this.acquireFromWarmPool()

      if (!container) {
        // 热池为空，创建新容器
        console.log(`[ContainerOrchestrator] 热池为空，为用户 ${userId} 创建新容器...`)
        const createResult = await this.createContainer(userId, username)
        if (!createResult.success) {
          return createResult as OrchestratorResult<UserContainerMapping>
        }
        container = createResult.data!
      }

      // 标记容器为已分配状态
      container.status = 'assigned'
      container.assignedUserId = userId
      container.lastActivityAt = new Date()

      // 创建用户映射
      const mapping: UserContainerMapping = {
        userId,
        container,
        assignedAt: new Date(),
        sessionCount: 0,
        lastActivityAt: new Date()
      }

      this.userMappings.set(userId, mapping)
      console.log(`[ContainerOrchestrator] 成功为用户 ${userId} 分配容器: ${container.containerId}`)

      return { success: true, data: mapping }

    } catch (error) {
      console.error(`[ContainerOrchestrator] 为用户 ${userId} 分配容器失败:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '分配容器失败',
        code: 'ASSIGN_FAILED'
      }
    }
  }

  /**
   * 释放用户容器（归还到热池或销毁）
   * @param userId 用户ID
   * @param force 是否强制销毁（不归还热池）
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
        // 强制销毁容器
        await this.destroyContainer(container.containerId)
      } else {
        // 归还到热池（先清理用户数据）
        await this.returnToWarmPool(container)
      }

      // 移除映射
      this.userMappings.delete(userId)
      console.log(`[ContainerOrchestrator] 已释放用户 ${userId} 的容器`)

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
   * 预启动一个容器并加入热池
   * @returns 新创建的容器实例
   */
  async prewarmContainer(): Promise<ContainerInstance | null> {
    try {
      // 检查热池是否已满
      if (this.warmPool.size >= this.config.maxPoolSize) {
        console.warn('[ContainerOrchestrator] 热池已达上限，跳过预启动')
        return null
      }

      // 生成唯一容器名称
      const timestamp = Date.now().toString(36)
      const randomStr = Math.random().toString(36).substring(2, 8)
      const containerName = `claude-worker-warm-${timestamp}-${randomStr}`

      // 分配端口
      const port = this.allocatePort()

      // 构建Docker运行命令
      const dockerCmd = [
        'docker run -d',
        `--name ${containerName}`,
        `-p ${port}:3000`,
        `--network ${this.config.networkName}`,
        '--restart unless-stopped',
        '-e CONTAINER_ROLE=worker',
        '-e NODE_ENV=production',
        `-e WORKSPACE_BASE_DIR=/app/workspaces`,
        `-e USER_STORAGE_QUOTA_MB=200`,
        `-e USER_SESSION_LIMIT=5`,
        `-e MAX_USERS=1`,
        // 数据库连接信息
        `-e DB_HOST=mysql`,
        `-e DB_PORT=3306`,
        `-e DB_USER=claude_user`,
        `-e DB_PASSWORD=userpassword123`,
        `-e DB_NAME=claude_code_haha`,
        // API密钥（从环境变量获取）
        `-e ANTHROPIC_AUTH_TOKEN=${process.env.ANTHROPIC_AUTH_TOKEN || ''}`,
        `-e ANTHROPIC_BASE_URL=${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}`,
        // 网络配置
        `-e HOST=0.0.0.0`,
        `-e PORT=3000`,
        this.config.imageName
      ].join(' ')

      console.log(`[ContainerOrchestrator] 执行命令: ${dockerCmd}`)

      const { stdout } = await execAsync(dockerCmd)
      const containerId = stdout.trim()

      // 创建容器实例
      const instance: ContainerInstance = {
        containerId,
        containerName,
        hostPort: port,
        status: 'creating',
        createdAt: new Date(),
        lastActivityAt: new Date()
      }

      // 加入热池
      this.warmPool.set(containerId, instance)

      // 异步等待容器就绪（不阻塞返回）
      this.waitForContainerReady(containerId, instance).catch(err => {
        console.error(`[ContainerOrchestrator] 容器 ${containerName} 就绪等待失败:`, err)
      })

      return instance

    } catch (error) {
      console.error('[ContainerOrchestrator] 预启动容器失败:', error)
      return null
    }
  }

  /**
   * 等待容器就绪
   * @param containerId 容器ID
   * @param instance 容器实例
   */
  private async waitForContainerReady(containerId: string, instance: ContainerInstance): Promise<void> {
    const maxWaitMs = 90000  // 最多等待 90 秒
    const start = Date.now()

    while (Date.now() - start < maxWaitMs) {
      // 检查容器是否还存在（可能已被健康检查循环销毁）
      if (!this.warmPool.has(containerId)) {
        console.log(`[ContainerOrchestrator] 容器 ${instance.containerName} 已被移除，停止就绪等待`)
        return
      }

      const healthy = await this.checkContainerHealth(containerId)
      if (healthy) {
        instance.status = 'idle'
        console.log(`[ContainerOrchestrator] 热容器就绪: ${instance.containerName} (端口: ${instance.hostPort})`)
        return
      }
      await new Promise(resolve => setTimeout(resolve, 3000))  // 3 秒重试
    }

    // 超时标记错误并销毁
    instance.status = 'error'
    console.error(`[ContainerOrchestrator] 容器启动超时: ${instance.containerName}`)
    await this.destroyContainer(containerId)
  }

  /**
   * 从热池获取可用容器
   * @returns 可用的容器实例，如果没有则返回null
   */
  async acquireFromWarmPool(): Promise<ContainerInstance | null> {
    for (const [containerId, container] of this.warmPool) {
      if (container.status === 'idle') {
        // 验证容器健康状态
        const isHealthy = await this.checkContainerHealth(containerId)
        if (isHealthy) {
          // 从热池移除
          this.warmPool.delete(containerId)
          return container
        } else {
          // 不健康的容器从热池移除并销毁
          console.warn(`[ContainerOrchestrator] 发现不健康容器: ${containerId}，正在销毁...`)
          this.warmPool.delete(containerId)
          await this.destroyContainer(containerId)
        }
      }
    }

    return null
  }

  /**
   * 将容器归还到热池（清理后复用）
   * @param container 要归还的容器实例
   */
  async returnToWarmPool(container: ContainerInstance): Promise<void> {
    try {
      // 重置容器状态
      container.status = 'idle'
      container.assignedUserId = undefined
      container.lastActivityAt = new Date()

      // 清理容器内的用户数据（通过API调用或重启容器）
      // 这里简化处理：直接加入热池，下次使用时会重新初始化
      this.warmPool.set(container.containerId, container)

      console.log(`[ContainerOrchestrator] 容器已归还热池: ${container.containerName}`)

      // 如果热池超过最小大小，考虑销毁多余的
      if (this.warmPool.size > this.config.maxPoolSize) {
        await this.shrinkWarmPool()
      }

    } catch (error) {
      console.error(`[ContainerOrchestrator] 归还容器到热池失败:`, error)
      // 失败时直接销毁容器
      await this.destroyContainer(container.containerId)
    }
  }

  /**
   * 创建新的用户专用容器
   * @param userId 用户ID
   * @param username 用户名
   * @returns 创建结果
   */
  private async createContainer(userId: string, username?: string): Promise<OrchestratorResult<ContainerInstance>> {
    try {
      const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 20)
      const containerName = `claude-user-${safeUserId}`

      // 检查是否已存在同名容器
      const exists = await this.containerExists(containerName)
      if (exists) {
        // 尝试复用现有容器
        const existingInstance = await this.getContainerInfoByName(containerName)
        if (existingInstance && existingInstance.status === 'running') {
          return { success: true, data: existingInstance }
        }
      }

      // 分配端口
      const port = this.allocatePort()

      // 构建Docker运行命令
      const dockerCmd = [
        'docker run -d',
        `--name ${containerName}`,
        `-p ${port}:3000`,
        `--network ${this.config.networkName}`,
        '--restart unless-stopped',
        `-v claw-web_user-workspaces:/app/workspaces/users`,
        `-v claw-web_session-workspaces:/app/workspaces/sessions`,
        '-e CONTAINER_ROLE=worker',
        '-e NODE_ENV=production',
        `-e TENANT_USER_ID=${userId}`,
        `-e WORKSPACE_BASE_DIR=/app/workspaces`,
        this.config.imageName
      ].join(' ')

      console.log(`[ContainerOrchestrator] 创建用户容器: ${dockerCmd}`)

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

      // 等待容器就绪
      await new Promise(resolve => setTimeout(resolve, 3000))

      // 验证容器状态
      const healthy = await this.checkContainerHealth(containerId)
      instance.status = healthy ? 'running' : 'error'

      if (!healthy) {
        return {
          success: false,
          error: '容器创建后健康检查失败',
          code: 'HEALTH_CHECK_FAILED'
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
   * 销毁容器
   * @param containerId 容器ID
   */
  async destroyContainer(containerId: string): Promise<boolean> {
    try {
      // 检查容器是否存在
      try {
        await execAsync(`docker inspect ${containerId}`)
      } catch (error) {
        console.warn(`[ContainerOrchestrator] 容器不存在，跳过销毁: ${containerId}`)
        // 从所有数据结构中移除
        this.warmPool.delete(containerId)
        // 从用户映射中移除
        for (const [userId, mapping] of this.userMappings) {
          if (mapping.container.containerId === containerId) {
            this.userMappings.delete(userId)
            break
          }
        }
        return true
      }

      // 停止并删除容器
      await execAsync(`docker stop -t 5 ${containerId}`)
      await execAsync(`docker rm ${containerId}`)

      // 从所有数据结构中移除
      this.warmPool.delete(containerId)
      // 从用户映射中移除
      for (const [userId, mapping] of this.userMappings) {
        if (mapping.container.containerId === containerId) {
          this.userMappings.delete(userId)
          break
        }
      }

      console.log(`[ContainerOrchestrator] 容器已销毁: ${containerId}`)
      return true

    } catch (error) {
      console.error(`[ContainerOrchestrator] 销毁容器失败 (${containerId}):`, error)
      // 即使销毁失败，也要从内存中移除容器记录
      this.warmPool.delete(containerId)
      for (const [userId, mapping] of this.userMappings) {
        if (mapping.container.containerId === containerId) {
          this.userMappings.delete(userId)
          break
        }
      }
      return false
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
        console.warn(`[ContainerOrchestrator] 容器不存在，健康检查失败: ${containerId}`)
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
          `docker exec ${containerId} curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health || echo "000"`
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
   * 获取用户的容器映射
   * @param userId 用户ID
   * @returns 映射信息
   */
  getUserMapping(userId: string): UserContainerMapping | undefined {
    return this.userMappings.get(userId)
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
    let idleCount = 0
    for (const container of this.warmPool.values()) {
      if (container.status === 'idle') {
        idleCount++
      }
    }

    return {
      totalContainers: this.warmPool.size + this.userMappings.size,
      idleContainers: idleCount,
      activeUsers: this.userMappings.size,
      poolUtilization: this.warmPool.size > 0
        ? Math.round(((this.warmPool.size - idleCount) / this.warmPool.size) * 10000) / 100
        : 0
    }
  }

  /**
   * 关闭编排器（停止所有定时任务，清理资源）
   */
  async shutdown(): Promise<void> {
    console.log('[ContainerOrchestrator] 正在关闭编排器...')

    // 停止定时任务
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }

    // 销毁所有热池容器
    for (const [containerId] of this.warmPool) {
      await this.destroyContainer(containerId)
    }

    // 注意：不主动销毁用户容器，因为可能还有活跃会话
    // 可以根据业务需求调整此行为

    console.log('[ContainerOrchestrator] 编排器已关闭')
  }

  // ==================== 私有辅助方法 ====================

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
      // 网络不存在，创建网络
      try {
        await execAsync(`docker network create ${this.config.networkName}`)
        console.log(`[ContainerOrchestrator] 网络 ${this.config.networkName} 创建成功`)
        return true
      } catch (error) {
        console.error(`[ContainerOrchestrator] 创建网络 ${this.config.networkName} 失败:`, error)
        return false
      }
    }
  }

  /**
   * 分配下一个可用端口
   */
  private allocatePort(): number {
    const port = this.config.basePort + this.portCounter
    this.portCounter++
    return port
  }

  /**
   * 根据ID查找容器实例
   */
  private findContainerById(containerId: string): ContainerInstance | undefined {
    // 在热池中查找
    if (this.warmPool.has(containerId)) {
      return this.warmPool.get(containerId)
    }

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
   * 缩小热池（销毁多余容器）
   */
  private async shrinkWarmPool(): Promise<void> {
    while (this.warmPool.size > this.config.minPoolSize) {
      // 找到最长时间未使用的空闲容器
      let oldestContainer: [string, ContainerInstance] | null = null
      let oldestTime = Date.now()

      for (const [id, container] of this.warmPool) {
        if (container.status === 'idle' && container.lastActivityAt.getTime() < oldestTime) {
          oldestTime = container.lastActivityAt.getTime()
          oldestContainer = [id, container]
        }
      }

      if (oldestContainer) {
        console.log(`[ContainerOrchestrator] 缩小热池，销毁容器: ${oldestContainer[1].containerName}`)
        await this.destroyContainer(oldestContainer[0])
      } else {
        break
      }
    }
  }

  /**
   * 启动健康检查循环
   */
  private startHealthCheckLoop(): void {
    this.healthCheckTimer = setInterval(async () => {
      // 检查热池容器
      const containersToRemove: string[] = []
      for (const [containerId, container] of this.warmPool) {
        const ageMs = Date.now() - container.createdAt.getTime()

        // 创建后 60 秒内不检查（除非状态已标记为 error）
        if (ageMs < 60000 && container.status !== 'error') {
          continue
        }

        const isHealthy = await this.checkContainerHealth(containerId)
        if (!isHealthy) {
          console.warn(`[ContainerOrchestrator] 发现不健康的热容器: ${container.containerName}，正在销毁...`)
          containersToRemove.push(containerId)
        }
      }

      // 移除不健康的容器
      for (const containerId of containersToRemove) {
        await this.destroyContainer(containerId)
        this.consecutiveFailures++
      }

      // 检查用户容器
      for (const [userId, mapping] of this.userMappings) {
        const isHealthy = await this.checkContainerHealth(mapping.container.containerId)
        if (!isHealthy) {
          console.error(`[ContainerOrchestrator] 用户 ${userId} 的容器不健康!`)
          // 触发告警或自动恢复逻辑
        }
      }

      // 补充热池到最小数量（带冷却期与指数退避）
      await this.replenishWarmPool()

    }, this.config.healthCheckIntervalMs)
  }

  /**
   * 补充热池到最小数量（带冷却期与指数退避）
   */
  private async replenishWarmPool(): Promise<void> {
    const now = Date.now()
    // 指数退避：连续失败越多，冷却时间越长，最多5分钟
    const minInterval = Math.min(30000 * (this.consecutiveFailures + 1), 300000)

    if (now - this.lastContainerCreationTime < minInterval) {
      return  // 冷却中，暂不补充
    }

    while (this.warmPool.size < this.config.minPoolSize) {
      const created = await this.prewarmContainer()
      if (created) {
        this.lastContainerCreationTime = Date.now()
        this.consecutiveFailures = 0  // 重置失败计数
        break  // 一次只创建一个容器
      } else {
        this.consecutiveFailures++
        break  // 失败后等待下次定时器重试
      }
    }
  }

  /**
   * 启动空闲清理循环
   */
  private startIdleCleanupLoop(): void {
    this.cleanupTimer = setInterval(async () => {
      const now = Date.now()

      for (const [containerId, container] of this.warmPool) {
        if (container.status !== 'idle') continue

        const idleTime = now - container.lastActivityAt.getTime()
        if (idleTime > this.config.idleTimeoutMs) {
          console.log(`[ContainerOrchestrator] 回收空闲超时容器: ${container.containerName} (空闲${Math.round(idleTime / 1000)}秒)`)
          await this.destroyContainer(containerId)
        }
      }

    }, 60000) // 每分钟检查一次
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
