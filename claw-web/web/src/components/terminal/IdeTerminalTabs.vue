<script setup lang="ts">
/**
 * IdeTerminalTabs - 多标签终端容器
 * 
 * 管理多个终端标签页，每个标签对应独立的 PTY 会话。
 * Agent Bash/PowerShell 输出默认镜像到当前激活的标签。
 */
import { ref, shallowRef, computed, nextTick } from 'vue'
import IdeTerminalTabPane from './IdeTerminalTabPane.vue'

const props = withDefaults(
  defineProps<{
    defaultCwd?: string
    sessionId?: string
  }>(),
  {
    defaultCwd: '',
    sessionId: '',
  }
)

// ==================== Tab 管理 ====================

let tabCounter = 1

interface TerminalTab {
  id: string
  title: string
  pane: InstanceType<typeof IdeTerminalTabPane> | null
  /** 此 tab 是否是 Agent 输出的镜像目标 */
  mirrorTarget: boolean
}

const tabs = ref<TerminalTab[]>([])
const activeTabId = ref<string>('')

const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value))

// ==================== Tab 操作 ====================

function createTab(): TerminalTab {
  const id = `term-tab-${Date.now()}-${tabCounter++}`
  return {
    id,
    title: `Terminal ${tabCounter - 1}`,
    pane: null,
    mirrorTarget: tabs.value.length === 0,
  }
}

async function addTab(): Promise<void> {
  const tab = createTab()
  tabs.value.push(tab)
  await nextTick()
  activeTabId.value = tab.id
}

function closeTab(id: string): void {
  const idx = tabs.value.findIndex(t => t.id === id)
  if (idx === -1) return
  if (tabs.value.length === 1) return

  const wasMirrorTarget = tabs.value[idx].mirrorTarget
  tabs.value.splice(idx, 1)

  if (wasMirrorTarget && tabs.value.length > 0) {
    const newTarget = tabs.value[Math.min(idx, tabs.value.length - 1)]
    newTarget.mirrorTarget = true
  }

  if (activeTabId.value === id) {
    const newActive = tabs.value[Math.max(0, idx - 1)]
    activeTabId.value = newActive?.id ?? ''
  }
}

function activateTab(id: string): void {
  activeTabId.value = id
}

function setMirrorTarget(id: string): void {
  for (const tab of tabs.value) {
    tab.mirrorTarget = tab.id === id
  }
}

async function onNewTab(): Promise<void> {
  await addTab()
}

function onTabCloseBtn(e: MouseEvent, id: string): void {
  e.stopPropagation()
  closeTab(id)
}

// ==================== 初始化 ====================

const firstTab = createTab()
tabs.value.push(firstTab)
activeTabId.value = firstTab.id

// ==================== 公开 API ====================

defineExpose({
  /** 从对话区「在终端查看」跳转：聚焦当前激活标签的 xterm */
  focusActiveTerminal() {
    nextTick(() => {
      activeTab.value?.pane?.onActivate?.()
      activeTab.value?.pane?.focus?.()
    })
  },
  writeAgentOutput(text: string) {
    const target = tabs.value.find(t => t.mirrorTarget)
    target?.pane?.writeAgentOutput(text)
  },
  writePromptLine(command: string, prompt?: string) {
    const target = tabs.value.find(t => t.mirrorTarget)
    target?.pane?.writePromptLine(command, prompt)
  },
  setMirrorTarget,
  getActiveSessionId() {
    return activeTab.value?.pane?.getSessionId()
  },
  getActiveConnectionStatus() {
    return activeTab.value?.pane?.getConnectionStatus()
  },
})
</script>

<template>
  <div class="terminal-tabs-container">
    <!-- 标签栏 -->
    <div class="terminal-tabs-bar">
      <div class="tabs-list">
        <div
          v-for="tab in tabs"
          :key="tab.id"
          class="terminal-tab-item"
          :class="{ active: activeTabId === tab.id, 'mirror-target': tab.mirrorTarget }"
          @click="activateTab(tab.id)"
        >
          <span class="tab-icon">&#9654;</span>
          <span class="tab-title">{{ tab.title }}</span>
          <button
            v-if="tabs.length > 1"
            class="tab-close"
            title="关闭标签"
            @click="onTabCloseBtn($event, tab.id)"
          >
            &times;
          </button>
        </div>
      </div>

      <div class="tabs-actions">
        <button class="tab-action-btn" title="新建终端" @click="onNewTab">
          +
        </button>
      </div>
    </div>

    <!-- 标签内容：通过 ref 函数在 tabs 中保存 pane 实例 -->
    <div class="terminal-tabs-content">
      <IdeTerminalTabPane
        v-for="tab in tabs"
        v-show="activeTabId === tab.id"
        :key="tab.id"
        :ref="(el: any) => { if (el) tab.pane = el as InstanceType<typeof IdeTerminalTabPane> }"
        :tab-id="tab.id"
        :default-cwd="defaultCwd"
        :mirror-agent-shell="tab.mirrorTarget"
      />
    </div>
  </div>
</template>

<style scoped>
.terminal-tabs-container {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: #1e1e1e;
}

.terminal-tabs-bar {
  flex-shrink: 0;
  height: 35px;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  background: #252526;
  border-bottom: 1px solid #333;
  font-size: 11px;
  user-select: none;
}

.tabs-list {
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.tabs-list::-webkit-scrollbar {
  display: none;
}

.terminal-tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.terminal-tab-item:hover {
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.05);
}

.terminal-tab-item.active {
  color: #fff;
  border-bottom-color: #fff;
  background: rgba(255, 255, 255, 0.05);
}

.terminal-tab-item.mirror-target::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #23d18b;
  margin-right: 2px;
  flex-shrink: 0;
}

.tab-icon {
  font-size: 8px;
  opacity: 0.6;
}

.tab-title {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab-close {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
  border-radius: 3px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tab-close:hover {
  background: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.9);
}

.tabs-actions {
  display: flex;
  align-items: center;
  padding: 0 4px;
}

.tab-action-btn {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s ease, color 0.1s ease;
}

.tab-action-btn:hover {
  background: #37373d;
  color: #fff;
}

.terminal-tabs-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
