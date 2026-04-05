/**
 * HTTP API 客户端
 * 封装 axios 实例，提供统一的请求/响应处理
 */

import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import type { ApiResponse } from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

class ApiClient {
  private instance: AxiosInstance
  private retryCount = 0
  private maxRetries = 3

  constructor() {
    this.instance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    this.setupInterceptors()
  }

  /**
   * 设置请求和响应拦截器
   */
  private setupInterceptors(): void {
    this.instance.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token')
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => {
        return Promise.reject(error)
      }
    )

    this.instance.interceptors.response.use(
      (response: AxiosResponse<ApiResponse>) => {
        if (response.data?.success === false) {
          const error = new Error(response.data.error?.message || '请求失败') as Error & { code?: string }
          error.code = response.data.error?.code
          return Promise.reject(error)
        }
        return response.data
      },
      async (error) => {
        const originalRequest = error.config

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true
          localStorage.removeItem('token')
          window.location.href = '/login'
          return Promise.reject(error)
        }

        if (this.shouldRetry(error) && this.retryCount < this.maxRetries) {
          this.retryCount++
          await this.delay(1000 * this.retryCount)
          return this.instance(originalRequest)
        }

        return Promise.reject(this.normalizeError(error))
      }
    )
  }

  /**
   * 判断是否应该重试请求
   */
  private shouldRetry(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    const err = error as { response?: { status?: number }; code?: string }
    const isNetworkError = !err.response
    const isServerError = (err.response?.status ?? 0) >= 500
    const isRateLimit = err.code === 'ECONNABORTED'
    return isNetworkError || isServerError || isRateLimit
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 标准化错误信息
   */
  private normalizeError(error: unknown): Error {
    if (error instanceof Error) return error
    return new Error('未知错误')
  }

  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    this.retryCount = 0
    return this.instance.get(url, config)
  }

  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    this.retryCount = 0
    return this.instance.post(url, data, config)
  }

  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    this.retryCount = 0
    return this.instance.put(url, data, config)
  }

  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    this.retryCount = 0
    return this.instance.delete(url, config)
  }

  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    this.retryCount = 0
    return this.instance.patch(url, data, config)
  }

  getInstance(): AxiosInstance {
    return this.instance
  }
}

export const apiClient = new ApiClient()
export default apiClient
