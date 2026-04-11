<script setup lang="ts">
/**
 * 性能监控面板组件
 */

import { ref, computed, onMounted, onUnmounted, h } from 'vue'
import { 
  NCard, NButton, NSpace, NTag, NStatistic, NGrid, NGi,
  NDataTable, NEmpty, NProgress, useMessage,
  NTabs, NTabPane, NBadge, NAlert
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import monitoringApi from '@/api/monitoringApi'
import type { LogEntry, AlertEntry } from '@/api/monitoringApi'

const message = useMessage()

type AlertRow = AlertEntry

type LogRow = LogEntry

// 状态
const metrics = ref({
  uptime: 0,
  memory: { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 },
  cpu: { usage: 0, cores: 0 },
  requests: { total: 0, success: 0, failed: 0, avgDuration: 0 },
  tools: { total: 0, success: 0, failed: 0, avgDuration: 0 },
  connections: { websocket: 0, activeSessions: 0 },
})

const logs = ref<LogRow[]>([])
const alerts = ref<AlertRow[]>([])

const loading = ref(false)
const autoRefresh = ref(true)
const refreshInterval = ref<number | null>(null)
const selectedTab = ref('overview')

// 格式化时间
const formatUptime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

// 格式化字节
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// 格式化时间戳
const formatTimestamp = (ts: number): string => {
  return new Date(ts).toLocaleTimeString()
}

// 获取日志级别颜色
const getLevelColor = (level: string): string => {
  const colors: Record<string, string> = {
    debug: 'default',
    info: 'info',
    warn: 'warning',
    error: 'error',
    fatal: 'error',
  }
  return colors[level] || 'default'
}

// 获取告警级别
const getAlertSeverity = (alert: { acknowledged: boolean; value: number; threshold: number }): 'success' | 'warning' | 'error' => {
  if (alert.acknowledged) return 'success'
  const ratio = alert.value / alert.threshold
  if (ratio > 1.5) return 'error'
  if (ratio > 1) return 'warning'
  return 'success'
}

// 计算内存使用率
const memoryUsagePercent = computed(() => {
  if (metrics.value.memory.heapTotal === 0) return 0
  return Math.round((metrics.value.memory.heapUsed / metrics.value.memory.heapTotal) * 100)
})

// 计算请求成功率
const requestSuccessRate = computed(() => {
  const total = metrics.value.requests.total
  if (total === 0) return 100
  return Math.round((metrics.value.requests.success / total) * 100)
})

// 计算工具成功率
const toolSuccessRate = computed(() => {
  const total = metrics.value.tools.total
  if (total === 0) return 100
  return Math.round((metrics.value.tools.success / total) * 100)
})

// 获取性能指标
const fetchMetrics = async () => {
  try {
    metrics.value = await monitoringApi.getMetrics()
  } catch (error) {
    console.error('Failed to fetch metrics:', error)
  }
}

// 获取日志
const fetchLogs = async () => {
  try {
    logs.value = await monitoringApi.getLogs(50)
  } catch (error) {
    console.error('Failed to fetch logs:', error)
  }
}

// 获取告警
const fetchAlerts = async () => {
  try {
    alerts.value = await monitoringApi.getAlerts(true)
  } catch (error) {
    console.error('Failed to fetch alerts:', error)
  }
}

// 确认告警
const acknowledgeAlert = async (alertId: string) => {
  try {
    await monitoringApi.acknowledgeAlert(alertId)
    message.success('告警已确认')
    await fetchAlerts()
  } catch (error) {
    message.error('确认告警失败')
  }
}

// 刷新所有数据
const refresh = async () => {
  loading.value = true
  try {
    await Promise.all([fetchMetrics(), fetchLogs(), fetchAlerts()])
  } finally {
    loading.value = false
  }
}

// 切换自动刷新
const toggleAutoRefresh = () => {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) {
    startAutoRefresh()
  } else {
    stopAutoRefresh()
  }
}

// 启动自动刷新
const startAutoRefresh = () => {
  if (refreshInterval.value) return
  refreshInterval.value = window.setInterval(refresh, 5000)
}

