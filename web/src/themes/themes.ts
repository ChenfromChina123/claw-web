/**
 * 主题定义
 * 包含6套专业级主题配色方案
 */
import type { ThemeConfig } from './types';

/**
 * 🌌 深空紫 (Deep Space Purple) - 默认主题
 * 科技感强，适合开发者工具
 */
export const deepSpacePurple: ThemeConfig = {
  id: 'deepSpacePurple',
  name: '深空紫',
  icon: '🌌',
  description: '科技感强，深邃神秘',
  isDark: true,
  colors: {
    primary: '#6366f1',
    primaryHover: '#818cf8',
    primaryPressed: '#4f46e5',
    primaryLight: 'rgba(99, 102, 241, 0.1)',
    success: '#22c55e',
    successLight: 'rgba(34, 197, 94, 0.1)',
    warning: '#f59e0b',
    warningLight: 'rgba(245, 158, 11, 0.1)',
    error: '#ef4444',
    errorLight: 'rgba(239, 68, 68, 0.1)',
    info: '#3b82f6',
    infoLight: 'rgba(59, 130, 246, 0.1)',
  },
  background: {
    primary: '#0a0a0f',
    secondary: '#13131a',
    tertiary: '#1a1a24',
    card: '#16161e',
    hover: 'rgba(99, 102, 241, 0.08)',
    active: 'rgba(99, 102, 241, 0.15)',
  },
  text: {
    primary: '#f8fafc',
    secondary: '#94a3b8',
    disabled: '#64748b',
    link: '#818cf8',
    accent: '#a5b4fc',
  },
  border: {
    color: '#2d2d3a',
    light: 'rgba(99, 102, 241, 0.12)',
    accent: '#6366f1',
    radius: '12px',
  },
  shadow: {
    sm: '0 2px 8px rgba(0, 0, 0, 0.3)',
    md: '0 4px 16px rgba(0, 0, 0, 0.4)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.5)',
    glow: '0 0 20px rgba(99, 102, 241, 0.3)',
  },
  gradient: {
    primary: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    secondary: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
    background: 'linear-gradient(135deg, #0a0a0f 0%, #13131a 50%, #1a1a24 100%)',
    text: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
  },
  glass: {
    background: 'rgba(22, 22, 30, 0.7)',
    blur: '20px',
    border: 'rgba(99, 102, 241, 0.15)',
    shadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
};

/**
 * 🌙 暗夜蓝 (Midnight Blue) - 专业沉稳
 * 适合长时间使用，护眼舒适
 */
export const midnightBlue: ThemeConfig = {
  id: 'midnightBlue',
  name: '暗夜蓝',
  icon: '🌙',
  description: '专业沉稳，护眼舒适',
  isDark: true,
  colors: {
    primary: '#3b82f6',
    primaryHover: '#60a5fa',
    primaryPressed: '#2563eb',
    primaryLight: 'rgba(59, 130, 246, 0.1)',
    success: '#10b981',
    successLight: 'rgba(16, 185, 129, 0.1)',
    warning: '#f59e0b',
    warningLight: 'rgba(245, 158, 11, 0.1)',
    error: '#ef4444',
    errorLight: 'rgba(239, 68, 68, 0.1)',
    info: '#06b6d4',
    infoLight: 'rgba(6, 182, 212, 0.1)',
  },
  background: {
    primary: '#0c1222',
    secondary: '#151d2e',
    tertiary: '#1e293b',
    card: '#172033',
    hover: 'rgba(59, 130, 246, 0.08)',
    active: 'rgba(59, 130, 246, 0.15)',
  },
  text: {
    primary: '#f1f5f9',
    secondary: '#94a3b8',
    disabled: '#64748b',
    link: '#60a5fa',
    accent: '#93c5fd',
  },
  border: {
    color: '#1e3a5f',
    light: 'rgba(59, 130, 246, 0.12)',
    accent: '#3b82f6',
    radius: '12px',
  },
  shadow: {
    sm: '0 2px 8px rgba(0, 0, 0, 0.35)',
    md: '0 4px 16px rgba(0, 0, 0, 0.45)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.55)',
    glow: '0 0 20px rgba(59, 130, 246, 0.25)',
  },
  gradient: {
    primary: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    secondary: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)',
    background: 'linear-gradient(180deg, #0c1222 0%, #151d2e 100%)',
    text: 'linear-gradient(135deg, #3b82f6 0%, #818cf8 100%)',
  },
  glass: {
    background: 'rgba(23, 32, 51, 0.75)',
    blur: '20px',
    border: 'rgba(59, 130, 246, 0.15)',
    shadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
  },
};

/**
 * 🔥 赛博朋克 (Cyberpunk) - 霓虹灯效果
 * 未来科技感，鲜艳夺目
 */
