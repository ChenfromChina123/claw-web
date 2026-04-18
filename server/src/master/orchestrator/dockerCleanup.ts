/**
 * Docker 系统清理服务
 *
 * 功能：
 * - 定期清理未使用的 Docker 资源（镜像、容器、卷、构建缓存）
 * - 监控磁盘空间，在空间不足时执行紧急清理
 * - 提供清理结果统计和日志记录
 *
 * 使用场景：
 * - 后台定期维护，防止磁盘空间耗尽
 * - 释放不再使用的 Docker 资源
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import type { PoolConfig } from './types'
import { WorkspaceManager } from './workspaceManager'

// 类型别名
type RequiredPoolConfig = Required<PoolConfig>

const execAsync = promisify(exec)

// ==================== DockerCleanup 类 ====================

export class DockerCleanup {
  private config: RequiredPoolConfig
  private workspaceManager: WorkspaceManager
  private dockerCleanupTimer: NodeJS.Timeout | null = null

  constructor(config: RequiredPoolConfig, workspaceManager: WorkspaceManager) {
    this.config = config
    this.workspaceManager = workspaceManager
  }

  /**
   * 启动 Docker 系统清理定时任务
   */
  startDockerCleanupLoop(): void {
    this.dockerCleanupTimer = setInterval(async () => {
      await this.executeDockerCleanup()
    }, this.config.cleanupIntervalMs)
  }

  /**
   * 停止 Docker 清理定时任务
   */
  stopDockerCleanupLoop(): void {
    if (this.dockerCleanupTimer) {
      clearInterval(this.dockerCleanupTimer)
      this.dockerCleanupTimer = null
    }
  }

  /**
   * 执行 Docker 系统清理
   * 清理未使用的镜像、停止的容器、孤立卷等
   */
  async executeDockerCleanup(): Promise<void> {
    if (!this.config.enableAutoCleanup) {
      return
    }

    console.log('[DockerCleanup] 开始执行 Docker 系统清理...')

    try {
      // 检查磁盘空间
      const diskStatus = await this.workspaceManager.checkDiskSpace()
      if (diskStatus.critical) {
        console.warn(`[DockerCleanup] 磁盘空间严重不足 (${diskStatus.used}%)，执行紧急清理`)
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
        console.log(`[DockerCleanup] 容器清理完成`)
      } catch (error) {
        console.warn(`[DockerCleanup] 清理停止容器失败:`, error)
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
          console.log(`[DockerCleanup] 镜像清理完成`)
        } catch (error) {
          console.warn(`[DockerCleanup] 清理未使用镜像失败:`, error)
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
          console.log(`[DockerCleanup] 卷清理完成`)
        } catch (error) {
          console.warn(`[DockerCleanup] 清理孤立卷失败:`, error)
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
        console.log(`[DockerCleanup] 构建缓存清理完成`)
      } catch (error) {
        console.warn(`[DockerCleanup] 清理构建缓存失败:`, error)
      }

      // 记录清理结果
      if (totalReclaimed > 0) {
        const reclaimedMB = Math.round(totalReclaimed / (1024 * 1024) * 100) / 100
        console.log(`[DockerCleanup] Docker 清理完成: 释放 ${reclaimedMB}MB (${actions.join(', ')})`)
      } else {
        console.log(`[DockerCleanup] Docker 清理完成: 无空间释放`)
      }

    } catch (error) {
      console.error(`[DockerCleanup] Docker 清理执行失败:`, error)
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
}
