<script setup lang="ts">
import { ref } from 'vue'
import { NIcon, NButton } from 'naive-ui'
import { EyeOffOutline, EyeOutline } from '@vicons/ionicons5'
import type { ThinkingMessage } from '@/types'

interface Props {
  message: ThinkingMessage
}

defineProps<Props>()

const isCollapsed = ref(true)

function toggleCollapse(): void {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="thinking-message">
    <div class="thinking-header" @click="toggleCollapse">
      <div class="thinking-indicator">
        <div class="dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <span class="label">思考过程</span>
      </div>

      <NButton text size="tiny">
        <NIcon :component="isCollapsed ? EyeOutline : EyeOffOutline" />
      </NButton>
    </div>

    <transition name="expand">
      <div v-if="!isCollapsed" class="thinking-content">
        <div class="thinking-text">{{ message.content }}</div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.thinking-message {
  padding: 10px 16px;
  margin: 6px 20px;
  background: linear-gradient(135deg, #fdf4ff 0%, #faf5ff 100%);
  border-radius: 10px;
  border: 1px solid #e9d5ff;
}

.thinking-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
}

.thinking-header:hover .label {
  color: #9333ea;
}

.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dots {
  display: flex;
  gap: 3px;
  align-items: center;
}

.dots span {
  width: 6px;
  height: 6px;
  background: #9333ea;
  border-radius: 50%;
  animation: bounce 1.4s infinite ease-in-out both;
}

.dots span:nth-child(1) {
  animation-delay: -0.32s;
}

.dots span:nth-child(2) {
  animation-delay: -0.16s;
}

.dots span:nth-child(3) {
  animation-delay: 0s;
}

.label {
  font-size: 13px;
  font-weight: 500;
  color: #7c3aed;
  transition: color 0.2s;
}

.thinking-content {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #e9d5ff;
}

.thinking-text {
  font-size: 13px;
  line-height: 1.7;
  color: #581c87;
  white-space: pre-wrap;
  word-break: break-word;
  font-style: italic;
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 500px;
}

@keyframes bounce {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}
</style>
