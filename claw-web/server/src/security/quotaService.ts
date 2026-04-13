/**
 * 资源配额管理服务
 * 
 * 功能：
 * - 用户资源配额管理
 * - 资源使用统计
 * - 配额限制检查
 * - 资源使用预警
 * 
 * 使用场景：
 * - 限制用户可创建的项目数量
 * - 限制用户可使用的存储空间
 * - 限制用户可使用的网络带宽
 * - 防止资源滥用
 */

// ==================== 类型定义 ====================

/**
 * 资源配额
 */
export interface ResourceQuota {
  userId: string
  maxProjects: number
  maxDomains: number
  maxTunnels: number
  maxMemoryMB: number
  maxStorageMB: number
  maxBandwidthKBps: number
  maxCpuCores: number
  createdAt: Date
  updatedAt: Date
}

/**
 * 资源使用情况
 */
export interface ResourceUsage {
  userId: string
  projects: number
  domains: number
  tunnels: number
  memoryMB: number
  storageMB: number
  bandwidthKBps: number
  cpuCores: number
  recordedAt: Date
}

/**
 * 配额检查结果
 */
export interface QuotaCheckResult {
  allowed: boolean
  resource: string
  current: number
  limit: number
  remaining: number
  percentage: number
  warning?: string
}

/**
 * 配额警告级别
 */
export type WarningLevel = 'normal' | 'warning' | 'critical'

// ==================== 资源配额服务 ====================

export class QuotaService {
  private defaultQuotas: Map<string, Partial<ResourceQuota>>
  private usageCache: Map<string, ResourceUsage>

  constructor() {
    this.defaultQuotas = new Map()
    this.usageCache = new Map()
    this.initializeDefaultQuotas()
  }

  /**
   * 初始化默认配额
   */
  private initializeDefaultQuotas() {
    // 免费用户配额
    this.defaultQuotas.set('free', {
      maxProjects: 3,
      maxDomains: 1,
      maxTunnels: 2,
      maxMemoryMB: 512,
      maxStorageMB: 1024, // 1 GB
      maxBandwidthKBps: 1024, // 1 MB/s
      maxCpuCores: 0.5
    })

    // 基础用户配额
    this.defaultQuotas.set('basic', {
      maxProjects: 10,
      maxDomains: 5,
      maxTunnels: 5,
      maxMemoryMB: 2048,
      maxStorageMB: 10240, // 10 GB
      maxBandwidthKBps: 5120, // 5 MB/s
      maxCpuCores: 1.0
    })

    // 专业用户配额
    this.defaultQuotas.set('pro', {
      maxProjects: 50,
      maxDomains: 20,
      maxTunnels: 20,
      maxMemoryMB: 8192,
      maxStorageMB: 51200, // 50 GB
      maxBandwidthKBps: 20480, // 20 MB/s
      maxCpuCores: 4.0
    })

    // 企业用户配额
    this.defaultQuotas.set('enterprise', {
      maxProjects: 100,
      maxDomains: 50,
      maxTunnels: 50,
      maxMemoryMB: 32768,
      maxStorageMB: 204800, // 200 GB
      maxBandwidthKBps: 102400, // 100 MB/s
      maxCpuCores: 8.0
    })
  }

  /**
   * 获取用户配额
   */
  async getUserQuota(userId: string): Promise<ResourceQuota> {
    // TODO: 从数据库获取用户配额
    // 这里返回默认配额
    const defaultQuota = this.defaultQuotas.get('basic')!
    
    return {
      userId,
      ...defaultQuota,
      createdAt: new Date(),
      updatedAt: new Date()
    } as ResourceQuota
  }

  /**
   * 获取用户资源使用情况
   */
  async getUserUsage(userId: string): Promise<ResourceUsage> {
    // 检查缓存
    const cached = this.usageCache.get(userId)
    if (cached && Date.now() - cached.recordedAt.getTime() < 60000) {
      return cached
    }

    // TODO: 从数据库获取实际使用情况
    const usage: ResourceUsage = {
      userId,
      projects: 0,
      domains: 0,
      tunnels: 0,
      memoryMB: 0,
      storageMB: 0,
      bandwidthKBps: 0,
      cpuCores: 0,
      recordedAt: new Date()
    }

    // 更新缓存
    this.usageCache.set(userId, usage)

    return usage
  }

