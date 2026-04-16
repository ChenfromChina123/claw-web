<script setup lang="ts">
/**
 * 套餐对比组件
 * 显示不同用户等级的套餐对比
 */

import { ref, onMounted } from 'vue'
import { 
  NCard, NGrid, NGi, NTag, NButton, NSpace, NIcon, 
  NDivider, useMessage
} from 'naive-ui'
import { 
  CheckmarkOutline, CloseOutline, StarOutline,
  RocketOutline, DiamondOutline, MedalOutline
} from '@vicons/ionicons5'
import { userTierApi, UserTier, type HardwareQuota } from '@/api/userTierApi'

const message = useMessage()
const loading = ref(false)
const quotas = ref<Record<UserTier, HardwareQuota> | null>(null)

const tierOrder = [UserTier.FREE, UserTier.BASIC, UserTier.PRO, UserTier.ENTERPRISE, UserTier.ADMIN]

const tierColors: Record<UserTier, string> = {
  [UserTier.FREE]: '#909399',
  [UserTier.BASIC]: '#409eff',
  [UserTier.PRO]: '#67c23a',
  [UserTier.ENTERPRISE]: '#e6a23c',
  [UserTier.ADMIN]: '#f56c6c'
}

const tierIcons: Record<UserTier, any> = {
  [UserTier.FREE]: StarOutline,
  [UserTier.BASIC]: RocketOutline,
  [UserTier.PRO]: DiamondOutline,
  [UserTier.ENTERPRISE]: MedalOutline,
  [UserTier.ADMIN]: MedalOutline
}

const tierPrices: Record<UserTier, { price: string; period: string }> = {
  [UserTier.FREE]: { price: '免费', period: '' },
  [UserTier.BASIC]: { price: '¥29', period: '/月' },
  [UserTier.PRO]: { price: '¥99', period: '/月' },
  [UserTier.ENTERPRISE]: { price: '¥299', period: '/月' },
  [UserTier.ADMIN]: { price: '联系客服', period: '' }
}

const fetchQuotas = async () => {
  loading.value = true
  try {
    const data = await userTierApi.getAllQuotas()
    quotas.value = data
  } catch (error) {
    console.error('获取配额信息失败:', error)
    message.error('获取配额信息失败')
  } finally {
    loading.value = false
  }
}

