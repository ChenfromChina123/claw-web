<script setup lang="ts">
import { ref } from 'vue'
import { NButton, NIcon, useMessage } from 'naive-ui'
import { StopCircleOutline } from '@vicons/ionicons5'
import { interruptAgent } from '@/api/agentApi'

const props = defineProps<{
  name: string
  input: string
  status: 'pending' | 'executing' | 'completed' | 'error'
  progress?: string
  agentId?: string
}>()

const emit = defineEmits<{
  interrupt: [agentId: string]
}>()

const message = useMessage()
const isInterrupting = ref(false)

/**
 * 处理中断按钮点击事件
 * 调用后端 API 中断 Agent 执行（参考 claw-web/src 的 useCancelRequest.ts）
 */
async function handleInterrupt() {
  if (!props.agentId) {
    message.warning('无法中断：缺少 Agent ID')
    return
  }

  if (isInterrupting.value) return

  isInterrupting.value = true

  try {
    console.log(`[ToolUse] 正在中断 Agent: ${props.agentId}`)

    // 调用后端中断 API
    const result = await interruptAgent(props.agentId)

    if (result.success) {
      message.success('✅ Agent 执行已中断')
      console.log(`[ToolUse] Agent ${props.agentId} 中断成功`)

      // 触发父组件事件
      emit('interrupt', props.agentId)
    } else {
      message.error(`❌ 中断失败: ${result.message || '未知错误'}`)
    }
  } catch (error: any) {
    console.error('[ToolUse] 中断 Agent 失败:', error)
    message.error(`❌ 中断失败: ${error?.message || '网络错误'}`)
  } finally {
    isInterrupting.value = false
  }
}
</script>

<template>
  <div class="tool-use" :class="status">
    <div class="tool-header">
      <span class="tool-icon">⏺</span>
      <span class="tool-name">{{ name }}</span>

      <!-- 状态显示 -->
      <span v-if="status === 'executing'" class="tool-status executing">
        <span class="spinner"></span>
        执行中...
      </span>
      <span v-else-if="status === 'completed'" class="tool-status completed">✓ 完成</span>
      <span v-else-if="status === 'error'" class="tool-status error">✗ 错误/已中断</span>
      <span v-else class="tool-status">等待中</span>

      <!-- 中断按钮：仅在执行中状态显示（参考 claw-web 的取消机制） -->
      <NButton
        v-if="status === 'executing' && agentId"
        type="error"
        size="small"
        :loading="isInterrupting"
        class="interrupt-button"
        @click="handleInterrupt"
      >
        <template #icon>
          <NIcon><StopCircleOutline /></NIcon>
        </template>
        {{ isInterrupting ? '中断中...' : '中断' }}
      </NButton>
    </div>

    <div class="tool-content">
      <pre class="tool-input">{{ input }}</pre>
      <div v-if="progress" class="tool-progress">
        <span class="progress-label">输出:</span>
        <pre class="progress-output">{{ progress }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-use {
  background: #1e1e3f;
  border: 1px solid #3a3a6a;
  border-radius: 8px;
  margin: 12px 0;
  overflow: hidden;
  transition: all 0.3s ease;
}

.tool-use.executing {
  border-color: #f59e0b;
  box-shadow: 0 0 12px rgba(245, 158, 11, 0.2);
}

.tool-use.completed {
  border-color: #22c55e;
}

.tool-use.error {
  border-color: #ef4444;
  background: rgba(239, 68, 68, 0.05);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #252550;
  border-bottom: 1px solid #3a3a6a;
  flex-wrap: wrap;
}

.tool-icon {
  font-size: 14px;
}

.tool-name {
  font-weight: bold;
  color: #a78bfa;
  flex: 1;
}

.tool-status {
  margin-left: auto;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #3a3a6a;
  color: #888;
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool-status.executing {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  font-weight: 600;
}

/* 加载动画 */
.spinner {
  width: 10px;
  height: 10px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.tool-status.completed {
  background: #22c55e;
  color: white;
}

.tool-status.error {
  background: #ef4444;
  color: white;
}

/* 中断按钮样式 */
.interrupt-button {
  margin-left: 8px;
  font-size: 12px !important;
  padding: 0 12px !important;
  height: 28px !important;
  border-radius: 6px !important;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
  transition: all 0.2s ease !important;
}

.interrupt-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4) !important;
}

.interrupt-button:active:not(:disabled) {
  transform: translateY(0);
}

.tool-content {
  padding: 12px 16px;
}

.tool-input {
  background: #16162a;
  padding: 12px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  margin: 0;
  color: #e0e0e0;
  max-height: 200px;
  overflow-y: auto;
}

.tool-progress {
  margin-top: 12px;
}

.progress-label {
  font-size: 12px;
  color: #888;
  display: block;
  margin-bottom: 4px;
}

.progress-output {
  background: #0d0d1a;
  padding: 8px;
  border-radius: 4px;
  font-size: 11px;
  overflow-x: auto;
  margin: 0;
  color: #4ade80;
  max-height: 150px;
  overflow-y: auto;
}
</style>
