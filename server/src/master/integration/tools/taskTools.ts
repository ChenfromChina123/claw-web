/**
 * 任务管理工具集
 *
 * 功能：
 * - TodoWrite: 管理工作任务清单
 * - TodoList: 列出当前任务
 * - TaskCreate: Agent 自主创建后台任务
 * - TaskList: 查看后台任务列表
 * - TaskUpdate: 更新后台任务状态
 *
 * 参考 Claude Code 实现：
 * - src/tools/TodoWriteTool/TodoWriteTool.ts
 * - src/tools/TaskListTool/TaskListTool.ts
 * - src/tools/TaskCreateTool/TaskCreateTool.ts
 */

import type { ToolDefinition } from '../types/toolTypes'
import {
  getBackgroundTaskManager,
  TaskPriority,
  TaskStatus,
  type BackgroundTask,
} from '../../services/backgroundTaskManager'

/**
 * 任务项接口
 */
interface TodoItem {
  status: 'in_progress' | 'pending' | 'completed'
  content: string
  activeForm?: string
}

/**
 * 任务存储（内存中，简化实现）
 */
const todoStorage = new Map<string, TodoItem[]>()

/**
 * 获取会话的任务列表
 */
function getSessionTodos(sessionId: string): TodoItem[] {
  return todoStorage.get(sessionId) || []
}

/**
 * 设置会话的任务列表
 */
function setSessionTodos(sessionId: string, todos: TodoItem[]): void {
  todoStorage.set(sessionId, todos)
}

/**
 * 格式化任务列表为字符串
 */
