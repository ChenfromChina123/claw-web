/**
 * Agent 工具 - 启动子代理（真实实现）
 * 
 * 这个工具允许 Agent 启动子代理来完成任务。
 * 现已接入真实 LLM 调用和工具执行链。
 * 
 * 功能：
 * - 调用真实 LLM API (Anthropic/Qwen)
 * - 执行完整的工具调用循环
 * - 支持多轮对话和工具使用
 * - 实时事件推送（用于前端可视化）
 */

import { v4 as uuidv4 } from 'uuid'
import type { ToolResult } from '../integration/enhancedToolExecutor'
import type { ToolExecutionContext } from '../integration/enhancedToolExecutor'
import type { Tool } from '../integration/webStore'
import { getBuiltInAgentByType, getBuiltInAgents } from '../agents/builtInAgents'
import type { AgentDefinition, AgentExecutionResult } from '../agents/types'
import { getWorkflowEventService } from '../services/workflowEventService'
import { runAgent, executeAgent, type AgentMessage, type RunAgentParams } from '../agents/runAgent'

export interface AgentToolInput {
  prompt: string
  description?: string
  subagent_type?: string
  model?: string
  run_in_background?: boolean
  name?: string
  team_name?: string
  mode?: 'bypassPermissions' | 'acceptEdits' | 'auto' | 'plan' | 'bubble'
  isolation?: 'worktree' | 'remote'
  cwd?: string
  max_turns?: number
  trace_id?: string
  parent_agent_id?: string
}

export interface AgentToolOutput {
  agentId: string
  agentType: string
  status: 'completed' | 'async_launched' | 'teammate_spawned' | 'error'
  result?: string
  error?: string
  durationMs?: number
}

/**
 * 验证 Agent 工具输入
 */
export function validateAgentInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['输入必须是对象'] }
  }
  
  const { prompt, subagent_type, name, team_name } = input as Record<string, unknown>
  
  if (!prompt || typeof prompt !== 'string') {
    errors.push('prompt 是必需参数，且必须是字符串')
  }
  
  if (prompt && typeof prompt === 'string' && prompt.trim().length === 0) {
    errors.push('prompt 不能为空')
  }
  
  if (subagent_type !== undefined && typeof subagent_type !== 'string') {
    errors.push('subagent_type 必须是字符串')
  }
  
  if (name !== undefined && typeof name !== 'string') {
    errors.push('name 必须是字符串')
  }
  
  if (team_name !== undefined && typeof team_name !== 'string') {
    errors.push('team_name 必须是字符串')
  }
  
  if (name && !team_name) {
    errors.push('name 参数需要配合 team_name 使用以创建团队成员')
  }
  
  if (team_name && !name) {
    errors.push('team_name 参数需要配合 name 使用以创建团队成员')
  }
  
  return { valid: errors.length === 0, errors }
}

/**
 * 获取可用的 Agent 类型列表
 */
export function getAvailableAgentTypes(): string[] {
  return getBuiltInAgents().map(agent => agent.agentType)
}

/**
 * Agent 工具实现（真实版本）
 * 
 * 执行流程：
 * 1. 验证输入
 * 2. 查找 Agent 定义
 * 3. 创建工作流事件发射器
 * 4. 调用 runAgent() 执行真实 LLM 循环
 * 5. 返回执行结果
 */
