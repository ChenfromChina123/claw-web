/**
 * 提示词模板路由 - 处理提示词模板管理相关 API
 */

import { promptTemplateRepository } from '../db/repositories/promptTemplateRepository'
import { createSuccessResponse, createErrorResponse, createCorsPreflightResponse } from '../utils/response'
import { authMiddleware } from '../utils/auth'

/**
 * 处理提示词模板相关的 HTTP 请求
 */
export async function handlePromptTemplateRoutes(req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  // CORS 预检请求
  if (method === 'OPTIONS') {
    return createCorsPreflightResponse()
  }

  // ==================== 分类管理 ====================

  // GET /api/prompt-templates/categories - 获取所有分类
  if (path === '/api/prompt-templates/categories' && method === 'GET') {
    try {
      const categories = await promptTemplateRepository.getAllCategories()
      return createSuccessResponse({ categories })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取分类列表失败'
      return createErrorResponse('GET_CATEGORIES_FAILED', message, 500)
    }
  }

  // POST /api/prompt-templates/categories - 创建分类
  if (path === '/api/prompt-templates/categories' && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const body = await req.json() as { name: string; icon?: string; sortOrder?: number }
      if (!body.name) {
        return createErrorResponse('INVALID_PARAMS', '分类名称不能为空', 400)
      }
      const category = await promptTemplateRepository.createCategory(
        body.name,
        body.icon,
        body.sortOrder
      )
      return createSuccessResponse(category)
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建分类失败'
      return createErrorResponse('CREATE_CATEGORY_FAILED', message, 500)
    }
  }

  // PUT /api/prompt-templates/categories/:id - 更新分类
  const categoryIdMatch = path.match(/^\/api\/prompt-templates\/categories\/([^\/]+)$/)
  if (categoryIdMatch && method === 'PUT') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const categoryId = categoryIdMatch[1]
      const body = await req.json() as { name?: string; icon?: string; sortOrder?: number }
      await promptTemplateRepository.updateCategory(categoryId, body.name || '', body.icon, body.sortOrder)
      return createSuccessResponse({ message: 'Category updated' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新分类失败'
      return createErrorResponse('UPDATE_CATEGORY_FAILED', message, 500)
    }
  }

  // DELETE /api/prompt-templates/categories/:id - 删除分类
  if (categoryIdMatch && method === 'DELETE') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const categoryId = categoryIdMatch[1]
      await promptTemplateRepository.deleteCategory(categoryId)
      return createSuccessResponse({ message: 'Category deleted' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除分类失败'
      return createErrorResponse('DELETE_CATEGORY_FAILED', message, 500)
    }
  }

  // ==================== 模板管理 ====================

  // GET /api/prompt-templates - 获取用户的模板列表
  if (path === '/api/prompt-templates' && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }

      const categoryId = url.searchParams.get('categoryId')
      const keyword = url.searchParams.get('keyword')
      const favoritesOnly = url.searchParams.get('favorites') === 'true'

      let templates
      if (categoryId) {
        templates = await promptTemplateRepository.findByCategoryId(categoryId)
      } else if (keyword) {
        templates = await promptTemplateRepository.searchTemplates(auth.userId, keyword)
      } else if (favoritesOnly) {
        templates = await promptTemplateRepository.findFavorites(auth.userId)
      } else {
        templates = await promptTemplateRepository.getAllForUser(auth.userId)
      }

      return createSuccessResponse({ templates })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取模板列表失败'
      return createErrorResponse('GET_TEMPLATES_FAILED', message, 500)
    }
  }

  // POST /api/prompt-templates - 创建模板
  if (path === '/api/prompt-templates' && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const body = await req.json() as {
        title: string
        content: string
        categoryId?: string
        description?: string
        tags?: string[]
      }
      if (!body.title || !body.content) {
        return createErrorResponse('INVALID_PARAMS', '模板标题和内容不能为空', 400)
      }
      const template = await promptTemplateRepository.create({
        userId: auth.userId,
        categoryId: body.categoryId,
        title: body.title,
        content: body.content,
        description: body.description,
        tags: body.tags
      })
      return createSuccessResponse(template)
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建模板失败'
      return createErrorResponse('CREATE_TEMPLATE_FAILED', message, 500)
    }
  }

  // 匹配 /api/prompt-templates/:id
  const templateIdMatch = path.match(/^\/api\/prompt-templates\/([^\/]+)$/)

  // GET /api/prompt-templates/:id - 获取单个模板
  if (templateIdMatch && method === 'GET') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const templateId = templateIdMatch[1]
      const template = await promptTemplateRepository.findById(templateId)
      if (!template) {
        return createErrorResponse('TEMPLATE_NOT_FOUND', '模板不存在', 404)
      }
      return createSuccessResponse({ template })
    } catch (error) {
      const message = error instanceof Error ? error.message : '获取模板失败'
      return createErrorResponse('GET_TEMPLATE_FAILED', message, 500)
    }
  }

  // PUT /api/prompt-templates/:id - 更新模板
  if (templateIdMatch && method === 'PUT') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const templateId = templateIdMatch[1]
      const body = await req.json() as {
        title?: string
        content?: string
        description?: string
        categoryId?: string
        tags?: string[]
      }
      await promptTemplateRepository.update(templateId, body)
      return createSuccessResponse({ message: 'Template updated' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新模板失败'
      return createErrorResponse('UPDATE_TEMPLATE_FAILED', message, 500)
    }
  }

  // DELETE /api/prompt-templates/:id - 删除模板
  if (templateIdMatch && method === 'DELETE') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const templateId = templateIdMatch[1]
      await promptTemplateRepository.delete(templateId)
      return createSuccessResponse({ message: 'Template deleted' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除模板失败'
      return createErrorResponse('DELETE_TEMPLATE_FAILED', message, 500)
    }
  }

  // POST /api/prompt-templates/:id/favorite - 切换收藏状态
  const favoriteMatch = path.match(/^\/api\/prompt-templates\/([^\/]+)\/favorite$/)
  if (favoriteMatch && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const templateId = favoriteMatch[1]
      const body = await req.json() as { isFavorite: boolean }
      await promptTemplateRepository.toggleFavorite(templateId, body.isFavorite)
      return createSuccessResponse({ message: 'Favorite toggled' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '切换收藏状态失败'
      return createErrorResponse('TOGGLE_FAVORITE_FAILED', message, 500)
    }
  }

  // POST /api/prompt-templates/:id/use - 使用模板（增加使用次数）
  const useMatch = path.match(/^\/api\/prompt-templates\/([^\/]+)\/use$/)
  if (useMatch && method === 'POST') {
    try {
      const auth = await authMiddleware(req)
      if (!auth.userId) {
        return createErrorResponse('UNAUTHORIZED', '请先登录', 401)
      }
      const templateId = useMatch[1]
      await promptTemplateRepository.incrementUseCount(templateId)
      return createSuccessResponse({ message: 'Use count incremented' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新使用次数失败'
      return createErrorResponse('INCREMENT_USE_COUNT_FAILED', message, 500)
    }
  }

  // 不匹配任何路由，返回 null
  return null
}

export default handlePromptTemplateRoutes
