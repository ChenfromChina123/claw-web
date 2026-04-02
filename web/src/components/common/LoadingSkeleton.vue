<script setup lang="ts">
/**
 * 骨架屏加载组件
 * 用于内容加载时的占位显示，提供多种预设形状
 */
import { computed } from 'vue';

interface Props {
  /** 是否显示骨架屏 */
  loading?: boolean;
  /** 骨架屏类型 */
  type?: 'text' | 'heading' | 'avatar' | 'button' | 'card' | 'custom';
  /** 行数（text类型） */
  lines?: number;
  /** 宽度 */
  width?: string | number;
  /** 高度 */
  height?: string | number;
  /** 圆角 */
  radius?: string;
  /** 是否启用动画 */
  animated?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: true,
  type: 'text',
  lines: 3,
  width: '100%',
  height: undefined,
  radius: undefined,
  animated: true,
});

/** 计算样式 */
const computedStyle = computed(() => {
  const style: Record<string, string> = {};

  if (props.width) style.width = typeof props.width === 'number' ? `${props.width}px` : props.width;
  if (props.height) style.height = typeof props.height === 'number' ? `${props.height}px` : props.height;

  return style;
});

/** 根据类型获取默认高度 */
const defaultHeight = computed(() => {
  if (props.height) return '';
  switch (props.type) {
    case 'heading': return '24px';
    case 'avatar': return '40px';
    case 'button': return '36px';
    default: return '16px';
  }
});
</script>

<template>
  <div v-if="loading" class="skeleton-wrapper">
    <!-- 文本骨架 -->
    <template v-if="type === 'text' || type === 'heading'">
      <div class="skeleton-lines">
        <div
          v-for="i in lines"
          :key="i"
          class="skeleton-line"
          :class="{ 'skeleton-line--short': i === lines && lines > 1 }"
          :style="[computedStyle, { height: defaultHeight }]"
        />
      </div>
    </template>

    <!-- 头像骨架 -->
    <div v-else-if="type === 'avatar'"
         class="skeleton-avatar skeleton-shimmer"
         :style="[computedStyle, { height: defaultHeight, width: width || defaultHeight, borderRadius: radius || '50%' }]"
    />

    <!-- 按钮骨架 -->
    <div v-else-if="type === 'button'"
         class="skeleton-button skeleton-shimmer"
         :style="[computedStyle, { height: defaultHeight, borderRadius: radius || '8px', width: width || '120px' }]"
    />

    <!-- 卡片骨架 -->
    <div v-else-if="type === 'card'" class="skeleton-card skeleton-shimmer" :style="computedStyle">
      <div class="skeleton-card__header">
        <div class="skeleton-avatar" style="width: 40px; height: 40px; border-radius: 50%;" />
        <div class="skeleton-card__title">
          <div class="skeleton-line" style="width: 60%; height: 14px;" />
          <div class="skeleton-line skeleton-line--short" style="width: 40%; height: 12px; margin-top: 8px;" />
        </div>
      </div>
      <div class="skeleton-card__content">
        <div v-for="i in 3" :key="i" class="skeleton-line" :class="{ 'skeleton-line--short': i === 3 }" />
      </div>
    </div>

    <!-- 自定义骨架 -->
    <div v-else
         class="skeleton-custom skeleton-shimmer"
         :style="[computedStyle, { borderRadius: radius || '8px' }]"
    />
  </div>

  <!-- 实际内容 -->
  <slot v-else />
</template>

<style scoped>
.skeleton-wrapper {
  width: 100%;
}

.skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  background: var(--bg-tertiary);
  border-radius: 6px;
  position: relative;
  overflow: hidden;
}

.skeleton-line--short {
  width: 70% !important;
  margin-left: auto;
}

.skeleton-avatar,
.skeleton-button,
.skeleton-custom {
  position: relative;
  overflow: hidden;
  background: var(--bg-tertiary);
}

.skeleton-card {
  padding: 20px;
  border-radius: var(--border-radius);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
}

.skeleton-card__header {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.skeleton-card__title {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-card__content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 闪烁动画 */
.skeleton-shimmer::after {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.03) 50%,
    transparent 100%
  );
  animation: shimmer 1.5s ease-in-out infinite;
}
</style>
