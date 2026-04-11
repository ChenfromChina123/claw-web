<script setup lang="ts">
/**
 * AI助手消息组件 - 增强版
 * 集成 markstream-vue 流式渲染引擎，支持：
 * - 增量式Markdown渲染（零闪烁）
 * - Monaco编辑器代码块（增量高亮）
 * - 渐进式Mermaid图表
 * - KaTeX数学公式
 * - 实时流式更新
 * - 代码片段一键收藏功能
 */
import { computed, ref, onMounted, nextTick, watch } from 'vue'
import { NAvatar, NButton, NTooltip, useMessage } from 'naive-ui'
import MarkdownRender from 'markstream-vue'
import type { TextMessage } from '@/types'
import { copyToClipboard, extractCodeBlocks } from '@/utils/markdown'
import { formatDate } from '@/utils/format'
import { useSnippetStore } from '@/stores/snippet'
import AgentAvatar from '@/components/AgentAvatar.vue'

interface Props {
  message: TextMessage
  showAvatar?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showAvatar: true,
})

const message = useMessage()
const snippetStore = useSnippetStore()

/** 是否正在流式输出 */
const isStreaming = computed(() => props.message.isStreaming)

/** 消息内容（流式时添加光标） */
const displayContent = computed(() => {
  const content = props.message.content
  if (isStreaming.value && content) {
    return content + '\n'
  }
  return content || '*正在思考...*'
})

/** 时间显示 */
const timeDisplay = computed(() => {
  return formatDate(props.message.createdAt, 'time')
})

/** 复制状态 */
const copied = ref(false)

/** 是否有代码块 */
const hasCodeBlocks = computed(() => {
  const blocks = extractCodeBlocks(props.message.content)
  return blocks.length > 0
})

/** 提取的代码块信息 */
const codeBlocks = computed(() => {
  return extractCodeBlocks(props.message.content)
})

/**
 * 复制消息内容到剪贴板
 */
async function handleCopy(): Promise<void> {
  try {
    await copyToClipboard(props.message.content)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (error) {
    console.error('复制失败:', error)
  }
}

/**
 * 收藏所有代码块
 */
async function handleSaveAllSnippets(): Promise<void> {
  const blocks = codeBlocks.value
  if (blocks.length === 0) {
    message.warning('没有可收藏的代码片段')
    return
  }

  let savedCount = 0
  let existsCount = 0

  for (const block of blocks) {
    if (snippetStore.isSnippetExists(block.code)) {
      existsCount++
    } else {
      snippetStore.addSnippet(block.code, block.language)
      savedCount++
    }
  }

  if (savedCount > 0) {
    message.success(`已收藏 ${savedCount} 个代码片段`)
  }
  if (existsCount > 0) {
    message.info(`已收藏 ${existsCount} 个代码片段（部分重复已跳过）`)
  }
}

/**
 * 收藏单个代码块
 */
function handleSaveSnippet(code: string, language: string): void {
  if (snippetStore.isSnippetExists(code)) {
    message.info('该代码片段已收藏')
    return
  }
  snippetStore.addSnippet(code, language)
  message.success('已收藏代码片段')
}

/**
 * 复制单个代码块
 */
async function handleCopyCode(code: string): Promise<void> {
  try {
    await copyToClipboard(code)
    message.success('已复制代码')
  } catch {
    message.error('复制失败')
  }
}

/**
 * 等待DOM更新后注入代码块操作按钮
 */
async function injectCodeBlockButtons(): Promise<void> {
  await nextTick()
  
  const container = document.querySelector('#assistant-chat')
  if (!container) return

  const pres = container.querySelectorAll('pre')
  pres.forEach((pre, index) => {
    if (pre.querySelector('.code-block-actions')) return

    const codeBlock = codeBlocks.value[index]
    if (!codeBlock) return

    const actionsDiv = document.createElement('div')
    actionsDiv.className = 'code-block-actions'
    actionsDiv.innerHTML = `
      <button class="code-action-btn copy-btn" title="复制代码">📋</button>
      <button class="code-action-btn save-btn" title="收藏代码">⭐</button>
      <span class="code-lang">${codeBlock.language || 'plaintext'}</span>
    `

    const copyBtn = actionsDiv.querySelector('.copy-btn')
    const saveBtn = actionsDiv.querySelector('.save-btn')

    copyBtn?.addEventListener('click', () => {
      handleCopyCode(codeBlock.code)
    })

    saveBtn?.addEventListener('click', () => {
      handleSaveSnippet(codeBlock.code, codeBlock.language)
    })

    pre.style.position = 'relative'
    pre.appendChild(actionsDiv)
  })
}

onMounted(() => {
  injectCodeBlockButtons()
})

watch(() => props.message.content, () => {
  injectCodeBlockButtons()
})
</script>

<template>
  <div class="message assistant-message">
    <div v-if="showAvatar" class="avatar-wrapper">
      <AgentAvatar />
    </div>

    <div class="message-content">
      <div class="message-header">
        <span class="assistant-label">助手</span>
        <div class="header-actions">
          <NTooltip trigger="hover" placement="top">
            <template #trigger>
              <NButton text size="tiny" @click="handleSaveAllSnippets" :disabled="!hasCodeBlocks">
                ⭐ 收藏{{ hasCodeBlocks ? ` (${codeBlocks.length})` : '' }}
              </NButton>
            </template>
            收藏消息中的所有代码片段
          </NTooltip>

          <NTooltip trigger="hover" placement="top">
            <template #trigger>
              <NButton text size="tiny" @click="handleCopy">
                {{ copied ? '✓ 已复制' : '📋 复制' }}
              </NButton>
            </template>
            复制消息内容
          </NTooltip>
        </div>
      </div>

      <!-- 使用 markstream-vue 的 MarkdownRender 组件 -->
      <div
        class="message-body"
        :class="{ streaming: isStreaming }"
      >
        <MarkdownRender
          :content="displayContent"
          :enable-monaco="true"
          :enable-mermaid="true"
          :enable-katex="true"
          :final="!isStreaming"
          custom-id="assistant-chat"
          :mermaid-props="{
            renderDebounceMs: 180,
            previewPollDelayMs: 500,
          }"
        />
        
        <!-- 流式光标动画 -->
        <span v-if="isStreaming" class="streaming-cursor">|</span>
      </div>

      <span class="message-time">{{ timeDisplay }}</span>
    </div>
  </div>
