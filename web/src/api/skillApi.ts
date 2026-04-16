/**
 * 技能管理 API 接口
 * 提供 REST API 调用方式，用于管理技能市场
 */

import apiClient from './client'
import { unwrapApiData } from './unwrapApiResponse'
import type { ApiResponse } from '@/types'

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

export interface SkillToggleResponse {
  success: boolean
  skill: SkillDefinition
  message: string
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

export const skillApi = {
  /**
   * 获取技能列表
   * @param category - 类别筛选（可选）
   * @param query - 搜索关键词（可选）
   */
  async listSkills(category?: string, query?: string): Promise<SkillListResponse> {
    const params: Record<string, string> = {}
    if (category) params.category = category
    if (query) params.query = query
    
    const { data } = await apiClient.get<ApiResponse<SkillListResponse>>('/skills', { params })
    return unwrapApiData(data)
  },

  /**
   * 获取技能详情
   * @param skillId - 技能 ID
   */
  async getSkill(skillId: string): Promise<SkillDefinition> {
    const { data } = await apiClient.get<ApiResponse<SkillDefinition>>(
      `/skills/${encodeURIComponent(skillId)}`
    )
    return unwrapApiData(data)
  },

  /**
   * 启用/禁用技能
   * @param skillId - 技能 ID
   * @param enabled - 是否启用
   */
  async toggleSkill(skillId: string, enabled: boolean): Promise<SkillToggleResponse> {
    const { data } = await apiClient.post<ApiResponse<SkillToggleResponse>>(
      `/skills/${encodeURIComponent(skillId)}/toggle`,
      { enabled }
    )
    return unwrapApiData(data)
  },

  /**
   * 搜索技能
   * @param query - 搜索关键词
   */
  async searchSkills(query: string): Promise<SkillListResponse> {
    const { data } = await apiClient.get<ApiResponse<SkillListResponse>>('/skills/search', {
      params: { query }
    })
    return unwrapApiData(data)
  },

  /**
   * 获取所有类别
   */
  async getCategories(): Promise<SkillCategory[]> {
    const { data } = await apiClient.get<ApiResponse<SkillCategory[]>>('/skills/categories')
    return unwrapApiData(data)
  },

  /**
   * 获取技能统计
   */
  async getStats(): Promise<{
    totalSkills: number
    enabledSkills: number
    disabledSkills: number
    byCategory: Record<string, number>
  }> {
    const { data } = await apiClient.get<ApiResponse<{
      totalSkills: number
      enabledSkills: number
      disabledSkills: number
      byCategory: Record<string, number>
    }>>('/skills/stats')
    return unwrapApiData(data)
  },

  /**
   * 从 URL 导入技能
   * @param url - 技能文件的 URL
   * @param category - 可选的分类
   */
  async importSkillFromUrl(url: string, category?: string): Promise<SkillImportResult> {
    const body: Record<string, string> = { url }
    if (category) body.category = category

    const { data } = await apiClient.post<ApiResponse<SkillImportResult>>(
      '/skills/import/url',
      body
    )
    return unwrapApiData(data)
  },

  /**
   * 从文件导入技能
   * @param file - 技能文件 (File 对象)
   */
  async importSkillFromFile(file: File): Promise<SkillImportResult> {
    const formData = new FormData()
    formData.append('file', file)

    const { data } = await apiClient.post<ApiResponse<SkillImportResult>>(
      '/skills/import/file',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    )
    return unwrapApiData(data)
  },

  /**
   * 验证技能内容
   * @param content - 技能内容或 URL
   */
  async validateSkill(content?: string, url?: string): Promise<SkillPreview> {
    const body: Record<string, string> = {}
    if (content) body.content = content
    if (url) body.url = url

    const { data } = await apiClient.post<ApiResponse<SkillPreview>>(
      '/skills/validate',
      body
    )
    return unwrapApiData(data)
  },
}

export default skillApi
