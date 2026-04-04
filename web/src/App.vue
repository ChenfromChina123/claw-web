<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NDialogProvider, NNotificationProvider, darkTheme, lightTheme } from 'naive-ui'
import { computed, onMounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'

const { currentTheme, getNaiveUiOverrides } = useTheme()
const authStore = useAuthStore()

/** 根据当前主题选择 Naive UI 主题 */
const naiveUiTheme = computed(() => currentTheme.value.isDark ? darkTheme : lightTheme)

/** 获取主题覆盖配置 */
const themeOverrides = computed(() => getNaiveUiOverrides(currentTheme.value))

onMounted(() => {
  document.documentElement.classList.add(currentTheme.value.isDark ? 'dark' : 'light')
  authStore.syncUserFromToken()
  if (authStore.isLoggedIn) {
    void authStore.fetchUser()
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
