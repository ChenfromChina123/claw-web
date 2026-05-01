/**
 * WebSocket 消息路由 - 根据消息类型分发到对应的处理器
 */

import type { WebSocketData, WebSocketMessage, EventSender } from '../types'
import { websocketPayloadToText } from '../utils/websocket'
import { SessionManager } from '../services/sessionManager'
import { sessionConversationManager } from '../services/conversation'
import { getBuiltInAgents, agentManager, initializeDemoOrchestration } from '../agents'
import { getAgentStatusService } from '../services/agentStatusService'
import { wsManager } from '../integration/wsBridge'
import { toolExecutor } from '../integration/enhancedToolExecutor'
import { verifyToken } from '../services/jwtService'
import { getAgentPushService } from '../services/agentPushService'
import { WebCommandBridge } from '../integrations/commandBridge'
import { v4 as uuidv4 } from 'uuid'

const sessionManager = SessionManager.getInstance()

/**
 * 创建事件发送器
 */
function createSendEvent(ws: any, wsData: WebSocketData): EventSender {
  return (event: string, eventData: unknown) => {
    if (wsData.sendEvent) {
      wsData.sendEvent(event, { ...eventData as object, sessionId: wsData.sessionId })
    }
  }
}

/**
 * 处理 WebSocket 连接打开
 */
export function handleWebSocketOpen(ws: any, wsData: WebSocketData): void {
  console.log(`[WS] Client connected: ${wsData.connectionId}`)
  
  // 添加到 WebSocket 管理器
  wsManager.addConnection(ws, wsData.connectionId)
  
  // 设置事件发送器
  wsData.sendEvent = (event: string, data: unknown) => {
    try {
      const socket = ws as { send?: (data: string) => void; readyState?: number }
      if (socket.send && socket.readyState === 1) {
        const payload = JSON.stringify({ type: 'event', event, data, timestamp: Date.now() })
        socket.send(payload)
      }
    } catch (error) {
      console.error('Failed to send event:', error)
    }
  }

  // 配置 Agent 状态推送
  const agentStatusService = getAgentStatusService()
  agentStatusService.setWSPush((clientId, data) => {
    if (clientId === 'broadcast') {
      wsManager.broadcast('agent_status', {
        type: data.type,
        payload: data.payload,
        timestamp: data.timestamp,
      } as any)
    }
  })

  ws.send(JSON.stringify({
    type: 'connected',
    connectionId: wsData.connectionId,
    timestamp: Date.now(),
  }))
}

/**
 * 处理 WebSocket 消息
 */
