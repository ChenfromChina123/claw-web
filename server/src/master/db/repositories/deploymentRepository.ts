/**
 * 项目部署数据库仓库
 *
 * 功能：
 * - 项目部署的 CRUD 操作
 * - 部署日志管理
 * - 部署事件记录
 *
 * 使用场景：
 * - ProjectDeploymentService 的数据持久化
 */

import { getPool } from '../mysql'
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise'

// ==================== 类型定义 ====================

/**
 * 项目部署记录
 */
export interface DeploymentRecord {
  id: string
  user_id: string
  name: string
  type: 'nodejs' | 'python' | 'static' | 'custom'
  status: 'running' | 'stopped' | 'error' | 'building'
  worker_container_id: string
  worker_port: number
  internal_port: number
  domain?: string
  domain_id?: string
  external_access_enabled: boolean
  external_access_type?: 'subdomain' | 'custom' | 'tunnel'
  source_path: string
  source_type: 'upload' | 'git' | 'template'
  source_url?: string
  build_command?: string
  start_command: string
  env_vars?: Record<string, string>
  process_manager: 'pm2' | 'supervisor'
  memory_limit: string
  auto_restart: boolean
  restart_count: number
  last_restart_at?: Date
  created_at: Date
  updated_at: Date
}

/**
 * 创建部署请求
 */
export interface CreateDeploymentRequest {
  id: string
  user_id: string
  name: string
  type: 'nodejs' | 'python' | 'static' | 'custom'
  worker_container_id: string
  worker_port: number
  internal_port: number
  source_path: string
  source_type: 'upload' | 'git' | 'template'
  source_url?: string
  build_command?: string
  start_command: string
  env_vars?: Record<string, string>
  process_manager: 'pm2' | 'supervisor'
  memory_limit?: string
  auto_restart?: boolean
}

/**
 * 部署日志记录
 */
export interface DeploymentLogRecord {
  id: string
  project_id: string
  type: 'stdout' | 'stderr' | 'system'
  message: string
  created_at: Date
}

/**
 * 部署事件记录
 */
export interface DeploymentEventRecord {
  id: string
  project_id: string
  event_type: 'created' | 'started' | 'stopped' | 'restarted' | 'deleted' | 'error'
  event_data?: Record<string, any>
  created_at: Date
}

// ==================== 部署仓库 ====================

export class DeploymentRepository {
  private pool: Pool | null

  constructor() {
    this.pool = getPool()
  }

  /**
   * 创建项目部署
   */
  async createDeployment(request: CreateDeploymentRequest): Promise<boolean> {
    if (!this.pool) return false

    try {
      await this.pool.execute(
        `INSERT INTO project_deployments (
          id, user_id, name, type, status,
          worker_container_id, worker_port, internal_port,
          source_path, source_type, source_url,
          build_command, start_command, env_vars,
          process_manager, memory_limit, auto_restart
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          request.id,
          request.user_id,
          request.name,
          request.type,
          'building',
          request.worker_container_id,
          request.worker_port,
          request.internal_port,
          request.source_path,
          request.source_type,
          request.source_url || null,
          request.build_command || null,
          request.start_command,
          request.env_vars ? JSON.stringify(request.env_vars) : null,
          request.process_manager,
          request.memory_limit || '256M',
          request.auto_restart ?? true
        ]
      )

      // 记录创建事件
      await this.createEvent(request.id, 'created', { user_id: request.user_id })

      return true
    } catch (error) {
      console.error('[DeploymentRepository] 创建部署失败:', error)
      return false
    }
  }

  /**
   * 获取部署详情
   */
  async getDeployment(projectId: string, userId: string): Promise<DeploymentRecord | null> {
    if (!this.pool) return null

    try {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT * FROM project_deployments WHERE id = ? AND user_id = ?`,
        [projectId, userId]
      )

      if (rows.length === 0) return null

      return this.mapRowToRecord(rows[0])
    } catch (error) {
      console.error('[DeploymentRepository] 获取部署失败:', error)
      return null
    }
  }