</template>

<style scoped>
.assistant-message {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  animation: fadeIn 0.3s ease-out;
}

.avatar-wrapper {
  flex-shrink: 0;
}

.message-content {
  max-width: 75%;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.message-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.assistant-label {
  font-size: 12px;
  font-weight: 600;
  color: #10b981;
}

.message-body {
  background: #1e1e2e;
  color: #e2e8f0;
  padding: 14px 18px;
  border-radius: 4px 18px 18px 18px;
  word-break: break-word;
  line-height: 1.7;
  font-size: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  position: relative;
  min-height: 24px;
}

/* 流式光标动画 */
.streaming-cursor {
  display: inline-block;
  animation: blink 1s infinite;
  color: #10b981;
  font-weight: bold;
  margin-left: 2px;
  vertical-align: bottom;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

/* markstream-vue 样式覆盖 - 适配深色主题 */
.message-body :deep(.markstream-vue) {
  color: #e2e8f0;
  font-size: 14px;
  line-height: 1.7;
}

.message-body :deep(.markstream-vue p) {
  margin: 0 0 8px 0;
}

.message-body :deep(.markstream-vue p:last-child) {
  margin-bottom: 0;
}

.message-body :deep(.markstream-vue h1),
.message-body :deep(.markstream-vue h2),
.message-body :deep(.markstream-vue h3) {
  margin-top: 16px;
  margin-bottom: 8px;
  color: #f1f5f9;
}

.message-body :deep(.markstream-vue h1) {
  font-size: 1.5em;
}

.message-body :deep(.markstream-vue h2) {
  font-size: 1.3em;
}

.message-body :deep(.markstream-vue h3) {
  font-size: 1.15em;
}

.message-body :deep(.markstream-vue ul),
.message-body :deep(.markstream-vue ol) {
  padding-left: 24px;
  margin: 8px 0;
}

.message-body :deep(.markstream-vue li) {
  margin: 4px 0;
}

.message-body :deep(.markstream-vue blockquote) {
  border-left: 4px solid #6366f1;
  padding-left: 16px;
  margin: 12px 0;
  color: #94a3b8;
  font-style: italic;
}

.message-body :deep(.markstream-vue table) {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.message-body :deep(.markstream-vue th),
.message-body :deep(.markstream-vue td) {
  border: 1px solid #334155;
  padding: 8px 12px;
  text-align: left;
}

.message-body :deep(.markstream-vue th) {
  background: #334155;
  font-weight: 600;
}

/* 代码块样式优化 */
.message-body :deep(.markstream-vue pre) {
  background: #0d1117;
  border-radius: 8px;
  padding: 12px;
  overflow-x: auto;
  margin: 12px 0;
  position: relative;
}

.message-body :deep(.markstream-vue pre:hover .code-block-actions) {
  opacity: 1;
}

/* 代码块操作按钮 */
.message-body :deep(.code-block-actions) {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.2s ease;
  align-items: center;
  background: rgba(30, 30, 46, 0.9);
  padding: 4px 8px;
  border-radius: 4px;
}

.message-body :deep(.code-action-btn) {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.2s;
}

.message-body :deep(.code-action-btn:hover) {
  background: rgba(255, 255, 255, 0.1);
}

.message-body :deep(.code-lang) {
  font-size: 11px;
  color: #666;
  margin-left: 4px;
}

.message-body :deep(.markstream-vue code) {
  font-family: 'Fira Code', 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
}

.message-body :deep(.markstream-vue :not(pre) > code) {
  background: #334155;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

/* Mermaid 图表容器样式 */
.message-body :deep(.markstream-vue .mermaid) {
  background: transparent;
  padding: 12px;
  border-radius: 8px;
  margin: 12px 0;
  text-align: center;
}

/* KaTeX 公式样式 */
.message-body :deep(.markstream-vue .katex) {
  font-size: 1.1em;
  color: #e2e8f0;
}

.message-time {
  font-size: 11px;
  color: #999;
  padding-left: 8px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
