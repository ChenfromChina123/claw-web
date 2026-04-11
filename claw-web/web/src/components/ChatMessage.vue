<script setup lang="ts">
/**
 * 增强版消息组件
 * 支持代码高亮、操作菜单、时间戳显示等高级功能
 */
import { ref, computed } from 'vue'

interface Props {
  /** 消息角色 */
  role: 'user' | 'assistant'
  /** 消息内容（HTML格式） */
  content: string
  /** 是否正在流式输出 */
  isStreaming?: boolean
  /** 消息时间戳 */
  timestamp?: string
}

const props = withDefaults(defineProps<Props>(), {
  isStreaming: false,
  timestamp: '',
})

/** 是否显示操作菜单 */
const showActions = ref(false)

/** 是否已复制 */
const copied = ref(false)

/** 计算消息出现动画延迟 */
const animationDelay = computed(() => {
  return Math.random() * 0.2
})

/**
 * 复制消息内容到剪贴板
 */
async function copyMessage(): Promise<void> {
  try {
    // 移除 HTML 标签，只复制纯文本
    const textContent = props.content.replace(/<[^>]*>/g, '')
    await navigator.clipboard.writeText(textContent)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
  }
}
</script>

<template>
  <div
    :class="['message', `message--${role}`, { 'message--streaming': isStreaming }]"
    :style="{ animationDelay: `${animationDelay}s` }"
    @mouseenter="showActions = true"
    @mouseleave="showActions = false"
  >
    <!-- 用户消息 -->
    <template v-if="role === 'user'">
      <div class="message-inner message-inner--reverse">
        <!-- 内容区域 -->
        <div class="message-content user-content">
          <!-- 操作按钮 -->
          <Transition name="fade">
            <div v-if="showActions" class="message-actions">
              <button class="action-btn" title="复制消息" @click="copyMessage">
                <svg v-if="!copied" viewBox="0 0 24 24" fill="none" width="14" height="14">
                  <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                  <path d="M5 15V5C5 3.89543 5.89543 3 7 3H16C17.1046 3 18 3.89543 18 5V9" stroke="currentColor" stroke-width="2"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" width="14" height="14" class="success-icon">
                  <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </Transition>

          <!-- 文本内容 -->
          <div class="text-content" v-html="content"></div>

          <!-- 时间戳 -->
          <span v-if="timestamp" class="message-time">{{ timestamp }}</span>
        </div>

        <!-- 头像 -->
        <div class="avatar avatar--user">
          <div class="avatar-ring"></div>
          <span class="avatar-emoji">👤</span>
        </div>
      </div>
    </template>

    <!-- AI助手消息 -->
    <template v-else>
      <div class="message-inner">
        <!-- 头像 -->
        <div class="avatar avatar--assistant">
          <div class="avatar-glow"></div>
          <span class="avatar-emoji">🤖</span>
        </div>

        <!-- 内容区域 -->
        <div class="message-content assistant-content">
          <!-- 角色标签 -->
          <div class="role-badge">Claude</div>

          <!-- 操作按钮 -->
          <Transition name="fade">
            <div v-if="showActions" class="message-actions">
              <button class="action-btn" title="复制消息" @click="copyMessage">
                <svg v-if="!copied" viewBox="0 0 24 24" fill="none" width="14" height="14">
                  <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
                  <path d="M5 15V5C5 3.89543 5.89543 3 7 3H16C17.1046 3 18 3.89543 18 5V9" stroke="currentColor" stroke-width="2"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" width="14" height="14" class="success-icon">
                  <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button class="action-btn" title="重新生成">
                <svg viewBox="0 0 24 24" fill="none" width="14" height="14">
                  <path d="M1 4V10H7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M23 20V14H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M20.49 9C19.9828 7.56678 19.1209 6.28542 17.9845 5.29129C16.8482 4.29717 15.4851 3.62501 14.02 3.34771C12.5549 3.07041 11.0441 3.19864 9.64566 3.71819C8.24721 4.23775 7.01556 5.12856 6.07887 6.28932C5.14218 7.45009 4.53525 8.83721 4.32233 10.3069C4.10941 11.7765 4.29844 13.2718 4.86989 14.6382" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </Transition>

          <!-- 文本内容 -->
          <div class="text-content" :class="{ 'streaming': isStreaming }" v-html="content"></div>

          <!-- 流式输出光标 -->
          <span v-if="isStreaming" class="typing-cursor">▋</span>

          <!-- 时间戳 -->
          <span v-if="timestamp" class="message-time">{{ timestamp }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.message {
  padding: 20px 24px;
  animation: messageSlideIn var(--transition-slow, 350ms) ease-out both;
}

@keyframes messageSlideIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ---- 消息布局 ---- */
.message-inner {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  max-width: 900px;
  margin: 0 auto;
}

.message-inner--reverse {
  flex-direction: row-reverse;
}

/* ---- 头像样式 ---- */
.avatar {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  transition: all var(--transition-normal, 250ms) ease;
}

.avatar--user {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%);
  border: 1px solid rgba(99, 102, 241, 0.25);
}

