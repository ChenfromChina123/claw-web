/**
 * 用户配额管理 API 接口
 */

import apiClient from './client'
import { unwrapApiData } from './unwrapApiResponse'

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
 * 硬件配额配置
 */
export interface HardwareQuota {
  tierName: string
  displayName: string
  cpuLimit: number
  memoryLimitMB: number
  memoryReservationMB: number
  storageQuotaMB: number
  maxSessions: number
  maxPtyProcesses: number
  maxFiles: number
  maxFileSizeMB: number
  networkBandwidthKBps: number
  diskIOBps: number
  priority: number
  description: string
}

/**
 * 用户配额信息
 */
export interface UserQuotaInfo {
  userId: string
  username: string
  tier: UserTier
  quota: HardwareQuota
  hasCustomQuota: boolean
}

/**
 * 资源使用统计
 */
export interface ResourceUsageStats {
  quota: HardwareQuota
  usage: {
    cpu?: { used: number; limit: number; percent: number }
    memory?: { used: number; limit: number; percent: number }
    storage?: { used: number; limit: number; percent: number }
    sessions?: { used: number; limit: number; percent: number }
    pty?: { used: number; limit: number; percent: number }
    files?: { used: number; limit: number; percent: number }
  }
  overallUsagePercent: number
}

/**
 * 用户信息（包含等级）
 */
export interface UserWithTier {
  id: string
  username: string
  email: string
  tier: UserTier
  subscriptionExpiresAt?: string
  createdAt: string
  lastLogin?: string
}

export const userTierApi = {
  /**
   * 获取所有用户等级的硬件配额配置
   */
  async getAllQuotas(): Promise<Record<UserTier, HardwareQuota>> {
    const response = await apiClient.get<Record<UserTier, HardwareQuota>>('/tier/quotas')
    return unwrapApiData(response.data)
  },

  /**
   * 获取当前用户的配额信息
   */
  async getMyQuota(): Promise<UserQuotaInfo> {
    const response = await apiClient.get<UserQuotaInfo>('/tier/my-quota')
    return unwrapApiData(response.data)
  },

  /**
   * 更新用户等级（管理员权限）
   */
  async updateUserTier(userId: string, tier: UserTier, subscriptionExpiresAt?: string): Promise<{ message: string }> {
    const response = await apiClient.put<{ message: string }>(`/tier/update/${userId}`, {
      tier,
      subscriptionExpiresAt
    })
    return unwrapApiData(response.data)
  },

  /**
   * 设置用户自定义配额（管理员权限）
   */
  async setCustomQuota(userId: string, quota: Partial<HardwareQuota>): Promise<{ message: string }> {
    const response = await apiClient.put<{ message: string }>(`/tier/custom-quota/${userId}`, quota)
    return unwrapApiData(response.data)
  },

  /**
   * 获取用户资源使用统计
   */
  async getUsageStats(userId: string): Promise<ResourceUsageStats> {
    const response = await apiClient.get<ResourceUsageStats>(`/tier/usage-stats/${userId}`)
    return unwrapApiData(response.data)
  },

  /**
   * 获取所有用户列表（管理员权限）
   */
  async getAllUsers(): Promise<UserWithTier[]> {
    const response = await apiClient.get<UserWithTier[]>('/tier/users')
    return unwrapApiData(response.data)
  }
}
