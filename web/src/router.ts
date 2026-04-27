import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { checkLoginStatus } from '@/services/authService'

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
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/Profile.vue'),
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
  },
  {
    path: '/ide',
    name: 'IdeWorkbench',
    component: () => import('@/views/IdeWorkbench.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/deployment',
    name: 'Deployment',
    component: () => import('@/views/Deployment.vue'),
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  console.log('[Router] beforeEach:', to.path, 'token exists:', !!token)
  
  let isTokenValid = false
  if (token) {
    try {
      isTokenValid = checkLoginStatus()
      console.log('[Router] Token validation result:', isTokenValid)
    } catch (error) {
      console.error('[Router] Token validation error:', error)
      isTokenValid = false
    }
  }
  
  console.log('[Router] isTokenValid:', isTokenValid, 'requiresAuth:', to.meta.requiresAuth)
  
  if (to.meta.requiresAuth && !isTokenValid) {
    console.warn('[Router] Redirecting to login due to invalid token')
    localStorage.removeItem('token')
    next('/login')
  } else if ((to.path === '/login' || to.path === '/register' || to.path === '/forgot-password') && isTokenValid) {
    console.log('[Router] Redirecting to chat (already logged in)')
    next('/chat')
  } else {
    next()
  }
})

export default router
