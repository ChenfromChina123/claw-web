/**
 * Skill 注册与预加载器
 * 
 * 实现 Agent 系统中 Skill 的注册、预加载和注入功能
 */

import { EventEmitter } from 'events'
import { getSkillLoader, SkillDefinition } from './skillLoader'

/**
 * Skill 注册表项
 */
export interface SkillRegistryEntry {
  skillId: string
  skill: SkillDefinition
  loadedAt: number
  accessCount: number
  lastUsedAt?: number
}

/**
 * Skill 注入配置
 */
export interface SkillInjectionConfig {
  /** 预加载的技能列表 */
  preloadSkills?: string[]
  /** 技能加载优先级 */
  priority?: 'lazy' | 'eager' | 'critical'
  /** 是否在 Agent 启动时加载 */
  loadOnAgentStart?: boolean
  /** 技能缓存策略 */
  cacheStrategy?: 'memory' | 'disk' | 'hybrid'
  /** 最大缓存数量 */
  maxCacheSize?: number
}

/**
 * Skill 事件
 */
export type SkillEvent =
  | { type: 'skill_registered'; skillId: string }
  | { type: 'skill_preloaded'; skillId: string; duration: number }
  | { type: 'skill_injected'; skillId: string; agentId: string }
  | { type: 'skill_unregistered'; skillId: string }
  | { type: 'cache_cleared' }

/**
 * Skill 注册与预加载器
 */
export class SkillRegistry extends EventEmitter {
  private registry: Map<string, SkillRegistryEntry> = new Map()
  private preloadQueue: string[] = []
  private config: Required<SkillInjectionConfig>
  private isPreloading: boolean = false

  constructor(config: SkillInjectionConfig = {}) {
    super()

    this.config = {
      preloadSkills: config.preloadSkills || [],
      priority: config.priority || 'eager',
      loadOnAgentStart: config.loadOnAgentStart ?? true,
      cacheStrategy: config.cacheStrategy || 'memory',
      maxCacheSize: config.maxCacheSize || 50,
    }

    // 初始化预加载队列
    this.preloadQueue = [...this.config.preloadSkills]
  }

  /**
   * 注册技能
   */
  registerSkill(skill: SkillDefinition): void {
    if (this.registry.has(skill.id)) {
      console.warn(`[SkillRegistry] Skill already registered: ${skill.id}`)
      return
    }

    const entry: SkillRegistryEntry = {
      skillId: skill.id,
      skill,
      loadedAt: Date.now(),
      accessCount: 0,
    }

    this.registry.set(skill.id, entry)
    this.emit('skill_registered', { type: 'skill_registered', skillId: skill.id })

    console.log(`[SkillRegistry] Registered skill: ${skill.name} (${skill.id})`)
  }

  /**
   * 注销技能
   */
  unregisterSkill(skillId: string): boolean {
    const entry = this.registry.get(skillId)
    if (!entry) return false

    this.registry.delete(skillId)
    this.emit('skill_unregistered', { type: 'skill_unregistered', skillId })
    return true
  }

  /**
   * 获取技能
   */
  getSkill(skillId: string): SkillDefinition | undefined {
    const entry = this.registry.get(skillId)
    if (entry) {
      entry.accessCount++
      entry.lastUsedAt = Date.now()
    }
    return entry?.skill
  }

  /**
   * 获取所有已注册技能
   */
  getAllSkills(): SkillDefinition[] {
    return Array.from(this.registry.values()).map(e => e.skill)
  }

  /**
   * 预加载技能
   */
  async preloadSkills(skillIds?: string[]): Promise<void> {
    if (this.isPreloading) {
      console.warn('[SkillRegistry] Preload already in progress')
      return
    }

    this.isPreloading = true
    const toPreload = skillIds || this.preloadQueue

    console.log(`[SkillRegistry] Starting preload for ${toPreload.length} skills`)

    for (const skillId of toPreload) {
      const startTime = Date.now()

      try {
        const skillLoader = getSkillLoader()
        const skill = skillLoader.getSkill(skillId)

        if (skill) {
          this.registerSkill(skill)
          const duration = Date.now() - startTime
          this.emit('skill_preloaded', { type: 'skill_preloaded', skillId, duration })
          console.log(`[SkillRegistry] Preloaded skill: ${skill.name} (${duration}ms)`)
        } else {
          console.warn(`[SkillRegistry] Skill not found: ${skillId}`)
        }
      } catch (error) {
        console.error(`[SkillRegistry] Failed to preload skill ${skillId}:`, error)
      }
    }

    this.isPreloading = false
  }

