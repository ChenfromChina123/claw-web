/**
 * Skills系统统一入口
 *
 * 仿照原项目commands.ts，提供统一的技能命令导出
 * 现在整合内置技能系统
 */

import memoize from 'lodash-es/memoize'
import {
  getSkillDirCommands,
  findCommand as findSkillCommand,
  clearSkillCaches as clearSkillAdapterCaches,
  getDynamicSkills,
  type Command,
} from '../integrations/skillsAdapter'
import { getAllSkills, getBundledSkills } from '../skills'

// 导出类型
export type { Command, LoadedFrom } from '../integrations/skillsAdapter'

/**
 * 获取所有技能命令（带缓存）
 * 这是SkillTool使用的主要入口函数
 * 现在包括内置技能、文件技能和动态技能
 */
export const getSkillToolCommands = memoize(
  async (cwd: string): Promise<Command[]> => {
    // 使用新的统一接口获取所有技能
    const allCommands = await getAllSkills(cwd)

    // 过滤出可用于SkillTool的prompt类型命令
    return allCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        !cmd.disableModelInvocation &&
        (cmd.loadedFrom === 'bundled' ||
          cmd.loadedFrom === 'skills' ||
          cmd.loadedFrom === 'commands_DEPRECATED' ||
          cmd.hasUserSpecifiedDescription ||
          cmd.whenToUse),
    )
  },
  (cwd: string) => cwd // 使用cwd作为缓存key
)

/**
 * 获取所有可用的技能命令（包括禁用的）
 */
export async function getAllSkillCommands(cwd: string): Promise<Command[]> {
  return getAllSkills(cwd)
}

/**
 * 查找技能命令
 */
export function findCommand(name: string, commands: Command[]): Command | undefined {
  return findSkillCommand(name, commands)
}

/**
 * 清除所有技能缓存
 */
export function clearCommandsCache(): void {
  getSkillToolCommands.cache?.clear?.()
  clearSkillAdapterCaches()
}

/**
 * 获取动态技能
 */
export function getSkills(): Command[] {
  return getDynamicSkills()
}

/**
 * 获取内置技能
 */
export function getBundledSkillCommands(): Command[] {
  return getBundledSkills()
}

/**
 * 根据类型获取技能列表
 */
export function getSkillsByLoadedFrom(
  commands: Command[],
  loadedFrom: string,
): Command[] {
  return commands.filter(cmd => cmd.loadedFrom === loadedFrom)
}

/**
 * 根据agent类型获取应注入的技能
 */
export function getSkillsForAgentType(
  agentType: string,
  allCommands: Command[],
): Command[] {
  const categoryMappings: Record<string, string[]> = {
    'general-purpose': ['code', 'refactor', 'test', 'debug', 'docs'],
    'Explore': ['code', 'review', 'debug'],
    'Plan': ['code', 'refactor', 'security'],
    'verification': ['test', 'security', 'review'],
    'claude-code-guide': ['docs', 'deploy'],
    'statusline-setup': ['frontend'],
  }

  const tags = categoryMappings[agentType] || []
  if (tags.length === 0) {
    return []
  }

  return allCommands.filter(cmd =>
    cmd.allowedTools?.some(tool => tags.includes(tool.toLowerCase()))
  )
}