export const cyberpunk: ThemeConfig = {
  id: 'cyberpunk',
  name: '赛博朋克',
  icon: '🔥',
  description: '霓虹效果，未来科技',
  isDark: true,
  colors: {
    primary: '#ff006e',
    primaryHover: '#ff4081',
    primaryPressed: '#e60063',
    primaryLight: 'rgba(255, 0, 110, 0.15)',
    success: '#00ff88',
    successLight: 'rgba(0, 255, 136, 0.1)',
    warning: '#ffbe0b',
    warningLight: 'rgba(255, 190, 11, 0.1)',
    error: '#ff0055',
    errorLight: 'rgba(255, 0, 85, 0.1)',
    info: '#00d9ff',
    infoLight: 'rgba(0, 217, 255, 0.1)',
  },
  background: {
    primary: '#0a0014',
    secondary: '#140026',
    tertiary: '#1a002e',
    card: '#160022',
    hover: 'rgba(255, 0, 110, 0.08)',
    active: 'rgba(255, 0, 110, 0.15)',
  },
  text: {
    primary: '#ffffff',
    secondary: '#b8b8d0',
    disabled: '#666680',
    link: '#ff4081',
    accent: '#00ffaa',
  },
  border: {
    color: '#2a0040',
    light: 'rgba(255, 0, 110, 0.2)',
    accent: '#ff006e',
    radius: '8px',
  },
  shadow: {
    sm: '0 2px 8px rgba(255, 0, 110, 0.2)',
    md: '0 4px 16px rgba(255, 0, 110, 0.3)',
    lg: '0 8px 32px rgba(255, 0, 110, 0.4)',
    glow: '0 0 25px rgba(255, 0, 110, 0.5)',
  },
  gradient: {
    primary: 'linear-gradient(135deg, #ff006e 0%, #8338ec 100%)',
    secondary: 'linear-gradient(135deg, #ff006e 0%, #00d9ff 100%)',
    background: 'linear-gradient(135deg, #0a0014 0%, #140026 50%, #1a002e 100%)',
    text: 'linear-gradient(135deg, #ff006e 0%, #00ffaa 100%)',
  },
  glass: {
    background: 'rgba(22, 0, 34, 0.75)',
    blur: '20px',
    border: 'rgba(255, 0, 110, 0.2)',
    shadow: '0 8px 32px rgba(255, 0, 110, 0.25)',
  },
};

/**
 * 💎 极光绿 (Aurora Green) - 清新现代
 * 自然清新，护眼环保
 */
export const auroraGreen: ThemeConfig = {
  id: 'auroraGreen',
  name: '极光绿',
  icon: '💎',
  description: '清新现代，自然舒适',
  isDark: true,
  colors: {
    primary: '#10b981',
    primaryHover: '#34d399',
    primaryPressed: '#059669',
    primaryLight: 'rgba(16, 185, 129, 0.1)',
    success: '#22c55e',
    successLight: 'rgba(34, 197, 94, 0.1)',
    warning: '#f59e0b',
    warningLight: 'rgba(245, 158, 11, 0.1)',
    error: '#ef4444',
    errorLight: 'rgba(239, 68, 68, 0.1)',
    info: '#06b6d4',
    infoLight: 'rgba(6, 182, 212, 0.1)',
  },
  background: {
    primary: '#040d0a',
    secondary: '#0a1a14',
    tertiary: '#122620',
    card: '#0e1e18',
    hover: 'rgba(16, 185, 129, 0.08)',
    active: 'rgba(16, 185, 129, 0.15)',
  },
  text: {
    primary: '#ecfdf5',
    secondary: '#94a3b8',
    disabled: '#64748b',
    link: '#34d399',
    accent: '#6ee7b7',
  },
  border: {
    color: '#1a3d32',
    light: 'rgba(16, 185, 129, 0.12)',
    accent: '#10b981',
    radius: '12px',
  },
  shadow: {
    sm: '0 2px 8px rgba(0, 0, 0, 0.3)',
    md: '0 4px 16px rgba(0, 0, 0, 0.4)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.5)',
    glow: '0 0 20px rgba(16, 185, 129, 0.3)',
  },
  gradient: {
    primary: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    secondary: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
    background: 'linear-gradient(135deg, #040d0a 0%, #0a1a14 50%, #122620 100%)',
    text: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
  },
  glass: {
    background: 'rgba(14, 30, 24, 0.75)',
    blur: '20px',
    border: 'rgba(16, 185, 129, 0.15)',
    shadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },
};

/**
 * ☀️ 日间模式 (Light Mode) - 明亮清爽
 * 明亮舒适，适合白天使用
 */
