/**
 * 远程 Worker 注册表
 *
 * 功能：
 * - 管理远程 Worker 列表
 * - 宽松的健康检查（不关闭 Worker，只标记状态）
 * - 负载均衡（选择合适的远程 Worker）
 * - 数据库持久化
 *
 * @module RemoteWorkerRegistry
 */

import type { RemoteWorkerInstance } from './types'
import { getPool } from '../db/mysql'

/**
 * 远程 Worker 注册表类
 */
export class RemoteWorkerRegistry {
  private workers: Map<string, RemoteWorkerInstance> = new Map()
  private healthCheckTimer: NodeJS.Timeout | null = null
  private readonly HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 分钟检查一次
  private readonly HEALTH_CHECK_TIMEOUT_MS = 30000 // 30 秒超时
  private masterToken: string

  constructor() {
    this.masterToken = process.env.MASTER_INTERNAL_TOKEN || 'internal-master-worker-token-2024'
  }

  /**
   * 初始化注册表
   * 从数据库加载已有的远程 Worker
   */
  async initialize(): Promise<void> {
    console.log('[RemoteWorkerRegistry] 初始化注册表...')
    await this.loadWorkersFromDB()
    this.startHealthCheckLoop()
    console.log('[RemoteWorkerRegistry] 注册表初始化完成')
  }

