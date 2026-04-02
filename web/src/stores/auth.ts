import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types'
import { authApi } from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))
  const loading = ref(false)

  const isLoggedIn = computed(() => !!token.value)

  async function login(email: string, password: string) {
    loading.value = true
    try {
      const response = await authApi.login({ email, password })
      // response 已经是 ApiResponse<AuthResponse>，直接访问 .success 和 .data
      if (response.success && response.data) {
        token.value = response.data.accessToken
        user.value = {
          id: response.data.userId,
          username: response.data.username,
          email: response.data.email,
          avatar: response.data.avatar,
        }
        localStorage.setItem('token', response.data.accessToken)
        return true
      }
      return false
    } catch (error) {
      console.error('Login failed:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  async function register(email: string, username: string, password: string, code: string) {
    loading.value = true
    try {
      const response = await authApi.register({ email, username, password, code })
      if (response.success) {
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
      if (response.success) {
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
      if (response.success) {
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
      if (response.success) {
        return true
      }
      return false
    } catch (error) {
      console.error('Reset password failed:', error)
      return false
    }
  }

  async function fetchUser() {
    if (!token.value) return
    try {
      const response = await authApi.getCurrentUser()
      if (response.success && response.data) {
        user.value = response.data
      }
    } catch (error) {
      console.error('Fetch user failed:', error)
      logout()
    }
  }

  function logout() {
    user.value = null
    token.value = null
    localStorage.removeItem('token')
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
    logout
  }
})
