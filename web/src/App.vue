<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NDialogProvider, NNotificationProvider, darkTheme, lightTheme } from 'naive-ui'
import { computed, onMounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'
import AgentTaskMonitorPanel from '@/components/AgentTaskMonitorPanel.vue'

const { currentTheme, getNaiveUiOverrides } = useTheme()
const authStore = useAuthStore()

/** 根据当前主题选择 Naive UI 主题 */
const naiveUiTheme = computed(() => currentTheme.value.isDark ? darkTheme : lightTheme)

/** 获取主题覆盖配置 */
const themeOverrides = computed(() => getNaiveUiOverrides(currentTheme.value))

onMounted(async () => {
  document.documentElement.classList.add(currentTheme.value.isDark ? 'dark' : 'light')
  authStore.syncUserFromToken()
  if (authStore.isLoggedIn) {
    try {
      await authStore.fetchUser()
    } catch (error: any) {
      // 如果 token 无效（401），自动登出并跳转到登录页
      if (error?.response?.status === 401) {
        console.log('[App] Token 已过期或无效，自动登出')
        authStore.logout()
        window.location.href = '/login'
      }
    }
  }
})
</script>

<template>
  <NConfigProvider
    :theme="naiveUiTheme"
    :theme-overrides="themeOverrides"
    class="app-provider"
  >
    <NMessageProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <div class="app-layout">
            <!-- 主内容区 -->
            <main class="app-main">
              <router-view />
            </main>

            <!-- Agent任务监控面板 - 全局持久化悬浮组件 -->
            <AgentTaskMonitorPanel v-if="authStore.isLoggedIn" />
          </div>
        </NNotificationProvider>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
.app-provider {
  width: 100%;
  height: 100%;
}

.app-layout {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.app-main {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  min-height: 0;
}

</style>
