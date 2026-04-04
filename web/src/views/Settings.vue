<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutContent, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NButton, NSwitch, NSpace, useMessage } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import ThemeSwitcher from '@/components/common/ThemeSwitcher.vue'

const router = useRouter()
const message = useMessage()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()

type SettingsSection = 'general' | 'model' | 'account'

const activeSection = ref<SettingsSection>('general')

const navItems: { key: SettingsSection; label: string }[] = [
  { key: 'general', label: '通用' },
  { key: 'model', label: '模型' },
  { key: 'account', label: '账户' },
]

// 从 store 获取设置
const preferences = computed(() => settingsStore.preferences)
const modelSettings = computed(() => settingsStore.model)

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

function goLogin() {
  router.push('/login')
}

onMounted(() => {
  authStore.syncUserFromToken()
  if (authStore.isLoggedIn) {
    void authStore.fetchUser()
  }
})
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
        <ul role="tablist" aria-label="设置分类">
          <li
            v-for="item in navItems"
            :key="item.key"
            role="tab"
            :tabindex="activeSection === item.key ? 0 : -1"
            :aria-selected="activeSection === item.key"
            :class="{ active: activeSection === item.key }"
            @click="activeSection = item.key"
            @keydown.enter.prevent="activeSection = item.key"
            @keydown.space.prevent="activeSection = item.key"
          >
            {{ item.label }}
          </li>
        </ul>
      </div>
    </NLayoutSider>
    
    <NLayoutContent class="settings-content">
      <NCard v-show="activeSection === 'general'" title="通用设置">
        <NForm label-placement="left" label-width="120">
          <NFormItem label="主题" class="settings-theme-item">
            <ThemeSwitcher variant="settings" />
          </NFormItem>

          <NFormItem label="语言">
            <NInput v-model:value="preferences.language" style="width: 200px" />
          </NFormItem>

          <NFormItem label="流式响应">
            <NSwitch v-model:value="preferences.streamResponse" />
          </NFormItem>

          <NFormItem label="声音提示">
            <NSwitch v-model:value="preferences.soundEnabled" />
          </NFormItem>
        </NForm>
      </NCard>

      <NCard v-show="activeSection === 'model'" title="模型设置">
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

      <NCard v-show="activeSection === 'account'" title="账户">
        <NSpace vertical :size="16">
          <template v-if="authStore.isLoggedIn && authStore.user">
            <div>
              <strong>邮箱:</strong> {{ authStore.user.email || '—' }}
            </div>
            <div>
              <strong>用户名:</strong> {{ authStore.user.username || '—' }}
            </div>
            <NSpace>
              <NButton @click="handleReset">重置设置</NButton>
              <NButton type="primary" @click="handleLogout">退出登录</NButton>
            </NSpace>
          </template>
          <template v-else>
            <p class="account-hint">当前未登录或登录已失效，部分功能不可用。</p>
            <NSpace>
              <NButton type="primary" @click="goLogin">前往登录</NButton>
              <NButton @click="handleReset">重置本地设置</NButton>
            </NSpace>
          </template>
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

.account-hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

/* 主题切换控件贴表单内容区左侧，避免被拉伸到整行最右 */
.settings-theme-item :deep(.n-form-item-blank) {
  justify-content: flex-start;
}
</style>
