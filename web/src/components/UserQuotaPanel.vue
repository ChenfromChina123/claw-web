<script setup lang="ts">
/**
 * 用户配额面板组件
 * 显示用户的等级、配额信息和使用情况
 */

import { ref, computed, onMounted, watch } from 'vue'
import { 
  NCard, NSpace, NTag, NProgress, NGrid, NGi, NStatistic,
  NButton, NAlert, NIcon, NTooltip, useMessage, NEmpty
} from 'naive-ui'
import { 
  PersonOutline, HardwareChipOutline, ServerOutline,
  DocumentOutline, TimeOutline, WarningOutline,
  CheckmarkCircleOutline, TrendingUpOutline
} from '@vicons/ionicons5'
import { userTierApi, UserTier, type HardwareQuota, type ResourceUsageStats } from '@/api/userTierApi'

const message = useMessage()

const loading = ref(false)
const quotaInfo = ref<{
  tier: UserTier
  quota: HardwareQuota
  hasCustomQuota: boolean
} | null>(null)

const usageStats = ref<ResourceUsageStats | null>(null)
const showWarning = ref(false)

const tierColors: Record<UserTier, string> = {
  [UserTier.FREE]: 'default',
  [UserTier.BASIC]: 'info',
  [UserTier.PRO]: 'success',
  [UserTier.ENTERPRISE]: 'warning',
  [UserTier.ADMIN]: 'error'
}

const tierNames: Record<UserTier, string> = {
  [UserTier.FREE]: '免费用户',
  [UserTier.BASIC]: '基础会员',
  [UserTier.PRO]: '专业会员',
  [UserTier.ENTERPRISE]: '企业会员',
  [UserTier.ADMIN]: '管理员'
}

const tierIcons: Record<UserTier, any> = {
  [UserTier.FREE]: PersonOutline,
  [UserTier.BASIC]: HardwareChipOutline,
  [UserTier.PRO]: ServerOutline,
  [UserTier.ENTERPRISE]: DocumentOutline,
  [UserTier.ADMIN]: TimeOutline
}

const memoryUsagePercent = computed(() => {
  return usageStats.value?.usage.memory?.percent || 0
})

const storageUsagePercent = computed(() => {
  return usageStats.value?.usage.storage?.percent || 0
})

const sessionUsagePercent = computed(() => {
  return usageStats.value?.usage.sessions?.percent || 0
})

const overallUsagePercent = computed(() => {
  return usageStats.value?.overallUsagePercent || 0
})

const usageStatus = computed(() => {
  const percent = overallUsagePercent.value
  if (percent >= 90) return { type: 'error' as const, text: '资源紧张', color: '#d03050' }
  if (percent >= 70) return { type: 'warning' as const, text: '资源充足', color: '#f0a020' }
  return { type: 'success' as const, text: '资源充裕', color: '#18a058' }
})

const warnings = computed(() => {
  const warns: string[] = []
  
  if (memoryUsagePercent.value >= 80) {
    warns.push(`内存使用率已达 ${memoryUsagePercent.value.toFixed(1)}%，建议清理不必要的会话`)
  }
  
  if (storageUsagePercent.value >= 80) {
    warns.push(`存储空间使用率已达 ${storageUsagePercent.value.toFixed(1)}%，建议清理文件`)
  }
  
  if (sessionUsagePercent.value >= 80) {
    warns.push(`会话数已达上限的 ${sessionUsagePercent.value.toFixed(1)}%，请关闭不活跃的会话`)
  }
  
  return warns
})

const fetchQuotaInfo = async () => {
  loading.value = true
  try {
    const data = await userTierApi.getMyQuota()
    quotaInfo.value = {
      tier: data.tier,
      quota: data.quota,
      hasCustomQuota: data.hasCustomQuota
    }
    
    const stats = await userTierApi.getUsageStats(data.userId)
    usageStats.value = stats
    
    if (warnings.value.length > 0) {
      showWarning.value = true
    }
  } catch (error) {
    console.error('获取配额信息失败:', error)
    message.error('获取配额信息失败')
  } finally {
    loading.value = false
  }
}

