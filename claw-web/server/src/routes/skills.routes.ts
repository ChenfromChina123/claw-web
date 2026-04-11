/**
 * 技能导入路由 - 处理技能导入相关 API
 *
 * 支持从 URL 导入和本地上传两种方式
 */

import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'
import { parseFrontmatter, type ParsedMarkdown } from '../integrations/skillsAdapter'
import { existsSync } from 'fs'
import { writeFile, mkdir } from 'fs/promises'
import { join, basename, dirname } from 'path'

const MAX_FILE_SIZE = 1024 * 1024 // 1MB

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

/**
 * 处理技能导入相关的 HTTP 请求
 */
export async function handleSkillImportRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
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
    // 尝试从文件名或第一行标题提取
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
  // 尝试从第一行标题提取
  const lines = content.split('\n').filter(l => l.trim())
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('# ')) {
      return trimmed.slice(2).trim()
    }
  }

  // 尝试从文件名提取
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
    // 生成安全的目录名
    const safeDirName = generateSafeDirName(skillName)
    const skillDir = join(workspaceDir, '.claude', 'skills', safeDirName)

    // 确保目录存在
    await mkdir(skillDir, { recursive: true })

    // 保存 SKILL.md
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
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return safeName
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

export default handleSkillImportRoutes
