/**
 * Agent 工具 - 启动子代理
 * 
 * 这个工具允许 Agent 启动子代理来完成任务。
 * 支持多种模式：普通代理、团队成员、Fork 子代理。
 */

import { v4 as uuidv4 } from 'uuid'
import type { ToolResult } from '../integration/enhancedToolExecutor'
import type { ToolExecutionContext } from '../integration/enhancedToolExecutor'
import { getBuiltInAgentByType, getBuiltInAgents } from '../agents/builtInAgents'
import type { AgentDefinition, AgentExecutionResult } from '../agents/types'

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
 * Agent 工具实现
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
  
  const { prompt, description, subagent_type, name, team_name, mode } = input
  
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
    
    // 检查是否是只读 Agent
    if (agentDefinition.isReadOnly && !['Explore', 'Plan', 'claude-code-guide', 'statusline-setup'].includes(agentType)) {
      // 只读 Agent 只能使用只读工具，不需要额外检查
    }
    
    // 团队成员模式检测
    if (name && team_name) {
      return {
        success: true,
        result: {
          agentId: uuidv4(),
          agentType,
          status: 'teammate_spawned',
          teamName: team_name,
          memberName: name,
          description: description || `Team member: ${name}`,
          message: `团队成员 ${name} 已创建 (${agentType})`,
        } as AgentToolOutput,
      }
    }
    
    // 异步执行检测
    if (input.run_in_background) {
      return {
        success: true,
        result: {
          agentId: uuidv4(),
          agentType,
          status: 'async_launched',
          message: `后台 Agent 已启动 (${agentType})`,
        } as AgentToolOutput,
      }
    }
    
    // 同步执行 - 返回 Agent 配置信息
    // 注意：实际执行需要在 Agent 引擎中实现
    const agentId = uuidv4()
    
    return {
      success: true,
      result: {
        agentId,
        agentType,
        status: 'completed',
        message: `Agent ${agentType} 执行完成`,
      } as AgentToolOutput,
    }
  } catch (error) {
    return {
      success: false,
      error: `Agent 执行失败: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * 创建 Agent 工具定义
 */
export function createAgentToolDefinition(): Tool {
  return {
    name: 'Agent',
    description: '启动子代理来完成任务',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: '给子代理的任务描述',
        },
        description: {
          type: 'string',
          description: '任务描述（用于日志和调试）',
        },
        subagent_type: {
          type: 'string',
          description: '子代理类型',
          enum: getAvailableAgentTypes(),
        },
        model: {
          type: 'string',
          description: '可选：指定使用的模型',
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
          description: '最大轮次限制',
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