const formatMB = (mb: number): string => {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

const handleUpgrade = (tier: UserTier) => {
  message.info(`升级到 ${tier} 套餐功能开发中...`)
}

onMounted(() => {
  fetchQuotas()
})
</script>

<template>
  <div class="tier-comparison">
    <div class="comparison-header">
      <h2>选择适合您的套餐</h2>
      <p class="subtitle">根据您的需求选择合适的套餐，随时可以升级</p>
    </div>

    <NSpin :show="loading">
      <NGrid :cols="5" :x-gap="16" responsive="screen" item-responsive>
        <NGi v-for="tier in tierOrder" :key="tier" span="5 m:2 l:1">
          <NCard 
            :title="quotas?.[tier]?.displayName || tier" 
            class="tier-card"
            :class="{ 'popular': tier === UserTier.PRO }"
            :bordered="false"
          >
            <template #header-extra>
              <NIcon :component="tierIcons[tier]" :color="tierColors[tier]" size="24" />
            </template>

            <div class="tier-content">
              <div class="tier-price" :style="{ color: tierColors[tier] }">
                <span class="price-amount">{{ tierPrices[tier].price }}</span>
                <span class="price-period">{{ tierPrices[tier].period }}</span>
              </div>

              <NDivider />

              <div class="tier-features" v-if="quotas?.[tier]">
                <div class="feature-item">
                  <NIcon :component="CheckmarkOutline" color="#67c23a" />
                  <span>CPU: {{ quotas[tier].cpuLimit }} 核</span>
                </div>
                <div class="feature-item">
                  <NIcon :component="CheckmarkOutline" color="#67c23a" />
                  <span>内存: {{ formatMB(quotas[tier].memoryLimitMB) }}</span>
                </div>
                <div class="feature-item">
                  <NIcon :component="CheckmarkOutline" color="#67c23a" />
                  <span>存储: {{ formatMB(quotas[tier].storageQuotaMB) }}</span>
                </div>
                <div class="feature-item">
                  <NIcon :component="CheckmarkOutline" color="#67c23a" />
                  <span>会话数: {{ quotas[tier].maxSessions }} 个</span>
                </div>
                <div class="feature-item">
                  <NIcon :component="CheckmarkOutline" color="#67c23a" />
                  <span>PTY进程: {{ quotas[tier].maxPtyProcesses }} 个</span>
                </div>
                <div class="feature-item">
                  <NIcon :component="CheckmarkOutline" color="#67c23a" />
                  <span>文件数: {{ quotas[tier].maxFiles }} 个</span>
                </div>
                <div class="feature-item">
                  <NIcon :component="CheckmarkOutline" color="#67c23a" />
                  <span>单文件: {{ quotas[tier].maxFileSizeMB }} MB</span>
                </div>
                <div class="feature-item">
                  <NIcon 
                    :component="quotas[tier].networkBandwidthKBps > 0 ? CheckmarkOutline : CloseOutline" 
                    :color="quotas[tier].networkBandwidthKBps > 0 ? '#67c23a' : '#909399'" 
                  />
                  <span>网络带宽: {{ quotas[tier].networkBandwidthKBps > 0 ? `${quotas[tier].networkBandwidthKBps} KB/s` : '无限制' }}</span>
                </div>
              </div>

              <NDivider />

              <div class="tier-description">
                {{ quotas?.[tier]?.description }}
              </div>

              <NButton 
                v-if="tier !== UserTier.ADMIN"
                type="primary" 
                block 
                :color="tierColors[tier]"
                @click="handleUpgrade(tier)"
                class="upgrade-button"
              >
                {{ tier === UserTier.FREE ? '当前套餐' : '立即升级' }}
              </NButton>
            </div>

            <div v-if="tier === UserTier.PRO" class="popular-badge">
              <NTag type="warning" size="small">
                <template #icon>
                  <NIcon :component="StarOutline" />
                </template>
                最受欢迎
              </NTag>
            </div>
          </NCard>
        </NGi>
      </NGrid>
    </NSpin>

    <div class="comparison-footer">
      <p>💡 提示：所有套餐均支持随时升级，升级后立即生效</p>
      <p>🔒 安全保障：所有数据加密存储，支持数据备份</p>
      <p>📞 技术支持：专业团队7x24小时在线支持</p>
    </div>
  </div>
</template>

<style scoped>
.tier-comparison {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.comparison-header {
  text-align: center;
  margin-bottom: 40px;
}

.comparison-header h2 {
  font-size: 32px;
  font-weight: bold;
  margin-bottom: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  font-size: 16px;
  color: #666;
}

.tier-card {
  position: relative;
  transition: all 0.3s ease;
  border-radius: 16px;
  overflow: hidden;
}

.tier-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
}

.tier-card.popular {
  border: 2px solid #e6a23c;
  box-shadow: 0 8px 16px rgba(230, 162, 60, 0.2);
}

.tier-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tier-price {
  text-align: center;
  padding: 16px 0;
}

.price-amount {
  font-size: 36px;
  font-weight: bold;
}

.price-period {
  font-size: 16px;
  color: #999;
}

.tier-features {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.tier-description {
  font-size: 13px;
  color: #666;
  line-height: 1.6;
  text-align: center;
  padding: 8px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
}

.upgrade-button {
  margin-top: 8px;
}

.popular-badge {
  position: absolute;
  top: 12px;
  right: 12px;
}

.comparison-footer {
  margin-top: 40px;
  text-align: center;
  color: #666;
  font-size: 14px;
  line-height: 2;
}

@media (max-width: 768px) {
  .comparison-header h2 {
    font-size: 24px;
  }
  
  .tier-card {
    margin-bottom: 16px;
  }
}
</style>
