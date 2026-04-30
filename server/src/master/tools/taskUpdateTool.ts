/**
 * TaskUpdate 工具 - 允许 Agent 更新任务状态
 *
 * 功能：
 * - 更新任务状态
 * - 更新任务进度
 * - 完成任务
 * - 取消任务
 */

import type { ToolResult } from '../integration/enhancedToolExecutor'
import type { ToolExecutionContext } from '../integration/enhancedToolExecutor'
import type { Tool } from '../integration/webStore'
import {
  getBackgroundTaskManager,
  TaskStatus,
} from '../services/backgroundTaskManager'

export interface TaskUpdateInput {
  taskId: string
  status?: 'in_progress' | 'completed' | 'failed' | 'cancelled'
  progress?: number
  result?: unknown
  error?: string
}

export interface TaskUpdateOutput {
  taskId: string
  status: string
  progress: number
  message: string
}

/**
 * 验证输入参数
 */
export function validateTaskUpdateInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['输入必须是对象'] }
  }

  const { taskId, status, progress } = input as Record<string, unknown>

  if (!taskId || typeof taskId !== 'string') {
    errors.push('taskId 是必需参数，且必须是字符串')
  }

  if (status !== undefined && !['in_progress', 'completed', 'failed', 'cancelled'].includes(status as string)) {
    errors.push('status 必须是 in_progress、completed、failed 或 cancelled 之一')
  }

  if (progress !== undefined && (typeof progress !== 'number' || progress < 0 || progress > 100)) {
    errors.push('progress 必须是 0-100 之间的数字')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * TaskUpdate 工具实现
 *
 * 允许 Agent 更新任务状态
 */
export async function executeTaskUpdateTool(
  input: TaskUpdateInput,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const validation = validateTaskUpdateInput(input)

  if (!validation.valid) {
    return {
      success: false,
      error: `输入验证失败:\n${validation.errors.join('\n')}`,
    }
  }

  try {
    const taskManager = getBackgroundTaskManager()
    const task = taskManager.getTask(input.taskId)

    if (!task) {
      return {
        success: false,
        error: `任务 ${input.taskId} 不存在`,
      }
    }

    // 更新进度
    if (input.progress !== undefined) {
      taskManager.updateProgress(input.taskId, input.progress)
    }

    let message = `任务 ${input.taskId} 已更新`

    // 根据状态执行相应操作
    switch (input.status) {
      case 'in_progress':
        taskManager.startTask(input.taskId)
        message = `任务 ${input.taskId} 已开始执行`
        break
      case 'completed':
        taskManager.completeTask(input.taskId, input.result)
        message = `任务 ${input.taskId} 已完成`
        break
      case 'failed':
        taskManager.failTask(input.taskId, input.error || '任务失败')
        message = `任务 ${input.taskId} 已标记为失败`
        break
      case 'cancelled':
        taskManager.cancelTask(input.taskId)
        message = `任务 ${input.taskId} 已取消`
        break
    }

    // 获取更新后的任务
    const updatedTask = taskManager.getTask(input.taskId)

    console.log(`[TaskUpdateTool] ${message}`)

    return {
      success: true,
      result: {
        taskId: input.taskId,
        status: updatedTask?.status || task.status,
        progress: updatedTask?.progress || task.progress,
        message,
      } as TaskUpdateOutput,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[TaskUpdateTool] 更新任务失败:', error)

    return {
      success: false,
      error: `更新任务失败: ${errorMessage}`,
    }
  }
}

/**
 * 创建 TaskUpdate 工具定义
 */
export function createTaskUpdateToolDefinition(): Tool {
  return {
    name: 'TaskUpdate',
    description: '更新任务状态。Agent 可以使用此工具更新任务的执行状态、进度或结果。',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: '任务ID',
        },
        status: {
          type: 'string',
          description: '新状态',
          enum: ['in_progress', 'completed', 'failed', 'cancelled'],
        },
        progress: {
          type: 'number',
          description: '进度百分比（0-100）',
          minimum: 0,
          maximum: 100,
        },
        result: {
          type: 'object',
          description: '任务结果（当状态为 completed 时）',
        },
        error: {
          type: 'string',
          description: '错误信息（当状态为 failed 时）',
        },
      },
      required: ['taskId'],
    },
    category: 'task',
  }
}

/**
 * 带 handler 的工具定义类型
 */
export interface TaskUpdateToolDefinition extends Tool {
  handler: typeof executeTaskUpdateTool
}

/**
 * 获取 TaskUpdate 工具定义（带 handler）
 */
export function createTaskUpdateToolDefinitionWithHandler(): TaskUpdateToolDefinition {
  return {
    name: 'TaskUpdate',
    description: '更新任务状态。Agent 可以使用此工具更新任务的执行状态、进度或结果。',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: {
          type: 'string',
          description: '任务ID',
        },
        status: {
          type: 'string',
          description: '新状态',
          enum: ['in_progress', 'completed', 'failed', 'cancelled'],
        },
        progress: {
          type: 'number',
          description: '进度百分比（0-100）',
          minimum: 0,
          maximum: 100,
        },
        result: {
          type: 'object',
          description: '任务结果（当状态为 completed 时）',
        },
        error: {
          type: 'string',
          description: '错误信息（当状态为 failed 时）',
        },
      },
      required: ['taskId'],
    },
    category: 'task',
    handler: executeTaskUpdateTool,
  }
}
