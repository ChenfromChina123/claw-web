/**
 * 容器编排器类型定义模块
 *
 * 功能：
 * - 定义所有容器相关的接口类型
 * - 提供默认配置常量
 * - 统一管理类型导出
 *
 * 使用场景：
 * - 所有容器管理相关模块的基础依赖
 * - 确保类型定义的一致性
 */

import { UserTier } from '../config/hardwareResourceConfig'

// ==================== 接口定义 ====================

/**
 * 容器实例信息
 */
export interface ContainerInstance {
  /** 容器ID */
  containerId: string
  /** 容器名称 */
  containerName: string
  /** 映射到宿主机的端口 */
  hostPort: number
  /** 容器状态 */
  status: 'running' | 'stopped' | 'creating' | 'error' | 'assigned' | 'paused'
  /** 关联的用户ID（如果有） */
  assignedUserId?: string
  /** 创建时间 */
  createdAt: Date
  /** 最后活动时间 */
  lastActivityAt: Date
  /** 资源使用情况 */
  resourceUsage?: {
    memoryMB: number
    cpuPercent: number
  }
}

/**
 * 用户容器映射信息
 */
export interface UserContainerMapping {
  /** 用户ID */
  userId: string
  /** 用户名（可选） */
  username?: string
  /** 用户等级（可选） */
  userTier?: UserTier
  /** 容器实例 */
  container: ContainerInstance
  /** 分配时间 */
  assignedAt: Date
  /** 会话统计 */
  sessionCount: number
  /** 最后活动时间 */
  lastActivityAt: Date
}

/**
 * 容器池配置
 */
export interface PoolConfig {
  /** 容器健康检查间隔（毫秒）*/
  healthCheckIntervalMs: number
  /** Docker镜像名称 */
  imageName: string
  /**
   * 网络名称
   * 安全说明：Worker 容器应该使用与 MySQL 隔离的网络（如 worker-network）
   * 以防止 Worker 容器直接访问数据库，即使应用层被绕过也无法连接 MySQL
   */
  networkName: string
  /** 基础端口号（从该端口开始分配）*/
  basePort: number
  /** 宿主机工作空间根目录（Bind Mount 目标）*/
  hostWorkspacePath: string
  /** 磁盘空间告警阈值（百分比）*/
  diskWarningThreshold: number
  /** 磁盘空间严重告警阈值（百分比）*/
  diskCriticalThreshold: number
  /** 是否启用自动 Docker 清理 */
  enableAutoCleanup: boolean
  /** Docker 清理间隔（毫秒），默认 1 小时 */
  cleanupIntervalMs: number
  /** Docker 清理时是否删除未使用的镜像 */
  cleanupUnusedImages: boolean
  /** Docker 清理时是否删除孤立卷 */
  cleanupOrphanedVolumes: boolean
}

/**
 * 编排结果
 */
export interface OrchestratorResult<T = any> {
  success: boolean
  data?: T
  error?: string
  code?: string
}

// ==================== 默认配置 ====================

/**
 * 默认配置（优先从环境变量读取，提供合理的默认值）
 */
export const DEFAULT_POOL_CONFIG: Required<PoolConfig> = {
  healthCheckIntervalMs: parseInt(process.env.CONTAINER_HEALTH_CHECK_INTERVAL || '60000', 10),
  imageName: process.env.WORKER_IMAGE_NAME || 'claw-web-backend-worker:latest',
  networkName: process.env.DOCKER_NETWORK_NAME || 'claw-web_worker-network',
  basePort: parseInt(process.env.CONTAINER_BASE_PORT || '3100', 10),
  hostWorkspacePath: process.env.HOST_WORKSPACE_PATH || '/data/claws/workspaces',
  diskWarningThreshold: parseInt(process.env.DISK_WARNING_THRESHOLD || '80', 10),
  diskCriticalThreshold: parseInt(process.env.DISK_CRITICAL_THRESHOLD || '90', 10),
  enableAutoCleanup: process.env.ENABLE_DOCKER_AUTO_CLEANUP === 'true',
  cleanupIntervalMs: parseInt(process.env.DOCKER_CLEANUP_INTERVAL_MS || '3600000', 10),
  cleanupUnusedImages: process.env.DOCKER_CLEANUP_IMAGES !== 'false',
  cleanupOrphanedVolumes: process.env.DOCKER_CLEANUP_VOLUMES === 'true',
}

// ==================== 工具函数 ====================

/**
 * 获取Worker容器内部端口（用于容器内健康检查）
 */
export function getWorkerInternalPort(): number {
  const { DEFAULT_WORKER_PORT } = require('../../shared/constants')
  return DEFAULT_WORKER_PORT
}

// ==================== 运行时类型元数据（供测试使用）====================

/**
 * 运行时类型信息（TypeScript 类型在编译后会被擦除，此对象保留类型名称用于验证）
 */
export const _typeMetadata = {
  // 接口类型
  interfaces: [
    'ContainerInstance',
    'UserContainerMapping',
    'PoolConfig',
    'OrchestratorResult'
  ],
  // 类型别名
  typeAliases: [
    'PermissionLevel',
    'ToolCategory'
  ],
  // 常量
  constants: [
    'DEFAULT_POOL_CONFIG'
  ]
} as const

// 为了兼容性，导出类型名称字符串（运行时可访问）
export const ContainerInstance = 'ContainerInstance' as any
export const UserContainerMapping = 'UserContainerMapping' as any
export const PoolConfig = 'PoolConfig' as any
export const OrchestratorResult = 'OrchestratorResult' as any