  /**
   * 从数据库加载 Worker 列表
   */
  private async loadWorkersFromDB(): Promise<void> {
    try {
      const pool = getPool()
      const [rows] = await pool.query(
        'SELECT * FROM remote_workers WHERE status IN (?, ?, ?)',
        ['running', 'deploying', 'error']
      ) as [any[], unknown]

      for (const row of rows) {
        const worker: RemoteWorkerInstance = {
          workerId: row.id,
          host: row.host,
          port: row.port,
          sshPort: row.ssh_port,
          sshUsername: row.ssh_username,
          sshPasswordEncrypted: row.ssh_password_encrypted,
          status: row.status,
          healthStatus: row.health_status,
          labels: row.labels ? JSON.parse(row.labels) : undefined,
          lastHeartbeatAt: row.last_heartbeat ? new Date(row.last_heartbeat) : undefined,
          dockerVersion: row.docker_version,
          systemInfo: row.system_info ? JSON.parse(row.system_info) : undefined,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at)
        }
        this.workers.set(worker.workerId, worker)
      }

      console.log(`[RemoteWorkerRegistry] 从数据库加载了 ${rows.length} 个远程 Worker`)
    } catch (error) {
      console.warn('[RemoteWorkerRegistry] 从数据库加载 Worker 失败:', error)
    }
  }

  /**
   * 创建新的 Worker 记录
   */
  async createWorker(worker: RemoteWorkerInstance): Promise<void> {
    this.workers.set(worker.workerId, worker)

    try {
      const pool = getPool()
      await pool.query(
        `INSERT INTO remote_workers (
          id, host, port, ssh_port, ssh_username, ssh_password_encrypted,
          status, health_status, labels, docker_version, system_info, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          worker.workerId,
          worker.host,
          worker.port,
          worker.sshPort,
          worker.sshUsername,
          worker.sshPasswordEncrypted,
          worker.status,
          worker.healthStatus,
          worker.labels ? JSON.stringify(worker.labels) : null,
          worker.dockerVersion,
          worker.systemInfo ? JSON.stringify(worker.systemInfo) : null,
          worker.createdAt,
          worker.updatedAt
        ]
      )
    } catch (error) {
      console.error('[RemoteWorkerRegistry] 保存 Worker 到数据库失败:', error)
    }
  }

  /**
   * 更新 Worker 信息
   */
  async updateWorker(workerId: string, updates: Partial<RemoteWorkerInstance>): Promise<void> {
    const worker = this.workers.get(workerId)
    if (!worker) {
      console.warn(`[RemoteWorkerRegistry] Worker 不存在: ${workerId}`)
      return
    }

    // 更新内存中的记录
    Object.assign(worker, updates, { updatedAt: new Date() })

    // 更新数据库
    try {
      const pool = getPool()
      const fields: string[] = []
      const values: any[] = []

      if (updates.status !== undefined) {
        fields.push('status = ?')
        values.push(updates.status)
      }
      if (updates.healthStatus !== undefined) {
        fields.push('health_status = ?')
        values.push(updates.healthStatus)
      }
      if (updates.labels !== undefined) {
        fields.push('labels = ?')
        values.push(JSON.stringify(updates.labels))
      }
      if (updates.dockerVersion !== undefined) {
        fields.push('docker_version = ?')
        values.push(updates.dockerVersion)
      }
      if (updates.systemInfo !== undefined) {
        fields.push('system_info = ?')
        values.push(JSON.stringify(updates.systemInfo))
      }
      if (updates.lastHeartbeatAt !== undefined) {
        fields.push('last_heartbeat = ?')
        values.push(updates.lastHeartbeatAt)
      }

      if (fields.length > 0) {
        fields.push('updated_at = ?')
        values.push(new Date())
        values.push(workerId)

        await pool.query(
          `UPDATE remote_workers SET ${fields.join(', ')} WHERE id = ?`,
          values
        )
      }
    } catch (error) {
      console.error('[RemoteWorkerRegistry] 更新 Worker 数据库记录失败:', error)
    }
  }

  /**
   * 更新 Worker 状态
   */
  async updateWorkerStatus(
    workerId: string,
    status: RemoteWorkerInstance['status'],
    healthStatus: RemoteWorkerInstance['healthStatus']
  ): Promise<void> {
    await this.updateWorker(workerId, { status, healthStatus })
  }

  /**
   * 获取 Worker
   */
  getWorker(workerId: string): RemoteWorkerInstance | undefined {
    return this.workers.get(workerId)
  }

  /**
   * 获取所有 Worker
   */
  getAllWorkers(): RemoteWorkerInstance[] {
    return Array.from(this.workers.values())
  }

  /**
   * 获取健康的 Worker 列表
   */
  getHealthyWorkers(): RemoteWorkerInstance[] {
    return this.getAllWorkers().filter(
      w => w.status === 'running' && w.healthStatus === 'healthy'
    )
  }

  /**
   * 删除 Worker
   */
  async removeWorker(workerId: string): Promise<void> {
    this.workers.delete(workerId)

    try {
      const pool = getPool()
      await pool.query('DELETE FROM remote_workers WHERE id = ?', [workerId])
    } catch (error) {
      console.error('[RemoteWorkerRegistry] 从数据库删除 Worker 失败:', error)
    }
  }

  /**
   * 选择一个可用的 Worker（简单轮询）
   */
  selectWorker(): RemoteWorkerInstance | null {
    const healthyWorkers = this.getHealthyWorkers()
    if (healthyWorkers.length === 0) {
      return null
    }

    // 简单轮询：选择最近最少使用的
    return healthyWorkers.sort(
      (a, b) => (a.lastHeartbeatAt?.getTime() || 0) - (b.lastHeartbeatAt?.getTime() || 0)
    )[0]
  }

  /**
   * 启动健康检查循环
   */
  private startHealthCheckLoop(): void {
    const checkLoop = async () => {
      try {
        await this.performHealthChecks()
      } catch (error) {
        console.error('[RemoteWorkerRegistry] 健康检查循环出错:', error)
      } finally {
        if (this.healthCheckTimer) {
          this.healthCheckTimer = setTimeout(checkLoop, this.HEALTH_CHECK_INTERVAL_MS) as any
        }
      }
    }

    this.healthCheckTimer = setTimeout(checkLoop, this.HEALTH_CHECK_INTERVAL_MS) as any
    console.log('[RemoteWorkerRegistry] 健康检查循环已启动（间隔: 5分钟）')
  }

  /**
   * 停止健康检查循环
   */
  stopHealthCheckLoop(): void {
    if (this.healthCheckTimer) {
      clearTimeout(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  /**
   * 执行健康检查
   * 注意：远程 Worker 只标记状态，不关闭
   */
  private async performHealthChecks(): Promise<void> {
    const runningWorkers = this.getAllWorkers().filter(w => w.status === 'running')

    for (const worker of runningWorkers) {
      const isHealthy = await this.checkWorkerHealth(worker)

      if (isHealthy) {
        if (worker.healthStatus !== 'healthy') {
          console.log(`[RemoteWorkerRegistry] Worker 恢复健康: ${worker.workerId}`)
          await this.updateWorker(worker.workerId, {
            healthStatus: 'healthy',
            lastHeartbeatAt: new Date()
          })
        }
      } else {
        if (worker.healthStatus !== 'unhealthy') {
          console.warn(`[RemoteWorkerRegistry] Worker 不健康: ${worker.workerId}`)
          await this.updateWorker(worker.workerId, {
            healthStatus: 'unhealthy',
            lastHeartbeatAt: new Date()
          })
        }
      }
    }
  }

  /**
   * 检查单个 Worker 的健康状态
   */
  private async checkWorkerHealth(worker: RemoteWorkerInstance): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.HEALTH_CHECK_TIMEOUT_MS)

      const response = await fetch(`http://${worker.host}:${worker.port}/internal/health`, {
        method: 'GET',
        headers: { 'X-Master-Token': this.masterToken },
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      return response.ok
    } catch (error) {
      return false
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number
    running: number
    healthy: number
    unhealthy: number
    offline: number
    error: number
  } {
    const all = this.getAllWorkers()
    return {
      total: all.length,
      running: all.filter(w => w.status === 'running').length,
      healthy: all.filter(w => w.healthStatus === 'healthy').length,
      unhealthy: all.filter(w => w.healthStatus === 'unhealthy').length,
      offline: all.filter(w => w.status === 'offline').length,
      error: all.filter(w => w.status === 'error').length
    }
  }
}

/**
 * 远程 Worker 注册表单例实例
 */
let remoteWorkerRegistry: RemoteWorkerRegistry | null = null

/**
 * 获取远程 Worker 注册表实例
 */
export function getRemoteWorkerRegistry(): RemoteWorkerRegistry {
  if (!remoteWorkerRegistry) {
    remoteWorkerRegistry = new RemoteWorkerRegistry()
  }
  return remoteWorkerRegistry
}

/**
 * 初始化远程 Worker 注册表
 */
export async function initializeRemoteWorkerRegistry(): Promise<void> {
  const registry = getRemoteWorkerRegistry()
  await registry.initialize()
}
