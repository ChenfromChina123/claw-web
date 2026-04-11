<script setup lang="ts">
/**
 * AgentAvatar - Agent 头像组件
 * 显示在聊天界面中的 Agent 头像
 */

import { ref } from 'vue'

const isHovered = ref(false)

function toggleHover(): void {
  isHovered.value = !isHovered.value
}
</script>

<template>
  <div
    class="agent-avatar"
    @mouseenter="toggleHover"
    @mouseleave="toggleHover"
  >
    <div class="avatar-ring">
      <div class="avatar-icon">
        🤖
      </div>
    </div>
    <Transition name="status-fade">
      <div v-if="isHovered" class="status-indicator"></div>
    </Transition>
  </div>
</template>

<style scoped>
.agent-avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.agent-avatar:hover {
  transform: scale(1.05);
}

.avatar-ring {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(135deg, #00c853 0%, #00e676 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 200, 83, 0.3);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(0, 200, 83, 0.3);
  }
  50% {
    box-shadow: 0 2px 12px rgba(0, 200, 83, 0.5);
  }
}

.avatar-icon {
  font-size: 24px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2));
}

.status-indicator {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #4caf50;
  border: 2px solid #1e1e1e;
  animation: blink 1.5s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.status-fade-enter-active,
.status-fade-leave-active {
  transition: opacity 0.2s ease;
}

.status-fade-enter-from,
.status-fade-leave-to {
  opacity: 0;
}
</style>
