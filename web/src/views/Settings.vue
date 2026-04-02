<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutContent, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NButton, NSwitch, NDivider, NSpace, useMessage } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const message = useMessage()
const authStore = useAuthStore()

const settings = ref({
  theme: 'dark',
  language: 'zh-CN',
  model: 'qwen-plus',
  temperature: 0.7,
  maxTokens: 4096,
  streamResponse: true,
  soundEnabled: false
})

const modelOptions = [
  { label: '通义千问 Plus', value: 'qwen-plus' },
  { label: '通义千问 Turbo', value: 'qwen-turbo' },
  { label: '通义千问 Max', value: 'qwen-max' }
]

const themeOptions = [
  { label: '深色', value: 'dark' },
  { label: '浅色', value: 'light' }
]

function handleSave() {
  message.success('设置已保存')
}

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <NLayout has-sider class="settings-layout">
    <NLayoutSider
      bordered
      content-style="padding: 20px;"
      :width="220"
    >
      <div class="settings-nav">
        <h3>设置</h3>
        <ul>
          <li class="active">通用</li>
          <li>模型</li>
          <li>界面</li>
          <li>账户</li>
        </ul>
      </div>
    </NLayoutSider>
    
    <NLayoutContent class="settings-content">
      <NCard title="通用设置">
        <NForm label-placement="left" label-width="120">
          <NFormItem label="主题">
            <NSelect v-model:value="settings.theme" :options="themeOptions" style="width: 200px" />
          </NFormItem>
          
          <NFormItem label="语言">
            <NInput v-model:value="settings.language" style="width: 200px" />
          </NFormItem>
          
          <NDivider />
          
          <NFormItem label="流式响应">
            <NSwitch v-model:value="settings.streamResponse" />
          </NFormItem>
          
          <NFormItem label="声音提示">
            <NSwitch v-model:value="settings.soundEnabled" />
          </NFormItem>
        </NForm>
      </NCard>
      
      <NCard title="模型设置" style="margin-top: 16px">
        <NForm label-placement="left" label-width="120">
          <NFormItem label="默认模型">
            <NSelect v-model:value="settings.model" :options="modelOptions" style="width: 200px" />
          </NFormItem>
          
          <NFormItem label="温度">
            <NInputNumber v-model:value="settings.temperature" style="width: 100px" :min="0" :max="2" />
          </NFormItem>
          
          <NFormItem label="最大 Token">
            <NInputNumber v-model:value="settings.maxTokens" style="width: 120px" :min="100" :max="100000" />
          </NFormItem>
        </NForm>
      </NCard>
      
      <NCard title="账户" style="margin-top: 16px">
        <NSpace vertical :size="16">
          <div>
            <strong>邮箱:</strong> {{ authStore.user?.email || '未登录' }}
          </div>
          <div>
            <strong>用户名:</strong> {{ authStore.user?.username || '未登录' }}
          </div>
          <NSpace>
            <NButton type="primary" @click="handleSave">保存设置</NButton>
            <NButton @click="handleLogout">退出登录</NButton>
          </NSpace>
        </NSpace>
      </NCard>
    </NLayoutContent>
  </NLayout>
</template>

<style scoped>
.settings-layout {
  height: 100vh;
  background: var(--bg-primary);
}

.settings-nav h3 {
  margin-bottom: 20px;
  color: var(--text-primary);
}

.settings-nav ul {
  list-style: none;
  padding: 0;
}

.settings-nav li {
  padding: 12px 16px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.2s;
}

.settings-nav li:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.settings-nav li.active {
  background: var(--primary-color);
  color: white;
}

.settings-content {
  padding: 20px;
  overflow-y: auto;
}
</style>
