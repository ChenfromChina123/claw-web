<script setup lang="ts">
/**
 * FloatingPet - 悬浮电子宠物组件
 * 提供可拖拽的电子宠物，支持气泡对话和多种宠物切换
 */

import { ref, onMounted, onUnmounted, nextTick } from 'vue'

interface PetData {
  char: string
  name: string
  moods: {
    idle: string
    happy: string
    sad: string
  }
}

const PETS: Record<string, PetData> = {
  draco: { char: '🐲', name: '像素火龙 (Draco)', moods: { idle: '守护着这行代码...', happy: '代码优化完成，吐一口火庆祝！🔥', sad: '发生语法错误！😠' } },
  kraken: { char: '🐙', name: '代码章鱼 (Kraken)', moods: { idle: '整理复杂的依赖关系...', happy: '发现了未定义的行为！🤯', sad: '代码太乱了...墨水喷溅！🕶️' } },
  spirit: { char: '💫', name: '数据精灵 (Spirit)', moods: { idle: '在内存中寻找灵感...', happy: '逻辑完美！闪耀着光芒✨💖', sad: '被垃圾回收器追赶了...🏃' } },
  spider: { char: '🕷️', name: '除虫蜘蛛 (Spider)', moods: { idle: '在代码网格中编织...', happy: '捕获了一个 Bug！🕸️🧐', sad: 'Bug 隐藏得太深了...' } }
}

const currentPetKey = ref('draco')
const speechText = ref('')
const petEmoji = ref('🐲')
const isDragging = ref(false)
const isExpanded = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const petPosition = ref({ x: 150, y: 150 })

const petRef = ref<HTMLElement | null>(null)

function getCurrentPet(): PetData {
  return PETS[currentPetKey.value] || PETS.draco
}

function updateUI(emoji: string, text: string): void {
  petEmoji.value = emoji
  speechText.value = text
}

function handleInput(e: Event): void {
  const input = (e.target as HTMLInputElement).value.toLowerCase()
  const petData = getCurrentPet()

  if (input.includes('error') || input.includes('crash')) {
    updateUI('😱', petData.moods.sad)
  } else if (input.includes('love') || input.includes('cool') || input.includes('optimize')) {
    updateUI('🥰', petData.moods.happy)
  } else if (input.includes('clean') || input.includes('format')) {
    updateUI('✨', '代码格式化完成，焕然一新！')
  } else if (input.includes('bug')) {
    if (currentPetKey.value === 'spider') {
      updateUI('🕷️', '找到了！Bug 已经被我缠住了！🕸️')
    } else {
      updateUI('😨', '我不喜欢 Bug... 快清理掉！')
    }
  } else if (input.includes('code') || input.includes('script')) {
    if (currentPetKey.value === 'draco') {
      updateUI('🛡️', '我正在守护这行核心代码！')
    } else {
      updateUI('📝', '代码编写中...我正在给你灵感！')
    }
  } else {
    updateUI(petData.char, `"${(e.target as HTMLInputElement).value}"？我不明白，但我大受震撼。`)
  }

  ;(e.target as HTMLInputElement).value = ''
}

function switchPet(key: string): void {
  currentPetKey.value = key
  const petData = PETS[key]
  if (petData) {
    updateUI(petData.char, petData.moods.idle)
  }
}

function startDrag(e: MouseEvent): void {
  if ((e.target as HTMLElement).tagName === 'INPUT') return
  isDragging.value = true
  dragOffset.value = {
    x: e.clientX - petPosition.value.x,
    y: e.clientY - petPosition.value.y
  }
}

function onDrag(e: MouseEvent): void {
  if (!isDragging.value) return
  petPosition.value = {
    x: e.clientX - dragOffset.value.x,
    y: e.clientY - dragOffset.value.y
  }
}

function stopDrag(): void {
  isDragging.value = false
}

function toggleExpanded(): void {
  isExpanded.value = !isExpanded.value
}

onMounted(() => {
  updateUI(PETS.draco.char, PETS.draco.moods.idle)
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
})
</script>

