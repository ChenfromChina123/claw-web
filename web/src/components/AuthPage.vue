<script setup lang="ts">
import { ref, computed } from 'vue'
import { authApi, type LoginResponse } from '../services/authApi'

const emit = defineEmits<{
  loginSuccess: [user: LoginResponse]
}>()

type AuthView = 'login' | 'register' | 'forgotPassword'

const currentView = ref<AuthView>('login')

const loginEmail = ref('')
const loginPassword = ref('')
const loginError = ref('')
const loginLoading = ref(false)

const registerEmail = ref('')
const registerUsername = ref('')
const registerPassword = ref('')
const registerCode = ref('')
const registerError = ref('')
const registerLoading = ref(false)
const registerCodeSent = ref(false)
const registerCodeSending = ref(false)

const forgotEmail = ref('')
const forgotCode = ref('')
const forgotNewPassword = ref('')
const forgotError = ref('')
const forgotLoading = ref(false)
const forgotCodeSent = ref(false)
const forgotCodeSending = ref(false)

const isLoginFormValid = computed(() => {
  return loginEmail.value.includes('@') && loginPassword.value.length >= 6
})

const isRegisterFormValid = computed(() => {
  return registerEmail.value.includes('@') &&
         registerUsername.value.length >= 2 &&
         registerPassword.value.length >= 6 &&
         registerCode.value.length === 6
})

const isForgotFormValid = computed(() => {
  return forgotEmail.value.includes('@') &&
         forgotCode.value.length === 6 &&
         forgotNewPassword.value.length >= 6
})

async function handleLogin() {
  if (!isLoginFormValid.value) {
    loginError.value = '请输入有效的邮箱和密码'
    return
  }

  loginLoading.value = true
  loginError.value = ''

  try {
    const response = await authApi.login({
      email: loginEmail.value,
      password: loginPassword.value,
    })

    if (response.success && response.data) {
      localStorage.setItem('auth_token', response.data.accessToken)
      localStorage.setItem('user_info', JSON.stringify(response.data))
      emit('loginSuccess', response.data)
    } else {
      loginError.value = response.error?.message || '登录失败'
    }
  } catch (e) {
    loginError.value = '网络错误，请稍后重试'
  } finally {
    loginLoading.value = false
  }
}

async function handleSendRegisterCode() {
  if (!registerEmail.value.includes('@')) {
    registerError.value = '请输入有效的邮箱'
    return
  }

  registerCodeSending.value = true
  registerError.value = ''

  try {
    const response = await authApi.sendRegisterCode(registerEmail.value)

    if (response.success) {
      registerCodeSent.value = true
      registerError.value = ''
    } else {
      registerError.value = response.error?.message || '发送验证码失败'
    }
  } catch (e) {
    registerError.value = '网络错误，请稍后重试'
  } finally {
    registerCodeSending.value = false
  }
}

async function handleRegister() {
  if (!isRegisterFormValid.value) {
    registerError.value = '请填写所有字段'
    return
  }

  registerLoading.value = true
  registerError.value = ''

  try {
    const response = await authApi.register({
      email: registerEmail.value,
      username: registerUsername.value,
      password: registerPassword.value,
      code: registerCode.value,
    })

    if (response.success && response.data) {
      localStorage.setItem('auth_token', response.data.accessToken)
      localStorage.setItem('user_info', JSON.stringify(response.data))
      emit('loginSuccess', response.data)
    } else {
      registerError.value = response.error?.message || '注册失败'
    }
  } catch (e) {
    registerError.value = '网络错误，请稍后重试'
  } finally {
    registerLoading.value = false
  }
}

async function handleSendForgotCode() {
  if (!forgotEmail.value.includes('@')) {
    forgotError.value = '请输入有效的邮箱'
    return
  }

  forgotCodeSending.value = true
  forgotError.value = ''

  try {
    const response = await authApi.sendForgotPasswordCode(forgotEmail.value)

    if (response.success) {
      forgotCodeSent.value = true
      forgotError.value = ''
    } else {
      forgotError.value = response.error?.message || '发送验证码失败'
    }
  } catch (e) {
    forgotError.value = '网络错误，请稍后重试'
  } finally {
    forgotCodeSending.value = false
  }
}