  /**
   * 检查资源配额
   */
  async checkQuota(
    userId: string,
    resource: keyof Omit<ResourceQuota, 'userId' | 'createdAt' | 'updatedAt'>
  ): Promise<QuotaCheckResult> {
    const quota = await this.getUserQuota(userId)
    const usage = await this.getUserUsage(userId)

    const limit = quota[resource] as number
    const current = usage[resource] as number
    const remaining = Math.max(0, limit - current)
    const percentage = limit > 0 ? (current / limit) * 100 : 0

    let warning: string | undefined
    if (percentage >= 90) {
      warning = `${this.getResourceName(resource)}使用率已达 ${percentage.toFixed(1)}%，即将达到上限`
    } else if (percentage >= 75) {
      warning = `${this.getResourceName(resource)}使用率已达 ${percentage.toFixed(1)}%，请注意`
    }

    return {
      allowed: current < limit,
      resource,
      current,
      limit,
      remaining,
      percentage,
      warning
    }
  }

  /**
   * 检查是否可以创建新资源
   */
  async canCreateResource(
    userId: string,
    resourceType: 'project' | 'domain' | 'tunnel'
  ): Promise<boolean> {
    const resourceMap = {
      project: 'maxProjects',
      domain: 'maxDomains',
      tunnel: 'maxTunnels'
    }

    const quotaKey = resourceMap[resourceType] as keyof ResourceQuota
    const result = await this.checkQuota(userId, quotaKey)

    return result.allowed
  }

  /**
   * 更新用户配额
   */
  async updateUserQuota(
    userId: string,
    updates: Partial<ResourceQuota>
  ): Promise<boolean> {
    // TODO: 更新数据库中的配额
    console.log(`[QuotaService] 更新用户 ${userId} 配额:`, updates)
    return true
  }

  /**
   * 增加资源使用量
   */
  async incrementUsage(
    userId: string,
    resource: keyof Omit<ResourceUsage, 'userId' | 'recordedAt'>,
    amount: number = 1
  ): Promise<void> {
    const usage = await this.getUserUsage(userId)
    usage[resource] += amount
    usage.recordedAt = new Date()
    
    this.usageCache.set(userId, usage)
    
    console.log(`[QuotaService] 用户 ${userId} ${resource} 使用量增加 ${amount}`)
  }

  /**
   * 减少资源使用量
   */
  async decrementUsage(
    userId: string,
    resource: keyof Omit<ResourceUsage, 'userId' | 'recordedAt'>,
    amount: number = 1
  ): Promise<void> {
    const usage = await this.getUserUsage(userId)
    usage[resource] = Math.max(0, usage[resource] - amount)
    usage.recordedAt = new Date()
    
    this.usageCache.set(userId, usage)
    
    console.log(`[QuotaService] 用户 ${userId} ${resource} 使用量减少 ${amount}`)
  }

  /**
   * 获取资源名称
   */
  private getResourceName(resource: string): string {
    const names: Record<string, string> = {
      maxProjects: '项目数量',
      maxDomains: '域名数量',
      maxTunnels: '隧道数量',
      maxMemoryMB: '内存使用',
      maxStorageMB: '存储空间',
      maxBandwidthKBps: '网络带宽',
      maxCpuCores: 'CPU 核心'
    }
    return names[resource] || resource
  }

  /**
   * 获取所有配额检查结果
   */
  async getAllQuotaChecks(userId: string): Promise<Record<string, QuotaCheckResult>> {
    const resources = [
      'maxProjects',
      'maxDomains',
      'maxTunnels',
      'maxMemoryMB',
      'maxStorageMB',
      'maxBandwidthKBps',
      'maxCpuCores'
    ] as const

    const results: Record<string, QuotaCheckResult> = {}

    for (const resource of resources) {
      results[resource] = await this.checkQuota(userId, resource)
    }

    return results
  }

  /**
   * 检查警告级别
   */
  getWarningLevel(percentage: number): WarningLevel {
    if (percentage >= 90) return 'critical'
    if (percentage >= 75) return 'warning'
    return 'normal'
  }
}

// ==================== 单例实例 ====================

let quotaService: QuotaService | null = null

/**
 * 获取配额服务实例
 */
export function getQuotaService(): QuotaService {
  if (!quotaService) {
    quotaService = new QuotaService()
  }
  return quotaService
}
