<script setup lang="ts">
/**
 * IdeComponentLayoutPanel - IDE 组件布局设置面板
 * 用于展开/收起 IDE 工作台中的各个组件
 */
import { NIcon, NSwitch, NButton } from 'naive-ui'
import {
  FolderOpenOutline,
  CodeSlash,
  TerminalOutline,
  ChatbubblesOutline,
  ContractOutline,
  ExpandOutline,
  RefreshOutline,
} from '@vicons/ionicons5'
import { useIdeComponentLayoutStore } from '@/stores/ideComponentLayout'

const layoutStore = useIdeComponentLayoutStore()

defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const componentList = [
  { key: 'explorer', label: '文件管理器', icon: FolderOpenOutline, visibleRef: layoutStore.explorerVisible },
  { key: 'editor', label: '编辑器', icon: CodeSlash, visibleRef: layoutStore.editorVisible },
  { key: 'terminal', label: '终端', icon: TerminalOutline, visibleRef: layoutStore.terminalVisible },
  { key: 'chat', label: 'AI Agent', icon: ChatbubblesOutline, visibleRef: layoutStore.chatVisible },
]

function handleToggle(key: string): void {
  switch (key) {
    case 'explorer':
      layoutStore.toggleExplorer()
      break
    case 'editor':
      layoutStore.toggleEditor()
      break
    case 'terminal':
      layoutStore.toggleTerminal()
      break
    case 'chat':
      layoutStore.toggleChat()
      break
  }
}

function handleToggleAll(): void {
  layoutStore.toggleAll()
}

function handleReset(): void {
  layoutStore.reset()
}

function handleClickOutside(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (target.classList.contains('layout-panel-overlay')) {
    emit('close')
  }
}
</script>

<template>
  <Transition name="layout-panel-fade">
    <div v-if="visible" class="layout-panel-overlay" @click="handleClickOutside">
      <div class="layout-panel">
        <div class="layout-panel-header">
          <span class="layout-panel-title">组件布局</span>
          <div class="layout-panel-actions">
            <NButton
              size="tiny"
              quaternary
              @click="handleToggleAll"
            >
              <template #icon>
                <NIcon>
                  <ExpandOutline v-if="layoutStore.allVisible" />
                  <ContractOutline v-else />
                </NIcon>
              </template>
              {{ layoutStore.allVisible ? '全部收起' : '全部展开' }}
            </NButton>
            <NButton
              size="tiny"
              quaternary
              @click="handleReset"
            >
              <template #icon>
                <NIcon><RefreshOutline /></NIcon>
              </template>
              重置
            </NButton>
          </div>
        </div>

        <div class="layout-panel-body">
          <div
            v-for="item in componentList"
            :key="item.key"
            class="layout-item"
            @click="handleToggle(item.key)"
          >
            <div class="layout-item-left">
              <NIcon size="16" class="layout-item-icon">
                <component :is="item.icon" />
              </NIcon>
              <span class="layout-item-label">{{ item.label }}</span>
            </div>
            <NSwitch
              :value="item.visibleRef.value"
              size="small"
              @click.stop="handleToggle(item.key)"
            />
          </div>
        </div>

        <div class="layout-panel-footer">
          <span class="layout-panel-hint">当前显示 {{ layoutStore.visibleCount }} / 4 个组件</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.layout-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
}

.layout-panel {
  position: absolute;
  top: 56px;
  right: 16px;
  width: 260px;
  background: #2d2d2d;
  border: 1px solid #3c3c3c;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.layout-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #3c3c3c;
  background: #252525;
}

.layout-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #cccccc;
}

.layout-panel-actions {
  display: flex;
  gap: 4px;
}

.layout-panel-body {
  padding: 8px;
}

.layout-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.layout-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.layout-item-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.layout-item-icon {
  color: #858585;
}

.layout-item-label {
  font-size: 13px;
  color: #cccccc;
}

.layout-panel-footer {
  padding: 8px 14px;
  border-top: 1px solid #3c3c3c;
  background: #252525;
}

.layout-panel-hint {
  font-size: 11px;
  color: #666666;
}

.layout-panel-fade-enter-active,
.layout-panel-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.layout-panel-fade-enter-from,
.layout-panel-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