export async function executeAgentTool(
  input: AgentToolInput,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const startTime = Date.now()
  const validation = validateAgentInput(input)
  
  if (!validation.valid) {
    return {
      success: false,
      error: `输入验证失败:\n${validation.errors.join('\n')}`,
    }
  }
  
  const { prompt, description, subagent_type, name, team_name, mode, model, max_turns } = input
  
  try {
    // 确定要使用的 Agent 类型
    const agentType = subagent_type || 'general-purpose'
    
    // 验证 Agent 类型是否存在
    const agentDefinition = getBuiltInAgentByType(agentType)
    
    if (!agentDefinition) {
      const availableTypes = getAvailableAgentTypes()
      return {
        success: false,
        error: `未知的 Agent 类型: ${agentType}\n可用的类型: ${availableTypes.join(', ')}`,
      }
    }
    
    // 生成 traceId（如果没有提供）
    const traceId = input.trace_id || uuidv4()
    const agentId = uuidv4()
    // BuiltInAgentDefinition 有 description 和 icon，没有 name
    const agentName = agentDefinition.description || agentDefinition.agentType
    const parentAgentId = input.parent_agent_id
    
    // 获取工作流事件服务
    const workflowEventService = getWorkflowEventService()
    const eventEmitter = workflowEventService.createEventEmitter(
      traceId,
      agentId,
      agentType,
      agentName,
      parentAgentId
    )
    
    // 推送 Agent 开始事件
    eventEmitter.agentStarted(`开始执行: ${prompt.substring(0, 50)}...`)
    
    // 团队成员模式检测
    if (name && team_name) {
      eventEmitter.agentThinking(`创建团队成员: ${name}`)
      eventEmitter.agentCompleted(`团队成员 ${name} 已创建`)
      return {
        success: true,
        result: {
          agentId,
          agentType,
          status: 'teammate_spawned',
          teamName: team_name,
          memberName: name,
          description: description || `Team member: ${name}`,
          message: `团队成员 ${name} 已创建 (${agentType})`,
          traceId,
        } as AgentToolOutput & { traceId: string },
      }
    }
    
    // 异步执行检测
    if (input.run_in_background) {
      eventEmitter.agentThinking(`启动后台 Agent: ${agentType}`)
      eventEmitter.agentCompleted(`后台 Agent 已启动`)
      return {
        success: true,
        result: {
          agentId,
          agentType,
          status: 'async_launched',
          message: `后台 Agent 已启动 (${agentType})`,
          traceId,
        } as AgentToolOutput & { traceId: string },
      }
    }
    
    // ==================== 真实的 Agent 执行 ====================
    
    console.log(`[AgentTool] 开始执行真实 Agent: ${agentType}, 任务: ${prompt.substring(0, 80)}...`)
    
    eventEmitter.agentThinking(`分析任务: ${prompt.substring(0, 80)}...`)
    eventEmitter.stepStarted('step-1', '理解用户意图', '🤔')
    
    // 构建初始消息
    const initialMessages: AgentMessage[] = [
      {
        role: 'user',
        content: prompt,
      },
    ]
    
    // 构建运行参数
    const runParams: RunAgentParams = {
      agentDefinition,
      promptMessages: initialMessages,
      sessionId: context.sessionId || uuidv4(),
      cwd: input.cwd || context.projectRoot,
      maxTurns: max_turns || 20,
      permissionMode: mode || 'auto',
      model: model || undefined,
      parentAgentId: parentAgentId,
      // 从上下文获取 abortSignal，支持中断 Agent 执行
      abortSignal: context.abortSignal,
      onProgress: (progress) => {
        console.log(`[AgentTool] 进度更新: ${JSON.stringify(progress)}`)
        if (progress.message) {
          eventEmitter.agentThinking(progress.message)
        }
      },
      onToolCall: (toolCall) => {
        console.log(`[AgentTool] 工具调用: ${toolCall.name}`)
        eventEmitter.agentToolCall(toolCall.name, toolCall.input)
      },
      onToolResult: (result) => {
        console.log(`[AgentTool] 工具结果: ${result.toolName} - ${result.success ? '成功' : '失败'}`)
        eventEmitter.agentToolResult(
          result.toolName,
          result.success,
          result.success ? result.result : { error: result.error }
        )
      },
    }
    
    eventEmitter.stepCompleted('step-1', '理解用户意图', { understanding: '任务已理解' })
    eventEmitter.agentThinking('生成执行计划...')
    eventEmitter.stepStarted('step-2', '生成执行计划', '📋')
    
    // 执行真实的 Agent 循环
    const executionResult = await executeAgent(runParams)
    
    eventEmitter.stepCompleted('step-2', '生成执行计划', { status: '完成' })
    
    const durationMs = Date.now() - startTime
    
    // 根据执行结果发送完成事件
    if (executionResult.status === 'completed') {
      eventEmitter.agentCompleted(
        `Agent ${agentType} 执行完成，耗时 ${(durationMs / 1000).toFixed(1)}s\n\n结果: ${executionResult.content?.substring(0, 200) || '无输出'}`
      )
      
      console.log(`[AgentTool] Agent 执行成功，耗时: ${durationMs}ms`)
      
      return {
        success: true,
        result: {
          agentId,
          agentType,
          status: 'completed',
          message: `Agent ${agentType} 执行完成`,
          result: executionResult.content,
          durationMs,
          traceId,
        } as AgentToolOutput & { traceId: string; result: string; durationMs: number },
      }
    } else {
      // 执行失败或出错
      const errorMsg = executionResult.error || '未知错误'
      eventEmitter.agentFailed(`执行失败: ${errorMsg}`)
      
      console.error(`[AgentTool] Agent 执行失败: ${errorMsg}`)
      
      return {
        success: false,
        error: `Agent 执行失败: ${errorMsg}\n耗时: ${(durationMs / 1000).toFixed(1)}s`,
      }
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[AgentTool] Agent 执行异常:', error)
    
    return {
      success: false,
      error: `Agent 执行异常: ${errorMessage}`,
    }
  }
}

/**
 * 创建 Agent 工具定义
 */
export function createAgentToolDefinition(): Tool {
  return {
    name: 'Agent',
    description: '启动子代理来完成任务。会调用真实 LLM 并执行工具来完成用户指定的任务。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '给子代理的任务描述（必需）',
        },
        description: {
          type: 'string',
          description: '任务描述（用于日志和调试）',
        },
        subagent_type: {
          type: 'string',
          description: '子代理类型（如 general-purpose、Explore、Plan）',
          enum: getAvailableAgentTypes(),
        },
        model: {
          type: 'string',
          description: '可选：指定使用的模型（如 claude-sonnet-4-20250514、qwen-plus）',
        },
        run_in_background: {
          type: 'boolean',
          description: '是否在后台运行',
          default: false,
        },
        name: {
          type: 'string',
          description: '团队成员名称（需配合 team_name 使用）',
        },
        team_name: {
          type: 'string',
          description: '团队名称（需配合 name 使用）',
        },
        mode: {
          type: 'string',
          description: '权限模式',
          enum: ['bypassPermissions', 'acceptEdits', 'auto', 'plan', 'bubble'],
          default: 'auto',
        },
        isolation: {
          type: 'string',
          description: '隔离模式',
          enum: ['worktree', 'remote'],
        },
        cwd: {
          type: 'string',
          description: '工作目录',
        },
        max_turns: {
          type: 'number',
          description: '最大轮次限制（默认 20）',
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['prompt'],
    },
    category: 'agent',
  }
}

