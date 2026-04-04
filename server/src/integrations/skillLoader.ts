/**
 * Skills 系统集成模块
 * 
 * 这个模块负责加载和管理 Claude Code HAHA 的 Skills 系统，
 * 支持从 src/skills 目录动态加载技能。
 * 
 * 功能：
 * - 动态加载 Skills
 * - 技能注册和执行
 * - 技能参数验证
 * - 技能分类管理
 */

import { readdir, readFile, stat } from 'fs/promises'
import { resolve, join, extname, basename } from 'path'
import { existsSync } from 'fs'

// ==================== 类型定义 ====================

export interface SkillDefinition {
  id: string
  name: string
  description: string
  category: SkillCategory
  tags: string[]
  version: string
  author?: string
  filePath: string
  content?: string
  inputSchema?: SkillInputSchema
  isEnabled: boolean
  loadedAt?: number
}

export interface SkillInputSchema {
  type: 'object'
  properties: Record<string, {
    type: string
    description?: string
    required?: boolean
    default?: unknown
    enum?: unknown[]
  }>
  required?: string[]
}

export interface SkillExecutionContext {
  projectRoot: string
  userId?: string
  sessionId?: string
  variables?: Record<string, string>
}

export interface SkillExecutionResult {
  success: boolean
  output?: string
  error?: string
  metadata?: {
    skillId: string
    executionTime: number
    variables?: Record<string, string>
  }
}

export interface SkillCategory {
  id: string
  name: string
  icon?: string
  description?: string
}

export type SkillStatus = 'loading' | 'loaded' | 'error' | 'disabled'

// ==================== 技能类别定义 ====================

export const DEFAULT_SKILL_CATEGORIES: SkillCategory[] = [
  { id: 'code', name: '代码生成', icon: 'code', description: '代码生成相关技能' },
  { id: 'refactor', name: '重构', icon: 'refresh', description: '代码重构技能' },
  { id: 'test', name: '测试', icon: 'check-circle', description: '测试相关技能' },
  { id: 'review', name: '代码审查', icon: 'eye', description: '代码审查技能' },
  { id: 'debug', name: '调试', icon: 'bug', description: '调试相关技能' },
  { id: 'deploy', name: '部署', icon: 'upload', description: '部署相关技能' },
  { id: 'docs', name: '文档', icon: 'file-text', description: '文档生成技能' },
  { id: 'security', name: '安全', icon: 'shield', description: '安全相关技能' },
  { id: 'performance', name: '性能', icon: 'zap', description: '性能优化技能' },
  { id: 'database', name: '数据库', icon: 'database', description: '数据库相关技能' },
  { id: 'api', name: 'API', icon: 'cloud', description: 'API 相关技能' },
  { id: 'frontend', name: '前端', icon: 'monitor', description: '前端开发技能' },
  { id: 'backend', name: '后端', icon: 'server', description: '后端开发技能' },
  { id: 'devops', name: 'DevOps', icon: 'git-branch', description: 'DevOps 技能' },
  { id: 'other', name: '其他', icon: 'box', description: '其他技能' },
]

// ==================== 技能加载器 ====================

export class SkillLoader {
  private projectRoot: string
  private skills: Map<string, SkillDefinition> = new Map()
  private categories: Map<string, SkillCategory> = new Map()
  private status: SkillStatus = 'loading'
  private statusMessage: string = ''
  
  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
    
