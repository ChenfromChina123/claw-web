/**
 * Agent 工作目录路由 - 处理 Agent 工作目录相关 API
 * 
 * 包括：
 * - 工作目录列表 (list)
 * - 文件内容读取 (content)
 * - 文件保存 (save)
 * - 文件上传 (upload)
 * - 文件下载 (download)
 * - 创建文件/文件夹 (create)
 * - 打包下载 (download-zip)
 * - 用户主目录 (userdir)
 */

import * as path from 'path'
import { existsSync } from 'fs'
import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'
import { getWorkspaceManager } from '../services/workspaceManager'
import { readDirectory, getMimeType, detectLanguage, resolveWorkdirFullPath } from '../utils/workdir'

// 二进制文件扩展名
const BINARY_EXTS = [
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.wmv', '.flv',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.exe', '.dll', '.so', '.dylib',
]

/**
 * 辅助函数：确保工作区存在
 */
async function ensureWorkspace(sessionId: string, userId: string) {
  const workspaceManager = getWorkspaceManager()
  const userWorkspace = await workspaceManager.getOrCreateUserWorkspace(userId)
  console.log(`[WorkDir] 统一使用用户主目录: userId=${userId}, path=${userWorkspace.path}`)
  return userWorkspace
}

/**
 * 处理 Agent 工作目录相关的 HTTP 请求
 */
