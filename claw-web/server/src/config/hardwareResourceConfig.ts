/**
 * Hardware Resource Configuration - 硬件资源限制配置模块
 *
 * 功能：
 * - 定义不同用户等级的硬件资源配额
 * - 管理CPU、内存、存储等硬件资源限制
 * - 提供资源配额查询和验证接口
 * - 支持动态调整资源配额
 *
 * 用户等级：
 * - free: 免费用户（基础资源）
 * - basic: 基础付费用户（标准资源）
 * - pro: 专业用户（增强资源）
 * - enterprise: 企业用户（高级资源）
 * - admin: 管理员用户（无限制）
 */

// ==================== 类型定义 ====================

/**
 * 用户等级枚举
 */
export enum UserTier {
  FREE = 'free',
  BASIC = 'basic',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
  ADMIN = 'admin'
}

/**
 * 硬件资源配额配置
 */
export interface HardwareQuota {
  /** 用户等级名称 */
  tierName: string
  /** 用户等级显示名称 */
  displayName: string
  /** CPU限制（核心数，如1.5表示1.5核） */
  cpuLimit: number
  /** 内存限制（MB） */
  memoryLimitMB: number
  /** 内存预留（MB） */
  memoryReservationMB: number
  /** 存储配额（MB） */
  storageQuotaMB: number
  /** 最大会话数 */
  maxSessions: number
  /** 最大PTY进程数 */
  maxPtyProcesses: number
  /** 最大文件数 */
  maxFiles: number
  /** 单文件最大大小（MB） */
  maxFileSizeMB: number
  /** 网络带宽限制（KB/s，0表示无限制） */
  networkBandwidthKBps: number
  /** 磁盘IO限制（MB/s，0表示无限制） */
  diskIOBps: number
  /** 优先级（数值越大优先级越高） */
  priority: number
  /** 描述信息 */
  description: string
}

/**
 * Docker资源限制配置
 */
export interface DockerResourceLimits {
  /** CPU配额（微秒数，100000 = 1核） */
  cpuQuota?: number
  /** CPU周期（微秒数） */
  cpuPeriod?: number
  /** CPU核心数限制 */
  cpuCount?: number
  /** 内存限制（字节） */
  memoryBytes: number
  /** 内存预留（字节） */
  memoryReservationBytes: number
  /** 内存交换空间限制（字节） */
  memorySwapBytes?: number
  /** 磁盘IO权重（10-1000） */
  blkioWeight?: number
  /** 磁盘读取速率限制（字节/秒） */
  blkioReadBps?: number
  /** 磁盘写入速率限制（字节/秒） */
  blkioWriteBps?: number
}

// ==================== 默认硬件配额配置 ====================

/**
 * 默认硬件资源配额配置表
 * 根据用户等级分配不同的硬件资源
 */
const DEFAULT_HARDWARE_QUOTAS: Record<UserTier, HardwareQuota> = {
  [UserTier.FREE]: {
    tierName: 'free',
    displayName: '免费用户',
    cpuLimit: 0.5,
    memoryLimitMB: 256,
    memoryReservationMB: 128,
    storageQuotaMB: 200,
    maxSessions: 3,
    maxPtyProcesses: 2,
    maxFiles: 500,
    maxFileSizeMB: 5,
    networkBandwidthKBps: 1024,
    diskIOBps: 10,
    priority: 1,
    description: '免费用户，基础资源配额，适合轻度使用'
  },
  [UserTier.BASIC]: {
    tierName: 'basic',
    displayName: '基础会员',
    cpuLimit: 1.0,
    memoryLimitMB: 512,
    memoryReservationMB: 256,
    storageQuotaMB: 500,
    maxSessions: 5,
    maxPtyProcesses: 3,
    maxFiles: 1000,
    maxFileSizeMB: 10,
    networkBandwidthKBps: 2048,
    diskIOBps: 20,
    priority: 2,
    description: '基础付费用户，标准资源配额，适合个人开发者'
  },
  [UserTier.PRO]: {
    tierName: 'pro',
    displayName: '专业会员',
    cpuLimit: 2.0,
    memoryLimitMB: 1024,
    memoryReservationMB: 512,
    storageQuotaMB: 2000,
    maxSessions: 10,
    maxPtyProcesses: 5,
    maxFiles: 3000,
    maxFileSizeMB: 20,
    networkBandwidthKBps: 5120,
    diskIOBps: 50,
    priority: 3,
    description: '专业用户，增强资源配额，适合专业开发者'
  },
  [UserTier.ENTERPRISE]: {
    tierName: 'enterprise',
    displayName: '企业会员',
    cpuLimit: 4.0,
    memoryLimitMB: 2048,
    memoryReservationMB: 1024,
    storageQuotaMB: 10000,
    maxSessions: 20,
    maxPtyProcesses: 10,
    maxFiles: 10000,
    maxFileSizeMB: 50,
    networkBandwidthKBps: 10240,
    diskIOBps: 100,
    priority: 4,
    description: '企业用户，高级资源配额，适合团队协作'
  },
  [UserTier.ADMIN]: {
    tierName: 'admin',
    displayName: '管理员',
    cpuLimit: 8.0,
    memoryLimitMB: 4096,
    memoryReservationMB: 2048,
    storageQuotaMB: 50000,
    maxSessions: 50,
    maxPtyProcesses: 20,
    maxFiles: 50000,
    maxFileSizeMB: 100,
    networkBandwidthKBps: 0,
    diskIOBps: 0,
    priority: 5,
    description: '管理员用户，无资源限制'
  }
}

