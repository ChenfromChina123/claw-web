/**
 * 内置技能初始化模块
 *
 * 从 src/skills/bundled 迁移的内置技能
 * 提供与 Claude Code CLI 相同的内置技能体验
 */

import type { BundledSkillDefinition } from '../bundledSkills'

/**
 * 初始化所有内置技能
 * 在服务器启动时调用
 */
export function initBundledSkills(): void {
  // 基础技能
  require('./debug').registerDebugSkill()
  require('./verify').registerVerifySkill()
  require('./simplify').registerSimplifySkill()
  require('./batch').registerBatchSkill()
  require('./remember').registerRememberSkill()
  require('./stuck').registerStuckSkill()
  require('./loremIpsum').registerLoremIpsumSkill()
  require('./updateConfig').registerUpdateConfigSkill()
  require('./skillify').registerSkillifySkill()
  require('./keybindings').registerKeybindingsSkill()

  console.log('[BundledSkills] 内置技能初始化完成')
}

/**
 * 获取所有内置技能定义
 * 用于注册到技能系统
 */
export function getAllBundledSkillDefinitions(): BundledSkillDefinition[] {
  const skills: BundledSkillDefinition[] = []

  // 收集所有已注册的技能
  const { getBundledSkills } = require('../bundledSkills')
  const registered = getBundledSkills()

  return registered
}