function formatTodos(todos: TodoItem[]): string {
  if (todos.length === 0) {
    return 'No tasks'
  }

  const lines: string[] = []
  let index = 1

  for (const todo of todos) {
    const statusIcon = todo.status === 'completed' ? '✅'
      : todo.status === 'in_progress' ? '🔄'
      : '⬜'
    const content = todo.content
    lines.push(`${index}. ${statusIcon} ${content}`)
    index++
  }

  return lines.join('\n')
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
 * 创建任务管理工具定义列表
 */
export function createTaskTools(sessionId: string = 'default'): ToolDefinition[] {
  return [
    // ========== TodoWrite 工具 ==========
    {
      name: 'TodoWrite',
      description: 'Update the task todo list for the current session',
      inputSchema: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            description: 'Array of todo items',
            items: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['in_progress', 'pending', 'completed'],
                  description: 'Task status',
                },
                content: {
                  type: 'string',
                  description: 'Task description',
                },
                activeForm: {
                  type: 'string',
                  description: 'Current action being performed',
                },
              },
              required: ['status', 'content'],
            },
          },
        },
        required: ['todos'],
      },
      category: 'task',
      handler: async (input, context) => {
        const todos = input.todos as TodoItem[]

        // 验证输入
        if (!Array.isArray(todos)) {
          return {
            success: false,
            error: 'todos must be an array',
          }
        }

        // 获取旧的任务列表
        const oldTodos = getSessionTodos(sessionId)

        // 设置新的任务列表
        setSessionTodos(sessionId, todos)

        // 格式化输出
        const oldFormatted = formatTodos(oldTodos)
        const newFormatted = formatTodos(todos)

        return {
          success: true,
          result: {
            oldTodos,
            newTodos: todos,
            count: todos.length,
            completedCount: todos.filter(t => t.status === 'completed').length,
          },
          output: `Tasks updated:\n\nPrevious tasks:\n${oldFormatted}\n\nCurrent tasks:\n${newFormatted}`,
        }
      },
    },

    // ========== TodoList 工具 ==========
    {
      name: 'TodoList',
      description: 'List all tasks in the current session',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      category: 'task',
      isConcurrencySafe: true,
      isReadOnly: true,
      handler: async (input, context) => {
        const todos = getSessionTodos(sessionId)

        if (todos.length === 0) {
          return {
            success: true,
            result: {
              tasks: [],
              count: 0,
            },
            output: 'No tasks in the current session',
          }
        }

        const formatted = formatTodos(todos)
        const completedCount = todos.filter(t => t.status === 'completed').length
        const inProgressCount = todos.filter(t => t.status === 'in_progress').length
        const pendingCount = todos.filter(t => t.status === 'pending').length

        return {
          success: true,
          result: {
            tasks: todos,
            count: todos.length,
            completedCount,
            inProgressCount,
            pendingCount,
          },
          output: `Tasks (${todos.length}):\n\n${formatted}\n\nSummary: ${completedCount} completed, ${inProgressCount} in progress, ${pendingCount} pending`,
        }
      },
    },

    // ========== TodoClear 工具 ==========
    {
      name: 'TodoClear',
      description: 'Clear all completed tasks from the list',
      inputSchema: {
        type: 'object',
        properties: {
          all: {
            type: 'boolean',
            description: 'Clear all tasks, not just completed ones',
            default: false,
          },
        },
      },
      category: 'task',
      handler: async (input, context) => {
        const clearAll = (input.all as boolean) || false
        const oldTodos = getSessionTodos(sessionId)

        let newTodos: TodoItem[]
        if (clearAll) {
          newTodos = []
        } else {
          newTodos = oldTodos.filter(t => t.status !== 'completed')
        }

        setSessionTodos(sessionId, newTodos)

        const clearedCount = clearAll
          ? oldTodos.length
          : oldTodos.length - newTodos.length

        return {
          success: true,
          result: {
            clearedCount,
            remainingCount: newTodos.length,
            newTodos,
          },
          output: `Cleared ${clearedCount} task(s). ${newTodos.length} task(s) remaining.`,
        }
      },
    },

    // ========== Agent 自主任务管理工具 ==========

    // ========== TaskCreate 工具 ==========
    {
      name: 'TaskCreate',
      description: '创建一个新任务到后台任务列表。Agent 可以使用此工具在执行过程中自主创建任务来跟踪工作进度。',
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
      handler: async (input, context) => {
        try {
          const taskManager = getBackgroundTaskManager()

          // 验证输入
          if (!input.subject || typeof input.subject !== 'string') {
            return {
              success: false,
              error: 'subject 是必需参数，且必须是字符串',
            }
          }

          if (!input.description || typeof input.description !== 'string') {
            return {
              success: false,
              error: 'description 是必需参数，且必须是字符串',
            }
          }

          // 创建任务
          const task = taskManager.createTask({
            name: input.subject as string,
            description: input.description as string,
            priority: parsePriority(input.priority as string),
            parentTaskId: input.parentTaskId as string | undefined,
            agentId: context.agentId || 'unknown',
            metadata: {
              ...((input.metadata as Record<string, unknown>) || {}),
              sessionId: context.sessionId,
              userId: context.userId,
              createdBy: 'agent',
              createdAt: new Date().toISOString(),
            },
          })

          console.log(`[TaskCreate] 任务创建成功: ${task.id} - ${task.name}`)

          return {
            success: true,
            result: {
              taskId: task.id,
              subject: task.name,
              status: 'created',
              priority: input.priority || 'normal',
            },
            output: `任务 #${task.id} 创建成功: ${task.name}`,
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.error('[TaskCreate] 任务创建失败:', error)

          return {
            success: false,
            error: `任务创建失败: ${errorMessage}`,
          }
        }
      },
    },

    // ========== TaskList 工具 ==========
    {
      name: 'TaskList',
      description: '查看后台任务列表。Agent 可以使用此工具查看当前所有任务的状态和进度。',
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
      isConcurrencySafe: true,
      isReadOnly: true,
      handler: async (input, context) => {
        try {
          const taskManager = getBackgroundTaskManager()
          const limit = (input.limit as number) || 50
          const statusFilter = (input.status as string) || 'all'

          let tasks: BackgroundTask[] = []

          // 根据状态筛选任务
          switch (statusFilter) {
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

          // 格式化输出
          const lines: string[] = []
          lines.push(`任务列表 (${formattedTasks.length} 个任务):\n`)

          formattedTasks.forEach((task, index) => {
            const statusIcon = task.status === '已完成' ? '✅'
              : task.status === '运行中' ? '🔄'
              : task.status === '失败' ? '❌'
              : task.status === '已取消' ? '🚫'
              : '⏳'
            lines.push(`${index + 1}. ${statusIcon} [${task.priority}] ${task.name}`)
            lines.push(`   状态: ${task.status} | 进度: ${task.progress}%`)
            if (task.description) {
              lines.push(`   描述: ${task.description.substring(0, 100)}${task.description.length > 100 ? '...' : ''}`)
            }
            lines.push('')
          })

          return {
            success: true,
            result: {
              tasks: formattedTasks,
              total: formattedTasks.length,
            },
            output: lines.join('\n'),
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.error('[TaskList] 获取任务列表失败:', error)

          return {
            success: false,
            error: `获取任务列表失败: ${errorMessage}`,
          }
        }
      },
    },

    // ========== TaskUpdate 工具 ==========
    {
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
      handler: async (input, context) => {
        try {
          const taskManager = getBackgroundTaskManager()
          const taskId = input.taskId as string

          if (!taskId) {
            return {
              success: false,
              error: 'taskId 是必需参数',
            }
          }

          const task = taskManager.getTask(taskId)

          if (!task) {
            return {
              success: false,
              error: `任务 ${taskId} 不存在`,
            }
          }

          // 更新进度
          if (input.progress !== undefined) {
            const progress = input.progress as number
            if (typeof progress === 'number' && progress >= 0 && progress <= 100) {
              taskManager.updateProgress(taskId, progress)
            }
          }

          let message = `任务 ${taskId} 已更新`

          // 根据状态执行相应操作
          switch (input.status) {
            case 'in_progress':
              taskManager.startTask(taskId)
              message = `任务 ${taskId} 已开始执行`
              break
            case 'completed':
              taskManager.completeTask(taskId, input.result)
              message = `任务 ${taskId} 已完成`
              break
            case 'failed':
              taskManager.failTask(taskId, (input.error as string) || '任务失败')
              message = `任务 ${taskId} 已标记为失败`
              break
            case 'cancelled':
              taskManager.cancelTask(taskId)
              message = `任务 ${taskId} 已取消`
              break
          }

          // 获取更新后的任务
          const updatedTask = taskManager.getTask(taskId)

          console.log(`[TaskUpdate] ${message}`)

          return {
            success: true,
            result: {
              taskId,
              status: updatedTask?.status || task.status,
              progress: updatedTask?.progress || task.progress,
            },
            output: message,
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.error('[TaskUpdate] 更新任务失败:', error)

          return {
            success: false,
            error: `更新任务失败: ${errorMessage}`,
          }
        }
      },
    },
  ]
}

/**
 * 创建任务工具（带会话 ID）
 */
export function createTaskToolsWithSession(getSessionId: () => string): () => ToolDefinition[] {
  return function() {
    const sessionId = getSessionId()
    return createTaskTools(sessionId)
  }
}

export default createTaskTools
