/**
 * 模型相关 API 接口
 */

import apiClient from './client'

export interface Model {
  id: string
  name: string
  provider: string
  description: string
}

export const modelApi = {
  /**
   * 获取所有可用模型列表
   */
  async listModels(): Promise<Model[]> {
    const res = await apiClient.get<{ models: Model[] }>('/models')
    const body = res.data as { success?: boolean; data?: { models: Model[] }; models?: Model[] }
    if (body?.success === false) return []
    return (body?.data?.models ?? body?.models) ?? []
  },

  /**
   * 获取默认模型
   */
  async getDefaultModel(): Promise<Model> {
    const models = await this.listModels()
    return models[0] || { id: 'qwen-plus', name: '通义千问 Plus', provider: 'aliyun', description: '' }
  },

  /**
   * 按提供商获取模型
   */
  async getModelsByProvider(provider: string): Promise<Model[]> {
    const models = await this.listModels()
    return models.filter((model) => model.provider === provider)
  },
}
