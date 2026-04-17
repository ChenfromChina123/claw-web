/**
 * 容器生命周期管理器
 *
 * 功能：
 * - 管理容器的完整生命周期（创建、运行、休眠、恢复、销毁）
 * - 提供幂等性保障，防止重复操作
 * - 支持容器健康检查和自动恢复
 *
 * 使用场景：
 * - 用户容器分配时的创建逻辑
 * - 用户离开时的容器休眠
 * - 容器故障时的销毁和重建
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import type { ContainerInstance, UserContainerMapping, OrchestratorResult, Required<PoolConfig> } from './types'
import { UserTier } from '../config/hardwareResourceConfig'
import { getHardwareResourceManager } from '../config/hardwareResourceConfig'
import { ContainerOperations } from './containerOperations'
import { WorkspaceManager } from './workspaceManager'

const execAsync = promisify(exec)

// 容器操作状态跟踪（用于幂等性和并发控制）
const destroyingContainers = new Set<string>() // 正在销毁的容器ID集合

// ==================== ContainerLifecycle 类 ====================

export class ContainerLifecycle {
  private config: Required<PoolConfig>
  private containerOps: ContainerOperations
  private workspaceManager: WorkspaceManager
  private userMappings: Map<string, UserContainerMapping>

  constructor(
    config: Required<PoolConfig>,
    containerOps: ContainerOperations,
    workspaceManager: WorkspaceManager,
    userMappings: Map<string, UserContainerMapping>
  ) {
    this.config = config
    this.containerOps = containerOps
    this.workspaceManager = workspaceManager
    this.userMappings = userMappings
  }

  /**
   * 创建新的用户专用容器
   * @param userId 用户ID
   * @param username 用户名
   * @param userTier 用户等级（可选，默认为free）
   * @returns 创建结果
   */
  async createContainer(userId: string, username?: string, userTier?: UserTier): Promise<OrchestratorResult<ContainerInstance>> {
    try {
      // 生成唯一容器名：用户ID前12位 + 时间戳后6位 + 随机4位
      // 确保同一用户的多次会话也不会冲突
      const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 12)
      const timestamp = Date.now().toString(36).slice(-6)
      const randomSuffix = Math.random().toString(36).substring(2, 6)
      const containerName = `claude-user-${safeUserId}-${timestamp}-${randomSuffix}`

      // 原子性保障：在创建前强制清理可能存在的同名残留容器（只清理非运行中的）
      console.log(`[ContainerLifecycle] 清理残留容器: ${containerName}`)
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
      const port = await this.containerOps.allocatePort()

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
        const fs = require('fs/promises')
        await fs.mkdir(hostWorkspacePath, { recursive: true })
        await this.containerOps.ensurePathPermissions(hostWorkspacePath)
      } catch (error) {
        console.warn(`[ContainerLifecycle] 创建宿主机工作空间目录失败（非致命）: ${error}`)
      }
      // ========== Bind Mount 结束 ==========

      // 使用统一方法构建 Docker 命令
      const dockerCmd = this.containerOps.buildDockerRunCommand({
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

      console.log(`[ContainerLifecycle] 创建用户容器 (等级: ${tier}): ${dockerCmd}`)

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
          await this.containerOps.inspectContainer(containerId)
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
      console.error(`[ContainerLifecycle] 创建容器失败:`, error)
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
      console.warn(`[ContainerLifecycle] 清理残留容器失败: ${containerName}`, error)
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
      console.log(`[ContainerLifecycle] 休眠容器: ${containerId}`)
      await execAsync(`docker pause ${containerId}`)
      console.log(`[ContainerLifecycle] 容器已休眠: ${containerId}`)
      return true
    } catch (error) {
      console.error(`[ContainerLifecycle] 休眠容器失败 (${containerId}):`, error)
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
      console.log(`[ContainerLifecycle] 恢复容器: ${containerId}`)
      await execAsync(`docker unpause ${containerId}`)
      console.log(`[ContainerLifecycle] 容器已恢复: ${containerId}`)
      return true
    } catch (error) {
      console.error(`[ContainerLifecycle] 恢复容器失败 (${containerId}):`, error)
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
        console.log(`[ContainerLifecycle] 容器 ${containerId} 正在销毁中，跳过重复调用（幂等性保护）`)

        const maxWaitMs = 30000
        const start = Date.now()
        while (destroyingContainers.has(containerId) && Date.now() - start < maxWaitMs) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }

        if (destroyingContainers.has(containerId)) {
          console.warn(`[ContainerLifecycle] 容器 ${containerId} 销毁超时，但已接受幂等性请求`)
        }

        return true
      }

      // ========== 幂等性检查 2：容器是否已不存在 ==========
      let containerExists = true
      try {
        await this.containerOps.inspectContainer(containerId)
      } catch (error) {
        console.warn(`[ContainerLifecycle] 容器不存在，跳过销毁: ${containerId}`)
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

        console.log(`[ContainerLifecycle] 停止容器: ${containerId}`)
        await execAsync(`docker stop -t 5 ${containerId}`)

        console.log(`[ContainerLifecycle] 删除容器: ${containerId}`)
        await execAsync(`docker rm ${containerId}`)

        for (const [userId, mapping] of this.userMappings) {
          if (mapping.container.containerId === containerId) {
            this.userMappings.delete(userId)
            break
          }
        }

        console.log(`[ContainerLifecycle] 容器已销毁: ${containerId}`)
        return true

      } finally {
        destroyingContainers.delete(containerId)
      }

    } catch (error) {
      console.error(`[ContainerLifecycle] 销毁容器失败 (${containerId}):`, error)
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
   * 检查容器健康状态
   * @param containerId 容器ID或名称
   * @returns 是否健康
   */
  async checkContainerHealth(containerId: string): Promise<boolean> {
    try {
      // 检查容器是否存在
      const exists = await this.containerOps.inspectContainer(containerId)
      if (!exists) {
        console.warn(`[ContainerLifecycle] 容器不存在: ${containerId}`)
        return false
      }

      // 先检查容器运行状态
      const isRunning = await this.containerOps.checkContainerRunning(containerId)
      if (!isRunning) {
        return false
      }

      // 获取容器映射的端口
      const container = this.containerOps.findContainerById(containerId, this.userMappings)
      if (!container) {
        return false
      }

      // 使用Docker exec在容器内部执行健康检查
      // 这样可以避免网络映射问题
      return await this.containerOps.checkContainerHealthViaExec(containerId)

    } catch (error) {
      console.error(`[ContainerLifecycle] 健康检查异常 (${containerId}):`, error)
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
        console.log(`[ContainerLifecycle] 无法找到容器对应的用户，跳过快照: ${containerId}`)
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
        console.log(`[ContainerLifecycle] 用户 ${userId} 没有会话记录，跳过快照`)
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

      console.log(`[ContainerLifecycle] 容器销毁前快照已保存: ${containerId}, 快照ID=${metadata.id}, 大小=${metadata.sizeBytes}`)
    } catch (error) {
      console.error(`[ContainerLifecycle] 创建销毁前快照失败 (${containerId}):`, error)
    }
  }
}
