/**
 * Agent 持久化服务
 * 
 * 负责 Agent 相关状态的持久化和恢复
 * 在服务器启动时从数据库恢复状态，关闭时保存状态
 */

import { AgentPersistenceRepository } from '../db/repositories/agentPersistenceRepository'
import { AgentRegistry, type AgentRuntimeState } from './agentRegistry'
import { MailboxManager, type MailboxMessage } from './mailbox'
import { TeamManager, TeamCoordinator } from './teamManager'
import { getIsolationManager, IsolationContextManager } from './contextIsolation'
import type { AgentDefinition } from './types'

/**
 * 持久化服务状态
 */
interface PersistenceState {
  isInitialized: boolean
  lastSaveTime: Date | null
  pendingChanges: Set<string>
  saveInProgress: boolean
}

/**
 * Agent 持久化服务类
 */
export class AgentPersistenceService {
  private static instance: AgentPersistenceService
  private repo: AgentPersistenceRepository
  private agentRegistry: AgentRegistry
  private mailboxManager: MailboxManager
  private teamManager: TeamManager
  private isolationManager: IsolationContextManager
  private state: PersistenceState
  private saveDebounceTimer: NodeJS.Timeout | null = null
  private readonly SAVE_DEBOUNCE_MS = 1000 // 1秒防抖

  private constructor() {
    this.repo = new AgentPersistenceRepository()
    this.agentRegistry = AgentRegistry.getInstance()
    this.mailboxManager = MailboxManager.getInstance()
    this.teamManager = TeamManager.getInstance()
    this.isolationManager = getIsolationManager()
    this.state = {
      isInitialized: false,
      lastSaveTime: null,
      pendingChanges: new Set(),
      saveInProgress: false,
    }
  }

  /**
   * 获取单例实例
   */
  static getInstance(): AgentPersistenceService {
    if (!AgentPersistenceService.instance) {
      AgentPersistenceService.instance = new AgentPersistenceService()
    }
    return AgentPersistenceService.instance
  }

  /**
   * 初始化持久化服务
   * 从数据库恢复之前的状态
   */
  async initialize(): Promise<void> {
    if (this.state.isInitialized) {
      console.log('[AgentPersistenceService] 已初始化，跳过')
      return
    }

    console.log('[AgentPersistenceService] 开始初始化，从数据库恢复状态...')

    try {
      // 1. 恢复活跃的 Agent 实例
      await this.restoreAgents()

      // 2. 恢复 Mailbox 消息
      await this.restoreMailboxMessages()

      // 3. 恢复团队状态
      await this.restoreTeams()

      // 4. 恢复隔离上下文
      await this.restoreIsolationContexts()

      this.state.isInitialized = true
      console.log('[AgentPersistenceService] 初始化完成')
    } catch (error) {
      console.error('[AgentPersistenceService] 初始化失败:', error)
      throw error
    }
  }

  /**
   * 恢复 Agent 实例
   */
  private async restoreAgents(): Promise<void> {
    console.log('[AgentPersistenceService] 恢复 Agent 实例...')

    const activeAgents = await this.repo.getActiveAgentInstances()
    console.log(`[AgentPersistenceService] 找到 ${activeAgents.length} 个活跃 Agent`)

    for (const agentData of activeAgents) {
      // 为恢复的 Agent 创建运行时状态（不创建 AbortController，因为 Agent 已中断）
      // 注意：这里只是恢复元数据，Agent 的实际执行状态需要通过前端恢复

      // 恢复消息历史
      const messages = await this.repo.getAgentMessages(agentData.id)
      console.log(`[AgentPersistenceService] Agent ${agentData.id} 有 ${messages.length} 条消息历史`)

      // 将消息历史记录到 AgentRegistry（如果需要恢复对话）
      // 注意：这里不重新注册 Agent，因为服务器重启后 Agent 执行已中断
      // 前端需要重新发起 Agent 执行才能继续
    }
  }

  /**
   * 恢复 Mailbox 消息
   */
  private async restoreMailboxMessages(): Promise<void> {
    console.log('[AgentPersistenceService] 恢复 Mailbox 消息...')

    // 恢复所有 Agent 的未读消息
    const agentRegistry = this.agentRegistry.getInstance()
    const activeAgents = agentRegistry.getActiveAgents()

    for (const agent of activeAgents) {
      const unreadMessages = await this.repo.getMailboxMessages(agent.agentId)
      console.log(`[AgentPersistenceService] Agent ${agent.agentId} 有 ${unreadMessages.length} 条未读消息`)
    }
  }

