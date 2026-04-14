<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, h } from 'vue'
import {
  NCard,
  NGrid,
  NGi,
  NSpace,
  NStatistic,
  NProgress,
  NSpin,
  NTag,
  NDataTable,
  NButton,
  NEmpty,
  useMessage
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  getHealthStatus,
  getResourceUsage,
  getContainerStatus,
  getPerformanceStats,
  formatBytes,
  type HealthStatus,
  type ResourceUsage,
  type ContainerStatus,
  type ContainerInfo,
  type PerformanceStats
} from '@/api/monitoringApi'

const message = useMessage()

const healthStatus = ref<HealthStatus | null>(null)
const resourceUsage = ref<ResourceUsage | null>(null)
const containerStatus = ref<ContainerStatus | null>(null)
const performanceStats = ref<PerformanceStats | null>(null)

const loading = ref(false)
const lastUpdate = ref<string>('')

let refreshTimer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await fetchData()
  refreshTimer = setInterval(() => {
    void fetchData()
  }, 30000)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})

async function fetchData() {
  loading.value = true
  try {
    const [health, resources, containers, perf] = await Promise.all([
      getHealthStatus().catch((e) => {
        console.error('获取健康状态失败:', e)
        return null
      }),
      getResourceUsage().catch((e) => {
        console.error('获取资源使用情况失败:', e)
        return null
      }),
      getContainerStatus().catch((e) => {
        console.error('获取容器状态失败:', e)
        return null
      }),
      getPerformanceStats().catch((e) => {
        console.error('获取性能统计失败:', e)
        return null
      })
    ])

    healthStatus.value = health
    resourceUsage.value = resources
    containerStatus.value = containers
    performanceStats.value = perf
    lastUpdate.value = new Date().toLocaleTimeString()
  } catch (error) {
    console.error('获取监控数据失败:', error)
    message.error('获取监控数据失败')
  } finally {
    loading.value = false
  }
}

function handleRefresh() {
  void fetchData()
}

const cpuUsagePercent = computed(() => {
  if (!resourceUsage.value) return 0
  return Math.min(100, Math.max(0, resourceUsage.value.cpu.usagePercent))
})

const memoryUsagePercent = computed(() => {
  if (!resourceUsage.value) return 0
  return parseFloat(resourceUsage.value.memory.usagePercent) || 0
})

const healthStatusColor = computed(() => {
  if (!healthStatus.value) return 'default'
  return healthStatus.value.status === 'healthy' ? 'success' : 'warning'
})

const healthStatusText = computed(() => {
  if (!healthStatus.value) return '未知'
  return healthStatus.value.status === 'healthy' ? '健康' : '降级'
})

const containerColumns: DataTableColumns<ContainerInfo> = [
  {
    title: '名称',
    key: 'name',
    width: 200,
    ellipsis: { tooltip: true }
  },
  {
    title: '状态',
    key: 'state',
    width: 100,
    render(row) {
      const type = row.state === 'running' ? 'success' : 'error'
      const text = row.state === 'running' ? '运行中' : '已停止'
      return h(NTag, { type, size: 'small' }, { default: () => text })
    }
  },
  {
    title: 'CPU',
    key: 'cpu',
    width: 100,
    render(row) {
      if (!row.cpu) return '-'
      return row.cpu
    }
  },
  {
    title: '内存',
    key: 'memPerc',
    width: 100,
    render(row) {
      if (!row.memPerc) return '-'
      return row.memPerc
    }
  },
  {
    title: '镜像',
    key: 'image',
    ellipsis: { tooltip: true }
  },
  {
    title: '端口',
    key: 'ports',
    width: 150,
    ellipsis: { tooltip: true }
  }
]
</script>

