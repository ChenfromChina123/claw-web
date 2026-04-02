<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NCard, NForm, NFormItem, NInput, NButton, NSpace, NLi, useMessage } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const message = useMessage()
const authStore = useAuthStore()

const formValue = ref({
  email: '',
  password: ''
})
const loading = ref(false)

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
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="logo">
        <h1>Claude Code</h1>
        <p>AI 智能助手</p>
      </div>
      
      <NCard>
        <NForm :model="formValue" @submit.prevent="handleLogin">
          <NFormItem label="邮箱" path="email">
            <NInput 
              v-model:value="formValue.email" 
              placeholder="请输入邮箱"
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
          
          <NButton 
            type="primary" 
            size="large" 
            block 
            :loading="loading"
            @click="handleLogin"
          >
            登录
          </NButton>
          
          <NSpace justify="space-between" style="margin-top: 16px">
            <NLi @click="router.push('/register')">注册账号</NLi>
            <NLi>忘记密码?</NLi>
          </NSpace>
        </NForm>
      </NCard>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.login-card {
  width: 400px;
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