  /**
   * 恢复团队状态
   */
  private async restoreTeams(): Promise<void> {
    console.log('[AgentPersistenceService] 恢复团队状态...')

    const activeTeams = await this.repo.getActiveTeams()
    console.log(`[AgentPersistenceService] 找到 ${activeTeams.length} 个活跃团队`)

    for (const teamData of activeTeams) {
      // 创建团队协调器
      const coordinator = this.teamManager.createTeam({
        teamName: teamData.teamName,
        description: teamData.description,
        orchestratorType: teamData.orchestratorType,
      })

      // 恢复成员
      const members = await this.repo.getTeamMembers(teamData.id)
      for (const memberData of members) {
        coordinator.addMember({
          memberName: memberData.memberName,
          agentType: memberData.agentType,
          role: memberData.role,
          skills: memberData.skills,
        })

        // 更新成员状态
        if (memberData.status !== 'idle') {
          coordinator.updateMemberStatus(memberData.memberName, memberData.status, memberData.currentTask)
        }
      }

      // 恢复任务
      const tasks = await this.repo.getTeamTasks(teamData.id)
      for (const taskData of tasks) {
        // 添加任务（不触发事件）
        const task = coordinator['tasks'].get(taskData.id) || {
          taskId: taskData.id,
          title: taskData.title,
          description: taskData.description,
          status: taskData.status,
          priority: taskData.priority,
          createdAt: taskData.createdAt,
          startedAt: taskData.startedAt,
          completedAt: taskData.completedAt,
          result: taskData.result,
          error: taskData.error,
          dependsOn: taskData.dependsOn,
        }

        // 直接设置到 tasks Map（避免事件触发）
        coordinator['tasks'].set(taskData.id, task)
      }

      console.log(`[AgentPersistenceService] 团队 ${teamData.teamName}: ${members.length} 成员, ${tasks.length} 任务`)
    }
  }

  /**
   * 恢复隔离上下文
   */
  private async restoreIsolationContexts(): Promise<void> {
    console.log('[AgentPersistenceService] 恢复隔离上下文...')

    const activeContexts = await this.repo.getActiveIsolationContexts()
    console.log(`[AgentPersistenceService] 找到 ${activeContexts.length} 个活跃隔离上下文`)

    for (const contextData of activeContexts) {
      // 注意：对于 worktree 和 remote 隔离，服务器重启后需要重新建立连接
      // 这里只是记录元数据，实际的隔离环境需要重新创建

      console.log(`[AgentPersistenceService] 隔离上下文 ${contextData.name} (${contextData.mode}): ${contextData.status}`)
    }
  }

  /**
   * 标记 Agent 需要保存
   */
  markAgentDirty(agentId: string): void {
    this.state.pendingChanges.add(`agent:${agentId}`)
    this.scheduleSave()
  }

  /**
   * 标记 Mailbox 需要保存
   */
  markMailboxDirty(agentId: string): void {
    this.state.pendingChanges.add(`mailbox:${agentId}`)
    this.scheduleSave()
  }

  /**
   * 标记团队需要保存
   */
  markTeamDirty(teamId: string): void {
    this.state.pendingChanges.add(`team:${teamId}`)
    this.scheduleSave()
  }

  /**
   * 标记隔离上下文需要保存
   */
  markIsolationDirty(isolationId: string): void {
    this.state.pendingChanges.add(`isolation:${isolationId}`)
    this.scheduleSave()
  }

