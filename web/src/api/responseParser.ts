/**
 * 类型安全的 API 响应解析工具
 * 
 * 提供统一的响应数据提取方法，避免硬编码的 response.data.data 访问
 * 所有 API 调用都应使用这些工具函数来解析响应
 */

import type { ApiResponse } from '@/types'

/**
 * 从 API 响应中提取数据（带类型推断）
 * 
 * @param response - Axios 响应对象
 * @returns 提取的数据（类型为 T）
 * @throws 如果响应格式不正确或 success 为 false
 * 
 * @example
 * const data = extractData<User>(response)
 * console.log(data.id) // 类型安全的访问
 */
export function extractData<T = unknown>(response: { data: ApiResponse<T> }): T {
  const apiResponse = response.data
  
  if (!apiResponse) {
    throw new Error('API 响应为空')
  }
  
  if (apiResponse.success === false) {
    const errorMessage = apiResponse.error?.message || '请求失败'
    const errorCode = apiResponse.error?.code || 'UNKNOWN_ERROR'
    const error = new Error(errorMessage) as Error & { code?: string }
    error.code = errorCode
    throw error
  }
  
  if (apiResponse.data === undefined) {
    throw new Error('API 响应中缺少 data 字段')
  }
  
  return apiResponse.data
}

/**
 * 从 API 响应中安全地提取数据（不抛出异常）
 * 
 * @param response - Axios 响应对象
 * @param fallback - 失败时的默认值
 * @returns 提取的数据或默认值
 * 
 * @example
 * const user = extractDataSafe<User>(response, null)
 * if (user) {
 *   console.log(user.username)
 * }
 */
export function extractDataSafe<T = unknown>(
  response: { data: ApiResponse<T> } | null | undefined,
  fallback: T
): T {
  if (!response?.data) {
    return fallback
  }
  
  const apiResponse = response.data
  
  if (apiResponse.success === false || apiResponse.data === undefined) {
    return fallback
  }
  
  return apiResponse.data
}

/**
 * 从 API 响应中提取错误信息
 * 
 * @param error - 错误对象
 * @returns 格式化的错误信息
 * 
 * @example
 * const errorMessage = extractErrorMessage(error)
 * message.error(errorMessage)
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // 如果是带有 code 属性的错误（从 extractData 抛出）
    const err = error as Error & { code?: string }
    if (err.code) {
      return `[${err.code}] ${err.message}`
    }
    return error.message
  }
  
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { data?: { error?: { message?: string; code?: string } } }; message?: string }
    
    // Axios 错误格式
    if (err.response?.data?.error) {
      const apiError = err.response.data.error
      const code = apiError.code ? `[${apiError.code}] ` : ''
      return `${code}${apiError.message || '未知错误'}`
    }
    
    if (err.message) {
      return err.message
    }
  }
  
  return '未知错误'
}

/**
 * 从 API 响应中提取错误码
 * 
 * @param error - 错误对象
 * @returns 错误码或 null
 */
export function extractErrorCode(error: unknown): string | null {
  if (error instanceof Error) {
    const err = error as Error & { code?: string }
    return err.code || null
  }
  
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { data?: { error?: { code?: string } } } }
    return err.response?.data?.error?.code || null
  }
  
  return null
}

/**
 * 检查 API 响应是否成功
 * 
 * @param response - Axios 响应对象
 * @returns 是否成功
 */
export function isResponseSuccessful(response: { data: ApiResponse<unknown> } | null | undefined): boolean {
  return response?.data?.success === true
}

/**
 * 类型守卫：检查值是否为 ApiResponse 格式
 * 
 * @param value - 待检查的值
 * @returns 是否为 ApiResponse 格式
 */
export function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof (value as ApiResponse<T>).success === 'boolean'
  )
}

/**
 * 分页响应数据类型
 */
export interface PaginatedData<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * 从分页 API 响应中提取数据
 * 
 * @param response - Axios 响应对象
 * @returns 分页数据
 */
export function extractPaginatedData<T = unknown>(
  response: { data: ApiResponse<PaginatedData<T>> }
): PaginatedData<T> {
  return extractData<PaginatedData<T>>(response)
}
