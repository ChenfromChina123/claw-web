/**
 * 工作空间管理器
 *
 * 功能：
 * - 管理用户工作目录的创建和维护
 * - 监控磁盘空间使用情况
 * - 提供工作空间统计信息
 *
 * 架构原则：
 * - 工作空间按用户隔离，不按会话隔离
 * - 同一用户的所有会话共享同一个工作空间
 *
 * 使用场景：
 * - 容器创建前确保工作目录存在
 * - 定期检查磁盘空间健康状态
 * - 获取工作空间使用统计
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import type { Required<PoolConfig> } from './types'
import { ContainerOperations } from './containerOperations'

const execAsync = promisify(exec)

// ==================== WorkspaceManager 类 ====================

export class WorkspaceManager {
  private config: Required<PoolConfig>
  private containerOps: ContainerOperations

  constructor(config: Required<PoolConfig>, containerOps: ContainerOperations) {
    this.config = config
    this.containerOps = containerOps
  }

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
  async ensureHostWorkspaceExists(): Promise<void> {
    const workspaceRoot = this.config.hostWorkspacePath

    try {
      // 检查目录是否存在
      await fs.access(workspaceRoot)
      console.log(`[WorkspaceManager] 宿主机工作空间目录已存在: ${workspaceRoot}`)
    } catch {
      // 目录不存在，创建它
      console.log(`[WorkspaceManager] 创建宿主机工作空间目录: ${workspaceRoot}`)
      await fs.mkdir(workspaceRoot, { recursive: true })
    }

    // 设置目录权限（允许 Docker 容器访问）
    await this.containerOps.ensurePathPermissions(workspaceRoot)
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
      await this.containerOps.ensurePathPermissions(workspacePath)

      console.log(`[WorkspaceManager] 已创建用户工作空间: ${workspacePath}`)
      return { success: true, workspacePath }
    } catch (error) {
      console.error(`[WorkspaceManager] 创建用户工作空间失败: ${workspacePath}`, error)
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
      console.warn('[WorkspaceManager] 检查磁盘空间失败:', error)
      return { total: 0, used: 0, available: 0, warning: false, critical: false }
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
      console.warn('[WorkspaceManager] 获取工作空间统计失败:', error)
      return { userCount: 0, totalSizeMB: 0 }
    }
  }

  /**
   * 解析大小字符串（如 "100G"）为 MB
   */
  parseSizeToMB(size: string): number {
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