// 停止自动刷新
const stopAutoRefresh = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
    refreshInterval.value = null
  }
}

// 日志表格列（使用 h()：.vue 的 script 中不能写 JSX）
const logColumns: DataTableColumns<LogRow> = [
  { title: '时间', key: 'timestamp', width: 100, render: (row) => formatTimestamp(row.timestamp) },
  {
    title: '级别',
    key: 'level',
    width: 80,
    render: (row) =>
      h(NTag, { type: getLevelColor(row.level) as any, size: 'small' }, () => row.level),
  },
  { title: '来源', key: 'source', width: 120 },
  { title: '消息', key: 'message', ellipsis: true },
]

// 告警表格列
const alertColumns: DataTableColumns<AlertRow> = [
  { title: '时间', key: 'timestamp', width: 100, render: (row) => formatTimestamp(row.timestamp) },
  { title: '名称', key: 'ruleName', width: 150 },
  { title: '指标', key: 'metric', width: 150 },
  { title: '值', key: 'value', width: 100, render: (row) => formatBytes(row.value) },
  { title: '阈值', key: 'threshold', width: 100, render: (row) => formatBytes(row.threshold) },
  {
    title: '状态',
    key: 'acknowledged',
    width: 100,
    render: (row) =>
      h(
        NTag,
        { type: row.acknowledged ? 'success' : 'error', size: 'small' },
        () => (row.acknowledged ? '已确认' : '未确认')
      ),
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    render: (row) =>
      row.acknowledged
        ? null
        : h(NButton, { size: 'small', onClick: () => acknowledgeAlert(row.id) }, () => '确认'),
  },
]

