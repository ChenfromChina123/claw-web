/**
 * SkillTool - 执行skills的MCP工具
 *
 * 提供给EnhancedToolExecutor使用的skill执行工具
 */

import type { ToolResult, ToolExecutionContext } from '../integration/enhancedToolExecutor'
import {
  getSkillToolCommands,
  findCommand,
  type Command,
} from '../commands'
import { executeShellInContent, type SkillExecutionContext as SkillCtx } from '../integrations/skillsAdapter'

export const SKILL_TOOL_NAME = 'Skill'

export interface SkillToolInput {
  skill: string
  args?: string
}

export interface SkillToolOutput {
  success: boolean
  commandName: string
  result?: string
  allowedTools?: string[]
  model?: string
  status?: 'inline' | 'forked'
  error?: string
}

/**
 * 验证skill输入
 */
export async function validateSkillInput(input: SkillToolInput): Promise<{
  valid: boolean
  error?: string
}> {
  if (!input.skill || typeof input.skill !== 'string') {
    return { valid: false, error: 'Skill name is required' }
  }

  const skillName = input.skill.trim()
  if (!skillName) {
    return { valid: false, error: 'Skill name cannot be empty' }
  }

  // 规范化名称（移除前导/）
  const normalizedName = skillName.startsWith('/') ? skillName.slice(1) : skillName

  // 获取可用命令
  const cwd = process.cwd()
  const commands = await getSkillToolCommands(cwd)

  // 查找命令
  const command = findCommand(normalizedName, commands)
  if (!command) {
    return { valid: false, error: `Unknown skill: ${normalizedName}` }
  }

  if (command.disableModelInvocation) {
    return { valid: false, error: `Skill ${normalizedName} cannot be invoked via SkillTool` }
  }

  if (command.type !== 'prompt') {
    return { valid: false, error: `Skill ${normalizedName} is not a prompt-based skill` }
  }

  return { valid: true }
}

/**
 * 执行skill
 */
export async function executeSkill(
  input: SkillToolInput,
  context: ToolExecutionContext,
): Promise<ToolResult> {
  const startTime = Date.now()

  try {
    // 规范化名称
    const skillName = input.skill.trim().startsWith('/')
      ? input.skill.trim().slice(1)
      : input.skill.trim()

    const args = input.args || ''

    // 获取可用命令
    const cwd = context.projectRoot || process.cwd()
    const commands = await getSkillToolCommands(cwd)

    // 查找命令
    const command = findCommand(skillName, commands)
    if (!command) {
      return {
        success: false,
        error: `Unknown skill: ${skillName}`,
      }
    }

    // 检查是否是fork模式
    if (command.context === 'fork') {
      return await executeForkedSkill(command, args, context)
    }

    // 执行inline skill
    return await executeInlineSkill(command, args, context, startTime)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * 执行inline skill（直接展开内容）
 */
async function executeInlineSkill(
  command: Command,
  args: string,
  context: ToolExecutionContext,
  startTime: number,
): Promise<ToolResult> {
  try {
    // 获取skill内容
    const messages = await command.getPromptForCommand(args)

    // 处理shell命令
    let content = messages.map(m => m.text).join('\n')
    if (content.includes('!`')) {
      const shellContext: SkillCtx = {
        projectRoot: context.projectRoot,
        userId: context.userId,
        sessionId: context.sessionId,
      }
      content = await executeShellInContent(content, shellContext)
    }

    const executionTime = Date.now() - startTime

    return {
      success: true,
      result: {
        success: true,
        commandName: command.name,
        result: content,
        allowedTools: command.allowedTools,
        model: command.model,
        status: 'inline',
      },
      metadata: {
        duration: executionTime,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * 执行forked skill（启动子agent）
 * 注意：当前实现返回错误，因为fork模式需要完整的agent系统支持
 */
async function executeForkedSkill(
  command: Command,
  args: string,
  context: ToolExecutionContext,
): Promise<ToolResult> {
  // Fork模式需要启动子agent，这里返回信息让调用方处理
  return {
    success: true,
    result: {
      success: true,
      commandName: command.name,
      status: 'forked',
      result: `[Forked skill ${command.name} would run in a sub-agent with model ${command.model || 'inherit'}]`,
    },
  }
}

/**
 * 创建SkillTool定义（用于注册到EnhancedToolExecutor）
 */
export function createSkillToolDefinition() {
  return {
    name: SKILL_TOOL_NAME,
    description: 'Execute a skill (slash command). Skills are prompt-based commands stored in .claude/skills/ directory.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        skill: {
          type: 'string',
          description: 'The skill name to execute (e.g., "commit", "review-pr"). Leading slash is optional.',
        },
        args: {
          type: 'string',
          description: 'Optional arguments to pass to the skill',
        },
      },
      required: ['skill'],
    },
    category: 'agent' as const,
    handler: async (
      input: Record<string, unknown>,
      ctx: ToolExecutionContext,
    ): Promise<ToolResult> => {
      const skillInput: SkillToolInput = {
        skill: input.skill as string,
        args: input.args as string | undefined,
      }

      return executeSkill(skillInput, ctx)
    },
  }
}

/**
 * 获取skill描述信息（用于提示）
 */
export async function getSkillDescriptions(cwd: string): Promise<string> {
  const commands = await getSkillToolCommands(cwd)

  if (commands.length === 0) {
    return 'No skills available.'
  }

  const lines = ['Available skills:']
  for (const cmd of commands.slice(0, 20)) {
    const desc = cmd.description || 'No description'
    lines.push(`- ${cmd.name}: ${desc}`)
  }

  if (commands.length > 20) {
    lines.push(`... and ${commands.length - 20} more skills`)
  }

  return lines.join('\n')
}
