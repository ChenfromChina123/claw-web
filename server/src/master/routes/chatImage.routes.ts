/**
 * 聊天图片路由 - 处理聊天中图片的上传和获取
 */

import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'
import { imageStorageService } from '../services/imageStorageService'

/**
 * 处理聊天图片相关的 HTTP 请求
 */
export async function handleChatImageRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const pathName = url.pathname
  const method = req.method

  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  // POST /api/chat/images/upload - 上传聊天图片
  const uploadMatch = pathName.match(/^\/api\/chat\/images\/upload$/)
  if (uploadMatch && method === 'POST') {
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
      const sessionId = formData.get('sessionId') as string | null

      if (!file) {
        return createErrorResponse('NO_FILE', '未找到上传的图片', 400)
      }

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const result = await imageStorageService.saveImage({
        userId: auth.userId,
        sessionId: sessionId || undefined,
        fileBuffer: buffer,
        originalName: file.name,
        mimeType: file.type || 'image/png',
      })

      return createSuccessResponse(result)
    } catch (error: any) {
      console.error('[ChatImageRoutes] 上传图片失败:', error)
      return createErrorResponse('UPLOAD_FAILED', error.message || '图片上传失败', 400)
    }
  }

  // GET /api/chat/images/:imageId - 获取图片
  const getImageMatch = pathName.match(/^\/api\/chat\/images\/([^\/]+)$/)
  if (getImageMatch && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const imageId = getImageMatch[1]
      const imageBuffer = await imageStorageService.getImageBuffer(imageId)

      if (!imageBuffer) {
        return createErrorResponse('NOT_FOUND', '图片不存在', 404)
      }

      const imageMeta = await imageStorageService.getImage(imageId)
      const mimeType = imageMeta?.mimeType || 'image/png'

      return new Response(imageBuffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch (error: any) {
      console.error('[ChatImageRoutes] 获取图片失败:', error)
      return createErrorResponse('FETCH_FAILED', error.message || '获取图片失败', 500)
    }
  }

  // DELETE /api/chat/images/:imageId - 删除图片
  const deleteImageMatch = pathName.match(/^\/api\/chat\/images\/([^\/]+)$/)
  if (deleteImageMatch && method === 'DELETE') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '用户未登录', 401)
      }

      const imageId = deleteImageMatch[1]
      await imageStorageService.deleteImage(imageId)

      return createSuccessResponse({ deleted: true })
    } catch (error: any) {
      console.error('[ChatImageRoutes] 删除图片失败:', error)
      return createErrorResponse('DELETE_FAILED', error.message || '删除图片失败', 500)
    }
  }

  return null
}

export default handleChatImageRoutes
