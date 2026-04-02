<script setup lang="ts">
/**
 * 空状态组件
 * 用于列表、卡片等容器为空时的占位显示
 */
interface Props {
  /** 图标或emoji */
  icon?: string;
  /** 标题 */
  title?: string;
  /** 描述文字 */
  description?: string;
  /** 操作按钮文字 */
  actionText?: string;
  /** 是否显示动画 */
  animated?: boolean;
  /** 自定义类名 */
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  icon: '📭',
  title: '暂无数据',
  description: '这里什么都没有',
  animated: true,
});

const emit = defineEmits<{
  (e: 'action'): void;
}>();
</script>

<template>
  <div :class="['empty-state', { 'empty-state--animated': animated }, props.class]">
    <!-- 图标 -->
    <div class="empty-state__icon">
      <span v-if="icon" class="icon-emoji">{{ icon }}</span>
      <slot name="icon" />
    </div>

    <!-- 文字内容 -->
    <div class="empty-state__content">
      <h3 v-if="title" class="empty-state__title">{{ title }}</h3>
      <p v-if="description" class="empty-state__desc">{{ description }}</p>
      <slot />
    </div>

    <!-- 操作按钮 -->
    <button
      v-if="actionText"
      class="empty-state__action"
      @click="emit('action')"
    >
      {{ actionText }}
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl, 48px) var(--space-lg, 24px);
  text-align: center;
  min-height: 200px;
}

/* ---- 动画效果 ---- */
.empty-state--animated .empty-state__icon {
  animation: floatIcon 3s ease-in-out infinite;
}

@keyframes floatIcon {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.empty-state--animated:hover .empty-state__icon {
  animation-play-state: paused;
}

/* ---- 图标 ---- */
.empty-state__icon {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-lg, 24px);
  transition: all var(--transition-normal, 250ms) ease;
}

.icon-emoji {
  font-size: 36px;
  line-height: 1;
}

.empty-state:hover .empty-state__icon {
  background: var(--bg-hover);
  transform: scale(1.05);
}

/* ---- 内容 ---- */
.empty-state__content {
  max-width: 320px;
}

.empty-state__title {
  font-size: var(--font-size-lg, 16px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary);
  margin-bottom: var(--space-xs, 4px);
}

.empty-state__desc {
  font-size: var(--font-size-sm, 13px);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed, 1.75);
  margin-bottom: var(--space-md, 16px);
}

/* ---- 操作按钮 ---- */
.empty-state__action {
  padding: 10px 24px;
  background: var(--gradient-primary);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms) ease;
  box-shadow: var(--shadow-sm);
}

.empty-state__action:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-glow);
}

.empty-state__action:active {
  transform: translateY(0);
}
</style>
