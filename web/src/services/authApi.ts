const API_BASE_URL = 'http://localhost:3000'

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

interface LoginResponse {
  accessToken: string
  tokenType: string
  userId: string
  username: string
  email: string
  isAdmin: boolean
  avatar?: string
}

interface RegisterRequest {
  email: string
  username: string
  password: string
  code: string
}

interface LoginRequest {
  email: string
  password: string
}

interface ResetPasswordRequest {
  email: string
  code: string
  newPassword: string
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    return await response.json()
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : '网络请求失败',
      },
    }
  }
}

export const authApi = {
  async sendRegisterCode(email: string): Promise<ApiResponse<{ message: string }>> {
    return request('/api/auth/register/send-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  async register(data: RegisterRequest): Promise<ApiResponse<LoginResponse>> {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async login(data: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async sendForgotPasswordCode(email: string): Promise<ApiResponse<{ message: string }>> {
    return request('/api/auth/forgot-password/send-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  async resetPassword(data: ResetPasswordRequest): Promise<ApiResponse<{ message: string }>> {
    return request('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async getCurrentUser(token: string): Promise<ApiResponse<LoginResponse>> {
    return request('/api/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  },
}

export type { LoginResponse, RegisterRequest, LoginRequest, ResetPasswordRequest }
