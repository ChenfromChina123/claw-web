<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NLayout, NLayoutSider, NLayoutContent, NCard, NForm, NFormItem, NInput, NInputNumber, NSelect, NButton, NSwitch, NSpace, useMessage } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useSettingsStore } from '@/stores/settings'
import ThemeSwitcher from '@/components/common/ThemeSwitcher.vue'
import UserQuotaPanel from '@/components/UserQuotaPanel.vue'
import TierComparison from '@/components/TierComparison.vue'
import UserManagement from '@/components/UserManagement.vue'
import MonitoringPanel from '@/components/MonitoringPanel.vue'

/**
 * 是否为内嵌模式（在编辑器标签页中显示）
 */
const props = defineProps<{
  embedded?: boolean
}>()

const router = useRouter()
const message = useMessage()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()

type SettingsSection = 'general' | 'model' | 'agent' | 'visualization' | 'account' | 'quota' | 'tiers' | 'users' | 'monitoring'

const activeSection = ref<SettingsSection>('general')

const navItems: { key: SettingsSection; label: string; adminOnly?: boolean }[] = [
  { key: 'general', label: '通用' },
  { key: 'model', label: '模型' },
  { key: 'agent', label: 'Agent' },
  { key: 'visualization', label: '可视化' },
  { key: 'quota', label: '我的配额' },
  { key: 'tiers', label: '套餐对比' },
  { key: 'monitoring', label: '性能监控', adminOnly: true },
  { key: 'users', label: '用户管理', adminOnly: true },
  { key: 'account', label: '账户' },
]

const isAdmin = computed(() => {
  return authStore.user?.isAdmin || false
})

const filteredNavItems = computed(() => {
  return navItems.filter(item => !item.adminOnly || isAdmin.value)
})

// 从 store 获取设置
const preferences = computed(() => settingsStore.preferences)
const modelSettings = computed(() => settingsStore.model)
const agentSettings = computed(() => settingsStore.agent)

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
  <NLayout :has-sider="!embedded" :class="['settings-layout', { 'settings-embedded': embedded }]">
    <NLayoutSider
      v-if="!embedded"
      bordered
      content-style="padding: 20px;"
      :width="220"
    >
      <div class="settings-nav">
        <h3>设置</h3>
        <ul role="tablist" aria-label="设置分类">
          <li
            v-for="item in filteredNavItems"
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
      <!-- 内嵌模式下的顶部导航 -->
      <div v-if="embedded" class="settings-embedded-nav">
        <button
          v-for="item in filteredNavItems"
          :key="item.key"
          class="settings-embedded-nav-btn"
          :class="{ active: activeSection === item.key }"
          @click="activeSection = item.key"
        >
          {{ item.label }}
        </button>
      </div>

      <NCard v-show="activeSection === 'general'" title="通用设置" :size="embedded ? 'small' : 'medium'">
        <NForm :label-placement="embedded ? 'top' : 'left'" :label-width="embedded ? undefined : 120">
          <NFormItem label="主题" class="settings-theme-item">
            <ThemeSwitcher variant="settings" />
          </NFormItem>

          <NFormItem label="语言">
            <NInput v-model:value="preferences.language" :style="embedded ? 'width: 100%' : 'width: 200px'" />
          </NFormItem>

          <NFormItem label="流式响应">
            <NSwitch v-model:value="preferences.streamResponse" />
          </NFormItem>

          <NFormItem label="声音提示">
            <NSwitch v-model:value="preferences.soundEnabled" />
          </NFormItem>
        </NForm>
      </NCard>

      <NCard v-show="activeSection === 'model'" title="模型设置" :size="embedded ? 'small' : 'medium'">
        <NForm :label-placement="embedded ? 'top' : 'left'" :label-width="embedded ? undefined : 120">
          <NFormItem label="默认模型">
            <NSelect
              v-model:value="modelSettings.model"
              :options="modelOptions"
              :style="embedded ? 'width: 100%' : 'width: 200px'"
            />
          </NFormItem>

          <NFormItem label="温度">
            <NInputNumber
              v-model:value="modelSettings.temperature"
              :style="embedded ? 'width: 100%' : 'width: 100px'"
              :min="0"
              :max="2"
              :step="0.1"
            />
          </NFormItem>

          <NFormItem label="最大 Token">
            <NInputNumber
              v-model:value="modelSettings.maxTokens"
              :style="embedded ? 'width: 100%' : 'width: 120px'"
              :min="100"
              :max="100000"
              :step="100"
            />
          </NFormItem>
        </NForm>
      </NCard>

      <NCard v-show="activeSection === 'agent'" title="Agent 设置" :size="embedded ? 'small' : 'medium'">
        <NForm :label-placement="embedded ? 'top' : 'left'" :label-width="embedded ? undefined : 140">
          <NFormItem label="最大循环次数">
            <NInputNumber
              v-model:value="agentSettings.maxIterations"
              :style="embedded ? 'width: 100%' : 'width: 120px'"
              :min="1"
              :max="100"
              :step="1"
            />
          </NFormItem>

          <NFormItem label="调试模式">
            <NSwitch v-model:value="agentSettings.debugMode" />
          </NFormItem>

          <NFormItem label="超时时间（秒）">
            <NInputNumber
              v-model:value="agentSettings.timeout"
              :style="embedded ? 'width: 100%' : 'width: 120px'"
              :min="30"
              :max="3600"
              :step="30"
            />
          </NFormItem>
        </NForm>
      </NCard>

      <NCard v-show="activeSection === 'visualization'" title="可视化设置" :size="embedded ? 'small' : 'medium'">
        <NForm :label-placement="embedded ? 'top' : 'left'" :label-width="embedded ? undefined : 140">
          <NFormItem label="显示流程图">
            <NSwitch v-model:value="preferences.showFlowVisualization" />
          </NFormItem>

          <NFormItem label="显示知识卡片">
            <NSwitch v-model:value="preferences.showKnowledgeCards" />
          </NFormItem>

          <NFormItem label="增强工具展示">
            <NSwitch v-model:value="preferences.useEnhancedToolDisplay" />
          </NFormItem>
        </NForm>
      </NCard>

      <div v-show="activeSection === 'quota'" class="settings-quota-section">
        <UserQuotaPanel />
      </div>

      <div v-show="activeSection === 'tiers'" class="settings-tiers-section">
        <TierComparison />
      </div>

      <div v-show="activeSection === 'users' && isAdmin" class="settings-users-section">
        <UserManagement />
      </div>

      <div v-show="activeSection === 'monitoring' && isAdmin" class="settings-monitoring-section">
        <MonitoringPanel />
      </div>

      <NCard v-show="activeSection === 'account'" title="账户" :size="embedded ? 'small' : 'medium'">
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

.settings-layout.settings-embedded {
  height: 100%;
  background: #1e1e1e;
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

/* 内嵌模式样式 */
.settings-layout.settings-embedded .settings-content {
  padding: 12px;
}

/* 内嵌模式顶部导航 */
.settings-embedded-nav {
  display: flex;
  gap: 4px;
  padding: 8px 0 12px;
  border-bottom: 1px solid #333;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.settings-embedded-nav-btn {
  padding: 6px 12px;
  border: none;
  background: #2d2d2d;
  color: #aaa;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-embedded-nav-btn:hover {
  background: #383838;
  color: #fff;
}

.settings-embedded-nav-btn.active {
  background: #007acc;
  color: #fff;
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

/* 内嵌模式下卡片样式 */
.settings-embedded :deep(.n-card) {
  background: #252526;
  border: 1px solid #3c3c3c;
}
</style>
