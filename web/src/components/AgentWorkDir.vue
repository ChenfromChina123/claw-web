<script setup lang="ts">
/**
 * AgentWorkDir - 工作目录浏览器
 *
 * 功能：
 * - 高性能文件树展示（虚拟滚动 + 懒加载）
 * - 文件/目录图标区分
 * - Monaco Editor 在线编辑（VS Code 内核）+ 多文件 Tab
 * - 左右分栏布局（文件树 + 编辑器）
 *
 * 注意：此组件用于抽屉内，通过 useAgentWorkdir 提供上下文。
 * IDE 工作台 (IdeWorkbench.vue) 使用同一个 composable，但自行 provide 上下文。
 */

import { computed, onMounted } from 'vue'
import { useAgentWorkdir } from '@/composables/useAgentWorkdir'
import AgentWorkdirTreePanel from './workdir/AgentWorkdirTreePanel.vue'
import AgentWorkdirEditorPanel from './workdir/AgentWorkdirEditorPanel.vue'

/**
 * Props 接口
 */
interface Props {
  sessionId: string
}

const props = defineProps<Props>()

/**
 * sessionId ref 包装
 */
const sessionIdRef = computed(() => props.sessionId)

/**
 * 使用 composable（自动 provide）
 */
const ctx = useAgentWorkdir(sessionIdRef)

/**
 * 刷新方法，暴露给父组件
 */
defineExpose({
  refresh: ctx.refreshTree
})

// 初始加载
onMounted(async () => {
  await ctx.initTree()
})
</script>

<template>
  <div class="agent-workdir">
    <!-- 左侧：文件树 -->
    <AgentWorkdirTreePanel />
    
    <!-- 右侧：编辑器 -->
    <AgentWorkdirEditorPanel />
  </div>
</template>

<style scoped>
.agent-workdir {
  display: flex;
  width: 100%;
  height: 100%;
  gap: 1px;
  background: var(--card-color, #1e1e1e);
  border-radius: 8px;
  overflow: hidden;
}

/* 响应式调整 */
@media (max-width: 900px) {
  .agent-workdir {
    flex-direction: column;
  }
}
</style>
