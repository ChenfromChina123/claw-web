<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { NLayout, NLayoutContent, NInput, useMessage } from 'naive-ui'
import ChatSidebar from '@/components/ChatSidebar.vue'
import ChatMessageList from '@/components/ChatMessageList.vue'
import ChatInput from '@/components/ChatInput.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'

const message = useMessage()
const chatStore = useChatStore()
const authStore = useAuthStore()

const showCommandPalette = ref(false)
const inputRef = ref<InstanceType<typeof NInput> | null>(null)

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

function handleKeyDown(e: KeyboardEvent) {
  // Ctrl/Cmd + K 打开命令面板
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    showCommandPalette.value = !showCommandPalette.value
  }
}

function handleSendMessage(content: string) {
  if (!content.trim()) return
  
  // 检查是否为命令
  if (content.startsWith('/')) {
    // 处理命令
    message.info('命令功能开发中...')
    return
  }
  
  chatStore.sendMessage(content)
}

function handleCommandSelect(command: string) {
  showCommandPalette.value = false
  
  switch (command) {
    case 'new':
      chatStore.createSession()
      break
    case 'clear':
      chatStore.clearSession()
      break
    case 'export':
      // 导出功能
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
      <!-- 消息列表 -->
      <ChatMessageList 
        :messages="chatStore.messages" 
        :tool-calls="chatStore.toolCalls"
        :is-loading="chatStore.isLoading"
      />
      
      <!-- 输入区 -->
      <div class="chat-input-container">
        <ChatInput 
          ref="inputRef"
          :disabled="!chatStore.currentSessionId"
          @send="handleSendMessage"
          @focus="showCommandPalette = false"
        />
      </div>
    </NLayoutContent>
    
    <!-- 命令面板 -->
    <CommandPalette
      :show="showCommandPalette"
      @close="showCommandPalette = false"
      @select="handleCommandSelect"
    />
  </NLayout>
</template>

<style scoped>
.chat-layout {
  height: 100vh;
  background: var(--bg-primary);
}

.chat-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.chat-input-container {
  padding: 16px 20px;
  background: var(--bg-primary);
  border-top: 1px solid var(--border-color);
}
</style>
