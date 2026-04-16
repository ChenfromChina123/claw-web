/**
 * 主题类型定义
 * 定义主题配置的完整接口和枚举
 */

/** 主题名称枚举 */
export type ThemeName =
  | 'deepSpacePurple'    // 深空紫
  | 'midnightBlue'       // 暗夜蓝
  | 'cyberpunk'          // 赛博朋克
  | 'auroraGreen'        // 极光绿
  | 'lightMode'          // 日间模式
  | 'darkLuxury';        // 暗黑奢华

/** 颜色配置 */
export interface ThemeColors {
  /** 主色调 */
  primary: string;
  primaryHover: string;
  primaryPressed: string;
  primaryLight: string;

  /** 成功色 */
  success: string;
  successLight: string;

  /** 警告色 */
  warning: string;
  warningLight: string;

  /** 错误色 */
  error: string;
  errorLight: string;

  /** 信息色 */
  info: string;
  infoLight: string;
}

/** 背景配置 */
export interface ThemeBackground {
  /** 主背景色 */
  primary: string;
  /** 次要背景色 */
  secondary: string;
  /** 第三级背景色 */
  tertiary: string;
  /** 卡片背景色 */
  card: string;
  /** 悬停背景色 */
  hover: string;
  /** 选中背景色 */
  active: string;
}

/** 文本颜色配置 */
export interface ThemeText {
  /** 主要文本 */
  primary: string;
  /** 次要文本 */
  secondary: string;
  /** 禁用文本 */
  disabled: string;
  /** 链接文本 */
  link: string;
  /** 特殊强调文本（如代码） */
  accent: string;
}

/** 边框配置 */
export interface ThemeBorder {
  /** 默认边框 */
  color: string;
  /** 浅色边框 */
  light: string;
  /** 强调边框 */
  accent: string;
  /** 圆角大小 */
  radius: string;
}

/** 阴影配置 */
export interface ThemeShadow {
  /** 小阴影 */
  sm: string;
  /** 中等阴影 */
  md: string;
  /** 大阴影 */
  lg: string;
  /** 发光效果（用于按钮、输入框聚焦） */
  glow: string;
}

/** 渐变配置 */
export interface ThemeGradient {
  /** 主渐变（用于按钮、重要元素） */
  primary: string;
  /** 次要渐变 */
  secondary: string;
  /** 背景渐变 */
  background: string;
  /** 文字渐变（用于标题） */
  text: string;
}

/** 玻璃态效果配置 */
export interface ThemeGlass {
  /** 背景色（半透明） */
  background: string;
  /** 模糊程度 */
  blur: string;
  /** 边框色（半透明） */
  border: string;
  /** 阴影 */
  shadow: string;
}

/** 完整主题配置 */
export interface ThemeConfig {
  /** 主题ID */
  id: ThemeName;
  /** 主题显示名称 */
  name: string;
  /** 主题图标/emoji */
  icon: string;
  /** 主题描述 */
  description: string;
  /** 是否为暗色主题 */
  isDark: boolean;
  /** 颜色配置 */
  colors: ThemeColors;
  /** 背景配置 */
  background: ThemeBackground;
  /** 文本配置 */
  text: ThemeText;
  /** 边框配置 */
  border: ThemeBorder;
  /** 阴影配置 */
  shadow: ThemeShadow;
  /** 渐变配置 */
  gradient: ThemeGradient;
  /** 玻璃态效果配置 */
  glass: ThemeGlass;
}
