/**
 * 任务管理工具集
 * 
 * 功能：
 * - TodoWrite: 管理工作任务清单
 * - TodoList: 列出当前任务
 * 
 * 参考 Claude Code 实现：
 * - src/tools/TodoWriteTool/TodoWriteTool.ts
 * - src/tools/TaskListTool/TaskListTool.ts
 */

import type { ToolDefinition } from '../types/toolTypes'

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
