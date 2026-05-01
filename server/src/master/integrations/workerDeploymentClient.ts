/**
 * Worker 部署客户端
 *
 * 功能：
 * - 与 Worker 容器的部署 API 通信
 * - 发送部署指令
 * - 获取部署状态和日志
 *
 * 使用场景：
 * - ProjectDeploymentService 调用 Worker 部署功能
 */

import { getContainerOrchestrator } from '../orchestrator/containerOrchestrator'
import { generateRequestId } from '../../shared/utils'
import type { ContainerInstance } from '../orchestrator/types'

// ==================== 类型定义 ====================

/**
 * 项目配置
 */
export interface ProjectDeployConfig {
  projectId: string
  userId: string
  name: string
  type: 'nodejs' | 'python' | 'static' | 'custom'
  sourcePath: string
  buildCommand?: string
  startCommand: string
  envVars?: Record<string, string>
  memoryLimit?: string
  processManager: 'pm2' | 'supervisor'
}

/**
 * 部署结果
 */
export interface WorkerDeployResult {
  success: boolean
  port: number
  error?: string
}

/**
 * 项目状态
 */
export interface WorkerProjectStatus {
  running: boolean
  pid?: number
  memory?: number
  cpu?: number
  uptime?: number
  status?: string
  port?: number
}

/**
 * 日志结果
 */
export interface WorkerLogResult {
  stdout: string
  stderr: string
}

// ==================== Worker 部署客户端 ====================

export class WorkerDeploymentClient {
  private masterToken: string
  private masterHost: string
  private masterPort: number

  constructor() {
    this.masterToken = process.env.MASTER_INTERNAL_TOKEN || ''
    this.masterHost = process.env.MASTER_HOST || 'localhost'
    this.masterPort = parseInt(process.env.MASTER_PORT || '3000', 10)
  }

  /**
   * 在 Worker 容器内部署项目
   */
  async deployProject(
    container: ContainerInstance,
    config: ProjectDeployConfig
  ): Promise<WorkerDeployResult> {
    try {
      const response = await this.callWorkerAPI(container, 'deploy', { config })

      if (!response.success) {
        return {
          success: false,
          port: 0,
          error: response.error || '部署失败'
        }
      }

      return {
        success: true,
        port: response.data.port
      }
    } catch (error) {
      console.error('[WorkerDeploymentClient] 部署项目失败:', error)
      return {
        success: false,
        port: 0,
        error: error instanceof Error ? error.message : '部署失败'
      }
    }
  }

  /**
   * 停止 Worker 容器内的项目
   */
  async stopProject(
    container: ContainerInstance,
    projectId: string,
    processManager: 'pm2' | 'supervisor'
  ): Promise<boolean> {
    try {
      const response = await this.callWorkerAPI(container, 'deploy_stop', {
        projectId,
        processManager
      })
      return response.success && response.data?.stopped
    } catch (error) {
      console.error('[WorkerDeploymentClient] 停止项目失败:', error)
      return false
    }
  }

  /**
   * 重启 Worker 容器内的项目
   */
  async restartProject(
    container: ContainerInstance,
    projectId: string,
    processManager: 'pm2' | 'supervisor'
  ): Promise<boolean> {
    try {
      const response = await this.callWorkerAPI(container, 'deploy_restart', {
        projectId,
        processManager
      })
      return response.success && response.data?.restarted
    } catch (error) {
      console.error('[WorkerDeploymentClient] 重启项目失败:', error)
      return false
    }
  }

  /**
   * 获取 Worker 容器内项目的状态
   */
  async getProjectStatus(
    container: ContainerInstance,
    projectId: string,
    processManager: 'pm2' | 'supervisor'
  ): Promise<WorkerProjectStatus> {
    try {
      const response = await this.callWorkerAPI(container, 'deploy_status', {
        projectId,
        processManager
      })

      if (response.success) {
        return response.data as WorkerProjectStatus
      }

      return { running: false }
    } catch (error) {
      console.error('[WorkerDeploymentClient] 获取状态失败:', error)
      return { running: false }
    }
  }

  /**
   * 获取 Worker 容器内项目的日志
   */
  async getProjectLogs(
    container: ContainerInstance,
    projectId: string,
    lines: number = 100
  ): Promise<WorkerLogResult> {
    try {
      const response = await this.callWorkerAPI(container, 'deploy_logs', {
        projectId,
        lines
      })

      if (response.success) {
        return response.data as WorkerLogResult
      }

      return { stdout: '', stderr: '' }
    } catch (error) {
      console.error('[WorkerDeploymentClient] 获取日志失败:', error)
      return { stdout: '', stderr: '' }
    }
  }

  /**
   * 列出 Worker 容器内的所有项目
   */
  async listProjects(
    container: ContainerInstance
  ): Promise<Array<{ projectId: string; status: WorkerProjectStatus }>> {
    try {
      const response = await this.callWorkerAPI(container, 'deploy_list', {})

      if (response.success) {
        return response.data.projects || []
      }

      return []
    } catch (error) {
      console.error('[WorkerDeploymentClient] 列出项目失败:', error)
      return []
    }
  }

  /**
   * 获取 Worker 容器内活跃的部署项目（用于防休眠检测）
   */
  async getActiveDeployments(
    container: ContainerInstance
  ): Promise<Array<{ projectId: string; running: boolean; port?: number }>> {
    try {
      const response = await this.callWorkerAPI(container, 'deploy_active', {})

      if (response.success) {
        return response.data.activeDeployments || []
      }

      return []
    } catch (error) {
      console.error('[WorkerDeploymentClient] 获取活跃部署失败:', error)
      return []
    }
  }

  /**
   * 调用 Worker 内部 API
   */
  private async callWorkerAPI(
    container: ContainerInstance,
    type: string,
    payload: any
  ): Promise<any> {
    const url = `http://localhost:${container.hostPort}/internal/exec`

    const requestBody = {
      requestId: generateRequestId(),
      type,
      payload
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Token': this.masterToken,
        'X-User-Id': 'system'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      throw new Error(`Worker API 调用失败: ${response.status} ${response.statusText}`)
    }

    return await response.json()
  }

  /**
   * 获取用户的 Worker 容器
   */
  async getUserWorker(userId: string): Promise<ContainerInstance | null> {
    const orchestrator = getContainerOrchestrator()

    // 检查用户是否已有容器
    const existingMapping = orchestrator.getUserMapping(userId)
    if (existingMapping) {
      return existingMapping.container
    }

    // 为用户分配新容器
    const result = await orchestrator.assignContainerToUser(userId)
    if (result.success && result.data) {
      return result.data.container
    }

    return null
  }
}

// ==================== 单例实例 ====================

let workerDeploymentClient: WorkerDeploymentClient | null = null

/**
 * 获取 Worker 部署客户端实例
 */
export function getWorkerDeploymentClient(): WorkerDeploymentClient {
  if (!workerDeploymentClient) {
    workerDeploymentClient = new WorkerDeploymentClient()
  }
  return workerDeploymentClient
}
