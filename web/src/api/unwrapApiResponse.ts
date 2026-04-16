import type { ApiResponse } from '@/types'

/**
 * 解析服务端统一封装：`{ success, data?, error? }`
 * 注意：client 的响应拦截器已经解包了 response.data
 */
export function unwrapApiData<T>(body: ApiResponse<T> | T): T {
  // 如果 body 是 ApiResponse 类型（有 success 字段）
  if (body && typeof body === 'object' && 'success' in body) {
    const response = body as ApiResponse<T>
    if (!response.success || response.data === undefined) {
      throw new Error(response.error?.message || '请求失败')
    }
    return response.data
  }
  // 如果 body 已经是 data 本身（拦截器已经解包）
  return body as T
}

/**
 * 类型安全的 API 响应解包函数
 * 用于处理 axios 拦截器返回的 ApiResponse
 */
export function unwrapApiResponse<T>(response: ApiResponse<T>): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error?.message || '请求失败')
  }
  return response.data
}
