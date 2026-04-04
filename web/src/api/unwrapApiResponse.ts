import type { ApiResponse } from '@/types'

/**
 * 解析服务端统一封装：`{ success, data?, error? }`
 */
export function unwrapApiData<T>(body: ApiResponse<T>): T {
  if (!body.success || body.data === undefined) {
    throw new Error(body.error?.message || '请求失败')
  }
  return body.data
}