async function handleResetPassword() {
  if (!isForgotFormValid.value) {
    forgotError.value = '请填写所有字段'
    return
  }

  forgotLoading.value = true
  forgotError.value = ''

  try {
    const response = await authApi.resetPassword({
      email: forgotEmail.value,
      code: forgotCode.value,
      newPassword: forgotNewPassword.value,
    })

    if (response.success) {
      alert('密码重置成功，请使用新密码登录')
      currentView.value = 'login'
      forgotEmail.value = ''
      forgotCode.value = ''
      forgotNewPassword.value = ''
      forgotCodeSent.value = false
    } else {
      forgotError.value = response.error?.message || '重置密码失败'
    }
  } catch (e) {
    forgotError.value = '网络错误，请稍后重试'
  } finally {
    forgotLoading.value = false
  }
}

function switchToLogin() {
  currentView.value = 'login'
  loginError.value = ''
  registerError.value = ''
  forgotError.value = ''
}

function switchToRegister() {
  currentView.value = 'register'
  loginError.value = ''
  registerError.value = ''
  forgotError.value = ''
}

function switchToForgotPassword() {
  currentView.value = 'forgotPassword'
  loginError.value = ''
  registerError.value = ''
  forgotError.value = ''
}
</script>

<template>
  <div class="auth-page">
    <div class="auth-bg-pattern"></div>
    <div class="auth-container">
      <div class="auth-brand">
        <div class="brand-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h1 class="brand-name">Claude Code Web</h1>
        <p class="brand-tagline">AI Coding Assistant</p>
      </div>

      <div class="auth-card">
        <div v-if="currentView === 'login'" class="auth-form">
          <div class="form-header">
            <h2>欢迎回来</h2>
            <p>登录到您的账户</p>
          </div>
          <div class="input-group">
            <label>邮箱地址</label>
            <input
              v-model="loginEmail"
              type="email"
              placeholder="name@example.com"
              class="auth-input"
              @keyup.enter="handleLogin"
            />
          </div>
          <div class="input-group">
            <label>密码</label>
            <input
              v-model="loginPassword"
              type="password"
              placeholder="输入密码"
              class="auth-input"
              @keyup.enter="handleLogin"
            />
          </div>
          <p v-if="loginError" class="auth-error">{{ loginError }}</p>
          <button
            @click="handleLogin"
            class="auth-btn primary"
            :disabled="loginLoading || !isLoginFormValid"
          >
            <span v-if="loginLoading" class="btn-loader"></span>
            {{ loginLoading ? '登录中...' : '登录' }}
          </button>
          <div class="auth-links">
            <a @click="switchToForgotPassword" class="auth-link">忘记密码？</a>
            <span class="auth-divider">·</span>
            <a @click="switchToRegister" class="auth-link">注册账号</a>
          </div>
        </div>

        <div v-if="currentView === 'register'" class="auth-form">
          <div class="form-header">
            <h2>创建账户</h2>
            <p>开始使用 AI 编程助手</p>
          </div>
          <div class="input-group">
            <label>邮箱地址</label>
            <input
              v-model="registerEmail"
              type="email"
              placeholder="name@example.com"
              class="auth-input"
              :disabled="registerCodeSent"
            />
          </div>
          <div class="code-row">
            <input
              v-model="registerCode"
              type="text"
              placeholder="验证码"
              class="auth-input code-input"
              maxlength="6"
            />
            <button
              @click="handleSendRegisterCode"
              class="auth-btn small"
              :disabled="registerCodeSending || !registerEmail.includes('@')"
            >
              {{ registerCodeSending ? '发送中...' : registerCodeSent ? '已发送' : '获取验证码' }}
            </button>
          </div>
          <div class="input-group">
            <label>用户名</label>
            <input
              v-model="registerUsername"
              type="text"
              placeholder="输入用户名"
              class="auth-input"
            />
          </div>
          <div class="input-group">
            <label>密码</label>
            <input
              v-model="registerPassword"
              type="password"
              placeholder="至少6位密码"
              class="auth-input"
            />
          </div>
          <p v-if="registerError" class="auth-error">{{ registerError }}</p>
          <button
            @click="handleRegister"
            class="auth-btn primary"
            :disabled="registerLoading || !isRegisterFormValid"
          >
            <span v-if="registerLoading" class="btn-loader"></span>
            {{ registerLoading ? '注册中...' : '注册' }}
          </button>
          <div class="auth-links">
            <a @click="switchToLogin" class="auth-link">已有账号？登录</a>
          </div>
        </div>

        <div v-if="currentView === 'forgotPassword'" class="auth-form">
          <div class="form-header">
            <h2>找回密码</h2>
            <p>重置您的账户密码</p>
          </div>
          <div class="input-group">
            <label>邮箱地址</label>
            <input
              v-model="forgotEmail"
              type="email"
              placeholder="name@example.com"
              class="auth-input"
              :disabled="forgotCodeSent"
            />
          </div>
          <div class="code-row">
            <input
              v-model="forgotCode"
              type="text"
              placeholder="验证码"
              class="auth-input code-input"
              maxlength="6"
            />
            <button
              @click="handleSendForgotCode"
              class="auth-btn small"
              :disabled="forgotCodeSending || !forgotEmail.includes('@')"
            >
              {{ forgotCodeSending ? '发送中...' : forgotCodeSent ? '已发送' : '获取验证码' }}
            </button>
          </div>
          <div class="input-group">
            <label>新密码</label>
            <input
              v-model="forgotNewPassword"
              type="password"
              placeholder="至少6位密码"
              class="auth-input"
              :disabled="!forgotCodeSent"
            />
          </div>
          <p v-if="forgotError" class="auth-error">{{ forgotError }}</p>
          <button
            @click="handleResetPassword"
            class="auth-btn primary"
            :disabled="forgotLoading || !isForgotFormValid"
          >
            <span v-if="forgotLoading" class="btn-loader"></span>
            {{ forgotLoading ? '重置中...' : '重置密码' }}
          </button>
          <div class="auth-links">
            <a @click="switchToLogin" class="auth-link">想起密码了？登录</a>
          </div>
        </div>
      </div>

      <div class="auth-features">
        <div class="feature-item">
          <span class="feature-icon">⚡</span>
          <span>快速响应</span>
        </div>
        <div class="feature-item">
          <span class="feature-icon">🔧</span>
          <span>工具调用</span>
        </div>
        <div class="feature-item">
          <span class="feature-icon">💾</span>
          <span>会话管理</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0f0f1a 100%);
  position: relative;
  overflow: hidden;
}

