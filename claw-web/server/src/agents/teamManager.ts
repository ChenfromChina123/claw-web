/**
 * TeamManager - 团队管理模块
 * 
 * 阶段四: 多 Agent 协作 (4.4 Teammate 团队模式)
 * 
 * 功能:
 * - 团队创建和销毁
 * - 团队成员管理
 * - 任务分发和协调
 * - 团队状态同步
 */

import { randomUUID } from 'crypto'
import type { AgentDefinition } from './types'
import { AgentRegistry } from './agentRegistry'
import { MailboxManager } from './mailbox'

/**
 * 团队成员角色
 */
export type TeamRole = 'orchestrator' | 'worker' | 'reviewer' | 'specialist'

/**
 * 团队成员状态
 */
export type TeamMemberStatus = 'idle' | 'assigned' | 'working' | 'completed' | 'blocked' | 'failed'

/**
 * 团队成员
 */
export interface TeamMember {
  memberId: string
  memberName: string
  agentType: string
  agentId?: string
  role: TeamRole
  status: TeamMemberStatus
  currentTask?: string
  skills: string[]
  createdAt: Date
  lastActivityAt: Date
}

/**
 * 团队任务
 */
export interface TeamTask {
  taskId: string
  title: string
  description: string
  assignedTo?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  priority: number
  createdAt: Date
  startedAt?: Date
  completedAt?: Date
  result?: string
  error?: string
  dependsOn?: string[]
}

/**
 * 团队状态
 */
export interface TeamState {
  teamId: string
  teamName: string
  description: string
  orchestratorType: string
  orchestratorAgentId?: string
  members: TeamMember[]
  tasks: TeamTask[]
  overallStatus: 'created' | 'initializing' | 'ready' | 'executing' | 'completed' | 'failed'
  createdAt: Date
  updatedAt: Date
}

/**
 * 任务分配结果
 */
export interface TaskAssignmentResult {
  success: boolean
  taskId?: string
  memberId?: string
  error?: string
}

/**
 * 团队协调器类
 */
export class TeamCoordinator {
  private teamId: string
  private teamName: string
  private orchestratorAgentId?: string
  private members: Map<string, TeamMember> = new Map()
  private tasks: Map<string, TeamTask> = new Map()
  private taskQueue: string[] = [] // 按优先级排序的任务 ID
  private mailboxManager: MailboxManager
  private agentRegistry: AgentRegistry
  private listeners: Map<string, Set<(event: TeamEvent) => void>> = new Map()

  constructor(teamId: string, teamName: string) {
    this.teamId = teamId
    this.teamName = teamName
    this.mailboxManager = MailboxManager.getInstance()
    this.agentRegistry = AgentRegistry.getInstance()
  }

  /**
   * 设置协调者 Agent ID
   */
  setOrchestrator(agentId: string): void {
    this.orchestratorAgentId = agentId
    this.emit('orchestrator_assigned', { agentId })
  }

  /**
   * 添加团队成员
   */
  addMember(params: {
    memberName: string
    agentType: string
    role: TeamRole
    skills?: string[]
  }): TeamMember {
    const memberId = `${this.teamName}:${params.memberName}`

    // 检查成员是否已存在
    if (this.members.has(memberId)) {
      throw new Error(`成员 ${params.memberName} 已存在于团队 ${this.teamName}`)
    }

    const member: TeamMember = {
      memberId,
      memberName: params.memberName,
      agentType: params.agentType,
      role: params.role,
      status: 'idle',
      skills: params.skills || [],
      createdAt: new Date(),
      lastActivityAt: new Date(),
    }

    this.members.set(memberId, member)

    // 创建成员邮件箱
    this.mailboxManager.getMailbox(memberId)

    console.log(`[TeamCoordinator:${this.teamName}] 添加成员: ${params.memberName} (角色: ${params.role})`)
    this.emit('member_added', { member })

    return member
  }

  /**
   * 获取成员
   */
  getMember(memberIdOrName: string): TeamMember | undefined {
    return this.members.get(memberIdOrName) || this.members.get(`${this.teamName}:${memberIdOrName}`)
  }

  /**
   * 获取所有成员
   */
  getAllMembers(): TeamMember[] {
    return Array.from(this.members.values())
  }

