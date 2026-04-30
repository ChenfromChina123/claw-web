/**
 * TaskCreate 工具 - 允许 Agent 自主创建任务
 *
 * 功能：
 * - Agent 可以在执行过程中创建任务
 * - 支持设置任务优先级
 * - 支持任务之间的依赖关系
 * - 任务状态跟踪
 */

import { v4 as uuidv4 } from 'uuid'
import type { ToolResult } from '../integration/enhancedToolExecutor'
import type { ToolExecutionContext } from '../integration/enhancedToolExecutor'
import type { Tool } from '../integration/webStore'
import {
  getBackgroundTaskManager,
  TaskPriority,
  type BackgroundTask,
} from '../services/backgroundTaskManager'

export interface TaskCreateInput {
  subject: string
  description: string
  priority?: 'low' | 'normal' | 'high' | 'critical'
  parentTaskId?: string
  metadata?: Record<string, unknown>
}

export interface TaskCreateOutput {
  taskId: string
  subject: string
  status: 'created'
  priority: string
}

/**
 * 验证输入参数
 */
export function validateTaskCreateInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['输入必须是对象'] }
  }

  const { subject, description, priority } = input as Record<string, unknown>

  if (!subject || typeof subject !== 'string') {
    errors.push('subject 是必需参数，且必须是字符串')
  }

  if (subject && typeof subject === 'string' && subject.trim().length === 0) {
    errors.push('subject 不能为空')
  }

  if (!description || typeof description !== 'string') {
    errors.push('description 是必需参数，且必须是字符串')
  }

  if (priority !== undefined && !['low', 'normal', 'high', 'critical'].includes(priority as string)) {
    errors.push('priority 必须是 low、normal、high 或 critical 之一')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 将字符串优先级转换为 TaskPriority 枚举
 */
function parsePriority(priority?: string): TaskPriority {
  switch (priority) {
    case 'critical':
      return TaskPriority.CRITICAL
    case 'high':
      return TaskPriority.HIGH
    case 'low':
      return TaskPriority.LOW
    case 'normal':
    default:
      return TaskPriority.NORMAL
  }
}

/**
 * TaskCreate 工具实现
 *
 * 允许 Agent 在执行过程中自主创建任务
 */
export async function executeTaskCreateTool(
  input: TaskCreateInput,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const validation = validateTaskCreateInput(input)

  if (!validation.valid) {
    return {
      success: false,
      error: `输入验证失败:\n${validation.errors.join('\n')}`,
    }
  }

  try {
    const taskManager = getBackgroundTaskManager()

    // 创建任务
    const task = taskManager.createTask({
      name: input.subject,
      description: input.description,
      priority: parsePriority(input.priority),
      parentTaskId: input.parentTaskId,
      agentId: context.agentId || 'unknown',
      metadata: {
        ...input.metadata,
        sessionId: context.sessionId,
        userId: context.userId,
        createdBy: 'agent',
        createdAt: new Date().toISOString(),
      },
    })

    console.log(`[TaskCreateTool] 任务创建成功: ${task.id} - ${input.subject}`)

    return {
      success: true,
      result: {
        taskId: task.id,
        subject: task.name,
        status: 'created',
        priority: input.priority || 'normal',
        message: `任务 #${task.id} 创建成功: ${task.name}`,
      } as TaskCreateOutput & { message: string },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[TaskCreateTool] 任务创建失败:', error)

    return {
      success: false,
      error: `任务创建失败: ${errorMessage}`,
    }
  }
}

/**
 * 创建 TaskCreate 工具定义
 */
export function createTaskCreateToolDefinition(): Tool {
  return {
    name: 'TaskCreate',
    description: '创建一个新任务到任务列表。Agent 可以使用此工具在执行过程中自主创建任务来跟踪工作进度。',
    inputSchema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: '任务的简短标题（3-10个字）',
        },
        description: {
          type: 'string',
          description: '任务的详细描述，说明需要完成什么',
        },
        priority: {
          type: 'string',
          description: '任务优先级',
          enum: ['low', 'normal', 'high', 'critical'],
          default: 'normal',
        },
        parentTaskId: {
          type: 'string',
          description: '父任务ID（可选），用于建立任务层级关系',
        },
        metadata: {
          type: 'object',
          description: '附加到任务的元数据（可选）',
        },
      },
      required: ['subject', 'description'],
    },
    category: 'task',
  }
}

/**
 * 带 handler 的工具定义类型
 */
export interface TaskCreateToolDefinition extends Tool {
  handler: typeof executeTaskCreateTool
}

/**
 * 获取 TaskCreate 工具定义（带 handler）
 */
export function createTaskCreateToolDefinitionWithHandler(): TaskCreateToolDefinition {
  return {
    name: 'TaskCreate',
    description: '创建一个新任务到任务列表。Agent 可以使用此工具在执行过程中自主创建任务来跟踪工作进度。',
    inputSchema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: '任务的简短标题（3-10个字）',
        },
        description: {
          type: 'string',
          description: '任务的详细描述，说明需要完成什么',
        },
        priority: {
          type: 'string',
          description: '任务优先级',
          enum: ['low', 'normal', 'high', 'critical'],
          default: 'normal',
        },
        parentTaskId: {
          type: 'string',
          description: '父任务ID（可选），用于建立任务层级关系',
        },
        metadata: {
          type: 'object',
          description: '附加到任务的元数据（可选）',
        },
      },
      required: ['subject', 'description'],
    },
    category: 'task',
    handler: executeTaskCreateTool,
  }
}
