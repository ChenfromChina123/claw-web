/**
 * Agent 路由 - 处理 Agent 管理相关 API
 */

import { getBuiltInAgents, agentManager, initializeDemoOrchestration, engineExecuteAgent, runAgent } from '../agents'
import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'
import { SessionManager } from '../services/sessionManager'

const sessionManager = SessionManager.getInstance()

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
      // 认证检查
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const body = await req.json() as {
        agentId: string
        sessionId: string
        task: string
        prompt: string
        tools: string[]
        maxTurns?: number
      }

      console.log(`[AgentRoutes] 执行Agent任务: ${body.task}`)

      // 确保会话存在并加载到内存
      const sessionId = body.sessionId || `session_${Date.now()}`
      let sessionData = sessionManager.getInMemorySession(sessionId)
      if (!sessionData) {
        sessionData = await sessionManager.loadSession(sessionId)
        if (!sessionData) {
          return createErrorResponse('SESSION_NOT_FOUND', '会话不存在', 404)
        }
      }

      // 保存用户消息到数据库
      const savedUserMessage = sessionManager.addMessage(sessionId, 'user', body.task || body.prompt || 'Hello')
      if (savedUserMessage) {
        await sessionManager.forceSaveSession(sessionId)
        console.log(`[AgentRoutes] 用户消息已保存: ${savedUserMessage.id}`)
      }

      // 使用真正的 runAgent 执行 AI 调用
      const builtInAgents = getBuiltInAgents()
      const agentDef = builtInAgents.find(a => a.agentType === (body.agentId?.split('_')[1] || 'general-purpose'))
        || builtInAgents[0]

      const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'user', content: body.task || body.prompt || 'Hello' }
      ]

      // 收集所有事件
      const assistantMessages: Array<{
        id: string
        role: string
        content: string
        timestamp: string
        toolCalls: null
      }> = []
      const toolCallsList: unknown[] = []
      let finalStatus = 'completed'
      let errorMessage = ''

      // 执行 Agent
      const runner = runAgent({
        agentDefinition: agentDef,
        promptMessages: messages,
        sessionId: sessionId,
        maxTurns: body.maxTurns || 20,
      })

      // 收集所有事件
      const toolCallMap = new Map<string, any>()

      for await (const event of runner) {
        console.log(`[AgentRoutes] 事件: ${event.type}`)

        if (event.type === 'message' && event.message.role === 'assistant') {
          // 检查消息中是否包含工具调用
          const toolCalls = event.message.toolCalls || []
          const toolResults = event.message.toolResults || []

          // 添加工具调用到列表
          for (const tc of toolCalls) {
            if (!toolCallMap.has(tc.id)) {
              const toolCallData = {
                id: tc.id,
                toolName: tc.name,
                status: 'executing',
                toolInput: tc.input,
                toolOutput: null,
                error: null,
                createdAt: new Date().toISOString(),
                completedAt: null
              }
              toolCallMap.set(tc.id, toolCallData)
              toolCallsList.push(toolCallData)
            }
          }

          // 更新工具结果
          for (const tr of toolResults) {
            const existingTool = toolCallMap.get(tr.toolCallId)
            if (existingTool) {
              existingTool.status = tr.success ? 'completed' : 'error'
              existingTool.toolOutput = tr.result
              existingTool.error = tr.error
              existingTool.completedAt = new Date().toISOString()
            }
          }

          // 构建结构化消息内容
          let content = event.message.content

          // 如果消息包含工具调用，生成结构化组件
          if (toolCalls.length > 0 || toolResults.length > 0) {
            const components: any[] = []

            // 添加文本内容（如果有且不是纯JSON）
            if (content && !content.trim().startsWith('[') && !content.trim().startsWith('{')) {
              components.push({
                type: 'text',
                content: content
              })
            }

            // 添加工具调用组件
            for (const tc of toolCalls) {
              components.push({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input: tc.input
              })
            }

            // 添加工具结果组件
            for (const tr of toolResults) {
              components.push({
                type: 'tool_result',
                tool_use_id: tr.toolCallId,
                content: tr.result || tr.error || ''
              })
            }

            // 将组件序列化为JSON字符串
            content = JSON.stringify(components)
          }

          assistantMessages.push({
            id: `msg_${Date.now()}_${assistantMessages.length}`,
            role: 'assistant',
            content: content,
            timestamp: new Date().toISOString(),
            toolCalls: null
          })
        }

        if (event.type === 'tool_call') {
          const toolCallData = {
            id: event.toolCall.id,
            toolName: event.toolCall.name,
            status: 'executing',
            toolInput: event.toolCall.input,
            toolOutput: null,
            error: null,
            createdAt: new Date().toISOString(),
            completedAt: null
          }
          toolCallMap.set(event.toolCall.id, toolCallData)
          toolCallsList.push(toolCallData)
        }

        if (event.type === 'tool_result') {
          const existingTool = toolCallMap.get(event.result.toolCallId)
          if (existingTool) {
            existingTool.status = event.result.success ? 'completed' : 'error'
            existingTool.toolOutput = event.result.result
            existingTool.error = event.result.error
            existingTool.completedAt = new Date().toISOString()
          }
        }

        if (event.type === 'error') {
          finalStatus = 'error'
          errorMessage = event.error
        }

        if (event.type === 'cancelled') {
          finalStatus = 'error'
          errorMessage = '执行被中断'
        }
      }

      // 保存助手消息到数据库
      for (const msg of assistantMessages) {
        sessionManager.addMessage(sessionId, 'assistant', msg.content)
      }
      // 保存工具调用到数据库
      for (const tc of toolCallsList as any[]) {
        sessionManager.addToolCall(sessionId, tc)
      }
      // 强制保存会话
      await sessionManager.forceSaveSession(sessionId)
      console.log(`[AgentRoutes] 助手消息和工具调用已保存到数据库`)

      // 转换为 Android 端期望的响应格式
      const androidResponse = {
        messages: assistantMessages.length > 0 ? assistantMessages : [{
          id: `msg_${Date.now()}`,
          role: 'assistant',
          content: errorMessage || 'Agent 执行完成',
          timestamp: new Date().toISOString(),
          toolCalls: null
        }],
        toolCalls: toolCallsList,
        executionStatus: {
          status: finalStatus,
          currentTurn: assistantMessages.length,
          maxTurns: body.maxTurns || 20,
          progress: finalStatus === 'completed' ? 100 : 0,
          message: errorMessage || undefined
        }
      }

      return createSuccessResponse(androidResponse)
    } catch (error) {
      console.error('[AgentRoutes] Agent 执行失败:', error)
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