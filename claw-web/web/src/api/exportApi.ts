/**
 * 导出与分享 API
 */

import apiClient from './client'

export interface ShareInfo {
  shareId: string
  shareCode: string
  shareUrl: string
  expiresAt: string | null
  viewCount: number
}

export interface SharedSession {
  id: string
  shareCode: string
  sessionId: string
  title: string
  expiresAt: string | null
  viewCount: number
  createdAt: string
  isExpired: boolean
}

export interface ExportOptions {
  sessionId: string
  messageIds?: string[]
}

/**
 * 导出为 Markdown
 */
export async function exportAsMarkdown(options: ExportOptions): Promise<Blob> {
  const response = await apiClient.post('/api/export/markdown', options, {
    responseType: 'blob',
  })
  return response.data
}

/**
 * 导出为 HTML
 */
export async function exportAsHtml(options: ExportOptions): Promise<Blob> {
  const response = await apiClient.post('/api/export/html', options, {
    responseType: 'blob',
  })
  return response.data
}

/**
 * 导出为 JSON
 */
export async function exportAsJson(options: ExportOptions): Promise<Blob> {
  const response = await apiClient.post('/api/export/json', options, {
    responseType: 'blob',
  })
  return response.data
}

/**
 * 创建分享链接
 * @param sessionId 会话 ID
 * @param title 分享标题
 * @param expiresInHours 过期时间（小时），不提供则永不过期
 */
export async function createShare(
  sessionId: string,
  title?: string,
  expiresInHours?: number
): Promise<ShareInfo> {
  const response = await apiClient.post('/api/share', {
    sessionId,
    title,
    expiresInHours,
  })
  return response.data.data
}

/**
 * 获取分享内容（无需登录）
 */
export async function getSharedSession(shareCode: string): Promise<{
  title: string
  session: any
  messages: any[]
  viewCount: number
  createdAt: string
  expiresAt: string | null
}> {
  const response = await apiClient.get(`/api/share/${shareCode}`)
  return response.data.data
}

/**
 * 删除分享
 */
export async function deleteShare(shareId: string): Promise<void> {
  await apiClient.delete(`/api/share/${shareId}`)
}

/**
 * 获取用户的分享列表
 */
export async function getUserShares(): Promise<SharedSession[]> {
  const response = await apiClient.get('/api/share/user/list')
  return response.data.data.shares
}

/**
 * 下载 Blob 文件
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
