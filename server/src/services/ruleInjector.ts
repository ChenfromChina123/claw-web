/**
 * 规则注入器 - 用户规则与项目规则管理
 * 
 * 功能：
 * 1. 自动加载用户规则（来自 ~/.trae/rules/）
 * 2. 自动加载项目规则（来自项目根目录的 .trae/rules/）
 * 3. 将规则注入到 Agent 的系统提示词中
 * 4. 支持上下文压缩后的规则重新注入
 * 
 * 规则加载优先级：
 * 1. 用户规则（全局规则）- 优先级最高
 * 2. 项目规则（项目特定规则）- 优先级次之
 * 
 * 注入时机：
 * - 初始系统提示词构建时
 * - 上下文压缩后重新构建系统提示词时
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

/**
 * 规则类型
 */
export enum RuleType {
  /** 用户规则（全局） */
  USER = 'user',
  /** 项目规则 */
  PROJECT = 'project',
}

/**
 * 规则项定义
 */
export interface RuleItem {
  /** 规则类型 */
  type: RuleType
  /** 规则文件路径 */
  filePath: string
  /** 规则内容 */
  content: string
  /** 规则名称（文件名） */
  name: string
  /** 最后修改时间 */
  lastModified: Date
}

/**
 * 规则加载结果
 */
export interface RuleLoadResult {
  /** 用户规则列表 */
  userRules: RuleItem[]
  /** 项目规则列表 */
  projectRules: RuleItem[]
  /** 加载的规则总数 */
  totalRules: number
  /** 加载错误（如果有） */
  errors: string[]
}

/**
 * 规则注入器类
 */
export class RuleInjector {
  /** 规则缓存 */
  private ruleCache: Map<string, RuleItem> = new Map()
  /** 缓存加载时间 */
  private cacheLoadedTime: Date | null = null
  /** 缓存过期时间（毫秒） */
  private cacheExpirationMs: number = 5000
  /** 最后注入标记（用于检测是否需要重新注入） */
  private lastInjectionMarker: string | null = null

