/**
 * 会话管理工具 - 提供会话列表、切换、创建等功能
 * 
 * 这个工具用于在 IDE 对话框中管理会话，支持：
 * - 获取会话列表
 * - 切换到指定会话
 * - 创建新会话
 * - 删除会话
 * - 重命名会话
 */

import type { Tool } from '../integration/webStore'
import type { ToolResult, ToolExecutionContext } from '../integration/enhancedToolExecutor'
import { getSessionManager } from '../services/sessionManager'

export interface SessionManagementInput {
  action: 'list' | 'switch' | 'create' | 'delete' | 'rename'
  sessionId?: string
  title?: string
}

export interface SessionInfo {
  id: string
  title: string
  model?: string
  updatedAt: string
  messageCount: number
}

export interface SessionManagementOutput {
  success: boolean
  action: string
  sessions?: SessionInfo[]
  currentSessionId?: string
  message?: string
  error?: string
}

/**
 * 验证输入
 */
function validateInput(input: unknown): { valid: boolean; errors: string[]; data?: SessionManagementInput } {
  const errors: string[] = []
  
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['输入必须是对象'] }
  }
  
  const obj = input as Record<string, unknown>
  const action = obj.action as string
  
  if (!action) {
    errors.push('action 是必需参数')
    return { valid: false, errors }
  }
  
  const validActions = ['list', 'switch', 'create', 'delete', 'rename']
  if (!validActions.includes(action)) {
    errors.push(`action 必须是以下值之一：${validActions.join(', ')}`)
    return { valid: false, errors }
  }
  
  const data: SessionManagementInput = { action }
  
  if (action === 'switch' || action === 'delete' || action === 'rename') {
    if (!obj.sessionId || typeof obj.sessionId !== 'string') {
      errors.push(`${action} 操作需要提供 sessionId 参数`)
      return { valid: false, errors }
    }
    data.sessionId = obj.sessionId
  }
  
  if ((action === 'create' || action === 'rename') && obj.title !== undefined) {
    if (typeof obj.title !== 'string') {
      errors.push('title 必须是字符串')
      return { valid: false, errors }
    }
    data.title = obj.title
  }
  
  return { valid: true, errors: [], data }
}

/**
 * 获取会话管理器
 */
function getSessionManagerInstance() {
  return getSessionManager()
}

/**
 * 会话管理工具实现
 */
export async function executeSessionManagementTool(
  input: SessionManagementInput,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const validation = validateInput(input)
  
  if (!validation.valid) {
    return {
      success: false,
      error: `输入验证失败:\n${validation.errors.join('\n')}`,
    }
  }
  
  const { action, sessionId, title } = validation.data!
  const sessionManager = getSessionManagerInstance()
  
  try {
    switch (action) {
      case 'list': {
        const sessions = await sessionManager.listSessions()
        const sessionInfos: SessionInfo[] = sessions.map(s => ({
          id: s.id,
          title: s.title || '未命名',
          model: s.model,
          updatedAt: s.updatedAt,
          messageCount: s.messageCount || 0,
        }))
        
        return {
          success: true,
          result: {
            success: true,
            action: 'list',
            sessions: sessionInfos,
            message: `找到 ${sessionInfos.length} 个会话`,
          } as SessionManagementOutput,
        }
      }
      
      case 'switch': {
        if (!sessionId) {
          return {
            success: false,
            error: '切换会话需要提供 sessionId',
          }
        }
        
        const session = await sessionManager.getSession(sessionId)
        if (!session) {
          return {
            success: false,
            error: `会话 ${sessionId} 不存在`,
          }
        }
        
        // 切换到指定会话
        await sessionManager.loadSession(sessionId)
        
        return {
          success: true,
          result: {
            success: true,
            action: 'switch',
            sessionId,
            currentSessionId: sessionId,
            message: `已切换到会话：${session.title || '未命名'}`,
          } as SessionManagementOutput,
        }
      }
      
      case 'create': {
        const newSession = await sessionManager.createSession(title)
        
        return {
          success: true,
          result: {
            success: true,
            action: 'create',
            sessionId: newSession.id,
            currentSessionId: newSession.id,
            message: `已创建新会话：${newSession.title || '未命名'}`,
          } as SessionManagementOutput,
        }
      }
      
      case 'delete': {
        if (!sessionId) {
          return {
            success: false,
            error: '删除会话需要提供 sessionId',
          }
        }
        
        await sessionManager.deleteSession(sessionId)
        
        return {
          success: true,
          result: {
            success: true,
            action: 'delete',
            sessionId,
            message: `已删除会话：${sessionId}`,
          } as SessionManagementOutput,
        }
      }
      
      case 'rename': {
        if (!sessionId || !title) {
          return {
            success: false,
            error: '重命名会话需要提供 sessionId 和 title',
          }
        }
        
        await sessionManager.renameSession(sessionId, title)
        
        return {
          success: true,
          result: {
            success: true,
            action: 'rename',
            sessionId,
            message: `已重命名会话为：${title}`,
          } as SessionManagementOutput,
        }
      }
      
      default:
        return {
          success: false,
          error: `未知的操作：${action}`,
        }
    }
  } catch (error) {
    return {
      success: false,
      error: `会话管理失败：${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * 创建会话管理工具定义
 */
export function createSessionManagementToolDefinition(): Tool & { handler: any } {
  return {
    name: 'SessionManagement',
    description: '管理会话（列表、切换、创建、删除、重命名）',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: '操作类型',
          enum: ['list', 'switch', 'create', 'delete', 'rename'],
        },
        sessionId: {
          type: 'string',
          description: '会话 ID（switch/delete/rename 操作需要）',
        },
        title: {
          type: 'string',
          description: '会话标题（create/rename 操作需要）',
        },
      },
      required: ['action'],
    },
    category: 'session',
    handler: executeSessionManagementTool,
  }
}
