/**
 * 会话管理 API 接口
 */

import apiClient from './client'
import type {
  Session,
  SessionListItem,
  CreateSessionRequest,
  SessionWithMessages,
} from '@/types'

export const sessionApi = {
  /**
   * 创建新会话
   */
  async createSession(request?: CreateSessionRequest): Promise<Session> {
    const { data } = await apiClient.post<Session>('/sessions', request)
    return data
  },

  /**
   * 获取会话列表
   */
  async listSessions(): Promise<SessionListItem[]> {
    const { data } = await apiClient.get<SessionListItem[]>('/sessions')
    return data
  },

  /**
   * 加载会话详情（包含消息）
   */
  async loadSession(sessionId: string): Promise<SessionWithMessages> {
    const { data } = await apiClient.get<SessionWithMessages>(`/sessions/${sessionId}`)
    return data
  },

  /**
   * 更新会话信息
   */
  async updateSession(sessionId: string, updates: Partial<Pick<Session, 'title' | 'model' | 'isPinned'>>): Promise<Session> {
    const { data } = await apiClient.put<Session>(`/sessions/${sessionId}`, updates)
    return data
  },

  /**
   * 重命名会话
   */
  async renameSession(sessionId: string, title: string): Promise<void> {
    await apiClient.put(`/sessions/${sessionId}/rename`, { title })
  },

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    await apiClient.delete(`/sessions/${sessionId}`)
  },

  /**
   * 清空会话消息
   */
  async clearSession(sessionId: string): Promise<void> {
    await apiClient.post(`/sessions/${sessionId}/clear`)
  },

  /**
   * 导出会话
   */
  async exportSession(sessionId: string, format: 'json' | 'markdown' | 'txt' = 'json'): Promise<Blob> {
    const { data } = await apiClient.get(`/sessions/${sessionId}/export`, {
      params: { format },
      responseType: 'blob',
    })
    return data
  },
}
