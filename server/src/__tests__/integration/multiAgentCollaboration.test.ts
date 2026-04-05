/**
 * 阶段四: 多 Agent 协作 - 集成测试
 * 
 * 测试内容:
 * - Agent 注册表
 * - Mailbox 消息队列
 * - SendMessage 机制
 * - Fork 子代理
 * - TeamManager 团队模式
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  AgentRegistry,
  getAgentRegistry,
  MailboxManager,
  getMailboxManager,
  TeamManager,
  getTeamManager,
  forkAgent,
  canForkAgent,
  getForkTree,
  sendMessage,
  getPendingMessages,
  isOneShotAgent,
  getOneShotAgents,
  ForkAgentError,
  ForkErrorType,
} from '../../agents'
import { GENERAL_PURPOSE_AGENT, EXPLORE_AGENT } from '../../agents/builtInAgents'

describe('阶段四: 多 Agent 协作 - Agent 注册表', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = getAgentRegistry()
  })

  afterEach(() => {
    // 清理所有注册的 Agent
    const agents = registry.getActiveAgents()
    for (const agent of agents) {
      registry.unregister(agent.agentId)
    }
  })

  describe('Agent 注册', () => {
    it('应该成功注册新的 Agent', () => {
      const agent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })

      expect(agent).toBeDefined()
      expect(agent.agentId).toMatch(/^agent_/)
      expect(agent.status).toBe('created')
      expect(agent.agentDefinition.agentType).toBe('general-purpose')
    })

    it('应该成功注册带父 Agent ID 的 Fork Agent', () => {
      const parentAgent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })

      const forkAgent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
        parentAgentId: parentAgent.agentId,
      })

      expect(forkAgent.parentAgentId).toBe(parentAgent.agentId)
    })

    it('应该成功注册团队模式的 Agent', () => {
      const teamAgent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
        teamName: 'my-team',
        memberName: 'explorer',
      })

      expect(teamAgent.teamName).toBe('my-team')
      expect(teamAgent.memberName).toBe('explorer')
    })

    it('应该能够获取已注册的 Agent', () => {
      const agent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })

      const retrieved = registry.getAgent(agent.agentId)
      expect(retrieved).toBeDefined()
      expect(retrieved?.agentId).toBe(agent.agentId)
    })

    it('应该能够检查 Agent 是否存在', () => {
      const agent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })

      expect(registry.hasAgent(agent.agentId)).toBe(true)
      expect(registry.hasAgent('non-existent')).toBe(false)
    })
  })

  describe('Agent 状态管理', () => {
    it('应该能够更新 Agent 状态', () => {
      const agent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })

      registry.updateStatus(agent.agentId, 'running')
      const updated = registry.getAgent(agent.agentId)
      expect(updated?.status).toBe('running')
    })

    it('应该能够获取所有活跃 Agent', () => {
      registry.register({ agentDefinition: GENERAL_PURPOSE_AGENT })
      registry.register({ agentDefinition: EXPLORE_AGENT })

      const active = registry.getActiveAgents()
      expect(active.length).toBeGreaterThanOrEqual(2)
    })

    it('应该能够按团队名称获取 Agent', () => {
      registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
        teamName: 'test-team',
        memberName: 'member1',
      })
      registry.register({
        agentDefinition: EXPLORE_AGENT,
        teamName: 'test-team',
        memberName: 'member2',
      })

      const teamAgents = registry.getAgentsByTeam('test-team')
      expect(teamAgents.length).toBe(2)
    })
  })

  describe('One-shot Agent 检查', () => {
    it('应该正确识别 One-shot Agent', () => {
      const agent = registry.register({
        agentDefinition: EXPLORE_AGENT,
      })

      expect(registry.canContinueAgent(agent.agentId)).toBe(false)
      expect(registry.canFork(agent.agentId)).toBe(false)
    })

    it('应该允许继续执行非 One-shot Agent', () => {
      const agent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })

      expect(registry.canContinueAgent(agent.agentId)).toBe(true)
    })
  })

  describe('消息历史管理', () => {
    it('应该能够添加消息到历史', () => {
      const agent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })

      registry.addMessage(agent.agentId, {
        role: 'user',
        content: 'Hello, Agent!',
      })

      const messages = registry.getMessageHistory(agent.agentId)
      expect(messages.length).toBe(1)
      expect(messages[0].content).toBe('Hello, Agent!')
    })
  })

  describe('Agent 取消', () => {
    it('应该能够请求取消 Agent', () => {
      const agent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })

      const result = registry.requestAbort(agent.agentId)
      expect(result).toBe(true)

      const updated = registry.getAgent(agent.agentId)
      expect(updated?.status).toBe('cancelled')
    })
  })

  describe('状态摘要', () => {
    it('应该返回正确的状态摘要', () => {
      const agent = registry.register({ agentDefinition: GENERAL_PURPOSE_AGENT })
      registry.updateStatus(agent.agentId, 'running')

      const summary = registry.getStatusSummary()
      expect(summary.total).toBeGreaterThanOrEqual(1)
      expect(summary.running).toBeGreaterThanOrEqual(1)
    })
  })
})

describe('阶段四: 多 Agent 协作 - Mailbox 消息队列', () => {
  let mailboxManager: MailboxManager

  beforeEach(() => {
    mailboxManager = getMailboxManager()
  })

  describe('邮件箱管理', () => {
    it('应该能够创建邮件箱', () => {
      const mailbox = mailboxManager.getMailbox('agent_123')
      expect(mailbox).toBeDefined()
      expect(mailbox.agentId).toBe('agent_123')
    })

    it('应该返回同一个邮件箱实例', () => {
      const mailbox1 = mailboxManager.getMailbox('agent_123')
      const mailbox2 = mailboxManager.getMailbox('agent_123')
      expect(mailbox1).toBe(mailbox2)
    })
  })

  describe('消息发送', () => {
    it('应该能够发送消息', () => {
      mailboxManager.getMailbox('agent_123')

      const result = mailboxManager.send('agent_123', {
        fromAgentId: 'agent_456',
        toAgentId: 'agent_123',
        content: 'Hello!',
      })

      expect(result.success).toBe(true)
      expect(result.messageId).toBeDefined()
    })

    it('当 Agent 不存在时应该返回错误', () => {
      const result = mailboxManager.send('non-existent', {
        fromAgentId: 'agent_456',
        toAgentId: 'non-existent',
        content: 'Hello!',
      })

      expect(result.success).toBe(false)
      expect(result.queued).toBe(true) // 消息被排队
    })
  })

  describe('团队邮件箱', () => {
    it('应该能够创建团队邮件箱', () => {
      const teamMailbox = mailboxManager.getTeamMailbox('test-team')
      expect(teamMailbox).toBeDefined()
    })

    it('应该能够广播消息到团队', () => {
      mailboxManager.getMailbox('test-team:member1')
      mailboxManager.getMailbox('test-team:member2')

      const result = mailboxManager.broadcastToTeam('test-team', 'orchestrator', 'Hello, team!')
      expect(result.delivered).toBeGreaterThanOrEqual(1)
    })
  })
})

describe('阶段四: 多 Agent 协作 - SendMessage 机制', () => {
  let registry: AgentRegistry
  let mailboxManager: MailboxManager

  beforeEach(() => {
    registry = getAgentRegistry()
    mailboxManager = getMailboxManager()
    mailboxManager.getMailbox('test-agent')
  })

  afterEach(() => {
    const agents = registry.getActiveAgents()
    for (const agent of agents) {
      registry.unregister(agent.agentId)
    }
  })

  describe('One-shot Agent 排除', () => {
    it('应该拒绝向 One-shot Agent 发送消息', async () => {
      const exploreAgent = registry.register({
        agentDefinition: EXPLORE_AGENT,
      })
      mailboxManager.getMailbox(exploreAgent.agentId)

      const result = await sendMessage({
        agentId: exploreAgent.agentId,
        message: 'Continue',
      })

      expect(result.success).toBe(false)
      expect(result.isOneShot).toBe(true)
    })

    it('应该允许向非 One-shot Agent 发送消息', async () => {
      const agent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })
      mailboxManager.getMailbox(agent.agentId)

      const result = await sendMessage({
        agentId: agent.agentId,
        message: 'Hello!',
      })

      expect(result.success).toBe(true)
    })
  })

  describe('isOneShotAgent 函数', () => {
    it('应该正确识别 One-shot Agent 类型', () => {
      expect(isOneShotAgent('Explore')).toBe(true)
      expect(isOneShotAgent('Plan')).toBe(true)
      expect(isOneShotAgent('claude-code-guide')).toBe(true)
      expect(isOneShotAgent('statusline-setup')).toBe(true)
    })

    it('应该正确识别非 One-shot Agent 类型', () => {
      expect(isOneShotAgent('general-purpose')).toBe(false)
      expect(isOneShotAgent('verification')).toBe(false)
    })
  })

  describe('getOneShotAgents 函数', () => {
    it('应该返回所有 One-shot Agent 类型', () => {
      const agents = getOneShotAgents()
      expect(agents).toContain('Explore')
      expect(agents).toContain('Plan')
      expect(agents.length).toBe(4)
    })
  })
})

describe('阶段四: 多 Agent 协作 - Fork 子代理', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = getAgentRegistry()
  })

  afterEach(() => {
    const agents = registry.getActiveAgents()
    for (const agent of agents) {
      registry.unregister(agent.agentId)
    }
  })

  describe('forkAgent 函数', () => {
    it('应该成功创建 Fork Agent', async () => {
      const parentAgent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })

      const result = await forkAgent({
        parentAgentId: parentAgent.agentId,
        prompt: 'Continue from where you left off',
      })

      expect(result.success).toBe(true)
      expect(result.forkAgentId).toBeDefined()
    })

    it('应该拒绝为不存在的父 Agent 创建 Fork', async () => {
      await expect(
        forkAgent({
          parentAgentId: 'non-existent',
          prompt: 'Continue',
        })
      ).rejects.toThrow()
    })

    it('应该拒绝为 One-shot Agent 创建 Fork', async () => {
      const exploreAgent = registry.register({
        agentDefinition: EXPLORE_AGENT,
      })

      try {
        await forkAgent({
          parentAgentId: exploreAgent.agentId,
          prompt: 'Continue',
        })
        fail('Should have thrown ForkAgentError')
      } catch (error) {
        expect(error).toBeInstanceOf(ForkAgentError)
        expect((error as ForkAgentError).errorType).toBe(ForkErrorType.ONE_SHOT_AGENT)
      }
    })

    it('应该拒绝嵌套 Fork', async () => {
      const parentAgent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })

      const fork1 = await forkAgent({
        parentAgentId: parentAgent.agentId,
        prompt: 'Fork 1',
      })

      try {
        await forkAgent({
          parentAgentId: fork1.forkAgentId!,
          prompt: 'Fork 2',
        })
        fail('Should have thrown ForkAgentError')
      } catch (error) {
        expect(error).toBeInstanceOf(ForkAgentError)
        expect((error as ForkAgentError).errorType).toBe(ForkErrorType.ALREADY_FORKED)
      }
    })
  })

  describe('canForkAgent 函数', () => {
    it('应该正确报告是否可以 Fork', async () => {
      const agent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })

      const result = canForkAgent(agent.agentId)
      expect(result.canFork).toBe(true)
    })

    it('应该报告 One-shot Agent 不可 Fork', () => {
      const exploreAgent = registry.register({
        agentDefinition: EXPLORE_AGENT,
      })

      const result = canForkAgent(exploreAgent.agentId)
      expect(result.canFork).toBe(false)
      expect(result.reason).toContain('One-shot')
    })
  })

  describe('getForkTree 函数', () => {
    it('应该返回正确的 Fork 树结构', async () => {
      const parentAgent = registry.register({
        agentDefinition: GENERAL_PURPOSE_AGENT,
      })

      const fork1 = await forkAgent({
        parentAgentId: parentAgent.agentId,
        prompt: 'Fork 1',
      })

      const tree = getForkTree(parentAgent.agentId)
      expect(tree.root).toBe(parentAgent.agentId)
      expect(tree.forks.length).toBe(1)
      expect(tree.forks[0].parentId).toBe(parentAgent.agentId)
    })
  })
})

describe('阶段四: 多 Agent 协作 - TeamManager 团队模式', () => {
  let teamManager: TeamManager

  beforeEach(() => {
    teamManager = getTeamManager()
  })

  afterEach(() => {
    // 清理所有团队
    const teams = teamManager.getTeamList()
    for (const team of teams) {
      teamManager.destroyTeam(team.teamId)
    }
  })

  describe('团队创建', () => {
    it('应该成功创建团队', () => {
      const team = teamManager.createTeam({
        teamName: 'test-team',
        description: 'Test team',
        orchestratorType: 'general-purpose',
      })

      expect(team).toBeDefined()
      expect(team.getSummary().teamName).toBe('test-team')
    })

    it('应该能够获取团队', () => {
      teamManager.createTeam({ teamName: 'my-team' })
      const team = teamManager.getTeam('my-team')

      expect(team).toBeDefined()
      expect(team?.getSummary().teamName).toBe('my-team')
    })

    it('应该返回团队列表', () => {
      teamManager.createTeam({ teamName: 'team1' })
      teamManager.createTeam({ teamName: 'team2' })

      const teams = teamManager.getTeamList()
      expect(teams.length).toBe(2)
    })
  })

  describe('团队成员管理', () => {
    it('应该能够添加团队成员', () => {
      const team = teamManager.createTeam({ teamName: 'my-team' })

      const member = team.addMember({
        memberName: 'explorer',
        agentType: 'Explore',
        role: 'specialist',
      })

      expect(member).toBeDefined()
      expect(member.memberName).toBe('explorer')
    })

    it('应该能够获取团队成员', () => {
      const team = teamManager.createTeam({ teamName: 'my-team' })
      team.addMember({ memberName: 'worker', agentType: 'general-purpose' })

      const member = team.getMember('worker')
      expect(member).toBeDefined()
      expect(member?.memberName).toBe('worker')
    })

    it('应该能够更新成员状态', () => {
      const team = teamManager.createTeam({ teamName: 'my-team' })
      team.addMember({ memberName: 'worker', agentType: 'general-purpose' })

      team.updateMemberStatus('worker', 'working', 'Running tests')

      const member = team.getMember('worker')
      expect(member?.status).toBe('working')
      expect(member?.currentTask).toBe('Running tests')
    })
  })

  describe('团队任务管理', () => {
    it('应该能够添加任务', () => {
      const team = teamManager.createTeam({ teamName: 'my-team' })

      const task = team.addTask({
        title: 'Test Task',
        description: 'Run unit tests',
        priority: 1,
      })

      expect(task).toBeDefined()
      expect(task.title).toBe('Test Task')
    })

    it('应该能够分配任务', () => {
      const team = teamManager.createTeam({ teamName: 'my-team' })
      team.addMember({ memberName: 'worker', agentType: 'general-purpose' })

      const task = team.addTask({
        title: 'Task 1',
        description: 'Do something',
      })

      const result = team.assignTask({
        taskId: task.taskId,
        memberId: 'worker',
      })

      expect(result.success).toBe(true)
    })

    it('应该能够完成任务', () => {
      const team = teamManager.createTeam({ teamName: 'my-team' })
      team.addMember({ memberName: 'worker', agentType: 'general-purpose' })

      const task = team.addTask({ title: 'Task', description: 'Do it' })
      team.assignTask({ taskId: task.taskId, memberId: 'worker' })

      team.completeTask(task.taskId, 'Done!')

      const progress = team.getProgress()
      expect(progress.completedTasks).toBe(1)
    })

    it('应该能够标记任务失败', () => {
      const team = teamManager.createTeam({ teamName: 'my-team' })
      team.addMember({ memberName: 'worker', agentType: 'general-purpose' })

      const task = team.addTask({ title: 'Task', description: 'Do it' })
      team.assignTask({ taskId: task.taskId, memberId: 'worker' })

      team.failTask(task.taskId, 'Something went wrong')

      const progress = team.getProgress()
      expect(progress.failedTasks).toBe(1)
    })
  })

  describe('团队进度', () => {
    it('应该正确计算团队进度', () => {
      const team = teamManager.createTeam({ teamName: 'my-team' })
      team.addMember({ memberName: 'worker1', agentType: 'general-purpose' })
      team.addMember({ memberName: 'worker2', agentType: 'general-purpose' })

      team.addTask({ title: 'Task 1', description: 'Do it', priority: 1 })
      team.addTask({ title: 'Task 2', description: 'Do it too', priority: 2 })

      const task1 = team.addTask({ title: 'Task 3', description: 'Done', priority: 3 })
      team.assignTask({ taskId: task1.taskId, memberId: 'worker1' })
      team.completeTask(task1.taskId)

      const progress = team.getProgress()
      expect(progress.totalTasks).toBe(3)
      expect(progress.completedTasks).toBe(1)
      expect(progress.pendingTasks).toBe(2)
    })
  })

  describe('团队统计', () => {
    it('应该返回正确的统计信息', () => {
      teamManager.createTeam({ teamName: 'team1' })
      teamManager.createTeam({ teamName: 'team2' })

      const stats = teamManager.getStats()
      expect(stats.teamCount).toBe(2)
    })
  })
})

describe('阶段四: 多 Agent 协作 - 完整协作流程', () => {
  let registry: AgentRegistry
  let teamManager: TeamManager
  let mailboxManager: MailboxManager

  beforeEach(() => {
    registry = getAgentRegistry()
    teamManager = getTeamManager()
    mailboxManager = getMailboxManager()
  })

  afterEach(() => {
    const agents = registry.getActiveAgents()
    for (const agent of agents) {
      registry.unregister(agent.agentId)
    }
    const teams = teamManager.getTeamList()
    for (const team of teams) {
      teamManager.destroyTeam(team.teamId)
    }
  })

  it('完整的团队协作流程', async () => {
    // 1. 创建团队
    const team = teamManager.createTeam({
      teamName: 'code-review-team',
      orchestratorType: 'general-purpose',
    })

    // 2. 添加团队成员
    const explorer = team.addMember({
      memberName: 'explorer',
      agentType: 'Explore',
      role: 'specialist',
    })

    const planner = team.addMember({
      memberName: 'planner',
      agentType: 'Plan',
      role: 'specialist',
    })

    const coder = team.addMember({
      memberName: 'coder',
      agentType: 'general-purpose',
      role: 'worker',
    })

    expect(team.getAllMembers().length).toBe(3)

    // 3. 创建任务
    const task1 = team.addTask({
      title: 'Explore codebase',
      description: 'Find relevant files',
      priority: 1,
    })

    const task2 = team.addTask({
      title: 'Create plan',
      description: 'Design implementation',
      priority: 2,
      dependsOn: [task1.taskId],
    })

    // 4. Fork 一个 Agent 来执行复杂任务
    const mainAgent = registry.register({
      agentDefinition: GENERAL_PURPOSE_AGENT,
    })

    const forkResult = await forkAgent({
      parentAgentId: mainAgent.agentId,
      prompt: 'Continue with the implementation',
    })

    expect(forkResult.success).toBe(true)

    // 5. 通过 SendMessage 向团队成员发送消息
    mailboxManager.getMailbox(`code-review-team:${explorer.memberName}`)

    const messageResult = await sendMessage({
      teamName: 'code-review-team',
      memberName: 'explorer',
      message: 'Please start exploring the codebase',
    })

    // One-shot Agent 不支持继续执行
    expect(messageResult.isOneShot).toBe(true)

    // 6. 向非 One-shot Agent 发送消息
    mailboxManager.getMailbox(`code-review-team:${coder.memberName}`)

    const coderMessage = await sendMessage({
      teamName: 'code-review-team',
      memberName: 'coder',
      message: 'Start coding',
    })

    expect(coderMessage.success).toBe(true)

    // 7. 检查团队进度
    const progress = team.getProgress()
    expect(progress.totalTasks).toBe(2)
  })
})