const formatMB = (mb: number): string => {
  if (mb < 1024) return `${mb} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

const formatPercent = (percent: number): string => {
  return `${percent.toFixed(1)}%`
}

onMounted(() => {
  fetchQuotaInfo()
})

watch(warnings, (newWarnings) => {
  if (newWarnings.length > 0) {
    showWarning.value = true
  }
})
</script>

<template>
  <div class="user-quota-panel">
    <NCard title="我的套餐" :bordered="false" class="quota-card">
      <template #header-extra>
        <NTag :type="tierColors[quotaInfo?.tier || UserTier.FREE]" size="large">
          <template #icon>
            <NIcon :component="tierIcons[quotaInfo?.tier || UserTier.FREE]" />
          </template>
          {{ tierNames[quotaInfo?.tier || UserTier.FREE] }}
        </NTag>
      </template>

      <NSpin :show="loading">
        <div v-if="quotaInfo" class="quota-content">
          <NAlert
            v-if="showWarning && warnings.length > 0"
            type="warning"
            title="资源使用警告"
            closable
            @close="showWarning = false"
            class="warning-alert"
          >
            <div v-for="(warning, index) in warnings" :key="index" class="warning-item">
              <NIcon :component="WarningOutline" color="#f0a020" />
              <span>{{ warning }}</span>
            </div>
          </NAlert>

          <div class="overall-usage">
            <div class="usage-header">
              <span class="usage-title">总体资源使用率</span>
              <NTag :type="usageStatus.type" size="small">
                {{ usageStatus.text }}
              </NTag>
            </div>
            <NProgress
              type="line"
              :percentage="overallUsagePercent"
              :status="usageStatus.type"
              :height="24"
              :border-radius="12"
              :fill-border-radius="12"
            >
              <template #default="{ percentage }">
                <span style="color: white; font-weight: bold;">{{ formatPercent(percentage) }}</span>
              </template>
            </NProgress>
          </div>

          <NGrid :cols="3" :x-gap="16" :y-gap="16" class="resource-grid">
            <NGi>
              <div class="resource-item">
                <div class="resource-header">
                  <NIcon :component="HardwareChipOutline" size="20" />
                  <span class="resource-title">CPU</span>
                </div>
                <NProgress
                  type="circle"
                  :percentage="usageStats?.usage.cpu?.percent || 0"
                  :stroke-width="20"
                  :show-indicator="true"
                >
                  <template #default="{ percentage }">
                    <span class="progress-text">{{ percentage.toFixed(1) }}%</span>
                  </template>
                </NProgress>
                <div class="resource-detail">
                  {{ usageStats?.usage.cpu?.used || 0 }} / {{ quotaInfo.quota.cpuLimit }} 核
                </div>
              </div>
            </NGi>

            <NGi>
              <div class="resource-item">
                <div class="resource-header">
                  <NIcon :component="ServerOutline" size="20" />
                  <span class="resource-title">内存</span>
                </div>
                <NProgress
                  type="circle"
                  :percentage="memoryUsagePercent"
                  :stroke-width="20"
                  :status="memoryUsagePercent >= 80 ? 'error' : memoryUsagePercent >= 60 ? 'warning' : 'success'"
                >
                  <template #default="{ percentage }">
                    <span class="progress-text">{{ percentage.toFixed(1) }}%</span>
                  </template>
                </NProgress>
                <div class="resource-detail">
                  {{ formatMB(usageStats?.usage.memory?.used || 0) }} / {{ formatMB(quotaInfo.quota.memoryLimitMB) }}
                </div>
              </div>
            </NGi>

            <NGi>
              <div class="resource-item">
                <div class="resource-header">
                  <NIcon :component="DocumentOutline" size="20" />
                  <span class="resource-title">存储</span>
                </div>
                <NProgress
                  type="circle"
                  :percentage="storageUsagePercent"
                  :stroke-width="20"
                  :status="storageUsagePercent >= 80 ? 'error' : storageUsagePercent >= 60 ? 'warning' : 'success'"
                >
                  <template #default="{ percentage }">
                    <span class="progress-text">{{ percentage.toFixed(1) }}%</span>
                  </template>
                </NProgress>
                <div class="resource-detail">
                  {{ formatMB(usageStats?.usage.storage?.used || 0) }} / {{ formatMB(quotaInfo.quota.storageQuotaMB) }}
                </div>
              </div>
            </NGi>
          </NGrid>

          <NGrid :cols="2" :x-gap="16" :y-gap="16" class="stats-grid">
            <NGi>
              <NCard size="small" class="stat-card">
                <NStatistic label="活跃会话" :value="usageStats?.usage.sessions?.used || 0">
                  <template #suffix>
                    <span class="stat-suffix">/ {{ quotaInfo.quota.maxSessions }}</span>
                  </template>
                </NStatistic>
                <NProgress
                  type="line"
                  :percentage="sessionUsagePercent"
                  :status="sessionUsagePercent >= 80 ? 'error' : 'warning'"
                  :show-indicator="false"
                  :height="6"
                />
              </NCard>
            </NGi>

            <NGi>
              <NCard size="small" class="stat-card">
                <NStatistic label="PTY进程" :value="usageStats?.usage.pty?.used || 0">
                  <template #suffix>
                    <span class="stat-suffix">/ {{ quotaInfo.quota.maxPtyProcesses }}</span>
                  </template>
                </NStatistic>
                <NProgress
                  type="line"
                  :percentage="usageStats?.usage.pty?.percent || 0"
                  :show-indicator="false"
                  :height="6"
                />
              </NCard>
            </NGi>

            <NGi>
              <NCard size="small" class="stat-card">
                <NStatistic label="文件数量" :value="usageStats?.usage.files?.used || 0">
                  <template #suffix>
                    <span class="stat-suffix">/ {{ quotaInfo.quota.maxFiles }}</span>
                  </template>
                </NStatistic>
                <NProgress
                  type="line"
                  :percentage="usageStats?.usage.files?.percent || 0"
                  :show-indicator="false"
                  :height="6"
                />
              </NCard>
            </NGi>

            <NGi>
              <NCard size="small" class="stat-card">
                <NStatistic label="单文件限制" :value="quotaInfo.quota.maxFileSizeMB">
                  <template #suffix>
                    <span class="stat-suffix">MB</span>
                  </template>
                </NStatistic>
              </NCard>
            </NGi>
          </NGrid>

          <div class="quota-description">
            <NIcon :component="CheckmarkCircleOutline" color="#18a058" />
            <span>{{ quotaInfo.quota.description }}</span>
          </div>

          <div v-if="quotaInfo.hasCustomQuota" class="custom-quota-badge">
            <NTag type="info" size="small">
              <template #icon>
                <NIcon :component="TrendingUpOutline" />
              </template>
              已启用自定义配额
            </NTag>
          </div>
        </div>

        <NEmpty v-else description="暂无配额信息" />
      </NSpin>
    </NCard>
  </div>
</template>

<style scoped>
.user-quota-panel {
  padding: 20px;
}

.quota-card {
  max-width: 900px;
  margin: 0 auto;
}

.quota-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.warning-alert {
  margin-bottom: 16px;
}

.warning-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.warning-item:last-child {
  margin-bottom: 0;
}

.overall-usage {
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  color: white;
}

.usage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.usage-title {
  font-size: 16px;
  font-weight: bold;
}

.resource-grid {
  margin-top: 20px;
}

.resource-item {
  text-align: center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  transition: all 0.3s ease;
}

.resource-item:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
}

.resource-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
}

.resource-title {
  font-size: 14px;
  font-weight: 500;
}

.progress-text {
  font-size: 16px;
  font-weight: bold;
}

.resource-detail {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
}

.stats-grid {
  margin-top: 20px;
}

.stat-card {
  text-align: center;
}

.stat-suffix {
  font-size: 14px;
  color: #999;
  margin-left: 4px;
}

.quota-description {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(24, 160, 88, 0.1);
  border-radius: 8px;
  font-size: 14px;
  color: #666;
}

.custom-quota-badge {
  text-align: center;
  margin-top: 12px;
}
</style>
