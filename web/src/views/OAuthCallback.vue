<script setup lang="ts">
/**
 * OAuth 回调页面组件
 * 处理GitHub OAuth登录成功后的回调，解析URL参数并存储用户信息
 */
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const authStore = useAuthStore()

/** 加载状态 */
const loading = ref(true)
/** 错误信息 */
const errorMessage = ref('')

/**
 * 处理OAuth回调
 * 从URL参数中提取token和用户信息，存储到本地并跳转
 */
function handleOAuthCallback(): void {
  const { query } = route

  // 检查是否有错误信息
  if (query.error) {
    errorMessage.value = decodeURIComponent(query.error as string)
    loading.value = false
    message.error(errorMessage.value)
    // 3秒后跳转到登录页
    setTimeout(() => {
      router.push('/login')
    }, 3000)
    return
  }

  // 获取token和用户信息
  const token = query.token as string
  const userId = query.userId as string
  const username = query.username as string
  const email = query.email as string
  const avatar = query.avatar as string

  if (!token || !userId) {
    errorMessage.value = '登录失败：未收到有效的认证信息'
    loading.value = false
    message.error(errorMessage.value)
    setTimeout(() => {
      router.push('/login')
    }, 3000)
    return
  }

  // 存储token和用户信息
  authStore.token = token
  authStore.user = {
    id: userId,
    username: username || '',
    email: email || '',
    avatar: avatar || '/avatars/default.png',
  }
  localStorage.setItem('token', token)

  loading.value = false
  message.success('GitHub 登录成功！')

  // 跳转到聊天页面
  router.push('/chat')
}

/**
 * 组件挂载时处理回调
 */
onMounted(() => {
  handleOAuthCallback()
})
</script>

<template>
  <div class="oauth-callback-page">
    <div class="callback-container">
      <div v-if="loading" class="loading-section">
        <div class="spinner"></div>
        <p class="loading-text">正在处理登录...</p>
      </div>

      <div v-else-if="errorMessage" class="error-section">
        <div class="error-icon">❌</div>
        <h2 class="error-title">登录失败</h2>
        <p class="error-desc">{{ errorMessage }}</p>
        <p class="error-hint">3秒后自动返回登录页面...</p>
      </div>

      <div v-else class="success-section">
        <div class="success-icon">✓</div>
        <h2 class="success-title">登录成功</h2>
        <p class="success-desc">正在跳转...</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.oauth-callback-page {
  position: relative;
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0a0a0f 0%, #13131a 30%, #1a1a24 70%, #0f172a 100%);
}

.callback-container {
  text-align: center;
  padding: 40px;
}

/* 加载状态 */
.loading-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 3px solid rgba(99, 102, 241, 0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 16px;
  color: var(--text-secondary);
}

/* 错误状态 */
.error-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.error-icon {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 50%;
  font-size: 30px;
}

.error-title {
  font-size: 24px;
  font-weight: 600;
  color: #ef4444;
  margin: 0;
}

.error-desc {
  font-size: 14px;
  color: var(--text-secondary);
  max-width: 300px;
}

.error-hint {
  font-size: 12px;
  color: var(--text-disabled);
}

/* 成功状态 */
.success-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.success-icon {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(34, 197, 94, 0.1);
  border-radius: 50%;
  font-size: 30px;
  color: #22c55e;
}

.success-title {
  font-size: 24px;
  font-weight: 600;
  color: #22c55e;
  margin: 0;
}

.success-desc {
  font-size: 14px;
  color: var(--text-secondary);
}
</style>
