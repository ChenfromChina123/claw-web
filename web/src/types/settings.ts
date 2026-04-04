/**
 * 设置相关类型定义
 */
import type { ThemeName } from '@/themes/types'

/**
 * 用户偏好设置接口
 */
export interface UserPreferences {
  /** 主题 ID */
  theme: ThemeName
  /** 语言设置 */
  language: string
  /** 是否启用流式响应 */
  streamResponse: boolean
  /** 是否启用声音提示 */
  soundEnabled: boolean
  /** 是否显示流程图 */
  showFlowVisualization: boolean
  /** 是否显示知识卡片 */
  showKnowledgeCards: boolean
  /** 是否使用增强工具展示 */
  useEnhancedToolDisplay: boolean
}

/**
 * 模型设置接口
 */
export interface ModelSettings {
  /** 默认模型 */
  model: string
  /** 温度参数 */
  temperature: number
  /** 最大 Token 数 */
  maxTokens: number
}

/**
 * 完整设置配置接口
 */
export interface SettingsConfig {
  /** 用户偏好设置 */
  preferences: UserPreferences
  /** 模型设置 */
  model: ModelSettings
}

/**
 * 设置存储键名
 */
export const SETTINGS_STORAGE_KEY = 'claude-code-settings'