.auth-bg-pattern {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 20% 80%, rgba(99, 102, 241, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(168, 85, 247, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 50% 50%, rgba(236, 72, 153, 0.05) 0%, transparent 70%);
  pointer-events: none;
}

.auth-container {
  width: 100%;
  max-width: 420px;
  padding: 20px;
  position: relative;
  z-index: 1;
}

.auth-brand {
  text-align: center;
  margin-bottom: 32px;
}

.brand-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 16px;
  color: #6366f1;
  animation: float 3s ease-in-out infinite;
}

.brand-icon svg {
  width: 100%;
  height: 100%;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.brand-name {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px 0;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.brand-tagline {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
}

.auth-card {
  background: rgba(30, 30, 45, 0.8);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 20px;
  padding: 32px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.3),
    0 2px 4px -2px rgba(0, 0, 0, 0.2),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
}

.form-header {
  text-align: center;
  margin-bottom: 28px;
}

.form-header h2 {
  color: #fff;
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.form-header p {
  color: #6b7280;
  font-size: 14px;
  margin: 0;
}

.input-group {
  margin-bottom: 20px;
}

.input-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #9ca3af;
  margin-bottom: 8px;
}

.auth-input {
  width: 100%;
  padding: 14px 16px;
  font-size: 15px;
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 12px;
  background: rgba(15, 15, 25, 0.8);
  color: #fff;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.auth-input::placeholder {
  color: #4b5563;
}

.auth-input:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.auth-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.code-row {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.code-input {
  flex: 1;
  margin-bottom: 0;
}

.auth-btn {
  width: 100%;
  padding: 14px 20px;
  font-size: 15px;
  font-weight: 500;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.auth-btn.primary {
  background: linear-gradient(135deg, #6366f1 0%, #7c3aed 100%);
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.auth-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
}

.auth-btn.primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #5558e3 0%, #6d28d9 100%);
}

.auth-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.auth-btn.small {
  padding: 14px 16px;
  font-size: 13px;
  white-space: nowrap;
  width: auto;
}

.btn-loader {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.auth-error {
  color: #f87171;
  margin: 12px 0;
  font-size: 13px;
  text-align: center;
  padding: 10px;
  background: rgba(248, 113, 113, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(248, 113, 113, 0.2);
}

.auth-links {
  margin-top: 20px;
  text-align: center;
  font-size: 14px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}

.auth-link {
  color: #818cf8;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.2s;
}

.auth-link:hover {
  color: #a5b4fc;
  text-decoration: underline;
}

.auth-divider {
  color: #4b5563;
}

.auth-features {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 32px;
  flex-wrap: wrap;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6b7280;
}

.feature-icon {
  font-size: 14px;
}
</style>