export async function handleWebSocketMessage(ws: any, wsData: WebSocketData, data: unknown): Promise<void> {
  try {
    const rawText = websocketPayloadToText(data)
    const message: WebSocketMessage = JSON.parse(rawText)
    console.log(`[WS] Message from ${wsData.connectionId}:`, message.type)

    const sendEvent = createSendEvent(ws, wsData)

    switch (message.type) {
      case 'rpc_call':
        wsManager.routeIncomingMessage(wsData.connectionId, rawText)
        break

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
        break

      case 'pong':
        break

      case 'register':
        await handleRegister(ws, wsData, message, sendEvent)
        break

      case 'login':
        await handleLogin(ws, wsData, message, sendEvent)
        break

      case 'create_session':
        await handleCreateSession(ws, wsData, message, sendEvent)
        break

      case 'load_session':
        await handleLoadSession(ws, wsData, message, sendEvent)
        break

      case 'list_sessions':
        await handleListSessions(ws, wsData, message, sendEvent)
        break

      case 'user_message':
        await handleUserMessage(ws, wsData, message, sendEvent)
        break

      case 'interrupt_generation':
        await handleInterruptGeneration(ws, wsData, message, sendEvent)
        break

      case 'delete_session':
        await handleDeleteSession(ws, wsData, message, sendEvent)
        break

      case 'rename_session':
        await handleRenameSession(ws, wsData, message, sendEvent)
        break

      case 'clear_session':
        await handleClearSession(ws, wsData, message, sendEvent)
        break

      case 'rollback_session':
        await handleRollbackSession(ws, wsData, message, sendEvent)
        break

      case 'get_tools':
        await handleGetTools(ws, wsData, message, sendEvent)
        break

      case 'execute_command':
        await handleExecuteCommand(ws, wsData, message, sendEvent)
        break

      case 'validate_user':
        await handleValidateUser(ws, wsData, message, sendEvent)
        break

      case 'get_models':
        await handleGetModels(ws, wsData, message, sendEvent)
        break

      case 'get_status':
        await handleGetStatus(ws, wsData, message, sendEvent)
        break

      case 'agents_list':
        await handleAgentsList(ws, wsData, message, sendEvent)
        break

      case 'agents_orchestration_state':
        await handleOrchestrationState(ws, wsData, message, sendEvent)
        break

      case 'agents_orchestration_init':
        await handleOrchestrationInit(ws, wsData, message, sendEvent)
        break

      default:
        sendEvent('error', { message: `Unknown message type: ${message.type}` })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[WS] Message handling error:', errorMessage)
    ws.send(JSON.stringify({ type: 'error', message: errorMessage }))
  }
}

/**
 * 处理 WebSocket 连接关闭
 */
export function handleWebSocketClose(ws: any, wsData: WebSocketData): void {
  console.log(`[WS] Client disconnected: ${wsData.connectionId}`)
  
  // 关闭时保存会话
  if (wsData.sessionId) {
    sessionManager.saveSession(wsData.sessionId).catch(err => {
      console.error('[WS] Failed to save session on close:', err)
    })
  }
  
  // 从 WebSocket 管理器移除连接
  wsManager.removeConnection(wsData.connectionId)
}

// ==================== 消息处理器 ====================

async function handleRegister(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const userId = message.userId as string || uuidv4()
  const username = message.username as string || `user_${userId.slice(0, 8)}`
  wsData.userId = userId

  sessionManager.getOrCreateUser(userId, username).then(user => {
    wsData.userId = user.id
    wsManager.syncConnectionMeta(wsData.connectionId, { userId: user.id })
    console.log(`[WS] User registered: ${user.id} (${user.username})`)
    ws.send(JSON.stringify({ type: 'registered', userId: user.id, username: user.username }))
  }).catch(err => {
    console.error('[WS] Failed to register user:', err)
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to register user' }))
  })
}

async function handleLogin(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const token = message.token as string
  if (!token) {
    console.error('[WS] Login failed: no token provided')
    ws.send(JSON.stringify({ type: 'error', message: 'Token is required' }))
    return
  }

  wsData.token = token
  try {
    const payload = await verifyToken(token)
    if (payload) {
      wsData.userId = payload.userId
      wsManager.syncConnectionMeta(wsData.connectionId, { userId: payload.userId })
      console.log(`[WS] User logged in via token: ${payload.userId}`)
      ws.send(JSON.stringify({ type: 'logged_in', userId: payload.userId }))

      getAgentPushService().deliverOfflineMessages(payload.userId).catch(err => {
        console.error(`[WS] Failed to deliver offline messages for user ${payload.userId}:`, err)
      })
    } else {
      console.error('[WS] Login failed: invalid token')
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid token' }))
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Token verification failed'
    console.error('[WS] Login failed:', errorMsg)
    ws.send(JSON.stringify({ type: 'error', message: errorMsg }))
  }
}

async function handleCreateSession(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const userId = wsData.userId
  if (!userId) {
    sendEvent('error', { message: 'User not registered' })
    return
  }

  const title = message.title as string || '新对话'
  const model = message.model as string || 'qwen-plus'
  const force = message.force as boolean || false

  sessionManager.createSession(userId, title, model, force).then(result => {
    wsData.sessionId = result.id
    wsManager.syncConnectionMeta(wsData.connectionId, { sessionId: result.id })
    console.log(`[WS] Session ${result.isNew ? 'created' : 'returned'}: ${result.id} for user ${userId}`)
    
    // 根据是否是新创建的会话，发送不同的事件类型
    // 前端可以通过 eventType 区分：'session_created'(新建) vs 'session_returned'(返回已有空会话)
    ws.send(JSON.stringify({ 
      type: result.isNew ? 'session_created' : 'session_returned', 
      session: result,
      isNew: result.isNew
    }))
  }).catch(err => {
    console.error('[WS] Failed to create session:', err)
    sendEvent('error', { message: 'Failed to create session' })
  })
}

async function handleLoadSession(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const sessionId = message.sessionId as string
  const userId = wsData.userId
  if (!userId) {
    sendEvent('error', { message: 'User not authenticated' })
    return
  }

  const currentSessionId = wsData.sessionId

  // 如果切换会话，先保存当前会话
  if (currentSessionId && currentSessionId !== sessionId) {
    console.log(`[WS] Switching from session ${currentSessionId} to ${sessionId}, saving first`)
    await sessionManager.switchSession(currentSessionId, sessionId)
  }

  sessionManager.loadSession(sessionId).then(sessionData => {
    if (!sessionData) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session not found' }))
      return
    }

    wsData.sessionId = sessionId
    wsManager.syncConnectionMeta(wsData.connectionId, { sessionId })
    console.log(`[WS] Session loaded: ${sessionId}, messages: ${sessionData.messages.length}`)

    ws.send(JSON.stringify({
      type: 'session_loaded',
      session: sessionData.session,
      messages: sessionData.messages,
      toolCalls: sessionData.toolCalls,
    }))
  }).catch(err => {
    console.error('[WS] Failed to load session:', err)
    sendEvent('error', { message: 'Failed to load session' })
  })
}

async function handleListSessions(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const userId = wsData.userId
  console.log(`[WS] list_sessions: userId=${userId}`)
  if (!userId) {
    console.log('[WS] list_sessions: userId is null, sending error')
    sendEvent('error', { message: 'User not registered' })
    return
  }

  sessionManager.getUserSessions(userId).then(sessions => {
    console.log(`[WS] list_sessions: found ${sessions.length} sessions for user ${userId}`)
    ws.send(JSON.stringify({ type: 'session_list', sessions }))
  }).catch(err => {
    console.error('[WS] Failed to list sessions:', err)
    sendEvent('error', { message: 'Failed to list sessions' })
  })
}

async function handleUserMessage(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const sessionId = message.sessionId as string || wsData.sessionId
  const userId = wsData.userId
  if (!userId) {
    sendEvent('error', { message: 'User not authenticated' })
    return
  }
  if (!sessionId) {
    sendEvent('error', { message: 'No active session' })
    return
  }

  const content = message.content as string
  const model = (message.model as string) || 'qwen-plus'
  
  const agentOptions = message.agentOptions ? {
    maxIterations: message.agentOptions.maxIterations,
    debugMode: message.agentOptions.debugMode,
    timeout: message.agentOptions.timeout,
  } : undefined

  const imageAttachments = message.imageAttachments as Array<{ imageId: string; type: 'image'; mimeType?: string }> | undefined

  console.log(`[WS] Processing message for session ${sessionId}:`, content.substring(0, 100))
  if (imageAttachments?.length) {
    console.log(`[WS] Message includes ${imageAttachments.length} image attachment(s)`)
  }

  sessionConversationManager.processMessage(
    sessionId,
    content,
    model,
    sessionManager,
    sendEvent,
    {
      ...agentOptions,
      imageAttachments,
    }
  ).catch(err => {
    console.error('[WS] processMessage error:', err)
    sendEvent('error', { message: 'Failed to process message' })
  })
}

async function handleInterruptGeneration(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const sessionId = (message.sessionId as string) || wsData.sessionId
  const userId = wsData.userId
  if (!userId) {
    sendEvent('error', { message: 'User not authenticated' })
    return
  }
  if (!sessionId) {
    sendEvent('error', { message: 'No active session' })
    return
  }
  const ok = sessionConversationManager.interruptSessionGeneration(sessionId)
  console.log(`[WS] interrupt_generation session=${sessionId} triggered=${ok}`)
}

async function handleDeleteSession(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  console.log('[WS] delete_session 事件收到:', message)
  const sessionId = message.sessionId as string
  const userId = wsData.userId
  console.log('[WS] delete_session - sessionId:', sessionId, 'userId:', userId)
  if (!userId) {
    sendEvent('error', { message: 'User not authenticated' })
    return
  }
  sessionManager.deleteSession(sessionId, userId).then(() => {
    console.log('[WS] 会话删除成功，发送 session_deleted 事件:', sessionId)
    ws.send(JSON.stringify({ type: 'session_deleted', sessionId }))
    if (wsData.sessionId === sessionId) {
      wsData.sessionId = null
    }
  }).catch(err => {
    console.error('[WS] Failed to delete session:', err)
    const msg = err instanceof Error ? err.message : 'Failed to delete session'
    sendEvent('error', { message: msg })
  })
}

async function handleRenameSession(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const sessionId = message.sessionId as string
  const userId = wsData.userId
  if (!userId) {
    sendEvent('error', { message: 'User not authenticated' })
    return
  }
  const title = message.title as string
  sessionManager.renameSession(sessionId, title).then(() => {
    ws.send(JSON.stringify({ type: 'session_renamed', sessionId, title }))
  }).catch(err => {
    console.error('[WS] Failed to rename session:', err)
    sendEvent('error', { message: 'Failed to rename session' })
  })
}

async function handleClearSession(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const sessionId = message.sessionId as string || wsData.sessionId
  const userId = wsData.userId
  if (!userId) {
    sendEvent('error', { message: 'User not authenticated' })
    return
  }
  if (!sessionId) {
    sendEvent('error', { message: 'No active session' })
    return
  }

  sessionManager.clearSession(sessionId).then(() => {
    ws.send(JSON.stringify({ type: 'session_cleared', sessionId }))
  }).catch(err => {
    console.error('[WS] Failed to clear session:', err)
    sendEvent('error', { message: 'Failed to clear session' })
  })
}

async function handleRollbackSession(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const sessionId = (message.sessionId as string) || wsData.sessionId
  const anchorMessageId = message.anchorMessageId as string
  const userId = wsData.userId
  if (!userId) {
    sendEvent('error', { message: 'User not authenticated' })
    return
  }
  if (!sessionId || !anchorMessageId) {
    sendEvent('error', { message: 'sessionId and anchorMessageId are required' })
    return
  }

  sessionConversationManager.interruptSessionGeneration(sessionId)
  sessionManager.rollbackToUserMessage(sessionId, userId, anchorMessageId).then((data) => {
    ws.send(JSON.stringify({
      type: 'session_rolled_back',
      session: data.session,
      messages: data.messages,
      toolCalls: data.toolCalls,
      anchorMessageId,
    }))
  }).catch((err: unknown) => {
    console.error('[WS] rollback_session failed:', err)
    const msg = err instanceof Error ? err.message : 'Rollback failed'
    sendEvent('error', { message: msg })
  })
}

async function handleGetTools(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  sendEvent('tools', {
    tools: toolExecutor.getAllTools().map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      category: t.category,
    })),
  })
}

