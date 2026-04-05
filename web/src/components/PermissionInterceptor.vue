<script setup lang="ts">
/**
 * PermissionInterceptor - 权限拦截与审批组件
 * 
 * 功能：
 * - 显示危险操作的权限请求
 * - 提供允许/拒绝按钮
 * - 显示风险等级和建议
 * - 支持超时自动拒绝
 * - 显示操作详情
 */

import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { NCard, NButton, NTag, NAlert, NTooltip, NPopover } from 'naive-ui'
import type { PermissionRequest } from '@/types/agentWorkflow'
import { useAgentStore } from '@/stores/agent'

// Props
interface Props {
  permission?: PermissionRequest | null
  autoClose?: boolean          // 处理后自动关闭
  showDetails?: boolean        // 显示详细信息
  compact?: boolean            // 紧凑模式
}

const props = withDefaults(defineProps<Props>(), {
  autoClose: true,
  showDetails: true,
  compact: false
})

const emit = defineEmits<{
  (e: 'approve', permissionId: string): void
  (e: 'deny', permissionId: string): void
  (e: 'close'): void
}>()

const agentStore = useAgentStore()

// 倒计时状态
const countdown = ref(30)
const countdownInterval = ref<number | null>(null)

// 风险等级配置
const riskConfig = {
  LOW: {
    color: '#18a058',
    bgColor: 'rgba(24, 160, 88, 0.1)',
    label: '低风险',
    description: '此操作风险较低，但仍需确认'
  },
  MEDIUM: {
    color: '#f0a020',
    bgColor: 'rgba(240, 160, 32, 0.1)',
    label: '中风险',
    description: '此操作可能会影响系统状态'
  },
  HIGH: {
    color: '#d03050',
    bgColor: 'rgba(208, 48, 80, 0.1)',
    label: '高风险',
    description: '此操作可能造成数据损失或系统变更'
  },
  CRITICAL: {
    color: '#d03050',
    bgColor: 'rgba(208, 48, 80, 0.15)',
    label: '极高风险',
    description: '此操作不可逆，可能造成严重后果'
  }
}

// 获取风险配置
const currentRiskConfig = computed(() => {
  if (!props.permission) return riskConfig.LOW
  return riskConfig[props.permission.riskLevel] || riskConfig.LOW
})

// 是否正在处理
const isProcessing = ref(false)

// 工具名称映射
const toolDisplayNames: Record<string, string> = {
  Bash: '执行命令',
  FileWrite: '写入文件',
  FileEdit: '编辑文件',
  FileDelete: '删除文件',
  Glob: '搜索文件',
  Grep: '搜索内容',
  WebSearch: '网络搜索',
  WebFetch: '获取网页',
  Agent: '启动子代理',
  TodoWrite: '更新任务'
}

// 获取工具显示名称
function getToolDisplayName(toolName: string): string {
  return toolDisplayNames[toolName] || toolName
}

// 处理允许
async function handleApprove() {
  if (!props.permission || isProcessing.value) return
  
  isProcessing.value = true
  try {
    await agentStore.approvePermission(props.permission.permissionId, true)
    emit('approve', props.permission.permissionId)
    
    if (props.autoClose) {
      emit('close')
    }
  } finally {
    isProcessing.value = false
  }
}

// 处理拒绝
async function handleDeny() {
  if (!props.permission || isProcessing.value) return
  
  isProcessing.value = true
  try {
    await agentStore.denyPermission(props.permission.permissionId)
    emit('deny', props.permission.permissionId)
    
    if (props.autoClose) {
      emit('close')
    }
  } finally {
    isProcessing.value = false
  }
}

// 启动倒计时
function startCountdown() {
  if (countdownInterval.value) {
    clearInterval(countdownInterval.value)
  }
  
  countdown.value = 30
  
  countdownInterval.value = window.setInterval(() => {
    countdown.value--
    
    if (countdown.value <= 0) {
      handleDeny()
    }
  }, 1000)
}

// 停止倒计时
function stopCountdown() {
  if (countdownInterval.value) {
    clearInterval(countdownInterval.value)
    countdownInterval.value = null
  }
}

// 监听 permission 变化
watch(() => props.permission, (newVal) => {
  if (newVal && newVal.status === 'pending') {
    startCountdown()
  } else {
    stopCountdown()
  }
}, { immediate: true })

// 生命周期
onMounted(() => {
  if (props.permission && props.permission.status === 'pending') {
    startCountdown()
  }
})

onUnmounted(() => {
  stopCountdown()
})

// 格式化时间
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  })
}
</script>

