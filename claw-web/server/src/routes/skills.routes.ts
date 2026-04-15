/**
 * Skills 路由 - 处理技能相关 API
 *
 * 功能：
 * - GET /api/skills - 列出所有技能
 * - GET /api/skills/:id - 获取技能详情
 * - POST /api/skills/:id/toggle - 启用/禁用技能
 * - GET /api/skills/categories - 获取所有类别
 * - GET /api/skills/stats - 获取统计信息
 * - POST /api/skills/import/url - 从 URL 导入技能
 * - POST /api/skills/import/file - 上传技能文件
 * - POST /api/skills/validate - 验证技能内容
 */

import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'
import { parseFrontmatter, type ParsedMarkdown, getSkillDirCommands } from '../integrations/skillsAdapter'
import { getAllSkills, getSkillDetail, type SkillSource } from '../skills'
import { existsSync } from 'fs'
import { writeFile, mkdir, readdir, readFile } from 'fs/promises'
import { join, basename, dirname } from 'path'
import type { Request, Response } from 'express'

const MAX_FILE_SIZE = 1024 * 1024 // 1MB

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

export interface SkillCategory {
  id: string
  name: string
  icon?: string
  description?: string
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

export interface SkillListResponse {
  skills: SkillDefinition[]
  categories: SkillCategory[]
  total: number
  stats: {
    totalSkills: number
    enabledSkills: number
    disabledSkills: number
    byCategory: Record<string, number>
  }
}

export interface SkillImportResult {
  success: boolean
  skillName?: string
  skillId?: string
  filePath?: string
  message: string
}

export interface SkillPreview {
  name: string
  description: string
  category?: string
  tags: string[]
  version: string
  author?: string
  contentLength: number
  isValid: boolean
  errors: string[]
}

// ==================== 内置技能类别 ====================

const DEFAULT_CATEGORIES: SkillCategory[] = [
  { id: 'code', name: '代码生成', icon: 'code', description: '代码生成相关技能' },
  { id: 'refactor', name: '重构', icon: 'refresh', description: '代码重构技能' },
  { id: 'test', name: '测试', icon: 'check-circle', description: '测试相关技能' },
  { id: 'review', name: '代码审查', icon: 'eye', description: '代码审查技能' },
  { id: 'debug', name: '调试', icon: 'bug', description: '调试相关技能' },
  { id: 'docs', name: '文档', icon: 'file-text', description: '文档生成技能' },
  { id: 'other', name: '其他', icon: 'box', description: '其他技能' },
]

// ==================== 技能存储 ====================

// 内存中的技能缓存
const skillsCache = new Map<string, SkillDefinition>()
let skillsLoaded = false

// ==================== 路由处理器 ====================

/**
 * 处理技能相关 HTTP 请求
 */
export async function handleSkillRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname
  const method = req.method

  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  // GET /api/skills - 列出所有技能
  if (path === '/api/skills' && method === 'GET') {
    return handleListSkills(req, url)
  }

  // GET /api/skills/:id - 获取技能详情
  const skillDetailMatch = path.match(/^\/api\/skills\/([^/]+)$/)
  if (skillDetailMatch && method === 'GET') {
    return handleGetSkill(req, skillDetailMatch[1])
  }

  // POST /api/skills/:id/toggle - 启用/禁用技能
  const skillToggleMatch = path.match(/^\/api\/skills\/([^/]+)\/toggle$/)
  if (skillToggleMatch && method === 'POST') {
    return handleToggleSkill(req, skillToggleMatch[1])
  }

  // GET /api/skills/categories - 获取所有类别
  if (path === '/api/skills/categories' && method === 'GET') {
    return handleGetCategories(req)
  }

  // GET /api/skills/stats - 获取统计信息
  if (path === '/api/skills/stats' && method === 'GET') {
    return handleGetStats(req)
  }

  // POST /api/skills/import/url - 从 URL 导入技能
  if (path === '/api/skills/import/url' && method === 'POST') {
    return handleImportFromUrl(req)
  }

  // POST /api/skills/import/file - 上传技能文件
  if (path === '/api/skills/import/file' && method === 'POST') {
    return handleImportFromFile(req)
  }

  // POST /api/skills/validate - 验证技能内容
  if (path === '/api/skills/validate' && method === 'POST') {
    return handleValidateSkill(req)
  }

  return null
}

// ==================== 技能列表 API ====================

