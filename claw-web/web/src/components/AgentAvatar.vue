<script setup lang="ts">
/**
 * AgentAvatar - Agent 头像组件
 * 使用 Rive 动画显示动态头像
 * 支持全页面鼠标移动检测
 */

import { ref, onMounted, onUnmounted, markRaw } from 'vue'
import { Rive, Layout, Fit, Alignment } from '@rive-app/canvas'

const canvasRef = ref<HTMLCanvasElement | null>(null)
// 使用 markRaw 避免 Vue 响应式代理与 Rive 内部对象冲突
const riveInstance = ref<any>(null)
const isHovered = ref(false)

// 鼠标输入状态机引用
const mouseXInput = ref<any>(null)
const mouseYInput = ref<any>(null)

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
      // 使用 markRaw 避免 Vue 响应式代理与 Rive 内部对象冲突
      riveInstance.value = markRaw(rive)
      rive.play()

      try {
        const inputs = rive.stateMachineInputs('State Machine 1')
        if (inputs && Array.isArray(inputs)) {
          inputs.forEach((input: any) => {
            if (input && input.type === 1) {
              input.value = true
            }
            // 保存鼠标位置输入引用
            if (input && input.name === 'mouseX') {
              mouseXInput.value = input
            }
            if (input && input.name === 'mouseY') {
              mouseYInput.value = input
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

/**
 * 处理整个页面的鼠标移动事件
 * 将鼠标位置映射到 Rive 状态机
 */
function handleGlobalMouseMove(event: MouseEvent): void {
  if (!canvasRef.value || !mouseXInput.value || !mouseYInput.value) return

  // 获取 canvas 相对于视口的位置
  const rect = canvasRef.value.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2

  // 计算鼠标相对于头像中心的偏移
  const deltaX = event.clientX - centerX
  const deltaY = event.clientY - centerY

  // 归一化到 -1 到 1 的范围（基于屏幕尺寸）
  const normalizedX = Math.max(-1, Math.min(1, deltaX / (window.innerWidth / 2)))
  const normalizedY = Math.max(-1, Math.min(1, deltaY / (window.innerHeight / 2)))

  // 更新 Rive 状态机输入
  mouseXInput.value.value = normalizedX
  mouseYInput.value.value = normalizedY
}

function toggleHover(): void {
  isHovered.value = !isHovered.value
}

onMounted(() => {
  initRive()
  // 监听整个页面的鼠标移动
  document.addEventListener('mousemove', handleGlobalMouseMove)
})

onUnmounted(() => {
  // 移除全局鼠标事件监听
  document.removeEventListener('mousemove', handleGlobalMouseMove)

  if (riveInstance.value) {
    try {
      riveInstance.value.cleanup()
    } catch (e) {
      console.warn('[AgentAvatar] 清理 Rive 实例时出错:', e)
    }
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
  transform: scale(1.38) translateY(-5%);
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
