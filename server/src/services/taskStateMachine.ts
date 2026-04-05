/**
 * 任务状态机
 * 
 * 实现任务状态转换、持久化和恢复
 */

import { v4 as uuidv4 } from 'uuid'
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
 * 状态转换记录
 */
export interface StateTransition {
  from: TaskStatus
  to: TaskStatus
  timestamp: Date
  reason?: string
}

/**
 * 任务状态快照
 */
export interface TaskStateSnapshot {
  taskId: string
  status: TaskStatus
  transitions: StateTransition[]
  createdAt: Date
  updatedAt: Date
  metadata?: Record<string, unknown>
}

/**
 * 状态机事件监听器
 */
export type StateChangeListener = (
  taskId: string,
  from: TaskStatus,
  to: TaskStatus,
  transition: StateTransition
) => void | Promise<void>

/**
 * 任务状态机
 */
export class TaskStateMachine {
  private states: Map<string, TaskStatus> = new Map()
  private transitions: Map<string, StateTransition[]> = new Map()
  private listeners: Set<StateChangeListener> = new Set()
  private persistencePath: string
  private autoPersist: boolean

  constructor(persistencePath?: string, autoPersist = true) {
    this.persistencePath = persistencePath || './data/task-states.json'
    this.autoPersist = autoPersist
  }

  /**
   * 获取任务当前状态
   */
  getStatus(taskId: string): TaskStatus | undefined {
    return this.states.get(taskId)
  }

