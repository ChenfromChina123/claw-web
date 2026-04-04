<script setup lang="ts">
/**
 * 集中展示 INTEGRATION.md 中 Phase 3 的 Web 组件（工具 / MCP / 监控 / 技能）
 */
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NTabs, NTabPane, NButton, NSpace } from 'naive-ui'
import ToolPanel from '@/components/ToolPanel.vue'
import MCPServersPage from '@/views/MCPServers.vue'
import MonitoringPanel from '@/components/MonitoringPanel.vue'
import SkillMarket from '@/components/SkillMarket.vue'

const router = useRouter()
const route = useRoute()

const validTabs = ['tools', 'mcp', 'skills', 'monitoring'] as const
type TabName = (typeof validTabs)[number]

function isTabName(v: unknown): v is TabName {
  return typeof v === 'string' && (validTabs as readonly string[]).includes(v)
}

const activeTab = ref<TabName>('tools')

watch(
  () => route.query.tab,
  (q) => {
    if (isTabName(q)) activeTab.value = q
  },
  { immediate: true }
)

watch(activeTab, (tab) => {
  if (route.query.tab === tab) return
  router.replace({ path: '/integration', query: { ...route.query, tab } })
})

function goChat() {
  router.push('/chat')
}
</script>

<template>
  <div class="integration-hub">
    <div class="hub-header">
      <NSpace align="center" justify="space-between" style="width: 100%">
        <NButton quaternary @click="goChat">← 返回聊天</NButton>
      </NSpace>
    </div>

    <NTabs v-model:value="activeTab" type="line" animated class="hub-tabs">
      <NTabPane name="tools" tab="工具面板" display-directive="show:lazy">
        <div class="hub-pane">
          <ToolPanel />
        </div>
      </NTabPane>
      <NTabPane name="mcp" tab="MCP 服务器" display-directive="show:lazy">
        <div class="hub-pane">
          <MCPServersPage />
        </div>
      </NTabPane>
      <NTabPane name="skills" tab="技能市场" display-directive="show:lazy">
        <div class="hub-pane">
          <SkillMarket />
        </div>
      </NTabPane>
      <NTabPane name="monitoring" tab="性能监控" display-directive="show:lazy">
        <div class="hub-pane">
          <MonitoringPanel />
        </div>
      </NTabPane>
    </NTabs>
  </div>
</template>

<style scoped>
.integration-hub {
  min-height: 100vh;
  padding: 16px 20px 24px;
  background: var(--bg-primary);
  box-sizing: border-box;
}

.hub-header {
  margin-bottom: 12px;
}

.hub-tabs :deep(.n-tabs-nav) {
  margin-bottom: 12px;
}

/* Tab 内容区占满宽度，避免内部 master-detail 被挤到视口外 */
.hub-tabs :deep(.n-tabs-pane-wrapper) {
  width: 100%;
  overflow: hidden;
}

.hub-tabs :deep(.n-tab-pane) {
  width: 100%;
  box-sizing: border-box;
}

.hub-pane {
  width: 100%;
  max-width: 100%;
  height: 680px;
  margin: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.hub-pane > * {
  height: 100%;
}
</style>
