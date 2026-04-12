/**
 * Skills 系统统一入口
 *
 * 提供技能加载、注册和查询的统一接口
 * 整合内置技能、文件技能等多种来源
 */

import { initBundledSkills, getAllBundledSkillDefinitions } from './bundled'
import { getBundledSkills, findBundledSkill, type Command as BundledCommand } from './bundledSkills'
import {
  getSkillDirCommands,
  findCommand as findSkillCommand,
  clearSkillCaches,
  getDynamicSkills,
  type Command as AdapterCommand,
} from '../integrations/skillsAdapter'

// 导出类型
export type { BundledSkillDefinition } from './bundledSkills'
export type { Command } from '../integrations/skillsAdapter'

// 技能来源类型
export type SkillSource = 'bundled' | 'file' | 'dynamic'

/**
 * 初始化技能系统
 * 在服务器启动时调用
 */
export async function initializeSkills(): Promise<void> {
  console.log('[Skills] 初始化技能系统...')

  // 初始化内置技能
  initBundledSkills()

  console.log('[Skills] 技能系统初始化完成')
}

/**
 * 获取所有可用技能
 * 包括内置技能、文件技能和动态技能
 */
export async function getAllSkills(cwd: string): Promise<AdapterCommand[]> {
  const skills: AdapterCommand[] = []

  // 1. 获取内置技能
  const bundledSkills = getBundledSkills()
  skills.push(...bundledSkills.map(convertBundledToAdapter))

  // 2. 获取文件系统技能
  const fileSkills = await getSkillDirCommands(cwd)
  skills.push(...fileSkills)

  // 3. 获取动态技能
  const dynamicSkills = getDynamicSkills()
  skills.push(...dynamicSkills)

  return skills
}

/**
 * 获取技能工具命令列表
 * 用于 SkillTool 使用
 */
export async function getSkillToolCommands(cwd: string): Promise<AdapterCommand[]> {
  const allSkills = await getAllSkills(cwd)

  // 过滤出可用于 SkillTool 的命令
  return allSkills.filter(
    cmd =>
      cmd.type === 'prompt' &&
      !cmd.disableModelInvocation &&
      (cmd.loadedFrom === 'bundled' ||
        cmd.loadedFrom === 'skills' ||
        cmd.loadedFrom === 'commands_DEPRECATED' ||
        cmd.hasUserSpecifiedDescription ||
        cmd.whenToUse),
  )
}

/**
 * 查找技能
 * @param name 技能名称
 * @param cwd 工作目录
 * @returns 技能命令或 undefined
 */
export async function findSkill(name: string, cwd: string): Promise<AdapterCommand | undefined> {
  // 1. 先查找内置技能
  const bundledSkill = findBundledSkill(name)
  if (bundledSkill) {
    return convertBundledToAdapter(bundledSkill)
  }

  // 2. 查找文件技能
  const allSkills = await getAllSkills(cwd)
  return findSkillCommand(name, allSkills)
}

/**
 * 获取技能列表（用于 API）
 * @param cwd 工作目录
 * @returns 技能列表
 */
export async function getSkillsList(cwd: string): Promise<
  Array<{
    name: string
    description: string
    source: SkillSource
    category?: string
    whenToUse?: string
    argumentHint?: string
    allowedTools?: string[]
    isEnabled: boolean
  }>
> {
  const skills = await getAllSkills(cwd)

  return skills.map(skill => ({
    name: skill.name,
    description: skill.description,
    source: getSkillSource(skill),
    category: skill.loadedFrom === 'bundled' ? '内置' : '自定义',
    whenToUse: skill.whenToUse,
    argumentHint: skill.argumentHint,
    allowedTools: skill.allowedTools,
    isEnabled: skill.isEnabled?.() ?? true,
  }))
}

/**
 * 获取技能详情
 * @param name 技能名称
 * @param cwd 工作目录
 * @returns 技能详情或 null
 */
export async function getSkillDetail(
  name: string,
  cwd: string,
): Promise<{
  name: string
  description: string
  content: string
  source: SkillSource
  allowedTools?: string[]
  model?: string
  whenToUse?: string
  argumentHint?: string
} | null> {
  const skill = await findSkill(name, cwd)
  if (!skill) {
    return null
  }

  // 获取技能内容
  const messages = await skill.getPromptForCommand('')
  const content = messages.map(m => m.text).join('\n')

  return {
    name: skill.name,
    description: skill.description,
    content,
    source: getSkillSource(skill),
    allowedTools: skill.allowedTools,
    model: skill.model,
    whenToUse: skill.whenToUse,
    argumentHint: skill.argumentHint,
  }
}

/**
 * 清除技能缓存
 */
export function clearSkillsCache(): void {
  clearSkillCaches()
  console.log('[Skills] 技能缓存已清除')
}

/**
 * 获取技能来源
 * @param skill 技能命令
 * @returns 来源类型
 */
function getSkillSource(skill: AdapterCommand): SkillSource {
  if (skill.loadedFrom === 'bundled') {
    return 'bundled'
  }
  if (skill.loadedFrom === 'skills' || skill.loadedFrom === 'commands_DEPRECATED') {
    return 'file'
  }
  return 'dynamic'
}

/**
 * 将内置技能转换为适配器格式
 * @param bundled 内置技能
 * @returns 适配器格式的技能
 */
function convertBundledToAdapter(bundled: BundledCommand): AdapterCommand {
  return {
    type: 'prompt',
    name: bundled.name,
    description: bundled.description,
    aliases: bundled.aliases,
    hasUserSpecifiedDescription: true,
    allowedTools: bundled.allowedTools ?? [],
    argumentHint: bundled.argumentHint,
    whenToUse: bundled.whenToUse,
    version: bundled.version,
    model: bundled.model,
    disableModelInvocation: bundled.disableModelInvocation ?? false,
    userInvocable: bundled.userInvocable ?? true,
    context: bundled.context,
    agent: bundled.agent,
    effort: bundled.effort,
    contentLength: 0,
    isHidden: !bundled.userInvocable,
    progressMessage: 'running',
    isEnabled: bundled.isEnabled,
    loadedFrom: 'bundled',
    source: 'bundled',
    getPromptForCommand: bundled.getPromptForCommand,
  }
}

// 导出子模块
export { initBundledSkills, getAllBundledSkillDefinitions } from './bundled'
export { getBundledSkills, findBundledSkill, registerBundledSkill } from './bundledSkills'
