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

export async function exportAsMarkdown(options: ExportOptions): Promise<Blob> {
  const response = await apiClient.post('/api/export/markdown', options, {
    responseType: 'blob',
  })
  return response.data
}

export async function exportAsHtml(options: ExportOptions): Promise<Blob> {
  const response = await apiClient.post('/api/export/html', options, {
    responseType: 'blob',
  })
  return response.data
}

export async function exportAsJson(options: ExportOptions): Promise<Blob> {
  const response = await apiClient.post('/api/export/json', options, {
    responseType: 'blob',
  })
  return response.data
}

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

export async function deleteShare(shareId: string): Promise<void> {
  await apiClient.delete(`/api/share/${shareId}`)
}

export async function getUserShares(): Promise<SharedSession[]> {
  const response = await apiClient.get('/api/share/user/list')
  return response.data.data.shares
}

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

const exportApi = {
  exportAsMarkdown,
  exportAsHtml,
  exportAsJson,
  createShare,
  getSharedSession,
  deleteShare,
  getUserShares,
  downloadBlob,
}

export default exportApi
