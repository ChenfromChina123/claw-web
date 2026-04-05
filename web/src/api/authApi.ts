/**
 * 认证相关 API 接口
 */

import apiClient from './client'
import type {
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  AuthResponse,
  User,
  ApiResponse,
} from '@/types'

export interface SendCodeResponse {
  message: string
}

export const authApi = {
  /**
   * 发送注册验证码
   */
  async sendRegisterCode(email: string): Promise<ApiResponse<SendCodeResponse>> {
    const data = await apiClient.post<ApiResponse<SendCodeResponse>>('/auth/register/send-code', { email })
    return data
  },

  /**
   * 用户注册
   */
  async register(request: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
    const data = await apiClient.post<ApiResponse<AuthResponse>>('/auth/register', request)
    return data
  },

  /**
   * 用户登录
   */
  async login(request: LoginRequest): Promise<ApiResponse<AuthResponse>> {
    console.log('[authApi] 发送登录请求:', request)
    const data = await apiClient.post<ApiResponse<AuthResponse>>('/auth/login', request)
    console.log('[authApi] 收到登录响应:', data)
    if (data.data?.accessToken) {
      localStorage.setItem('token', data.data.accessToken)
    }
    return data
  },

  /**
   * 发送忘记密码验证码
   */
  async sendForgotPasswordCode(email: string): Promise<ApiResponse<SendCodeResponse>> {
    const data = await apiClient.post<ApiResponse<SendCodeResponse>>('/auth/forgot-password/send-code', { email })
    return data
  },

  /**
   * 重置密码
   */
  async resetPassword(request: ResetPasswordRequest): Promise<ApiResponse<{ message: string }>> {
    const data = await apiClient.post<ApiResponse<{ message: string }>>('/auth/forgot-password', request)
    return data
  },

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(): Promise<ApiResponse<User>> {
    const data = await apiClient.get<ApiResponse<User>>('/auth/me')
    return data
  },

  /**
   * 退出登录
   */
  logout(): void {
    localStorage.removeItem('token')
    window.location.href = '/login'
  },
}
