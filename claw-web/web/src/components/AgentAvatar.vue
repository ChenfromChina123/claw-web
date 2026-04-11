<script setup lang="ts">
/**
 * AgentAvatar - Agent 头像组件
 * 使用 Rive 动画显示动态头像
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { Rive, Layout, Fit, Alignment } from '@rive-app/canvas'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const riveInstance = ref<any>(null)
const isHovered = ref(false)

function initRive(): void {
  if (!canvasRef.value) {
    console.warn('[AgentAvatar] canvas 未准备好')
    return
  }

  console.log('[AgentAvatar] 开始加载 Rive 动画...')

  const rive = new Rive({
    src: '/blobby.riv',
    canvas: canvasRef.value,
    autoplay: true,
    useDevicePixelRatio: true,
    layout: new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
    stateMachines: 'State Machine 1',
    onLoad: () => {
      console.log('[AgentAvatar] Rive 加载成功')
      rive.resizeDrawingSurfaceToCanvas()
      riveInstance.value = rive
      rive.play()

      try {
        const inputs = rive.stateMachineInputs('State Machine 1')
        if (inputs) {
          inputs.forEach((input: any) => {
            if (input.type === 1) {
              input.value = true
            }
          })
        }
      } catch (e) {
        console.log('[AgentAvatar] 状态机输入配置:', e)
      }
    },
    onError: (e: any) => {
      console.error('[AgentAvatar] Rive 加载失败:', e)
    },
  })

  riveInstance.value = rive
}

function toggleHover(): void {
  isHovered.value = !isHovered.value
}

onMounted(() => {
  initRive()
})

onUnmounted(() => {
  if (riveInstance.value) {
    riveInstance.value.cleanup()
    riveInstance.value = null
  }
})
</script>

<template>
  <div
    class="agent-avatar"
    @mouseenter="toggleHover"
    @mouseleave="toggleHover"
  >
    <div class="avatar-ring">
      <canvas ref="canvasRef" class="avatar-canvas"></canvas>
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
  overflow: hidden;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(0, 200, 83, 0.3);
  }
  50% {
    box-shadow: 0 2px 12px rgba(0, 200, 83, 0.5);
  }
}

.avatar-canvas {
  width: 150% !important;
  height: 150% !important;
  display: block !important;
  background: transparent !important;
  /* 裁剪中间部分，向上偏移显示完整史莱姆 */
  transform: scale(1.5) translateY(-5%);
  margin: -25%;
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