  /**
   * 更新成员状态
   */
  updateMemberStatus(memberIdOrName: string, status: TeamMemberStatus, currentTask?: string): void {
    const member = this.getMember(memberIdOrName)
    if (member) {
      member.status = status
      member.lastActivityAt = new Date()
      if (currentTask !== undefined) {
        member.currentTask = currentTask
      }
      this.emit('member_status_changed', { memberId: member.memberId, status, currentTask })
    }
  }

  /**
   * 添加任务
   */
  addTask(params: {
    title: string
    description: string
    priority?: number
    dependsOn?: string[]
  }): TeamTask {
    const taskId = `task_${randomUUID().slice(0, 8)}`

    // 检查是否有同名任务
    const existingTask = Array.from(this.tasks.values()).find(t => t.title === params.title)
    if (existingTask) {
      throw new Error(`任务 "${params.title}" 已存在于团队`)
    }

    const task: TeamTask = {
      taskId,
      title: params.title,
      description: params.description,
      status: 'pending',
      priority: params.priority || 5,
      createdAt: new Date(),
      dependsOn: params.dependsOn,
    }

    this.tasks.set(taskId, task)

    // 按优先级插入到队列
    this.insertTaskIntoQueue(taskId, task.priority)

    console.log(`[TeamCoordinator:${this.teamName}] 添加任务: ${params.title} (优先级: ${task.priority})`)
    this.emit('task_added', { task })

    return task
  }

  /**
   * 按优先级插入任务到队列
   */
  private insertTaskIntoQueue(taskId: string, priority: number): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    // 找到插入位置 (优先级高的在前)
    let insertIndex = this.taskQueue.length
    for (let i = 0; i < this.taskQueue.length; i++) {
      const existingTask = this.tasks.get(this.taskQueue[i])
      if (existingTask && existingTask.priority < priority) {
        insertIndex = i
        break
      }
    }