export async function handleAgentWorkdirRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const pathName = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  // ==================== 工作目录浏览器 ====================

  // GET /api/agent/workdir/list - 获取目录/文件列表（懒加载）
  if (pathName === '/api/agent/workdir/list' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const sessionId = url.searchParams.get('sessionId')
      const dirPath = url.searchParams.get('path') || '/'

      if (!sessionId) {
        return createErrorResponse('INVALID_PARAMS', '缺少必需参数: sessionId', 400)
      }

      const workspace = await ensureWorkspace(sessionId, auth.userId)
      if (!workspace) {
        return createErrorResponse('WORKSPACE_NOT_FOUND', '工作区创建失败，请重试', 500)
      }

      const fullPath = `${workspace.path}${dirPath === '/' ? '' : dirPath}`

      if (!fullPath.startsWith(workspace.path)) {
        return createErrorResponse('FORBIDDEN', '禁止访问工作区外的目录', 403)
      }

      const items = await readDirectory(fullPath, workspace.path)

      return createSuccessResponse({
        items,
        path: dirPath,
        sessionId,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取目录列表失败'
      return createErrorResponse('LIST_FAILED', message, 500)
    }
  }

  // GET /api/agent/workdir/content - 获取文件内容
  if (pathName === '/api/agent/workdir/content' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const sessionId = url.searchParams.get('sessionId')
      const filePath = url.searchParams.get('path')

      if (!sessionId || !filePath) {
        return createErrorResponse('INVALID_PARAMS', '缺少必需参数: sessionId, path', 400)
      }

      const workspace = await ensureWorkspace(sessionId, auth.userId)
      if (!workspace) {
        return createErrorResponse('WORKSPACE_NOT_FOUND', '工作区创建失败，请重试', 500)
      }

      const fullPath = `${workspace.path}${filePath.startsWith('/') ? filePath : '/' + filePath}`

      if (!fullPath.startsWith(workspace.path)) {
        return createErrorResponse('FORBIDDEN', '禁止访问工作区外的文件', 403)
      }

      const fs = await import('fs/promises')
      const stat = await fs.stat(fullPath)

      if (!stat.isFile()) {
        return createErrorResponse('NOT_FILE', '目标不是文件', 400)
      }

      const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase().split('?')[0]
      const isBinary = BINARY_EXTS.includes(ext)
      const MAX_TEXT_SIZE = 10 * 1024 * 1024
      const MAX_BINARY_SIZE = 50 * 1024 * 1024
      const maxSize = isBinary ? MAX_BINARY_SIZE : MAX_TEXT_SIZE

      if (stat.size > maxSize) {
        return createErrorResponse(
          'FILE_TOO_LARGE',
          `文件过大 (${(stat.size / 1024 / 1024).toFixed(2)}MB)，${isBinary ? '超过 50MB' : '超过 10MB'}限制`,
          400
        )
      }

      if (isBinary) {
        const buffer = await fs.readFile(fullPath)
        const base64 = buffer.toString('base64')
        const mimeType = getMimeType(ext)

        return createSuccessResponse({
          mode: 'binary',
          encoding: 'base64',
          content: base64,
          mimeType,
          ext,
          size: stat.size,
          lastModified: stat.mtime.toISOString(),
          path: filePath
        })
      }

      const content = await fs.readFile(fullPath, 'utf-8')
      const language = detectLanguage(ext)

      return createSuccessResponse({
        mode: 'text',
        content,
        language,
        size: stat.size,
        lastModified: stat.mtime.toISOString(),
        path: filePath
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取文件内容失败'
      if (message.includes('ENOENT') || message.includes('not found')) {
        return createErrorResponse('FILE_NOT_FOUND', '文件不存在', 404)
      }
      return createErrorResponse('READ_FAILED', message, 500)
    }
  }

  // POST /api/agent/workdir/save - 保存文件修改
  if (pathName === '/api/agent/workdir/save' && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const body = await req.json() as { sessionId: string; filePath: string; content: string }
      const { sessionId, filePath, content } = body

      if (!sessionId || !filePath || content === undefined) {
        return createErrorResponse('INVALID_PARAMS', '缺少必需参数: sessionId, filePath, content', 400)
      }

      const workspaceManager = getWorkspaceManager()
      const workspace = await ensureWorkspace(sessionId, auth.userId)
      if (!workspace) {
        return createErrorResponse('WORKSPACE_NOT_FOUND', '工作区创建失败，请重试', 500)
      }

      const fullPath = `${workspace.path}${filePath.startsWith('/') ? filePath : '/' + filePath}`

      if (!fullPath.startsWith(workspace.path)) {
        return createErrorResponse('FORBIDDEN', '禁止写入工作区外的位置', 403)
      }

      const fs = await import('fs/promises')
      const tmpPath = `${fullPath}.tmp.${Date.now()}`
      await fs.writeFile(tmpPath, content, 'utf-8')
      await fs.rename(tmpPath, fullPath)

      workspace.lastModifiedAt = new Date().toISOString()
      await workspaceManager.persistWorkspace(workspace)

      return createSuccessResponse({
        success: true,
        message: '文件已保存',
        path: filePath,
        savedAt: new Date().toISOString(),
        size: Buffer.byteLength(content, 'utf-8')
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存文件失败'
      return createErrorResponse('SAVE_FAILED', message, 500)
    }
  }

  // POST /api/agent/workdir/create - 新建空文件或文件夹
  if (pathName === '/api/agent/workdir/create' && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const body = await req.json() as { sessionId: string; targetPath: string; kind: 'file' | 'directory' }
      const { sessionId, targetPath, kind } = body

      if (!sessionId || !targetPath || (kind !== 'file' && kind !== 'directory')) {
        return createErrorResponse('INVALID_PARAMS', '缺少 sessionId、targetPath 或 kind', 400)
      }

      const workspace = await ensureWorkspace(sessionId, auth.userId)
      if (!workspace) {
        return createErrorResponse('WORKSPACE_NOT_FOUND', '工作区创建失败，请重试', 500)
      }

      const resolved = resolveWorkdirFullPath(workspace.path, targetPath)
      if (!resolved.ok) {
        return createErrorResponse(resolved.code || 'ERROR', resolved.message || '解析路径失败', resolved.code === 'FORBIDDEN' ? 403 : 400)
      }

      const fs = await import('fs/promises')

      if (kind === 'directory') {
        try {
          await fs.access(resolved.fullPath)
          return createErrorResponse('ALREADY_EXISTS', '该路径已存在', 409)
        } catch {
          await fs.mkdir(resolved.fullPath, { recursive: true })
        }
      } else {
        const dir = path.dirname(resolved.fullPath)
        await fs.mkdir(dir, { recursive: true })
        try {
          await fs.writeFile(resolved.fullPath, '', { flag: 'wx' })
        } catch (e: unknown) {
          const err = e as { code?: string }
          if (err?.code === 'EEXIST') {
            return createErrorResponse('ALREADY_EXISTS', '该文件已存在', 409)
          }
          throw e
        }
      }

      const webOut = path.relative(path.resolve(workspace.path), resolved.fullPath).replace(/\\/g, '/')
      const pathOut = webOut ? `/${webOut}` : '/'

      return createSuccessResponse({ success: true, path: pathOut, kind })
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建失败'
      return createErrorResponse('CREATE_FAILED', message, 500)
    }
  }

  // GET /api/agent/workdir/download - 流式下载文件
  if (pathName === '/api/agent/workdir/download' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const sessionId = url.searchParams.get('sessionId')
      const filePath = url.searchParams.get('path')

      if (!sessionId || !filePath) {
        return createErrorResponse('INVALID_PARAMS', '缺少必需参数: sessionId, path', 400)
      }

      const workspace = await ensureWorkspace(sessionId, auth.userId)
      if (!workspace) {
        return createErrorResponse('WORKSPACE_NOT_FOUND', '工作区创建失败，请重试', 500)
      }

      const fullPath = `${workspace.path}${filePath.startsWith('/') ? filePath : '/' + filePath}`
      if (!fullPath.startsWith(workspace.path)) {
        return createErrorResponse('FORBIDDEN', '禁止访问工作区外的文件', 403)
      }

      const fs = await import('fs/promises')
      const stat = await fs.stat(fullPath)
      if (!stat.isFile()) {
        return createErrorResponse('NOT_FILE', '目标不是文件', 400)
      }

      const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase().split('?')[0]
      const mimeType = getMimeType(ext)
      const fileName = filePath.split(/[/\\]/).pop() || 'download'
      const fileBuffer = await fs.readFile(fullPath)

      return new Response(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(stat.size),
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          'Cache-Control': 'no-cache',
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '下载失败'
      if (message.includes('ENOENT') || message.includes('not found')) {
        return createErrorResponse('FILE_NOT_FOUND', '文件不存在', 404)
      }
      return createErrorResponse('DOWNLOAD_FAILED', message, 500)
    }
  }

  // ==================== 用户主目录 (userdir) ====================

  // GET /api/agent/session/effective-workspace - 获取当前会话对应的有效工作区路径
  if (pathName === '/api/agent/session/effective-workspace' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const sessionId = url.searchParams.get('sessionId')
      if (!sessionId) {
        return createErrorResponse('INVALID_PARAMS', '缺少必需参数: sessionId', 400)
      }

      const workspaceManager = getWorkspaceManager()
      const workspacePath = await workspaceManager.getRealHomeDirectory(auth.userId)

      return createSuccessResponse({ path: workspacePath })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取工作区失败'
      return createErrorResponse('GET_WORKSPACE_FAILED', message, 500)
    }
  }

  // GET /api/agent/userdir/info - 获取用户主目录信息
  if (pathName === '/api/agent/userdir/info' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const workspaceManager = getWorkspaceManager()
      const workspace = await workspaceManager.getOrCreateUserWorkspace(auth.userId)

      return createSuccessResponse({
        workspaceId: workspace.workspaceId,
        userId: workspace.userId,
        path: workspace.path,
        virtualPath: '~/home',
        createdAt: workspace.createdAt,
        lastModifiedAt: workspace.lastModifiedAt,
        skillsCount: workspace.installedSkills.length,
        hasConfig: Object.keys(workspace.config).length > 0
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取用户目录失败'
      return createErrorResponse('GET_INFO_FAILED', message, 500)
    }
  }

  // GET /api/agent/userdir/list - 获取用户主目录内容
  if (pathName === '/api/agent/userdir/list' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const workspaceManager = getWorkspaceManager()
      const workspace = await workspaceManager.getOrCreateUserWorkspace(auth.userId)
      const items = await readDirectory(workspace.path, workspace.path)

      return createSuccessResponse({
        items,
        path: '/',
        userId: auth.userId,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取目录列表失败'
      return createErrorResponse('LIST_FAILED', message, 500)
    }
  }

  // GET /api/agent/userdir/content - 获取用户主目录文件内容
  if (pathName === '/api/agent/userdir/content' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const filePath = url.searchParams.get('path')
      if (!filePath) {
        return createErrorResponse('INVALID_PARAMS', '缺少必需参数: path', 400)
      }

      const workspaceManager = getWorkspaceManager()
      const workspace = await workspaceManager.getOrCreateUserWorkspace(auth.userId)
      const fullPath = `${workspace.path}${filePath.startsWith('/') ? filePath : '/' + filePath}`

      if (!fullPath.startsWith(workspace.path)) {
        return createErrorResponse('FORBIDDEN', '禁止访问工作区外的文件', 403)
      }

      const fs = await import('fs/promises')
      const stat = await fs.stat(fullPath)

      if (!stat.isFile()) {
        return createErrorResponse('NOT_FILE', '目标不是文件', 400)
      }

      const MAX_FILE_SIZE = 10 * 1024 * 1024
      if (stat.size > MAX_FILE_SIZE) {
        return createErrorResponse('FILE_TOO_LARGE', '文件过大，超过 10MB 限制', 400)
      }

      const content = await fs.readFile(fullPath, 'utf-8')
      const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
      const language = detectLanguage(ext)

      return createSuccessResponse({
        content,
        language,
        size: stat.size,
        lastModified: stat.mtime.toISOString(),
        path: filePath
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取文件内容失败'
      if (message.includes('ENOENT') || message.includes('not found')) {
        return createErrorResponse('FILE_NOT_FOUND', '文件不存在', 404)
      }
      return createErrorResponse('READ_FAILED', message, 500)
    }
  }

  // POST /api/agent/userdir/save - 保存用户主目录文件
  if (pathName === '/api/agent/userdir/save' && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const body = await req.json() as { filePath: string; content: string }
      if (!body.filePath || body.content === undefined) {
        return createErrorResponse('INVALID_PARAMS', '缺少必需参数: filePath, content', 400)
      }

      const workspaceManager = getWorkspaceManager()
      const workspace = await workspaceManager.getOrCreateUserWorkspace(auth.userId)
      const fullPath = `${workspace.path}${body.filePath.startsWith('/') ? body.filePath : '/' + body.filePath}`

      if (!fullPath.startsWith(workspace.path)) {
        return createErrorResponse('FORBIDDEN', '禁止访问工作区外的文件', 403)
      }

      const fs = await import('fs/promises')
      const dir = path.dirname(fullPath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(fullPath, body.content, 'utf-8')

      return createSuccessResponse({
        success: true,
        path: body.filePath,
        message: '文件保存成功'
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存文件失败'
      return createErrorResponse('SAVE_FAILED', message, 500)
    }
  }

  // GET /api/agent/userdir/skills - 获取用户已安装的 skills
  if (pathName === '/api/agent/userdir/skills' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const workspaceManager = getWorkspaceManager()
      const skills = await workspaceManager.listUserSkills(auth.userId)

      return createSuccessResponse({ skills, count: skills.length })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取 skills 失败'
      return createErrorResponse('GET_SKILLS_FAILED', message, 500)
    }
  }

  // POST /api/agent/userdir/skills/install - 安装 skill
  if (pathName === '/api/agent/userdir/skills/install' && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const body = await req.json() as { skillId: string; name: string; version?: string; data: unknown }
      if (!body.skillId || !body.name || !body.data) {
        return createErrorResponse('INVALID_PARAMS', '缺少必需参数: skillId, name, data', 400)
      }

      const workspaceManager = getWorkspaceManager()
      const result = await workspaceManager.installSkill(
        auth.userId,
        body.skillId,
        body.data,
        body.name,
        body.version || '1.0.0'
      )

      if (!result.success) {
        return createErrorResponse('INSTALL_FAILED', result.error || '安装失败', 500)
      }

      return createSuccessResponse({
        success: true,
        skillId: body.skillId,
        path: result.path,
        message: `Skill "${body.name}" 安装成功`
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '安装 skill 失败'
      return createErrorResponse('INSTALL_FAILED', message, 500)
    }
  }

  // DELETE /api/agent/userdir/skills/:skillId - 卸载 skill
  const skillDeleteMatch = pathName.match(/^\/api\/agent\/userdir\/skills\/([^/]+)$/)
  if (skillDeleteMatch && method === 'DELETE') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const skillId = skillDeleteMatch[1]
      if (!skillId) {
        return createErrorResponse('INVALID_PARAMS', '缺少 skillId', 400)
      }

      const workspaceManager = getWorkspaceManager()
      const success = await workspaceManager.uninstallSkill(auth.userId, skillId)

      if (!success) {
        return createErrorResponse('NOT_FOUND', 'Skill 不存在或卸载失败', 404)
      }

      return createSuccessResponse({ success: true, skillId, message: `Skill "${skillId}" 已卸载` })
    } catch (error) {
      const message = error instanceof Error ? error.message : '卸载 skill 失败'
      return createErrorResponse('UNINSTALL_FAILED', message, 500)
    }
  }

  // GET /api/agent/userdir/skills/:skillId - 获取 skill 内容
  const skillGetMatch = pathName.match(/^\/api\/agent\/userdir\/skills\/([^/]+)$/)
  if (skillGetMatch && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const skillId = skillGetMatch[1]
      if (!skillId) {
        return createErrorResponse('INVALID_PARAMS', '缺少 skillId', 400)
      }

      const workspaceManager = getWorkspaceManager()
      const workspace = await workspaceManager.getOrCreateUserWorkspace(auth.userId)
      const skillPath = path.join(workspace.path, 'skills', `${skillId}.json`)

      const fs = await import('fs/promises')
      if (!fs.existsSync(skillPath)) {
        return createErrorResponse('NOT_FOUND', 'Skill 不存在', 404)
      }

      const skillData = JSON.parse(await fs.readFile(skillPath, 'utf-8'))

      return createSuccessResponse({ skillId, data: skillData })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取 skill 失败'
      return createErrorResponse('GET_SKILL_FAILED', message, 500)
    }
  }

  return null
}

export default handleAgentWorkdirRoutes