    // 初始化类别
    for (const category of DEFAULT_SKILL_CATEGORIES) {
      this.categories.set(category.id, category)
    }
  }
  
  // ==================== 加载技能 ====================
  
  /**
   * 加载所有技能
   */
  async loadSkills(): Promise<void> {
    this.status = 'loading'
    this.statusMessage = '正在扫描技能目录...'
    
    try {
      const skillsPath = resolve(this.projectRoot, 'src', 'skills')
      
      // 检查技能目录是否存在
      if (!existsSync(skillsPath)) {
        console.log('[SkillLoader] 技能目录不存在，尝试创建...')
        // 创建默认技能目录
        const { mkdir } = await import('fs/promises')
        await mkdir(skillsPath, { recursive: true })
        
        // 创建示例技能
        await this.createSampleSkills(skillsPath)
      }
      
      // 扫描技能目录
      await this.scanSkillsDirectory(skillsPath)
      
      this.status = 'loaded'
      this.statusMessage = `已加载 ${this.skills.size} 个技能`
      console.log(`[SkillLoader] 加载完成，共 ${this.skills.size} 个技能`)
      
    } catch (error) {
      this.status = 'error'
      this.statusMessage = error instanceof Error ? error.message : '加载失败'
      console.error('[SkillLoader] 加载失败:', error)
    }
  }
  
  /**
   * 扫描技能目录
   */
  private async scanSkillsDirectory(dirPath: string, basePath?: string): Promise<void> {
    const resolvedBase = basePath || dirPath
    
    try {
      const entries = await readdir(dirPath, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name)
        
        if (entry.isDirectory()) {
          // 递归扫描子目录
          await this.scanSkillsDirectory(fullPath, resolvedBase)
        } else if (entry.isFile()) {
          // 检查文件类型
          const ext = extname(entry.name).toLowerCase()
          
          if (['.md', '.ts', '.js'].includes(ext)) {
            await this.loadSkillFile(fullPath, resolvedBase)
          }
        }
      }
    } catch (error) {
      console.warn(`[SkillLoader] 扫描目录失败: ${dirPath}`, error)
    }
  }
  
  /**
   * 加载技能文件
   */
  private async loadSkillFile(filePath: string, basePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8')
      const ext = extname(filePath).toLowerCase()
      const fileName = basename(filePath, ext)
      
      // 从文件内容解析技能定义
      const skill = this.parseSkillFile(fileName, content, filePath, ext)
      
      if (skill) {
        this.skills.set(skill.id, skill)
        console.log(`[SkillLoader] 加载技能: ${skill.name} (${skill.category.id})`)
      }
      
    } catch (error) {
      console.warn(`[SkillLoader] 加载技能文件失败: ${filePath}`, error)
    }
  }
  
  /**
   * 解析技能文件
   */
  private parseSkillFile(
    fileName: string, 
    content: string, 
    filePath: string,
    ext: string
  ): SkillDefinition | null {
    // 从文件名生成技能 ID
    const id = fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    
    // 尝试从内容中提取元信息
    let name = fileName
    let description = ''
    let categoryId = 'other'
    let tags: string[] = []
    let version = '1.0.0'
    let author: string | undefined
    let inputSchema: SkillInputSchema | undefined
    
    // 解析 Markdown 格式的技能文件
    if (ext === '.md') {
      // 尝试从 frontmatter 或开头解析
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/m)
      if (frontmatterMatch) {
        const fm = frontmatterMatch[1]
        
        const nameMatch = fm.match(/name:\s*(.+)/)
        if (nameMatch) name = nameMatch[1].trim()
        
        const descMatch = fm.match(/description:\s*(.+)/)
        if (descMatch) description = descMatch[1].trim()
        
        const catMatch = fm.match(/category:\s*(.+)/)
        if (catMatch) categoryId = catMatch[1].trim().toLowerCase()
        
        const tagsMatch = fm.match(/tags:\s*\[(.+)\]/)
        if (tagsMatch) tags = tagsMatch[1].split(',').map(t => t.trim())
        
        const verMatch = fm.match(/version:\s*(.+)/)
        if (verMatch) version = verMatch[1].trim()
        
        const authorMatch = fm.match(/author:\s*(.+)/)
        if (authorMatch) author = authorMatch[1].trim()
        
        // 尝试解析 input schema
        const schemaMatch = fm.match(/inputSchema:\s*```json\n([\s\S]*?)```/)
        if (schemaMatch) {
          try {
            inputSchema = JSON.parse(schemaMatch[1])
          } catch {
            // 忽略解析错误
          }
        }
      } else {
        // 尝试从第一行标题解析
        const lines = content.split('\n').filter(l => l.trim())
        if (lines.length > 0) {
          const firstLine = lines[0].replace(/^#+\s*/, '').trim()
          if (firstLine) {
            name = firstLine
          }
        }
        
        // 尝试从描述行解析
        const descMatch = content.match(/^(.+?)[\n。.]/)
        if (descMatch) {
          description = descMatch[1].trim()
        }
        
        // 尝试从标签行解析
        const tagLineMatch = content.match(/Tags?:\s*(.+)/i)
        if (tagLineMatch) {
          tags = tagLineMatch[1].split(/[,，]/).map(t => t.trim()).filter(Boolean)
        }
        
        // 尝试从分类行解析
        const catLineMatch = content.match(/Category:\s*(.+)/i)
        if (catLineMatch) {
          categoryId = catLineMatch[1].trim().toLowerCase()
        }
      }
    }
    
    // 解析 JavaScript/TypeScript 格式的技能文件
    if (ext === '.js' || ext === '.ts') {
      // 尝试从导出或 module.exports 解析
      const nameMatch = content.match(/export\s+(?:const|let)\s+(\w+)\s*=/)
                     || content.match(/module\.exports\s*=\s*\{[^}]*name:\s*['"]([^'"]+)['"]/)
      if (nameMatch) name = nameMatch[1]
      
      const descMatch = content.match(/description:\s*['"]([^'"]+)['"]/)
      if (descMatch) description = descMatch[1]
      
      const catMatch = content.match(/category:\s*['"]([^'"]+)['"]/)
      if (catMatch) categoryId = catMatch[1].toLowerCase()
      
      const tagsMatch = content.match(/tags:\s*\[([^\]]+)\]/)
      if (tagsMatch) tags = tagsMatch[1].split(',').map(t => t.replace(/['"]/g, '').trim())
    }
    
    // 获取类别
    let category = this.categories.get(categoryId)
    if (!category) {
      // 如果类别不存在，创建默认类别
      category = { id: categoryId, name: categoryId }
      this.categories.set(categoryId, category)
    }
    
    return {
      id,
      name,
      description: description || `技能: ${name}`,
      category,
      tags,
      version,
      author,
      filePath,
      content: ext === '.md' ? content : undefined,
      inputSchema,
      isEnabled: true,
      loadedAt: Date.now(),
    }
  }
  
  /**
   * 创建示例技能
   */
  private async createSampleSkills(skillsPath: string): Promise<void> {
    const sampleSkills = [
      {
        name: '示例技能',
        description: '这是一个示例技能，展示了技能的格式和用法',
        category: 'other',
        tags: ['示例', '教程'],
        content: `---
name: 示例技能
description: 这是一个示例技能
category: other
tags: [示例, 教程]
version: 1.0.0
author: Claude Code HAHA
---

# 示例技能

这是一个示例技能文件，展示了如何编写技能。

## 使用方法

技能可以通过 Web 界面或命令行调用。

## 示例代码

\`\`\`typescript
console.log('Hello from skill!')
\`\`\`
`
      },
      {
        name: '代码审查清单',
        description: '自动化代码审查检查清单',
        category: 'review',
        tags: ['代码审查', '质量'],
        content: `---
name: 代码审查清单
description: 自动化代码审查检查清单
category: review
tags: [代码审查, 质量]
version: 1.0.0
---

# 代码审查清单

## 检查项目

1. 代码风格一致性
2. 命名规范
3. 注释完整性
4. 错误处理
5. 安全性检查
6. 性能考虑
`
      },
    ]
    
    const { writeFile } = await import('fs/promises')
    
    for (const skill of sampleSkills) {
      const fileName = skill.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.md'
      const filePath = join(skillsPath, fileName)
      await writeFile(filePath, skill.content, 'utf-8')
    }
    
    console.log(`[SkillLoader] 创建了 ${sampleSkills.length} 个示例技能`)
  }
  
  // ==================== 技能查询 ====================
  
  /**
   * 获取所有技能
   */
  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values())
  }
  
  /**
   * 获取技能
   */
  getSkill(id: string): SkillDefinition | undefined {
    return this.skills.get(id)
  }
  
  /**
   * 按类别获取技能
   */
  getSkillsByCategory(categoryId: string): SkillDefinition[] {
    return this.getAllSkills().filter(s => s.category.id === categoryId)
  }
  
  /**
   * 按标签获取技能
   */
  getSkillsByTag(tag: string): SkillDefinition[] {
    const lowerTag = tag.toLowerCase()
    return this.getAllSkills().filter(s => 
      s.tags.some(t => t.toLowerCase().includes(lowerTag))
    )
  }
  
  /**
   * 搜索技能
   */
  searchSkills(query: string): SkillDefinition[] {
    const lowerQuery = query.toLowerCase()
    return this.getAllSkills().filter(s => 
      s.name.toLowerCase().includes(lowerQuery) ||
      s.description.toLowerCase().includes(lowerQuery) ||
      s.tags.some(t => t.toLowerCase().includes(lowerQuery)) ||
      s.category.name.toLowerCase().includes(lowerQuery)
    )
  }
  
  /**
   * 获取所有类别
   */
  getAllCategories(): SkillCategory[] {
    return Array.from(this.categories.values())
  }
  
  /**
   * 获取技能统计
   */
  getStats(): {
    totalSkills: number
    enabledSkills: number
    disabledSkills: number
    byCategory: Record<string, number>
    totalCategories: number
  } {
    const skills = this.getAllSkills()
    const byCategory: Record<string, number> = {}
    
    let enabled = 0
    let disabled = 0
    
    for (const skill of skills) {
      if (skill.isEnabled) {
        enabled++
      } else {
        disabled++
      }
      
      const catId = skill.category.id
      byCategory[catId] = (byCategory[catId] || 0) + 1
    }
    
    return {
      totalSkills: skills.length,
      enabledSkills: enabled,
      disabledSkills: disabled,
      byCategory,
      totalCategories: this.categories.size,
    }
  }
  
  // ==================== 技能执行 ====================
  
  /**
   * 执行技能
   */
  async executeSkill(
    skillId: string, 
    params: Record<string, unknown>,
    context: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const skill = this.getSkill(skillId)
    
    if (!skill) {
      return { 
        success: false, 
        error: `技能不存在: ${skillId}` 
      }
    }
    
    if (!skill.isEnabled) {
      return { 
        success: false, 
        error: `技能已禁用: ${skill.name}` 
      }
    }
    
    const startTime = Date.now()
    
    try {
      // 验证输入参数
      if (skill.inputSchema) {
        const validationError = this.validateSkillInput(skill.inputSchema, params)
        if (validationError) {
          return { success: false, error: validationError }
        }
      }
      
      // 执行技能（这里是一个简化的执行器）
      // 实际实现可能需要根据技能类型（JS/TS/MD）采用不同的执行方式
      const result = await this.executeSkillContent(skill, params, context)
      
      return {
        success: true,
        output: result,
        metadata: {
          skillId,
          executionTime: Date.now() - startTime,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '执行失败',
        metadata: {
          skillId,
          executionTime: Date.now() - startTime,
        },
      }
    }
  }
  
  /**
   * 验证技能输入
   */
  private validateSkillInput(
    schema: SkillInputSchema, 
    params: Record<string, unknown>
  ): string | null {
    const required = schema.required || []
    
    for (const field of required) {
      if (!(field in params) || params[field] === undefined || params[field] === null) {
        return `缺少必需参数: ${field}`
      }
    }
    
    for (const [key, value] of Object.entries(params)) {
      const prop = schema.properties[key]
      if (prop && prop.type) {
        const actualType = typeof value
        const expectedType = prop.type
        
        // 简单类型检查
        if (expectedType === 'string' && actualType !== 'string') {
          return `参数 ${key} 应该是字符串类型`
        }
        if (expectedType === 'number' && actualType !== 'number') {
          return `参数 ${key} 应该是数字类型`
        }
        if (expectedType === 'boolean' && actualType !== 'boolean') {
          return `参数 ${key} 应该是布尔类型`
        }
        if (expectedType === 'array' && !Array.isArray(value)) {
          return `参数 ${key} 应该是数组类型`
        }
        
        // 枚举检查
        if (prop.enum && !prop.enum.includes(value)) {
          return `参数 ${key} 的值不在允许的范围内`
        }
      }
    }
    
    return null
  }
  
  /**
   * 执行技能内容
   */
  private async executeSkillContent(
    skill: SkillDefinition,
    params: Record<string, unknown>,
    context: SkillExecutionContext
  ): Promise<string> {
    const ext = extname(skill.filePath).toLowerCase()
    
    if (ext === '.md') {
      // Markdown 技能：返回格式化内容
      return this.formatMarkdownSkill(skill, params, context)
    } else if (ext === '.js' || ext === '.ts') {
      // JavaScript/TypeScript 技能：尝试执行
      return this.executeJSSkill(skill, params, context)
    }
    
    return skill.content || `# ${skill.name}\n\n${skill.description}`
  }
  
  /**
   * 格式化 Markdown 技能
   */
  private formatMarkdownSkill(
    skill: SkillDefinition,
    params: Record<string, unknown>,
    context: SkillExecutionContext
  ): string {
    if (!skill.content) {
      return `# ${skill.name}\n\n${skill.description}`
    }
    
    // 简单的模板替换
    let output = skill.content
    
    // 替换变量
    for (const [key, value] of Object.entries(params)) {
      output = output.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(value))
    }
    
    // 替换上下文变量
    if (context.variables) {
      for (const [key, value] of Object.entries(context.variables)) {
        output = output.replace(new RegExp(`\\{\\{\\s*context\\.${key}\\s*\\}\\}`, 'g'), value)
      }
    }
    
    return output
  }
  
  /**
   * 执行 JS 技能
   */
  private async executeJSSkill(
    skill: SkillDefinition,
    params: Record<string, unknown>,
    context: SkillExecutionContext
  ): Promise<string> {
    // 注意：实际执行 JS 代码需要沙箱环境
    // 这里只是一个简化的示例
    
    try {
      // 动态导入技能文件（仅适用于信任的技能）
      const skillModule = await import(skill.filePath + '?t=' + Date.now())
      
      if (typeof skillModule.default === 'function') {
        return await skillModule.default(params, context)
      } else if (skillModule.execute) {
        return await skillModule.execute(params, context)
      } else {
        return JSON.stringify(skillModule)
      }
    } catch (error) {
      // 如果动态导入失败，返回技能信息
      console.warn(`[SkillLoader] 无法执行 JS 技能 ${skill.name}:`, error)
      return `# ${skill.name}\n\n${skill.description}\n\n[注意：JS 技能执行需要额外的沙箱配置]`
    }
  }
  
  // ==================== 技能管理 ====================
  
  /**
   * 启用/禁用技能
   */
  setSkillEnabled(skillId: string, enabled: boolean): boolean {
    const skill = this.skills.get(skillId)
    if (skill) {
      skill.isEnabled = enabled
      return true
    }
    return false
  }
  
  /**
   * 重新加载技能
   */
  async reload(): Promise<void> {
    this.skills.clear()
    await this.loadSkills()
  }
  
  /**
   * 获取加载状态
   */
  getStatus(): { status: SkillStatus; message: string } {
    return {
      status: this.status,
      message: this.statusMessage,
    }
  }
}

// ==================== 单例实例 ====================

let skillLoaderInstance: SkillLoader | null = null

/**
 * 获取技能加载器单例
 */
export function getSkillLoader(projectRoot?: string): SkillLoader {
  if (!skillLoaderInstance) {
    const root = projectRoot || getDefaultProjectRoot()
    skillLoaderInstance = new SkillLoader(root)
  }
  return skillLoaderInstance
}

/**
 * 获取默认项目根目录
 */
function getDefaultProjectRoot(): string {
  const currentDir = process.cwd()
  return currentDir.replace(/\\server\\src$/i, '').replace(/\/server\/src$/, '')
}

/**
 * 初始化技能加载器
 */
export async function initializeSkillLoader(projectRoot?: string): Promise<SkillLoader> {
  const loader = getSkillLoader(projectRoot)
  await loader.loadSkills()
  return loader
}

export default SkillLoader
