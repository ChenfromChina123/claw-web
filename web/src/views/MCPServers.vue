<script setup lang="ts">
/**
 * MCP 服务器管理界面
 */

import { ref, onMounted } from 'vue'
import { 
  NCard, NButton, NSpace, NTag, NList, NListItem, 
  NModal, NForm, NFormItem, NInput, NSelect,
  NPopconfirm, NEmpty, useMessage, NSpin
} from 'naive-ui'
import mcpApi from '@/api/mcpApi'
import type { MCPServer, MCPServerAddRequest } from '@/api/mcpApi'

const message = useMessage()

const servers = ref<MCPServer[]>([])
const loading = ref(false)
const showAddDialog = ref(false)
const testingServer = ref<string | null>(null)

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
      message.success(`连接成功 ${result.latency != null ? `(${result.latency}ms)` : ''}`)
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

onMounted(() => {
  loadServers()
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
            <NSpace align="center">
              <NTag :type="getStatusType(server.status) as any" size="small">
                {{ getStatusText(server.status) }}
              </NTag>
              <span class="server-name">{{ server.name }}</span>
            </NSpace>
            <div class="server-meta">
              <span class="command">{{ server.command }}</span>
              <span v-if="server.tools" class="tools-count">
                {{ server.tools }} 个工具
              </span>
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