    this.taskQueue.splice(insertIndex, 0, taskId)
  }

  /**
   * 分配任务
   */
  assignTask(params: {
    taskId: string
    memberId?: string
    preferredSkills?: string[]
  }): TaskAssignmentResult {
    const task = this.tasks.get(params.taskId)
    if (!task) {
      return { success: false, error: `任务 ${params.taskId} 不存在` }
    }

    // 如果没有指定成员，查找合适的成员
    let targetMember = params.memberId ? this.members.get(params.memberId) : undefined

    if (!targetMember) {
      // 查找空闲成员
      targetMember = this.findAvailableMember(params.preferredSkills)
    }

    if (!targetMember) {
      return { success: false, error: '没有可用的团队成员' }
    }

    // 更新任务状态
    task.assignedTo = targetMember.memberId
    task.status = 'in_progress'
    task.startedAt = new Date()

    // 更新成员状态
    targetMember.status = 'assigned'
    targetMember.currentTask = task.title
    targetMember.lastActivityAt = new Date()

    console.log(`[TeamCoordinator:${this.teamName}] 分配任务 "${task.title}" 给 ${targetMember.memberName}`)
    this.emit('task_assigned', { taskId: task.taskId, memberId: targetMember.memberId })

    return {
      success: true,
      taskId: task.taskId,
      memberId: targetMember.memberId,
    }
  }

  /**
   * 查找可用的团队成员
   */
  findAvailableMember(preferredSkills?: string[], preferredRole?: TeamRole): TeamMember | undefined {
    const availableMembers = Array.from(this.members.values())
      .filter(m => m.status === 'idle')

    if (availableMembers.length === 0) return undefined

    // 如果有技能偏好，优先选择有对应技能的成员
    if (preferredSkills && preferredSkills.length > 0) {
      const skilledMember = availableMembers.find(m =>
        m.skills.some(s => preferredSkills.includes(s))
      )
      if (skilledMember) return skilledMember
    }

    // 如果有角色偏好，优先选择对应角色的成员
    if (preferredRole) {
      const roleMember = availableMembers.find(m => m.role === preferredRole)
      if (roleMember) return roleMember
    }

    // 返回第一个空闲成员
    return availableMembers[0]
  }

  /**
   * 完成任务
   */
  completeTask(taskId: string, result?: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.status = 'completed'
    task.completedAt = new Date()
    task.result = result

    // 更新成员状态
    if (task.assignedTo) {
      const member = this.members.get(task.assignedTo)
      if (member) {
        member.status = 'idle'
        member.currentTask = undefined
        member.lastActivityAt = new Date()
      }
    }

    console.log(`[TeamCoordinator:${this.teamName}] 任务 "${task.title}" 已完成`)
    this.emit('task_completed', { taskId, result })

    // 检查是否所有任务都完成
    this.checkTeamCompletion()
  }

  /**
   * 标记任务失败
   */
  failTask(taskId: string, error: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.status = 'failed'
    task.error = error

    // 更新成员状态
    if (task.assignedTo) {
      const member = this.members.get(task.assignedTo)
      if (member) {
        member.status = 'failed'
        member.lastActivityAt = new Date()
      }
    }

    console.error(`[TeamCoordinator:${this.teamName}] 任务 "${task.title}" 失败: ${error}`)
    this.emit('task_failed', { taskId, error })

    // 检查团队是否失败
    this.checkTeamCompletion()
  }

  /**
   * 获取下一个待处理的任务
   */
  getNextTask(): TeamTask | undefined {
    for (const taskId of this.taskQueue) {
      const task = this.tasks.get(taskId)
      if (task && task.status === 'pending') {
        // 检查依赖是否满足
        if (task.dependsOn && task.dependsOn.length > 0) {
          const depsCompleted = task.dependsOn.every(depId => {
            const dep = this.tasks.get(depId)
            return dep && dep.status === 'completed'
          })
          if (!depsCompleted) continue
        }
        return task
      }
    }
    return undefined
  }

  /**
   * 检查团队是否完成所有任务
   */
  private checkTeamCompletion(): void {
    const allTasks = Array.from(this.tasks.values())
    const pendingOrInProgress = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress')

    if (allTasks.length > 0 && pendingOrInProgress.length === 0) {
      const hasFailed = allTasks.some(t => t.status === 'failed')
      console.log(`[TeamCoordinator:${this.teamName}] 团队所有任务${hasFailed ? '(含失败)' : ''}已完成`)
      this.emit(hasFailed ? 'team_completed_with_failures' : 'team_completed', {
        totalTasks: allTasks.length,
        completedTasks: allTasks.filter(t => t.status === 'completed').length,
        failedTasks: allTasks.filter(t => t.status === 'failed').length,
      })
    }
  }

  /**
   * 获取团队进度
   */
  getProgress(): {
    totalTasks: number
    pendingTasks: number
    inProgressTasks: number
    completedTasks: number
    failedTasks: number
    overallProgress: number
  } {
    const allTasks = Array.from(this.tasks.values())
    const completed = allTasks.filter(t => t.status === 'completed').length
    const failed = allTasks.filter(t => t.status === 'failed').length
    const inProgress = allTasks.filter(t => t.status === 'in_progress').length
    const pending = allTasks.filter(t => t.status === 'pending').length

    return {
      totalTasks: allTasks.length,
      pendingTasks: pending,
      inProgressTasks: inProgress,
      completedTasks: completed,
      failedTasks: failed,
      overallProgress: allTasks.length > 0 ? Math.round(((completed + failed) / allTasks.length) * 100) : 0,
    }
  }

  /**
   * 添加事件监听器
   */
  addEventListener(eventType: string, listener: (event: TeamEvent) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(listener)
    return () => this.listeners.get(eventType)?.delete(listener)
  }

  /**
   * 发出事件
   */
  private emit(eventType: string, data: Record<string, unknown>): void {
    const event: TeamEvent = { type: eventType, teamId: this.teamId, teamName: this.teamName, ...data }
    const listeners = this.listeners.get(eventType)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event)
        } catch (error) {
          console.error(`[TeamCoordinator:${this.teamName}] 事件监听器错误:`, error)
        }
      })
    }
  }

  /**
   * 获取团队状态摘要
   */
  getSummary(): {
    teamId: string
    teamName: string
    orchestratorAgentId?: string
    memberCount: number
    taskCount: number
    overallStatus: string
  } {
    const idleMembers = Array.from(this.members.values()).filter(m => m.status === 'idle').length
    const workingMembers = Array.from(this.members.values()).filter(m => m.status === 'working' || m.status === 'assigned').length
    const completedTasks = Array.from(this.tasks.values()).filter(t => t.status === 'completed').length
    const totalTasks = this.tasks.size

    let overallStatus = 'ready'
    if (totalTasks === 0) {
      overallStatus = 'ready'
    } else if (completedTasks === totalTasks) {
      overallStatus = 'completed'
    } else if (workingMembers > 0) {
      overallStatus = 'executing'
    }

    return {
      teamId: this.teamId,
      teamName: this.teamName,
      orchestratorAgentId: this.orchestratorAgentId,
      memberCount: this.members.size,
      taskCount: totalTasks,
      overallStatus,
    }
  }
}