// 生命周期
onMounted(() => {
  refresh()
  if (autoRefresh.value) {
    startAutoRefresh()
  }
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div class="monitoring-panel">
    <!-- 工具栏 -->
    <div class="monitoring-toolbar">
      <NSpace>
        <NButton size="small" @click="refresh" :loading="loading">
          刷新
        </NButton>
        <NButton 
          size="small" 
          :type="autoRefresh ? 'primary' : 'default'"
          @click="toggleAutoRefresh"
        >
          {{ autoRefresh ? '自动刷新中' : '自动刷新已关闭' }}
        </NButton>
      </NSpace>

      <NSpace v-if="alerts.length > 0">
        <NBadge :value="alerts.length" :max="99">
          <NTag type="error">未处理告警</NTag>
        </NBadge>
      </NSpace>
    </div>

    <!-- 告警列表 -->
    <div v-if="alerts.length > 0" class="alerts-section">
      <NAlert 
        v-for="alert in alerts" 
        :key="alert.id"
        :type="getAlertSeverity(alert) as any"
        :title="alert.ruleName"
        closable
        @close="acknowledgeAlert(alert.id)"
      >
        {{ alert.metric }}: {{ formatBytes(alert.value) }} (阈值: {{ formatBytes(alert.threshold) }})
      </NAlert>
    </div>

    <!-- 标签页 -->
    <NTabs v-model:value="selectedTab" type="line" animated>
      <NTabPane name="overview" tab="概览">
        <div class="metrics-grid">
          <!-- 运行时间 -->
          <NCard title="运行时间" size="small">
            <NStatistic :value="formatUptime(metrics.uptime)" />
          </NCard>

          <!-- 内存使用 -->
          <NCard title="内存使用" size="small">
            <NGrid :cols="2" :x-gap="12">
              <NGi>
                <div class="stat-item">
                  <span class="stat-label">已用堆</span>
                  <span class="stat-value">{{ formatBytes(metrics.memory.heapUsed) }}</span>
                </div>
              </NGi>
              <NGi>
                <div class="stat-item">
                  <span class="stat-label">总堆</span>
                  <span class="stat-value">{{ formatBytes(metrics.memory.heapTotal) }}</span>
                </div>
              </NGi>
            </NGrid>
            <NProgress 
              type="line" 
              :percentage="memoryUsagePercent" 
              :height="8"
              :show-indicator="true"
            />
          </NCard>

          <!-- 请求统计 -->
          <NCard title="请求统计" size="small">
            <NGrid :cols="2" :x-gap="12">
              <NGi>
                <div class="stat-item">
                  <span class="stat-label">总数</span>
                  <span class="stat-value">{{ metrics.requests.total }}</span>
                </div>
              </NGi>
              <NGi>
                <div class="stat-item">
                  <span class="stat-label">平均延迟</span>
                  <span class="stat-value">{{ Math.round(metrics.requests.avgDuration) }}ms</span>
                </div>
              </NGi>
            </NGrid>
            <NProgress 
              type="line" 
              :percentage="requestSuccessRate" 
              :height="8"
              :show-indicator="true"
              status="success"
            />
            <div class="stat-details">
              <span>成功: {{ metrics.requests.success }}</span>
              <span>失败: {{ metrics.requests.failed }}</span>
            </div>
          </NCard>

          <!-- 工具统计 -->
          <NCard title="工具执行" size="small">
            <NGrid :cols="2" :x-gap="12">
              <NGi>
                <div class="stat-item">
                  <span class="stat-label">总数</span>
                  <span class="stat-value">{{ metrics.tools.total }}</span>
                </div>
              </NGi>
              <NGi>
                <div class="stat-item">
                  <span class="stat-label">平均耗时</span>
                  <span class="stat-value">{{ Math.round(metrics.tools.avgDuration) }}ms</span>
                </div>
              </NGi>
            </NGrid>
            <NProgress 
              type="line" 
              :percentage="toolSuccessRate" 
              :height="8"
              :show-indicator="true"
              status="success"
            />
            <div class="stat-details">
              <span>成功: {{ metrics.tools.success }}</span>
              <span>失败: {{ metrics.tools.failed }}</span>
            </div>
          </NCard>

          <!-- 连接统计 -->
          <NCard title="连接" size="small">
            <NGrid :cols="2" :x-gap="12">
              <NGi>
                <div class="stat-item">
                  <span class="stat-label">WebSocket</span>
                  <span class="stat-value">{{ metrics.connections.websocket }}</span>
                </div>
              </NGi>
              <NGi>
                <div class="stat-item">
                  <span class="stat-label">活跃会话</span>
                  <span class="stat-value">{{ metrics.connections.activeSessions }}</span>
                </div>
              </NGi>
            </NGrid>
          </NCard>

          <!-- CPU 信息 -->
          <NCard title="CPU" size="small">
            <NGrid :cols="2" :x-gap="12">
              <NGi>
                <div class="stat-item">
                  <span class="stat-label">核心数</span>
                  <span class="stat-value">{{ metrics.cpu.cores }}</span>
                </div>
              </NGi>
              <NGi>
                <div class="stat-item">
                  <span class="stat-label">使用率</span>
                  <span class="stat-value">{{ metrics.cpu.usage }}%</span>
                </div>
              </NGi>
            </NGrid>
          </NCard>
        </div>
      </NTabPane>

      <NTabPane name="logs" tab="日志">
        <NCard>
          <NDataTable
            :columns="logColumns"
            :data="logs"
            :bordered="false"
            :single-line="false"
            size="small"
            :pagination="{ pageSize: 20 }"
          />
          <NEmpty v-if="logs.length === 0" description="暂无日志" />
        </NCard>
      </NTabPane>

      <NTabPane name="alerts" tab="告警">
        <NCard>
          <NDataTable
            :columns="alertColumns"
            :data="alerts"
            :bordered="false"
            :single-line="false"
            size="small"
          />
          <NEmpty v-if="alerts.length === 0" description="暂无未确认的告警" />
        </NCard>
      </NTabPane>
    </NTabs>
  </div>
</template>

<style scoped>
.monitoring-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
}

.monitoring-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--n-color);
  border-radius: 8px;
}

.alerts-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  padding: 16px 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--n-text-color-3);
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
}

.stat-details {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: var(--n-text-color-3);
}
</style>
