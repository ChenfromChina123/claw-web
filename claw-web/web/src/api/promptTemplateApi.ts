import apiClient from './client'

export interface PromptTemplate {
  id: string
  userId: string | null
  categoryId: string | null
  title: string
  content: string
  description: string | null
  isBuiltin: boolean
  isFavorite: boolean
  useCount: number
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface PromptTemplateCategory {
  id: string
  name: string
  icon: string
  sortOrder: number
  createdAt: string
}

export const promptTemplateApi = {
  /**
   * 获取所有分类
   */
  async getCategories(): Promise<PromptTemplateCategory[]> {
    const { data } = await apiClient.get<{ categories: PromptTemplateCategory[] }>('/prompt-templates/categories')
    return data.categories
  },

  /**
   * 创建分类
   */
  async createCategory(name: string, icon?: string, sortOrder?: number): Promise<PromptTemplateCategory> {
    const { data } = await apiClient.post<PromptTemplateCategory>('/prompt-templates/categories', {
      name,
      icon,
      sortOrder
    })
    return data
  },

  /**
   * 更新分类
   */
  async updateCategory(id: string, updates: { name?: string; icon?: string; sortOrder?: number }): Promise<void> {
    await apiClient.put(`/prompt-templates/categories/${id}`, updates)
  },

  /**
   * 删除分类
   */
  async deleteCategory(id: string): Promise<void> {
    await apiClient.delete(`/prompt-templates/categories/${id}`)
  },

  /**
   * 获取模板列表
   */
  async getTemplates(options?: {
    categoryId?: string
    keyword?: string
    favorites?: boolean
  }): Promise<PromptTemplate[]> {
    const params = new URLSearchParams()
    if (options?.categoryId) params.append('categoryId', options.categoryId)
    if (options?.keyword) params.append('keyword', options.keyword)
    if (options?.favorites) params.append('favorites', 'true')

    const { data } = await apiClient.get<{ templates: PromptTemplate[] }>(
      `/prompt-templates${params.toString() ? `?${params.toString()}` : ''}`
    )
    return data.templates
  },

  /**
   * 获取单个模板
   */
  async getTemplate(id: string): Promise<PromptTemplate> {
    const { data } = await apiClient.get<{ template: PromptTemplate }>(`/prompt-templates/${id}`)
    return data.template
  },

  /**
   * 创建模板
   */
  async createTemplate(request: {
    title: string
    content: string
    categoryId?: string
    description?: string
    tags?: string[]
  }): Promise<PromptTemplate> {
    const { data } = await apiClient.post<PromptTemplate>('/prompt-templates', request)
    return data
  },

  /**
   * 更新模板
   */
  async updateTemplate(id: string, updates: {
    title?: string
    content?: string
    description?: string
    categoryId?: string
    tags?: string[]
  }): Promise<void> {
    await apiClient.put(`/prompt-templates/${id}`, updates)
  },

  /**
   * 删除模板
   */
  async deleteTemplate(id: string): Promise<void> {
    await apiClient.delete(`/prompt-templates/${id}`)
  },

  /**
   * 切换收藏状态
   */
  async toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
    await apiClient.post(`/prompt-templates/${id}/favorite`, { isFavorite })
  },

  /**
   * 使用模板（增加使用次数）
   */
  async useTemplate(id: string): Promise<void> {
    await apiClient.post(`/prompt-templates/${id}/use`)
  },
}