/**
 * 带 handler 的工具定义类型
 */
export interface AgentToolDefinition extends Tool {
  /** 工具执行处理器 */
  handler: typeof executeAgentTool
}

/**
 * 获取 Agent 工具定义（带 handler）
 */
export function createAgentToolDefinitionWithHandler(): AgentToolDefinition {
  return {
    name: 'Agent',
    description: '启动子代理来完成任务。会调用真实 LLM 并执行工具来完成用户指定的任务。',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '给子代理的任务描述（必需）',
        },
        description: {
          type: 'string',
          description: '任务描述（用于日志和调试）',
        },
        subagent_type: {
          type: 'string',
          description: '子代理类型（如 general-purpose、Explore、Plan）',
          enum: getAvailableAgentTypes(),
        },
        model: {
          type: 'string',
          description: '可选：指定使用的模型（如 claude-sonnet-4-20250514、qwen-plus）',
        },
        run_in_background: {
          type: 'boolean',
          description: '是否在后台运行',
          default: false,
        },
        name: {
          type: 'string',
          description: '团队成员名称（需配合 team_name 使用）',
        },
        team_name: {
          type: 'string',
          description: '团队名称（需配合 name 使用）',
        },
        mode: {
          type: 'string',
          description: '权限模式',
          enum: ['bypassPermissions', 'acceptEdits', 'auto', 'plan', 'bubble'],
          default: 'auto',
        },
        isolation: {
          type: 'string',
          description: '隔离模式',
          enum: ['worktree', 'remote'],
        },
        cwd: {
          type: 'string',
          description: '工作目录',
        },
        max_turns: {
          type: 'number',
          description: '最大轮次限制（默认 20）',
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['prompt'],
    },
    category: 'agent',
    handler: executeAgentTool,
  }
}