.avatar--assistant {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%);
  border: 1px solid rgba(34, 197, 94, 0.25);
}

.avatar:hover {
  transform: scale(1.05);
}

.avatar-ring,
.avatar-glow {
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  opacity: 0;
  transition: opacity var(--transition-normal, 250ms) ease;
}

.avatar--user .avatar-ring {
  border: 2px solid var(--color-primary);
  animation: ringPulse 2s ease-in-out infinite;
}

.avatar--assistant .avatar-glow {
  box-shadow: 0 0 15px rgba(34, 197, 94, 0.4);
}

.message:hover .avatar-ring,
.message:hover .avatar-glow {
  opacity: 1;
}

@keyframes ringPulse {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 0; transform: scale(1.1); }
}

/* ---- 内容区域 ---- */
.message-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}

.user-content {
  align-items: flex-end;
}

.assistant-content {
  align-items: flex-start;
}

/* ---- 角色标签 ---- */
.role-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs, 11px);
  font-weight: var(--font-weight-semibold, 600);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--color-success);
  padding: 3px 10px;
  background: var(--color-success-light);
  border-radius: 6px;
  width: fit-content;
}

/* ---- 操作按钮 ---- */
.message-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--transition-fast, 150ms) ease;
}

.user-content .message-actions {
  justify-content: flex-end;
}

.message:hover .message-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms) ease;
}

.action-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.success-icon {
  color: var(--color-success);
}

/* ---- 文本内容 ---- */
.text-content {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.75;
  color: var(--text-primary);
  font-size: var(--font-size-md, 15px);
  max-width: 700px;
  width: 100%;
}

.text-content.streaming {
  color: var(--text-primary);
}

/* Markdown 渲染增强 */
.text-content :deep(code) {
  background: rgba(15, 15, 30, 0.8);
  padding: 3px 8px;
  border-radius: 6px;
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm, 13px);
  color: var(--text-accent);
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.text-content :deep(pre) {
  position: relative;
  background: rgba(15, 15, 30, 0.95);
  padding: 16px 20px;
  border-radius: 12px;
  overflow-x: auto;
  color: var(--e5e7eb, #e5e7eb);
  border: 1px solid rgba(99, 102, 241, 0.15);
  margin: 16px 0;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
}

.text-content :deep(pre code) {
  background: none;
  padding: 0;
  border: none;
  color: inherit;
  font-size: var(--font-size-sm, 13px);
  line-height: 1.65;
}

.text-content :deep(p) {
  margin: 0 0 12px 0;
}

.text-content :deep(p:last-child) {
  margin-bottom: 0;
}

.text-content :deep(ul),
.text-content :deep(ol) {
  margin: 12px 0;
  padding-left: 24px;
}

.text-content :deep(li) {
  margin: 6px 0;
}

.text-content :deep(blockquote) {
  border-left: 3px solid var(--color-primary);
  padding-left: 16px;
  margin: 12px 0;
  color: var(--text-secondary);
  font-style: italic;
}

.text-content :deep(a) {
  color: var(--color-primary-hover);
  text-decoration: none;
  border-bottom: 1px dashed var(--color-primary-hover);
  transition: all var(--transition-fast, 150ms) ease;
}

.text-content :deep(a:hover) {
  border-bottom-style: solid;
}

.text-content :deep(table) {
  border-collapse: collapse;
  margin: 12px 0;
  width: 100%;
  overflow-x: auto;
  display: block;
}

.text-content :deep(th),
.text-content :deep(td) {
  border: 1px solid var(--border-color);
  padding: 10px 14px;
  text-align: left;
}

.text-content :deep(th) {
  background: var(--color-primary-light);
  font-weight: var(--font-weight-semibold, 600);
}

.text-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 12px 0;
}

/* ---- 打字光标 ---- */
.typing-cursor {
  display: inline-block;
  color: var(--color-primary);
  font-weight: bold;
  animation: blink 1s step-end infinite;
  margin-left: 2px;
  vertical-align: middle;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* ---- 时间戳 ---- */
.message-time {
  font-size: var(--font-size-xs, 11px);
  color: var(--text-disabled);
  opacity: 0;
  transition: opacity var(--transition-fast, 150ms) ease;
}

.message:hover .message-time {
  opacity: 1;
}

/* ---- 过渡动画 ---- */
.fade-enter-active,
.fade-leave-active {
  transition: all var(--transition-fast, 150ms) ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ---- 响应式 ---- */
@media (max-width: 640px) {
  .message {
    padding: 16px;
  }

  .message-inner {
    gap: 12px;
  }

  .avatar {
    width: 36px;
    height: 36px;
    font-size: 18px;
    border-radius: 10px;
  }

  .text-content {
    font-size: var(--font-size-base, 14px);
  }

  .message-actions {
    opacity: 1;
  }
}
</style>
