<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NForm, NFormItem, NInput, NButton, NSpace, NCountdown, useMessage } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import GlassPanel from '@/components/common/GlassPanel.vue'

const router = useRouter()
const message = useMessage()
const authStore = useAuthStore()

const step = ref<'email' | 'reset'>('email')
const countdownActive = ref(false)
const countdownKey = ref(0)
const loading = ref(false)
const codeSending = ref(false)

const formValue = ref({
  email: '',
  code: '',
  newPassword: '',
  confirmPassword: ''
})

const countdownMs = 60 * 1000

async function sendCode() {
  if (!formValue.value.email) {
    message.warning('请输入邮箱')
    return
  }

  codeSending.value = true
  try {
    const success = await authStore.sendForgotPasswordCode(formValue.value.email)
    if (success) {
      countdownActive.value = true
      countdownKey.value++
      message.success('验证码已发送到邮箱')
    } else {
      message.error('发送失败，请检查邮箱是否正确')
    }
  } catch {
    message.error('发送失败，请稍后重试')
  } finally {
    codeSending.value = false
  }
}

function onCountdownFinish() {
  countdownActive.value = false
}

async function handleResetPassword() {
  if (!formValue.value.email || !formValue.value.code || !formValue.value.newPassword) {
    message.warning('请填写所有字段')
    return
  }

  if (formValue.value.newPassword !== formValue.value.confirmPassword) {
    message.error('两次密码输入不一致')
    return
  }

  if (formValue.value.newPassword.length < 6) {
    message.error('密码至少6位')
    return
  }

  loading.value = true
  try {
    const success = await authStore.resetPassword(
      formValue.value.email,
      formValue.value.code,
      formValue.value.newPassword
    )

    if (success) {
      message.success('密码重置成功，请登录')
      router.push('/login')
    } else {
      message.error('密码重置失败，请检查验证码')
    }
  } catch {
    message.error('密码重置失败，请稍后重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="forgot-page">
    <!-- 动态背景 -->
    <div class="forgot-bg">
      <div class="bg-gradient"></div>
      <div class="bg-grid"></div>
      <div class="orb orb-1"></div>
      <div class="orb orb-2"></div>
    </div>

    <!-- 卡片容器 -->
    <div class="forgot-container animate-scale-in">
      <GlassPanel variant="strong" bordered hoverable class="forgot-card">
        <!-- Logo区域 -->
        <div class="logo-section">
          <div class="logo-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1 class="logo-title gradient-text">找回密码</h1>
          <p class="logo-subtitle">重置您的账号密码</p>
        </div>

        <!-- 表单区域 -->
        <NForm :model="formValue" class="forgot-form">
          <!-- 邮箱输入 -->
          <NFormItem label="" path="email" :show-label="false">
            <NInput
              v-model:value="formValue.email"
              placeholder="请输入注册邮箱"
              size="large"
              :disabled="step === 'reset'"
            />
          </NFormItem>

          <!-- 验证码 -->
          <NFormItem label="" path="code" :show-label="false">
            <NSpace align="center" :size="12">
              <NInput
                v-model:value="formValue.code"
                placeholder="请输入验证码"
                size="large"
                style="width: 160px"
              />
              <NButton
                size="large"
                :loading="codeSending"
                :disabled="countdownActive || !formValue.email"
                @click="sendCode"
              >
                <template v-if="countdownActive">
                  <NCountdown
                    :key="countdownKey"
                    :duration="countdownMs"
                    :active="countdownActive"
                    @finish="onCountdownFinish"
                  />
                </template>
                <template v-else>
                  发送验证码
                </template>
              </NButton>
            </NSpace>
          </NFormItem>

          <!-- 新密码 -->
          <NFormItem label="" path="newPassword" :show-label="false">
            <NInput
              v-model:value="formValue.newPassword"
              type="password"
              placeholder="请输入新密码"
              size="large"
              show-password-on="click"
            />
          </NFormItem>

          <!-- 确认密码 -->
          <NFormItem label="" path="confirmPassword" :show-label="false">
            <NInput
              v-model:value="formValue.confirmPassword"
              type="password"
              placeholder="请再次输入新密码"
              size="large"
              show-password-on="click"
            />
          </NFormItem>

          <!-- 重置按钮 -->
          <NButton
            type="primary"
            size="large"
            block
            :loading="loading"
            class="reset-button glow-button"
            @click="handleResetPassword"
          >
            {{ loading ? '重置中...' : '重置密码' }}
          </NButton>
        </NForm>

        <!-- 底部操作 -->
        <div class="forgot-footer">
          <NSpace justify="center" size="large">
            <button class="footer-link" @click="router.push('/login')">
              ← 返回登录
            </button>
          </NSpace>
        </div>
      </GlassPanel>
    </div>
  </div>
</template>

<style scoped>
.forgot-page {
  position: relative;
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* ---- 动态背景 ---- */
.forgot-bg {
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

@keyframes orbFloat {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(40px, -40px) scale(1.05); }
  66% { transform: translate(-30px, 30px) scale(0.95); }
}

/* ---- 容器 ---- */
.forgot-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  padding: 20px;
}

.forgot-card {
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
.forgot-form {
  margin-bottom: 24px;
}

.forgot-form :deep(.n-input) {
  --n-border-hover: 1px solid var(--color-primary) !important;
  --n-border-focus: 1px solid var(--color-primary) !important;
  --n-box-shadow-focus: 0 0 0 2px var(--color-primary-light) !important;
  background-color: var(--bg-tertiary) !important;
  border-radius: 12px !important;
}

/* ---- 重置按钮 ---- */
.reset-button {
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

.reset-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}

.reset-button:active:not(:disabled) {
  transform: translateY(0);
}

/* ---- 底部链接 ---- */
.forgot-footer {
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

/* ---- 响应式 ---- */
@media (max-width: 480px) {
  .forgot-card {
    padding: 32px 24px !important;
  }

  .logo-title {
    font-size: var(--font-size-2xl, 20px);
  }

  .orb { display: none; }
}
</style>