  /**
   * 获取部署详情（仅通过 projectId）
   */
  async getDeploymentById(projectId: string): Promise<DeploymentRecord | null> {
    if (!this.pool) return null

    try {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT * FROM project_deployments WHERE id = ?`,
        [projectId]
      )

      if (rows.length === 0) return null

      return this.mapRowToRecord(rows[0])
    } catch (error) {
      console.error('[DeploymentRepository] 获取部署失败:', error)
      return null
    }
  }

  /**
   * 获取用户的所有部署
   */
  async getUserDeployments(userId: string): Promise<DeploymentRecord[]> {
    if (!this.pool) return []

    try {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT * FROM project_deployments WHERE user_id = ? ORDER BY created_at DESC`,
        [userId]
      )

      return rows.map(row => this.mapRowToRecord(row))
    } catch (error) {
      console.error('[DeploymentRepository] 获取用户部署失败:', error)
      return []
    }
  }

  /**
   * 更新部署状态
   */
  async updateStatus(
    projectId: string,
    status: DeploymentRecord['status'],
    error?: string
  ): Promise<boolean> {
    if (!this.pool) return false

    try {
      await this.pool.execute(
        `UPDATE project_deployments SET status = ?, updated_at = NOW() WHERE id = ?`,
        [status, projectId]
      )

      // 记录事件
      if (status === 'running') {
        await this.createEvent(projectId, 'started')
      } else if (status === 'stopped') {
        await this.createEvent(projectId, 'stopped')
      } else if (status === 'error') {
        await this.createEvent(projectId, 'error', { error })
      }

      return true
    } catch (err) {
      console.error('[DeploymentRepository] 更新状态失败:', err)
      return false
    }
  }

  /**
   * 更新部署域名信息
   */
  async updateDomain(
    projectId: string,
    domain: string,
    domainId: string,
    accessType: 'subdomain' | 'custom' | 'tunnel'
  ): Promise<boolean> {
    if (!this.pool) return false

    try {
      await this.pool.execute(
        `UPDATE project_deployments SET
          domain = ?, domain_id = ?, external_access_enabled = TRUE, external_access_type = ?,
          updated_at = NOW()
        WHERE id = ?`,
        [domain, domainId, accessType, projectId]
      )
      return true
    } catch (error) {
      console.error('[DeploymentRepository] 更新域名失败:', error)
      return false
    }
  }

  /**
   * 禁用外部访问
   */
  async disableExternalAccess(projectId: string): Promise<boolean> {
    if (!this.pool) return false

    try {
      await this.pool.execute(
        `UPDATE project_deployments SET
          external_access_enabled = FALSE, domain = NULL, domain_id = NULL,
          updated_at = NOW()
        WHERE id = ?`,
        [projectId]
      )
      return true
    } catch (error) {
      console.error('[DeploymentRepository] 禁用外部访问失败:', error)
      return false
    }
  }

  /**
   * 记录重启
   */
  async recordRestart(projectId: string): Promise<boolean> {
    if (!this.pool) return false

    try {
      await this.pool.execute(
        `UPDATE project_deployments SET
          restart_count = restart_count + 1, last_restart_at = NOW(),
          updated_at = NOW()
        WHERE id = ?`,
        [projectId]
      )

      await this.createEvent(projectId, 'restarted')
      return true
    } catch (error) {
      console.error('[DeploymentRepository] 记录重启失败:', error)
      return false
    }
  }

  /**
   * 删除部署
   */
  async deleteDeployment(projectId: string, userId: string): Promise<boolean> {
    if (!this.pool) return false

    try {
      await this.createEvent(projectId, 'deleted', { user_id: userId })

      const [result] = await this.pool.execute<ResultSetHeader>(
        `DELETE FROM project_deployments WHERE id = ? AND user_id = ?`,
        [projectId, userId]
      )

      return result.affectedRows > 0
    } catch (error) {
      console.error('[DeploymentRepository] 删除部署失败:', error)
      return false
    }
  }

  /**
   * 添加部署日志
   */
  async addLog(projectId: string, type: DeploymentLogRecord['type'], message: string): Promise<boolean> {
    if (!this.pool) return false

    try {
      await this.pool.execute(
        `INSERT INTO project_deployment_logs (id, project_id, type, message) VALUES (UUID(), ?, ?, ?)`,
        [projectId, type, message]
      )
      return true
    } catch (error) {
      console.error('[DeploymentRepository] 添加日志失败:', error)
      return false
    }
  }

  /**
   * 获取部署日志
   */
  async getLogs(projectId: string, limit: number = 100): Promise<DeploymentLogRecord[]> {
    if (!this.pool) return []

    try {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT * FROM project_deployment_logs
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [projectId, limit]
      )

      return rows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        type: row.type,
        message: row.message,
        created_at: row.created_at
      }))
    } catch (error) {
      console.error('[DeploymentRepository] 获取日志失败:', error)
      return []
    }
  }

  /**
   * 创建部署事件
   */
  async createEvent(
    projectId: string,
    eventType: DeploymentEventRecord['event_type'],
    eventData?: Record<string, any>
  ): Promise<boolean> {
    if (!this.pool) return false

    try {
      await this.pool.execute(
        `INSERT INTO project_deployment_events (id, project_id, event_type, event_data)
         VALUES (UUID(), ?, ?, ?)`,
        [projectId, eventType, eventData ? JSON.stringify(eventData) : null]
      )
      return true
    } catch (error) {
      console.error('[DeploymentRepository] 创建事件失败:', error)
      return false
    }
  }

  /**
   * 获取部署事件
   */
  async getEvents(projectId: string, limit: number = 50): Promise<DeploymentEventRecord[]> {
    if (!this.pool) return []

    try {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT * FROM project_deployment_events
         WHERE project_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [projectId, limit]
      )

      return rows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        event_type: row.event_type,
        event_data: row.event_data ? JSON.parse(row.event_data) : undefined,
        created_at: row.created_at
      }))
    } catch (error) {
      console.error('[DeploymentRepository] 获取事件失败:', error)
      return []
    }
  }

  /**
   * 获取 Worker 容器上的所有部署
   */
  async getDeploymentsByContainer(containerId: string): Promise<DeploymentRecord[]> {
    if (!this.pool) return []

    try {
      const [rows] = await this.pool.execute<RowDataPacket[]>(
        `SELECT * FROM project_deployments WHERE worker_container_id = ?`,
        [containerId]
      )

      return rows.map(row => this.mapRowToRecord(row))
    } catch (error) {
      console.error('[DeploymentRepository] 获取容器部署失败:', error)
      return []
    }
  }

  /**
   * 映射数据库行到记录
   */
  private mapRowToRecord(row: RowDataPacket): DeploymentRecord {
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      type: row.type,
      status: row.status,
      worker_container_id: row.worker_container_id,
      worker_port: row.worker_port,
      internal_port: row.internal_port,
      domain: row.domain,
      domain_id: row.domain_id,
      external_access_enabled: row.external_access_enabled === 1,
      external_access_type: row.external_access_type,
      source_path: row.source_path,
      source_type: row.source_type,
      source_url: row.source_url,
      build_command: row.build_command,
      start_command: row.start_command,
      env_vars: row.env_vars ? JSON.parse(row.env_vars) : undefined,
      process_manager: row.process_manager,
      memory_limit: row.memory_limit,
      auto_restart: row.auto_restart === 1,
      restart_count: row.restart_count,
      last_restart_at: row.last_restart_at,
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  }
}

// ==================== 单例实例 ====================

let deploymentRepository: DeploymentRepository | null = null

/**
 * 获取部署仓库实例
 */
export function getDeploymentRepository(): DeploymentRepository {
  if (!deploymentRepository) {
    deploymentRepository = new DeploymentRepository()
  }
  return deploymentRepository
}
