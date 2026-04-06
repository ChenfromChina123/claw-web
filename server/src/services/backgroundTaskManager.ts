/**
 * 后台任务管理器
 * 
 * 实现后台任务注册、跟踪、优先级调度和资源限制
 */

import { v4 as uuidv4 } from 'uuid'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  CREATED = 'created',
  QUEUED = 'queued',
  RUNNING = 'running',
  BLOCKED = 'blocked',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * 任务优先级
 */
export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * 后台任务接口
 */
export interface BackgroundTask {
  id: string
  name: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  estimatedDuration?: number
  actualDuration?: number
  progress: number
  result?: unknown
  error?: string
  parentTaskId?: string
  agentId?: string
  metadata?: Record<string, unknown>
}

/**
 * 任务执行结果
 */
export interface TaskExecutionResult {
  taskId: string
  success: boolean
  result?: unknown
  error?: string
  duration: number
}

/**
 * 任务事件
 */
export type TaskEvent =
  | { type: 'task_created'; task: BackgroundTask }
  | { type: 'task_queued'; task: BackgroundTask }
  | { type: 'task_started'; task: BackgroundTask }
  | { type: 'task_progress'; task: BackgroundTask; progress: number }
  | { type: 'task_completed'; task: BackgroundTask }
  | { type: 'task_failed'; task: BackgroundTask; error: string }
  | { type: 'task_cancelled'; task: BackgroundTask }

/**
 * 后台任务管理器配置
 */
export interface BackgroundTaskManagerConfig {
  /** 最大并发任务数 */
  maxConcurrentTasks?: number
  /** 默认任务优先级 */
  defaultPriority?: TaskPriority
  /** 任务超时时间 (毫秒) */
  taskTimeout?: number
  /** 是否启用持久化 */
  enablePersistence?: boolean
  /** 持久化存储路径 */
  persistencePath?: string
}

/**
 * 后台任务管理器
 */
export class BackgroundTaskManager extends EventEmitter {
  private tasks: Map<string, BackgroundTask> = new Map()
  private taskQueue: string[] = []
  private runningTasks: Set<string> = new Set()
  private config: Required<BackgroundTaskManagerConfig>
  private cleanupInterval?: NodeJS.Timeout
  private persistenceTimer?: NodeJS.Timeout

  constructor(config: BackgroundTaskManagerConfig = {}) {
    super()
    this.config = {
      maxConcurrentTasks: config.maxConcurrentTasks || 5,
      defaultPriority: config.defaultPriority || TaskPriority.NORMAL,
      taskTimeout: config.taskTimeout || 3600000, // 1小时默认
      enablePersistence: config.enablePersistence ?? true, // 默认启用持久化
      persistencePath: config.persistencePath || path.join(process.cwd(), 'data', 'tasks.json'),
    }

    this.startCleanupTimer()
    if (this.config.enablePersistence) {
      this.startPersistenceTimer()
      // 启动时尝试恢复任务
      this.restoreTasks().catch(err => {
        console.warn('[BackgroundTaskManager] 启动时恢复任务失败:', err)
      })
    }
  }

  /**
   * 创建后台任务
   */
  createTask(params: {
    name: string
    description?: string
    priority?: TaskPriority
    parentTaskId?: string
    agentId?: string
    metadata?: Record<string, unknown>
  }): BackgroundTask {
    const task: BackgroundTask = {
      id: `task_${uuidv4().slice(0, 8)}`,
      name: params.name,
      description: params.description,
      status: TaskStatus.CREATED,
      priority: params.priority ?? this.config.defaultPriority,
      createdAt: new Date(),
      progress: 0,
      parentTaskId: params.parentTaskId,
      agentId: params.agentId,
      metadata: params.metadata,
    }

    this.tasks.set(task.id, task)
    this.emit('task_created', task)
    this.queueTask(task.id)

    return task
  }

  /**
   * 将任务加入队列
   */
  private queueTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.status = TaskStatus.QUEUED
    this.emit('task_queued', task)

    // 按优先级插入队列
    const insertIndex = this.taskQueue.findIndex(id => {
      const existingTask = this.tasks.get(id)
      return existingTask && existingTask.priority < task.priority
    })

    if (insertIndex === -1) {
      this.taskQueue.push(taskId)
    } else {
      this.taskQueue.splice(insertIndex, 0, taskId)
    }