export const lightMode: ThemeConfig = {
  id: 'lightMode',
  name: '日间模式',
  icon: '☀️',
  description: '明亮清爽，舒适自然',
  isDark: false,
  colors: {
    primary: '#6366f1',
    primaryHover: '#818cf8',
    primaryPressed: '#4f46e5',
    primaryLight: 'rgba(99, 102, 241, 0.1)',
    success: '#22c55e',
    successLight: 'rgba(34, 197, 94, 0.1)',
    warning: '#f59e0b',
    warningLight: 'rgba(245, 158, 11, 0.1)',
    error: '#ef4444',
    errorLight: 'rgba(239, 68, 68, 0.1)',
    info: '#3b82f6',
    infoLight: 'rgba(59, 130, 246, 0.1)',
  },
  background: {
    primary: '#ffffff',
    secondary: '#f8fafc',
    tertiary: '#f1f5f9',
    card: '#ffffff',
    hover: 'rgba(99, 102, 241, 0.04)',
    active: 'rgba(99, 102, 241, 0.08)',
  },
  text: {
    primary: '#0f172a',
    secondary: '#64748b',
    disabled: '#94a3b8',
    link: '#6366f1',
    accent: '#4f46e5',
  },
  border: {
    color: '#e2e8f0',
    light: 'rgba(99, 102, 241, 0.15)',
    accent: '#6366f1',
    radius: '12px',
  },
  shadow: {
    sm: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
    md: '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
    glow: '0 0 20px rgba(99, 102, 241, 0.15)',
  },
  gradient: {
    primary: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    secondary: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
    background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
    text: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
  },
  glass: {
    background: 'rgba(255, 255, 255, 0.7)',
    blur: '20px',
    border: 'rgba(99, 102, 241, 0.15)',
    shadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
  },
};

/**
 * 🎭 暗黑奢华 (Dark Luxury) - 高端质感
 * 精致优雅，高端大气
 */
export const darkLuxury: ThemeConfig = {
  id: 'darkLuxury',
  name: '暗黑奢华',
  icon: '🎭',
  description: '精致优雅，高端质感',
  isDark: true,
  colors: {
    primary: '#d4af37',
    primaryHover: '#e5c158',
    primaryPressed: '#b8960f',
    primaryLight: 'rgba(212, 175, 55, 0.1)',
    success: '#4ade80',
    successLight: 'rgba(74, 222, 128, 0.1)',
    warning: '#fbbf24',
    warningLight: 'rgba(251, 191, 36, 0.1)',
    error: '#f87171',
    errorLight: 'rgba(248, 113, 113, 0.1)',
    info: '#38bdf8',
    infoLight: 'rgba(56, 189, 248, 0.1)',
  },
  background: {
    primary: '#090807',
    secondary: '#141210',
    tertiary: '#1c1916',
    card: '#181614',
    hover: 'rgba(212, 175, 55, 0.06)',
    active: 'rgba(212, 175, 55, 0.12)',
  },
  text: {
    primary: '#fafaf9',
    secondary: '#a8a29e',
    disabled: '#78716c',
    link: '#e5c158',
    accent: '#d4af37',
  },
  border: {
    color: '#292524',
    light: 'rgba(212, 175, 55, 0.12)',
    accent: '#d4af37',
    radius: '12px',
  },
  shadow: {
    sm: '0 2px 8px rgba(0, 0, 0, 0.4)',
    md: '0 4px 16px rgba(0, 0, 0, 0.5)',
    lg: '0 8px 32px rgba(0, 0, 0, 0.6)',
    glow: '0 0 20px rgba(212, 175, 55, 0.25)',
  },
  gradient: {
    primary: 'linear-gradient(135deg, #d4af37 0%, #f59e0b 100%)',
    secondary: 'linear-gradient(135deg, #d4af37 0%, #ef4444 100%)',
    background: 'linear-gradient(135deg, #090807 0%, #141210 50%, #1c1916 100%)',
    text: 'linear-gradient(135deg, #d4af37 0%, #f59e0b 100%)',
  },
  glass: {
    background: 'rgba(24, 22, 20, 0.8)',
    blur: '25px',
    border: 'rgba(212, 175, 55, 0.15)',
    shadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  },
};

/** 所有主题映射表 */
export const themes: Record<string, ThemeConfig> = {
  deepSpacePurple,
  midnightBlue,
  cyberpunk,
  auroraGreen,
  lightMode,
  darkLuxury,
};

/** 默认主题 */
export const defaultTheme = deepSpacePurple;

/** 获取所有主题列表（用于选择器） */
export function getThemeList(): ThemeConfig[] {
  return Object.values(themes);
}

/** 根据ID获取主题 */
export function getThemeById(id: string): ThemeConfig | undefined {
  return themes[id];
}
