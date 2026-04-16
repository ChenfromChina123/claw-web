import { setMainLoopModelOverride } from '../bootstrap/state.js'
import {
  clearApiKeyHelperCache,
  clearAwsCredentialsCache,
  clearGcpCredentialsCache,
} from '../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../utils/config.js'
import { toError } from '../utils/errors.js'
import { logError } from '../utils/log.js'
import { applyConfigEnvironmentVariables } from '../utils/managedEnv.js'
import {
  permissionModeFromString,
  toExternalPermissionMode,
} from '../utils/permissions/PermissionMode.js'
import {
  notifyPermissionModeChanged,
  notifySessionMetadataChanged,
  type SessionExternalMetadata,
} from '../utils/sessionState.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import type { AppState } from './AppStateStore.js'

// Worker 重启时的逆推送 — 恢复。
export function externalMetadataToAppState(
  metadata: SessionExternalMetadata,
): (prev: AppState) => AppState {
  return prev => ({
    ...prev,
    ...(typeof metadata.permission_mode === 'string'
      ? {
          toolPermissionContext: {
            ...prev.toolPermissionContext,
            mode: permissionModeFromString(metadata.permission_mode),
          },
        }
      : {}),
    ...(typeof metadata.is_ulttraplan_mode === 'boolean'
      ? { isUltraplanMode: metadata.is_ultraplan_mode }
      : {}),
  })
}

export function onChangeAppState({
  newState,
  oldState,
}: {
  newState: AppState
  oldState: AppState
}) {
  // toolPermissionContext.mode — CCR/SDK 模式同步的单一关卡。
  //
  // 在此块之前，模式变更仅通过 2/8+ 变异路径中继到 CCR：
  // print.ts 中的自定义 setAppState 包装器（仅限 headless/SDK 模式）
  // 和 set_permission_mode 处理程序中的手动通知。
  // 每个其他路径 — Shift+Tab 循环、ExitPlanModePermissionRequest
  // 对话框选项、/plan slash 命令、重放、REPL bridge 的
  // onSetPermissionMode — 变更 AppState 而不通知
  // CCR，导致 external_metadata.permission_mode 过期和 Web UI 与
  // CLI 的实际模式不同步。
  //
  // 在这里挂载差异意味着任何变更模式的 setAppState 调用都会通知
  // CCR（通过 notifySessionMetadataChanged → ccrClient.reportMetadata）
  // 和 SDK 状态流（通过 notifyPermissionModeChanged → 在 print.ts 中注册）。
  // 上述分散的调用点无需更改。
  const prevMode = oldState.toolPermissionContext.mode
  const newMode = newState.toolPermissionContext.mode
  if (prevMode !== newMode) {
    // CCR external_metadata 不得接收仅内部模式名称
    //（bubble、ungated auto）。先外部化 — 然后跳过
    // 如果外部模式未变更则不通知 CCR（例如，
    // default→bubble→default 对于 CCR 来说是噪音，因为两者
    // 都外部化为 'default'）。SDK 通道（notifyPermissionModeChanged）
    // 传递原始模式；print.ts 中的监听器应用自己的过滤器。
    const prevExternal = toExternalPermissionMode(prevMode)
    const newExternal = toExternalPermissionMode(newMode)
    if (prevExternal !== newExternal) {
      // Ultraplan = 第一个计划周期。初始 control_request
      // 原子地设置模式和 isUltraplanMode，所以标志的
      // 转换门控它。null 按 RFC 7396（删除键）。
      const isUltraplan =
        newExternal === 'plan' &&
        newState.isUltraplanMode &&
        !oldState.isUltraplanMode
          ? true
          : null
      notifySessionMetadataChanged({
        permission_mode: newExternal,
        is_ultraplan_mode: isUltraplan,
      })
    }
    notifyPermissionModeChanged(newMode)
  }

  // mainLoopModel: 从设置中移除？
  if (
    newState.mainLoopModel !== oldState.mainLoopModel &&
    newState.mainLoopModel === null
  ) {
    // 从设置中移除
    updateSettingsForSource('userSettings', { model: undefined })
    setMainLoopModelOverride(null)
  }

  // mainLoopModel: 添加到设置？
  if (
    newState.mainLoopModel !== oldState.mainLoopModel &&
    newState.mainLoopModel !== null
  ) {
    // 保存到设置
    updateSettingsForSource('userSettings', { model: newState.mainLoopModel })
    setMainLoopModelOverride(newState.mainLoopModel)
  }

  // expandedView → 为向后兼容持久化为 showExpandedTodos + showSpinnerTree
  if (newState.expandedView !== oldState.expandedView) {
    const showExpandedTodos = newState.expandedView === 'tasks'
    const showSpinnerTree = newState.expandedView === 'teammates'
    if (
      getGlobalConfig().showExpandedTodos !== showExpandedTodos ||
      getGlobalConfig().showSpinnerTree !== showSpinnerTree
    ) {
      saveGlobalConfig(current => ({
        ...current,
        showExpandedTodos,
        showSpinnerTree,
      }))
    }
  }

  // verbose
  if (
    newState.verbose !== oldState.verbose &&
    getGlobalConfig().verbose !== newState.verbose
  ) {
    const verbose = newState.verbose
    saveGlobalConfig(current => ({
      ...current,
      verbose,
    }))
  }

  // tungstenPanelVisible（仅 ant 的 tmux 面板粘性切换）
  if (process.env.USER_TYPE === 'ant') {
    if (
      newState.tungstenPanelVisible !== oldState.tungstenPanelVisible &&
      newState.tungstenPanelVisible !== undefined &&
      getGlobalConfig().tungstenPanelVisible !== newState.tungstenPanelVisible
    ) {
      const tungstenPanelVisible = newState.tungstenPanelVisible
      saveGlobalConfig(current => ({ ...current, tungstenPanelVisible }))
    }
  }

  // 设置变更时清除认证相关缓存
  // 这确保 apiKeyHelper 和 AWS/GCP 凭证变更立即生效
  if (newState.settings !== oldState.settings) {
    try {
      clearApiKeyHelperCache()
      clearAwsCredentialsCache()
      clearGcpCredentialsCache()

      // 当 settings.env 变更时重新应用环境变量
      // 这是纯添加的：新变量被添加，现有变量可能被覆盖，不删除任何内容
      if (newState.settings.env !== oldState.settings.env) {
        applyConfigEnvironmentVariables()
      }
    } catch (error) {
      logError(toError(error))
    }
  }
}
