<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NLayout,
  NLayoutContent,
  NCard,
  NAvatar,
  NDescriptions,
  NDescriptionsItem,
  NButton,
  NSpace,
  NModal,
  NForm,
  NFormItem,
  NInput,
  useMessage,
  NGrid,
  NGi,
  NTag,
  NDivider,
} from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { SettingsOutline, LogOutOutline, EditOutline, PersonCircleOutline, MailOutline, TimeOutline, ShieldCheckmarkOutline } from '@vicons/ionicons5'

/**
 * 个人主页组件
 * 展示用户基本信息、账户状态，提供快捷操作入口
 */
const router = useRouter()
const message = useMessage()
const authStore = useAuthStore()

/**
 * 是否显示编辑个人简介的弹窗
 */
const showEditBioModal = ref(false)

/**
 * 编辑中的个人简介内容
 */
const editingBio = ref('')

/**
 * 当前用户信息（从 authStore 获取）
 */
const user = computed(() => authStore.user)

/**
 * 用户显示名称（优先使用 username，回退到 email 前缀）
 */
const displayName = computed(() => {
  return user.value?.username || user.value?.email?.split('@')[0] || '未知用户'
})

/**
 * 用户头像 URL（使用默认头像作为 fallback）
 */
const avatarUrl = computed(() => {
  return user.value?.avatar || undefined
})

/**
 * 格式化日期时间
 * @param dateStr 日期字符串或 Date 对象
 * @returns 格式化后的日期时间字符串
 */
