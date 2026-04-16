/**
 * User Resource Manager - 用户资源配额管理器
 *
 * 功能：
 * - 用户存储空间管理（配额、使用量统计）
 * - 会话数量限制与跟踪
 * - PTY 进程数限制
 * - 文件数量限制
 * - 资源使用报告生成
 *
 * 使用场景：
 * - Docker 多租户隔离环境中的资源控制
 * - 防止单个用户占用过多系统资源
 * - 提供公平的资源分配机制
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { getWorkspaceManager } from '../services/workspaceManager'
import { getTenantIsolationManager } from './tenantIsolation'

// ==================== 类型定义 ====================

/**
 * 用户资源使用情况
 */
export interface UserResourceUsage {
  /** 用户 ID */
  userId: string
  /** 存储使用情况 */
  storage: {
    usedBytes: number
    usedMB: number
    quotaMB: number
    usagePercent: number
  }
  /** 文件统计 */
  files: {
    totalFiles: number
    maxFiles: number
    fileCountPercent: number
  }
  /** 会话统计 */
  sessions: {
    activeSessions: number
    maxSessions: number
    sessionCountPercent: number
  }
  /** PTY 终端统计 */
  pty: {
    activePtyProcesses: number
    maxPtyProcesses: number
    ptyCountPercent: number
  }
  /** 最后更新时间 */
  lastUpdated: Date
}

/**
 * 资源检查结果
 */
export interface ResourceCheckResult {
  allowed: boolean
  reason?: string
  currentUsage?: UserResourceUsage
}

// ==================== User Resource Manager ====================

class UserManager {
  private resourceCache: Map<string, UserResourceUsage> = new Map()
  private cacheTimeoutMs: number = 60000 // 缓存 1 分钟

  /**
   * 检查用户是否可以创建新会话
   * @param userId 用户 ID
   * @returns 检查结果
   */
  async canCreateSession(userId: string): Promise<ResourceCheckResult> {
    try {
      const tenantManager = getTenantIsolationManager()
      const stats = tenantManager.getTenantStats(userId)

      if (!stats) {
        return { allowed: true }
      }

      const quotaCheck = tenantManager.checkResourceQuota(userId, 'session', stats.sessionCount)

      if (!quotaCheck.withinLimit) {
        const usage = await this.getUserResourceUsage(userId)
        return {
          allowed: false,
          reason: quotaCheck.message,
          currentUsage: usage
        }
      }

      return { allowed: true }
    } catch (error) {
      console.error('[UserResourceManager] 检查会话配额失败:', error)
      return { allowed: true } // 出错时默认允许
    }
  }

  /**
   * 检查用户是否可以创建新的 PTY 进程
   * @param userId 用户 ID
   * @returns 检查结果
   */
  async canCreatePtyProcess(userId: string): Promise<ResourceCheckResult> {
    try {
      const tenantManager = getTenantIsolationManager()
      const stats = tenantManager.getTenantStats(userId)

      if (!stats) {
        return { allowed: true }
      }

      const quotaCheck = tenantManager.checkResourceQuota(userId, 'pty', stats.ptyCount)

      if (!quotaCheck.withinLimit) {
        const usage = await this.getUserResourceUsage(userId)
        return {
          allowed: false,
          reason: quotaCheck.message,
          currentUsage: usage
        }
      }

      return { allowed: true }
    } catch (error) {
      console.error('[UserResourceManager] 检查 PTY 配额失败:', error)
      return { allowed: true }
    }
  }

  /**
   * 检查用户是否有足够的存储空间上传文件
   * @param userId 用户 ID
   * @param fileSizeBytes 文件大小（字节）
   * @returns 检查结果
   */
  async canUploadFile(userId: string, fileSizeBytes: number): Promise<ResourceCheckResult> {
    try {
      const tenantManager = getTenantIsolationManager()
      const config = tenantManager.getConfig()

      // 检查单文件大小限制
      if (fileSizeBytes > config.maxFileSizeMB * 1024 * 1024) {
        const usage = await this.getUserResourceUsage(userId)
        return {
          allowed: false,
          reason: `文件过大（最大 ${config.maxFileSizeMB}MB）`,
          currentUsage: usage
        }
      }

      const stats = tenantManager.getTenantStats(userId)

      if (!stats) {
        return { allowed: true }
      }

      // 检查总存储配额
      const newTotalSize = stats.storageUsedBytes + fileSizeBytes
      const quotaCheck = tenantManager.checkResourceQuota(userId, 'storage', newTotalSize)

      if (!quotaCheck.withinLimit) {
        const usage = await this.getUserResourceUsage(userId)
        return {
          allowed: false,
          reason: quotaCheck.message,
          currentUsage: usage
        }
      }

      // 检查文件数量限制
      const fileQuotaCheck = tenantManager.checkResourceQuota(userId, 'files', stats.fileCount + 1)
      if (!fileQuotaCheck.withinLimit) {
        const usage = await this.getUserResourceUsage(userId)
        return {
          allowed: false,
          reason: fileQuotaCheck.message,
          currentUsage: usage
        }
      }

      return { allowed: true }
    } catch (error) {
      console.error('[UserResourceManager] 检查文件上传配额失败:', error)
      return { allowed: true }
    }
  }