/**
 * 处理列出技能请求
 * 现在支持内置技能、文件技能和动态技能
 */
async function handleListSkills(req: Request, url: URL): Promise<Response> {
  try {
    console.log('[skills.routes] handleListSkills 开始处理请求')
    const auth = await authMiddleware(req)
    console.log('[skills.routes] authMiddleware 返回:', JSON.stringify(auth))
    if (!auth.userId) {
      console.log('[skills.routes] auth.userId 为空，返回 401')
      return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
    }

    // 获取查询参数
    const categoryFilter = url.searchParams.get('category')
    const query = url.searchParams.get('query')

    // 获取工作空间目录
    console.log('[skills.routes] 准备获取 workspaceDir，userId:', auth.userId)
    const workspaceDir = await getWorkspaceDir(auth.userId)
    console.log('[skills.routes] workspaceDir:', workspaceDir)
    
    console.log('[skills.routes] 准备调用 getAllSkills')

    // 使用新的技能系统获取所有技能（包括内置技能）
    const allSkills = await getAllSkills(workspaceDir || process.cwd())

    // 转换为 SkillDefinition 格式
    let skills: SkillDefinition[] = allSkills.map(skill => ({
      id: generateSkillId(skill.name),
      name: skill.name,
      description: skill.description,
      category: getSkillCategory(skill),
      tags: skill.loadedFrom === 'bundled' ? ['内置'] : ['自定义'],
      version: '1.0.0',
      filePath: skill.loadedFrom === 'bundled' ? `builtin://${skill.name}` : (skill.skillRoot || ''),
      isEnabled: skill.isEnabled?.() ?? true,
      loadedAt: Date.now(),
    }))

    // 合并内置技能（从旧系统加载）
    const workspaceSkills = await loadSkills(workspaceDir)
    skills = [...skills, ...workspaceSkills]

    // 去重（按名称）
    const seen = new Set<string>()
    skills = skills.filter(s => {
      if (seen.has(s.name)) return false
      seen.add(s.name)
      return true
    })

    // 过滤技能
    let filteredSkills = skills
    if (categoryFilter) {
      filteredSkills = filteredSkills.filter(s => s.category.id === categoryFilter)
    }
    if (query) {
      const lowerQuery = query.toLowerCase()
      filteredSkills = filteredSkills.filter(s =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.description.toLowerCase().includes(lowerQuery) ||
        s.tags.some(t => t.toLowerCase().includes(lowerQuery))
      )
    }

    // 计算统计
    const stats = calculateStats(skills)

    const response: SkillListResponse = {
      skills: filteredSkills,
      categories: DEFAULT_CATEGORIES,
      total: filteredSkills.length,
      stats,
    }

    return createSuccessResponse(response)
  } catch (error) {
    console.error('[skills.routes] Failed to list skills:', error)
    return createErrorResponse('LIST_FAILED', '获取技能列表失败', 500)
  }
}

/**
 * 获取技能类别
 */
function getSkillCategory(skill: { loadedFrom?: string; name: string }): SkillCategory {
  // 内置技能分类
  const bundledCategories: Record<string, string> = {
    'debug': 'debug',
    'simplify': 'refactor',
    'batch': 'code',
    'verify': 'test',
    'remember': 'docs',
    'stuck': 'debug',
    'lorem-ipsum': 'other',
    'update-config': 'other',
    'skillify': 'other',
    'keybindings': 'other',
  }

  const categoryId = skill.loadedFrom === 'bundled'
    ? (bundledCategories[skill.name] || 'other')
    : 'other'

  return DEFAULT_CATEGORIES.find(c => c.id === categoryId) || DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1]
}

/**
 * 处理获取技能详情请求
 * 现在支持内置技能
 */