  /**
   * 调度保存（防抖）
   */
  private scheduleSave(): void {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer)
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.saveAllDirty().catch(err => {
        console.error('[AgentPersistenceService] 定时保存失败:', err)
      })
    }, this.SAVE_DEBOUNCE_MS)
  }

  /**
   * 保存所有脏数据
   */
  async saveAllDirty(): Promise<void> {
    if (this.state.saveInProgress) {
      console.log('[AgentPersistenceService] 保存正在进行中，跳过')
      return
    }

    if (this.state.pendingChanges.size === 0) {
      console.log('[AgentPersistenceService] 没有待保存的更改')
      return
    }

    this.state.saveInProgress = true
    const dirtyItems = Array.from(this.state.pendingChanges)
    this.state.pendingChanges.clear()

    console.log(`[AgentPersistenceService] 开始保存 ${dirtyItems.length} 个脏项...`)

    try {
      for (const item of dirtyItems) {
        const [type, id] = item.split(':')

        switch (type) {
          case 'agent':
            await this.saveAgent(id)
            break
          case 'mailbox':
            await this.saveMailbox(id)
            break
          case 'team':
            await this.saveTeam(id)
            break
          case 'isolation':
            await this.saveIsolation(id)
            break
        }
      }

      this.state.lastSaveTime = new Date()
      console.log('[AgentPersistenceService] 保存完成')
    } catch (error) {
      console.error('[AgentPersistenceService] 保存失败:', error)
      // 重新加入待保存队列
      for (const item of dirtyItems) {
        this.state.pendingChanges.add(item)
      }
      throw error
    } finally {
      this.state.saveInProgress = false
    }
  }

  /**
   * 保存单个 Agent
   */
  private async saveAgent(agentId: string): Promise<void> {
    const agent = this.agentRegistry.getAgent(agentId)
    if (!agent) {
      console.log(`[AgentPersistenceService] Agent ${agentId} 不存在，跳过保存`)
      return
    }

    await this.repo.saveAgentInstance({
      id: agent.agentId,
      agentType: agent.agentDefinition.agentType,
      status: agent.status,
      parentAgentId: agent.parentAgentId,
      teamName: agent.teamName,
      memberName: agent.memberName,
      result: agent.result,
      error: agent.error,
      createdAt: agent.createdAt,
      updatedAt: new Date(),
      lastActivityAt: agent.lastActivityAt,
    })

    // 保存消息历史（如果有需要增量保存的话）
    // 这里可以添加增量保存逻辑

    console.log(`[AgentPersistenceService] 已保存 Agent ${agentId}`)
  }

  /**
   * 保存单个 Mailbox
   */
  private async saveMailbox(agentId: string): Promise<void> {
    const mailbox = this.mailboxManager.getMailbox(agentId)
    const unreadMessages = mailbox.query({ unreadOnly: true })

    for (const msg of unreadMessages.messages) {
      await this.repo.saveMailboxMessage({
        id: msg.id,
        fromAgentId: msg.fromAgentId,
        toAgentId: msg.toAgentId,
        content: msg.content,
        threadId: msg.threadId,
        isRead: msg.read,
        timestamp: msg.timestamp,
      })
    }

    console.log(`[AgentPersistenceService] 已保存 Mailbox ${agentId} 的 ${unreadMessages.messages.length} 条消息`)
  }

  /**
   * 保存单个团队
   */
  private async saveTeam(teamId: string): Promise<void> {
    const coordinator = this.teamManager.getTeam(teamId)
    if (!coordinator) {
      console.log(`[AgentPersistenceService] 团队 ${teamId} 不存在，跳过保存`)
      return
    }

    const summary = coordinator.getSummary()
    const members = coordinator.getAllMembers()
    const progress = coordinator.getProgress()

    // 保存团队基本信息
    await this.repo.saveTeam({
      id: teamId,
      teamName: summary.teamName,
      description: undefined,
      orchestratorType: summary.orchestratorAgentId ? 'coordinator' : undefined,
      orchestratorAgentId: summary.orchestratorAgentId,
      overallStatus: summary.overallStatus as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    // 保存成员
    for (const member of members) {
      await this.repo.saveTeamMember({
        id: member.memberId,
        teamId: teamId,
        memberName: member.memberName,
        agentType: member.agentType,
        agentId: member.agentId,
        role: member.role,
        status: member.status,
        currentTask: member.currentTask,
        skills: member.skills,
        createdAt: member.createdAt,
        updatedAt: new Date(),
      })
    }

    // 保存任务
    for (const [, task] of coordinator['tasks']) {
      await this.repo.saveTeamTask({
        id: task.taskId,
        teamId: teamId,
        title: task.title,
        description: task.description,
        assignedTo: task.assignedTo,
        status: task.status,
        priority: task.priority,
        result: task.result,
        error: task.error,
        dependsOn: task.dependsOn,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
      })
    }

    console.log(`[AgentPersistenceService] 已保存团队 ${summary.teamName}: ${members.length} 成员`)
  }

  /**
   * 保存单个隔离上下文
   */
  private async saveIsolation(isolationId: string): Promise<void> {
    const context = this.isolationManager.getContext(isolationId)
    if (!context) {
      console.log(`[AgentPersistenceService] 隔离上下文 ${isolationId} 不存在，跳过保存`)
      return
    }

    await this.repo.saveIsolationContext({
      id: context.isolationId,
      name: context.name,
      mode: context.mode,
      description: undefined,
      workingDirectory: context.workingDirectory,
      environment: undefined,
      cleanupPolicy: 'delayed',
      status: context.status,
      executionCount: context.executionCount,
      totalDuration: context.totalDuration,
      createdAt: context.createdAt,
      updatedAt: new Date(),
      lastActivityAt: context.lastActivity,
    })

    console.log(`[AgentPersistenceService] 已保存隔离上下文 ${isolationId}`)
  }

  /**
   * 强制保存所有数据（用于服务器关闭时）
   */
  async forceSaveAll(): Promise<void> {
    console.log('[AgentPersistenceService] 强制保存所有数据...')

    // 清除防抖定时器
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer)
      this.saveDebounceTimer = null
    }

    // 标记所有内容为脏
    // Agent
    for (const [agentId] of this.agentRegistry.getInstance()['agents']) {
      this.state.pendingChanges.add(`agent:${agentId}`)
    }

    // Mailbox
    const stats = this.mailboxManager.getStats()
    console.log(`[AgentPersistenceService] 待保存: ${this.agentRegistry.getInstance()['agents'].size} Agents, ${stats.mailboxCount} Mailboxes`)

    // 保存所有
    await this.saveAllDirty()

    console.log('[AgentPersistenceService] 强制保存完成')
  }

  /**
   * 获取持久化状态
   */
  getState(): PersistenceState {
    return { ...this.state }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.state.isInitialized
  }
}

/**
 * 获取持久化服务单例
 */
export function getAgentPersistenceService(): AgentPersistenceService {
  return AgentPersistenceService.getInstance()
}
