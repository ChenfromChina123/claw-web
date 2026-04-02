/**
 * 主题管理 Hook
 * 提供主题切换、持久化、CSS 变量应用等功能
 */
import { watch, computed } from 'vue';
import type {
  ThemeConfig,
  ThemeName,
} from '../themes/types';
import {
  themes,
  defaultTheme,
  getThemeById,
} from '../themes/themes';
import { useSettingsStore } from '@/stores/settings';

/** 获取 settings store 实例 */
const settingsStore = useSettingsStore();

/** 当前主题状态（从 settings store 获取） */
const currentThemeId = computed<ThemeName>(() => {
  return settingsStore.preferences.theme;
});

/** 当前主题配置 */
const currentTheme = computed<ThemeConfig>(() => {
  return getThemeById(currentThemeId.value) || defaultTheme;
});

/**
 * 应用主题到 CSS 变量
 * 将主题配置转换为 CSS 自定义属性
 */
function applyThemeToCSS(theme: ThemeConfig): void {
  const root = document.documentElement;

  // 颜色变量
  root.style.setProperty('--color-primary', theme.colors.primary);
  root.style.setProperty('--color-primary-hover', theme.colors.primaryHover);
  root.style.setProperty('--color-primary-pressed', theme.colors.primaryPressed);
  root.style.setProperty('--color-primary-light', theme.colors.primaryLight);

  root.style.setProperty('--color-success', theme.colors.success);
  root.style.setProperty('--color-success-light', theme.colors.successLight);
  root.style.setProperty('--color-warning', theme.colors.warning);
  root.style.setProperty('--color-warning-light', theme.colors.warningLight);
  root.style.setProperty('--color-error', theme.colors.error);
  root.style.setProperty('--color-error-light', theme.colors.errorLight);
  root.style.setProperty('--color-info', theme.colors.info);
  root.style.setProperty('--color-info-light', theme.colors.infoLight);

  // 背景变量
  root.style.setProperty('--bg-primary', theme.background.primary);
  root.style.setProperty('--bg-secondary', theme.background.secondary);
  root.style.setProperty('--bg-tertiary', theme.background.tertiary);
  root.style.setProperty('--bg-card', theme.background.card);
  root.style.setProperty('--bg-hover', theme.background.hover);
  root.style.setProperty('--bg-active', theme.background.active);

  // 文本变量
  root.style.setProperty('--text-primary', theme.text.primary);
  root.style.setProperty('--text-secondary', theme.text.secondary);
  root.style.setProperty('--text-disabled', theme.text.disabled);
  root.style.setProperty('--text-link', theme.text.link);
  root.style.setProperty('--text-accent', theme.text.accent);

  // 边框变量
  root.style.setProperty('--border-color', theme.border.color);
  root.style.setProperty('--border-light', theme.border.light);
  root.style.setProperty('--border-accent', theme.border.accent);
  root.style.setProperty('--border-radius', theme.border.radius);

  // 阴影变量
  root.style.setProperty('--shadow-sm', theme.shadow.sm);
  root.style.setProperty('--shadow-md', theme.shadow.md);
  root.style.setProperty('--shadow-lg', theme.shadow.lg);
  root.style.setProperty('--shadow-glow', theme.shadow.glow);

  // 渐变变量
  root.style.setProperty('--gradient-primary', theme.gradient.primary);
  root.style.setProperty('--gradient-secondary', theme.gradient.secondary);
  root.style.setProperty('--gradient-background', theme.gradient.background);
  root.style.setProperty('--gradient-text', theme.gradient.text);

  // 玻璃态效果变量
  root.style.setProperty('--glass-bg', theme.glass.background);
  root.style.setProperty('--glass-blur', theme.glass.blur);
  root.style.setProperty('--glass-border', theme.glass.border);
  root.style.setProperty('--glass-shadow', theme.glass.shadow);

  // 设置暗色模式类
  if (theme.isDark) {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
}

/**
 * 切换主题
 * @param themeId 要切换的主题 ID
 */
function setTheme(themeId: ThemeName): void {
  settingsStore.setTheme(themeId);
}

/**
 * 获取 Naive UI 主题覆盖配置
 */
function getNaiveUiOverrides(theme: ThemeConfig): Record<string, unknown> {
  return {
    common: {
      primaryColor: theme.colors.primary,
      primaryColorHover: theme.colors.primaryHover,
      primaryColorPressed: theme.colors.primaryPressed,
      primaryColorSuppl: theme.colors.primaryLight,
      successColor: theme.colors.success,
      warningColor: theme.colors.warning,
      errorColor: theme.colors.error,
      infoColor: theme.colors.info,
      borderRadius: theme.border.radius,
      borderRadiusSmall: '8px',
      fontSize: '14px',
      fontSizeMedium: '14px',
      fontSizeLarge: '15px',
      fontSizeHuge: '16px',
    },
    Card: {
      color: theme.background.card,
      borderColor: theme.border.color,
      borderRadius: theme.border.radius,
    },
    Button: {
      colorPrimary: theme.colors.primary,
      colorHoverPrimary: theme.colors.primaryHover,
      colorPressedPrimary: theme.colors.primaryPressed,
      borderPrimary: 'none',
      borderHoverPrimary: 'none',
      borderPressedPrimary: 'none',
    },
    Input: {
      color: theme.background.tertiary,
      colorFocus: theme.background.tertiary,
      borderFocus: theme.colors.primary,
      borderHover: theme.colors.primaryLight,
      placeholderColor: theme.text.disabled,
      textColor: theme.text.primary,
      caretColor: theme.colors.primary,
      borderRadius: '10px',
    },
    Tag: {
      borderRadius: '6px',
    },
  };
}

// 初始化时应用默认主题
applyThemeToCSS(currentTheme.value);

// 监听主题变化并应用
watch(currentTheme, (newTheme) => {
  applyThemeToCSS(newTheme);
}, { immediate: true });

/**
 * 主题管理 Hook
 * @returns 主题管理相关的响应式数据和方法
 */
export function useTheme() {
  return {
    /** 当前主题ID */
    currentThemeId,
    /** 当前主题配置 */
    currentTheme,
    /** 所有可用主题列表 */
    themes: Object.values(themes),
    /** 默认主题 */
    defaultTheme,
    /**
     * 切换主题
     * @param themeId 目标主题ID
     */
    setTheme,
    /**
     * 获取 Naive UI 主题覆盖
     * @param theme 主题配置（可选，默认使用当前主题）
     */
    getNaiveUiOverrides,
  };
}
