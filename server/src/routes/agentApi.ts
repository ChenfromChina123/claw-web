/**
 * Agent 执行 API 路由
 * 
 * 阶段四: 多 Agent 协作
 * 
 * 功能:
 * - Agent 执行接口
 * - Agent 状态查询
 * - 进度 WebSocket 推送
 * - 团队管理接口
 */

import { Router, Request, Response } from 'express'
import {
  getAgentRegistry,
  getBuiltInAgents,
  forkAgent,
  canForkAgent,
  getForkTree,
  sendMessage,
  getPendingMessages,
  getTeamManager,
  getMailboxManager,
  type ForkOptions,
  type SendMessageOptions,
} from '../agents'

/**
 * 创建 Agent API 路由
 */
export function createAgentApiRouter(): Router {
  const router = Router()

  // ==================== Agent 执行 ====================

  /**
   * @route POST /api/agents/execute
   * @desc 执行 Agent
   */
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const { agentType, prompt, options } = req.body

      if (!agentType || !prompt) {
        return res.status(400).json({ error: '缺少必需参数: agentType, prompt' })
      }

      // 查找 Agent 定义
      const agents = getBuiltInAgents()
      const agentDef = agents.find(a => a.agentType === agentType)

      if (!agentDef) {
        return res.status(404).json({ error: `Agent 类型 ${agentType} 不存在` })
      }

      // 注册 Agent
      const registry = getAgentRegistry()
      const agent = registry.register({
        agentDefinition: agentDef,
        ...options,
      })

      // TODO: 启动实际执行 (需要集成到 runAgent)
      res.json({
        success: true,
        agentId: agent.agentId,
        agentType: agentDef.agentType,
        status: 'created',
      })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  // ==================== Agent 状态查询 ====================

  /**
   * @route GET /api/agents/:agentId/status
   * @desc 获取 Agent 状态
   */
  router.get('/:agentId/status', (req: Request, res: Response) => {
    try {
      const { agentId } = req.params
      const registry = getAgentRegistry()
      const agent = registry.getAgent(agentId)

      if (!agent) {
        return res.status(404).json({ error: `Agent ${agentId} 不存在` })
      }

      res.json({
        agentId: agent.agentId,
        agentType: agent.agentDefinition.agentType,
        status: agent.status,
        createdAt: agent.createdAt,
        lastActivityAt: agent.lastActivityAt,
        messageCount: agent.messageHistory.length,
        error: agent.error,
      })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route GET /api/agents/:agentId/messages
   * @desc 获取 Agent 消息历史
   */
  router.get('/:agentId/messages', (req: Request, res: Response) => {
    try {
      const { agentId } = req.params
      const { limit = 50, offset = 0 } = req.query

      const registry = getAgentRegistry()
      const messages = registry.getMessageHistory(agentId)
      const paginatedMessages = messages.slice(Number(offset), Number(offset) + Number(limit))

      res.json({
        agentId,
        total: messages.length,
        offset: Number(offset),
        limit: Number(limit),
        messages: paginatedMessages,
      })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route GET /api/agents/:agentId/pending-messages
   * @desc 获取 Agent 待处理消息
   */
  router.get('/:agentId/pending-messages', (req: Request, res: Response) => {
    try {
      const { agentId } = req.params
      const pending = getPendingMessages(agentId)
      res.json({ agentId, ...pending })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route GET /api/agents/active
   * @desc 获取所有活跃 Agent
   */
  router.get('/active', (_req: Request, res: Response) => {
    try {
      const registry = getAgentRegistry()
      const active = registry.getActiveAgents()

      res.json({
        count: active.length,
        agents: active.map(a => ({
          agentId: a.agentId,
          agentType: a.agentDefinition.agentType,
          status: a.status,
          parentAgentId: a.parentAgentId,
          teamName: a.teamName,
          createdAt: a.createdAt,
        })),
      })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route GET /api/agents/registry/status
   * @desc 获取 Agent 注册表状态
   */
  router.get('/registry/status', (_req: Request, res: Response) => {
    try {
      const registry = getAgentRegistry()
      const summary = registry.getStatusSummary()
      res.json(summary)
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  // ==================== Fork 子代理 ====================

  /**
   * @route POST /api/agents/:parentAgentId/fork
   * @desc Fork 子代理
   */
  router.post('/:parentAgentId/fork', async (req: Request, res: Response) => {
    try {
      const { parentAgentId } = req.params
      const { prompt, inheritMessages, inheritTools, inheritPermissionMode } = req.body

      if (!prompt) {
        return res.status(400).json({ error: '缺少必需参数: prompt' })
      }

      const result = await forkAgent({
        parentAgentId,
        prompt,
        inheritMessages: inheritMessages !== false,
        inheritTools: inheritTools !== false,
        inheritPermissionMode: inheritPermissionMode !== false,
      })

      res.json(result)
    } catch (error) {
      if (error instanceof Error && error.name === 'ForkAgentError') {
        return res.status(400).json({ error: error.message })
      }
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route GET /api/agents/:agentId/can-fork
   * @desc 检查是否可以 Fork
   */
  router.get('/:agentId/can-fork', (req: Request, res: Response) => {
    try {
      const { agentId } = req.params
      const result = canForkAgent(agentId)
      res.json({ agentId, ...result })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route GET /api/agents/:rootAgentId/fork-tree
   * @desc 获取 Fork 树
   */
  router.get('/:rootAgentId/fork-tree', (req: Request, res: Response) => {
    try {
      const { rootAgentId } = req.params
      const tree = getForkTree(rootAgentId)
      res.json(tree)
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  // ==================== SendMessage ====================

  /**
   * @route POST /api/agents/send-message
   * @desc 发送消息到 Agent
   */
  router.post('/send-message', async (req: Request, res: Response) => {
    try {
      const { agentId, teamName, memberName, message, fromAgentId } = req.body

      const result = await sendMessage({
        agentId,
        teamName,
        memberName,
        message,
        fromAgentId,
      })

      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  // ==================== 团队管理 ====================

  /**
   * @route POST /api/agents/teams
   * @desc 创建团队
   */
  router.post('/teams', (req: Request, res: Response) => {
    try {
      const { teamName, description, orchestratorType } = req.body

      if (!teamName) {
        return res.status(400).json({ error: '缺少必需参数: teamName' })
      }

      const manager = getTeamManager()
      const team = manager.createTeam({ teamName, description, orchestratorType })

      res.json({ success: true, teamId: team.getSummary().teamId, teamName })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route GET /api/agents/teams
   * @desc 获取团队列表
   */
  router.get('/teams', (_req: Request, res: Response) => {
    try {
      const manager = getTeamManager()
      const teams = manager.getTeamList()
      res.json({ count: teams.length, teams })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route GET /api/agents/teams/:teamId
   * @desc 获取团队详情
   */
  router.get('/teams/:teamId', (req: Request, res: Response) => {
    try {
      const { teamId } = req.params
      const manager = getTeamManager()
      const team = manager.getTeam(teamId)

      if (!team) {
        return res.status(404).json({ error: `团队 ${teamId} 不存在` })
      }

      res.json(team.getSummary())
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route POST /api/agents/teams/:teamId/members
   * @desc 添加团队成员
   */
  router.post('/teams/:teamId/members', (req: Request, res: Response) => {
    try {
      const { teamId } = req.params
      const { memberName, agentType, role, skills } = req.body

      if (!memberName || !agentType) {
        return res.status(400).json({ error: '缺少必需参数: memberName, agentType' })
      }

      const manager = getTeamManager()
      const team = manager.getTeam(teamId)

      if (!team) {
        return res.status(404).json({ error: `团队 ${teamId} 不存在` })
      }

      const member = team.addMember({ memberName, agentType, role: role || 'worker', skills })
      res.json({ success: true, member })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route POST /api/agents/teams/:teamId/tasks
   * @desc 添加团队任务
   */
  router.post('/teams/:teamId/tasks', (req: Request, res: Response) => {
    try {
      const { teamId } = req.params
      const { title, description, priority, dependsOn } = req.body

      if (!title) {
        return res.status(400).json({ error: '缺少必需参数: title' })
      }

      const manager = getTeamManager()
      const team = manager.getTeam(teamId)

      if (!team) {
        return res.status(404).json({ error: `团队 ${teamId} 不存在` })
      }

      const task = team.addTask({ title, description, priority, dependsOn })
      res.json({ success: true, task })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route POST /api/agents/teams/:teamId/assign
   * @desc 分配任务
   */
  router.post('/teams/:teamId/assign', (req: Request, res: Response) => {
    try {
      const { teamId } = req.params
      const { taskId, memberId, preferredSkills } = req.body

      if (!taskId) {
        return res.status(400).json({ error: '缺少必需参数: taskId' })
      }

      const manager = getTeamManager()
      const team = manager.getTeam(teamId)

      if (!team) {
        return res.status(404).json({ error: `团队 ${teamId} 不存在` })
      }

      const result = team.assignTask({ taskId, memberId, preferredSkills })
      res.json(result)
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route GET /api/agents/teams/:teamId/progress
   * @desc 获取团队进度
   */
  router.get('/teams/:teamId/progress', (req: Request, res: Response) => {
    try {
      const { teamId } = req.params
      const manager = getTeamManager()
      const team = manager.getTeam(teamId)

      if (!team) {
        return res.status(404).json({ error: `团队 ${teamId} 不存在` })
      }

      const progress = team.getProgress()
      res.json({ teamId, ...progress })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route GET /api/agents/stats
   * @desc 获取 Agent 系统统计
   */
  router.get('/stats', (_req: Request, res: Response) => {
    try {
      const agentRegistry = getAgentRegistry()
      const teamManager = getTeamManager()
      const mailboxManager = getMailboxManager()

      res.json({
        agentRegistry: agentRegistry.getStatusSummary(),
        teamManager: teamManager.getStats(),
        mailboxManager: mailboxManager.getStats(),
      })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  return router
}
