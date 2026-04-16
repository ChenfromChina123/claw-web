/**
 * 特性开关配置文件
 *
 * 开发环境默认：
 *   - PTY Shell（连接后端真实终端）：启用
 *   - 所有特性：启用
 *
 * 生产环境（import.meta.env.PROD === true）默认：
 *   - PTY Shell：禁用（默认 fallback 到本地演示模式）
 *   - 其他特性：可按需调整
 *
 * 环境变量优先级高于默认值：
 *   VITE_FEATURE_PTY_SHELL=true|false
 *   VITE_DEV_MODE=true|false（强制覆盖是否为"开发模式"判断）
 */

export interface FeatureConfig {
  ptyShell: {
    /** 是否启用后端真实 PTY Shell */
    enabled: boolean
    /** 启用时的默认 shell 类型 */
    defaultShell: 'powershell' | 'cmd' | 'bash' | 'auto'
    /** 终端默认列数 */
    defaultCols: number
    /** 终端默认行数 */
    defaultRows: number
  }
  /** 是否为开发模式（影响默认值判断，可被 VITE_DEV_MODE 环境变量覆盖） */
  isDevMode: boolean
}

function resolvePtyEnabled(): boolean {
  // 显式环境变量优先
  if (import.meta.env.VITE_FEATURE_PTY_SHELL !== undefined) {
    return import.meta.env.VITE_FEATURE_PTY_SHELL === 'true'
  }
  // 开发模式默认开启，生产模式默认关闭
  return import.meta.env.DEV === true
}

function resolveIsDevMode(): boolean {
  if (import.meta.env.VITE_DEV_MODE !== undefined) {
    return import.meta.env.VITE_DEV_MODE === 'true'
  }
  return import.meta.env.DEV === true
}

export const featureConfig: FeatureConfig = {
  ptyShell: {
    enabled: resolvePtyEnabled(),
    // Windows 平台默认使用 PowerShell，其他平台使用 bash
    defaultShell: navigator.platform.includes('Win') ? 'powershell' : 'bash',
    defaultCols: 120,
    defaultRows: 30,
  },
  isDevMode: resolveIsDevMode(),
}

// 便捷导出（可直接 import { IS_PTY_ENABLED } from '@/config/features'）
export const IS_PTY_ENABLED = featureConfig.ptyShell.enabled
export const IS_DEV_MODE = featureConfig.isDevMode
