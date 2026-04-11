/**
 * 主题系统导出
 * 统一导出所有主题相关的类型、配置和工具函数
 */
export type {
  ThemeConfig,
  ThemeName,
  ThemeColors,
  ThemeBackground,
  ThemeText,
  ThemeBorder,
  ThemeShadow,
  ThemeGradient,
  ThemeGlass,
} from './types';

export {
  themes,
  defaultTheme,
  getThemeList,
  getThemeById,
  deepSpacePurple,
  midnightBlue,
  cyberpunk,
  auroraGreen,
  lightMode,
  darkLuxury,
} from './themes';
