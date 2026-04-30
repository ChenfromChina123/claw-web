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
  TaskDecomposer,
  decomposeResultToTeamTasks,
  IsolationContextManager,
  getIsolationManager,
  agentManager,
  type ForkOptions,
  type SendMessageOptions,
  type TaskDecompositionRequest,
  type DecompositionResult,
} from '../agents'

import { SimpleLLMCaller } from '../agents/taskDecomposer'
import { getAgentStatusService } from '../services/agentStatusService'
import type { ToolCall } from '../integration/webStore'
import { executeAgent, type AgentMessage, type RunAgentParams } from '../agents/runAgent'
import { v4 as uuidv4 } from 'uuid'
import { WebSocket } from 'ws'
import { TaskPriority } from '../services/backgroundTaskManager'

/** WebSocket 连接映射 */
const wsConnections = new Map<string, Set<WebSocket>>()

/**
 * 注册 WebSocket 连接
 */
export function registerWsConnection(sessionId: string, ws: WebSocket): void {
  if (!wsConnections.has(sessionId)) {
    wsConnections.set(sessionId, new Set())
  }
  wsConnections.get(sessionId)!.add(ws)
}

/**
 * 取消注册 WebSocket 连接
 */
export function unregisterWsConnection(sessionId: string, ws: WebSocket): void {
  const connections = wsConnections.get(sessionId)
  if (connections) {
    connections.delete(ws)
    if (connections.size === 0) {
      wsConnections.delete(sessionId)
    }
  }
}

/**
 * 通过 WebSocket 发送事件
 */
function sendWsEvent(sessionId: string, event: string, data: unknown): void {
  const connections = wsConnections.get(sessionId)
  if (connections) {
    const message = JSON.stringify({ event, data })
    for (const ws of connections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message)
      }
    }
  }
}

/**
 * 创建 Agent API 路由
 */