async function handleExecuteCommand(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const commandBridge = new WebCommandBridge()
  const command = message.command as string
  if (!command) {
    sendEvent('error', { message: 'Command is required' })
    return
  }
  
  const result = await commandBridge.executeCommand(command, sendEvent)
  ws.send(JSON.stringify({ type: 'command_result', result }))
}

async function handleValidateUser(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const userId = message.userId as string
  const username = message.username as string

  sessionManager.getOrCreateUser(userId, username).then(user => {
    wsData.userId = user.id
    console.log(`[WS] User validated: ${user.id} (${user.username})`)
    ws.send(JSON.stringify({ type: 'user_validated', userId: user.id, username: user.username }))
  }).catch(err => {
    console.error('[WS] Failed to validate user:', err)
    ws.send(JSON.stringify({ type: 'user_invalid' }))
  })
}

async function handleGetModels(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const AVAILABLE_MODELS = [
    { id: 'qwen-plus', name: '通义千问 Plus', provider: 'aliyun', description: '最适合编程和复杂推理' },
    { id: 'qwen-turbo', name: '通义千问 Turbo', provider: 'aliyun', description: '快速响应，适合简单任务' },
    { id: 'qwen-max', name: '通义千问 Max', provider: 'aliyun', description: '最强能力，适合最复杂任务' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', description: 'Anthropic 最强编程模型' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', description: '最通用，最强推理能力' },
  ]
  ws.send(JSON.stringify({ type: 'models', models: AVAILABLE_MODELS }))
}

