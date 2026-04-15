/**
 * Agent 路由 - 处理 Agent 管理相关 API
 */

import { getBuiltInAgents, agentManager, initializeDemoOrchestration, engineExecuteAgent } from '../agents'
import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'

/**
 * 处理 Agent 相关的 HTTP 请求
 */
export async function handleAgentRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  // ==================== Agent 列表 ====================

  // GET /api/agents - 获取所有可用 Agent 列表
  if (path === '/api/agents' && method === 'GET') {
    const agents = getBuiltInAgents()
    return createSuccessResponse({
      agents: agents.map(agent => ({
        agentType: agent.agentType,
        name: agent.agentType,
        description: agent.description || agent.whenToUse,
        whenToUse: agent.whenToUse,
        icon: agent.icon,
        color: agent.color,
        isReadOnly: agent.isReadOnly,
        model: agent.model,
        source: agent.source
      })),
      count: agents.length
    })
  }

  // ==================== 单个 Agent ====================

  // 排除特殊路由
  const specialRoutes = ['isolation', 'orchestration', 'execute', 'active']
  const agentType = path.replace('/api/agents/', '')
  
  // GET /api/agents/:type - 获取特定 Agent 详情
  if (!specialRoutes.some(r => agentType === r || agentType.startsWith(r + '/')) && path.startsWith('/api/agents/') && method === 'GET') {
    const agentType = path.replace('/api/agents/', '')
    const agents = getBuiltInAgents()
    const agent = agents.find(a => a.agentType === agentType)
    
    if (!agent) {
      return createErrorResponse('AGENT_NOT_FOUND', `Agent '${agentType}' not found`, 404)
    }
    
    return createSuccessResponse({
      agentType: agent.agentType,
      name: agent.agentType,
      description: agent.description || agent.whenToUse,
      whenToUse: agent.whenToUse,
      icon: agent.icon,
      color: agent.color,
      isReadOnly: agent.isReadOnly,
      model: agent.model,
      source: agent.source,
      tools: agent.tools,
      disallowedTools: agent.disallowedTools
    })
  }

  // ==================== 协调状态 ====================

  // GET /api/agents/orchestration/state - 获取多 Agent 协调状态
  if (path === '/api/agents/orchestration/state' && method === 'GET') {
    const state = agentManager.getOrchestrationState()
    return createSuccessResponse(state)
  }

  // POST /api/agents/orchestration/init - 初始化多 Agent 协调
  if (path === '/api/agents/orchestration/init' && method === 'POST') {
    try {
      const body = await req.json() as {
        orchestratorType?: string
        subAgentTypes?: string[]
      }
      
      let state
      if (body.orchestratorType && body.subAgentTypes) {
        agentManager.resetOrchestration()
        agentManager.initializeOrchestration(body.orchestratorType, body.subAgentTypes)
        state = agentManager.getOrchestrationState()
      } else {
        state = initializeDemoOrchestration()
      }
      
      return createSuccessResponse(state)
    } catch (error) {
      const message = error instanceof Error ? error.message : '初始化协调失败'
      return createErrorResponse('ORCHESTRATION_INIT_FAILED', message, 500)
    }
  }

  // POST /api/agents/execute - 执行 Agent 任务
  if (path === '/api/agents/execute' && method === 'POST') {
    try {
      const body = await req.json() as {
        agentId: string
        sessionId: string
        task: string
        prompt: string
        tools: string[]
        maxTurns?: number
      }

      const result = await engineExecuteAgent(body, (state) => {
        // WebSocket 状态更新回调
      })

      return createSuccessResponse(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent 执行失败'
      return createErrorResponse('AGENT_EXECUTE_FAILED', message, 500)
    }
  }

  // POST /api/agents/:agentId/interrupt - 中断正在执行的 Agent
  const interruptMatch = path.match(/^\/api\/agents\/([^\/]+)\/interrupt$/)
  if (interruptMatch && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const agentId = interruptMatch[1]

      if (!agentId) {
        return createErrorResponse('INVALID_PARAMS', '缺少必需参数: agentId', 400)
      }

      console.log(`[AgentRoutes] 收到中断请求，agentId: ${agentId}`)

      const success = agentManager.interruptAgent(agentId)

      if (!success) {
        return createErrorResponse('AGENT_NOT_FOUND', `Agent ${agentId} 不存在或无法中断`, 404)
      }

      console.log(`[AgentRoutes] Agent ${agentId} 中断成功`)

      return createSuccessResponse({
        success: true,
        message: `Agent ${agentId} 已被成功中断`,
        agentId,
        interruptedAt: new Date().toISOString()
      })
    } catch (error) {
      console.error('[AgentRoutes] 中断 Agent 失败:', error)
      const message = error instanceof Error ? error.message : '中断 Agent 时发生未知错误'
      return createErrorResponse('INTERRUPT_AGENT_FAILED', message, 500)
    }
  }

  // POST /api/agents/:agentId/message - 发送消息到 Agent
  const messageMatch = path.match(/^\/api\/agents\/([^\/]+)\/message$/)
  if (messageMatch && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const agentId = messageMatch[1]
      const body = await req.json() as { message: string }

      if (!agentId) {
        return createErrorResponse('INVALID_PARAMS', '缺少必需参数: agentId', 400)
      }

      if (!body.message) {
        return createErrorResponse('INVALID_PARAMS', '缺少必需参数: message', 400)
      }

      console.log(`[AgentRoutes] 收到消息，agentId: ${agentId}, message: ${body.message}`)

      // TODO: 实现消息发送到 Agent 的逻辑
      // 这里暂时返回一个模拟的响应
      return createSuccessResponse({
        success: true,
        messageId: `msg_${Date.now()}`,
        agentId,
        content: `收到消息: ${body.message}`,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('[AgentRoutes] 发送消息到 Agent 失败:', error)
      const message = error instanceof Error ? error.message : '发送消息时发生未知错误'
      return createErrorResponse('SEND_MESSAGE_FAILED', message, 500)
    }
  }

  return null
}

export default handleAgentRoutes