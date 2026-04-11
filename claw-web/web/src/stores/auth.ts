import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types'
import { authApi } from '@/api'
import { checkLoginStatus, getCurrentUserFromToken } from '@/services/authService'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  /** 刷新页面后从 JWT 恢复基础资料，避免「已登录但设置页显示未登录」 */
  const user = ref<User | null>(getCurrentUserFromToken())
  const loading = ref(false)

  const isLoggedIn = computed(() => {
    const currentToken = token.value || localStorage.getItem('token')
    return currentToken ? checkLoginStatus() : false
  })

  async function login(email: string, password: string) {
    loading.value = true
    try {
      console.log('[AuthStore] 开始登录请求...')
      const response = await authApi.login({ email, password })
      console.log('[AuthStore] 登录响应:', response)
      
      // response 已经是 AuthResponse，直接访问属性
      if (response.accessToken) {
        console.log('[AuthStore] 登录成功，保存用户信息')
        token.value = response.accessToken
        user.value = {
          id: response.userId,
          username: response.username,
          email: response.email,
          avatar: response.avatar,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        localStorage.setItem('token', response.accessToken)
        return true
      }
      console.log('[AuthStore] 登录失败: 没有 accessToken')
      return false
    } catch (error) {
      console.error('[AuthStore] 登录异常:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  async function register(email: string, username: string, password: string, code: string) {
    loading.value = true
    try {
      const response = await authApi.register({ email, username, password, code })
      if (response.accessToken) {
        return true
      }
      return false
    } catch (error) {
      console.error('Register failed:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  async function sendRegisterCode(email: string) {
    try {
      const response = await authApi.sendRegisterCode(email)
      if (response.message) {
        return true
      }
      return false
    } catch (error) {
      console.error('Send code failed:', error)
      return false
    }
  }

  async function sendForgotPasswordCode(email: string) {
    try {
      const response = await authApi.sendForgotPasswordCode(email)
      if (response.message) {
        return true
      }
      return false
    } catch (error) {
      console.error('Send forgot password code failed:', error)
      return false
    }
  }

  async function resetPassword(email: string, code: string, newPassword: string) {
    try {
      const response = await authApi.resetPassword({ email, code, newPassword })
      if (response.message) {
        return true
      }
      return false
    } catch (error) {
      console.error('Reset password failed:', error)
      return false
    }
  }

  async function fetchUser() {
    const t = token.value || localStorage.getItem('token')
    if (!t || !checkLoginStatus()) return
    token.value = t
    try {
      const response = await authApi.getCurrentUser()
      if (response.id) {
        user.value = response
      }
    } catch (error) {
      console.error('Fetch user failed:', error)
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 401) {
        logout()
      }
    }
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
  }

  /** 与 localStorage 中的 token 同步 user（例如其它标签页改动了 token） */
  function syncUserFromToken() {
    const t = localStorage.getItem('token')
    token.value = t
    user.value = getCurrentUserFromToken()
  }

  /**
   * 处理OAuth登录回调
   * @param oauthData OAuth返回的数据
   */
  function handleOAuthLogin(oauthData: {
    accessToken: string
    userId: string
    username: string
    email: string
    avatar?: string
  }): void {
    token.value = oauthData.accessToken
    user.value = {
      id: oauthData.userId,
      username: oauthData.username,
      email: oauthData.email,
      avatar: oauthData.avatar || '/avatars/default.png',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    localStorage.setItem('token', oauthData.accessToken)
  }

  return {
    user,
    token,
    loading,
    isLoggedIn,
    login,
    register,
    sendRegisterCode,
    sendForgotPasswordCode,
    resetPassword,
    fetchUser,
    logout,
    handleOAuthLogin,
    syncUserFromToken,
  }
})
