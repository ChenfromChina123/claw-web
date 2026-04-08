/**
 * Tenant Isolation Middleware - 多租户用户空间隔离中间件
 *
 * 功能：
 * - 用户身份验证与上下文绑定
 * - 请求级别的用户隔离（文件系统、会话、进程）
 * - 资源访问控制（路径安全检查）
 * - 配额限制检查（存储、会话数、文件数）
 *
 * 隔离层级：
 * 1. 文件系统隔离：每个用户只能访问自己的工作目录
 * 2. 会话隔离：用户的会话数据完全分离
 * 3. 进程隔离：PTY 终端按用户分组，限制并发
 * 4. 资源配额：存储空间、文件数量、会话数量限制
 */

import { verifyToken } from '../utils/auth'
import { getWorkspaceManager } from '../services/workspaceManager'
import type { WorkspaceConfig } from '../services/workspaceManager'
import * as path from 'path'

// ==================== 类型定义 ====================

/**
 * 租户上下文信息
 */
export interface TenantContext {
  /** 用户 ID */
  userId: string
  /** 用户名 */
  username?: string
  /** 用户角色 */
  role?: string
  /** 工作区根路径 */
  workspaceRoot: string
  /** 会话工作区根路径 */
  sessionWorkspaceRoot: string
  /** 是否为管理员 */
  isAdmin: boolean
  /** 创建时间 */
  createdAt: Date
}

/**
 * 租户配置
 */
export interface TenantConfig {
  /** 是否启用多租户隔离 */
  enabled: boolean
  /** 最大用户数 */
  maxUsers: number
  /** 每用户存储配额 (MB) */
  userStorageQuotaMB: number
  /** 每用户最大会话数 */
  userSessionLimit: number
  /** 每用户最大 PTY 进程数 */
  userPtyLimit: number
  /** 单个文件最大大小 (MB) */
  maxFileSizeMB: number
  /** 每用户最大文件数 */
  maxFilesPerUser: number
}

/**
 * 隔离结果
 */
export interface IsolationResult {
  success: boolean
  tenantContext?: TenantContext
  error?: string
  statusCode?: number
}

// ==================== 默认配置 ====================

const DEFAULT_TENANT_CONFIG: Required<TenantConfig> = {
  enabled: process.env.TENANT_ISOLATION_ENABLED === 'true',
  maxUsers: parseInt(process.env.MAX_USERS || '100', 10),
  userStorageQuotaMB: parseInt(process.env.USER_STORAGE_QUOTA_MB || '500', 10),
  userSessionLimit: parseInt(process.env.USER_SESSION_LIMIT || '10', 10),
  userPtyLimit: parseInt(process.env.USER_PTY_LIMIT || '5', 10),
  maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),
  maxFilesPerUser: parseInt(process.env.MAX_FILES_PER_USER || '1000', 10)
}

// ==================== Tenant Isolation Manager ====================

class TenantIsolationManager {
  private config: Required<TenantConfig>
  private activeTenants: Map<string, TenantContext> = new Map()
  private tenantStats: Map<string, TenantStats> = new Map()

  constructor(config?: Partial<TenantConfig>) {
    this.config = { ...DEFAULT_TENANT_CONFIG, ...config }
    console.log('[TenantIsolation] 初始化完成，配置:', JSON.stringify(this.config, null, 2))
  }

  /**
   * 从 HTTP 请求中提取并验证租户信息
   * @param request HTTP 请求对象
   * @returns 隔离结果（包含租户上下文）
   */
  async extractTenantFromRequest(request: Request): Promise<IsolationResult> {
    try {
      // 如果未启用隔离，返回成功但无上下文
      if (!this.config.enabled) {
        return { success: true }
      }

      // 从 Authorization header 提取 token
      const authHeader = request.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
          success: false,
          error: '未提供认证令牌',
          statusCode: 401
        }
      }

      const token = authHeader.substring(7)