<template>
  <div
    id="floating-pet-container"
    ref="petRef"
    class="floating-pet-container"
    :style="{ left: petPosition.x + 'px', top: petPosition.y + 'px' }"
    @mousedown="startDrag"
  >
    <!-- 气泡对话框 -->
    <Transition name="bubble-fade">
      <div v-if="speechText" class="speech-bubble">
        {{ speechText }}
        <div class="bubble-tail"></div>
      </div>
    </Transition>

    <!-- 宠物头像 -->
    <div class="pet-avatar" :class="{ 'pet-bounce': speechText }">
      {{ petEmoji }}
    </div>

    <!-- 宠物切换器 -->
    <Transition name="control-fade">
      <div v-if="isExpanded" class="control-panel">
        <div class="pet-selector">
          <span
            v-for="(pet, key) in PETS"
            :key="key"
            class="pet-opt"
            :class="{ active: currentPetKey === key }"
            @click.stop="switchPet(key)"
          >
            {{ pet.char }}
          </span>
        </div>
        <input
          type="text"
          class="pet-input"
          placeholder="输入代码关键词..."
          @keypress.enter="handleInput"
        >
      </div>
    </Transition>

    <!-- 展开/收起按钮 -->
    <button class="toggle-btn" @click.stop="toggleExpanded">
      {{ isExpanded ? '−' : '+' }}
    </button>
  </div>
</template>

<style scoped>
.floating-pet-container {
  position: fixed;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: grab;
  user-select: none;
  width: fit-content;
  transition: transform 0.2s ease;
}

.floating-pet-container:active {
  cursor: grabbing;
}

.speech-bubble {
  position: relative;
  background: #252526;
  border: 1px solid #454545;
  border-radius: 12px;
  padding: 10px 15px;
  font-size: 14px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
  margin-bottom: 10px;
  max-width: 250px;
  min-height: 20px;
  line-height: 1.4;
  color: #cccccc;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

.bubble-tail {
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  border-width: 8px 8px 0;
  border-style: solid;
  border-color: #454545 transparent transparent transparent;
}

.bubble-tail::before {
  content: '';
  position: absolute;
  top: -9px;
  left: -8px;
  border-width: 9px 9px 0;
  border-style: solid;
  border-color: #252526 transparent transparent transparent;
}

.pet-avatar {
  font-size: 64px;
  display: inline-block;
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  filter: drop-shadow(0 0 10px rgba(0, 0, 0, 0.7));
  animation: float 4s ease-in-out infinite;
}

.pet-bounce {
  animation: bounce 0.3s ease;
}

@keyframes float {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-12px) rotate(3deg); }
}

@keyframes bounce {
  0% { transform: scale(1); }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.control-panel {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 10px;
  background: rgba(30, 30, 30, 0.95);
  border-radius: 20px;
  padding: 10px 15px;
  border: 1px solid #454545;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  gap: 15px;
  backdrop-filter: blur(5px);
}

.pet-selector {
  display: flex;
  gap: 8px;
}

.pet-opt {
  cursor: pointer;
  font-size: 24px;
  opacity: 0.5;
  transition: all 0.3s ease;
  padding: 4px;
  border-radius: 8px;
}

.pet-opt:hover {
  opacity: 0.8;
  background: rgba(255, 255, 255, 0.1);
}

.pet-opt.active {
  opacity: 1;
  transform: scale(1.2);
  filter: drop-shadow(0 0 5px #007acc);
  background: rgba(0, 122, 204, 0.2);
}

.pet-input {
  background: #3c3c3c;
  border: 1px solid #666;
  color: white;
  padding: 8px 12px;
  border-radius: 15px;
  outline: none;
  width: 160px;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

.pet-input:focus {
  border-color: #007acc;
  box-shadow: 0 0 0 1px rgba(0, 122, 204, 0.3);
}

.toggle-btn {
  position: absolute;
  top: 0;
  right: -40px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #454545;
  background: rgba(30, 30, 30, 0.9);
  color: #cccccc;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: 0.7;
}

.toggle-btn:hover {
  opacity: 1;
  background: rgba(0, 122, 204, 0.3);
  border-color: #007acc;
}

/* 过渡动画 */
.bubble-fade-enter-active,
.bubble-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.bubble-fade-enter-from,
.bubble-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.control-fade-enter-active,
.control-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.control-fade-enter-from,
.control-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>
