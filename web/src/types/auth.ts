/**
 * 认证相关类型定义
 */

/**
 * API 统一响应格式
 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

export interface User {
  id: string
  username: string
  email: string
  passwordHash?: string
  avatar?: string
  isActive?: boolean
  isAdmin?: boolean
  createdAt: Date | string
  updatedAt: Date | string
  lastLogin?: Date | string
}

export interface UserProfile {
  id: string
  username: string
  email: string
  avatar?: string
  bio?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  username: string
  password: string
  code: string
}

export interface AuthResponse {
  accessToken: string
  tokenType: string
  userId: string
  username: string
  email: string
  isAdmin: boolean
  avatar?: string
}

export interface ResetPasswordRequest {
  email: string
  code: string
  newPassword: string
}

export interface SendCodeRequest {
  email: string
  type: 'register' | 'forgot-password'
}

export interface AuthState {
  isAuthenticated: boolean
  user: User | null
  token: string | null
  isLoading: boolean
  error: string | null
}

export interface PasswordChangeRequest {
  currentPassword: string
  newPassword: string
}
