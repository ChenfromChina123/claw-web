<script setup lang="ts">
/**
 * 毛玻璃面板组件
 * 提供玻璃态（Glassmorphism）效果的容器组件
 */
import { computed } from 'vue';

interface Props {
  /** 玻璃强度: light | normal | strong */
  variant?: 'light' | 'normal' | 'strong';
  /** 是否显示边框 */
  bordered?: boolean;
  /** 圆角大小 */
  radius?: string;
  /** 内边距 */
  padding?: string;
  /** 是否可悬停提升 */
  hoverable?: boolean;
  /** 自定义类名 */
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'normal',
  bordered: true,
  radius: undefined,
  padding: undefined,
  hoverable: false,
});

/** 计算样式类名 */
const glassClasses = computed(() => {
  const classes = ['glass-panel'];

  // 变体
  if (props.variant === 'light') classes.push('glass-panel--light');
  else if (props.variant === 'strong') classes.push('glass-panel--strong');
  else classes.push('glass-panel--normal');

  // 边框
  if (props.bordered) classes.push('glass-panel--bordered');

  // 悬停效果
  if (props.hoverable) classes.push('glass-panel--hoverable');

  // 自定义类
  if (props.class) classes.push(props.class);

  return classes.join(' ');
});

/** 计算内联样式 */
const panelStyle = computed(() => {
  const style: Record<string, string> = {};

  if (props.radius) style.borderRadius = props.radius;
  if (props.padding) style.padding = props.padding;

  return style;
});
</script>

<template>
  <div :class="glassClasses" :style="panelStyle">
    <slot />
  </div>
</template>

<style scoped>
.glass-panel {
  position: relative;
  overflow: hidden;
  transition: all var(--transition-normal, 250ms) ease;
}

/* ---- 不同变体 ---- */

.glass-panel--light {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-color: rgba(255, 255, 255, 0.08);
}

.glass-panel--normal {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-color: var(--glass-border);
}

.glass-panel--strong {
  background: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border-color: rgba(99, 102, 241, 0.2);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

/* ---- 带边框 ---- */
.glass-panel--bordered {
  border: 1px solid;
}

/* ---- 可悬停 ---- */
.glass-panel--hoverable:hover {
  transform: translateY(-2px);
  box-shadow:
    var(--shadow-lg),
    0 0 20px var(--color-primary-light);
  border-color: var(--color-primary-light);
}
</style>
