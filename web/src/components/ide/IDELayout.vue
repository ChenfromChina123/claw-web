<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Splitpanes, Pane } from 'splitpanes'
import 'splitpanes/dist/splitpanes.css'
import ActivityBar from './ActivityBar.vue'
import FileExplorerPane from './FileExplorerPane.vue'
import EditorPane from './EditorPane.vue'
import AgentChatPane from './AgentChatPane.vue'
import SessionManagerPane from './SessionManagerPane.vue'

interface Props {
  sessionId?: string
}

const props = defineProps<Props>()

/**
 * 面板可见性状态
 */
const fileExplorerVisible = ref(true)
const editorVisible = ref(true)
const agentPanelVisible = ref(true)

/**
 * 面板尺寸（百分比）
 */
const fileExplorerSize = ref(20)
const editorSize = ref(55)
const agentSize = ref(25)

/**
 * 是否处于全屏对话模式
 */
const isFullscreenMode = ref(false)

/**
 * 当前打开的文件路径（用于显示在顶部标题栏）
 */
const currentFilePath = ref('')

/**
 * 计算属性：是否显示文件管理器面板
 */
const showFileExplorer = computed(() => fileExplorerVisible.value && !isFullscreenMode.value)

/**
 * 计算属性：是否显示编辑器面板
 */
const showEditor = computed(() => editorVisible.value && !isFullscreenMode.value)

/**
 * 计算属性：是否显示 Agent 面板
 */
const showAgentPanel = computed(() => agentPanelVisible.value || isFullscreenMode.value)

/**
 * 切换文件管理器显示状态
 */
function toggleFileExplorer() {
  if (isFullscreenMode.value) {
    exitFullscreen()
  }
  fileExplorerVisible.value = !fileExplorerVisible.value
}

/**
 * 切换 AI 对话面板显示状态
 */
function toggleChatPanel() {
  if (isFullscreenMode.value) {
    exitFullscreen()
  }
  agentPanelVisible.value = !agentPanelVisible.value
}

/**
 * 切换全屏对话模式
 */
function toggleFullscreen() {
  isFullscreenMode.value = !isFullscreenMode.value

  if (isFullscreenMode.value) {
    fileExplorerVisible.value = false
    editorVisible.value = false
    agentPanelVisible.value = true
  } else {
    fileExplorerVisible.value = true
    editorVisible.value = true
  }
}

/**
 * 退出全屏模式
 */
function exitFullscreen() {
  isFullscreenMode.value = false
}

/**
 * 处理文件选中事件（从 FileExplorer 触发）
 * @param filePath 文件路径
 */
function handleFileSelected(filePath: string) {
  currentFilePath.value = filePath
}

/**
 * 处理分割面板尺寸变化
 * @param event 尺寸变化事件
 */
function handleResize(event: any) {
  const panes = event.map((p: any) => p.size)

  if (showFileExplorer.value && showEditor.value && showAgentPanel.value) {
    fileExplorerSize.value = panes[0]
    editorSize.value = panes[1]
    agentSize.value = panes[2]
  }
}
</script>

<template>
  <div class="ide-wrapper">
    <!-- 左侧活动栏 -->
    <ActivityBar
      :file-explorer-visible="fileExplorerVisible"
      :chat-panel-visible="agentPanelVisible"
      @toggle:file-explorer="toggleFileExplorer"
      @toggle:chat-panel="toggleChatPanel"
      @toggle:fullscreen="toggleFullscreen"
    />

    <!-- 右侧主工作区 -->
    <div class="main-workspace">
      <!-- 顶部项目信息栏 -->
      <div class="project-header">
        <span class="project-name">// PROJECT</span>
        <span>{{ currentFilePath || 'Claude Code IDE' }}</span>
      </div>

      <!-- 分割面板区域 -->
      <Splitpanes
        class="default-theme"
        style="flex: 1;"
        @resize="handleResize"
      >
        <!-- 左侧：文件管理器 -->
        <Pane v-if="showFileExplorer" :size="fileExplorerSize" :min-size="15">
          <FileExplorerPane
            :session-id="props.sessionId"
            @file-selected="handleFileSelected"
          />
        </Pane>

        <!-- 中间：代码编辑器 -->
        <Pane v-if="showEditor" :size="editorSize" :min-size="30">
          <EditorPane
            :session-id="props.sessionId"
            :file-path="currentFilePath"
          />
        </Pane>

        <!-- 右侧：Agent 面板（上下分割） -->
        <Pane
          v-if="showAgentPanel"
          :size="isFullscreenMode ? 100 : agentSize"
          :min-size="20"
        >
          <Splitpanes horizontal class="default-theme">
            <!-- 上部：AI 对话框 -->
            <Pane :size="70" :min-size="40">
              <AgentChatPane />
            </Pane>

            <!-- 下部：会话管理 -->
            <Pane :size="30" :min-size="15">
              <SessionManagerPane />
            </Pane>
          </Splitpanes>
        </Pane>
      </Splitpanes>
    </div>
  </div>
</template>

<style scoped>
@import '@/styles/ide-theme.css';

.ide-wrapper {
  display: flex;
  height: 100%;
  width: 100%;
  background: var(--ide-bg);
  overflow: hidden;
}

.main-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.project-header {
  height: 35px;
  background: var(--ide-header);
  border-bottom: 1px solid var(--ide-border);
  display: flex;
  align-items: center;
  padding: 0 15px;
  font-size: 12px;
  color: var(--ide-text-secondary);
  flex-shrink: 0;
}

.project-header .project-name {
  color: #6a9955;
  margin-right: 8px;
  font-weight: 500;
}
</style>
