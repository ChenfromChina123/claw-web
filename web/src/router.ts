import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { checkLoginStatus } from '@/services/authService'
import { authApi } from '@/api'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/chat'
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue')
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/Register.vue')
  },
  {
    path: '/forgot-password',
    name: 'ForgotPassword',
    component: () => import('@/views/ForgotPassword.vue')
  },
  {
    path: '/oauth/callback',
    name: 'OAuthCallback',
    component: () => import('@/views/OAuthCallback.vue')
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('@/views/Chat.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Settings.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/integration',
    name: 'Integration',
    component: () => import('@/views/IntegrationHub.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/agent-workflow',
    name: 'AgentWorkflow',
    component: () => import('@/components/AgentWorkflowViewer.vue'),
    meta: { requiresAuth: false }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

const DEV_AUTO_LOGIN_EMAIL = '3301767269@qq.com'
const DEV_AUTO_LOGIN_PASSWORD = '123456'
let devAutoLoginAttempted = false

/**
 * 开发环境自动登录
 */
async function devAutoLogin(): Promise<boolean> {
  if (import.meta.env.PROD) return false
  if (devAutoLoginAttempted) return false
  
  devAutoLoginAttempted = true
  
  try {
    console.log('[Dev] 开发环境自动登录中...')
    const response = await authApi.login({
      email: DEV_AUTO_LOGIN_EMAIL,
      password: DEV_AUTO_LOGIN_PASSWORD,
    })
    
    if (response.accessToken) {
      console.log('[Dev] 自动登录成功')
      return true
    }
    return false
  } catch (error) {
    console.error('[Dev] 自动登录失败:', error)
    return false
  }
}

router.beforeEach(async (to, _from, next) => {
  const token = localStorage.getItem('token')
  let isTokenValid = token ? checkLoginStatus() : false
  
  if (!isTokenValid && import.meta.env.DEV && !devAutoLoginAttempted) {
    const loginSuccess = await devAutoLogin()
    if (loginSuccess) {
      isTokenValid = true
    }
  }
  
  if (to.meta.requiresAuth && !isTokenValid) {
    localStorage.removeItem('token')
    next('/login')
  } else if ((to.path === '/login' || to.path === '/register' || to.path === '/forgot-password') && isTokenValid) {
    next('/chat')
  } else {
    next()
  }
})

export default router
