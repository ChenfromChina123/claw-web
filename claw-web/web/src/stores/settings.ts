/**
 * 设置 Store
 * 管理用户设置和偏好的持久化存储
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { SettingsConfig, UserPreferences, ModelSettings, AgentSettings } from '@/types/settings'
import { SETTINGS_STORAGE_KEY } from '@/types/settings'
import type { ThemeName } from '@/themes/types'

/**
 * 默认设置配置
 */
const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'deepSpacePurple',
  language: 'zh-CN',
  streamResponse: true,
  soundEnabled: false,
  showFlowVisualization: true,
  showKnowledgeCards: true,
  useEnhancedToolDisplay: true,
}

const DEFAULT_MODEL: ModelSettings = {
  model: 'qwen-plus',
  temperature: 0.7,
  maxTokens: 4096,
}

const DEFAULT_AGENT: AgentSettings = {
  maxIterations: 10,
  debugMode: false,
  timeout: 300,
}

/**
 * 从 localStorage 加载设置
 */
function loadSettingsFromStorage(): SettingsConfig | null {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!stored) return null
    return JSON.parse(stored) as SettingsConfig
  } catch (error) {
    console.error('Failed to load settings from storage:', error)
    return null
  }
}

/**
 * 保存设置到 localStorage
 */
function saveSettingsToStorage(settings: SettingsConfig): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    console.error('Failed to save settings to storage:', error)
  }
}

export const useSettingsStore = defineStore('settings', () => {
  // 初始化时从 localStorage 加载设置
  const storedSettings = loadSettingsFromStorage()

  // 用户偏好设置
  const preferences = ref<UserPreferences>({
    ...DEFAULT_PREFERENCES,
    ...storedSettings?.preferences,
  })

  // 模型设置
  const model = ref<ModelSettings>({
    ...DEFAULT_MODEL,
    ...storedSettings?.model,
  })

  // Agent 设置
  const agent = ref<AgentSettings>({
    ...DEFAULT_AGENT,
    ...storedSettings?.agent,
  })

  /**
   * 保存所有设置到 localStorage
   */
  function saveSettings(): void {
    const settings: SettingsConfig = {
      preferences: preferences.value,
      model: model.value,
      agent: agent.value,
    }
    saveSettingsToStorage(settings)
  }

  /**
   * 更新主题设置
   * @param theme 主题 ID
   */
  function setTheme(theme: ThemeName): void {
    preferences.value.theme = theme
    saveSettings()
  }

  /**
   * 更新语言设置
   * @param language 语言代码
   */
  function setLanguage(language: string): void {
    preferences.value.language = language
    saveSettings()
  }

  /**
   * 更新流式响应设置
   * @param enabled 是否启用
   */
  function setStreamResponse(enabled: boolean): void {
    preferences.value.streamResponse = enabled
    saveSettings()
  }

  /**
   * 更新声音提示设置
   * @param enabled 是否启用
   */
  function setSoundEnabled(enabled: boolean): void {
    preferences.value.soundEnabled = enabled
    saveSettings()
  }

  /**
   * 更新默认模型
   * @param modelName 模型名称
   */
  function setModel(modelName: string): void {
    model.value.model = modelName
    saveSettings()
  }

  /**
   * 更新温度参数
   * @param temp 温度值
   */
  function setTemperature(temp: number): void {
    model.value.temperature = temp
    saveSettings()
  }

  /**
   * 更新最大 Token 数
   * @param tokens Token 数量
   */
  function setMaxTokens(tokens: number): void {
    model.value.maxTokens = tokens
    saveSettings()
  }

  /**
   * 更新 Agent 最大循环次数
   * @param iterations 最大循环次数
   */
  function setMaxIterations(iterations: number): void {
    agent.value.maxIterations = iterations
    saveSettings()
  }

  /**
   * 更新 Agent 调试模式
   * @param enabled 是否启用
   */
  function setAgentDebugMode(enabled: boolean): void {
    agent.value.debugMode = enabled
    saveSettings()
  }

  /**
   * 更新 Agent 超时时间
   * @param seconds 超时秒数
   */
  function setAgentTimeout(seconds: number): void {
    agent.value.timeout = seconds
    saveSettings()
  }

  /**
   * 重置所有设置为默认值
   */
  function resetSettings(): void {
    preferences.value = { ...DEFAULT_PREFERENCES }
    model.value = { ...DEFAULT_MODEL }
    agent.value = { ...DEFAULT_AGENT }
    saveSettings()
  }

  /**
   * 获取完整设置配置
   */
  function getSettings(): SettingsConfig {
    return {
      preferences: preferences.value,
      model: model.value,
      agent: agent.value,
    }
  }

  // 监听设置变化并自动保存
  watch(
    [preferences, model, agent],
    () => {
      saveSettings()
    },
    { deep: true }
  )

  return {
    // 状态
    preferences,
    model,
    agent,

    // 设置方法
    setTheme,
    setLanguage,
    setStreamResponse,
    setSoundEnabled,
    setModel,
    setTemperature,
    setMaxTokens,
    setMaxIterations,
    setAgentDebugMode,
    setAgentTimeout,

    // 其他方法
    resetSettings,
    getSettings,
    saveSettings,
  }
})