export function createAgentApiRouter(): Router {
  const router = Router()

  // ==================== Agent 执行 ====================

  /**
   * @route POST /api/agents/:agentId/interrupt
   * 中断正在执行的 Agent（参考 claw-web/src 的 AbortController 机制）
   */
  router.post('/:agentId/interrupt', (req: Request, res: Response) => {
    try {
      const { agentId } = req.params

      if (!agentId) {
        return res.status(400).json({
          success: false,
          error: '缺少必需参数: agentId'
        })
      }

      console.log(`[AgentApi] 收到中断请求，agentId: ${agentId}`)

      // 调用 AgentManager 的 interruptAgent 方法
      const success = agentManager.interruptAgent(agentId)

      if (!success) {
        return res.status(404).json({
          success: false,
          error: `Agent ${agentId} 不存在或无法中断`
        })
      }

      console.log(`[AgentApi] Agent ${agentId} 中断成功`)

      res.json({
        success: true,
        message: `Agent ${agentId} 已被成功中断`,
        agentId,
        interruptedAt: new Date().toISOString()
      })
    } catch (error) {
      console.error('[AgentApi] 中断 Agent 失败:', error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : '中断 Agent 时发生未知错误'
      })
    }
  })

  /**
   * @route POST /api/agents/execute
   * @desc 执行 Agent
   */
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const { agentType, prompt, options, sessionId: optionsSessionId } = req.body

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
      const sessionId = optionsSessionId || uuidv4()
      const agent = registry.register({
        agentDefinition: agentDef,
        ...options,
        sessionId,
      })

      // 创建 AbortController 用于中断
      const abortController = new AbortController()

      // 构建初始消息
      const initialMessages: AgentMessage[] = [
        { role: 'user', content: prompt },
      ]

      // 构建运行参数
      const runParams: RunAgentParams = {
        agentDefinition: agentDef,
        promptMessages: initialMessages,
        sessionId,
        userId: req.body.userId || 'unknown',
        cwd: options?.cwd || process.cwd(),
        maxTurns: options?.maxTurns || 20,
        permissionMode: options?.permissionMode || 'auto',
        model: options?.model,
        abortSignal: abortController.signal,
        onProgress: (progress) => {
          console.log(`[AgentApi] ${agentType} 进度:`, progress.message)
          sendWsEvent(sessionId, 'agent_progress', progress)
        },
        onToolCall: (toolCall) => {
          console.log(`[AgentApi] ${agentType} 工具调用:`, toolCall.name)
          sendWsEvent(sessionId, 'agent_tool_call', toolCall)
        },
        onToolResult: (result) => {
          console.log(`[AgentApi] ${agentType} 工具结果:`, result.toolName, result.success)
          sendWsEvent(sessionId, 'agent_tool_result', result)
        },
      }

      // 发送启动事件
      sendWsEvent(sessionId, 'agent_started', {
        agentId: agent.agentId,
        agentType,
        sessionId,
      })

      // 异步执行 Agent，避免超时
      executeAgent(runParams)
        .then((executionResult) => {
          if (executionResult.status === 'completed') {
            registry.updateStatus(agent.agentId, 'completed')
            sendWsEvent(sessionId, 'agent_completed', {
              agentId: agent.agentId,
              result: executionResult.content,
              durationMs: executionResult.durationMs,
            })
          } else {
            registry.updateStatus(agent.agentId, 'failed')
            sendWsEvent(sessionId, 'agent_error', {
              agentId: agent.agentId,
              error: executionResult.error,
            })
          }
        })
        .catch((error) => {
          console.error(`[AgentApi] Agent ${agent.agentId} 执行异常:`, error)
          registry.updateStatus(agent.agentId, 'failed')
          sendWsEvent(sessionId, 'agent_error', {
            agentId: agent.agentId,
            error: error instanceof Error ? error.message : String(error),
          })
        })

      // 立即返回，让执行在后台继续
      res.json({
        success: true,
        agentId: agent.agentId,
        agentType: agentDef.agentType,
        sessionId,
        status: 'started',
        message: `Agent ${agentType} 已启动执行`,
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
   * @route POST /api/agents/:agentId/message
   * @desc 发送消息到指定 Agent
   */
  router.post('/:agentId/message', async (req: Request, res: Response) => {
    try {
      const { agentId } = req.params
      const { message } = req.body

      if (!message) {
        return res.status(400).json({ error: '缺少必需参数: message' })
      }

      const result = await sendMessage({
        agentId,
        message,
      })

      res.json(result)
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

  // ==================== Agent 状态面板 API ====================

  /**
   * @route GET /api/agents/status-panel/agents
   * @desc 获取可用的 Agent 列表（用于前端 AgentStatusPanel）
   */
  router.get('/status-panel/agents', (_req: Request, res: Response) => {
    try {
      const statusService = getAgentStatusService()
      const agents = statusService.getAvailableAgentTypes()
      res.json({ success: true, agents })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route GET /api/agents/status-panel/state
   * @desc 获取所有 Agent 的当前状态（用于前端 AgentStatusPanel）
   */
  router.get('/status-panel/state', (_req: Request, res: Response) => {
    try {
      const statusService = getAgentStatusService()
      const snapshots = statusService.getAllSnapshots()
      res.json({ success: true, snapshots })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route GET /api/agents/status-panel/state/:agentId
   * @desc 获取指定 Agent 的状态
   */
  router.get('/status-panel/state/:agentId', (req: Request, res: Response) => {
    try {
      const { agentId } = req.params
      const statusService = getAgentStatusService()
      const snapshot = statusService.getSnapshot(agentId)
      
      if (!snapshot) {
        return res.status(404).json({ error: `Agent ${agentId} 的状态不存在` })
      }
      
      res.json({ success: true, snapshot })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  /**
   * @route POST /api/agents/status-panel/sync-tool-call
   * @desc 同步工具调用（从工具执行器调用）
   */
  router.post('/status-panel/sync-tool-call', (req: Request, res: Response) => {
    try {
      const toolCallData: ToolCall = req.body
      
      const statusService = getAgentStatusService()
      statusService.syncFromToolCall(toolCallData)
      
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    }
  })

  return router
}

// ==================== 任务分解 API ====================

/**
 * 创建任务分解 API 路由
 */
export function createDecompositionApiRouter(): Router {
  const router = Router()
  
  // LLM 调用器（需要配置 API endpoint）
  const llmCaller = new SimpleLLMCaller(process.env.LLM_API_ENDPOINT || '')
  
  // 任务分解器实例
  const taskDecomposer = new TaskDecomposer(llmCaller)

  /**
   * @route POST /api/agents/decompose
   * @desc 分解任务
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { task, projectContext, preferences } = req.body as TaskDecompositionRequest

      if (!task) {
        return res.status(400).json({ 
          success: false,
          error: '缺少必需参数: task' 
        })
      }

      // 尝试使用 LLM 分解
      if (process.env.LLM_API_ENDPOINT) {
        const result = await taskDecomposer.decompose({
          task,
          projectContext,
          preferences
        })
        return res.json(result)
      }

      // 使用快速启发式分解
      const result = taskDecomposer.decomposeQuickly(task, preferences?.maxTasks || 8)
      res.json(result)
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      })
    }
  })

  return router
}

// ==================== 隔离上下文 API ====================

/**
 * 创建隔离上下文 API 路由
 */
export function createIsolationApiRouter(): Router {
  const router = Router()
  
  /**
   * @route POST /api/agents/isolation
   * @desc 创建隔离上下文
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { name, mode, description, worktree, remote } = req.body
      const userId = (req as any).userId

      if (!name || !mode) {
        return res.status(400).json({ 
          success: false,
          error: '缺少必需参数: name, mode' 
        })
      }

      if (!userId) {
        return res.status(401).json({ 
          success: false,
          error: '用户未登录' 
        })
      }

      const manager = getIsolationManager()
      const isolationId = await manager.create({
        isolationId: `iso_${userId}_${Date.now()}`,
        userId,
        mode,
        name,
        description,
        workingDirectory: mode === 'worktree' && worktree 
          ? worktree.mainRepoPath 
          : mode === 'remote' && remote?.connection?.host 
            ? `/remote/${remote.connection.host}` 
            : '/tmp',
        cleanupPolicy: 'delayed',
        worktree: mode === 'worktree' ? worktree : undefined,
        remote: mode === 'remote' ? remote : undefined
      })

      const context = manager.getContext(isolationId)
      res.json({ success: true, context })
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      })
    }
  })

  /**
   * @route GET /api/agents/isolation
   * @desc 获取当前用户的所有隔离上下文
   */
  router.get('/', (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId
      if (!userId) {
        return res.status(401).json({ 
          success: false,
          error: '用户未登录' 
        })
      }

      const manager = getIsolationManager()
      const contexts = manager.getContextsByUser(userId)
      res.json({ success: true, contexts })
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      })
    }
  })

  /**
   * @route GET /api/agents/isolation/:isolationId
   * @desc 获取隔离上下文详情
   */
  router.get('/:isolationId', (req: Request, res: Response) => {
    try {
      const { isolationId } = req.params
      const userId = (req as any).userId
      
      if (!userId) {
        return res.status(401).json({ 
          success: false,
          error: '用户未登录' 
        })
      }

      const manager = getIsolationManager()
      
      if (!manager.validateUserAccess(isolationId, userId)) {
        return res.status(403).json({ 
          success: false,
          error: '无权访问此隔离上下文' 
        })
      }

      const context = manager.getContext(isolationId)

      if (!context) {
        return res.status(404).json({ 
          success: false,
          error: `隔离上下文 ${isolationId} 不存在` 
        })
      }

      res.json({ success: true, context })
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      })
    }
  })

  /**
   * @route POST /api/agents/isolation/:isolationId/execute
   * @desc 在隔离上下文中执行命令
   */
  router.post('/:isolationId/execute', async (req: Request, res: Response) => {
    try {
      const { isolationId } = req.params
      const { command, args, cwd, env, timeout } = req.body
      const userId = (req as any).userId

      if (!userId) {
        return res.status(401).json({ 
          success: false,
          error: '用户未登录' 
        })
      }

      if (!command) {
        return res.status(400).json({ 
          success: false,
          error: '缺少必需参数: command' 
        })
      }

      const manager = getIsolationManager()
      
      if (!manager.validateUserAccess(isolationId, userId)) {
        return res.status(403).json({ 
          success: false,
          error: '无权访问此隔离上下文' 
        })
      }

      const result = await manager.execute({
        isolationId,
        command,
        args,
        cwd,
        env,
        timeout
      })

      res.json({ success: true, result })
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      })
    }
  })

  /**
   * @route DELETE /api/agents/isolation/:isolationId
   * @desc 销毁隔离上下文
   */
  router.delete('/:isolationId', async (req: Request, res: Response) => {
    try {
      const { isolationId } = req.params
      const userId = (req as any).userId

      if (!userId) {
        return res.status(401).json({ 
          success: false,
          error: '用户未登录' 
        })
      }

      const manager = getIsolationManager()
      
      if (!manager.validateUserAccess(isolationId, userId)) {
        return res.status(403).json({ 
          success: false,
          error: '无权访问此隔离上下文' 
        })
      }

      await manager.destroy(isolationId)
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      })
    }
  })

  return router
}