  /**
   * 预加载关键技能
   */
  async preloadCriticalSkills(): Promise<void> {
    // 预加载所有技能
    const skillLoader = getSkillLoader()
    const allSkills = skillLoader.getAllSkills()

    const criticalCategories = ['code', 'test', 'review', 'security']
    const criticalSkills = allSkills.filter(s =>
      criticalCategories.includes(s.category.id) ||
      s.tags.some(t => criticalCategories.includes(t.toLowerCase()))
    )

    await this.preloadSkills(criticalSkills.map(s => s.id))
  }

  /**
   * 将技能注入到 Agent
   */
  injectSkillsIntoAgent(agentId: string, skillIds?: string[]): SkillDefinition[] {
    const injectedSkills: SkillDefinition[] = []

    const toInject = skillIds || Array.from(this.registry.keys())

    for (const skillId of toInject) {
      const skill = this.getSkill(skillId)
      if (skill) {
        injectedSkills.push(skill)
        this.emit('skill_injected', { type: 'skill_injected', skillId, agentId })
      }
    }

    console.log(`[SkillRegistry] Injected ${injectedSkills.length} skills into agent ${agentId}`)
    return injectedSkills
  }

  /**
   * 根据 Agent 类型获取应注入的技能
   */
  getSkillsForAgentType(agentType: string): SkillDefinition[] {
    const skillLoader = getSkillLoader()
    const allSkills = skillLoader.getAllSkills()

    // 根据 Agent 类型匹配技能
    const agentSkillMappings: Record<string, string[]> = {
      'general-purpose': ['code', 'refactor', 'test', 'debug', 'docs'],
      'Explore': ['code', 'review', 'debug'],
      'Plan': ['code', 'refactor', 'security'],
      'verification': ['test', 'security', 'review'],
      'claude-code-guide': ['docs', 'deploy'],
      'statusline-setup': ['frontend'],
    }

    const categoryIds = agentSkillMappings[agentType] || []

    return allSkills.filter(s =>
      categoryIds.includes(s.category.id) ||
      s.tags.some(t => categoryIds.includes(t.toLowerCase()))
    )
  }

  /**
   * 构建技能上下文
   */
  buildSkillContext(agentId: string, skillIds?: string[]): {
    skills: SkillDefinition[]
    skillContent: string
    skillIndex: string
  } {
    const skills = this.injectSkillsIntoAgent(agentId, skillIds)

    // 构建技能内容
    const skillContent = skills
      .map(s => s.content || `# ${s.name}\n\n${s.description}`)
      .join('\n\n---\n\n')

    // 构建技能索引
    const skillIndex = skills
      .map(s => `- **${s.name}** (${s.id}): ${s.description}`)
      .join('\n')

    return {
      skills,
      skillContent,
      skillIndex,
    }
  }

  /**
   * 添加技能到预加载队列
   */
  addToPreloadQueue(skillId: string): void {
    if (!this.preloadQueue.includes(skillId)) {
      this.preloadQueue.push(skillId)
    }
  }

  /**
   * 从预加载队列移除
   */
  removeFromPreloadQueue(skillId: string): void {
    const index = this.preloadQueue.indexOf(skillId)
    if (index !== -1) {
      this.preloadQueue.splice(index, 1)
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.registry.clear()
    this.emit('cache_cleared', { type: 'cache_cleared' })
    console.log('[SkillRegistry] Cache cleared')
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalRegistered: number
    preloadQueueSize: number
    totalAccessCount: number
    mostUsedSkills: Array<{ skillId: string; accessCount: number }>
    memoryUsage: number
  } {
    const entries = Array.from(this.registry.values())
    const sortedByAccess = [...entries].sort((a, b) => b.accessCount - a.accessCount)

    return {
      totalRegistered: this.registry.size,
      preloadQueueSize: this.preloadQueue.length,
      totalAccessCount: entries.reduce((sum, e) => sum + e.accessCount, 0),
      mostUsedSkills: sortedByAccess.slice(0, 5).map(e => ({
        skillId: e.skillId,
        accessCount: e.accessCount,
      })),
      memoryUsage: entries.reduce((sum, e) => sum + (e.skill.content?.length || 0), 0),
    }
  }

  /**
   * 销毁注册器
   */
  destroy(): void {
    this.clearCache()
    this.preloadQueue = []
  }
}

// 导出单例
let registryInstance: SkillRegistry | null = null

export function getSkillRegistry(): SkillRegistry {
  if (!registryInstance) {
    registryInstance = new SkillRegistry()
  }
  return registryInstance
}

export function createSkillRegistry(config?: SkillInjectionConfig): SkillRegistry {
  if (registryInstance) {
    registryInstance.destroy()
  }
  registryInstance = new SkillRegistry(config)
  return registryInstance
}