// ==================== Hardware Resource Manager ====================

/**
 * 硬件资源管理器
 */
class HardwareResourceManager {
  private quotas: Record<UserTier, HardwareQuota>
  private customQuotas: Map<string, HardwareQuota> = new Map()

  constructor() {
    this.quotas = { ...DEFAULT_HARDWARE_QUOTAS }
    console.log('[HardwareResourceManager] 初始化完成')
  }

  /**
   * 获取指定用户等级的硬件配额
   * @param tier 用户等级
   * @returns 硬件配额配置
   */
  getQuota(tier: UserTier): HardwareQuota {
    return this.quotas[tier] || this.quotas[UserTier.FREE]
  }

  /**
   * 获取用户的硬件配额（支持自定义配额）
   * @param userId 用户ID
   * @param tier 用户等级
   * @returns 硬件配额配置
   */
  getUserQuota(userId: string, tier: UserTier): HardwareQuota {
    const customQuota = this.customQuotas.get(userId)
    if (customQuota) {
      return customQuota
    }
    return this.getQuota(tier)
  }

  /**
   * 设置用户的自定义硬件配额
   * @param userId 用户ID
   * @param quota 自定义配额配置
   */
  setUserQuota(userId: string, quota: Partial<HardwareQuota>): void {
    const defaultQuota = this.quotas[UserTier.FREE]
    const customQuota: HardwareQuota = {
      ...defaultQuota,
      ...quota,
      tierName: quota.tierName || 'custom',
      displayName: quota.displayName || '自定义配额'
    }
    this.customQuotas.set(userId, customQuota)
    console.log(`[HardwareResourceManager] 已为用户 ${userId} 设置自定义配额`)
  }

  /**
   * 移除用户的自定义配额
   * @param userId 用户ID
   */
  removeUserQuota(userId: string): void {
    this.customQuotas.delete(userId)
    console.log(`[HardwareResourceManager] 已移除用户 ${userId} 的自定义配额`)
  }

  /**
   * 更新用户等级的默认配额
   * @param tier 用户等级
   * @param quota 配额更新
   */
  updateTierQuota(tier: UserTier, quota: Partial<HardwareQuota>): void {
    this.quotas[tier] = {
      ...this.quotas[tier],
      ...quota
    }
    console.log(`[HardwareResourceManager] 已更新 ${tier} 等级的配额配置`)
  }

  /**
   * 将硬件配额转换为Docker资源限制
   * @param quota 硬件配额
   * @returns Docker资源限制配置
   */
  toDockerResourceLimits(quota: HardwareQuota): DockerResourceLimits {
    const limits: DockerResourceLimits = {
      cpuCount: quota.cpuLimit,
      memoryBytes: quota.memoryLimitMB * 1024 * 1024,
      memoryReservationBytes: quota.memoryReservationMB * 1024 * 1024,
      memorySwapBytes: quota.memoryLimitMB * 1024 * 1024 * 2
    }

    if (quota.cpuLimit > 0) {
      limits.cpuQuota = Math.round(quota.cpuLimit * 100000)
      limits.cpuPeriod = 100000
    }

    if (quota.diskIOBps > 0) {
      limits.blkioWeight = Math.min(1000, Math.max(10, quota.priority * 200))
      limits.blkioReadBps = quota.diskIOBps * 1024 * 1024
      limits.blkioWriteBps = quota.diskIOBps * 1024 * 1024
    }

    return limits
  }

  /**
   * 生成Docker run命令的资源限制参数
   * @param quota 硬件配额
   * @returns Docker命令参数数组
   */
  generateDockerResourceArgs(quota: HardwareQuota): string[] {
    const args: string[] = []

    args.push(`--memory=${quota.memoryLimitMB}m`)
    args.push(`--memory-reservation=${quota.memoryReservationMB}m`)
    args.push(`--memory-swap=${quota.memoryLimitMB * 2}m`)

    if (quota.cpuLimit > 0) {
      args.push(`--cpus=${quota.cpuLimit}`)
      args.push(`--cpu-quota=${Math.round(quota.cpuLimit * 100000)}`)
      args.push(`--cpu-period=100000`)
    }

    if (quota.diskIOBps > 0) {
      args.push(`--blkio-weight=${Math.min(1000, Math.max(10, quota.priority * 200))}`)
    }

    return args
  }

  /**
   * 获取所有用户等级的配额配置
   * @returns 所有配额配置
   */
  getAllQuotas(): Record<UserTier, HardwareQuota> {
    return { ...this.quotas }
  }

