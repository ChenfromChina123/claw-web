/**
 * 工具注册中心类型定义
 *
 * 功能：
 * - 定义所有工具相关的接口类型
 * - 提供常量配置
 * - 统一类型导出
 */

// ==================== 生命周期事件类型 ====================

/**
 * 工具生命周期事件类型
 */
export type ToolLifecycleEvent = 
  | 'tool.registered'
  | 'tool.unregistered'
  | 'tool.enabled'
  | 'tool.disabled'
  | 'tool.enabled_changed'
  | 'tool.loaded'
  | 'tool.execution_started'
  | 'tool.execution_progress'
  | 'tool.execution_completed'
  | 'tool.execution_failed'
  | 'tool.error'
  | 'tool.mcp_registered'
  | 'tool.mcp_removed'
  | 'tool_start'
  | 'tool_end'

// ==================== 工具配置接口 ====================

/**
 * 工具注册配置
 */
export interface ToolRegistrationConfig {
  name: string
  displayName?: string
  description: string
  category: string
  inputSchema: Record<string, unknown>
  isReadOnly?: boolean
  isConcurrencySafe?: boolean
  aliases?: string[]
  permissions?: string[]
  handler?: (args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>
  dependencies?: string[]
  timeout?: number
}

/**
 * 工具依赖信息
 */
export interface ToolDependency {
  toolName: string
  version?: string
  loaded: boolean
  loadOrder: number
}

/**
 * 执行超时配置
 */
export interface ExecutionTimeoutConfig {
  defaultTimeout: number
  perToolTimeouts: Record<string, number>
  enableTimeout: boolean
}

/**
 * 已注册的工具
 */
export interface RegisteredTool {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  inputSchema: Record<string, unknown>
  source: 'builtin' | 'cli' | 'mcp' | 'custom'
  serverId?: string
  aliases: string[]
  isEnabled: boolean
  isReadOnly: boolean
  isConcurrencySafe: boolean
  permissions: string[]
  dependencies: string[]
  timeout: number
  handler?: (args: Record<string, unknown>) => Promise<{ success: boolean; result?: unknown; error?: string }>
}

/**
 * 工具执行请求
 */
export interface ToolExecutionRequest {
  toolName: string
  toolInput: Record<string, unknown>
  sessionId?: string
  context?: Record<string, unknown>
  timeout?: number
}

/**
 * 工具执行结果
 */
export interface ToolExecutionResult {
  id: string
  toolName: string
  success: boolean
  result?: unknown
  error?: string
  output?: string
  duration: number
  timestamp: number
  timedOut?: boolean
}

/**
 * 工具执行事件数据
 */
export interface ToolExecutionEvent {
  toolName: string
  executionId: string
  sessionId?: string
  input?: Record<string, unknown>
  result?: ToolExecutionResult
  error?: string
  duration?: number
  timedOut?: boolean
  progress?: {
    type: 'start' | 'progress' | 'complete' | 'error'
    data?: unknown
  }
  timestamp: number
}

/**
 * 工具权限
 */
export interface ToolPermission {
  toolName: string
  allow: boolean
  reason?: string
}

/**
 * 工具注册中心配置
 */
export interface ToolRegistryConfig {
  projectRoot: string
  enableCLI: boolean
  enableMCP: boolean
  enableCustom: boolean
  defaultEnabled: boolean
  permissions?: ToolPermission[]
  defaultTimeout?: number
  enableTimeoutControl?: boolean
}

// ==================== 工具类别常量 ====================

/**
 * 工具类别定义
 */
export const TOOL_CATEGORIES = {
  FILE: { id: 'file', name: '文件操作', icon: 'file' },
  SHELL: { id: 'shell', name: 'Shell 命令', icon: 'terminal' },
  WEB: { id: 'web', name: '网络工具', icon: 'globe' },
  TASK: { id: 'task', name: '任务管理', icon: 'check-square' },
  AGENT: { id: 'agent', name: 'Agent', icon: 'bot' },
  MCP: { id: 'mcp', name: 'MCP', icon: 'plug' },
  SKILL: { id: 'skill', name: '技能', icon: 'star' },
  SYSTEM: { id: 'system', name: '系统', icon: 'settings' },
  PLAN: { id: 'plan', name: '计划模式', icon: 'map' },
  TEAM: { id: 'team', name: '团队协作', icon: 'users' },
  CRON: { id: 'cron', name: '定时任务', icon: 'clock' },
  DEVELOPMENT: { id: 'development', name: '开发工具', icon: 'code' },
  DATABASE: { id: 'database', name: '数据库', icon: 'database' },
  DEVOPS: { id: 'devops', name: 'DevOps', icon: 'container' },
  VCS: { id: 'vcs', name: '版本控制', icon: 'git' },
  CLOUD: { id: 'cloud', name: '云服务', icon: 'cloud' },
  OTHER: { id: 'other', name: '其他', icon: 'box' },
} as const

export type ToolCategoryId = typeof TOOL_CATEGORIES[keyof typeof TOOL_CATEGORIES]['id']

// ==================== 权限级别常量 ====================

/**
 * 权限级别定义
 */
export const PERMISSION_LEVELS = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
  EXECUTE: 3,
  ADMIN: 4,
} as const

// ==================== 运行时类型元数据（供测试使用）====================

/**
 * 运行时类型信息
 */
export const _registryTypeMetadata = {
  interfaces: [
    'ToolRegistrationConfig',
    'ToolDependency',
    'ExecutionTimeoutConfig',
    'RegisteredTool',
    'ToolExecutionRequest',
    'ToolExecutionResult',
    'ToolExecutionEvent',
    'ToolPermission',
    'ToolRegistryConfig'
  ],
  typeAliases: [
    'ToolLifecycleEvent',
    'ToolCategoryId'
  ],
  constants: [
    'TOOL_CATEGORIES',
    'PERMISSION_LEVELS'
  ]
} as const

// 为了兼容性，导出类型名称字符串（运行时可访问）
export const ToolRegistrationConfig = 'ToolRegistrationConfig' as any
export const ToolDependency = 'ToolDependency' as any
export const ExecutionTimeoutConfig = 'ExecutionTimeoutConfig' as any
export const RegisteredTool = 'RegisteredTool' as any
export const ToolExecutionRequest = 'ToolExecutionRequest' as any
export const ToolExecutionResult = 'ToolExecutionResult' as any
export const ToolExecutionEvent = 'ToolExecutionEvent' as any
export const ToolPermission = 'ToolPermission' as any
export const ToolRegistryConfig = 'ToolRegistryConfig' as any
