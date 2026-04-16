/**
 * Skill执行服务
 *
 * 处理skill的inline/fork执行
 */

import { v4 as uuidv4 } from 'uuid'
import type { ToolExecutionContext } from '../integration/enhancedToolExecutor'
import {
  getSkillToolCommands,
  findCommand,
  type Command,
} from '../tools/commands'
import {
  executeShellInContent,
  type SkillExecutionContext as SkillCtx,
} from '../integrations/skillsAdapter'

export interface SkillExecutionOptions {
  skillName: string
  args?: string
  context: ToolExecutionContext
  executionMode?: 'inline' | 'fork'
}

export interface SkillExecutionResponse {
  success: boolean
  commandName: string
  content?: string
  allowedTools?: string[]
  model?: string
  executionMode: 'inline' | 'fork'
  agentId?: string
  error?: string
}

/**
 * Skill执行服务
 */
export class SkillExecutionService {
  private activeForks: Map<string, {
    command: Command
    agentId: string
    startedAt: number
  }> = new Map()

  /**
   * 执行skill
   */
  async execute(options: SkillExecutionOptions): Promise<SkillExecutionResponse> {
    const { skillName, args = '', context, executionMode } = options

    // 规范化名称
    const normalizedName = skillName.startsWith('/') ? skillName.slice(1) : skillName

    // 获取可用命令
    const cwd = context.projectRoot || process.cwd()
    const commands = await getSkillToolCommands(cwd)

    // 查找命令
    const command = findCommand(normalizedName, commands)
    if (!command) {
      return {
        success: false,
        commandName: normalizedName,
        executionMode: 'inline',
        error: `Unknown skill: ${normalizedName}`,
      }
    }

    // 确定执行模式
    const mode = executionMode || (command.context === 'fork' ? 'fork' : 'inline')

    if (mode === 'fork') {
      return this.executeFork(command, args, context)
    }

    return this.executeInline(command, args, context)
  }

  /**
   * 执行inline skill
   */
  private async executeInline(
    command: Command,
    args: string,
    context: ToolExecutionContext,
  ): Promise<SkillExecutionResponse> {
    try {
      // 获取skill内容
      const messages = await command.getPromptForCommand(args)

      // 合并消息内容
      let content = messages.map(m => m.text).join('\n')

      // 处理shell命令
      if (content.includes('!`')) {
        const shellContext: SkillCtx = {
          projectRoot: context.projectRoot,
          userId: context.userId,
          sessionId: context.sessionId,
        }
        content = await executeShellInContent(content, shellContext)
      }

      return {
        success: true,
        commandName: command.name,
        content,
        allowedTools: command.allowedTools,
        model: command.model,
        executionMode: 'inline',
      }
    } catch (error) {
      return {
        success: false,
        commandName: command.name,
        executionMode: 'inline',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * 执行fork skill（子agent）
   */
  private async executeFork(
    command: Command,
    args: string,
    context: ToolExecutionContext,
  ): Promise<SkillExecutionResponse> {
    const agentId = uuidv4()

    // 存储fork信息（用于后续状态查询）
    this.activeForks.set(agentId, {
      command,
      agentId,
      startedAt: Date.now(),
    })

    try {
      // 获取skill内容作为prompt
      const messages = await command.getPromptForCommand(args)
      const skillContent = messages.map(m => m.text).join('\n')

      return {
        success: true,
        commandName: command.name,
        content: `[Skill "${command.name}" would execute as forked agent]\n\nSkill content:\n${skillContent}`,
        allowedTools: command.allowedTools,
        model: command.model,
        executionMode: 'fork',
        agentId,
      }
    } catch (error) {
      this.activeForks.delete(agentId)
      return {
        success: false,
        commandName: command.name,
        executionMode: 'fork',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * 获取活跃的fork执行
   */
  getActiveForks(): Array<{
    agentId: string
    commandName: string
    startedAt: number
    duration: number
  }> {
    const now = Date.now()
    const active: Array<{
      agentId: string
      commandName: string
      startedAt: number
      duration: number
    }> = []

    for (const [agentId, fork] of this.activeForks) {
      active.push({
        agentId,
        commandName: fork.command.name,
        startedAt: fork.startedAt,
        duration: now - fork.startedAt,
      })
    }

    return active
  }

  /**
   * 清理超时的fork
   */
  cleanupTimeoutForks(timeoutMs: number = 30 * 60 * 1000): number {
    const now = Date.now()
    let cleaned = 0

    for (const [agentId, fork] of this.activeForks) {
      if (now - fork.startedAt > timeoutMs) {
        this.activeForks.delete(agentId)
        cleaned++
      }
    }

    return cleaned
  }

  /**
   * 获取skill列表（带描述）
   */
  async listSkills(cwd: string): Promise<Array<{
    name: string
    description: string
    whenToUse?: string
    allowedTools?: string[]
    hasArguments: boolean
  }>> {
    const commands = await getSkillToolCommands(cwd)

    return commands.map(cmd => ({
      name: cmd.name,
      description: cmd.description || 'No description',
      whenToUse: cmd.whenToUse,
      allowedTools: cmd.allowedTools,
      hasArguments: !!(cmd.argNames && cmd.argNames.length > 0),
    }))
  }

  /**
   * 获取skill详情
   */
  async getSkillDetail(skillName: string, cwd: string): Promise<{
    name: string
    description: string
    content: string
    allowedTools?: string[]
    model?: string
    effort?: string
    whenToUse?: string
    argumentHint?: string
    paths?: string[]
  } | null> {
    const normalizedName = skillName.startsWith('/') ? skillName.slice(1) : skillName
    const commands = await getSkillToolCommands(cwd)
    const command = findCommand(normalizedName, commands)

    if (!command) {
      return null
    }

    // 获取内容
    const messages = await command.getPromptForCommand('')
    const content = messages.map(m => m.text).join('\n')

    return {
      name: command.name,
      description: command.description || 'No description',
      content,
      allowedTools: command.allowedTools,
      model: command.model,
      effort: command.effort,
      whenToUse: command.whenToUse,
      argumentHint: command.argumentHint,
      paths: command.paths,
    }
  }
}

// 导出单例
export const skillExecutionService = new SkillExecutionService()
