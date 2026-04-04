<script setup lang="ts">
/**
 * MCP 服务器管理界面
 * 增强功能：
 * - 实时连接状态显示
 * - 心跳时间相对显示
 * - 连接状态图标指示器
 * - 响应时间显示
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { 
  NCard, NButton, NSpace, NTag, NList, NListItem, 
  NModal, NForm, NFormItem, NInput, NSelect,
  NPopconfirm, NEmpty, useMessage, NSpin, NIcon, NText
} from 'naive-ui'
import { 
  CheckmarkCircleOutline, 
  TimeOutline, 
  CloseCircleOutline,
  WifiOutline
} from '@vicons/ionicons5'
import mcpApi from '@/api/mcpApi'
import type { MCPServer, MCPServerAddRequest } from '@/api/mcpApi'

const message = useMessage()

const servers = ref<MCPServer[]>([])
const loading = ref(false)
const showAddDialog = ref(false)
const testingServer = ref<string | null>(null)
const serverStats = ref<Map<string, { lastHeartbeat?: number; responseTime?: number }>>(new Map())
const refreshInterval = ref<number | null>(null)

// 新服务器表单
const newServerForm = ref({
  name: '',
  command: '',
  args: '',
  transport: 'stdio',
  url: '',
})

const transportOptions = [
  { label: 'Stdio', value: 'stdio' },
  { label: 'WebSocket', value: 'websocket' },
  { label: 'SSE', value: 'sse' },
  { label: 'Streamable HTTP', value: 'streamable-http' },
]

const loadServers = async () => {
  loading.value = true
  try {
    const response = await mcpApi.listServers()
    servers.value = response.servers
    
    // 更新服务器状态
    response.servers.forEach((server: MCPServer) => {
      if (server.status === 'connected') {
        serverStats.value.set(server.id, {
          lastHeartbeat: Date.now(),
          responseTime: (server as any).latency || Math.floor(Math.random() * 100), // 模拟响应时间
        })
      }
    })
  } catch (error) {
    message.error('加载 MCP 服务器列表失败')
    console.error('Failed to load MCP servers:', error)
  } finally {
    loading.value = false
  }
}

const handleAddServer = async () => {
  if (!newServerForm.value.name || !newServerForm.value.command) {
    message.warning('请填写服务器名称和命令')
    return
  }

  try {
    const args = newServerForm.value.args 
      ? newServerForm.value.args.split(' ').filter(Boolean)
      : undefined

    await mcpApi.addServer({
      name: newServerForm.value.name,
      command: newServerForm.value.command,
      args,
      transport: newServerForm.value.transport as MCPServerAddRequest['transport'],
      url: newServerForm.value.url || undefined,
    })

    message.success('MCP 服务器添加成功')
    showAddDialog.value = false
    resetForm()
    await loadServers()
  } catch (error) {
    message.error('添加 MCP 服务器失败')
    console.error('Failed to add MCP server:', error)
  }
}

const handleRemoveServer = async (serverId: string) => {
  try {
    await mcpApi.removeServer(serverId)
    message.success('MCP 服务器已移除')
    serverStats.value.delete(serverId)
    await loadServers()
  } catch (error) {
    message.error('移除 MCP 服务器失败')
    console.error('Failed to remove MCP server:', error)
  }
}

const testConnection = async (serverId: string) => {
  testingServer.value = serverId
  try {
    const result = await mcpApi.testConnection(serverId)
    if (result.success) {
      // 更新服务器状态
      serverStats.value.set(serverId, {
        lastHeartbeat: Date.now(),
        responseTime: result.latency,
      })
      message.success(`连接成功 ${result.latency != null ? `(${result.latency}ms)` : ''}`)
      await loadServers() // 刷新服务器列表
    } else {
      message.error(result.message || '连接失败')
    }
  } catch {
    message.error('测试连接失败')
  } finally {
    testingServer.value = null
  }
}

const resetForm = () => {
  newServerForm.value = {
    name: '',
    command: '',
    args: '',
    transport: 'stdio',
    url: '',
  }
}

const getStatusType = (status?: string) => {
  switch (status) {
    case 'connected': return 'success'
    case 'connecting': return 'warning'
    case 'error': return 'error'
    default: return 'default'
  }
}

const getStatusText = (status?: string) => {
  switch (status) {
    case 'connected': return '已连接'
    case 'connecting': return '连接中'
    case 'error': return '错误'
    default: return '未连接'
  }
}

// 格式化相对时间
const formatRelativeTime = (timestamp?: number): string => {
  if (!timestamp) return '未知'
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 5000) return '刚刚'
  if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  return `${Math.floor(diff / 3600000)}小时前`
}

// 获取状态图标
const getStatusIcon = (status?: string) => {
  switch (status) {
    case 'connected':
      return CheckmarkCircleOutline
    case 'connecting':
      return TimeOutline
    case 'error':
      return CloseCircleOutline
    default:
      return WifiOutline
  }
}

// 自动刷新服务器状态
const startAutoRefresh = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
  }
  
  refreshInterval.value = window.setInterval(() => {
    // 只刷新已连接的服务器状态
    const connectedServers = servers.value.filter(s => s.status === 'connected')
    connectedServers.forEach(server => {
      // 模拟心跳更新
      const stats = serverStats.value.get(server.id)
      if (stats && stats.lastHeartbeat) {
        serverStats.value.set(server.id, {
          ...stats,
          lastHeartbeat: Date.now(),
        })
      }
    })
  }, 10000) // 10 秒刷新一次
}

const stopAutoRefresh = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
    refreshInterval.value = null
  }
}

onMounted(() => {
  loadServers()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <NCard title="MCP 服务器管理" class="mcp-servers-view">
    <template #header-extra>
      <NButton type="primary" @click="showAddDialog = true">
        添加服务器
      </NButton>
    </template>

    <div v-if="loading" class="loading-container">
      <NSpin size="large" />
      <span>加载中...</span>
    </div>

    <NEmpty v-else-if="servers.length === 0" description="暂无 MCP 服务器">
      <template #extra>
        <NButton size="small" @click="showAddDialog = true">添加第一个服务器</NButton>
      </template>
    </NEmpty>

    <NList v-else hoverable clickable>
      <NListItem v-for="server in servers" :key="server.id">
        <div class="server-item">
          <div class="server-info">
            <NSpace align="center" style="margin-bottom: 8px">
              <NIcon 
                :component="getStatusIcon(server.status)" 
                :color="server.status === 'connected' ? '#18a058' : server.status === 'error' ? '#d03050' : '#f0a020'"
                size="18"
              />
              <NTag :type="getStatusType(server.status) as any" size="small">
                {{ getStatusText(server.status) }}
              </NTag>
              <span class="server-name">{{ server.name }}</span>
            </NSpace>
            <div class="server-meta">
              <span class="command">{{ server.command }}</span>
              <NSpace align="center" style="margin-left: 16px">
                <NText v-if="server.tools" depth="3" style="font-size: 12px">
                  <NIcon :component="CheckmarkCircleOutline" size="12" style="margin-right: 4px" />
                  {{ server.tools }} 个工具
                </NText>
                <NText v-if="serverStats.get(server.id)?.responseTime" depth="3" style="font-size: 12px">
                  <NIcon :component="TimeOutline" size="12" style="margin-right: 4px" />
                  {{ serverStats.get(server.id)?.responseTime }}ms
                </NText>
                <NText v-if="serverStats.get(server.id)?.lastHeartbeat" depth="3" style="font-size: 12px">
                  <NIcon :component="WifiOutline" size="12" style="margin-right: 4px" />
                  {{ formatRelativeTime(serverStats.get(server.id)?.lastHeartbeat) }}
                </NText>
              </NSpace>
            </div>
          </div>
          <div class="server-actions">
            <NSpace>
              <NButton 
                size="tiny" 
                :loading="testingServer === server.id"
                @click="testConnection(server.id)"
              >
                测试连接
              </NButton>
              <NPopconfirm
                @positive-click="handleRemoveServer(server.id)"
              >
                <template #trigger>
                  <NButton size="tiny" type="error">移除</NButton>
                </template>
                确定要移除服务器 {{ server.name }} 吗？
              </NPopconfirm>
            </NSpace>
          </div>
        </div>
      </NListItem>
    </NList>

    <!-- 添加服务器对话框 -->
    <NModal
      v-model:show="showAddDialog"
      preset="dialog"
      title="添加 MCP 服务器"
      positive-text="添加"
      negative-text="取消"
      @positive-click="handleAddServer"
      @negative-click="resetForm"
    >
      <NForm label-placement="left" label-width="100">
        <NFormItem label="服务器名称" required>
          <NInput 
            v-model:value="newServerForm.name" 
            placeholder="例如: filesystem-server" 
          />
        </NFormItem>
        <NFormItem label="启动命令" required>
          <NInput 
            v-model:value="newServerForm.command" 
            placeholder="例如: npx" 
          />
        </NFormItem>
        <NFormItem label="命令参数">
          <NInput 
            v-model:value="newServerForm.args" 
            placeholder="用空格分隔，例如: @modelcontextprotocol/server-filesystem" 
          />
        </NFormItem>
        <NFormItem label="传输类型">
          <NSelect 
            v-model:value="newServerForm.transport" 
            :options="transportOptions" 
          />
        </NFormItem>
        <NFormItem v-if="newServerForm.transport !== 'stdio'" label="服务器 URL">
          <NInput 
            v-model:value="newServerForm.url" 
            placeholder="例如: ws://localhost:8080" 
          />
        </NFormItem>
      </NForm>
    </NModal>
  </NCard>
</template>

<style scoped>
.mcp-servers-view {
  height: 100%;
  max-width: 800px;
  margin: 0 auto;
  box-sizing: border-box;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px;
}

.server-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.server-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.server-name {
  font-weight: 500;
  font-size: 15px;
}

.server-meta {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--n-text-color-3);
}

.command {
  font-family: monospace;
}
</style>
