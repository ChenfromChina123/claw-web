import api from './client'
import type { ApiResponse, LoginRequest, RegisterRequest, User, Model, Tool } from '@/types'

// 认证 API
export const authApi = {
  // 发送注册验证码
  sendRegisterCode: (email: string) => {
    return api.post<ApiResponse<{ message: string }>>('/auth/register/send-code', { email })
  },
  
  // 注册
  register: (data: RegisterRequest) => {
    return api.post<ApiResponse<{ message: string }>>('/auth/register', data)
  },
  
  // 登录
  login: (data: LoginRequest) => {
    return api.post<ApiResponse<{ accessToken: string; userId: string; username: string; email: string; avatar: string }>>('/auth/login', data)
  },
  
  // 发送重置密码验证码
  sendForgotPasswordCode: (email: string) => {
    return api.post<ApiResponse<{ message: string }>>('/auth/forgot-password/send-code', { email })
  },
  
  // 重置密码
  resetPassword: (data: { email: string; code: string; newPassword: string }) => {
    return api.post<ApiResponse<{ message: string }>>('/auth/forgot-password', data)
  },
  
  // 获取当前用户
  getMe: () => {
    return api.get<ApiResponse<User>>('/auth/me')
  }
}

// 模型 API
export const modelApi = {
  // 获取可用模型
  getModels: () => {
    return api.get<ApiResponse<{ models: Model[] }>>('/models')
  }
}

// 工具 API
export const toolApi = {
  // 获取可用工具
  getTools: () => {
    return api.get<ApiResponse<{ tools: Tool[] }>>('/tools')
  }
}

// 健康检查
export const healthApi = {
  check: () => {
    return api.get<ApiResponse<{ status: string; timestamp: string }>>('/health')
  }
}