async function handleGetStatus(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const AVAILABLE_MODELS = [
    { id: 'qwen-plus', name: '通义千问 Plus', provider: 'aliyun', description: '最适合编程和复杂推理' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', description: 'Anthropic 最强编程模型' },
  ]
  const status = {
    type: 'status',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connections: wsManager.getAllConnections().size,
    sessions: wsManager.getActiveSessions().size,
    models: AVAILABLE_MODELS,
  }
  ws.send(JSON.stringify(status))
}

async function handleAgentsList(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const agents = getBuiltInAgents()
  sendEvent('agents_list', {
    agents: agents.map(agent => ({
      agentType: agent.agentType,
      name: agent.agentType,
      description: agent.description || agent.whenToUse,
      icon: agent.icon,
      color: agent.color,
      isReadOnly: agent.isReadOnly,
      source: agent.source
    }))
  })
}

async function handleOrchestrationState(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  const state = agentManager.getOrchestrationState()
  sendEvent('agents_orchestration_state', state)
}

async function handleOrchestrationInit(ws: any, wsData: WebSocketData, message: any, sendEvent: EventSender) {
  try {
    const orchestratorType = message.orchestratorType as string
    const subAgentTypes = message.subAgentTypes as string[]
    
    let state
    if (orchestratorType && subAgentTypes) {
      agentManager.resetOrchestration()
      agentManager.initializeOrchestration(orchestratorType, subAgentTypes)
      state = agentManager.getOrchestrationState()
    } else {
      state = initializeDemoOrchestration()
    }
    
    sendEvent('agents_orchestration_state', state)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '初始化协调失败'
    sendEvent('error', { message: errorMessage })
  }
}

export default {
  handleWebSocketOpen,
  handleWebSocketMessage,
  handleWebSocketClose,
}