  /**
   * 加载所有规则
   */
  async loadRules(cwd?: string): Promise<RuleLoadResult> {
    const result: RuleLoadResult = {
      userRules: [],
      projectRules: [],
      totalRules: 0,
      errors: [],
    }

    try {
      // 检查缓存是否有效
      if (this.isCacheValid()) {
        console.log('[RuleInjector] 使用缓存的规则')
        for (const rule of this.ruleCache.values()) {
          if (rule.type === RuleType.USER) {
            result.userRules.push(rule)
          } else {
            result.projectRules.push(rule)
          }
        }
        result.totalRules = this.ruleCache.size
        return result
      }

      console.log('[RuleInjector] 开始加载规则...')

      // 1. 加载用户规则（从用户主目录）
      const userRules = await this.loadUserRules()
      result.userRules = userRules
      userRules.forEach(rule => this.ruleCache.set(rule.filePath, rule))

      // 2. 加载项目规则（从当前工作目录）
      const projectRules = await this.loadProjectRules(cwd || process.cwd())
      result.projectRules = projectRules
      projectRules.forEach(rule => this.ruleCache.set(rule.filePath, rule))

      result.totalRules = userRules.length + projectRules.length
      this.cacheLoadedTime = new Date()

      console.log(`[RuleInjector] 规则加载完成：${result.totalRules} 条规则`)

      // 生成注入标记
      this.lastInjectionMarker = this.generateInjectionMarker(result)

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error))
      console.error('[RuleInjector] 规则加载失败:', error)
    }

    return result
  }

  /**
   * 加载用户规则
   */
  private async loadUserRules(): Promise<RuleItem[]> {
    const rules: RuleItem[] = []
    
    try {
      // 用户规则目录：~/.trae/rules/
      const userHome = os.homedir()
      const userRulesDir = path.join(userHome, '.trae', 'rules')
      
      console.log('[RuleInjector] 检查用户规则目录:', userRulesDir)
      
      // 检查目录是否存在
      try {
        await fs.access(userRulesDir)
      } catch {
        console.log('[RuleInjector] 用户规则目录不存在，跳过')
        return rules
      }

      // 读取所有 .md 文件
      const files = await fs.readdir(userRulesDir)
      const mdFiles = files.filter(f => f.endsWith('.md'))

      for (const file of mdFiles) {
        const filePath = path.join(userRulesDir, file)
        const content = await this.readRuleFile(filePath)
        
        if (content) {
          const stat = await fs.stat(filePath)
          rules.push({
            type: RuleType.USER,
            filePath,
            content,
            name: file.replace('.md', ''),
            lastModified: stat.mtime,
          })
          console.log(`[RuleInjector] 已加载用户规则：${file}`)
        }
      }
    } catch (error) {
      console.error('[RuleInjector] 加载用户规则失败:', error)
    }

    return rules
  }

  /**
   * 加载项目规则
   */
  private async loadProjectRules(projectRoot: string): Promise<RuleItem[]> {
    const rules: RuleItem[] = []
    
    try {
      // 项目规则目录：{projectRoot}/.trae/rules/
      const projectRulesDir = path.join(projectRoot, '.trae', 'rules')
      
      console.log('[RuleInjector] 检查项目规则目录:', projectRulesDir)
      
      // 检查目录是否存在
      try {
        await fs.access(projectRulesDir)
      } catch {
        console.log('[RuleInjector] 项目规则目录不存在，跳过')
        return rules
      }

      // 读取所有 .md 文件
      const files = await fs.readdir(projectRulesDir)
      const mdFiles = files.filter(f => f.endsWith('.md'))

      for (const file of mdFiles) {
        const filePath = path.join(projectRulesDir, file)
        const content = await this.readRuleFile(filePath)
        
        if (content) {
          const stat = await fs.stat(filePath)
          rules.push({
            type: RuleType.PROJECT,
            filePath,
            content,
            name: file.replace('.md', ''),
            lastModified: stat.mtime,
          })
          console.log(`[RuleInjector] 已加载项目规则：${file}`)
        }
      }
    } catch (error) {
      console.error('[RuleInjector] 加载项目规则失败:', error)
    }

    return rules
  }

  /**
   * 读取规则文件内容
   */
  private async readRuleFile(filePath: string): Promise<string | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const trimmed = content.trim()
      
      // 忽略空文件
      if (!trimmed) {
        console.log(`[RuleInjector] 跳过空规则文件：${filePath}`)
        return null
      }
      
      return trimmed
    } catch (error) {
      console.error(`[RuleInjector] 读取规则文件失败：${filePath}`, error)
      return null
    }
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid(): boolean {
    if (!this.cacheLoadedTime) {
      return false
    }

    const now = new Date()
    const elapsed = now.getTime() - this.cacheLoadedTime.getTime()
    
    return elapsed < this.cacheExpirationMs
  }

  /**
   * 生成注入标记（用于检测规则是否变化）
   */
  private generateInjectionMarker(result: RuleLoadResult): string {
    const allRules = [...result.userRules, ...result.projectRules]
    const markers = allRules.map(rule => 
      `${rule.type}:${rule.name}:${rule.lastModified.getTime()}`
    )
    return markers.join('|')
  }

  /**
   * 检查规则是否需要重新注入
   */
  async needsReInjection(cwd?: string): Promise<boolean> {
    const result = await this.loadRules(cwd)
    const newMarker = this.generateInjectionMarker(result)
    
    const needsReinject = this.lastInjectionMarker !== newMarker
    
    if (needsReinject) {
      console.log('[RuleInjector] 规则已变更，需要重新注入')
    } else {
      console.log('[RuleInjector] 规则未变更，无需重新注入')
    }
    
    return needsReinject
  }

  /**
   * 构建规则注入字符串
   */
  async buildRulesInjection(cwd?: string): Promise<string> {
    const result = await this.loadRules(cwd)
    
    if (result.totalRules === 0) {
      console.log('[RuleInjector] 没有可用的规则')
      return ''
    }

    const sections: string[] = []

    // 用户规则部分
    if (result.userRules.length > 0) {
      const userRulesSection = [
        '# 用户规则（全局规则）',
        '以下规则来自用户主目录，适用于所有项目：',
        '',
        ...result.userRules.map(rule => {
          return `## ${rule.name}\n${rule.content}`
        }),
      ].join('\n\n')
      sections.push(userRulesSection)
    }

    // 项目规则部分
    if (result.projectRules.length > 0) {
      const projectRulesSection = [
        '# 项目规则',
        '以下规则来自当前项目的 .trae/rules 目录：',
        '',
        ...result.projectRules.map(rule => {
          return `## ${rule.name}\n${rule.content}`
        }),
      ].join('\n\n')
      sections.push(projectRulesSection)
    }

    const injection = [
      '',
      '# 规则与约束',
      '你必须严格遵守以下规则：',
      '',
      ...sections,
    ].join('\n\n')

    console.log(`[RuleInjector] 构建规则注入：${result.totalRules} 条规则`)
    
    return injection
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.ruleCache.clear()
    this.cacheLoadedTime = null
    this.lastInjectionMarker = null
    console.log('[RuleInjector] 缓存已清除')
  }

  /**
   * 获取规则统计信息
   */
  getRuleStats(): {
    userRules: number
    projectRules: number
    totalRules: number
    cacheSize: number
  } {
    const userRules = Array.from(this.ruleCache.values()).filter(
      r => r.type === RuleType.USER
    ).length
    const projectRules = Array.from(this.ruleCache.values()).filter(
      r => r.type === RuleType.PROJECT
    ).length

    return {
      userRules,
      projectRules,
      totalRules: userRules + projectRules,
      cacheSize: this.ruleCache.size,
    }
  }
}

// 单例导出
export const ruleInjector = new RuleInjector()

export default RuleInjector
