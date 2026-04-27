<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NForm, NFormItem, NInput, NButton, NSpace, useMessage } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import GlassPanel from '@/components/common/GlassPanel.vue'

const router = useRouter()
const message = useMessage()
const authStore = useAuthStore()

const formValue = ref({
  email: '',
  password: ''
})
const loading = ref(false)
/** 输入框聚焦状态 */
const focusedField = ref<string | null>(null)

async function handleLogin() {
  if (!formValue.value.email || !formValue.value.password) {
    message.warning('请填写邮箱和密码')
    return
  }

  loading.value = true
  try {
    const success = await authStore.login(formValue.value.email, formValue.value.password)
    if (success) {
      message.success('登录成功')
      router.push('/chat')
    } else {
      message.error('登录失败，请检查邮箱和密码')
    }
  } catch {
    message.error('登录失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

/**
 * 处理输入框聚焦事件
 * @param field 字段名
 */
function handleFocus(field: string): void {
  focusedField.value = field
}

/**
 * 处理输入框失焦事件
 */
function handleBlur(): void {
  focusedField.value = null
}

/**
 * GitHub 登录
 * 重定向到GitHub OAuth授权页面
 */
function handleGithubLogin(): void {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') || ''
  // 未配置时用同源 /api（Vite 代理或 Nginx 反代）
  window.location.href = base ? `${base}/api/auth/github` : '/api/auth/github'
}

/**
 * Google 登录
 */
function handleGoogleLogin(): void {
  message.info('Google 登录功能开发中...')
  // TODO: 实现 Google OAuth 登录
  // window.location.href = '/api/auth/google'
}
</script>

<template>
  <div class="login-page">
    <!-- 动态背景 -->
    <div class="login-bg">
      <!-- 渐变背景层 -->
      <div class="bg-gradient"></div>
      <!-- 网格背景 -->
      <div class="bg-grid"></div>
      <!-- 装饰性光球 -->
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
      <div class="orb orb-3"></div>
    </div>

    <!-- 登录卡片容器 -->
    <div class="login-container animate-scale-in">
      <GlassPanel variant="strong" bordered hoverable class="login-card">
        <!-- Logo区域 -->
        <div class="logo-section">
          <div class="logo-icon">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" style="stop-color:#FFFFFF;stop-opacity:1" />
                  <stop offset="15%" style="stop-color:#FFF8DC;stop-opacity:0.9" />
                  <stop offset="35%" style="stop-color:#FFD700;stop-opacity:0.6" />
                  <stop offset="55%" style="stop-color:#FF8C42;stop-opacity:0.3" />
                  <stop offset="75%" style="stop-color:#A855F7;stop-opacity:0.15" />
                  <stop offset="100%" style="stop-color:#6366F1;stop-opacity:0" />
                </radialGradient>
              </defs>
              <rect width="100" height="100" rx="22" fill="#0F0F1A"/>
              <circle cx="50" cy="50" r="48" fill="url(#starGlow)" opacity="0.3"/>
              <circle cx="50" cy="50" r="38" fill="url(#starGlow)" opacity="0.4"/>
              <rect x="48" y="6" width="4" height="22" rx="2" fill="#FFD700" opacity="0.95"/>
              <rect x="48" y="72" width="4" height="22" rx="2" fill="#A855F7" opacity="0.7"/>
              <rect x="6" y="48" width="22" height="4" rx="2" fill="#6366F1" opacity="0.8"/>
              <rect x="72" y="48" width="22" height="4" rx="2" fill="#FF8C42" opacity="0.85"/>
              <rect x="16" y="18" width="4" height="16" rx="2" fill="#818CF8" opacity="0.85" transform="rotate(45 18 26)"/>
              <rect x="80" y="18" width="4" height="16" rx="2" fill="#FFB347" opacity="0.9" transform="rotate(-45 82 26)"/>
              <rect x="16" y="66" width="4" height="16" rx="2" fill="#818CF8" opacity="0.75" transform="rotate(-45 18 74)"/>
              <rect x="80" y="66" width="4" height="16" rx="2" fill="#C084FC" opacity="0.75" transform="rotate(45 82 74)"/>
              <rect x="58" y="12" width="3" height="12" rx="1.5" fill="#FFE4B5" opacity="0.7" transform="rotate(22 59.5 18)"/>
              <rect x="76" y="58" width="12" height="3" rx="1.5" fill="#FFB347" opacity="0.65" transform="rotate(22 82 59.5)"/>
              <rect x="39" y="76" width="3" height="12" rx="1.5" fill="#C084FC" opacity="0.6" transform="rotate(22 40.5 82)"/>
              <rect x="12" y="39" width="12" height="3" rx="1.5" fill="#6366F1" opacity="0.65" transform="rotate(22 18 40.5)"/>
              <path d="M50,24c6,6 6,16 0,22c-6,-6 -6,-16 0,-22z" fill="#FFD700" opacity="0.95"/>
              <path d="M72,46c-6,6 -16,6 -22,0c6,-6 16,-6 22,0z" fill="#FF8C42" opacity="0.9"/>
              <path d="M50,68c-6,-6 -6,-16 0,-22c6,6 6,16 0,22z" fill="#A855F7" opacity="0.85"/>
              <path d="M28,46c6,-6 16,-6 22,0c-6,6 -16,6 -22,0z" fill="#6366F1" opacity="0.9"/>
              <circle cx="50" cy="46" r="10" fill="white" opacity="0.5"/>
              <circle cx="50" cy="46" r="6" fill="white" opacity="0.95"/>
              <circle cx="50" cy="46" r="3" fill="white"/>
              <circle cx="32" cy="22" r="1.5" fill="#FFD700" opacity="0.6"/>
              <circle cx="70" cy="28" r="1.2" fill="#FF8C42" opacity="0.5"/>
              <circle cx="66" cy="68" r="1.5" fill="#A855F7" opacity="0.5"/>
              <circle cx="30" cy="64" r="1.2" fill="#6366F1" opacity="0.5"/>
            </svg>
          </div>
          <h1 class="logo-title gradient-text">收藏家</h1>
          <p class="logo-subtitle">收藏灵感，点亮智慧</p>
        </div>

        <!-- 表单区域 -->
        <NForm :model="formValue" class="login-form" @submit.prevent="handleLogin">
          <!-- 邮箱输入 -->
          <NFormItem label="" path="email" :show-label="false">
            <div
              class="input-wrapper"
              :class="{ 'input-wrapper--focused': focusedField === 'email' }"
            >
              <label
                class="floating-label"
                :class="{ 'floating-label--active': formValue.email || focusedField === 'email' }"
              >
                邮箱地址
              </label>
              <NInput
                v-model:value="formValue.email"
                placeholder=""
                size="large"
                :input-props="{ autocomplete: 'email' }"
                @focus="handleFocus('email')"
                @blur="handleBlur"
              />
              <span class="input-icon">📧</span>
            </div>
          </NFormItem>

          <!-- 密码输入 -->
          <NFormItem label="" path="password" :show-label="false">
            <div
              class="input-wrapper"
              :class="{ 'input-wrapper--focused': focusedField === 'password' }"
            >
              <label
                class="floating-label"
                :class="{ 'floating-label--active': formValue.password || focusedField === 'password' }"
              >
                密码
              </label>
              <NInput
                v-model:value="formValue.password"
                type="password"
                placeholder=""
                size="large"
                show-password-on="click"
                :input-props="{ autocomplete: 'current-password' }"
                @focus="handleFocus('password')"
                @blur="handleBlur"
              />
              <span class="input-icon">🔒</span>
            </div>
          </NFormItem>

          <!-- 登录按钮 -->
          <NButton
            type="primary"
            size="large"
            block
            :loading="loading"
            class="login-button glow-button"
            @click="handleLogin"
          >
            <template v-if="!loading" #icon>
              <svg viewBox="0 0 24 24" fill="none" width="18" height="18">
                <path d="M15 3H19C20.1046 3 21 3.89543 21 5V19C21 20.1046 20.1046 21 19 21H15M10 17L15 12M15 12L10 7M15 12H3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </template>
            {{ loading ? '登录中...' : '登 录' }}
          </NButton>
        </NForm>

        <!-- 底部操作 -->
        <div class="login-footer">
          <NSpace justify="space-between" size="large">
            <button class="footer-link" @click="router.push('/register')">
              注册账号 →
            </button>
            <button class="footer-link" @click="router.push('/forgot-password')">
              忘记密码?
            </button>
          </NSpace>
        </div>

        <!-- 分隔线 -->
        <div class="divider">
          <span>或继续使用</span>
        </div>

        <!-- 社交登录按钮 -->
        <div class="social-login">
          <button class="social-btn github-btn" title="使用 GitHub 登录" @click="handleGithubLogin">
            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </button>
          <button class="social-btn google-btn" title="使用 Google 登录" @click="handleGoogleLogin">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          </button>
        </div>
      </GlassPanel>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* ---- 动态背景 ---- */
.login-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
}

.bg-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #0a0a0f 0%, #13131a 30%, #1a1a24 70%, #0f172a 100%);
  animation: bgShift 20s ease infinite;
  background-size: 400% 400%;
}

@keyframes bgShift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(99, 102, 241, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 102, 241, 0.05) 1px, transparent 1px);
  background-size: 50px 50px;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.4;
  animation: orbFloat 25s ease-in-out infinite;
}

