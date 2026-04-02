<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, NSpace, NLi, NCountdown, useMessage } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const message = useMessage()
const authStore = useAuthStore()

const step = ref<'form' | 'code'>('form')
const countdownKey = ref(0)
const countdownActive = ref(false)

const formValue = ref({
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
  code: ''
})

const codeSending = ref(false)
const loading = ref(false)

const countdownMs = computed(() => 60 * 1000)

async function sendCode() {
  if (!formValue.value.email) {
    message.warning('请输入邮箱')
    return
  }
  
  codeSending.value = true
  try {
    const success = await authStore.sendRegisterCode(formValue.value.email)
    if (success) {
      step.value = 'code'
      countdownActive.value = true
      countdownKey.value++
      message.success('验证码已发送到邮箱')
    } else {
      message.error('发送失败，请稍后重试')
    }
  } finally {
    codeSending.value = false
  }
}

function onCountdownFinish() {
  countdownActive.value = false
}

async function handleRegister() {
  if (!formValue.value.email || !formValue.value.username || 
      !formValue.value.password || !formValue.value.code) {
    message.warning('请填写所有字段')
    return
  }
  
  if (formValue.value.password !== formValue.value.confirmPassword) {
    message.error('两次密码输入不一致')
    return
  }
  
  loading.value = true
  try {
    const success = await authStore.register(
      formValue.value.email,
      formValue.value.username,
      formValue.value.password,
      formValue.value.code
    )
    
    if (success) {
      message.success('注册成功，请登录')
      router.push('/login')
    } else {
      message.error('注册失败，请检查验证码')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="register-container">
    <div class="register-card">
      <div class="logo">
        <h1>Claude Code</h1>
        <p>创建您的账号</p>
      </div>
      
      <NCard>
        <NForm :model="formValue">
          <NFormItem label="邮箱" path="email">
            <NInput 
              v-model:value="formValue.email" 
              placeholder="请输入邮箱"
              size="large"
            />
          </NFormItem>
          
          <NFormItem label="用户名" path="username">
            <NInput 
              v-model:value="formValue.username" 
              placeholder="请输入用户名"
              size="large"
            />
          </NFormItem>
          
          <NFormItem label="密码" path="password">
            <NInput 
              v-model:value="formValue.password" 
              type="password"
              placeholder="请输入密码"
              size="large"
              show-password-on="click"
            />
          </NFormItem>
          
          <NFormItem label="确认密码" path="confirmPassword">
            <NInput 
              v-model:value="formValue.confirmPassword" 
              type="password"
              placeholder="请再次输入密码"
              size="large"
              show-password-on="click"
            />
          </NFormItem>
          
          <NFormItem label="验证码" path="code">
            <NSpace vertical :size="12">
              <NSpace>
                <NInput 
                  v-model:value="formValue.code" 
                  placeholder="请输入验证码"
                  size="large"
                  style="width: 150px"
                />
                <NButton 
                  size="large" 
                  :loading="codeSending"
                  :disabled="countdownActive"
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
            </NSpace>
          </NFormItem>
          
          <NButton 
            type="primary" 
            size="large" 
            block 
            :loading="loading"
            @click="handleRegister"
          >
            注册
          </NButton>
          
          <NSpace justify="center" style="margin-top: 16px">
            <NLi @click="router.push('/login')">已有账号? 登录</NLi>
          </NSpace>
        </NForm>
      </NCard>
    </div>
  </div>
</template>

<style scoped>
.register-container {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.register-card {
  width: 450px;
  padding: 20px;
}

.logo {
  text-align: center;
  margin-bottom: 30px;
}

.logo h1 {
  font-size: 32px;
  font-weight: 700;
  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.logo p {
  color: #94a3b8;
  margin-top: 8px;
}
</style>
