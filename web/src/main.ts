import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import naive from 'naive-ui'
import { authApi } from './api'
import { checkLoginStatus } from './services/authService'
import './assets/main.css'

const DEV_AUTO_LOGIN_EMAIL = '3301767269@qq.com'
const DEV_AUTO_LOGIN_PASSWORD = '123456'

/**
 * 开发环境自动登录
 */
async function devAutoLogin(): Promise<boolean> {
  if (import.meta.env.PROD) return false
  
  const token = localStorage.getItem('token')
  if (token && checkLoginStatus()) {
    console.log('[Dev] 已有有效 token，跳过自动登录')
    return true
  }
  
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

async function bootstrap() {
  if (import.meta.env.DEV) {
    await devAutoLogin()
  }
  
  const app = createApp(App)
  
  app.use(createPinia())
  app.use(router)
  app.use(naive)
  
  app.mount('#app')
}

bootstrap()
