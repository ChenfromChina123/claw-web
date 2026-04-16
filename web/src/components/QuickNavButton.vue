<script setup lang="ts">
import { ref, computed } from 'vue'
import { NIcon } from 'naive-ui'
import { ListOutline, ChevronUpOutline } from '@vicons/ionicons5'
import { useChatStore } from '@/stores/chat'

const props = defineProps<{
  visible?: boolean
}>()

const emit = defineEmits<{
  navigate: [messageId: string]
}>()

const chatStore = useChatStore()
const quickNavShow = ref(false)
const quickNavHover = ref(false)

// 用户消息导航条目
const userNavEntries = computed(() => {
  const entries: Array<{ id: string; index: number; preview: string }> = []
  const messages = chatStore.messages
  let userIndex = 0

  for (const message of messages) {
    if (message.role === 'user') {
      userIndex++
      let content = ''
      if ('content' in message) {
        content = typeof message.content === 'string'
          ? message.content
          : JSON.stringify(message.content)
      }
      const preview = content.slice(0, 40).replace(/\n/g, ' ') || '（空消息）'
      entries.push({
        id: message.id,
        index: userIndex,
        preview: preview.length > 40 ? preview + '...' : preview,
      })
    }
  }

  return entries.reverse() // 最新的在前面
})

// 处理导航点击
function handleNavClick(messageId: string) {
  emit('navigate', messageId)
  quickNavShow.value = false
}

// 处理鼠标进入
function handleNavMouseEnter() {
  quickNavHover.value = true
  quickNavShow.value = true
}

// 处理鼠标离开
function handleNavMouseLeave() {
  quickNavHover.value = false
  setTimeout(() => {
    if (!quickNavHover.value) {
      quickNavShow.value = false
    }
  }, 150)
}
</script>

<template>
  <div
    v-if="userNavEntries.length > 0 && visible !== false"
    class="quick-nav-button"
    @mouseenter="handleNavMouseEnter"
    @mouseleave="handleNavMouseLeave"
  >
    <button type="button" class="quick-nav-trigger">
      <NIcon :size="14"><ListOutline /></NIcon>
      <span class="quick-nav-count">{{ userNavEntries.length }}</span>
      <NIcon :size="12" class="quick-nav-arrow" :class="{ 'is-open': quickNavShow }">
        <ChevronUpOutline />
      </NIcon>
    </button>
    
    <!-- 快速导航弹出层 -->
    <Transition name="quick-nav-fade">
      <div
        v-show="quickNavShow"
        class="quick-nav-popup"
        @mouseenter="handleNavMouseEnter"
        @mouseleave="handleNavMouseLeave"
      >
        <div class="quick-nav-header">
          <span>📍 快速导航</span>
          <span class="quick-nav-total">共 {{ userNavEntries.length }} 条</span>
        </div>
        <div class="quick-nav-list">
          <div
            v-for="entry in userNavEntries"
            :key="entry.id"
            class="quick-nav-item"
            @click="handleNavClick(entry.id)"
          >
            <span class="quick-nav-index">#{{ entry.index }}</span>
            <span class="quick-nav-preview" :title="entry.preview">{{ entry.preview }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.quick-nav-button {
  position: fixed;
  right: 24px;
  bottom: 180px;
  z-index: 1000;
}

.quick-nav-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background-color: rgba(30, 30, 30, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  color: #888;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
}

.quick-nav-trigger:hover {
  background-color: rgba(40, 40, 40, 0.95);
  border-color: rgba(255, 255, 255, 0.15);
  color: #aaa;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.quick-nav-count {
  font-weight: 600;
  color: #f2c97d;
  min-width: 16px;
  text-align: center;
}

.quick-nav-arrow {
  transition: transform 0.2s ease;
  opacity: 0.6;
}

.quick-nav-arrow.is-open {
  transform: rotate(180deg);
}

.quick-nav-popup {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  width: 300px;
  max-height: 360px;
  background-color: rgba(30, 30, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(12px);
}

.quick-nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 14px;
  color: #aaa;
  font-weight: 500;
}

.quick-nav-total {
  font-size: 12px;
  color: #666;
  font-weight: 400;
}

.quick-nav-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
}

.quick-nav-list::-webkit-scrollbar {
  width: 4px;
}

.quick-nav-list::-webkit-scrollbar-track {
  background: transparent;
}

.quick-nav-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.quick-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.quick-nav-item:hover {
  background-color: rgba(255, 255, 255, 0.06);
}

.quick-nav-index {
  flex-shrink: 0;
  width: 28px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(242, 201, 125, 0.15);
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #f2c97d;
}

.quick-nav-preview {
  flex: 1;
  font-size: 13px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.quick-nav-item:hover .quick-nav-preview {
  color: #ccc;
}

/* 快速导航动画 - 向下展开 */
.quick-nav-fade-enter-active,
.quick-nav-fade-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.quick-nav-fade-enter-from,
.quick-nav-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}

/* 响应式适配 */
@media (max-width: 768px) {
  .quick-nav-button {
    right: 16px;
    bottom: 160px;
  }
  
  .quick-nav-popup {
    width: 260px;
    right: -10px;
  }
}
</style>
