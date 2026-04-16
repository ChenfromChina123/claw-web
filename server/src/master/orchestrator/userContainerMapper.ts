/**
 * UserContainerMapper - 用户容器映射管理器
 *
 * 功能：
 * - 维护用户ID到容器实例的映射关系
 * - 提供快速查询和更新接口
 * - 支持持久化存储（可选）
 * - 提供映射统计和监控数据
 *
 * 使用场景：
 * - Master服务中快速定位用户的Worker容器
 * - API请求路由时查找目标容器
 * - WebSocket连接建立时的容器查找
 */

import { ContainerInstance, UserContainerMapping } from './containerOrchestrator'
import * as fs from 'fs/promises'
import * as path from 'path'

// ==================== 类型定义 ====================

/**
 * 映射统计信息
 */
export interface MappingStats {
  /** 总用户数 */
  totalUsers: number
  /** 活跃用户数（最近5分钟有活动）*/
  activeUsers: number
  /** 平均会话数 */
  avgSessionCount: number
  /** 最大会话数用户 */
  maxSessionUser?: string
  /** 映射创建时间分布 */
  ageDistribution: {
    lessThan1h: number
    between1hAnd6h: number
    between6hAnd24h: number
    moreThan24h: number
  }
}

// ==================== UserContainerMapper 类 ====================

class UserContainerMapper {
  private mappings: Map<string, UserContainerMapping> = new Map()
  private persistencePath: string | null = null
  private autoSaveEnabled: boolean = false
  private saveTimer: NodeJS.Timeout | null = null

  constructor(persistenceDir?: string) {
    if (persistenceDir) {
      this.persistencePath = path.join(persistenceDir, 'user-container-mappings.json')
      this.autoSaveEnabled = true
      console.log(`[UserContainerMapper] 启用持久化存储: ${this.persistencePath}`)
    }
  }

  /**
   * 设置或更新用户-容器映射
   * @param userId 用户ID
   * @param mapping 映射信息
   */
  setMapping(userId: string, mapping: UserContainerMapping): void {
    this.mappings.set(userId, mapping)
    console.log(`[UserContainerMapper] 更新映射: ${userId} -> ${mapping.container.containerId}`)

    // 自动保存
    if (this.autoSaveEnabled) {
      this.scheduleAutoSave()
    }
  }

  /**
   * 获取用户的容器映射
   * @param userId 用户ID
   * @returns 映射信息，如果不存在则返回undefined
   */
  getMapping(userId: string): UserContainerMapping | undefined {
    return this.mappings.get(userId)
  }

  /**
   * 根据容器ID查找关联的用户
   * @param containerId 容器ID
   * @returns 用户ID列表（理论上应该只有一个）
   */
  findUsersByContainer(containerId: string): string[] {
    const users: string[] = []
    for (const [userId, mapping] of this.mappings) {
      if (mapping.container.containerId === containerId) {
        users.push(userId)
      }
    }
    return users
  }

  /**
   * 移除用户映射
   * @param userId 用户ID
   * @returns 被移除的映射信息
   */
  removeMapping(userId: string): UserContainerMapping | undefined {
    const mapping = this.mappings.get(userId)
    if (mapping) {
      this.mappings.delete(userId)
      console.log(`[UserContainerMapper] 移除映射: ${userId}`)

      if (this.autoSaveEnabled) {
        this.scheduleAutoSave()
      }
    }
    return mapping
  }

  /**
   * 检查用户是否有活跃映射
   * @param userId 用户ID
   * @returns 是否存在映射
   */
  hasMapping(userId: string): boolean {
    return this.mappings.has(userId)
  }

  /**
   * 获取所有映射
   * @returns 所有映射的数组
   */
  getAllMappings(): UserContainerMapping[] {
    return Array.from(this.mappings.values())
  }

  /**
   * 获取所有已映射的用户ID
   * @returns 用户ID数组
   */
  getAllUserIds(): string[] {
    return Array.from(this.mappings.keys())
  }

  /**
   * 更新用户最后活动时间
   * @param userId 用户ID
   */
  updateLastActivity(userId: string): void {
    const mapping = this.mappings.get(userId)
    if (mapping) {
      const now = new Date()
      mapping.lastActivityAt = now
      mapping.container.lastActivityAt = now
    }
  }

  /**
   * 增加用户的会话计数
   * @param userId 用户ID
   */
  incrementSessionCount(userId: string): void {
    const mapping = this.mappings.get(userId)
    if (mapping) {
      mapping.sessionCount++
    }
  }

  /**
   * 减少用户的会话计数
   * @param userId 用户ID
   */
  decrementSessionCount(userId: string): void {
    const mapping = this.mappings.get(userId)
    if (mapping && mapping.sessionCount > 0) {
      mapping.sessionCount--
    }
  }

