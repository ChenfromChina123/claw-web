<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import {
  NCard,
  NDataTable,
  NButton,
  NSpace,
  NTag,
  NModal,
  NDescriptions,
  NDescriptionsItem,
  NPopconfirm,
  NEmpty,
  NSpin,
  NAlert,
  useMessage,
  NSwitch,
  NText,
  NBadge
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import {
  getContainers,
  getContainerDetail,
  startContainer,
  stopContainer,
  restartContainer,
  deleteContainer,
  pruneContainers,
  getPoolStats,
  type ContainerInfo,
  type ContainerDetail,
  type PoolStats,
  formatBytes
} from '@/api/containerAdminApi'

const message = useMessage()

// 数据状态
const containers = ref<ContainerInfo[]>([])
const poolStats = ref<PoolStats | null>(null)
const selectedContainer = ref<ContainerDetail | null>(null)
const showDetail = ref(false)

// 加载状态
const loading = ref(false)
const operating = ref(false)
const showAllContainers = ref(true)

// 获取容器列表
async function fetchContainers() {
  loading.value = true
  try {
    const data = await getContainers(showAllContainers.value)
    containers.value = data.containers || []
  } catch (error) {
    console.error('获取容器列表失败:', error)
    message.error('获取容器列表失败，可能没有管理员权限')
  } finally {
    loading.value = false
  }
}

// 获取池统计
async function fetchPoolStats() {
  try {
    poolStats.value = await getPoolStats()
  } catch (error) {
    console.error('获取池统计失败:', error)
  }
}

// 刷新数据
async function handleRefresh() {
  await Promise.all([fetchContainers(), fetchPoolStats()])
}

// 查看详情
async function handleViewDetail(container: ContainerInfo) {
  try {
    selectedContainer.value = await getContainerDetail(container.id)
    showDetail.value = true
  } catch (error) {
    console.error('获取容器详情失败:', error)
    message.error('获取容器详情失败')
  }
}

// 启动容器
async function handleStart(container: ContainerInfo) {
  operating.value = true
  try {
    await startContainer(container.id)
    message.success(`容器 ${container.name} 已启动`)
    await fetchContainers()
    await fetchPoolStats()
  } catch (error) {
    console.error('启动容器失败:', error)
    message.error('启动容器失败')
  } finally {
    operating.value = false
  }
}

// 停止容器
async function handleStop(container: ContainerInfo) {
  operating.value = true
  try {
    await stopContainer(container.id)
    message.success(`容器 ${container.name} 已停止`)
    await fetchContainers()
  } catch (error) {
    console.error('停止容器失败:', error)
    message.error('停止容器失败')
  } finally {
    operating.value = false
  }
}

// 重启容器
async function handleRestart(container: ContainerInfo) {
  operating.value = true
  try {
    await restartContainer(container.id)
    message.success(`容器 ${container.name} 已重启`)
    await fetchContainers()
  } catch (error) {
    console.error('重启容器失败:', error)
    message.error('重启容器失败')
  } finally {
    operating.value = false
  }
}

// 删除容器
async function handleDelete(container: ContainerInfo) {
  operating.value = true
  try {
    await deleteContainer(container.id)
    message.success(`容器 ${container.name} 已删除`)
    await fetchContainers()
    await fetchPoolStats()
  } catch (error) {
    console.error('删除容器失败:', error)
    message.error('删除容器失败')
  } finally {
    operating.value = false
  }
}

// 清理未使用容器
async function handlePrune() {
  operating.value = true
  try {
    const result = await pruneContainers()
    message.success(`已清理 ${result.containersRemoved} 个容器，释放 ${formatBytes(result.spaceReclaimed)} 空间`)
    await fetchContainers()
    await fetchPoolStats()
  } catch (error) {
    console.error('清理容器失败:', error)
    message.error('清理容器失败')
  } finally {
    operating.value = false
  }
}

// 表格列定义
const columns: DataTableColumns<ContainerInfo> = [
  {
    title: '名称',
    key: 'name',
    width: 200,
    ellipsis: { tooltip: true },
    render(row) {
      return h('strong', {}, row.name)
    }
  },
  {
    title: '状态',
    key: 'state',
    width: 100,
    render(row) {
      const type = row.state === 'running' ? 'success' : 'default'
      const text = row.state === 'running' ? '运行中' : row.state === 'exited' ? '已停止' : row.state
      return h(NTag, { type, size: 'small' }, { default: () => text })
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
  },
  {
    title: '操作',
    key: 'actions',
    width: 280,
    render(row) {
      const isRunning = row.state === 'running'
      const isWorker = row.name.includes('worker')

      return h(NSpace, { size: 'small' }, {
        default: () => [
          h(NButton, {
            size: 'tiny',
            onClick: () => handleViewDetail(row)
          }, { default: () => '详情' }),

          isRunning
            ? h(NButton, {
                size: 'tiny',
                type: 'warning',
                disabled: isWorker || operating.value,
                onClick: () => handleStop(row)
              }, { default: () => '停止' })
            : h(NButton, {
                size: 'tiny',
                type: 'success',
                disabled: isWorker || operating.value,
                onClick: () => handleStart(row)
              }, { default: () => '启动' }),

          h(NButton, {
            size: 'tiny',
            disabled: isWorker || operating.value,
            onClick: () => handleRestart(row)
          }, { default: () => '重启' }),

          h(NPopconfirm, {
            onPositiveClick: () => handleDelete(row)
          }, {
            trigger: () => h(NButton, {
              size: 'tiny',
              type: 'error',
              disabled: isWorker || operating.value
            }, { default: () => '删除' }),
            positiveText: '确认',
            negativeText: '取消',
            message: `确定要删除容器 ${row.name} 吗？`
          })
        ]
      })
    }
  }
]

// 导入 h 函数
import { h } from 'vue'

onMounted(() => {
  void handleRefresh()
})
</script>

<template>
  <div class="container-admin">
    <div class="admin-header">
      <h3>容器管理</h3>
      <NSpace>
        <NSwitch v-model:value="showAllContainers" size="small" />
        <NText>显示所有容器</NText>
        <NButton size="small" :loading="loading" @click="handleRefresh">
          刷新
        </NButton>
        <NButton size="small" type="warning" :loading="operating" @click="handlePrune">
          清理未使用容器
        </NButton>
      </NSpace>
    </div>

    <NAlert v-if="poolStats" type="info" class="stats-alert">
      <NDescriptions :columns="4" size="small">
        <NDescriptionsItem label="总容器数">
          <NBadge :value="poolStats.containers.total" type="info" />
        </NDescriptionsItem>
        <NDescriptionsItem label="Worker容器">
          <NBadge :value="poolStats.containers.workerContainers" type="success" />
        </NDescriptionsItem>
        <NDescriptionsItem label="Docker版本">
          {{ poolStats.dockerVersion }}
        </NDescriptionsItem>
        <NDescriptionsItem label="Docker状态">
          <NTag :type="poolStats.dockerStatus === 'running' ? 'success' : 'error'" size="small">
            {{ poolStats.dockerStatus === 'running' ? '正常' : '异常' }}
          </NTag>
        </NDescriptionsItem>
      </NDescriptions>
    </NAlert>

    <NCard size="small">
      <template #header>
        <span>容器列表 ({{ containers.length }})</span>
      </template>
      <NSpin :show="loading">
        <NDataTable
          v-if="containers.length"
          :columns="columns"
          :data="containers"
          :bordered="false"
          :single-line="false"
          size="small"
          :max-height="500"
          :pagination="false"
          :row-key="(row: ContainerInfo) => row.id"
        />
        <NEmpty v-else description="暂无容器数据" />
      </NSpin>
    </NCard>

    <!-- 容器详情弹窗 -->
    <NModal v-model:show="showDetail" preset="card" title="容器详情" style="max-width: 700px;">
      <NSpin v-if="selectedContainer" :show="!selectedContainer">
        <NDescriptions :column="2" bordered size="small">
          <NDescriptionsItem label="容器ID">
            {{ selectedContainer.id.substring(0, 12) }}
          </NDescriptionsItem>
          <NDescriptionsItem label="名称">
            {{ selectedContainer.name }}
          </NDescriptionsItem>
          <NDescriptionsItem label="镜像">
            {{ selectedContainer.image }}
          </NDescriptionsItem>
          <NDescriptionsItem label="状态">
            <NTag :type="selectedContainer.state?.Status === 'running' ? 'success' : 'default'" size="small">
              {{ selectedContainer.state?.Status || 'unknown' }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="创建时间">
            {{ selectedContainer.created }}
          </NDescriptionsItem>
          <NDescriptionsItem label="网络">
            {{ selectedContainer.networks?.join(', ') || '无' }}
          </NDescriptionsItem>
          <NDescriptionsItem label="挂载">
            <NText v-for="(mount, idx) in selectedContainer.mounts" :key="idx" depth="3">
              {{ mount.Source }} -> {{ mount.Destination }}
              <br v-if="idx < selectedContainer.mounts.length - 1" />
            </NText>
          </NDescriptionsItem>
          <NDescriptionsItem label="资源使用" v-if="selectedContainer.stats">
            <NText depth="3">
              CPU: {{ selectedContainer.stats.cpuPerc }}<br />
              内存: {{ selectedContainer.stats.memUsage }} ({{ selectedContainer.stats.memPerc }})<br />
              网络: {{ selectedContainer.stats.netIO }}<br />
              块设备: {{ selectedContainer.stats.blockIO }}
            </NText>
          </NDescriptionsItem>
        </NDescriptions>
      </NSpin>
    </NModal>
  </div>
</template>

<style scoped>
.container-admin {
  padding: 0;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.admin-header h3 {
  margin: 0;
}

.stats-alert {
  margin-bottom: 16px;
}
</style>