<template>
  <div class="monitoring-panel">
    <div class="monitoring-header">
      <h3>系统监控</h3>
      <NButton size="small" :loading="loading" @click="handleRefresh">
        刷新
      </NButton>
      <span v-if="lastUpdate" class="last-update">最后更新: {{ lastUpdate }}</span>
    </div>

    <NSpin :show="loading">
      <NCard title="系统健康状态" size="small" class="monitoring-card">
        <NGrid :cols="3" :x-gap="12" :y-gap="12">
          <NGi>
            <NStatistic label="总体状态">
              <NTag :type="healthStatusColor" size="large">
                {{ healthStatusText }}
              </NTag>
            </NStatistic>
          </NGi>
          <NGi>
            <NStatistic label="数据库">
              <NTag :type="healthStatus?.components.database.status === 'healthy' ? 'success' : 'error'" size="small">
                {{ healthStatus?.components.database.message || '-' }}
              </NTag>
            </NStatistic>
          </NGi>
          <NGi>
            <NStatistic label="Docker">
              <NTag :type="healthStatus?.components.docker.status === 'healthy' ? 'success' : 'error'" size="small">
                {{ healthStatus?.components.docker.message || '-' }}
              </NTag>
            </NStatistic>
          </NGi>
        </NGrid>
      </NCard>

      <NCard title="资源使用情况" size="small" class="monitoring-card">
        <NGrid :cols="2" :x-gap="24" :y-gap="16">
          <NGi>
            <div class="resource-item">
              <div class="resource-label">
                <span>CPU 使用率</span>
                <span class="resource-value">{{ cpuUsagePercent.toFixed(1) }}%</span>
              </div>
              <NProgress
                type="line"
                :percentage="cpuUsagePercent"
                :indicator-placement="'inside'"
                :status="cpuUsagePercent > 80 ? 'error' : cpuUsagePercent > 60 ? 'warning' : 'success'"
              />
              <div class="resource-detail">
                {{ resourceUsage?.cpu.model || '-' }} | {{ resourceUsage?.cpu.coreCount || 0 }} 核
                | 负载: {{ resourceUsage?.cpu.loadAverage?.join(', ') || '-' }}
              </div>
            </div>
          </NGi>
          <NGi>
            <div class="resource-item">
              <div class="resource-label">
                <span>内存使用率</span>
                <span class="resource-value">{{ memoryUsagePercent.toFixed(1) }}%</span>
              </div>
              <NProgress
                type="line"
                :percentage="memoryUsagePercent"
                :indicator-placement="'inside'"
                :status="memoryUsagePercent > 80 ? 'error' : memoryUsagePercent > 60 ? 'warning' : 'success'"
              />
              <div class="resource-detail">
                已用: {{ formatBytes(resourceUsage?.memory.usedBytes || 0) }} /
                总计: {{ formatBytes(resourceUsage?.memory.totalBytes || 0) }}
              </div>
            </div>
          </NGi>
        </NGrid>
      </NCard>

      <NCard title="性能统计" size="small" class="monitoring-card">
        <NGrid :cols="4" :x-gap="12" :y-gap="12">
          <NGi>
            <NStatistic label="数据库查询">
              {{ performanceStats?.database.queries || 0 }}
            </NStatistic>
          </NGi>
          <NGi>
            <NStatistic label="数据库连接">
              {{ performanceStats?.database.connections || 0 }}
            </NStatistic>
          </NGi>
          <NGi>
            <NStatistic label="慢查询">
              {{ performanceStats?.database.slowQueries || 0 }}
            </NStatistic>
          </NGi>
          <NGi>
            <NStatistic label="运行容器">
              {{ performanceStats?.containers.running || 0 }}
            </NStatistic>
          </NGi>
        </NGrid>
      </NCard>

      <NCard title="容器管理" size="small" class="monitoring-card">
        <template #header-extra>
          <NSpace>
            <NTag type="success" size="small">运行中: {{ containerStatus?.running || 0 }}</NTag>
            <NTag type="error" size="small">已停止: {{ containerStatus?.stopped || 0 }}</NTag>
          </NSpace>
        </template>
        <NDataTable
          v-if="containerStatus?.containers?.length"
          :columns="containerColumns"
          :data="containerStatus.containers"
          :bordered="false"
          :single-line="false"
          size="small"
          :max-height="300"
          :pagination="false"
        />
        <NEmpty v-else description="暂无容器数据" />
      </NCard>
    </NSpin>
  </div>
</template>

<style scoped>
.monitoring-panel {
  padding: 0;
}

.monitoring-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.monitoring-header h3 {
  margin: 0;
  flex: 1;
}

.last-update {
  font-size: 12px;
  color: var(--text-secondary, #999);
}

.monitoring-card {
  margin-bottom: 16px;
}

.resource-item {
  padding: 8px 0;
}

.resource-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
}

.resource-value {
  font-weight: 600;
  color: var(--primary-color, #18a058);
}

.resource-detail {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-secondary, #999);
}
</style>