    this.tryStartNextTask()
  }

  /**
   * 尝试启动下一个任务
   */
  private tryStartNextTask(): void {
    if (this.runningTasks.size >= this.config.maxConcurrentTasks) {
      return
    }

    const nextTaskId = this.taskQueue.shift()
    if (!nextTaskId) return

    const task = this.tasks.get(nextTaskId)
    if (!task || task.status !== TaskStatus.QUEUED) {
      this.tryStartNextTask()
      return
    }

    this.startTask(nextTaskId)
  }

  /**
   * 启动任务
   */
  startTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false

    if (this.runningTasks.size >= this.config.maxConcurrentTasks) {
      return false
    }

    task.status = TaskStatus.RUNNING
    task.startedAt = new Date()
    this.runningTasks.add(taskId)

    this.emit('task_started', task)
    return true
  }

  /**
   * 更新任务进度
   */
  updateProgress(taskId: string, progress: number): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.progress = Math.min(100, Math.max(0, progress))
    this.emit('task_progress', task, progress)
  }

  /**
   * 完成任务
   */
  completeTask(taskId: string, result?: unknown): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.status = TaskStatus.COMPLETED
    task.completedAt = new Date()
    task.progress = 100
    task.result = result

    if (task.startedAt) {
      task.actualDuration = task.completedAt.getTime() - task.startedAt.getTime()
    }

    this.runningTasks.delete(taskId)
    this.emit('task_completed', task)

    this.tryStartNextTask()
  }

  /**
   * 标记任务失败
   */
  failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.status = TaskStatus.FAILED
    task.completedAt = new Date()
    task.error = error

    if (task.startedAt) {
      task.actualDuration = task.completedAt.getTime() - task.startedAt.getTime()
    }

    this.runningTasks.delete(taskId)
    this.emit('task_failed', task, error)

    this.tryStartNextTask()
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task) return false

    if (task.status === TaskStatus.RUNNING) {
      this.runningTasks.delete(taskId)
    } else {
      const queueIndex = this.taskQueue.indexOf(taskId)
      if (queueIndex !== -1) {
        this.taskQueue.splice(queueIndex, 1)
      }
    }

    task.status = TaskStatus.CANCELLED
    task.completedAt = new Date()

    this.emit('task_cancelled', task)
    this.tryStartNextTask()

    return true
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): BackgroundTask | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): BackgroundTask[] {
    return Array.from(this.tasks.values())
  }

  /**
   * 获取正在运行的任务
   */
  getRunningTasks(): BackgroundTask[] {
    return Array.from(this.runningTasks).map(id => this.tasks.get(id)!).filter(Boolean)
  }

  /**
   * 获取队列中的任务
   */
  getQueuedTasks(): BackgroundTask[] {
    return this.taskQueue.map(id => this.tasks.get(id)!).filter(Boolean)
  }

  /**
   * 获取任务统计
   */
  getStats(): {
    total: number
    running: number
    queued: number
    completed: number
    failed: number
    cancelled: number
  } {
    const tasks = this.getAllTasks()
    return {
      total: tasks.length,
      running: tasks.filter(t => t.status === TaskStatus.RUNNING).length,
      queued: tasks.filter(t => t.status === TaskStatus.QUEUED).length,
      completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      failed: tasks.filter(t => t.status === TaskStatus.FAILED).length,
      cancelled: tasks.filter(t => t.status === TaskStatus.CANCELLED).length,
    }
  }

  /**
   * 检查状态转换是否合法
   */
  canTransition(from: TaskStatus, to: TaskStatus): boolean {
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      [TaskStatus.CREATED]: [TaskStatus.QUEUED, TaskStatus.CANCELLED],
      [TaskStatus.QUEUED]: [TaskStatus.RUNNING, TaskStatus.CANCELLED, TaskStatus.BLOCKED],
      [TaskStatus.RUNNING]: [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED],
      [TaskStatus.BLOCKED]: [TaskStatus.QUEUED, TaskStatus.CANCELLED],
      [TaskStatus.COMPLETED]: [],
      [TaskStatus.FAILED]: [],
      [TaskStatus.CANCELLED]: [],
    }

    return validTransitions[from]?.includes(to) ?? false
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60000) // 每分钟清理一次
  }

  /**
   * 启动持久化定时器
   */
  private startPersistenceTimer(): void {
    this.persistenceTimer = setInterval(() => {
      this.persistTasks()
    }, 300000) // 每5分钟持久化一次
  }

  /**
   * 清理已完成的任务记录
   */
  private cleanup(): void {
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000 // 24小时后清理

    for (const [id, task] of this.tasks) {
      if (
        (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED || task.status === TaskStatus.CANCELLED) &&
        task.completedAt &&
        now - task.completedAt.getTime() > maxAge
      ) {
        this.tasks.delete(id)
      }
    }
  }

  /**
   * 持久化任务到磁盘
   */
  private async persistTasks(): Promise<void> {
    try {
      // 确保目录存在
      const dir = path.dirname(this.config.persistencePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // 准备持久化数据
      const tasksToPersist = Array.from(this.tasks.values()).filter(task => {
        // 只持久化非终态任务（可能在恢复时需要继续）
        return task.status !== TaskStatus.COMPLETED && 
               task.status !== TaskStatus.CANCELLED &&
               task.status !== TaskStatus.FAILED
      })

      const persistData = {
        version: 1,
        timestamp: new Date().toISOString(),
        tasks: tasksToPersist.map(task => ({
          ...task,
          createdAt: task.createdAt.toISOString(),
          startedAt: task.startedAt?.toISOString(),
          completedAt: task.completedAt?.toISOString(),
        })),
        queue: this.taskQueue,
        runningTasks: Array.from(this.runningTasks),
      }

      // 写入文件（先写临时文件再重命名，保证原子性）
      const tempPath = `${this.config.persistencePath}.tmp`
      await fs.promises.writeFile(tempPath, JSON.stringify(persistData, null, 2), 'utf-8')
      await fs.promises.rename(tempPath, this.config.persistencePath)

      console.log(`[BackgroundTaskManager] 已持久化 ${tasksToPersist.length} 个任务到 ${this.config.persistencePath}`)
    } catch (error) {
      console.error('[BackgroundTaskManager] 持久化任务失败:', error)
    }
  }

  /**
   * 从磁盘恢复任务
   */
  async restoreTasks(): Promise<{ restored: number; queue: number; running: number }> {
    const result = { restored: 0, queue: 0, running: 0 }

    try {
      // 检查文件是否存在
      if (!fs.existsSync(this.config.persistencePath)) {
        console.log('[BackgroundTaskManager] 没有找到持久化文件，跳过恢复')
        return result
      }

      // 读取文件
      const data = await fs.promises.readFile(this.config.persistencePath, 'utf-8')
      const persistData = JSON.parse(data)

      if (!persistData.tasks || !Array.isArray(persistData.tasks)) {
        console.warn('[BackgroundTaskManager] 持久化文件格式无效')
        return result
      }

      // 恢复任务
      for (const taskData of persistData.tasks) {
        const task: BackgroundTask = {
          ...taskData,
          createdAt: new Date(taskData.createdAt),
          startedAt: taskData.startedAt ? new Date(taskData.startedAt) : undefined,
          completedAt: taskData.completedAt ? new Date(taskData.completedAt) : undefined,
        }

        // 如果是运行中的任务，需要重新加入队列
        if (task.status === TaskStatus.RUNNING) {
          task.status = TaskStatus.QUEUED
          result.running++
        }

        this.tasks.set(task.id, task)
        result.restored++
      }

      // 恢复队列顺序
      if (persistData.queue && Array.isArray(persistData.queue)) {
        for (const taskId of persistData.queue) {
          if (this.tasks.has(taskId)) {
            const task = this.tasks.get(taskId)!
            if (task.status === TaskStatus.QUEUED) {
              this.taskQueue.push(taskId)
              result.queue++
            }
          }
        }
      }

      console.log(`[BackgroundTaskManager] 已从 ${this.config.persistencePath} 恢复 ${result.restored} 个任务 (队列: ${result.queue}, 重新排队: ${result.running})`)

      // 触发恢复后的事件
      this.emit('tasks_restored', result)

      // 尝试启动队列中的任务
      this.tryStartNextTask()

    } catch (error) {
      console.error('[BackgroundTaskManager] 恢复任务失败:', error)
    }

    return result
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer)
    }
    this.tasks.clear()
    this.taskQueue = []
    this.runningTasks.clear()
  }
}

// 导出单例实例
let instance: BackgroundTaskManager | null = null

export function getBackgroundTaskManager(): BackgroundTaskManager {
  if (!instance) {
    instance = new BackgroundTaskManager()
  }
  return instance
}

export function createBackgroundTaskManager(config?: BackgroundTaskManagerConfig): BackgroundTaskManager {
  if (instance) {
    instance.destroy()
  }
  instance = new BackgroundTaskManager(config)
  return instance
}