.orb-1 {
  width: 400px;
  height: 400px;
  background: var(--color-primary);
  top: -150px;
  right: -100px;
  animation-delay: 0s;
}

.orb-2 {
  width: 300px;
  height: 300px;
  background: var(--color-info);
  bottom: -100px;
  left: -80px;
  animation-delay: -8s;
}

.orb-3 {
  width: 200px;
  height: 200px;
  background: var(--color-success);
  top: 40%;
  left: 40%;
  animation-delay: -16s;
}

@keyframes orbFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(40px, -40px) scale(1.05); }
  66% { transform: translate(-30px, 30px) scale(0.95); }
}

/* ---- 登录容器 ---- */
.login-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  padding: 20px;
}

.login-card {
  padding: 40px 36px !important;
}

/* ---- Logo区域 ---- */
.logo-section {
  text-align: center;
  margin-bottom: 36px;
}

.logo-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: var(--gradient-primary);
  margin-bottom: 20px;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.3);
  transition: all var(--transition-normal, 250ms) ease;
}

.logo-icon:hover {
  transform: translateY(-2px) rotate(-3deg);
  box-shadow: 0 12px 32px rgba(99, 102, 241, 0.4);
}

.logo-icon svg {
  width: 32px;
  height: 32px;
  color: white;
}

