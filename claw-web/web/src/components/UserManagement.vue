<script setup lang="ts">
/**
 * 用户管理组件（管理员专用）
 * 管理员可以查看所有用户、修改用户等级、设置自定义配额
 */

import { ref, onMounted, h } from 'vue'
import { 
  NCard, NDataTable, NButton, NSpace, NTag, NModal, 
  NForm, NFormItem, NSelect, NDatePicker, NInputNumber,
  NIcon, useMessage, NDropdown, NPopconfirm
} from 'naive-ui'
import type { DataTableColumns } from 'naive-ui'
import { 
  PersonOutline, CreateOutline, TrashOutline,
  SettingsOutline, TrendingUpOutline
} from '@vicons/ionicons5'
import { userTierApi, UserTier, type UserWithTier, type HardwareQuota } from '@/api/userTierApi'

const message = useMessage()

const loading = ref(false)
const users = ref<UserWithTier[]>([])
const showEditModal = ref(false)
const showQuotaModal = ref(false)
const selectedUser = ref<UserWithTier | null>(null)

const editForm = ref({
  tier: UserTier.FREE,
  subscriptionExpiresAt: null as number | null
})

const quotaForm = ref<Partial<HardwareQuota>>({})

const tierOptions = [
  { label: '免费用户', value: UserTier.FREE },
  { label: '基础会员', value: UserTier.BASIC },
  { label: '专业会员', value: UserTier.PRO },
  { label: '企业会员', value: UserTier.ENTERPRISE },
  { label: '管理员', value: UserTier.ADMIN }
]

const tierColors: Record<UserTier, string> = {
  [UserTier.FREE]: 'default',
  [UserTier.BASIC]: 'info',
  [UserTier.PRO]: 'success',
  [UserTier.ENTERPRISE]: 'warning',
  [UserTier.ADMIN]: 'error'
}

const columns: DataTableColumns<UserWithTier> = [
  {
    title: '用户信息',
    key: 'username',
    render(row) {
      return h('div', { class: 'user-info' }, [
        h(NIcon, { component: PersonOutline, size: 20, color: '#666' }),
        h('div', { class: 'user-details' }, [
          h('div', { class: 'username' }, row.username),
          h('div', { class: 'email' }, row.email)
        ])
      ])
    }
  },
  {
    title: '用户等级',
    key: 'tier',
    render(row) {
      const tierNames: Record<UserTier, string> = {
        [UserTier.FREE]: '免费用户',
        [UserTier.BASIC]: '基础会员',
        [UserTier.PRO]: '专业会员',
        [UserTier.ENTERPRISE]: '企业会员',
        [UserTier.ADMIN]: '管理员'
      }
      return h(NTag, { type: tierColors[row.tier] }, { default: () => tierNames[row.tier] })
    }
  },
  {
    title: '订阅状态',
    key: 'subscriptionExpiresAt',
    render(row) {
      if (!row.subscriptionExpiresAt) {
        return h(NTag, { type: 'success' }, { default: () => '永久有效' })
      }
      const expiresAt = new Date(row.subscriptionExpiresAt)
      const now = new Date()
      const isExpired = expiresAt < now
      return h(NTag, { type: isExpired ? 'error' : 'success' }, { 
        default: () => isExpired ? '已过期' : '有效' 
      })
    }
  },
  {
    title: '注册时间',
    key: 'createdAt',
    render(row) {
      return new Date(row.createdAt).toLocaleDateString()
    }
  },
  {
    title: '最后登录',
    key: 'lastLogin',
    render(row) {
      return row.lastLogin ? new Date(row.lastLogin).toLocaleDateString() : '从未登录'
    }
  },
  {
    title: '操作',
    key: 'actions',
    render(row) {
      return h(NSpace, null, {
        default: () => [
          h(NButton, {
            size: 'small',
            onClick: () => handleEditUser(row)
          }, { default: () => '编辑等级' }),
          h(NButton, {
            size: 'small',
            type: 'primary',
            onClick: () => handleEditQuota(row)
          }, { default: () => '自定义配额' })
        ]
      })
    }
  }
]

const fetchUsers = async () => {
  loading.value = true
  try {
    const data = await userTierApi.getAllUsers()
    users.value = data
  } catch (error) {
    console.error('获取用户列表失败:', error)
    message.error('获取用户列表失败')
  } finally {
    loading.value = false
  }
}

const handleEditUser = (user: UserWithTier) => {
  selectedUser.value = user
  editForm.value = {
    tier: user.tier,
    subscriptionExpiresAt: user.subscriptionExpiresAt ? new Date(user.subscriptionExpiresAt).getTime() : null
  }
  showEditModal.value = true
}

