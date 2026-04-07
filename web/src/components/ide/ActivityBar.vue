<script setup lang="ts">
import { NIcon } from 'naive-ui'
import {
  FolderOpen,
  ChatbubblesOutline,
  ExpandOutline,
  CreateOutline
} from '@vicons/ionicons5'

interface Props {
  fileExplorerVisible: boolean
  chatPanelVisible: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'toggle:fileExplorer': []
  'toggle:chatPanel': []
  'toggle:fullscreen': []
}>()

function toggleFileExplorer() {
  emit('toggle:fileExplorer')
}

function toggleChatPanel() {
  emit('toggle:chatPanel')
}

function toggleFullscreen() {
  emit('toggle:fullscreen')
}
</script>

<template>
  <div class="activity-bar">
    <div
      class="activity-item"
      :class="{ active: props.fileExplorerVisible }"
      title="文件管理器"
      @click="toggleFileExplorer"
    >
      <NIcon :size="22"><FolderOpen /></NIcon>
    </div>

    <div
      class="activity-item"
      :class="{ active: props.chatPanelVisible }"
      title="AI 对话"
      @click="toggleChatPanel"
    >
      <NIcon :size="22"><ChatbubblesOutline /></NIcon>
    </div>

    <div
      class="activity-item"
      title="全屏对话模式"
      @click="toggleFullscreen"
    >
      <NIcon :size="22"><ExpandOutline /></NIcon>
    </div>

    <div class="activity-spacer"></div>

    <div class="activity-item" title="设置">
      <NIcon :size="22"><CreateOutline /></NIcon>
    </div>
  </div>
</template>

<style scoped>
.activity-bar {
  position: fixed;
  left: 0;
  top: 0;
  width: 48px;
  height: 100vh;
  background: #333333;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 15px;
  gap: 4px;
  flex-shrink: 0;
  border-right: 1px solid #111;
  z-index: 1000;
}

.activity-item {
  cursor: pointer;
  color: #858585;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 48px;
  position: relative;
  transition: color 0.2s ease, background 0.2s ease;
}

.activity-item:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.activity-item.active {
  color: #fff;
}

.activity-item.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: 2px;
  background: #fff;
}

.activity-spacer {
  flex: 1;
}
</style>