.logo-title {
  font-size: var(--font-size-3xl, 24px);
  font-weight: var(--font-weight-bold, 700);
  margin-bottom: 8px;
  letter-spacing: -0.5px;
}

.logo-subtitle {
  font-size: var(--font-size-base, 14px);
  color: var(--text-secondary);
}

/* ---- 表单样式 ---- */
.login-form {
  margin-bottom: 24px;
}

.input-wrapper {
  position: relative;
  width: 100%;
  margin-bottom: 4px;
}

/* 确保表单项占满宽度 */
.login-form :deep(.n-form-item) {
  width: 100%;
}

.login-form :deep(.n-form-item-blank) {
  width: 100%;
}

/* 输入框宽度统一 */
.login-form :deep(.n-input) {
  width: 100% !important;
}

.login-form :deep(.n-input-wrapper) {
  width: 100%;
}

.floating-label {
  position: absolute;
  left: 44px;
  top: 50%;
  transform: translateY(-50%);
  font-size: var(--font-size-md, 15px);
  color: var(--text-disabled);
  pointer-events: none;
  transition: all var(--transition-fast, 150ms) ease;
  background: transparent;
  padding: 0 4px;
  z-index: 10;
}

.floating-label--active {
  top: 0;
  left: 12px;
  font-size: var(--font-size-xs, 11px);
  color: var(--color-primary);
  background: var(--bg-card);
  font-weight: var(--font-weight-medium, 500);
  z-index: 11;
}

.input-wrapper :deep(.n-input) {
  --n-border-hover: 1px solid var(--color-primary) !important;
  --n-border-focus: 1px solid var(--color-primary) !important;
  --n-box-shadow-focus: 0 0 0 2px var(--color-primary-light) !important;
  background-color: var(--bg-tertiary) !important;
  border-radius: 12px !important;
  transition: all var(--transition-fast, 150ms) ease !important;
}

.input-wrapper--focused :deep(.n-input) {
  box-shadow: 0 0 0 3px var(--color-primary-light), var(--shadow-sm) !important;
}

.input-icon {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 16px;
  pointer-events: none;
  opacity: 0.5;
  transition: opacity var(--transition-fast, 150ms) ease;
}

.input-wrapper--focused .input-icon {
  opacity: 0.8;
}

/* ---- 登录按钮 ---- */
.login-button {
  margin-top: 8px;
  height: 48px !important;
  font-size: var(--font-size-md, 15px) !important;
  font-weight: var(--font-weight-semibold, 600) !important;
  border-radius: 12px !important;
  background: var(--gradient-primary) !important;
  border: none !important;
  letter-spacing: 1px;
  transition: all var(--transition-normal, 250ms) ease !important;
}

.login-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}

.login-button:active:not(:disabled) {
  transform: translateY(0);
}

/* ---- 底部链接 ---- */
.login-footer {
  margin-top: 20px;
}

.footer-link {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: var(--font-size-sm, 13px);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all var(--transition-fast, 150ms) ease;
}

.footer-link:hover {
  color: var(--color-primary);
  background: var(--color-primary-light);
}

/* ---- 分隔线 ---- */
.divider {
  position: relative;
  text-align: center;
  margin: 24px 0;
}

.divider::before,
.divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: calc(50% - 60px);
  height: 1px;
  background: var(--border-color);
}

.divider::before { left: 0; }
.divider::after { right: 0; }

.divider span {
  position: relative;
  padding: 0 16px;
  background: var(--bg-card);
  color: var(--text-disabled);
  font-size: var(--font-size-xs, 11px);
}

/* ---- 社交登录 ---- */
.social-login {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.social-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 48px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms) ease;
  color: var(--text-primary);
}

.social-btn:hover {
  border-color: var(--border-accent);
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.github-btn:hover {
  border-color: #6e5484;
  background: rgba(110, 84, 132, 0.1);
}

.google-btn:hover {
  border-color: #4285F4;
  background: rgba(66, 133, 244, 0.1);
}

/* ---- 响应式 ---- */
@media (max-width: 480px) {
  .login-card {
    padding: 32px 24px !important;
  }

  .logo-title {
    font-size: var(--font-size-2xl, 20px);
  }

  .orb { display: none; }
}
</style>
