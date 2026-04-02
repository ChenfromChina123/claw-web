<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutContent, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NButton, NSwitch, NDivider, NSpace, useMessage } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import { useTheme } from '@/composables/useTheme'
import type { ThemeConfig } from '@/themes/types'

const router = useRouter()
const message = useMessage()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const { themes: availableThemes } = useTheme()

// 从 store 获取设置
const preferences = computed(() => settingsStore.preferences)
const modelSettings = computed(() => settingsStore.model)

// 主题选项（从可用主题列表生成）
const themeOptions = computed(() => {
  return availableThemes.map((theme: ThemeConfig) => ({
    label: `${theme.icon} ${theme.name}`,
    value: theme.id,
  }))
})

// 模型选项
const modelOptions = [
  { label: '通义千问 Plus', value: 'qwen-plus' },
  { label: '通义千问 Turbo', value: 'qwen-turbo' },
  { label: '通义千问 Max', value: 'qwen-max' }
]

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

function handleReset() {
  settingsStore.resetSettings()
  message.success('设置已重置')
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
            <NSelect 
              v-model:value="preferences.theme" 
              :options="themeOptions" 
              style="width: 200px" 
            />
          </NFormItem>
          
          <NFormItem label="语言">
            <NInput 
              v-model:value="preferences.language" 
              style="width: 200px" 
            />
          </NFormItem>
          
          <NDivider />
          
          <NFormItem label="流式响应">
            <NSwitch 
              v-model:value="preferences.streamResponse" 
            />
          </NFormItem>
          
          <NFormItem label="声音提示">
            <NSwitch 
              v-model:value="preferences.soundEnabled" 
            />
          </NFormItem>
        </NForm>
      </NCard>
      
      <NCard title="模型设置" style="margin-top: 16px">
        <NForm label-placement="left" label-width="120">
          <NFormItem label="默认模型">
            <NSelect 
              v-model:value="modelSettings.model" 
              :options="modelOptions" 
              style="width: 200px" 
            />
          </NFormItem>
          
          <NFormItem label="温度">
            <NInputNumber 
              v-model:value="modelSettings.temperature" 
              style="width: 100px" 
              :min="0" 
              :max="2"
              :step="0.1"
            />
          </NFormItem>
          
          <NFormItem label="最大 Token">
            <NInputNumber 
              v-model:value="modelSettings.maxTokens" 
              style="width: 120px" 
              :min="100" 
              :max="100000"
              :step="100"
            />
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
            <NButton @click="handleReset">重置设置</NButton>
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
