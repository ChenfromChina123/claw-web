<script setup lang="ts">
import { ref, computed } from 'vue'
import ChatMessageList from '@/components/ChatMessageList.vue'
import ChatInput from '@/components/ChatInput.vue'
import GlassPanel from '@/components/common/GlassPanel.vue'
import { useChatStore } from '@/stores/chat'
import { useAgentStore } from '@/stores/agent'

const chatStore = useChatStore()
const agentStore = useAgentStore()

const inputRef = ref<InstanceType<typeof ChatInput> | null>(null)

/**
 * 获取当前活跃的 Agent ID（用于中断功能）
 */
const currentAgentId = computed(() => {
  const runningAgents = agentStore.currentAgents.filter(
    a => a.status === 'RUNNING' || a.status === 'THINKING'
  )
  if (runningAgents.length > 0) {
    return runningAgents[0].agentId
  }

  const executingTool = chatStore.toolCalls.find(tc => tc.status === 'executing')
  if (executingTool) {
    return executingTool.id
  }

  return undefined
})

/**
 * 发送消息处理函数
 * @param content 消息内容
 */
function handleSendMessage(content: string) {
  if (!content.trim()) return

  if (content.startsWith('/')) {
    return
  }

  chatStore.sendMessage(content)
}

/**
 * 处理 ToolUse 组件的中断事件
 */
function handleToolInterrupt(agentId: string) {
  console.log('[AgentChat] 中断 Agent:', agentId)
}

/**
 * 聚焦输入框
 */
function focusInput() {
  inputRef.value?.focus()
}
</script>

<template>
  <div class="module-container">
    <div class="module-header">AI AGENT</div>

    <!-- 聊天区域 -->
    <div class="chat-area">
      <!-- 消息列表 -->
      <ChatMessageList
        :messages="chatStore.messages"
        :tool-calls="chatStore.toolCalls"
        :is-loading="chatStore.isLoading"
        :current-agent-id="currentAgentId"
        class="message-list-container"
        @interrupt="handleToolInterrupt"
      />

      <!-- 输入区 -->
      <div class="input-wrapper">
        <GlassPanel variant="normal" bordered class="input-container">
          <ChatInput
            ref="inputRef"
            :disabled="!chatStore.currentSessionId"
            :sidebar-collapsed="true"
            :session-id="chatStore.currentSessionId || undefined"
            @send="handleSendMessage"
          />
        </GlassPanel>
      </div>
    </div>
  </div>
</template>

<style scoped>
.module-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--ide-bg);
  overflow: hidden;
}

.module-header {
  height: 35px;
  background: var(--ide-header);
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 11px;
  font-weight: bold;
  color: #969696;
  text-transform: uppercase;
  letter-spacing: 1px;
  flex-shrink: 0;
  user-select: none;
  border-bottom: 1px solid var(--ide-border);
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-width: 0;
}

.message-list-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 0;
}

.input-wrapper {
  flex-shrink: 0;
  padding: 8px;
  border-top: 1px solid var(--ide-border);
  background: var(--ide-sidebar);
}

.input-container {
  border-radius: 8px !important;
  padding: 2px !important;
}
</style>
