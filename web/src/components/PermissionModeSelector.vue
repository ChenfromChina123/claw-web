<script setup lang="ts">
/**
 * PermissionModeSelector - 权限模式选择器组件
 * 
 * 功能：
 * - 选择 Agent 的权限模式
 * - 显示各模式说明
 * - 支持快捷切换
 * - 显示当前模式状态
 */

import { computed, ref } from 'vue'
import { 
  NButton, 
  NPopover, 
  NTooltip,
  NTag,
  NBadge
} from 'naive-ui'
import { useAgentStore } from '@/stores/agent'
import type { PermissionMode } from '@/types/agentWorkflow'

// Props
interface Props {
  compact?: boolean
  showLabel?: boolean
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
  showLabel: true,
  placement: 'bottom'
})

const emit = defineEmits<{
  (e: 'change', mode: PermissionMode): void
}>()

const agentStore = useAgentStore()

// 当前权限模式
const currentMode = computed(() => agentStore.agentConfig.permissionMode)

// 权限模式配置
const modeConfig: Record<PermissionMode, {
  icon: string
  label: string
  shortLabel: string
  description: string
  color: string
  requiresInteraction: boolean
}> = {
  bypassPermissions: {
    icon: '⚡',
    label: '无限制',
    shortLabel: '自由',
    description: '所有操作直接执行，无需确认',
    color: '#d03050',
    requiresInteraction: false
  },
  acceptEdits: {
    icon: '✏️',
    label: '接受编辑',
    shortLabel: '编辑',
    description: '接受所有文件编辑，其他操作需确认',
    color: '#f0a020',
    requiresInteraction: false
  },
  auto: {
    icon: '🔄',
    label: '自动模式',
    shortLabel: '自动',
    description: '自动允许安全操作，高风险操作需确认',
    color: '#2080f0',
    requiresInteraction: false
  },
  plan: {
    icon: '📋',
    label: '计划模式',
    shortLabel: '计划',
    description: '先规划后执行，所有修改需确认',
    color: '#18a058',
    requiresInteraction: true
  },
  bubble: {
    icon: '💬',
    label: '冒泡模式',
    shortLabel: '冒泡',
    description: '类似自动模式，但会提示所有操作',
    color: '#9c27b0',
    requiresInteraction: false
  }
}

// 获取当前模式配置
const currentModeConfig = computed(() => modeConfig[currentMode.value] || modeConfig.auto)

// 是否有待处理权限
const hasPendingPermissions = computed(() => agentStore.pendingPermissionList.length > 0)

// 处理模式切换
function handleModeChange(mode: PermissionMode) {
  agentStore.setPermissionMode(mode)
  emit('change', mode)
}

// 模式列表
const modeList = Object.entries(modeConfig).map(([mode, config]) => ({
  mode: mode as PermissionMode,
  ...config
}))
</script>

<template>
  <NPopover 
    trigger="click" 
    :placement="placement"
    :show-arrow="false"
    class="permission-mode-selector"
  >
    <template #trigger>
      <NButton 
        quaternary 
        size="small"
        class="selector-trigger"
        :class="{ compact, 'has-pending': hasPendingPermissions }"
      >
        <!-- 图标 -->
        <template #icon>
          <span class="mode-icon">{{ currentModeConfig.icon }}</span>
        </template>
        
        <!-- 标签 -->
        <span v-if="showLabel" class="mode-label">
          {{ compact ? currentModeConfig.shortLabel : currentModeConfig.label }}
        </span>
        
        <!-- 待处理指示 -->
        <NBadge
          v-if="hasPendingPermissions"
          :value="agentStore.pendingPermissionList.length"
          :max="9"
          class="pending-badge"
        />
      </NButton>
    </template>
    
    <!-- 模式选择面板 -->
    <div class="mode-panel">
      <div class="panel-header">
        <span class="panel-title">权限模式</span>
      </div>
      
      <div class="mode-list">
        <div
          v-for="item in modeList"
          :key="item.mode"
          class="mode-item"
          :class="{ active: currentMode === item.mode }"
          @click="handleModeChange(item.mode)"
        >
          <div class="mode-info">
            <div class="mode-header">
              <span class="mode-icon-lg">{{ item.icon }}</span>
              <span class="mode-name">{{ item.label }}</span>
              <NTooltip v-if="item.requiresInteraction" trigger="hover">
                <template #trigger>
                  <span class="interaction-indicator">👤</span>
                </template>
                需要用户交互
              </NTooltip>
            </div>
            <span class="mode-desc">{{ item.description }}</span>
          </div>
          
          <!-- 选中指示 -->
          <div 
            v-if="currentMode === item.mode" 
            class="selected-indicator"
            :style="{ backgroundColor: item.color }"
          >
            ✓
          </div>
        </div>
      </div>
      
      <!-- 帮助信息 -->
      <div class="panel-footer">
        <span class="help-text">
          💡 权限模式控制 Agent 可以自动执行的操作类型
        </span>
      </div>
    </div>
  </NPopover>
</template>

<style scoped>
.permission-mode-selector {
  --mode-panel-bg: var(--card-color, #1a1a1a);
  --mode-panel-border: var(--border-color, #3b3b3b);
  --mode-text: var(--text-color, #fff);
  --mode-text-2: var(--text-color-2, #ccc);
  --mode-text-3: var(--text-color-3, #999);
}

.selector-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.selector-trigger:hover {
  background: var(--fill-color, #2a2a2a);
}

.selector-trigger.compact {
  padding: 4px;
}

.selector-trigger.has-pending {
  border: 1px solid #f0a020;
}

.mode-icon {
  font-size: 14px;
}

.mode-label {
  font-size: 12px;
  color: var(--mode-text-2);
}

.pending-badge {
  margin-left: 4px;
}

/* 模式面板 */
.mode-panel {
  width: 280px;
  background: var(--mode-panel-bg);
  border: 1px solid var(--mode-panel-border);
  border-radius: 8px;
  overflow: hidden;
}

.panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--mode-panel-border);
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--mode-text);
}

/* 模式列表 */
.mode-list {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mode-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-item:hover {
  background: var(--fill-color, #2a2a2a);
}

.mode-item.active {
  background: var(--fill-color, #2a2a2a);
}

.mode-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mode-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mode-icon-lg {
  font-size: 16px;
}

.mode-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--mode-text);
}

.interaction-indicator {
  font-size: 12px;
  opacity: 0.7;
}

.mode-desc {
  font-size: 11px;
  color: var(--mode-text-3);
  padding-left: 24px;
}

.selected-indicator {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: white;
  font-weight: bold;
}

/* 面板底部 */
.panel-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--mode-panel-border);
  background: var(--fill-color-light, #1e1e1e);
}

.help-text {
  font-size: 11px;
  color: var(--mode-text-3);
}
</style>