  /**
   * 获取任务所有转换历史
   */
  getTransitionHistory(taskId: string): StateTransition[] {
    return this.transitions.get(taskId) || []
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
   * 执行状��转换
   */
  transition(taskId: string, newStatus: TaskStatus, reason?: string): boolean {
    const currentStatus = this.states.get(taskId)

    // 如果任务不存在，自动创建
    if (!currentStatus) {
      this.states.set(taskId, newStatus)
      this.transitions.set(taskId, [{
        from: newStatus,
        to: newStatus,
        timestamp: new Date(),
        reason: 'initial',
      }])
      return true
    }

    // 检查转换是否合法
    if (!this.canTransition(currentStatus, newStatus)) {
      console.warn(`[TaskStateMachine] Invalid transition: ${currentStatus} -> ${newStatus} for task ${taskId}`)
      return false
    }

    // 执行转换
    const transition: StateTransition = {
      from: currentStatus,
      to: newStatus,
      timestamp: new Date(),
      reason,
    }

    this.states.set(taskId, newStatus)
    const history = this.transitions.get(taskId) || []
    history.push(transition)
    this.transitions.set(taskId, history)

    // 通知监听器
    this.notifyListeners(taskId, currentStatus, newStatus, transition)

    // 自动持久化
    if (this.autoPersist) {
      this.persist()
    }

    return true
  }

  /**
   * 批量转换
   */
  batchTransition(taskIds: string[], newStatus: TaskStatus, reason?: string): number {
    let successCount = 0
    for (const taskId of taskIds) {
      if (this.transition(taskId, newStatus, reason)) {
        successCount++
      }
    }
    return successCount
  }

  /**
   * 获取状态转换图
   */
  getStateTransitionDiagram(): string {
    return `
State Transition Diagram:
┌─────────┐
│ CREATED │
└────┬────┘
     │ queue
     ▼
┌─────────┐     block     ┌────────┐
│  QUEUED │◄──────────────┤ BLOCKED│
└────┬────┘               └───┬────┘
     │ start                  │ unblock
     ▼                        │
┌─────────┐               ┌────▼────┐
│ RUNNING │──────────────►│COMPLETED│
└────┬────┘ complete      └─────────┘
     │
     │ fail
     ▼
┌────────┐
│ FAILED │
└────────┘

Transitions:
- CREATED → QUEUED (queue)
- CREATED → CANCELLED (cancel)
- QUEUED → RUNNING (start)
- QUEUED → CANCELLED (cancel)
- QUEUED → BLOCKED (block)
- BLOCKED → QUEUED (unblock)
- BLOCKED → CANCELLED (cancel)
- RUNNING → COMPLETED (complete)
- RUNNING → FAILED (fail)
- RUNNING → CANCELLED (cancel)
`
  }

  /**
   * 添加监听器
   */
  addListener(listener: StateChangeListener): void {
    this.listeners.add(listener)
  }

  /**
   * 移除监听器
   */
  removeListener(listener: StateChangeListener): void {
    this.listeners.delete(listener)
  }

  /**
   * 通知所有监听器
   */
  private async notifyListeners(
    taskId: string,
    from: TaskStatus,
    to: TaskStatus,
    transition: StateTransition
  ): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(taskId, from, to, transition)
      } catch (error) {
        console.error('[TaskStateMachine] Listener error:', error)
      }
    }
  }

  /**
   * 获取快照
   */
  getSnapshot(taskId: string): TaskStateSnapshot | undefined {
    const status = this.states.get(taskId)
    if (!status) return undefined

    return {
      taskId,
      status,
      transitions: this.transitions.get(taskId) || [],
      createdAt: this.transitions.get(taskId)?.[0]?.timestamp || new Date(),
      updatedAt: this.transitions.get(taskId)?.at(-1)?.timestamp || new Date(),
    }
  }

  /**
   * 获取所有快照
   */
  getAllSnapshots(): TaskStateSnapshot[] {
    const snapshots: TaskStateSnapshot[] = []
    for (const taskId of this.states.keys()) {
      const snapshot = this.getSnapshot(taskId)
      if (snapshot) {
        snapshots.push(snapshot)
      }
    }
    return snapshots
  }

  /**
   * 持久化状态到磁盘
   */
  persist(filepath?: string): void {
    const targetPath = filepath || this.persistencePath

    try {
      // 确保目录存在
      const dir = path.dirname(targetPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const data = {
        version: 1,
        timestamp: new Date().toISOString(),
        states: Array.from(this.states.entries()),
        transitions: Array.from(this.transitions.entries()).map(([taskId, trans]) => ({
          taskId,
          transitions: trans.map(t => ({
            ...t,
            timestamp: t.timestamp.toISOString(),
          })),
        })),
      }

      fs.writeFileSync(targetPath, JSON.stringify(data, null, 2))
      console.log(`[TaskStateMachine] Persisted ${this.states.size} states to ${targetPath}`)
    } catch (error) {
      console.error('[TaskStateMachine] Persist error:', error)
    }
  }

  /**
   * 从磁盘恢复状态
   */
  async restore(filepath?: string): Promise<void> {
    const targetPath = filepath || this.persistencePath

    try {
      if (!fs.existsSync(targetPath)) {
        console.log(`[TaskStateMachine] No state file found at ${targetPath}`)
        return
      }

      const data = JSON.parse(fs.readFileSync(targetPath, 'utf-8'))

      // 恢复状态
      this.states = new Map(data.states)

      // 恢复转换历史
      this.transitions = new Map(
        data.transitions.map((t: { taskId: string; transitions: Array<{ from: TaskStatus; to: TaskStatus; timestamp: string | Date; reason?: string }> }) => [
          t.taskId,
          t.transitions.map(tr => ({
            ...tr,
            timestamp: new Date(tr.timestamp),
          })),
        ])
      )

      console.log(`[TaskStateMachine] Restored ${this.states.size} states from ${targetPath}`)
    } catch (error) {
      console.error('[TaskStateMachine] Restore error:', error)
    }
  }

  /**
   * 清理状态
   */
  clear(olderThan?: Date): void {
    if (!olderThan) {
      this.states.clear()
      this.transitions.clear()
      return
    }

    for (const [taskId, transitions] of this.transitions) {
      const lastTransition = transitions.at(-1)
      if (lastTransition && lastTransition.timestamp < olderThan) {
        this.states.delete(taskId)
        this.transitions.delete(taskId)
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalTasks: number
    byStatus: Record<TaskStatus, number>
    totalTransitions: number
  } {
    const byStatus: Record<TaskStatus, number> = {
      [TaskStatus.CREATED]: 0,
      [TaskStatus.QUEUED]: 0,
      [TaskStatus.RUNNING]: 0,
      [TaskStatus.BLOCKED]: 0,
      [TaskStatus.COMPLETED]: 0,
      [TaskStatus.FAILED]: 0,
      [TaskStatus.CANCELLED]: 0,
    }

    for (const status of this.states.values()) {
      byStatus[status]++
    }

    let totalTransitions = 0
    for (const trans of this.transitions.values()) {
      totalTransitions += trans.length
    }

    return {
      totalTasks: this.states.size,
      byStatus,
      totalTransitions,
    }
  }
}

// 导出单例
let stateMachineInstance: TaskStateMachine | null = null

export function getTaskStateMachine(): TaskStateMachine {
  if (!stateMachineInstance) {
    stateMachineInstance = new TaskStateMachine()
  }
  return stateMachineInstance
}

export function createTaskStateMachine(
  persistencePath?: string,
  autoPersist?: boolean
): TaskStateMachine {
  stateMachineInstance = new TaskStateMachine(persistencePath, autoPersist)
  return stateMachineInstance
}
