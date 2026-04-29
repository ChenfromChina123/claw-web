/**
 * WorkerToolExecutor - Master 端的 Worker 工具执行器
 *
 * 职责：
 * - 将危险工具调用（Bash、FileWrite、FileEdit 等）转发到 Worker 容器执行
 * - 维护用户到 Worker 容器的连接
 * - 确保所有文件/命令操作都在 Worker 沙箱中执行
 * - 用户在线时自动保持 Worker 连接
 *
 * 架构原则：
 * - Master 不直接执行任何用户命令或文件操作
 * - 所有工具执行必须通过 Worker 容器
 * - 路径安全由 Worker 端的 isPathSafe 保证
 * - 用户在线期间保持 Worker 连接，确保 Agent 可以持续操作
 */

import { getContainerOrchestrator } from '../orchestrator/containerOrchestrator'
import { workerForwarder } from '../websocket/workerForwarder'
import { getMasterInternalToken, generateRequestId } from '../../shared/utils'
import type { WorkerToolExecRequest, WorkerToolExecResponse } from '../../shared/types'

/**
 * 需要通过 Worker 执行的危险工具列表
 */
const WORKER_REQUIRED_TOOLS = new Set([
  'Bash',
  'Exec',
  'FileRead',
  'FileWrite',
  'FileEdit',
  'Glob',
  'Grep',
  'PowerShell',
])

/**
 * 检查工具是否需要在 Worker 中执行
 */
export function shouldExecuteOnWorker(toolName: string): boolean {
  return WORKER_REQUIRED_TOOLS.has(toolName)
}

/**
 * 工具执行结果
 */
export interface WorkerToolResult {
  success: boolean
  result?: unknown
  output?: string
  error?: string
}

/**
 * Worker 工具执行器
 */
export class WorkerToolExecutor {
  private masterToken: string

  constructor() {
    this.masterToken = getMasterInternalToken()
  }

  /**
   * 通过 HTTP 向 Worker 发送工具执行请求
   */
  async executeTool(
    userId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    options: { cwd?: string; timeout?: number } = {}
  ): Promise<WorkerToolResult> {
    const orchestrator = getContainerOrchestrator()

    // 更新用户活跃状态并确保 Worker 连接
    workerForwarder.updateUserActivity(userId)

    // 获取用户的 Worker 容器映射
    let mapping = orchestrator.getUserMapping(userId)

    if (!mapping) {
      // 尝试从数据库恢复映射
      mapping = await orchestrator.getOrLoadUserMapping(userId)
    }

    if (!mapping) {
      // 分配新容器
      const assignResult = await orchestrator.assignContainerToUser(userId)
      if (!assignResult.success || !assignResult.data) {
        return {
          success: false,
          error: `无法为用户 ${userId} 分配 Worker 容器: ${assignResult.error}`,
        }
      }
      mapping = assignResult.data
    }

    // 如果容器处于暂停状态，恢复它
    if (mapping.container.status === 'paused') {
      console.log(`[WorkerToolExecutor] 用户 ${userId} 的容器处于暂停状态，正在恢复...`)
      const assignResult = await orchestrator.assignContainerToUser(userId)
      if (!assignResult.success || !assignResult.data) {
        return {
          success: false,
          error: `无法恢复用户 ${userId} 的容器: ${assignResult.error}`,
        }
      }
      mapping = assignResult.data
    }

    // 确保 WebSocket 连接（用于 PTY 和持续操作）
    await workerForwarder.ensureUserWorkerConnection(userId)

    const { container } = mapping
    const workerUrl = `http://localhost:${container.hostPort}/internal/exec`

    console.log(`[WorkerToolExecutor] 转发工具 ${toolName} 到 Worker 容器 (userId=${userId}, port=${container.hostPort})`)

    const requestBody: WorkerToolExecRequest = {
      requestId: generateRequestId(),
      userId,
      type: 'tool_exec',
      payload: {
        toolName,
        toolInput,
        cwd: options.cwd,
        timeout: options.timeout,
      },
    }

    try {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Token': this.masterToken,
          'X-User-Id': userId,
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        return {
          success: false,
          error: `Worker HTTP ${response.status}: ${errorText}`,
        }
      }

      const result = (await response.json()) as WorkerToolExecResponse

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'Worker 执行失败',
        }
      }

      return {
        success: true,
        result: result.data?.result,
        output: result.data?.output,
      }
    } catch (error) {
      return {
        success: false,
        error: `Worker 请求失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
}

// 单例实例
let workerToolExecutorInstance: WorkerToolExecutor | null = null

/**
 * 获取 WorkerToolExecutor 单例
 */
export function getWorkerToolExecutor(): WorkerToolExecutor {
  if (!workerToolExecutorInstance) {
    workerToolExecutorInstance = new WorkerToolExecutor()
  }
  return workerToolExecutorInstance
}