/**
 * 团队事件
 */
export interface TeamEvent {
  type: string
  teamId: string
  teamName: string
  [key: string]: unknown
}

/**
 * TeamManager 团队管理器
 */
export class TeamManager {
  private static instance: TeamManager
  private teams: Map<string, TeamCoordinator> = new Map()
  private teamsByName: Map<string, TeamCoordinator> = new Map()
  private listenerRegistry: Map<string, Set<(event: TeamEvent) => void>> = new Map()

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): TeamManager {
    if (!TeamManager.instance) {
      TeamManager.instance = new TeamManager()
    }
    return TeamManager.instance
  }

  /**
   * 创建团队
   */
  createTeam(params: {
    teamName: string
    description?: string
    orchestratorType?: string
  }): TeamCoordinator {
    const teamId = `team_${randomUUID().slice(0, 8)}`
    const coordinator = new TeamCoordinator(teamId, params.teamName)

    this.teams.set(teamId, coordinator)
    this.teamsByName.set(params.teamName, coordinator)

    console.log(`[TeamManager] 创建团队: ${params.teamName} (ID: ${teamId})`)

    return coordinator
  }

  /**
   * 获取团队
   */
  getTeam(teamId: string): TeamCoordinator | undefined {
    return this.teams.get(teamId) || this.teamsByName.get(teamId)
  }

  /**
   * 获取团队摘要列表
   */
  getTeamList(): Array<{
    teamId: string
    teamName: string
    description?: string
    orchestratorType?: string
    memberCount: number
    taskCount: number
    overallStatus: string
    createdAt: Date
  }> {
    return Array.from(this.teams.values()).map(team => {
      const summary = team.getSummary()
      return {
        teamId: summary.teamId,
        teamName: summary.teamName,
        memberCount: summary.memberCount,
        taskCount: summary.taskCount,
        overallStatus: summary.overallStatus,
        createdAt: new Date(), // TODO: 从 TeamState 获取
      }
    })
  }

  /**
   * 销毁团队
   */
  destroyTeam(teamId: string): boolean {
    const team = this.teams.get(teamId) || this.teamsByName.get(teamId)
    if (team) {
      console.log(`[TeamManager] 销毁团队: ${teamId}`)
      this.teams.delete(teamId)
      this.teamsByName.delete(team.getSummary().teamName)
      return true
    }
    return false
  }

  /**
   * 注册全局团队事件监听器
   */
  addGlobalListener(eventType: string, listener: (event: TeamEvent) => void): () => void {
    if (!this.listenerRegistry.has(eventType)) {
      this.listenerRegistry.set(eventType, new Set())
    }
    this.listenerRegistry.get(eventType)!.add(listener)
    return () => this.listenerRegistry.get(eventType)?.delete(listener)
  }

  /**
   * 发出全局团队事件
   */
  emitGlobalEvent(event: TeamEvent): void {
    const listeners = this.listenerRegistry.get(event.type)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event)
        } catch (error) {
          console.error(`[TeamManager] 全局事件监听器错误:`, error)
        }
      })
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): { teamCount: number; totalMembers: number; totalTasks: number } {
    let totalMembers = 0
    let totalTasks = 0

    for (const team of this.teams.values()) {
      totalMembers += team.getSummary().memberCount
      totalTasks += team.getSummary().taskCount
    }

    return {
      teamCount: this.teams.size,
      totalMembers,
      totalTasks,
    }
  }
}

/**
 * 获取 TeamManager 单例
 */
export function getTeamManager(): TeamManager {
  return TeamManager.getInstance()
}
