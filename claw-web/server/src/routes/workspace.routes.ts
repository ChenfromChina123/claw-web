/**
 * 工作区路由 - 处理工作区相关 API
 */

import * as path from 'path'
import { existsSync } from 'fs'
import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'
import { getWorkspaceManager } from '../services/workspaceManager'
import { readDirectory, getMimeType, detectLanguage, resolveWorkdirFullPath, measureWorkspaceFolder } from '../utils/workdir'

/**
 * 处理工作区相关的 HTTP 请求
 */
export async function handleWorkspaceRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const pathName = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  // ==================== 工作区上传 ====================

  // POST /api/workspace/:sessionId/upload - 上传文件到工作区
  const workspaceUploadMatch = pathName.match(/^\/api\/workspace\/([^\/]+)\/upload$/)
  if (workspaceUploadMatch && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const contentType = req.headers.get('content-type') || ''
      if (!contentType.includes('multipart/form-data')) {
        return createErrorResponse('INVALID_CONTENT_TYPE', '需要 multipart/form-data 格式', 400)
      }

      const formData = await req.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return createErrorResponse('NO_FILE', '未找到上传的文件', 400)
      }

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const wm = getWorkspaceManager()
      const result = await wm.uploadFileToUserWorkspace(
        auth.userId,
        buffer,
        file.name,
        file.type || 'application/octet-stream'
      )

      if (!result.success) {
        return createErrorResponse('UPLOAD_FAILED', result.error || '文件上传失败', 400)
      }

      return createSuccessResponse({
        success: true,
        fileId: result.fileId,
        filename: result.filename,
        originalName: result.originalName,
        path: result.path,
        size: result.size,
        message: '文件上传成功'
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件上传失败'
      return createErrorResponse('UPLOAD_ERROR', message, 500)
    }
  }

  // ==================== 工作区文件列表 ====================

  // GET /api/workspace/:sessionId/files - 获取工作区文件列表
  const workspaceFilesMatch = pathName.match(/^\/api\/workspace\/([^\/]+)\/files$/)
  if (workspaceFilesMatch && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const wm = getWorkspaceManager()
      const userWs = await wm.getOrCreateUserWorkspace(auth.userId)
      const fs2 = await import('fs/promises')
      const uploadsDir = path.join(userWs.path, 'uploads')
      let files: any[] = []
      if (existsSync(uploadsDir)) {
        const collectFiles = async (dir: string, baseDir: string): Promise<any[]> => {
          const entries = await fs2.readdir(dir, { withFileTypes: true })
          const result: any[] = []
          for (const e of entries) {
            const fullPath = path.join(dir, e.name)
            const relativePath = path.relative(baseDir, fullPath)
            if (e.isFile()) {
              const fstat = await fs2.stat(fullPath)
              result.push({
                name: e.name,
                path: relativePath,
                size: fstat.size,
                lastModified: fstat.mtime.toISOString()
              })
            } else if (e.isDirectory()) {
              const subFiles = await collectFiles(fullPath, baseDir)
              result.push(...subFiles)
            }
          }
          return result
        }
        files = await collectFiles(uploadsDir, uploadsDir)
      }

      return createSuccessResponse({ files, count: files.length })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取文件列表失败'
      return createErrorResponse('LIST_FILES_FAILED', message, 500)
    }
  }

  // ==================== 删除工作区文件 ====================

  // DELETE /api/workspace/:sessionId/files/:filename - 删除工作区中的文件
  const workspaceDeleteMatch = pathName.match(/^\/api\/workspace\/([^\/]+)\/files\/([^\/]+)$/)
  if (workspaceDeleteMatch && method === 'DELETE') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const filename = decodeURIComponent(workspaceDeleteMatch[2])
      const wm = getWorkspaceManager()
      const userWs = await wm.getOrCreateUserWorkspace(auth.userId)
      const fs2 = await import('fs/promises')
      const filePath = path.join(userWs.path, 'uploads', filename)

      if (!filePath.startsWith(userWs.path)) {
        return createErrorResponse('FORBIDDEN', '禁止访问工作区外的文件', 403)
      }

      if (existsSync(filePath)) {
        await fs2.unlink(filePath)
      }

      return createSuccessResponse({ success: true, message: '文件删除成功' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件删除失败'
      return createErrorResponse('DELETE_ERROR', message, 500)
    }
  }

  // ==================== 工作区信息 ====================

  // GET /api/workspace/:sessionId - 获取工作区信息
  const workspaceInfoMatch = pathName.match(/^\/api\/workspace\/([^\/]+)$/i)
  if (workspaceInfoMatch && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const wm = getWorkspaceManager()
      const workspace = await wm.getOrCreateUserWorkspace(auth.userId)

      return createSuccessResponse({ workspace })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取工作区信息失败'
      return createErrorResponse('WORKSPACE_INFO_ERROR', message, 500)
    }
  }

  // ==================== 清空工作区 ====================

  // DELETE /api/workspace/:sessionId - 清空工作区
  if (workspaceInfoMatch && method === 'DELETE') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const wm = getWorkspaceManager()
      const userWs = await wm.getOrCreateUserWorkspace(auth.userId)
      const fs2 = await import('fs/promises')
      const uploadsDir = path.join(userWs.path, 'uploads')
      if (existsSync(uploadsDir)) {
        const entries = await fs2.readdir(uploadsDir)
        await Promise.all(entries.map(f => fs2.unlink(path.join(uploadsDir, f))))
      }
      return createSuccessResponse({ success: true, message: '工作区已清空' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '清空工作区失败'
      return createErrorResponse('CLEAR_ERROR', message, 500)
    }
  }

  return null
}

export default handleWorkspaceRoutes