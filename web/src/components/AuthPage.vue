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
  <div class="auth-container">
    <div class="auth-box">
      <h1 class="auth-title">🤖 Claude Code Web</h1>
      <p class="auth-subtitle">AI Coding Assistant</p>

      <div v-if="currentView === 'login'" class="auth-form">
        <h2>登录</h2>
        <input
          v-model="loginEmail"
          type="email"
          placeholder="邮箱"
          class="auth-input"
          @keyup.enter="handleLogin"
        />
        <input
          v-model="loginPassword"
          type="password"
          placeholder="密码"
          class="auth-input"
          @keyup.enter="handleLogin"
        />
        <button
          @click="handleLogin"
          class="auth-btn primary"
          :disabled="loginLoading || !isLoginFormValid"
        >
          {{ loginLoading ? '登录中...' : '登录' }}
        </button>
        <p v-if="loginError" class="auth-error">{{ loginError }}</p>
        <div class="auth-links">
          <a @click="switchToForgotPassword" class="auth-link">忘记密码？</a>
          <span class="auth-divider">|</span>
          <a @click="switchToRegister" class="auth-link">注册账号</a>
        </div>
      </div>

      <div v-if="currentView === 'register'" class="auth-form">
        <h2>注册</h2>
        <input
          v-model="registerEmail"
          type="email"
          placeholder="邮箱"
          class="auth-input"
          :disabled="registerCodeSent"
        />
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
        <input
          v-model="registerUsername"
          type="text"
          placeholder="用户名"
          class="auth-input"
        />
        <input
          v-model="registerPassword"
          type="password"
          placeholder="密码（至少6位）"
          class="auth-input"
        />
        <button
          @click="handleRegister"
          class="auth-btn primary"
          :disabled="registerLoading || !isRegisterFormValid"
        >
          {{ registerLoading ? '注册中...' : '注册' }}
        </button>
        <p v-if="registerError" class="auth-error">{{ registerError }}</p>
        <div class="auth-links">
          <a @click="switchToLogin" class="auth-link">已有账号？登录</a>
        </div>
      </div>

      <div v-if="currentView === 'forgotPassword'" class="auth-form">
        <h2>找回密码</h2>
        <input
          v-model="forgotEmail"
          type="email"
          placeholder="邮箱"
          class="auth-input"
          :disabled="forgotCodeSent"
        />
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
        <input
          v-model="forgotNewPassword"
          type="password"
          placeholder="新密码（至少6位）"
          class="auth-input"
          :disabled="!forgotCodeSent"
        />
        <button
          @click="handleResetPassword"
          class="auth-btn primary"
          :disabled="forgotLoading || !isForgotFormValid"
        >
          {{ forgotLoading ? '重置中...' : '重置密码' }}
        </button>
        <p v-if="forgotError" class="auth-error">{{ forgotError }}</p>
        <div class="auth-links">
          <a @click="switchToLogin" class="auth-link">想起密码了？登录</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.auth-box {
  background: #16213e;
  padding: 40px;
  border-radius: 16px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  border: 1px solid #0f3460;
  width: 360px;
}

.auth-title {
  color: #e94560;
  margin: 0 0 8px 0;
  font-size: 24px;
}

.auth-subtitle {
  color: #888;
  margin: 0 0 32px 0;
  font-size: 14px;
}

.auth-form h2 {
  color: #eee;
  margin: 0 0 24px 0;
  font-size: 20px;
}

.auth-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 14px;
  border: 2px solid #0f3460;
  border-radius: 8px;
  background: #1a1a2e;
  color: #eee;
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  margin-bottom: 12px;
}

.auth-input:focus {
  border-color: #e94560;
}

.auth-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.code-row {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.code-input {
  flex: 1;
  margin-bottom: 0;
}

.auth-btn {
  width: 100%;
  padding: 12px 20px;
  font-size: 14px;
  background: #0f3460;
  color: #eee;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.auth-btn.primary {
  background: #e94560;
  color: white;
}

.auth-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.auth-btn:disabled {
  background: #666;
  cursor: not-allowed;
  color: #aaa;
}

.auth-btn.small {
  padding: 12px 14px;
  font-size: 12px;
  white-space: nowrap;
  width: auto;
}

.auth-error {
  color: #ef4444;
  margin: 12px 0;
  font-size: 13px;
}

.auth-links {
  margin-top: 16px;
  font-size: 13px;
}

.auth-link {
  color: #4ade80;
  cursor: pointer;
  text-decoration: none;
}

.auth-link:hover {
  text-decoration: underline;
}

.auth-divider {
  color: #666;
  margin: 0 8px;
}
</style>