async function handleGetSkill(req: Request, skillId: string): Promise<Response> {
  try {
    const auth = await authMiddleware(req)
    if (!auth.userId) {
      return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
    }

    const workspaceDir = await getWorkspaceDir(auth.userId)

    // 1. 先尝试从旧系统获取
    const skills = await loadSkills(workspaceDir)
    const skill = skills.find(s => s.id === skillId)

    if (skill) {
      return createSuccessResponse(skill)
    }

    // 2. 尝试从新技能系统获取（支持内置技能）
    // 从 skillId 反推技能名称
    const skillName = skillId.replace(/-/g, ' ')

    // 尝试获取技能详情
    const skillDetail = await getSkillDetail(skillName, workspaceDir || process.cwd())

    if (skillDetail) {
      // 获取技能内容
      const content = skillDetail.content

      return createSuccessResponse({
        id: skillId,
        name: skillDetail.name,
        description: skillDetail.description,
        category: getSkillCategory({ loadedFrom: skillDetail.source, name: skillDetail.name }),
        tags: skillDetail.source === 'bundled' ? ['内置'] : ['自定义'],
        version: '1.0.0',
        filePath: skillDetail.source === 'bundled' ? `builtin://${skillDetail.name}` : '',
        content: content,
        isEnabled: true,
        loadedAt: Date.now(),
      })
    }

    return createErrorResponse('SKILL_NOT_FOUND', '技能不存在', 404)
  } catch (error) {
    console.error('[skills.routes] Failed to get skill:', error)
    return createErrorResponse('GET_FAILED', '获取技能详情失败', 500)
  }
}

/**
 * 处理启用/禁用技能请求
 */
async function handleToggleSkill(req: Request, skillId: string): Promise<Response> {
  try {
    const auth = await authMiddleware(req)
    if (!auth.userId) {
      return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
    }

    const body = await req.json() as { enabled?: boolean }
    const enabled = body.enabled ?? true

    const skill = skillsCache.get(skillId)
    if (!skill) {
      return createErrorResponse('SKILL_NOT_FOUND', '技能不存在', 404)
    }

    skill.isEnabled = enabled

    return createSuccessResponse({
      success: true,
      skill,
      message: enabled ? '技能已启用' : '技能已禁用',
    })
  } catch (error) {
    console.error('[skills.routes] Failed to toggle skill:', error)
    return createErrorResponse('TOGGLE_FAILED', '切换技能状态失败', 500)
  }
}

/**
 * 处理获取类别请求
 */
async function handleGetCategories(req: Request): Promise<Response> {
  try {
    const auth = await authMiddleware(req)
    if (!auth.userId) {
      return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
    }

    return createSuccessResponse(DEFAULT_CATEGORIES)
  } catch (error) {
    console.error('[skills.routes] Failed to get categories:', error)
    return createErrorResponse('GET_CATEGORIES_FAILED', '获取类别失败', 500)
  }
}

/**
 * 处理获取统计请求
 */
async function handleGetStats(req: Request): Promise<Response> {
  try {
    const auth = await authMiddleware(req)
    if (!auth.userId) {
      return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
    }

    const workspaceDir = await getWorkspaceDir(auth.userId)
    const skills = await loadSkills(workspaceDir)
    const stats = calculateStats(skills)

    return createSuccessResponse(stats)
  } catch (error) {
    console.error('[skills.routes] Failed to get stats:', error)
    return createErrorResponse('GET_STATS_FAILED', '获取统计失败', 500)
  }
}

// ==================== 技能导入 API ====================

/**
 * 从 URL 导入技能
 */