      // 验证 JWT token
      const payload = await verifyToken(token)
      if (!payload || !payload.userId) {
        return {
          success: false,
          error: '无效的认证令牌或令牌已过期',
          statusCode: 401
        }
      }

      // 检查是否达到最大用户数限制
      if (!this.activeTenants.has(payload.userId) && this.activeTenants.size >= this.config.maxUsers) {
        return {
          success: false,
          error: `已达到最大用户数限制 (${this.config.maxUsers})`,
          statusCode: 503
        }
      }

      // 创建或获取租户上下文
      const tenantContext = await this.getOrCreateTenantContext(payload)

      return {
        success: true,
        tenantContext
      }
    } catch (error) {
      console.error('[TenantIsolation] 提取租户信息失败:', error)
      return {
        success: false,
        error: '服务器内部错误',
        statusCode: 500
      }
    }
  }

  /**
   * 获取或创建租户上下文
   * @param payload JWT payload
   * @returns 租户上下文
   */
  private async getOrCreateTenantContext(payload: any): Promise<TenantContext> {
    const userId = payload.userId

    // 如果已存在缓存，直接返回
    if (this.activeTenants.has(userId)) {
      return this.activeTenants.get(userId)!
    }

    // 获取工作区管理器并确保用户工作区存在
    const workspaceManager = getWorkspaceManager()
    const userWorkspace = await workspaceManager.getOrCreateUserWorkspace(userId)

    // 构建租户上下文
    const tenantContext: TenantContext = {
      userId,
      username: payload.username || payload.email,
      role: payload.role || 'user',
      workspaceRoot: userWorkspace.path,
      sessionWorkspaceRoot: path.join(
        workspaceManager.config.baseDir,
        'sessions',
        userId
      ),
      isAdmin: payload.role === 'admin' || payload.role === 'superadmin',
      createdAt: new Date()
    }

    // 初始化统计信息
    this.tenantStats.set(userId, {
      sessionCount: 0,
      ptyCount: 0,
      fileCount: 0,
      storageUsedBytes: 0,
      lastAccessTime: new Date(),
      requestCount: 0
    })

    // 缓存租户上下文
    this.activeTenants.set(userId, tenantContext)

    console.log(`[TenantIsolation] 租户上下文已创建: userId=${userId}, path=${tenantContext.workspaceRoot}`)

    return tenantContext
  }

  /**
   * 检查路径是否在允许的范围内（防止路径遍历攻击）
   * @param tenantContext 租户上下文
   * @param targetPath 目标路径
   * @returns 是否允许访问
   */
  isPathAllowed(tenantContext: TenantContext, targetPath: string): boolean {
    const resolvedPath = path.resolve(targetPath)
    const allowedPaths = [
      tenantContext.workspaceRoot,
      tenantContext.sessionWorkspaceRoot
    ]

    return allowedPaths.some(allowedPath =>
      resolvedPath === allowedPath || resolvedPath.startsWith(allowedPath + path.sep)
    )
  }

  /**
   * 规范化路径到租户的工作区内
   * @param tenantContext 租户上下文
   * @param relativePath 相对路径
   * @returns 规范化的绝对路径
   */
  normalizePath(tenantContext: TenantContext, relativePath: string): string {
    // 安全处理：移除路径遍历字符
    const safePath = relativePath.replace(/\.\./g, '').replace(/^\/+/, '')
    return path.join(tenantContext.workspaceRoot, safePath)
  }

  /**
   * 检查用户是否超出资源配额
   * @param userId 用户 ID
   * @param resourceType 资源类型
   * @param currentValue 当前值
   * @returns 是否超出配额
   */
  checkResourceQuota(
    userId: string,
    resourceType: 'session' | 'pty' | 'storage' | 'files',
    currentValue: number
  ): { withinLimit: boolean; limit: number; current: number; message?: string } {
    let limit: number

    switch (resourceType) {
      case 'session':
        limit = this.config.userSessionLimit
        break
      case 'pty':
        limit = this.config.userPtyLimit
        break
      case 'storage':
        limit = this.config.userStorageQuotaMB * 1024 * 1024  // 转换为字节
        break
      case 'files':
        limit = this.config.maxFilesPerUser
        break
      default:
        return { withinLimit: true, limit: Infinity, current: currentValue }
    }

    const withinLimit = currentValue < limit

    if (!withinLimit) {
      const messages = {
        session: `会话数量已达上限 (${limit})`,
        pty: `终端进程数已达上限 (${limit})`,
        storage: `存储空间不足 (剩余 ${Math.max(0, limit - currentValue) / 1024 / 1024}MB)`,
        files: `文件数量已达上限 (${limit})`
      }

      return {
        withinLimit: false,
        limit,
        current: currentValue,
        message: messages[resourceType]
      }
    }

    return { withinLimit, limit, current: currentValue }
  }

  /**
   * 更新租户统计信息
   * @param userId 用户 ID
   * @param statsUpdate 统计更新
   */
  updateTenantStats(
    userId: string,
    statsUpdate: Partial<TenantStats>
  ): void {
    const stats = this.tenantStats.get(userId)
    if (stats) {
      Object.assign(stats, statsUpdate, { lastAccessTime: new Date() })
      stats.requestCount++
    }
  }

  /**
   * 获取租户统计信息
   * @param userId 用户 ID
   * @returns 统计信息
   */
  getTenantStats(userId: string): TenantStats | null {
    return this.tenantStats.get(userId) || null
  }

  /**
   * 获取所有活跃租户信息
   * @returns 活跃租户列表
   */
  getActiveTenants(): Array<{
    userId: string
    username?: string
    stats: TenantStats
  }> {
    const result: Array<{ userId: string; username?: string; stats: TenantStats }> = []

    for (const [userId, context] of this.activeTenants) {
      const stats = this.tenantStats.get(userId)
      if (stats) {
        result.push({
          userId,
          username: context.username,
          stats
        })
      }
    }

    return result
  }

  /**
   * 移除租户（清理资源）
   * @param userId 用户 ID
   */
  removeTenant(userId: string): void {
    this.activeTenants.delete(userId)
    this.tenantStats.delete(userId)
    console.log(`[TenantIsolation] 租户已移除: userId=${userId}`)
  }

  /**
   * 清理不活跃的租户（超过指定时间未活动）
   * @param maxIdleTimeMs 最大空闲时间（毫秒）
   * @returns 清理的租户数量
   */
  cleanupIdleTenants(maxIdleTimeMs: number = 30 * 60 * 1000): number {
    const now = new Date()
    let cleanedCount = 0

    for (const [userId, stats] of this.tenantStats) {
      const idleTime = now.getTime() - stats.lastAccessTime.getTime()
      if (idleTime > maxIdleTimeMs) {
        this.removeTenant(userId)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      console.log(`[TenantIsolation] 已清理 ${cleanedCount} 个不活跃租户`)
    }

    return cleanedCount
  }

  /**
   * 获取当前配置
   * @returns 租户配置
   */
  getConfig(): Required<TenantConfig> {
    return { ...this.config }
  }
}

// ==================== 辅助类型定义 ====================

/**
 * 租户统计信息
 */
interface TenantStats {
  /** 当前会话数 */
  sessionCount: number
  /** 当前 PTY 进程数 */
  ptyCount: number
  /** 当前文件数 */
  fileCount: number
  /** 已使用存储（字节） */
  storageUsedBytes: number
  /** 最后访问时间 */
  lastAccessTime: Date
  /** 总请求数 */
  requestCount: number
}

// ==================== 单例模式 ====================

let tenantIsolationManager: TenantIsolationManager | null = null

/**
 * 获取 TenantIsolationManager 单例实例
 * @param config 可选配置
 * @returns 管理器实例
 */
export function getTenantIsolationManager(config?: Partial<TenantConfig>): TenantIsolationManager {
  if (!tenantIsolationManager) {
    tenantIsolationManager = new TenantIsolationManager(config)
  }
  return tenantIsolationManager
}

export default TenantIsolationManager