  /**
   * 验证资源请求是否在配额范围内
   * @param userId 用户ID
   * @param tier 用户等级
   * @param resourceType 资源类型
   * @param requestedValue 请求的资源值
   * @returns 验证结果
   */
  validateResourceRequest(
    userId: string,
    tier: UserTier,
    resourceType: 'cpu' | 'memory' | 'storage' | 'sessions' | 'pty' | 'files',
    requestedValue: number
  ): { allowed: boolean; reason?: string; limit?: number } {
    const quota = this.getUserQuota(userId, tier)

    switch (resourceType) {
      case 'cpu':
        if (requestedValue > quota.cpuLimit) {
          return {
            allowed: false,
            reason: `CPU请求超出限制（最大 ${quota.cpuLimit} 核）`,
            limit: quota.cpuLimit
          }
        }
        break

      case 'memory':
        if (requestedValue > quota.memoryLimitMB) {
          return {
            allowed: false,
            reason: `内存请求超出限制（最大 ${quota.memoryLimitMB}MB）`,
            limit: quota.memoryLimitMB
          }
        }
        break

      case 'storage':
        if (requestedValue > quota.storageQuotaMB) {
          return {
            allowed: false,
            reason: `存储空间超出限制（最大 ${quota.storageQuotaMB}MB）`,
            limit: quota.storageQuotaMB
          }
        }
        break

      case 'sessions':
        if (requestedValue > quota.maxSessions) {
          return {
            allowed: false,
            reason: `会话数超出限制（最大 ${quota.maxSessions} 个）`,
            limit: quota.maxSessions
          }
        }
        break

      case 'pty':
        if (requestedValue > quota.maxPtyProcesses) {
          return {
            allowed: false,
            reason: `PTY进程数超出限制（最大 ${quota.maxPtyProcesses} 个）`,
            limit: quota.maxPtyProcesses
          }
        }
        break

      case 'files':
        if (requestedValue > quota.maxFiles) {
          return {
            allowed: false,
            reason: `文件数超出限制（最大 ${quota.maxFiles} 个）`,
            limit: quota.maxFiles
          }
        }
        break
    }

    return { allowed: true }
  }

  /**
   * 获取资源使用统计
   * @param userId 用户ID
   * @param tier 用户等级
   * @param currentUsage 当前使用情况
   * @returns 资源使用统计
   */
  getResourceUsageStats(
    userId: string,
    tier: UserTier,
    currentUsage: {
      cpuUsage?: number
      memoryUsageMB?: number
      storageUsageMB?: number
      sessionCount?: number
      ptyCount?: number
      fileCount?: number
    }
  ): {
    quota: HardwareQuota
    usage: Record<string, { used: number; limit: number; percent: number }>
    overallUsagePercent: number
  } {
    const quota = this.getUserQuota(userId, tier)

    const usage: Record<string, { used: number; limit: number; percent: number }> = {}

    if (currentUsage.cpuUsage !== undefined) {
      usage.cpu = {
        used: currentUsage.cpuUsage,
        limit: quota.cpuLimit,
        percent: (currentUsage.cpuUsage / quota.cpuLimit) * 100
      }
    }

    if (currentUsage.memoryUsageMB !== undefined) {
      usage.memory = {
        used: currentUsage.memoryUsageMB,
        limit: quota.memoryLimitMB,
        percent: (currentUsage.memoryUsageMB / quota.memoryLimitMB) * 100
      }
    }

    if (currentUsage.storageUsageMB !== undefined) {
      usage.storage = {
        used: currentUsage.storageUsageMB,
        limit: quota.storageQuotaMB,
        percent: (currentUsage.storageUsageMB / quota.storageQuotaMB) * 100
      }
    }

    if (currentUsage.sessionCount !== undefined) {
      usage.sessions = {
        used: currentUsage.sessionCount,
        limit: quota.maxSessions,
        percent: (currentUsage.sessionCount / quota.maxSessions) * 100
      }
    }

    if (currentUsage.ptyCount !== undefined) {
      usage.pty = {
        used: currentUsage.ptyCount,
        limit: quota.maxPtyProcesses,
        percent: (currentUsage.ptyCount / quota.maxPtyProcesses) * 100
      }
    }

    if (currentUsage.fileCount !== undefined) {
      usage.files = {
        used: currentUsage.fileCount,
        limit: quota.maxFiles,
        percent: (currentUsage.fileCount / quota.maxFiles) * 100
      }
    }

    const overallUsagePercent = Object.values(usage).reduce((sum, item) => sum + item.percent, 0) / Object.keys(usage).length

    return {
      quota,
      usage,
      overallUsagePercent
    }
  }
}

// ==================== 单例模式 ====================

let hardwareResourceManager: HardwareResourceManager | null = null

/**
 * 获取硬件资源管理器单例实例
 * @returns 管理器实例
 */
export function getHardwareResourceManager(): HardwareResourceManager {
  if (!hardwareResourceManager) {
    hardwareResourceManager = new HardwareResourceManager()
  }
  return hardwareResourceManager
}

export default HardwareResourceManager