const handleEditQuota = (user: UserWithTier) => {
  selectedUser.value = user
  quotaForm.value = {}
  showQuotaModal.value = true
}

const handleSaveEdit = async () => {
  if (!selectedUser.value) return
  
  try {
    await userTierApi.updateUserTier(
      selectedUser.value.id,
      editForm.value.tier,
      editForm.value.subscriptionExpiresAt ? new Date(editForm.value.subscriptionExpiresAt).toISOString() : undefined
    )
    message.success('用户等级更新成功')
    showEditModal.value = false
    await fetchUsers()
  } catch (error) {
    console.error('更新用户等级失败:', error)
    message.error('更新用户等级失败')
  }
}

const handleSaveQuota = async () => {
  if (!selectedUser.value) return
  
  try {
    await userTierApi.setCustomQuota(selectedUser.value.id, quotaForm.value)
    message.success('自定义配额设置成功')
    showQuotaModal.value = false
  } catch (error) {
    console.error('设置自定义配额失败:', error)
    message.error('设置自定义配额失败')
  }
}

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <div class="user-management">
    <NCard title="用户管理" :bordered="false">
      <template #header-extra>
        <NButton type="primary" @click="fetchUsers">
          <template #icon>
            <NIcon :component="TrendingUpOutline" />
          </template>
          刷新列表
        </NButton>
      </template>

      <NDataTable
        :columns="columns"
        :data="users"
        :loading="loading"
        :pagination="{ pageSize: 10 }"
        :bordered="false"
      />
    </NCard>

    <NModal
      v-model:show="showEditModal"
      preset="dialog"
      title="编辑用户等级"
      positive-text="保存"
      negative-text="取消"
      @positive-click="handleSaveEdit"
    >
      <NForm :model="editForm" label-placement="left" label-width="120">
        <NFormItem label="用户等级">
          <NSelect
            v-model:value="editForm.tier"
            :options="tierOptions"
          />
        </NFormItem>
        <NFormItem label="订阅过期时间">
          <NDatePicker
            v-model:value="editForm.subscriptionExpiresAt"
            type="datetime"
            clearable
            placeholder="留空表示永久有效"
          />
        </NFormItem>
      </NForm>
    </NModal>

    <NModal
      v-model:show="showQuotaModal"
      preset="dialog"
      title="设置自定义配额"
      positive-text="保存"
      negative-text="取消"
      @positive-click="handleSaveQuota"
      style="width: 600px;"
    >
      <NForm :model="quotaForm" label-placement="left" label-width="120">
        <NFormItem label="CPU限制（核）">
          <NInputNumber
            v-model:value="quotaForm.cpuLimit"
            :min="0.1"
            :max="16"
            :step="0.1"
            placeholder="留空使用默认值"
          />
        </NFormItem>
        <NFormItem label="内存限制（MB）">
          <NInputNumber
            v-model:value="quotaForm.memoryLimitMB"
            :min="64"
            :max="8192"
            :step="64"
            placeholder="留空使用默认值"
          />
        </NFormItem>
        <NFormItem label="存储配额（MB）">
          <NInputNumber
            v-model:value="quotaForm.storageQuotaMB"
            :min="100"
            :max="100000"
            :step="100"
            placeholder="留空使用默认值"
          />
        </NFormItem>
        <NFormItem label="最大会话数">
          <NInputNumber
            v-model:value="quotaForm.maxSessions"
            :min="1"
            :max="100"
            placeholder="留空使用默认值"
          />
        </NFormItem>
        <NFormItem label="最大PTY进程数">
          <NInputNumber
            v-model:value="quotaForm.maxPtyProcesses"
            :min="1"
            :max="50"
            placeholder="留空使用默认值"
          />
        </NFormItem>
        <NFormItem label="最大文件数">
          <NInputNumber
            v-model:value="quotaForm.maxFiles"
            :min="100"
            :max="100000"
            :step="100"
            placeholder="留空使用默认值"
          />
        </NFormItem>
        <NFormItem label="单文件大小（MB）">
          <NInputNumber
            v-model:value="quotaForm.maxFileSizeMB"
            :min="1"
            :max="500"
            placeholder="留空使用默认值"
          />
        </NFormItem>
      </NForm>
    </NModal>
  </div>
</template>

<style scoped>
.user-management {
  padding: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.username {
  font-weight: 500;
  font-size: 14px;
}

.email {
  font-size: 12px;
  color: #999;
}
</style>
