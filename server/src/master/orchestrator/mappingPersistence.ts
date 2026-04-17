/**
 * 用户容器映射持久化层
 *
 * 功能：
 * - 管理用户到容器的映射关系
 * - 提供数据库持久化和恢复功能
 * - 支持从 Docker 扫描并恢复未持久化的容器映射
 *
 * 使用场景：
 * - Master 重启后从数据库恢复用户映射
 * - 容器分配和释放时更新数据库状态
 * - 兼容旧版本未持久化的容器（通过 Docker 扫描恢复）
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { v4 as uuidv4 } from 'uuid'
import type { UserContainerMapping, ContainerInstance, OrchestratorResult } from './types'
import { UserTier } from '../config/hardwareResourceConfig'
import { getPool } from '../db/mysql'

const execAsync = promisify(exec)

// ==================== MappingPersistence 类 ====================

export class MappingPersistence {
  private userMappings: Map<string, UserContainerMapping>

  constructor(userMappings: Map<string, UserContainerMapping>) {
    this.userMappings = userMappings
  }

  /**
   * 从数据库加载用户映射
   */
  async loadUserMappingsFromDB(): Promise<void> {
    try {
      const pool = getPool()
      if (!pool) {
        console.log('[MappingPersistence] 数据库不可用，跳过加载用户映射')
        return
      }

      const [rows] = await pool.execute(
        `SELECT * FROM user_worker_mappings WHERE status = 'active' ORDER BY last_activity_at DESC`
      )

      const dbRows = rows as any[]
      if (dbRows.length === 0) {
        console.log('[MappingPersistence] 数据库中没有活跃的用户映射')
        return
      }

      for (const row of dbRows) {
        // 检查内存中是否已有映射
        if (this.userMappings.has(row.user_id)) {
          console.log(`[MappingPersistence] 用户 ${row.user_id} 已有映射，跳过数据库加载`)
          continue
        }

        // 检查容器是否还在运行
        try {
          const { stdout } = await execAsync(
            `docker ps --filter "id=${row.container_id}" --filter "status=running" --format "{{.ID}}|{{.Names}}|{{.Ports}}"`
          )

          if (!stdout.trim()) {
            console.log(`[MappingPersistence] 用户 ${row.user_id} 的容器 ${row.container_id} 已停止，跳过`)
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
            console.log(`[MappingPersistence] 无法解析容器 ${containerId} 的端口`)
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
          console.log(`[MappingPersistence] 从数据库恢复用户 ${row.user_id} 的映射：${containerName}`)
        } catch (error) {
          console.error(`[MappingPersistence] 检查容器 ${row.container_id} 状态失败:`, error)
        }
      }

      console.log(`[MappingPersistence] 从数据库恢复了 ${this.userMappings.size} 个用户映射`)
    } catch (error) {
      console.error('[MappingPersistence] 从数据库加载用户映射失败:', error)
    }
  }

  /**
   * 扫描Docker中已运行的用户容器并恢复映射（用于Master重启后恢复旧版本未持久化的容器）
   */
  async scanAndRecoverUserContainers(): Promise<void> {
    try {
      // 获取所有正在运行的用户容器
      const { stdout } = await execAsync(
        `docker ps --filter "name=claude-user-" --filter "status=running" --format "{{.ID}}|{{.Names}}|{{.Ports}}"`
      )

      if (!stdout.trim()) {
        console.log('[MappingPersistence] 未发现已运行的用户容器')
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
          console.warn(`[MappingPersistence] 无法解析容器 ${containerName} 的端口`)
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
          console.warn(`[MappingPersistence] 解析容器 ${containerName} 环境变量失败`)
          continue
        }

        // 如果没有找到userId，跳过
        if (!userId) {
          console.warn(`[MappingPersistence] 容器 ${containerName} 中未找到TENANT_USER_ID环境变量`)
          continue
        }

        // 检查内存中是否已有映射
        if (this.userMappings.has(userId)) {
          console.log(`[MappingPersistence] 用户 ${userId} 已有映射，跳过恢复`)
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
          console.warn(`[MappingPersistence] 保存恢复的映射到数据库失败: ${error}`)
        }

        console.log(`[MappingPersistence] 从Docker恢复用户容器: ${userId} -> ${containerName} (端口: ${hostPort})`)
      }

      if (recoveredCount > 0) {
        console.log(`[MappingPersistence] 成功从Docker恢复 ${recoveredCount} 个用户容器映射`)
      }
    } catch (error) {
      console.error('[MappingPersistence] 扫描并恢复用户容器失败:', error)
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
          console.warn(`[MappingPersistence] 无法解析容器 ${containerName} 的端口`)
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
          console.warn(`[MappingPersistence] 保存恢复的映射到数据库失败: ${error}`)
        }

        console.log(`[MappingPersistence] 从Docker恢复用户容器: ${userId} -> ${containerName} (端口: ${hostPort})`)
        return mapping
      }

      return undefined
    } catch (error) {
      console.error(`[MappingPersistence] 扫描用户 ${userId} 的容器失败:`, error)
      return undefined
    }
  }

  /**
   * 保存用户映射到数据库
   */
  async saveUserMappingToDB(mapping: UserContainerMapping): Promise<void> {
    try {
      const pool = getPool()
      if (!pool) {
        console.warn('[MappingPersistence] 数据库不可用，跳过保存用户映射')
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
      console.log(`[MappingPersistence] 用户映射已保存到数据库：${mapping.userId} -> ${mapping.container.containerName}`)
    } catch (error) {
      console.error('[MappingPersistence] 保存用户映射到数据库失败:', error)
    }
  }

  /**
   * 更新数据库中的用户映射状态
   */
  async updateUserMappingStatusInDB(userId: string, status: 'active' | 'released' | 'destroyed'): Promise<void> {
    try {
      const pool = getPool()
      if (!pool) return

      await pool.execute(
        `UPDATE user_worker_mappings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        [status, userId]
      )
      console.log(`[MappingPersistence] 用户映射状态已更新：${userId} -> ${status}`)
    } catch (error) {
      console.error('[MappingPersistence] 更新用户映射状态失败:', error)
    }
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
          console.log(`[MappingPersistence] 用户 ${userId} 的容器 ${row.container_id} 已停止`)
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
        console.log(`[MappingPersistence] 从数据库加载用户 ${userId} 的映射：${containerName}`)
        return mapping
      } catch (error) {
        console.error(`[MappingPersistence] 检查容器状态失败:`, error)
        return undefined
      }
    } catch (error) {
      console.error('[MappingPersistence] 从数据库加载用户映射失败:', error)
      return undefined
    }
  }
}