function formatDate(dateStr: Date | string | undefined): string {
  if (!dateStr) return '暂无记录'
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 打开编辑个人简介弹窗
 */
function openEditBio() {
  editingBio.value = user.value?.bio || ''
  showEditBioModal.value = true
}

/**
 * 保存个人简介
 */
async function saveBio() {
  // TODO: 调用 API 保存个人简介
  message.success('个人简介已更新')
  showEditBioModal.value = false
}

/**
 * 导航到设置页面
 */
function goToSettings() {
  router.push('/settings')
}

/**
 * 执行登出操作
 */
function handleLogout() {
  authStore.logout()
  message.success('已退出登录')
  router.push('/login')
}

/**
 * 组件挂载时同步用户信息
 */
onMounted(() => {
  if (authStore.isLoggedIn && !authStore.user) {
    void authStore.fetchUser()
  }
})
</script>

<template>
  <NLayout class="profile-layout">
    <NLayoutContent content-style="padding: 24px; max-width: 960px; margin: 0 auto;">
      <!-- 用户基本信息卡片 -->
      <NCard title="个人信息" :bordered="false" size="large" style="margin-bottom: 24px;">
        <NSpace align="center" :size="24" style="margin-bottom: 24px;">
          <!-- 头像 -->
          <NAvatar
            :size="96"
            :src="avatarUrl"
            round
            fallback-src="/avatars/default.png"
            style="flex-shrink: 0;"
          >
            {{ displayName.charAt(0).toUpperCase() }}
          </NAvatar>

          <!-- 用户名和操作按钮 -->
          <div style="flex: 1;">
            <h2 style="margin: 0 0 8px 0; font-size: 24px;">
              {{ displayName }}
              <NTag v-if="user?.isAdmin" type="warning" size="small" round style="margin-left: 8px;">
                管理员
              </NTag>
            </h2>
            <p style="margin: 0 0 16px 0; color: #666;">
              {{ user?.email || '未设置邮箱' }}
            </p>
            <NSpace>
              <NButton type="primary" size="small" @click="goToSettings">
                <template #icon><SettingsOutline /></template>
                账户设置
              </NButton>
              <NButton size="small" @click="openEditBio">
                <template #icon><EditOutline /></template>
                编辑简介
              </NButton>
              <NButton size="small" type="error" ghost @click="handleLogout">
                <template #icon><LogOutOutline /></template>
                退出登录
              </NButton>
            </NSpace>
          </div>
        </NSpace>

        <NDivider />

        <!-- 详细信息描述列表 -->
        <NDescriptions label-placement="left" :column="1" bordered>
          <NDescriptionsItem label="用户 ID">
            <code style="font-family: monospace;">{{ user?.id || '-' }}</code>
          </NDescriptionsItem>
          <NDescriptionsItem label="用户名">
            <NSpace align="center" :size="8">
              <PersonCircleOutline />
              {{ user?.username || '未设置' }}
            </NSpace>
          </NDescriptionsItem>
          <NDescriptionsItem label="邮箱地址">
            <NSpace align="center" :size="8">
              <MailOutline />
              {{ user?.email || '未设置' }}
            </NSpace>
          </NDescriptionsItem>
          <NDescriptionsItem label="账户状态">
            <NTag :type="user?.isActive !== false ? 'success' : 'error'" round>
              {{ user?.isActive !== false ? '正常' : '已禁用' }}
            </NTag>
          </NDescriptionsItem>
          <NDescriptionsItem label="角色权限">
            <NSpace align="center" :size="8">
              <ShieldCheckmarkOutline />
              <NTag :type="user?.isAdmin ? 'warning' : 'default'" round>
                {{ user?.isAdmin ? '管理员' : '普通用户' }}
              </NTag>
            </NSpace>
          </NDescriptionsItem>
          <NDescriptionsItem label="注册时间">
            <NSpace align="center" :size="8">
              <TimeOutline />
              {{ formatDate(user?.createdAt) }}
            </NSpace>
          </NDescriptionsItem>
          <NDescriptionsItem label="最后登录">
            <NSpace align="center" :size="8">
              <TimeOutline />
              {{ formatDate(user?.lastLogin) }}
            </NSpace>
          </NDescriptionsItem>
        </NDescriptions>
      </NCard>

      <!-- 统计信息卡片（预留扩展） -->
      <NGrid :cols="3" :x-gap="16" :y-gap="16">
        <NGi>
          <NCard :bordered="false" hoverable>
            <h3 style="margin: 0 0 8px 0; font-size: 32px; text-align: center; color: #18a058;">
              -
            </h3>
            <p style="margin: 0; text-align: center; color: #666;">会话数量</p>
          </NCard>
        </NGi>
        <NGi>
          <NCard :bordered="false" hoverable>
            <h3 style="margin: 0 0 8px 0; font-size: 32px; text-align: center; color: #2080f0;">
              -
            </h3>
            <p style="margin: 0; text-align: center; color: #666;">消息总数</p>
          </NCard>
        </NGi>
        <NGi>
          <NCard :bordered="false" hoverable>
            <h3 style="margin: 0 0 8px 0; font-size: 32px; text-align: center; color: #f0a020;">
              -
            </h3>
            <p style="margin: 0; text-align: center; color: #666;">使用天数</p>
          </NCard>
        </NGi>
      </NGrid>

      <!-- 编辑个人简介弹窗 -->
      <NModal
        v-model:show="showEditBioModal"
        preset="card"
        title="编辑个人简介"
        :style="{ width: '600px' }"
        :mask-closable="false"
      >
        <NForm>
          <NFormItem label="个人简介">
            <NInput
              v-model:value="editingBio"
              type="textarea"
              :rows="4"
              placeholder="介绍一下你自己..."
              maxlength="200"
              show-count
            />
          </NFormItem>
        </NForm>
        <template #footer>
          <NSpace justify="end">
            <NButton @click="showEditBioModal = false">取消</NButton>
            <NButton type="primary" @click="saveBio">保存</NButton>
          </NSpace>
        </template>
      </NModal>
    </NLayoutContent>
  </NLayout>
</template>

<style scoped>
.profile-layout {
  min-height: calc(100vh - var(--header-height, 64px));
  background-color: #f5f7f9;
}
</style>
