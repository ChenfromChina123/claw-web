/**
 * 插件系统类型定义
 *
 * 定义插件接口、生命周期、事件等核心类型
 */

import type { Command } from '../../integrations/skillsAdapter'

/**
 * 插件类型枚举
 */
export enum PluginType {
  /** 工具插件 - 提供新工具 */
  TOOL = 'tool',
  /** 技能插件 - 提供技能/命令 */
  SKILL = 'skill',
  /** 主题插件 - 提供UI主题 */
  THEME = 'theme',
  /** 集成插件 - 集成外部服务 */
  INTEGRATION = 'integration',
  /** 增强插件 - 增强现有功能 */
  ENHANCEMENT = 'enhancement',
}

/**
 * 插件状态枚举
 */
export enum PluginStatus {
  /** 已安装但未启用 */
  INSTALLED = 'installed',
  /** 已启用 */
  ENABLED = 'enabled',
  /** 已禁用 */
  DISABLED = 'disabled',
  /** 加载中 */
  LOADING = 'loading',
  /** 错误 */
  ERROR = 'error',
}

/**
 * 插件清单 (manifest)
 */
export interface PluginManifest {
  /** 插件唯一标识 */
  id: string
  /** 插件名称 */
  name: string
  /** 插件版本 */
  version: string
  /** 插件描述 */
  description: string
  /** 插件作者 */
  author?: string
  /** 插件主页 */
  homepage?: string
  /** 插件类型 */
  type: PluginType
  /** 插件入口文件 */
  main: string
  /** 插件依赖 */
  dependencies?: Record<string, string>
  /** 插件元数据 */
  metadata?: Record<string, unknown>
  /** 是否需要认证 */
  requiresAuth?: boolean
  /** 插件配置 Schema */
  configSchema?: Record<string, ConfigSchemaProperty>
  /** 生命周期钩子 */
  hooks?: PluginHooks
}

/**
 * 插件配置属性 Schema
 */
export interface ConfigSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  description?: string
  default?: unknown
  required?: boolean
  enum?: unknown[]
}

/**
 * 插件配置
 */
export interface PluginConfig {
  [key: string]: unknown
}

/**
 * 插件接口
 */
export interface Plugin {
  /** 插件清单 */
  manifest: PluginManifest
  /** 插件状态 */
  status: PluginStatus
  /** 插件实例 */
  instance?: PluginInstance
  /** 安装时间 */
  installedAt?: number
  /** 启用时间 */
  enabledAt?: number
  /** 错误信息 */
  error?: string
}

/**
 * 插件实例接口
 */
export interface PluginInstance {
  /** 插件 ID */
  id: string
  /** 插件名称 */
  name: string
  /** 版本 */
  version: string

  /** 初始化插件 */
  onLoad?: (config: PluginConfig) => Promise<void> | void
  /** 启用插件 */
  onEnable?: () => Promise<boolean> | boolean
  /** 禁用插件 */
  onDisable?: () => Promise<void> | void
  /** 卸载插件 */
  onUninstall?: () => Promise<void> | void
  /** 获取提供的工具 */
  getTools?: () => PluginTool[]
  /** 获取提供的技能 */
  getSkills?: () => Command[]
  /** 获取主题配置 */
  getTheme?: () => PluginTheme
  /** 执行操作 */
  execute?: (action: string, params: unknown) => Promise<unknown>
}

/**
 * 插件工具定义
 */
export interface PluginTool {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 工具输入 Schema */
  inputSchema?: {
    type: 'object'
    properties: Record<string, {
      type: string
      description?: string
    }>
    required?: string[]
  }
  /** 工具处理函数 */
  handler: (params: unknown) => Promise<PluginToolResult>
}

/**
 * 插件工具执行结果
 */
export interface PluginToolResult {
  success: boolean
  output?: string
  error?: string
  metadata?: Record<string, unknown>
}

/**
 * 插件主题定义
 */
export interface PluginTheme {
  id: string
  name: string
  type: 'light' | 'dark' | 'auto'
  variables?: Record<string, string>
  styles?: string
}

/**
 * 插件生命周期钩子
 */
export interface PluginHooks {
  /** Agent 启动前 */
  beforeAgentStart?: (context: PluginHookContext) => Promise<void> | void
  /** Agent 启动后 */
  afterAgentStart?: (context: PluginHookContext) => Promise<void> | void
  /** 工具调用前 */
  beforeToolCall?: (context: PluginToolHookContext) => Promise<void> | void
  /** 工具调用后 */
  afterToolCall?: (context: PluginToolHookContext) => Promise<void> | void
  /** 消息处理前 */
  beforeMessage?: (context: PluginMessageHookContext) => Promise<string | void> | string | void
  /** 消息处理后 */
  afterMessage?: (context: PluginMessageHookContext) => Promise<void> | void
  /** 会话创建 */
  onSessionCreate?: (context: PluginSessionHookContext) => Promise<void> | void
  /** 会话关闭 */
  onSessionClose?: (context: PluginSessionHookContext) => Promise<void> | void
  /** 错误处理 */
  onError?: (context: PluginErrorHookContext) => Promise<void> | void
}

/**
 * 插件钩子上下文基类
 */
export interface PluginHookContext {
  pluginId: string
  agentId?: string
  sessionId?: string
  userId?: string
  timestamp: number
  metadata?: Record<string, unknown>
}

/**
 * 工具钩子上下文
 */
export interface PluginToolHookContext extends PluginHookContext {
  toolName: string
  toolInput: Record<string, unknown>
  toolResult?: {
    success: boolean
    result?: unknown
    error?: string
  }
  duration?: number
}

/**
 * 消息钩子上下文
 */
export interface PluginMessageHookContext extends PluginHookContext {
  message: string
  role: 'user' | 'assistant'
}

/**
 * 会话钩子上下文
 */
export interface PluginSessionHookContext extends PluginHookContext {
  sessionName?: string
}

/**
 * 错误钩子上下文
 */
export interface PluginErrorHookContext extends PluginHookContext {
  error: string
  errorType: 'runtime' | 'timeout' | 'permission' | 'unknown'
}

/**
 * 插件市场条目
 */
export interface PluginMarketItem {
  id: string
  name: string
  description: string
  version: string
  author: string
  homepage?: string
  downloads: number
  rating?: number
  tags: string[]
  manifest: PluginManifest
}

/**
 * 插件安装选项
 */
export interface PluginInstallOptions {
  /** 是否启用 */
  enable?: boolean
  /** 配置 */
  config?: PluginConfig
  /** 跳过验证 */
  skipValidation?: boolean
}

/**
 * 插件验证结果
 */
export interface PluginValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}
