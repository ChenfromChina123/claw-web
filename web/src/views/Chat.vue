<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { NLayout, NLayoutContent, NSpin, NButton, NEmpty, useMessage } from 'naive-ui'
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
const isInitializing = ref(true)
const initError = ref<string | null>(null)

onMounted(async () => {
  isInitializing.value = true
  initError.value = null
  
  try {
    // 连接 WebSocket
    await chatStore.connect(authStore.token || undefined)
    
    // 获取会话列表
    await chatStore.listSessions()
    
    // 加载或创建会话
    if (chatStore.sessions.length > 0) {
      // 有会话，加载第一个
      await chatStore.loadSession(chatStore.sessions[0].id)
    } else {
      // 没有会话，强制创建第一个会话
      await chatStore.createSession(undefined, undefined, true)
    }
    
    // 聚焦输入框
    nextTick(() => {
      inputRef.value?.focus()
    })
  } catch (error: any) {
    console.error('初始化失败:', error)
    initError.value = error?.message || '初始化失败，请重试'
    message.error(initError.value)
  } finally {
    isInitializing.value = false
  }
  
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
 * 重新初始化
 */
async function handleRetry(): Promise<void> {
  isInitializing.value = true
  initError.value = null
  
  try {
    await chatStore.connect(authStore.token || undefined)
    await chatStore.listSessions()
    
    if (chatStore.sessions.length === 0) {
      await chatStore.createSession()
    } else if (chatStore.currentSessionId) {
      await chatStore.loadSession(chatStore.currentSessionId)
    } else if (chatStore.sessions.length > 0) {
      await chatStore.loadSession(chatStore.sessions[0].id)
    }
    
    nextTick(() => {
      inputRef.value?.focus()
    })
    
    message.success('重新连接成功')
  } catch (error: any) {
    console.error('重新初始化失败:', error)
    initError.value = error?.message || '初始化失败，请重试'
    message.error(initError.value)
  } finally {
    isInitializing.value = false
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

      <!-- 初始化加载状态 -->
      <div v-if="isInitializing" class="initialization-container">
        <NSpin size="large" />
        <p class="initialization-text">正在初始化...</p>
      </div>

      <!-- 初始化错误状态 -->
      <div v-else-if="initError" class="initialization-container">
        <NEmpty description="初始化失败">
          <template #extra>
            <p class="error-text">{{ initError }}</p>
            <NButton type="primary" @click="handleRetry">重试</NButton>
          </template>
        </NEmpty>
      </div>

      <!-- 主内容容器 -->
      <div v-else class="chat-main">
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

/* ---- 初始化状态 ---- */
.initialization-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
  gap: 16px;
}

.initialization-text {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.error-text {
  font-size: 14px;
  color: var(--color-error);
  margin: 8px 0 16px;
  text-align: center;
}

/* ---- 主内容容器 ---- */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
  min-height: 0;
  padding-bottom: 100px;
}

.message-list-container {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

/* ---- 输入区域 ---- */
.input-container {
  margin: 0 20px 20px;
  border-radius: 16px !important;
  padding: 4px !important;
  transition: all var(--transition-normal, 250ms) ease;
  position: fixed;
  bottom: 0;
  left: 280px;
  right: 0;
  z-index: 100;
  max-width: calc(100% - 320px);
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
