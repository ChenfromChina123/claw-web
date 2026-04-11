<script setup lang="ts">
/**
 * 主题切换器组件
 * 提供可视化的主题选择界面，支持预览和快速切换
 */
import { ref, computed } from 'vue';
import { useTheme } from '@/composables/useTheme';
import type { ThemeConfig } from '@/themes/types';

const props = withDefaults(
  defineProps<{
    /** toolbar：右上角快捷样式；settings：嵌入设置页，面板左对齐、触发器显示当前主题名 */
    variant?: 'toolbar' | 'settings';
  }>(),
  { variant: 'toolbar' }
);

const { currentThemeId, currentTheme, themes, setTheme } = useTheme();

const showPicker = ref(false);
const searchQuery = ref('');

/** 过滤后的主题列表 */
const filteredThemes = computed(() => {
  if (!searchQuery.value) return themes;
  const query = searchQuery.value.toLowerCase();
  return themes.filter(
    (theme) =>
      theme.name.toLowerCase().includes(query) ||
      theme.description.toLowerCase().includes(query)
  );
});

/** 切换主题 */
function handleSelectTheme(theme: ThemeConfig) {
  setTheme(theme.id);
  showPicker.value = false;
}

/** 获取主题预览样式 */
function getPreviewStyle(theme: ThemeConfig): Record<string, string> {
  return {
    background: `linear-gradient(135deg, ${theme.colors.primary}33 0%, ${theme.background.secondary} 100%)`,
    borderColor: theme.colors.primary,
  };
}
</script>

<template>
  <div class="theme-switcher" :class="{ 'theme-switcher--settings': props.variant === 'settings' }">
    <!-- 触发按钮 -->
    <button
      type="button"
      class="theme-trigger"
      :class="{ 'theme-trigger--settings': props.variant === 'settings' }"
      :title="`当前主题: ${currentTheme.name}`"
      @click="showPicker = !showPicker"
    >
      <template v-if="props.variant === 'settings'">
        <span class="theme-icon">{{ currentTheme.icon }}</span>
        <span class="theme-current-name">{{ currentTheme.name }}</span>
      </template>
      <template v-else>
        <span class="theme-icon">{{ currentTheme.icon }}</span>
        <span class="theme-label">主题</span>
      </template>
      <svg class="chevron" :class="{ open: showPicker }" viewBox="0 0 24 24" fill="none">
        <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>

    <!-- 主题选择面板 -->
    <Transition name="fade">
      <div
        v-if="showPicker"
        class="theme-picker glass-strong"
        :class="{ 'theme-picker--settings': props.variant === 'settings' }"
        @click.stop
      >
        <!-- 头部 -->
        <div class="picker-header">
          <h3>选择主题</h3>
          <div class="search-box">
            <svg viewBox="0 0 24 24" fill="none" class="search-icon">
              <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
              <path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="搜索主题..."
              class="search-input"
            />
          </div>
        </div>

        <!-- 主题列表 -->
        <div class="theme-list">
          <button
            v-for="theme in filteredThemes"
            :key="theme.id"
            class="theme-option"
            :class="{ active: currentThemeId === theme.id }"
            @click="handleSelectTheme(theme)"
          >
            <!-- 预览色块 -->
            <div
              class="theme-preview"
              :style="getPreviewStyle(theme)"
            >
              <span class="preview-icon">{{ theme.icon }}</span>
            </div>

            <!-- 主题信息 -->
            <div class="theme-info">
              <div class="theme-name-row">
                <span class="theme-name">{{ theme.name }}</span>
                <svg v-if="currentThemeId === theme.id" class="check-icon" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <span class="theme-desc">{{ theme.description }}</span>
            </div>
          </button>

          <!-- 空状态 -->
          <div v-if="filteredThemes.length === 0" class="empty-state">
            <p>未找到匹配的主题</p>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 点击外部关闭 -->
    <div v-if="showPicker" class="picker-backdrop" @click="showPicker = false" />
  </div>
</template>

<style scoped>
.theme-switcher {
  position: relative;
}

/* 嵌入设置：整块贴左，不随表单项拉伸到最右侧 */
.theme-switcher--settings {
  display: inline-flex;
  vertical-align: top;
}

.theme-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: var(--font-size-sm, 13px);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms) ease;
}

.theme-trigger:hover {
  border-color: var(--color-primary);
  background: var(--bg-hover);
}

.theme-icon {
  font-size: 16px;
}

.theme-current-name {
  font-size: var(--font-size-sm, 13px);
  font-weight: 500;
  color: var(--text-primary);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-trigger--settings {
  min-width: 0;
}

.chevron {
  width: 14px;
  height: 14px;
  transition: transform var(--transition-fast, 150ms) ease;
  opacity: 0.6;
}

.chevron.open {
  transform: rotate(180deg);
}

/* ---- 选择面板 ---- */
.theme-picker {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  max-height: 450px;
  border-radius: 16px;
  z-index: var(--z-dropdown, 100);
  overflow: hidden;
  box-shadow: var(--shadow-lg, 0 8px 32px rgba(0, 0, 0, 0.5));
}

/* 设置页：下拉与触发器左缘对齐，避免面板贴视口右侧 */
.theme-picker--settings {
  left: 0;
  right: auto;
}

.picker-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.picker-header h3 {
  font-size: var(--font-size-md, 15px);
  font-weight: var(--font-weight-semibold, 600);
  margin-bottom: 12px;
  color: var(--text-primary);
}

.search-box {
  position: relative;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--text-disabled);
}

.search-input {
  width: 100%;
  padding: 8px 12px 8px 34px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: var(--font-size-sm, 13px);
  outline: none;
  transition: border-color var(--transition-fast, 150ms) ease;
}

.search-input:focus {
  border-color: var(--color-primary);
}

/* ---- 主题列表 ---- */
.theme-list {
  padding: 8px;
  max-height: 350px;
  overflow-y: auto;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  margin-bottom: 4px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms) ease;
}

.theme-option:hover {
  background: var(--bg-hover);
  border-color: var(--border-light);
}

.theme-option.active {
  background: var(--bg-active);
  border-color: var(--color-primary-light);
}

.theme-preview {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--transition-fast, 150ms) ease;
}

.theme-option.active .theme-preview {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-glow);
}

.preview-icon {
  font-size: 20px;
}

.theme-info {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.theme-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.theme-name {
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--text-primary);
}

.check-icon {
  width: 18px;
  height: 18px;
  color: var(--color-success);
  flex-shrink: 0;
}

.theme-desc {
  font-size: var(--font-size-xs, 11px);
  color: var(--text-secondary);
  margin-top: 2px;
  display: block;
}

.empty-state {
  text-align: center;
  padding: 24px;
  color: var(--text-secondary);
  font-size: var(--font-size-sm, 13px);
}

/* ---- 遮罩层 ---- */
.picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-dropdown, 100) - 1);
}

/* ---- 过渡动画 ---- */
.fade-enter-active,
.fade-leave-active {
  transition: all var(--transition-normal, 250ms) ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