  /**
   * 获取用户的资源使用情况
   * @param userId 用户 ID
   * @returns 资源使用情况
   */
  async getUserResourceUsage(userId: string): Promise<UserResourceUsage> {
    // 检查缓存
    const cached = this.resourceCache.get(userId)
    if (cached && Date.now() - cached.lastUpdated.getTime() < this.cacheTimeoutMs) {
      return cached
    }

    try {
      const tenantManager = getTenantIsolationManager()
      const config = tenantManager.getConfig()
      const workspaceManager = getWorkspaceManager()

      // 计算存储使用量
      let storageUsedBytes = 0
      let totalFiles = 0

      const userWorkspace = await workspaceManager.getUserWorkspace(userId)
      if (userWorkspace) {
        const result = await this.calculateDirectorySize(userWorkspace.path)
        storageUsedBytes = result.totalSize
        totalFiles = result.fileCount
      }

      // 获取统计数据
      const stats = tenantManager.getTenantStats(userId)

      const usage: UserResourceUsage = {
        userId,
        storage: {
          usedBytes: storageUsedBytes,
          usedMB: Math.round(storageUsedBytes / 1024 / 1024 * 100) / 100,
          quotaMB: config.userStorageQuotaMB,
          usagePercent: Math.round((storageUsedBytes / (config.userStorageQuotaMB * 1024 * 1024)) * 10000) / 100
        },
        files: {
          totalFiles,
          maxFiles: config.maxFilesPerUser,
          fileCountPercent: Math.round((totalFiles / config.maxFilesPerUser) * 10000) / 100
        },
        sessions: {
          activeSessions: stats?.sessionCount || 0,
          maxSessions: config.userSessionLimit,
          sessionCountPercent: Math.round(((stats?.sessionCount || 0) / config.userSessionLimit) * 10000) / 100
        },
        pty: {
          activePtyProcesses: stats?.ptyCount || 0,
          maxPtyProcesses: config.userPtyLimit,
          ptyCountPercent: Math.round(((stats?.ptyCount || 0) / config.userPtyLimit) * 10000) / 100
        },
        lastUpdated: new Date()
      }

      // 更新缓存
      this.resourceCache.set(userId, usage)

      return usage
    } catch (error) {
      console.error('[UserResourceManager] 获取资源使用情况失败:', error)

      // 返回空的使用情况
      return {
        userId,
        storage: { usedBytes: 0, usedMB: 0, quotaMB: 500, usagePercent: 0 },
        files: { totalFiles: 0, maxFiles: 1000, fileCountPercent: 0 },
        sessions: { activeSessions: 0, maxSessions: 10, sessionCountPercent: 0 },
        pty: { activePtyProcesses: 0, maxPtyProcesses: 5, ptyCountPercent: 0 },
        lastUpdated: new Date()
      }
    }
  }

  /**
   * 递归计算目录大小和文件数
   * @param dirPath 目录路径
   * @returns 目录大小信息
   */
  private async calculateDirectorySize(dirPath: string): Promise<{ totalSize: number; fileCount: number }> {
    let totalSize = 0
    let fileCount = 0

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)

        if (entry.isDirectory()) {
          // 跳过 node_modules 等大型目录（可选优化）
          if (entry.name === 'node_modules' || entry.name === '.git') {
            continue
          }

          const subResult = await this.calculateDirectorySize(fullPath)
          totalSize += subResult.totalSize
          fileCount += subResult.fileCount
        } else if (entry.isFile()) {
          try {
            const stat = await fs.stat(fullPath)
            totalSize += stat.size
            fileCount++
          } catch {
            // 忽略无法访问的文件
          }
        }
      }
    } catch (error) {
      console.error(`[UserResourceManager] 计算目录大小失败 (${dirPath}):`, error)
    }

    return { totalSize, fileCount }
  }

  /**
   * 更新用户资源使用统计
   * @param userId 用户 ID
   * @param updates 更新内容
   */
  updateResourceUsage(
    userId: string,
    updates: {
      sessionDelta?: number
      ptyDelta?: number
      fileDelta?: number
      storageDeltaBytes?: number
    }
  ): void {
    const tenantManager = getTenantIsolationManager()
    tenantManager.updateTenantStats(userId, {
      ...(updates.sessionDelta !== undefined && { sessionCount: updates.sessionDelta }),
      ...(updates.ptyDelta !== undefined && { ptyCount: updates.ptyDelta }),
      ...(updates.fileDelta !== undefined && { fileCount: updates.fileDelta }),
      ...(updates.storageDeltaBytes !== undefined && { storageUsedBytes: updates.storageDeltaBytes })
    })

    // 清除缓存以强制下次重新计算
    this.resourceCache.delete(userId)
  }

  /**
   * 获取所有用户的资源使用摘要
   * @returns 所有用户的资源摘要
   */
  async getAllUsersResourceSummary(): Promise<Array<{
    userId: string
    username?: string
    storageUsagePercent: number
    sessionUsagePercent: number
    isActive: boolean
  }>> {
    const tenantManager = getTenantIsolationManager()
    const activeTenants = tenantManager.getActiveTenants()

    const summary = []

    for (const tenant of activeTenants) {
      const usage = await this.getUserResourceUsage(tenant.userId)
      summary.push({
        userId: tenant.userId,
        username: tenant.username,
        storageUsagePercent: usage.storage.usagePercent,
        sessionUsagePercent: usage.sessions.sessionCountPercent,
        isActive: true
      })
    }

    return summary
  }

  /**
   * 清理资源缓存
   * @param userId 可选的用户 ID，不传则清理所有
   */
  clearCache(userId?: string): void {
    if (userId) {
      this.resourceCache.delete(userId)
    } else {
      this.resourceCache.clear()
    }
  }
}

// ==================== 单例模式 ====================

let userResourceManager: UserManager | null = null

/**
 * 获取 UserManager 单例实例
 * @returns 管理器实例
 */
export function getUserResourceManager(): UserManager {
  if (!userResourceManager) {
    userResourceManager = new UserManager()
  }
  return userResourceManager
}

export default UserManager
