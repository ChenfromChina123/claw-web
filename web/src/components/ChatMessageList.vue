<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { NScrollbar, NSpin } from 'naive-ui'
import type { Message, ToolCall } from '@/types'

const props = defineProps<{
  messages: Message[]
  toolCalls: ToolCall[]
  isLoading: boolean
}>()

const scrollbarRef = ref<InstanceType<typeof NScrollbar> | null>(null)

// 监听消息变化，自动滚动到底部
watch(() => props.messages.length, async () => {
  await nextTick()
  scrollToBottom()
})

watch(() => props.isLoading, async (loading) => {
  if (loading) {
    await nextTick()
    scrollToBottom()
  }
})

function scrollToBottom() {
  scrollbarRef.value?.scrollTo({ top: 1000000, behavior: 'smooth' })
}

// 格式化工具输出
function formatToolOutput(output: unknown): string {
  if (!output) return ''
  if (typeof output === 'string') return output
  return JSON.stringify(output, null, 2)
}

// 获取当前正在进行的工具调用
const activeToolCalls = computed(() => {
  return props.toolCalls.filter(tc => tc.status === 'pending')
})
</script>

<template>
  <div class="message-list">
    <NScrollbar ref="scrollbarRef" class="scrollbar">
      <div class="messages-container">
        <!-- 欢迎消息 -->
        <div v-if="messages.length === 0 && !isLoading" class="welcome">
          <div class="welcome-icon">🤖</div>
          <h2>欢迎使用 Claude Code</h2>
          <p>我是您的 AI 助手，可以帮助您完成各种任务。</p>
          <div class="welcome-features">
            <div class="feature">
              <span class="feature-icon">💻</span>
              <span>编写和调试代码</span>
            </div>
            <div class="feature">
              <span class="feature-icon">📁</span>
              <span>文件管理和搜索</span>
            </div>
            <div class="feature">
              <span class="feature-icon">🔧</span>
              <span>执行 Shell 命令</span>
            </div>
            <div class="feature">
              <span class="feature-icon">🌐</span>
              <span>网络搜索和信息查询</span>
            </div>
          </div>
          <p class="welcome-hint">输入您的问题开始对话</p>
        </div>
        
        <!-- 消息列表 -->
        <div v-for="(message, index) in messages" :key="index" class="message-wrapper">
          <!-- 用户消息 -->
          <div v-if="message.role === 'user'" class="message user-message">
            <div class="message-avatar">👤</div>
            <div class="message-content">
              <div class="message-text">{{ message.content }}</div>
            </div>
          </div>
          
          <!-- 助手消息 -->
          <div v-else-if="message.role === 'assistant'" class="message assistant-message">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
              <div class="message-text" v-html="message.content.replace(/\n/g, '<br>')"></div>
            </div>
          </div>
          
          <!-- 工具调用 -->
          <div v-if="message.toolCalls && message.toolCalls.length > 0" class="tool-calls">
            <div 
              v-for="toolCall in message.toolCalls" 
              :key="toolCall.id"
              class="tool-call"
              :class="toolCall.status"
            >
              <div class="tool-header">
                <span class="tool-name">{{ toolCall.name }}</span>
                <span class="tool-status">{{ toolCall.status === 'pending' ? '执行中...' : toolCall.status }}</span>
              </div>
              <div class="tool-input">
                <pre>{{ JSON.stringify(toolCall.input, null, 2) }}</pre>
              </div>
              <div v-if="toolCall.output" class="tool-output">
                <pre>{{ formatToolOutput(toolCall.output) }}</pre>
              </div>
            </div>
          </div>
        </div>
        
        <!-- 加载状态 -->
        <div v-if="isLoading" class="message-wrapper">
          <div class="message assistant-message">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
              <NSpin size="small" />
            </div>
          </div>
        </div>
        
        <!-- 活动工具调用 -->
        <div v-if="activeToolCalls.length > 0" class="active-tools">
          <div v-for="tool in activeToolCalls" :key="tool.id" class="tool-call active">
            <span class="tool-name">{{ tool.name }}</span>
            <NSpin size="small" />
          </div>
        </div>
      </div>
    </NScrollbar>
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  overflow: hidden;
}

.scrollbar {
  height: 100%;
}

.messages-container {
  padding: 20px;
  max-width: 900px;
  margin: 0 auto;
}

.welcome {
  text-align: center;
  padding: 60px 20px;
}

.welcome-icon {
  font-size: 64px;
  margin-bottom: 20px;
}

.welcome h2 {
  font-size: 28px;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.welcome p {
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.welcome-features {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  max-width: 500px;
  margin: 0 auto 24px;
}

.feature {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.feature-icon {
  font-size: 24px;
}

.welcome-hint {
  color: var(--primary-color);
  font-size: 14px;
}

.message-wrapper {
  margin-bottom: 24px;
}

.message {
  display: flex;
  gap: 12px;
  animation: fadeIn 0.3s ease-out;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.user-message .message-avatar {
  background: var(--primary-color);
}

.assistant-message .message-avatar {
  background: var(--bg-tertiary);
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-text {
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.user-message .message-text {
  background: var(--primary-color);
  color: white;
}

.assistant-message .message-text {
  background: var(--bg-secondary);
}

.tool-calls {
  margin-left: 48px;
  margin-top: 12px;
}

.tool-call {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  border-left: 3px solid var(--border-color);
}

.tool-call.pending {
  border-left-color: var(--warning-color);
}

.tool-call.completed {
  border-left-color: var(--success-color);
}

.tool-call.error {
  border-left-color: var(--error-color);
}

.tool-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.tool-name {
  font-weight: 600;
  color: var(--primary-color);
}

.tool-status {
  font-size: 12px;
  color: var(--text-secondary);
}

.tool-input,
.tool-output {
  background: var(--bg-tertiary);
  border-radius: 4px;
  padding: 8px;
  margin-top: 8px;
  overflow-x: auto;
}

.tool-output {
  border-top: 1px solid var(--border-color);
}

.tool-input pre,
.tool-output pre {
  margin: 0;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', monospace;
  white-space: pre-wrap;
  word-break: break-all;
}

.active-tools {
  display: flex;
  gap: 8px;
  margin-left: 48px;
  margin-top: 12px;
}

.tool-call.active {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: 20px;
  font-size: 13px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
