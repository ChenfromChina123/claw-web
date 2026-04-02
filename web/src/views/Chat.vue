<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { NLayout, NLayoutContent, useMessage } from 'naive-ui'
import ChatSidebar from '@/components/ChatSidebar.vue'
import ChatMessageList from '@/components/ChatMessageList.vue'
import ChatInput from '@/components/ChatInput.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import GlassPanel from '@/components/common/GlassPanel.vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'

const message = useMessage()
const chatStore = useChatStore()
const authStore = useAuthStore()

const showCommandPalette = ref(false)
const inputRef = ref<InstanceType<typeof ChatInput> | null>(null)

onMounted(async () => {
  // 连接 WebSocket
  chatStore.connect(authStore.token || undefined)
  chatStore.listSessions()
  
  // 创建默认会话
  if (chatStore.sessions.length === 0) {
    chatStore.createSession()
  } else if (chatStore.currentSessionId) {
    chatStore.loadSession(chatStore.currentSessionId)
  }
  
  // 聚焦输入框
  nextTick(() => {
    inputRef.value?.focus()
  })
  
  // 监听键盘事件
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  chatStore.disconnect()
  document.removeEventListener('keydown', handleKeyDown)
})

/**
 * 处理键盘快捷键事件
 * @param e 键盘事件对象
 */
function handleKeyDown(e: KeyboardEvent): void {
  // Ctrl/Cmd + K 打开命令面板
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    showCommandPalette.value = !showCommandPalette.value
  }
}

/**
 * 发送消息处理函数
 * @param content 消息内容
 */
function handleSendMessage(content: string): void {
  if (!content.trim()) return
  
  // 检查是否为命令
  if (content.startsWith('/')) {
    message.info('命令功能开发中...')
    return
  }
  
  chatStore.sendMessage(content)
}

/**
 * 命令选择处理函数
 * @param command 选中的命令
 */
function handleCommandSelect(command: string): void {
  showCommandPalette.value = false
  
  switch (command) {
    case 'new':
      chatStore.createSession()
      break
    case 'clear':
      chatStore.clearSession()
      break
    case 'export':
      message.info('导出功能开发中...')
      break
    default:
      break
  }
}
</script>

<template>
  <NLayout has-sider class="chat-layout">
    <!-- 侧边栏 -->
    <ChatSidebar />
    
    <!-- 主内容区 -->
    <NLayoutContent class="chat-content">
      <!-- 背景装饰 -->
      <div class="chat-bg-decoration">
        <div class="bg-grid-pattern"></div>
        <div class="bg-glow bg-glow-1"></div>
        <div class="bg-glow bg-glow-2"></div>
      </div>

      <!-- 主内容容器 -->
      <div class="chat-main">
        <!-- 消息列表 -->
        <ChatMessageList 
          :messages="chatStore.messages" 
          :tool-calls="chatStore.toolCalls"
          :is-loading="chatStore.isLoading"
          class="message-list-container"
        />
        
        <!-- 输入区 -->
        <GlassPanel variant="normal" bordered class="input-container">
          <ChatInput 
            ref="inputRef"
            :disabled="!chatStore.currentSessionId"
            @send="handleSendMessage"
            @focus="showCommandPalette = false"
          />
        </GlassPanel>
      </div>
    </NLayoutContent>
    
    <!-- 命令面板（全局覆盖层） -->
    <Teleport to="body">
      <CommandPalette
        :show="showCommandPalette"
        @close="showCommandPalette = false"
        @select="handleCommandSelect"
      />
    </Teleport>
  </NLayout>
</template>

<style scoped>
.chat-layout {
  height: 100vh;
  background: var(--bg-primary);
  position: relative;
}

.chat-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
}

/* ---- 背景装饰 ---- */
.chat-bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.5;
}

.bg-grid-pattern {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
  background-size: 50px 50px;
}

.bg-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  animation: glowFloat 30s ease-in-out infinite;
}

.bg-glow-1 {
  width: 500px;
  height: 500px;
  background: var(--color-primary-light);
  top: -200px;
  right: -150px;
  opacity: 0.3;
}

.bg-glow-2 {
  width: 400px;
  height: 400px;
  background: var(--color-info-light);
  bottom: -200px;
  left: -100px;
  opacity: 0.25;
  animation-delay: -15s;
}

@keyframes glowFloat {
  0%, 100% { transform: translate(0, 0); }
  33% { transform: translate(30px, -20px); }
  66% { transform: translate(-20px, 30px); }
}

/* ---- 主内容容器 ---- */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
  min-height: 0;
}

.message-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  margin-bottom: 80px;
}

/* ---- 输入区域 ---- */
.input-container {
  margin: 16px 20px 20px;
  border-radius: 16px !important;
  padding: 4px !important;
  transition: all var(--transition-normal, 250ms) ease;
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
}

.input-container:hover {
  border-color: var(--border-accent) !important;
  box-shadow: var(--shadow-md);
}

/* ---- 响应式适配 ---- */
@media (max-width: 768px) {
  .input-container {
    margin: 12px 12px 12px;
  }

  .bg-glow {
    display: none;
  }
}
</style>