  /**
   * 获取映射统计信息
   * @returns 统计数据
   */
  getStats(): MappingStats {
    const now = Date.now()
    const fiveMinutesAgo = now - 5 * 60 * 1000
    const oneHourAgo = now - 60 * 60 * 1000
    const sixHoursAgo = now - 6 * 60 * 60 * 1000
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000

    let activeUsers = 0
    let totalSessions = 0
    let maxSessions = 0
    let maxSessionUserId: string | undefined

    const ageDistribution = {
      lessThan1h: 0,
      between1hAnd6h: 0,
      between6hAnd24h: 0,
      moreThan24h: 0
    }

    for (const [userId, mapping] of this.mappings) {
      // 统计活跃用户
      if (mapping.lastActivityAt.getTime() > fiveMinutesAgo) {
        activeUsers++
      }

      // 统计会话数
      totalSessions += mapping.sessionCount
      if (mapping.sessionCount > maxSessions) {
        maxSessions = mapping.sessionCount
        maxSessionUserId = userId
      }

      // 统计年龄分布
      const assignedTime = mapping.assignedAt.getTime()
      if (assignedTime > oneHourAgo) {
        ageDistribution.lessThan1h++
      } else if (assignedTime > sixHoursAgo) {
        ageDistribution.between1hAnd6h++
      } else if (assignedTime > twentyFourHoursAgo) {
        ageDistribution.between6hAnd24h++
      } else {
        ageDistribution.moreThan24h++
      }
    }

    return {
      totalUsers: this.mappings.size,
      activeUsers,
      avgSessionCount: this.mappings.size > 0 ? Math.round(totalSessions / this.mappings.size * 100) / 100 : 0,
      maxSessionUser: maxSessionUserId,
      ageDistribution
    }
  }

  /**
   * 清理长时间未活动的映射
   * @param maxIdleTimeMs 最大空闲时间（毫秒）
   * @returns 清理的映射数量
   */
  cleanupIdleMappings(maxIdleTimeMs: number = 30 * 60 * 1000): number {
    const now = Date.now()
    let cleanedCount = 0

    for (const [userId, mapping] of this.mappings) {
      const idleTime = now - mapping.lastActivityAt.getTime()
      if (idleTime > maxIdleTimeMs) {
        this.mappings.delete(userId)
        cleanedCount++
        console.log(`[UserContainerMapper] 清理空闲映射: ${userId} (空闲${Math.round(idleTime / 1000)}秒)`)
      }
    }

    if (cleanedCount > 0 && this.autoSaveEnabled) {
      this.scheduleAutoSave()
    }

    return cleanedCount
  }

  /**
   * 从文件加载映射数据
   * @returns 加载的映射数量
   */
  async loadFromFile(): Promise<number> {
    if (!this.persistencePath) {
      console.warn('[UserContainerMapper] 未配置持久化路径，跳过加载')
      return 0
    }

    try {
      const data = await fs.readFile(this.persistencePath, 'utf-8')
      const parsedData = JSON.parse(data)

      if (Array.isArray(parsedData)) {
        let count = 0
        for (const item of parsedData) {
          // 将日期字符串转换回Date对象
          item.assignedAt = new Date(item.assignedAt)
          item.lastActivityAt = new Date(item.lastActivityAt)
          item.container.createdAt = new Date(item.container.createdAt)
          item.container.lastActivityAt = new Date(item.container.lastActivityAt)

          this.mappings.set(item.userId, item)
          count++
        }

        console.log(`[UserContainerMapper] 从文件加载了 ${count} 个映射`)
        return count
      }

      return 0

    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.log('[UserContainerMapper] 持久化文件不存在，将创建新文件')
        return 0
      }

      console.error('[UserContainerMapper] 加载映射文件失败:', error)
      return 0
    }
  }

  /**
   * 保存映射数据到文件
   * @returns 是否保存成功
   */
  async saveToFile(): Promise<boolean> {
    if (!this.persistencePath) {
      return false
    }

    try {
      const data = Array.from(this.mappings.values())
      const serialized = JSON.stringify(data, null, 2)

      // 确保目录存在
      const dir = path.dirname(this.persistencePath)
      await fs.mkdir(dir, { recursive: true })

      await fs.writeFile(this.persistencePath, serialized, 'utf-8')

      console.log(`[UserContainerMapper] 已保存 ${data.length} 个映射到文件`)
      return true

    } catch (error) {
      console.error('[UserContainerMapper] 保存映射文件失败:', error)
      return false
    }
  }

  /**
   * 清空所有映射
   */
  clear(): void {
    const count = this.mappings.size
    this.mappings.clear()

    if (count > 0) {
      console.log(`[UserContainerMapper] 已清空 ${count} 个映射`)

      if (this.autoSaveEnabled) {
        this.scheduleAutoSave()
      }
    }
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 安排自动保存（防抖动，避免频繁写入）
   */
  private scheduleAutoSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
    }

    this.saveTimer = setTimeout(async () => {
      await this.saveToFile()
    }, 5000) // 5秒后保存
  }
}

// ==================== 单例模式 ====================

let userContainerMapper: UserContainerMapper | null = null

/**
 * 获取UserContainerMapper单例实例
 * @param persistenceDir 可选的持久化目录
 * @returns 映射管理器实例
 */
export function getUserContainerMapper(persistenceDir?: string): UserContainerMapper {
  if (!userContainerMapper) {
    userContainerMapper = new UserContainerMapper(persistenceDir)
  }
  return userContainerMapper
}

export default UserContainerMapper
