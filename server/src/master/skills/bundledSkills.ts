/**
 * 内置技能注册模块
 *
 * 提供注册和管理内置技能的功能
 * 适配自 src/skills/bundledSkills.ts
 */

/**
 * 内置技能定义接口
 */
export interface BundledSkillDefinition {
  /** 技能名称 */
  name: string
  /** 技能描述 */
  description: string
  /** 别名 */
  aliases?: string[]
  /** 使用场景描述 */
  whenToUse?: string
  /** 参数提示 */
  argumentHint?: string
  /** 允许使用的工具 */
  allowedTools?: string[]
  /** 指定模型 */
  model?: string
  /** 禁用模型自动调用 */
  disableModelInvocation?: boolean
  /** 用户可调用 */
  userInvocable?: boolean
  /** 是否启用的检查函数 */
  isEnabled?: () => boolean
  /** 执行上下文: inline 或 fork */
  context?: 'inline' | 'fork'
  /** Agent 类型 */
  agent?: string
  /** 努力程度 */
  effort?: string
  /** 关联文件 */
  files?: Record<string, string>
  /** 获取技能提示内容 */
  getPromptForCommand: (args: string) => Promise<{ type: 'text'; text: string }[]>
}

/**
 * 技能命令接口
 */
export interface Command {
  type: 'prompt'
  name: string
  description: string
  aliases?: string[]
  whenToUse?: string
  argumentHint?: string
  allowedTools?: string[]
  model?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
  isEnabled?: () => boolean
  context?: 'inline' | 'fork'
  agent?: string
  effort?: string
  contentLength: number
  loadedFrom: 'bundled'
  source: 'bundled'
  getPromptForCommand: (args: string) => Promise<{ type: 'text'; text: string }[]>
}

// 内置技能注册表
const bundledSkills: Command[] = []

/**
 * 注册内置技能
 * @param definition 技能定义
 */
export function registerBundledSkill(definition: BundledSkillDefinition): void {
  // 检查是否已存在
  const existingIndex = bundledSkills.findIndex(s => s.name === definition.name)
  if (existingIndex !== -1) {
    console.warn(`[BundledSkills] 技能 ${definition.name} 已存在，将被覆盖`)
    bundledSkills.splice(existingIndex, 1)
  }

  const command: Command = {
    type: 'prompt',
    name: definition.name,
    description: definition.description,
    aliases: definition.aliases,
    whenToUse: definition.whenToUse,
    argumentHint: definition.argumentHint,
    allowedTools: definition.allowedTools ?? [],
    model: definition.model,
    disableModelInvocation: definition.disableModelInvocation ?? false,
    userInvocable: definition.userInvocable ?? true,
    isEnabled: definition.isEnabled,
    context: definition.context,
    agent: definition.agent,
    effort: definition.effort,
    contentLength: 0,
    loadedFrom: 'bundled',
    source: 'bundled',
    getPromptForCommand: definition.getPromptForCommand,
  }

  bundledSkills.push(command)
  console.log(`[BundledSkills] 已注册技能: ${definition.name}`)
}

/**
 * 获取所有已注册的内置技能
 * @returns 技能命令数组
 */
export function getBundledSkills(): Command[] {
  return [...bundledSkills]
}

/**
 * 清除所有内置技能
 * 用于测试
 */
export function clearBundledSkills(): void {
  bundledSkills.length = 0
}

/**
 * 查找内置技能
 * @param name 技能名称
 * @returns 技能命令或 undefined
 */
export function findBundledSkill(name: string): Command | undefined {
  const normalizedName = name.startsWith('/') ? name.slice(1) : name
  return bundledSkills.find(skill => {
    if (skill.name === normalizedName) return true
    if (skill.aliases?.includes(normalizedName)) return true
    return false
  })
}

/**
 * 检查技能是否启用
 * @param skill 技能命令
 * @returns 是否启用
 */
export function isSkillEnabled(skill: Command): boolean {
  if (skill.isEnabled) {
    return skill.isEnabled()
  }
  return true
}