<template>
  <div v-if="permission" class="permission-interceptor" :class="{ compact }">
    <!-- 风险等级头部 -->
    <div 
      class="risk-header"
      :style="{ 
        backgroundColor: currentRiskConfig.bgColor,
        borderColor: currentRiskConfig.color
      }"
    >
      <div class="risk-badge">
        <span class="risk-icon">⚠️</span>
        <NTag 
          :color="{ 
            color: currentRiskConfig.bgColor,
            textColor: currentRiskConfig.color,
            borderColor: 'transparent'
          }"
          size="small"
        >
          {{ currentRiskConfig.label }}
        </NTag>
      </div>
      
      <div class="risk-info">
        <span class="risk-title">
          需要授权: {{ getToolDisplayName(permission.toolName) }}
        </span>
        <span class="risk-description">
          {{ currentRiskConfig.description }}
        </span>
      </div>
    </div>
    
    <!-- 操作详情 -->
    <div v-if="showDetails && !compact" class="operation-details">
      <!-- 操作名称 -->
      <div class="detail-row">
        <span class="detail-label">操作</span>
        <span class="detail-value">{{ permission.action || permission.toolName }}</span>
      </div>
      
      <!-- 操作原因 -->
      <div v-if="permission.reason" class="detail-row">
        <span class="detail-label">原因</span>
        <span class="detail-value reason">{{ permission.reason }}</span>
      </div>
      
      <!-- 请求时间 -->
      <div class="detail-row">
        <span class="detail-label">请求时间</span>
        <span class="detail-value">{{ formatTime(permission.requestedAt) }}</span>
      </div>
    </div>
    
    <!-- 警告信息 -->
    <NAlert 
      v-if="permission.riskLevel === 'HIGH' || permission.riskLevel === 'CRITICAL'"
      type="warning"
      :show-icon="false"
      class="risk-alert"
    >
      <template #header>
        谨慎操作
      </template>
      此操作可能不可逆，请确认您了解操作后果。
    </NAlert>
    
    <!-- 操作按钮 -->
    <div class="action-buttons">
      <!-- 拒绝按钮 -->
      <NButton 
        type="error" 
        secondary
        :loading="isProcessing"
        @click="handleDeny"
      >
        <template #icon>
          <span>✕</span>
        </template>
        拒绝
      </NButton>
      
      <!-- 倒计时 -->
      <div class="countdown" :class="{ warning: countdown <= 10 }">
        <span>{{ countdown }}s</span>
      </div>
      
      <!-- 允许按钮 -->
      <NButton 
        type="success"
        :loading="isProcessing"
        @click="handleApprove"
      >
        <template #icon>
          <span>✓</span>
        </template>
        允许执行
      </NButton>
    </div>
    
    <!-- 建议操作 -->
    <div v-if="permission.suggestions && permission.suggestions.length > 0" class="suggestions">
      <span class="suggestions-label">建议替代操作:</span>
      <div class="suggestions-list">
        <NTag 
          v-for="(suggestion, index) in permission.suggestions" 
          :key="index"
          size="small"
          :bordered="false"
          @click="handleDeny"
        >
          {{ suggestion }}
        </NTag>
      </div>
    </div>
  </div>
</template>

<style scoped>
.permission-interceptor {
  --border-radius: 8px;
  
  border: 1px solid var(--border-color, #3b3b3b);
  border-radius: var(--border-radius);
  background: var(--card-color, #1a1a1a);
  overflow: hidden;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.permission-interceptor.compact {
  border-radius: 4px;
}

/* 风险头部 */
.risk-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #3b3b3b);
}

.risk-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.risk-icon {
  font-size: 16px;
}

.risk-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.risk-title {
  font-weight: 600;
  color: var(--text-color, #fff);
  font-size: 14px;
}

.risk-description {
  font-size: 12px;
  color: var(--text-color-3, #999);
}

/* 操作详情 */
.operation-details {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #3b3b3b);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 4px 0;
}

.detail-label {
  font-size: 12px;
  color: var(--text-color-3, #999);
  flex-shrink: 0;
}

.detail-value {
  font-size: 12px;
  color: var(--text-color-2, #ccc);
  text-align: right;
  word-break: break-all;
}

.detail-value.reason {
  color: var(--text-color, #fff);
  max-width: 70%;
}

/* 警告 */
.risk-alert {
  margin: 12px 16px;
  font-size: 12px;
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
}

.countdown {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 32px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color-3, #999);
  background: var(--fill-color, #2a2a2a);
  border-radius: 4px;
}

.countdown.warning {
  color: #d03050;
  background: rgba(208, 48, 80, 0.1);
  animation: countdownPulse 1s ease infinite;
}

@keyframes countdownPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

/* 建议 */
.suggestions {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color, #3b3b3b);
  background: var(--fill-color-light, #1e1e1e);
}

.suggestions-label {
  font-size: 11px;
  color: var(--text-color-3, #999);
  display: block;
  margin-bottom: 8px;
}

.suggestions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.suggestions-list :deep(.n-tag) {
  cursor: pointer;
  transition: all 0.2s;
}

.suggestions-list :deep(.n-tag:hover) {
  transform: scale(1.05);
}
</style>
