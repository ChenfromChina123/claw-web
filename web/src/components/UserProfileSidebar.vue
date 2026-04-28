<script setup lang="ts">
/**
 * UserProfileSidebar - 用户个人主页侧边栏
 * 
 * 功能：
 * - 顶部区域：用户个人主页模块（头像、用户名、等级、配额概览）
 * - 下方Tab区域：集成 Agent 活动侧边栏的功能
 */

import { ref, computed, onMounted, watch } from 'vue'
import { 
  NDrawer, 
  NDrawerContent, 
  NTabs, 
  NTabPane,
  NButton,
  NTag,
  NBadge,
  NDivider,
  NSpace,
  NSwitch,
  NAvatar,
  NProgress,
  NIcon,
  NScrollbar,
  useMessage
} from 'naive-ui'
import { 
  PersonOutline, 
  SettingsOutline, 
  LogOutOutline, 
  HardwareChipOutline,
  CloudOutline,
  ChatbubblesOutline,
  TimeOutline,
  CreateOutline,
  StarOutline,
  HeartOutline
} from '@vicons/ionicons5'
import { useAuthStore } from '@/stores/auth'
import { userTierApi, UserTier, type HardwareQuota } from '@/api/userTierApi'
import { sessionApi } from '@/api/sessionApi'

// Props
interface Props {
  show: boolean
  defaultTab?: string
}

const props = withDefaults(defineProps<Props>(), {
  defaultTab: 'profile'
})

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'logout'): void
  (e: 'open-settings'): void
}>()

const authStore = useAuthStore()
const message = useMessage()

// 加载状态
const loading = ref(false)
const quotaLoading = ref(false)
const statsLoading = ref(false)

// 配额信息
const quotaInfo = ref<{
  tier: UserTier
  quota: HardwareQuota
} | null>(null)

// 用户统计数据
const userStats = ref({
  totalSessions: 0,
  totalMessages: 0,
  totalToolsUsed: 0,
  memberDays: 0
})

// 当前 Tab
const currentTab = ref(props.defaultTab)

// 监听默认 Tab 变化
watch(() => props.defaultTab, (newTab) => {
  currentTab.value = newTab
})

// 监听显示状态
watch(() => props.show, (isShowing) => {
  if (isShowing) {
    // 每次打开时刷新数据
    fetchQuotaInfo()
    fetchUserStats()
  }
})

// 用户信息
const user = computed(() => authStore.user)
const isLoggedIn = computed(() => authStore.isLoggedIn)

// 等级颜色
const tierColors: Record<UserTier, string> = {
  [UserTier.FREE]: 'default',
  [UserTier.BASIC]: 'info',
  [UserTier.PRO]: 'success',
  [UserTier.ENTERPRISE]: 'warning',
  [UserTier.ADMIN]: 'error'
}

// 等级名称
const tierNames: Record<UserTier, string> = {
  [UserTier.FREE]: '免费用户',
  [UserTier.BASIC]: '基础会员',
  [UserTier.PRO]: '专业会员',
  [UserTier.ENTERPRISE]: '企业会员',
  [UserTier.ADMIN]: '管理员'
}

// 等级图标
const tierIcons: Record<UserTier, any> = {
  [UserTier.FREE]: PersonOutline,
  [UserTier.BASIC]: HardwareChipOutline,
  [UserTier.PRO]: CloudOutline,
  [UserTier.ENTERPRISE]: StarOutline,
  [UserTier.ADMIN]: HeartOutline
}

// 配额使用百分比
const memoryPercent = computed(() => {
  if (!quotaInfo.value) return 0
  const used = quotaInfo.value.quota.memoryLimitMB * 0.3 // 模拟数据
  return Math.min((used / quotaInfo.value.quota.memoryLimitMB) * 100, 100)
})

const storagePercent = computed(() => {
  if (!quotaInfo.value) return 0
  const used = quotaInfo.value.quota.storageQuotaMB * 0.25 // 模拟数据
  return Math.min((used / quotaInfo.value.quota.storageQuotaMB) * 100, 100)
})

