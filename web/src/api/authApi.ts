/**
 * 认证相关 API 接口
 */

import apiClient from './client'
import { unwrapApiData } from './unwrapApiResponse'
import type {
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  AuthResponse,
  User,
} from '@/types'

export interface SendCodeResponse {
  message: string
}

export const authApi = {
  /**
   * 发送注册验证码
   */
  async sendRegisterCode(email: string): Promise<SendCodeResponse> {
    const response = await apiClient.post<SendCodeResponse>('/auth/register/send-code', { email })
    return unwrapApiData(response.data)
  },

  /**
   * 用户注册
   */
  async register(request: RegisterRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', request)
    const data = unwrapApiData(response.data)
    if (data.accessToken) {
      localStorage.setItem('token', data.accessToken)
    }
    return data
  },

  /**
   * 用户登录
   */
  async login(request: LoginRequest): Promise<AuthResponse> {
    console.log('[authApi] 发送登录请求:', request)
    const response = await apiClient.post<AuthResponse>('/auth/login', request)
    console.log('[authApi] 收到登录响应:', response)
    const data = unwrapApiData(response.data)
    if (data.accessToken) {
      localStorage.setItem('token', data.accessToken)
    }
    return data
  },

  /**
   * 发送忘记密码验证码
   */
  async sendForgotPasswordCode(email: string): Promise<SendCodeResponse> {
    const response = await apiClient.post<SendCodeResponse>('/auth/forgot-password/send-code', { email })
    return unwrapApiData(response.data)
  },

  /**
   * 重置密码
   */
  async resetPassword(request: ResetPasswordRequest): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>('/auth/forgot-password', request)
    return unwrapApiData(response.data)
  },

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>('/auth/me')
    return unwrapApiData(response.data)
  },

  /**
   * 退出登录
   */
  logout(): void {
    localStorage.removeItem('token')
    window.location.href = '/login'
  },
}
