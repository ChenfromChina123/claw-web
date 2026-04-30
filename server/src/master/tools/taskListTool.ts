/**
 * TaskList 工具 - 允许 Agent 查看任务列表
 *
 * 功能：
 * - 查看所有任务
 * - 按状态筛选任务
 * - 查看任务详情
 */

import type { ToolResult } from '../integration/enhancedToolExecutor'
import type { ToolExecutionContext } from '../integration/enhancedToolExecutor'
import type { Tool } from '../integration/webStore'
import {
  getBackgroundTaskManager,
  TaskStatus,
  type BackgroundTask,
} from '../services/backgroundTaskManager'

export interface TaskListInput {
  status?: 'all' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  limit?: number
}

export interface TaskListOutput {
  tasks: Array<{
    taskId: string
    name: string
    description: string
    status: string
    priority: string
    progress: number
    createdAt: string
    startedAt?: string
    completedAt?: string
  }>
  total: number
}

/**
 * 验证输入参数
 */
export function validateTaskListInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['输入必须是对象'] }
  }

  const { status, limit } = input as Record<string, unknown>

  if (status !== undefined && typeof status !== 'string') {
    errors.push('status 必须是字符串')
  }

  if (limit !== undefined && (typeof limit !== 'number' || limit < 1 || limit > 100)) {
    errors.push('limit 必须是 1-100 之间的数字')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 将任务状态转换为可读字符串
 */
function getStatusText(status: TaskStatus): string {
  const statusMap: Record<TaskStatus, string> = {
    [TaskStatus.CREATED]: '已创建',
    [TaskStatus.QUEUED]: '队列中',
    [TaskStatus.RUNNING]: '运行中',
    [TaskStatus.BLOCKED]: '阻塞',
    [TaskStatus.COMPLETED]: '已完成',
    [TaskStatus.FAILED]: '失败',
    [TaskStatus.CANCELLED]: '已取消',
  }
  return statusMap[status] || status
}

/**
 * 将优先级转换为可读字符串
 */
function getPriorityText(priority: number): string {
  const priorityMap: Record<number, string> = {
    0: 'low',
    1: 'normal',
    2: 'high',
    3: 'critical',
  }
  return priorityMap[priority] || 'normal'
}

/**
 * TaskList 工具实现
 *
 * 允许 Agent 查看任务列表
 */
export async function executeTaskListTool(
  input: TaskListInput,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const validation = validateTaskListInput(input)

  if (!validation.valid) {
    return {
      success: false,
      error: `输入验证失败:\n${validation.errors.join('\n')}`,
    }
  }

  try {
    const taskManager = getBackgroundTaskManager()
    const limit = input.limit || 50

    let tasks: BackgroundTask[] = []

    // 根据状态筛选任务
    switch (input.status) {
      case 'running':
        tasks = taskManager.getRunningTasks()
        break
      case 'pending':
        tasks = taskManager.getQueuedTasks()
        break
      case 'completed':
        tasks = taskManager.getAllTasks().filter(t => t.status === TaskStatus.COMPLETED)
        break
      case 'failed':
        tasks = taskManager.getAllTasks().filter(t => t.status === TaskStatus.FAILED)
        break
      case 'cancelled':
        tasks = taskManager.getAllTasks().filter(t => t.status === TaskStatus.CANCELLED)
        break
      case 'all':
      default:
        tasks = taskManager.getAllTasks()
        break
    }

    // 限制返回数量
    tasks = tasks.slice(0, limit)

    const formattedTasks = tasks.map(task => ({
      taskId: task.id,
      name: task.name,
      description: task.description || '',
      status: getStatusText(task.status),
      priority: getPriorityText(task.priority),
      progress: task.progress,
      createdAt: task.createdAt.toISOString(),
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
    }))

    console.log(`[TaskListTool] 返回 ${formattedTasks.length} 个任务`)

    return {
      success: true,
      result: {
        tasks: formattedTasks,
        total: formattedTasks.length,
      } as TaskListOutput,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[TaskListTool] 获取任务列表失败:', error)

    return {
      success: false,
      error: `获取任务列表失败: ${errorMessage}`,
    }
  }
}

/**
 * 创建 TaskList 工具定义
 */
export function createTaskListToolDefinition(): Tool {
  return {
    name: 'TaskList',
    description: '查看任务列表。Agent 可以使用此工具查看当前所有任务的状态和进度。',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: '按状态筛选任务',
          enum: ['all', 'pending', 'running', 'completed', 'failed', 'cancelled'],
          default: 'all',
        },
        limit: {
          type: 'number',
          description: '返回的最大任务数量（1-100）',
          default: 50,
          minimum: 1,
          maximum: 100,
        },
      },
    },
    category: 'task',
  }
}

/**
 * 带 handler 的工具定义类型
 */
export interface TaskListToolDefinition extends Tool {
  handler: typeof executeTaskListTool
}

/**
 * 获取 TaskList 工具定义（带 handler）
 */
export function createTaskListToolDefinitionWithHandler(): TaskListToolDefinition {
  return {
    name: 'TaskList',
    description: '查看任务列表。Agent 可以使用此工具查看当前所有任务的状态和进度。',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: '按状态筛选任务',
          enum: ['all', 'pending', 'running', 'completed', 'failed', 'cancelled'],
          default: 'all',
        },
        limit: {
          type: 'number',
          description: '返回的最大任务数量（1-100）',
          default: 50,
          minimum: 1,
          maximum: 100,
        },
      },
    },
    category: 'task',
    handler: executeTaskListTool,
  }
}
