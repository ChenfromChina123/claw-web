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
import { getMasterInternalToken, generateRequestId, getWorkerInternalPort } from '../../shared/utils'
import type { WorkerToolExecRequest, WorkerToolExecResponse } from '../../shared/types'

/**
 * 需要通过 Worker 执行的危险工具列表
 * 架构铁律：Master 禁止直接执行任何用户命令或文件操作
 */
const WORKER_REQUIRED_TOOLS = new Set([
  'Bash',
  'Exec',
  'FileRead',
  'FileWrite',
  'FileEdit',
  'FileEditLegacy',
  'Glob',
  'Grep',
  'PowerShell',
  'Shell',
  'Python',
  'Node',
  'Go',
  'Rust',
  'ListFiles',
  'ListDir',
  'Mkdir',
  'Remove',
  'Copy',
  'Move',
  'Cat',
  'Head',
  'Tail',
  'Find',
  'Which',
  'Env',
])

/**
 * 危险工具名称模式匹配（用于捕获未显式列出的变体）
 */
const DANGEROUS_TOOL_PATTERNS = [
  /^(bash|shell|exec|cmd|terminal|powershell|python|node|go|rust)$/i,
  /^(file|dir|path|fs|disk)(read|write|edit|delete|create|remove|move|copy|list|find|glob|grep|cat|head|tail)/i,
]

/**
 * 检查工具是否需要在 Worker 中执行
 */
export function shouldExecuteOnWorker(toolName: string): boolean {
  if (WORKER_REQUIRED_TOOLS.has(toolName)) return true
  return DANGEROUS_TOOL_PATTERNS.some(pattern => pattern.test(toolName))
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

    console.log(`[WorkerToolExecutor] 开始执行工具: ${toolName}, userId=${userId}`)

    workerForwarder.updateUserActivity(userId)
    workerForwarder.incrementActiveToolExecution(userId)

    try {
      return await this._executeToolInternal(userId, toolName, toolInput, options)
    } finally {
      workerForwarder.decrementActiveToolExecution(userId)
    }
  }

  /**
   * 内部执行逻辑
   */
  private async _executeToolInternal(
    userId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    options: { cwd?: string; timeout?: number } = {}
  ): Promise<WorkerToolResult> {
    const orchestrator = getContainerOrchestrator()

    // 获取用户的 Worker 容器映射
    let mapping = orchestrator.getUserMapping(userId)
    console.log(`[WorkerToolExecutor] 内存中的用户映射: ${mapping ? '存在' : '不存在'}`)

    if (!mapping) {
      // 尝试从数据库恢复映射
      console.log(`[WorkerToolExecutor] 尝试从数据库恢复用户 ${userId} 的映射...`)
      mapping = await orchestrator.getOrLoadUserMapping(userId)
      console.log(`[WorkerToolExecutor] 数据库恢复结果: ${mapping ? '成功' : '失败'}`)
    }

    if (!mapping) {
      // 分配新容器
      console.log(`[WorkerToolExecutor] 为用户 ${userId} 分配新容器...`)
      const assignResult = await orchestrator.assignContainerToUser(userId)
      console.log(`[WorkerToolExecutor] 容器分配结果: success=${assignResult.success}, error=${assignResult.error || '无'}`)
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

    console.log(`[WorkerToolExecutor] 容器状态: containerId=${mapping.container.containerId}, status=${mapping.container.status}, hostPort=${mapping.container.hostPort}`)

    // 确保 WebSocket 连接（用于 PTY 和持续操作）
    console.log(`[WorkerToolExecutor] 确保 WebSocket 连接...`)
    const wsConnection = await workerForwarder.ensureUserWorkerConnection(userId)
    console.log(`[WorkerToolExecutor] WebSocket 连接状态: ${wsConnection ? '已连接' : '未连接'}`)

    const { container } = mapping
    
    // Master和Worker容器在不同的Docker网络中（claude-network vs worker-network）
    // 无法直接通过容器IP访问，必须使用宿主机端口映射
    const workerHost = process.env.WORKER_HOST || 'host.docker.internal'
    const workerUrl = `http://${workerHost}:${container.hostPort}/internal/exec`
    console.log(`[WorkerToolExecutor] 使用宿主机端口映射访问Worker (userId=${userId}, host=${workerHost}, port=${container.hostPort})`)

    console.log(`[WorkerToolExecutor] 转发工具 ${toolName} 到 Worker 容器 (userId=${userId}, url=${workerUrl})`)

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
      console.log(`[WorkerToolExecutor] 发送 HTTP 请求到 Worker...`)
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Token': this.masterToken,
          'X-User-Id': userId,
        },
        body: JSON.stringify(requestBody),
      })

      console.log(`[WorkerToolExecutor] Worker 响应状态: ${response.status}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[WorkerToolExecutor] Worker HTTP 错误: ${response.status}, ${errorText}`)
        return {
          success: false,
          error: `Worker HTTP ${response.status}: ${errorText}`,
        }
      }

      const result = (await response.json()) as WorkerToolExecResponse
      console.log(`[WorkerToolExecutor] Worker 执行结果: success=${result.success}`)

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
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[WorkerToolExecutor] Worker 请求异常:`, errorMessage)
      return {
        success: false,
        error: `Worker 请求失败: ${errorMessage}`,
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