const sessionPercent = computed(() => {
  if (!quotaInfo.value) return 0
  const used = userStats.value.totalSessions
  return Math.min((used / quotaInfo.value.quota.maxSessions) * 100, 100)
})

// 会员时长计算
const memberDuration = computed(() => {
  if (!user.value?.createdAt) return 0
  const created = new Date(user.value.createdAt)
  const now = new Date()
  const diff = now.getTime() - created.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
})

// 格式化存储大小
const formatMB = (mb: number): string => {
  if (mb < 1024) return `${mb} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

// 抽屉关闭
function handleClose() {
  emit('update:show', false)
}

// 获取配额信息
async function fetchQuotaInfo() {
  quotaLoading.value = true
  try {
    const data = await userTierApi.getMyQuota()
    quotaInfo.value = {
      tier: data.tier,
      quota: data.quota
    }
  } catch (error) {
    console.error('获取配额信息失败:', error)
    // 使用默认值
    quotaInfo.value = {
      tier: UserTier.FREE,
      quota: {
        cpuLimit: 1,
        memoryLimitMB: 256,
        storageQuotaMB: 512,
        maxSessions: 5,
        maxFiles: 100,
        maxFileSizeMB: 5,
        maxPtyProcesses: 1,
        description: '免费用户基础配额'
      }
    }
  } finally {
    quotaLoading.value = false
  }
}

// 获取用户统计数据
async function fetchUserStats() {
  statsLoading.value = true
  try {
    const sessions = await sessionApi.getSessions()
    userStats.value = {
      totalSessions: sessions.length,
      totalMessages: sessions.reduce((acc, s: any) => acc + (s.messageCount || 0), 0),
      totalToolsUsed: 0,
      memberDays: memberDuration.value
    }
  } catch (error) {
    console.error('获取用户统计失败:', error)
    // 使用默认值
    userStats.value = {
      totalSessions: 0,
      totalMessages: 0,
      totalToolsUsed: 0,
      memberDays: memberDuration.value || 1
    }
  } finally {
    statsLoading.value = false
  }
}

// 登出
function handleLogout() {
  emit('logout')
  handleClose()
}

// 打开设置
function handleOpenSettings() {
  emit('open-settings')
  handleClose()
}

// 初始化
onMounted(() => {
  if (props.show) {
    fetchQuotaInfo()
    fetchUserStats()
  }
})
</script>

<template>
  <NDrawer
    :show="props.show"
    :width="360"
    placement="right"
    class="user-profile-sidebar"
    @update:show="(val) => emit('update:show', val)"
  >
    <NDrawerContent :native-scrollbar="false" closable>
      <!-- 头部 -->
      <template #header>
        <div class="sidebar-header">
          <div class="header-title">
            <span class="title-icon">👤</span>
            <span class="title-text">个人中心</span>
          </div>
        </div>
      </template>

      <!-- 用户个人主页模块 - 顶部区域 -->
      <div class="profile-section">
        <!-- 用户卡片 -->
        <div class="profile-card">
          <div class="profile-cover">
            <div class="cover-gradient"></div>
          </div>
          
          <div class="profile-avatar-wrapper">
            <NAvatar
              v-if="user?.avatar"
              :src="user.avatar"
              :size="80"
              round
              class="profile-avatar"
            />
            <NAvatar
              v-else
              :size="80"
              round
              class="profile-avatar"
            >
              {{ user?.username?.charAt(0).toUpperCase() || 'U' }}
            </NAvatar>
            
            <!-- 等级徽章 -->
            <div class="tier-badge" :class="`tier-${quotaInfo?.tier || 'free'}`">
              <NIcon :component="tierIcons[quotaInfo?.tier || UserTier.FREE]" size="12" />
            </div>
          </div>
          
          <div class="profile-info">
            <h2 class="username">{{ user?.username || '未登录用户' }}</h2>
            <p class="email">{{ user?.email || 'guest@example.com' }}</p>
            
            <NTag 
              :type="tierColors[quotaInfo?.tier || UserTier.FREE]" 
              size="small"
              round
              class="tier-tag"
            >
              <template #icon>
                <NIcon :component="tierIcons[quotaInfo?.tier || UserTier.FREE]" />
              </template>
              {{ tierNames[quotaInfo?.tier || UserTier.FREE] }}
            </NTag>
          </div>
          
          <!-- 会员时长 -->
          <div class="member-duration">
            <NIcon :component="TimeOutline" />
            <span>已使用 {{ memberDuration || 1 }} 天</span>
          </div>
        </div>
        
        <!-- 配额概览 -->
        <div class="quota-overview" v-if="quotaInfo">
          <div class="quota-title">
            <span>资源配额</span>
            <NButton text size="tiny" type="primary" @click="currentTab = 'quota'">
              详情
            </NButton>
          </div>
          
          <div class="quota-items">
            <!-- 内存配额 -->
            <div class="quota-item">
              <div class="quota-item-header">
                <NIcon :component="HardwareChipOutline" size="14" />
                <span>内存</span>
                <span class="quota-value">{{ formatMB(quotaInfo.quota.memoryLimitMB) }}</span>
              </div>
              <NProgress
                type="line"
                :percentage="memoryPercent"
                :height="6"
                :border-radius="3"
                :fill-border-radius="3"
                status="success"
                :show-indicator="false"
              />
            </div>
            
            <!-- 存储配额 -->
            <div class="quota-item">
              <div class="quota-item-header">
                <NIcon :component="CloudOutline" size="14" />
                <span>存储</span>
                <span class="quota-value">{{ formatMB(quotaInfo.quota.storageQuotaMB) }}</span>
              </div>
              <NProgress
                type="line"
                :percentage="storagePercent"
                :height="6"
                :border-radius="3"
                :fill-border-radius="3"
                status="info"
                :show-indicator="false"
              />
            </div>
            
            <!-- 会话配额 -->
            <div class="quota-item">
              <div class="quota-item-header">
                <NIcon :component="ChatbubblesOutline" size="14" />
                <span>会话</span>
                <span class="quota-value">{{ quotaInfo.quota.maxSessions }} 个</span>
              </div>
              <NProgress
                type="line"
                :percentage="sessionPercent"
                :height="6"
                :border-radius="3"
                :fill-border-radius="3"
                :status="sessionPercent > 80 ? 'error' : 'warning'"
                :show-indicator="false"
              />
            </div>
          </div>
        </div>
        
        <!-- 统计数据 -->
        <div class="stats-overview">
          <div class="stat-item">
            <span class="stat-value">{{ userStats.totalSessions }}</span>
            <span class="stat-label">会话</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">{{ userStats.totalMessages }}</span>
            <span class="stat-label">消息</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">{{ userStats.memberDays || 1 }}</span>
            <span class="stat-label">天数</span>
          </div>
        </div>
        
        <!-- 快捷操作 -->
        <div class="quick-actions">
          <NButton 
            block 
            quaternary 
            @click="handleOpenSettings"
            class="action-btn"
          >
            <template #icon>
              <NIcon><SettingsOutline /></NIcon>
            </template>
            设置
          </NButton>
          
          <NButton 
            block 
            quaternary 
            type="error"
            @click="handleLogout"
            class="action-btn logout-btn"
          >
            <template #icon>
              <NIcon><LogOutOutline /></NIcon>
            </template>
            退出登录
          </NButton>
        </div>
      </div>
      
      <NDivider />
      
      <!-- Tab 区域 -->
      <div class="tab-section">
        <NTabs v-model:value="currentTab" type="line" animated>
          <!-- 快捷操作 Tab -->
          <NTabPane name="profile" tab="快捷">
            <NScrollbar style="max-height: 400px;">
              <div class="quick-links">
                <div class="link-item" @click="currentTab = 'quota'">
                  <NIcon :component="HardwareChipOutline" size="20" />
                  <span>资源配额</span>
                  <span class="link-arrow">›</span>
                </div>
                <div class="link-item">
                  <NIcon :component="CreateOutline" size="20" />
                  <span>编辑资料</span>
                  <span class="link-arrow">›</span>
                </div>
                <div class="link-item">
                  <NIcon :component="StarOutline" size="20" />
                  <span>我的收藏</span>
                  <span class="link-arrow">›</span>
                </div>
                <div class="link-item">
                  <NIcon :component="HeartOutline" size="20" />
                  <span>我的积分</span>
                  <span class="link-arrow">›</span>
                </div>
              </div>
            </NScrollbar>
          </NTabPane>
          
          <!-- 配额 Tab -->
          <NTabPane name="quota" tab="配额">
            <NScrollbar style="max-height: 400px;">
              <div class="quota-detail">
                <div class="quota-section">
                  <h4>计算资源</h4>
                  <div class="quota-row">
                    <span>CPU 核心</span>
                    <span>{{ quotaInfo?.quota.cpuLimit || 1 }} 核</span>
                  </div>
                  <div class="quota-row">
                    <span>内存限制</span>
                    <span>{{ quotaInfo ? formatMB(quotaInfo.quota.memoryLimitMB) : '256 MB' }}</span>
                  </div>
                  <div class="quota-row">
                    <span>PTY 进程</span>
                    <span>{{ quotaInfo?.quota.maxPtyProcesses || 1 }} 个</span>
                  </div>
                </div>
                
                <div class="quota-section">
                  <h4>存储资源</h4>
                  <div class="quota-row">
                    <span>存储空间</span>
                    <span>{{ quotaInfo ? formatMB(quotaInfo.quota.storageQuotaMB) : '512 MB' }}</span>
                  </div>
                  <div class="quota-row">
                    <span>最大文件数</span>
                    <span>{{ quotaInfo?.quota.maxFiles || 100 }}</span>
                  </div>
                  <div class="quota-row">
                    <span>单文件限制</span>
                    <span>{{ quotaInfo?.quota.maxFileSizeMB || 5 }} MB</span>
                  </div>
                </div>
                
                <div class="quota-section">
                  <h4>会话限制</h4>
                  <div class="quota-row">
                    <span>最大会话数</span>
                    <span>{{ quotaInfo?.quota.maxSessions || 5 }}</span>
                  </div>
                </div>
                
                <div class="quota-desc">
                  <p>{{ quotaInfo?.quota.description || '免费用户基础配额' }}</p>
                </div>
              </div>
            </NScrollbar>
          </NTabPane>
          
          <!-- 设置 Tab -->
          <NTabPane name="settings" tab="设置">
            <NScrollbar style="max-height: 400px;">
              <div class="settings-list">
                <div class="settings-group">
                  <h4>账户设置</h4>
                  <div class="settings-item">
                    <span>修改密码</span>
                    <span class="link-arrow">›</span>
                  </div>
                  <div class="settings-item">
                    <span>更换邮箱</span>
                    <span class="link-arrow">›</span>
                  </div>
                  <div class="settings-item">
                    <span>绑定手机</span>
                    <span class="link-arrow">›</span>
                  </div>
                </div>
                
                <div class="settings-group">
                  <h4>通知设置</h4>
                  <div class="settings-item switch-item">
                    <span>消息通知</span>
                    <NSwitch size="small" :default-value="true" />
                  </div>
                  <div class="settings-item switch-item">
                    <span>声音提示</span>
                    <NSwitch size="small" :default-value="false" />
                  </div>
                </div>
                
                <div class="settings-group">
                  <h4>隐私设置</h4>
                  <div class="settings-item switch-item">
                    <span>公开个人资料</span>
                    <NSwitch size="small" :default-value="false" />
                  </div>
                </div>
              </div>
            </NScrollbar>
          </NTabPane>
        </NTabs>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.user-profile-sidebar {
  --sidebar-bg: rgba(20, 20, 35, 0.95);
}

/* 头部样式 */
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  font-size: 20px;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

/* 个人主页模块 */
.profile-section {
  padding: 0 4px;
}

/* 用户卡片 */
.profile-card {
  background: linear-gradient(145deg, rgba(50, 50, 80, 0.6) 0%, rgba(30, 30, 50, 0.8) 100%);
  border-radius: 16px;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  position: relative;
}

.profile-cover {
  height: 60px;
  position: relative;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.cover-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 30px;
  background: linear-gradient(to top, rgba(30, 30, 50, 0.8), transparent);
}

.profile-avatar-wrapper {
  position: relative;
  display: flex;
  justify-content: center;
  margin-top: -40px;
  z-index: 1;
}

.profile-avatar {
  border: 3px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.tier-badge {
  position: absolute;
  bottom: 0;
  right: calc(50% - 44px);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.tier-badge.tier-free {
  background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
  color: white;
}

.tier-badge.tier-basic {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
}

.tier-badge.tier-pro {
  background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  color: white;
}

.tier-badge.tier-enterprise {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
}

.tier-badge.tier-admin {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
}

.profile-info {
  text-align: center;
  padding: 8px 16px 12px;
}

.username {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 4px;
}

.email {
  font-size: 12px;
  color: #9ca3af;
  margin: 0 0 8px;
}

.tier-tag {
  font-size: 11px;
}

.member-duration {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px 12px;
  font-size: 12px;
  color: #9ca3af;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.member-duration .n-icon {
  color: #667eea;
}

/* 配额概览 */
.quota-overview {
  margin-top: 16px;
  background: rgba(30, 30, 50, 0.6);
  border-radius: 12px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.quota-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #9ca3af;
}

.quota-items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quota-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quota-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #9ca3af;
}

.quota-item-header .n-icon {
  color: #667eea;
}

.quota-value {
  margin-left: auto;
  font-weight: 500;
  color: #e5e7eb;
}

/* 统计数据 */
.stats-overview {
  display: flex;
  align-items: center;
  justify-content: space-around;
  margin-top: 16px;
  padding: 14px;
  background: rgba(30, 30, 50, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #667eea;
}

.stat-label {
  font-size: 11px;
  color: #9ca3af;
}

.stat-divider {
  width: 1px;
  height: 30px;
  background: rgba(255, 255, 255, 0.1);
}

/* 快捷操作 */
.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 16px;
}

.action-btn {
  justify-content: flex-start !important;
  padding-left: 12px !important;
}

.logout-btn {
  color: #ef4444 !important;
}

/* Tab 区域 */
.tab-section {
  margin-top: 8px;
}

/* 快捷链接 */
.quick-links {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.link-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #9ca3af;
}

.link-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #e5e7eb;
}

.link-item .n-icon {
  color: #667eea;
}

.link-item span:first-of-type {
  flex: 1;
  font-size: 14px;
}

.link-arrow {
  font-size: 18px;
  color: #6b7280;
}

/* 配额详情 */
.quota-detail {
  padding: 4px 0;
}

.quota-section {
  margin-bottom: 20px;
}

.quota-section h4 {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  margin: 0 0 10px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.quota-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  color: #e5e7eb;
  background: rgba(255, 255, 255, 0.03);
  margin-bottom: 6px;
}

.quota-row span:first-child {
  color: #9ca3af;
}

.quota-desc {
  padding: 12px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 8px;
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
}

/* 设置列表 */
.settings-list {
  padding: 4px 0;
}

.settings-group {
  margin-bottom: 20px;
}

.settings-group h4 {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  margin: 0 0 10px 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  color: #e5e7eb;
  background: rgba(255, 255, 255, 0.03);
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.settings-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.settings-item.switch-item {
  cursor: default;
}

.settings-item.switch-item:hover {
  background: rgba(255, 255, 255, 0.03);
}
</style>