async function handleImportFromUrl(req: Request): Promise<Response> {
  try {
    const auth = await authMiddleware(req)
    if (!auth.userId) {
      return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
    }

    const body = await req.json() as { url?: string; category?: string }
    const skillUrl = body.url

    if (!skillUrl) {
      return createErrorResponse('INVALID_PARAMS', '缺少 url 参数', 400)
    }

    // 验证 URL 格式
    if (!isValidUrl(skillUrl)) {
      return createErrorResponse('INVALID_URL', 'URL 格式不正确，必须以 http:// 或 https:// 开头', 400)
    }

    // 下载远程内容
    let remoteContent: string
    try {
      const response = await fetch(skillUrl, {
        headers: {
          'Accept': 'text/plain, text/markdown, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      if (!response.ok) {
        return createErrorResponse('FETCH_FAILED', `下载失败: HTTP ${response.status}`, 400)
      }

      remoteContent = await response.text()

      if (remoteContent.length > MAX_FILE_SIZE) {
        return createErrorResponse('FILE_TOO_LARGE', `文件过大，最大支持 ${MAX_FILE_SIZE / 1024}KB`, 400)
      }
    } catch (error) {
      return createErrorResponse('FETCH_FAILED', `下载失败: ${error instanceof Error ? error.message : '网络错误'}`, 400)
    }

    // 解析技能内容
    const parseResult = parseAndValidateSkill(remoteContent, skillUrl)
    if (!parseResult.isValid) {
      return createErrorResponse('INVALID_SKILL', `技能格式无效: ${parseResult.errors.join(', ')}`, 400)
    }

    // 获取工作空间目录
    const workspaceDir = await getWorkspaceDir(auth.userId)
    if (!workspaceDir) {
      return createErrorResponse('WORKSPACE_NOT_FOUND', '工作空间不存在', 404)
    }

    // 保存技能
    const saveResult = await saveSkillToWorkspace(
      parseResult.name,
      remoteContent,
      workspaceDir
    )

    if (!saveResult.success) {
      return createErrorResponse('SAVE_FAILED', saveResult.message, 500)
    }

    // 重新加载技能
    await loadSkills(workspaceDir, true)

    return createSuccessResponse<SkillImportResult>({
      success: true,
      skillName: parseResult.name,
      skillId: generateSkillId(parseResult.name),
      filePath: saveResult.filePath,
      message: `成功导入技能: ${parseResult.name}`,
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败'
    return createErrorResponse('IMPORT_FAILED', message, 500)
  }
}

/**
 * 从文件上传导入技能
 */
async function handleImportFromFile(req: Request): Promise<Response> {
  try {
    const auth = await authMiddleware(req)
    if (!auth.userId) {
      return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
    }

    // 获取工作空间目录
    const workspaceDir = await getWorkspaceDir(auth.userId)
    if (!workspaceDir) {
      return createErrorResponse('WORKSPACE_NOT_FOUND', '工作空间不存在', 404)
    }

    // 解析 multipart form data
    const contentType = req.headers.get('content-type') || ''
    let skillContent: string
    let fileName: string

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return createErrorResponse('INVALID_PARAMS', '缺少文件', 400)
      }

      if (file.size > MAX_FILE_SIZE) {
        return createErrorResponse('FILE_TOO_LARGE', `文件过大，最大支持 ${MAX_FILE_SIZE / 1024}KB`, 400)
      }

      skillContent = await file.text()
      fileName = file.name

      // 检查是否是 zip 文件
      if (fileName.endsWith('.zip')) {
        return createErrorResponse('ZIP_NOT_SUPPORTED', '暂不支持 ZIP 包导入，请上传单个 SKILL.md 文件', 400)
      }

      if (!fileName.endsWith('.md')) {
        return createErrorResponse('INVALID_FILE_TYPE', '只支持 .md 格式的文件', 400)
      }
    } else {
      // JSON 格式直接传内容
      const body = await req.json() as { content?: string; name?: string }
      if (!body.content) {
        return createErrorResponse('INVALID_PARAMS', '缺少 content 参数', 400)
      }
      skillContent = body.content
      fileName = body.name || 'imported-skill.md'
    }

    // 解析并验证技能
    const parseResult = parseAndValidateSkill(skillContent, fileName)
    if (!parseResult.isValid) {
      return createErrorResponse('INVALID_SKILL', `技能格式无效: ${parseResult.errors.join(', ')}`, 400)
    }

    // 保存技能
    const saveResult = await saveSkillToWorkspace(
      parseResult.name,
      skillContent,
      workspaceDir
    )

    if (!saveResult.success) {
      return createErrorResponse('SAVE_FAILED', saveResult.message, 500)
    }

    // 重新加载技能
    await loadSkills(workspaceDir, true)

    return createSuccessResponse<SkillImportResult>({
      success: true,
      skillName: parseResult.name,
      skillId: generateSkillId(parseResult.name),
      filePath: saveResult.filePath,
      message: `成功导入技能: ${parseResult.name}`,
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : '导入失败'
    return createErrorResponse('IMPORT_FAILED', message, 500)
  }
}

/**
 * 验证技能内容
 */
async function handleValidateSkill(req: Request): Promise<Response> {
  try {
    const auth = await authMiddleware(req)
    if (!auth.userId) {
      return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
    }

    const body = await req.json() as { content?: string; url?: string }
    let skillContent: string

    if (body.url) {
      // 从 URL 验证
      if (!isValidUrl(body.url)) {
        return createErrorResponse('INVALID_URL', 'URL 格式不正确', 400)
      }

      try {
        const response = await fetch(body.url)
        if (!response.ok) {
          return createErrorResponse('FETCH_FAILED', `下载失败: HTTP ${response.status}`, 400)
        }
        skillContent = await response.text()
      } catch (error) {
        return createErrorResponse('FETCH_FAILED', `下载失败: ${error instanceof Error ? error.message : '网络错误'}`, 400)
      }
    } else if (body.content) {
      skillContent = body.content
    } else {
      return createErrorResponse('INVALID_PARAMS', '缺少 content 或 url 参数', 400)
    }

    const preview = parseAndValidateSkill(skillContent, 'validation')
    return createSuccessResponse<SkillPreview>(preview)

  } catch (error) {
    const message = error instanceof Error ? error.message : '验证失败'
    return createErrorResponse('VALIDATE_FAILED', message, 500)
  }
}

// ==================== 技能加载和管理 ====================

/**
 * 加载所有技能
 */
async function loadSkills(workspaceDir: string | null, forceReload = false): Promise<SkillDefinition[]> {
  if (skillsLoaded && !forceReload) {
    return Array.from(skillsCache.values())
  }

  skillsCache.clear()

  // 加载内置技能
  await loadBuiltinSkills()

  // 加载用户工作空间的技能
  if (workspaceDir) {
    await loadWorkspaceSkills(workspaceDir)
  }

  skillsLoaded = true
  console.log(`[skills.routes] Loaded ${skillsCache.size} skills`)

  return Array.from(skillsCache.values())
}

/**
 * 加载内置技能
 */
async function loadBuiltinSkills(): Promise<void> {
  const builtinSkills: Array<{ name: string; description: string; category: string; content: string }> = [
    {
      name: '代码审查',
      description: '对代码进行全面审查，检查代码质量、潜在问题和改进建议',
      category: 'review',
      content: `---
name: 代码审查
description: 对代码进行全面审查，检查代码质量、潜在问题和改进建议
category: review
tags: [代码审查, 质量, 最佳实践]
version: 1.0.0
author: Claude Code HAHA
---

# 代码审查

请对提供的代码进行全面审查，关注以下方面：

## 审查要点

1. **代码质量**
   - 代码可读性和可维护性
   - 命名规范和一致性
   - 代码复杂度

2. **潜在问题**
   - 逻辑错误
   - 边界条件处理
   - 异常处理

3. **最佳实践**
   - 设计模式应用
   - 代码复用
   - 性能优化

4. **安全性**
   - 输入验证
   - 敏感数据处理
   - 常见安全漏洞

请提供具体的改进建议和示例代码。`
    },
    {
      name: '代码重构',
      description: '识别代码中的坏味道并提供重构建议',
      category: 'refactor',
      content: `---
name: 代码重构
description: 识别代码中的坏味道并提供重构建议
category: refactor
tags: [重构, 代码质量, 设计模式]
version: 1.0.0
author: Claude Code HAHA
---

# 代码重构

请分析提供的代码，识别其中的"坏味道"并提供重构建议。

## 常见坏味道

1. **过长函数** - 函数行数过多，职责不单一
2. **过大类** - 类承担了过多职责
3. **重复代码** - 相同的代码出现在多个地方
4. **过长参数列表** - 函数参数过多
5. **发散式变化** - 一个类经常因为不同的原因被修改
6. **霰弹式修改** - 修改一个功能需要在多个类中做小的改动

## 重构手法

- 提取函数/方法
- 提取类
- 内联函数
- 移动函数
- 重命名
- 引入设计模式

请针对每个识别出的问题提供：
1. 问题描述
2. 重构方案
3. 重构后的代码示例`
    },
    {
      name: '生成单元测试',
      description: '为代码自动生成全面的单元测试用例',
      category: 'test',
      content: `---
name: 生成单元测试
description: 为代码自动生成全面的单元测试用例
category: test
tags: [测试, 单元测试, TDD]
version: 1.0.0
author: Claude Code HAHA
---

# 生成单元测试

请为提供的代码生成全面的单元测试。

## 测试覆盖要求

1. **正常路径** - 标准输入下的预期行为
2. **边界条件** - 空值、零值、最大值等
3. **异常情况** - 错误处理和异常抛出
4. **边界情况** - 循环边界、数组边界等

## 测试框架

根据项目类型选择合适的测试框架：
- JavaScript/TypeScript: Jest, Mocha, Vitest
- Python: pytest, unittest
- Java: JUnit, TestNG
- Go: testing
- Rust: built-in test

## 输出格式

1. 测试文件路径建议
2. 完整的测试代码
3. 测试说明和覆盖率分析`
    },
    {
      name: '解释代码',
      description: '详细解释代码的功能、逻辑和设计思路',
      category: 'docs',
      content: `---
name: 解释代码
description: 详细解释代码的功能、逻辑和设计思路
category: docs
tags: [文档, 解释, 学习]
version: 1.0.0
author: Claude Code HAHA
---

# 解释代码

请详细解释提供的代码。

## 解释维度

1. **整体功能** - 这段代码主要做什么
2. **输入输出** - 接收什么参数，返回什么结果
3. **核心逻辑** - 关键算法和业务逻辑
4. **代码结构** - 函数/类的组织和职责
5. **设计思路** - 为什么选择这种实现方式
6. **依赖关系** - 依赖哪些外部库或模块

## 输出格式

- 逐行或逐段解释
- 使用通俗易懂的语言
- 提供类比帮助理解
- 指出关键的技术点`
    },
    {
      name: '优化性能',
      description: '分析代码性能瓶颈并提供优化建议',
      category: 'code',
      content: `---
name: 优化性能
description: 分析代码性能瓶颈并提供优化建议
category: code
tags: [性能, 优化, 效率]
version: 1.0.0
author: Claude Code HAHA
---

# 优化性能

请分析提供的代码，识别性能瓶颈并提供优化建议。

## 性能分析维度

1. **时间复杂度** - 算法效率分析
2. **空间复杂度** - 内存使用情况
3. **I/O 操作** - 文件、网络、数据库访问
4. **循环优化** - 不必要的循环和计算
5. **数据结构** - 选择合适的数据结构
6. **缓存策略** - 重复计算和缓存机会

## 常见优化技巧

- 减少不必要的计算
- 使用更高效的数据结构
- 避免重复的数据库查询
- 批量处理代替单条处理
- 异步处理耗时操作
- 使用缓存

## 输出

1. 识别的性能问题
2. 优化方案
3. 优化后的代码
4. 预期性能提升`
    },
    {
      name: '调试助手',
      description: '帮助分析错误信息和调试代码问题',
      category: 'debug',
      content: `---
name: 调试助手
description: 帮助分析错误信息和调试代码问题
category: debug
tags: [调试, 错误分析, 故障排除]
version: 1.0.0
author: Claude Code HAHA
---

# 调试助手

请帮助分析和调试代码中的问题。

## 调试流程

1. **错误分析** - 解析错误信息和堆栈跟踪
2. **根因定位** - 找出问题的根本原因
3. **解决方案** - 提供修复建议
4. **预防措施** - 如何避免类似问题

## 支持的问题类型

- 运行时错误
- 逻辑错误
- 性能问题
- 内存泄漏
- 并发问题
- 配置错误

## 输出

1. 问题诊断
2. 根本原因
3. 修复方案
4. 验证方法`
    },
  ]

  for (const skillData of builtinSkills) {
    const id = generateSkillId(skillData.name)
    const category = DEFAULT_CATEGORIES.find(c => c.id === skillData.category) || DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1]

    const skill: SkillDefinition = {
      id,
      name: skillData.name,
      description: skillData.description,
      category,
      tags: ['内置'],
      version: '1.0.0',
      author: 'Claude Code HAHA',
      filePath: `builtin://${id}`,
      content: skillData.content,
      isEnabled: true,
      loadedAt: Date.now(),
    }

    skillsCache.set(id, skill)
  }
}

/**
 * 加载用户工作空间的技能
 */
async function loadWorkspaceSkills(workspaceDir: string): Promise<void> {
  const skillsDir = join(workspaceDir, '.claude', 'skills')

  if (!existsSync(skillsDir)) {
    return
  }

  try {
    const entries = await readdir(skillsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const skillDir = join(skillsDir, entry.name)
      const skillFile = join(skillDir, 'SKILL.md')

      if (!existsSync(skillFile)) continue

      try {
        const content = await readFile(skillFile, 'utf-8')
        const parsed = parseFrontmatter(content, skillFile)

        const name = (parsed.frontmatter.name as string) || entry.name
        const description = (parsed.frontmatter.description as string) || ''
        const categoryId = (parsed.frontmatter.category as string) || 'other'
        const tagsRaw = parsed.frontmatter.tags
        const version = (parsed.frontmatter.version as string) || '1.0.0'
        const author = parsed.frontmatter.author as string | undefined

        let tags: string[] = []
        if (Array.isArray(tagsRaw)) {
          tags = tagsRaw.map(t => String(t))
        } else if (typeof tagsRaw === 'string') {
          tags = tagsRaw.split(',').map(t => t.trim())
        }

        const category = DEFAULT_CATEGORIES.find(c => c.id === categoryId) || DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1]
        const id = generateSkillId(name)

        const skill: SkillDefinition = {
          id,
          name,
          description,
          category,
          tags,
          version,
          author,
          filePath: skillFile,
          content,
          isEnabled: true,
          loadedAt: Date.now(),
        }

        skillsCache.set(id, skill)
      } catch (error) {
        console.warn(`[skills.routes] Failed to load skill from ${skillDir}:`, error)
      }
    }
  } catch (error) {
    console.warn('[skills.routes] Failed to load workspace skills:', error)
  }
}

// ==================== 辅助函数 ====================

/**
 * 解析并验证技能内容
 */
function parseAndValidateSkill(content: string, source: string): SkillPreview {
  const errors: string[] = []

  if (!content || !content.trim()) {
    return {
      name: '',
      description: '',
      tags: [],
      version: '1.0.0',
      contentLength: 0,
      isValid: false,
      errors: ['技能内容不能为空'],
    }
  }

  const parsed = parseFrontmatter(content, source)

  // 提取技能名称
  let name = parsed.frontmatter.name as string | undefined
  if (!name) {
    name = extractNameFromContent(parsed.content, source)
  }

  if (!name || name.trim().length === 0) {
    errors.push('缺少技能名称 (name 字段或 # 标题)')
  }

  // 提取描述
  const description = (parsed.frontmatter.description as string) || ''
  if (!description.trim()) {
    errors.push('缺少技能描述 (description 字段)')
  }

  // 提取标签
  const tagsRaw = parsed.frontmatter.tags
  let tags: string[] = []
  if (Array.isArray(tagsRaw)) {
    tags = tagsRaw.map(t => String(t)).filter(Boolean)
  } else if (typeof tagsRaw === 'string') {
    tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
  }

  // 提取版本
  const version = (parsed.frontmatter.version as string) || '1.0.0'

  // 提取作者
  const author = parsed.frontmatter.author as string | undefined

  // 提取类别
  const category = parsed.frontmatter.category as string | undefined

  return {
    name: name || '',
    description,
    category,
    tags,
    version,
    author,
    contentLength: content.length,
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * 从内容中提取技能名称
 */
function extractNameFromContent(content: string, source: string): string | undefined {
  const lines = content.split('\n').filter(l => l.trim())
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim()
    }
  }

  if (source) {
    const baseName = basename(source, '.md')
    if (baseName && baseName !== 'validation' && baseName !== 'imported-skill') {
      return baseName
    }
  }

  return undefined
}

/**
 * 保存技能到工作空间
 */
async function saveSkillToWorkspace(
  skillName: string,
  content: string,
  workspaceDir: string
): Promise<{ success: boolean; filePath?: string; message: string }> {
  try {
    const safeDirName = generateSafeDirName(skillName)
    const skillDir = join(workspaceDir, '.claude', 'skills', safeDirName)

    await mkdir(skillDir, { recursive: true })

    const skillFilePath = join(skillDir, 'SKILL.md')
    await writeFile(skillFilePath, content, 'utf-8')

    return {
      success: true,
      filePath: skillFilePath,
      message: `技能已保存到 ${skillFilePath}`,
    }
  } catch (error) {
    return {
      success: false,
      message: `保存失败: ${error instanceof Error ? error.message : '未知错误'}`,
    }
  }
}

/**
 * 生成安全的目录名
 */
function generateSafeDirName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50)
}

/**
 * 生成技能 ID
 */
function generateSkillId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * 验证 URL 格式
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 获取用户工作空间目录
 */
async function getWorkspaceDir(userId: string): Promise<string | null> {
  try {
    const { getWorkspaceManager } = await import('../services/workspaceManager')
    const workspaceManager = getWorkspaceManager()
    const workspace = await workspaceManager.getUserWorkspace(userId)
    if (!workspace) {
      return null
    }
    return workspace.path
  } catch (error) {
    console.error('[skills.routes] Failed to get workspace:', error)
    return null
  }
}

/**
 * 计算统计信息
 */
function calculateStats(skills: SkillDefinition[]) {
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
  }
}

// ==================== 导出 ====================

export default handleSkillRoutes

// 为了兼容旧代码，保留旧的处理函数名称
export const handleSkillImportRoutes = handleSkillRoutes
