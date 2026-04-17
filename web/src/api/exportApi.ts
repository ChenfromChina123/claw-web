/**
 * 导出与分享 API
 */

import apiClient from './client'
import { EXPORT_ENDPOINTS } from './endpoints'

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
  const response = await apiClient.post(EXPORT_ENDPOINTS.MARKDOWN, options, {
    responseType: 'blob',
  })
  return response.data
}

export async function exportAsHtml(options: ExportOptions): Promise<Blob> {
  const response = await apiClient.post(EXPORT_ENDPOINTS.HTML, options, {
    responseType: 'blob',
  })
  return response.data
}

export async function exportAsJson(options: ExportOptions): Promise<Blob> {
  const response = await apiClient.post(EXPORT_ENDPOINTS.JSON, options, {
    responseType: 'blob',
  })
  return response.data
}

export async function createShare(
  sessionId: string,
  title?: string,
  expiresInHours?: number
): Promise<ShareInfo> {
  const response = await apiClient.post(EXPORT_ENDPOINTS.SHARE, {
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
  const response = await apiClient.get(EXPORT_ENDPOINTS.SHARE_DETAIL(shareCode))
  return response.data.data
}

export async function deleteShare(shareId: string): Promise<void> {
  await apiClient.delete(EXPORT_ENDPOINTS.SHARE_DELETE(shareId))
}

export async function getUserShares(): Promise<SharedSession[]> {
  const response = await apiClient.get(EXPORT_ENDPOINTS.SHARE_LIST)
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
