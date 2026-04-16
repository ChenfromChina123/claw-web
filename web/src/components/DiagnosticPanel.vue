<script setup lang="ts">
/**
 * 集成诊断面板组件
 * 
 * 显示所有集成组件的健康状态，包括：
 * - ToolRegistry: 工具注册中心
 * - MCPBridge: MCP 桥接
 * - CLIToolLoader: CLI 工具加载器
 * - SkillLoader: Skills 加载器
 * - PerformanceMonitor: 性能监控器
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { 
  NCard, NGrid, NGi, NTag, NText, NIcon, NSpin, NAlert,
  useMessage
} from 'naive-ui'
import { 
  CheckmarkCircleOutline, 
  WarningOutline, 
  CloseCircleOutline,
  ServerOutline,
  LayersOutline,
  CodeSlashOutline,
  StarOutline,
  SpeedometerOutline
} from '@vicons/ionicons5'
import diagnosticsApi from '@/api/diagnosticsApi'

const message = useMessage()

// 状态
const loading = ref(false)
const autoRefresh = ref(true)
const refreshInterval = ref<number | null>(null)

// 健康状态数据
const healthStatus = ref<{
  overall: 'healthy' | 'degraded' | 'unhealthy'
  components: {
    toolRegistry: any
    mcpBridge: any
    cliToolLoader: any
    skillLoader: any
    performanceMonitor: any
  }
  timestamp: string
} | null>(null)

// 组件配置
const componentConfig = [
  {
    key: 'toolRegistry',
    name: '工具注册中心',
    icon: LayersOutline,
    metrics: [
      { key: 'toolCount', label: '工具数量', suffix: '' },
      { key: 'sources.builtin', label: '内置', suffix: '' },
      { key: 'sources.cli', label: 'CLI', suffix: '' },
    ],
  },
  {
    key: 'mcpBridge',
    name: 'MCP 桥接',
    icon: ServerOutline,
    metrics: [
      { key: 'serverCount', label: '服务器', suffix: '' },
      { key: 'activeConnections', label: '连接数', suffix: '' },
    ],
  },
  {
    key: 'cliToolLoader',
    name: 'CLI 工具加载器',
    icon: CodeSlashOutline,
    metrics: [
      { key: 'loadedTools', label: '已加载', suffix: '' },
      { key: 'lastScan', label: '扫描时间', format: 'time' },
    ],
  },
  {
    key: 'skillLoader',
    name: 'Skills 加载器',
    icon: StarOutline,
    metrics: [
      { key: 'skillCount', label: '技能数', suffix: '' },
    ],
  },
  {
    key: 'performanceMonitor',
    name: '性能监控',
    icon: SpeedometerOutline,
    metrics: [
      { key: 'memoryUsage', label: '内存', suffix: '' },
      { key: 'cpuUsage', label: 'CPU', suffix: '' },
      { key: 'wsConnections', label: 'WS 连接', suffix: '' },
    ],
  },
]

// 获取状态图标
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'healthy':
      return CheckmarkCircleOutline
    case 'degraded':
      return WarningOutline
    case 'unhealthy':
      return CloseCircleOutline
    default:
      return CheckmarkCircleOutline
  }
}

// 获取状态颜色
const getStatusColor = (status: string): 'success' | 'warning' | 'error' => {
  switch (status) {
    case 'healthy':
      return 'success'
    case 'degraded':
      return 'warning'
    case 'unhealthy':
      return 'error'
    default:
      return 'success'
  }
}

// 获取状态文本
const getStatusText = (status: string): string => {
  switch (status) {
    case 'healthy':
      return '正常'
    case 'degraded':
      return '警告'
    case 'unhealthy':
      return '异常'
    default:
      return '未知'
  }
}

// 获取整体状态颜色
const getOverallStatusColor = (status: string): 'success' | 'warning' | 'error' => {
  return getStatusColor(status)
}

// 格式化时间
const formatTime = (timeStr: string): string => {
  try {
    const date = new Date(timeStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
    return date.toLocaleDateString()
  } catch {
    return timeStr
  }
}

// 获取指标值
const getMetricValue = (component: any, metricKey: string): any => {
  const keys = metricKey.split('.')
  let value: any = component
  for (const key of keys) {
    if (value === undefined || value === null) return undefined
    value = value[key]
  }
  return value
}

// 格式化指标值
const formatMetricValue = (value: any, format?: string): string => {
  if (value === undefined || value === null) return '-'
  if (format === 'time') return formatTime(value)
  if (typeof value === 'number' && format === 'percent') return `${value}%`
  return String(value)
}

// 加载健康状态
const loadHealthStatus = async () => {
  if (loading.value) return
  
  try {
    loading.value = true
    const status = await diagnosticsApi.getHealthStatus()
    healthStatus.value = status
  } catch (error) {
    console.error('加载健康状态失败:', error)
    message.error('加载健康状态失败')
  } finally {
    loading.value = false
  }
}

// 开始自动刷新
const startAutoRefresh = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
  }
  
  if (autoRefresh.value) {
    refreshInterval.value = window.setInterval(() => {
      loadHealthStatus()
    }, 5000) // 5 秒刷新一次
  }
}

// 停止自动刷新
const stopAutoRefresh = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
    refreshInterval.value = null
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

// 生命周期
onMounted(() => {
  loadHealthStatus()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div class="diagnostic-panel">
    <div class="panel-header">
      <h3>集成诊断</h3>
      <div class="header-actions">
        <NTag :type="getOverallStatusColor(healthStatus?.overall || 'healthy')" size="small" round>
          {{ getStatusText(healthStatus?.overall || 'healthy') }}
        </NTag>
        <NButton size="small" @click="toggleAutoRefresh">
          {{ autoRefresh ? '停止刷新' : '自动刷新' }}
        </NButton>
        <NButton size="small" :loading="loading" @click="loadHealthStatus">
          刷新
        </NButton>
      </div>
    </div>

    <NSpin :show="loading && !healthStatus">
      <div v-if="!healthStatus && !loading" class="empty-state">
        <NAlert type="info" title="暂无数据">
          正在加载健康状态...
        </NAlert>
      </div>

      <NGrid v-else cols="1 s:2 m:3 l:5" responsive="screen" :x-gap="12" :y-gap="12">
        <NGi v-for="config in componentConfig" :key="config.key">
          <NCard :title="config.name" size="small" hoverable>
            <template #header-extra>
              <NIcon 
                :component="getStatusIcon((healthStatus?.components as any)[config.key]?.status || 'healthy')"
                :color="getStatusColor((healthStatus?.components as any)[config.key]?.status || 'healthy') === 'success' ? '#18a058' : getStatusColor((healthStatus?.components as any)[config.key]?.status || 'healthy') === 'warning' ? '#f0a020' : '#d03050'"
                size="18"
              />
            </template>
            
            <div class="component-metrics">
              <div 
                v-for="metric in config.metrics" 
                :key="metric.key"
                class="metric-item"
              >
                <NText depth="3" class="metric-label">{{ metric.label }}</NText>
                <NText depth="1" class="metric-value">
                  {{ formatMetricValue(getMetricValue((healthStatus?.components as any)[config.key], metric.key), metric.format) }}
                </NText>
              </div>
            </div>

            <template #footer>
              <NText depth="3" style="font-size: 12px">
                状态：{{ getStatusText((healthStatus?.components as any)[config.key]?.status || 'unknown') }}
              </NText>
            </template>
          </NCard>
        </NGi>
      </NGrid>
    </NSpin>

    <div v-if="healthStatus" class="panel-footer">
      <NText depth="3" style="font-size: 12px">
        最后更新：{{ new Date(healthStatus.timestamp).toLocaleTimeString() }}
      </NText>
    </div>
  </div>
</template>

<style scoped lang="scss">
.diagnostic-panel {
  padding: 16px;
  
  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    
    h3 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
    
    .header-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }
  }
  
  .empty-state {
    padding: 40px 0;
  }
  
  .component-metrics {
    padding: 12px 0;
    
    .metric-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      
      &:last-child {
        margin-bottom: 0;
      }
      
      .metric-label {
        font-size: 12px;
      }
      
      .metric-value {
        font-size: 16px;
        font-weight: 600;
      }
    }
  }
  
  .panel-footer {
    margin-top: 16px;
    text-align: right;
  }
}
</style>
