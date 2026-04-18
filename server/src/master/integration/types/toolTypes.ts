/**
 * 工具执行器类型定义
 *
 * 功能：
 * - 定义所有工具相关的接口类型
 * - 提供默认配置常量
 * - 统一类型导出
 */

import type { EventSender } from '../integration/webStore'

// ==================== 执行上下文 ====================

/**
 * 工具执行上下文
 */
export interface ToolExecutionContext {
  /** 用户ID */
  userId: string
  /** 会话ID（可选） */
  sessionId?: string
  /** 项目根目录 */
  projectRoot: string
  /** 工作目录（可选） */
  workingDirectory?: string
  /** 是否启用沙箱 */
  sandboxed?: boolean
  /** 允许访问的路径列表 */
  allowedPaths?: string[]
  /** 禁止访问的路径列表 */
  deniedPaths?: string[]
  /** 允许使用的工具列表 */
  allowedTools?: string[]
  /** 禁止使用的工具列表 */
  deniedTools?: string[]
  /** 最大执行时间（毫秒） */
  maxExecutionTime?: number
  /** 中断信号，用于取消长时间运行的操作 */
  abortSignal?: AbortSignal
}

// ==================== 执行结果 ====================

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 是否成功 */
  success: boolean
  /** 返回结果数据 */
  result?: unknown
  /** 错误信息 */
  error?: string
  /** 输出内容 */
  output?: string
  /** 元数据 */
  metadata?: {
    /** 执行时长（毫秒） */
    duration?: number
    /** Token 消耗数 */
    tokens?: number
    /** 费用 */
    cost?: number
    /** 是否在沙箱中执行 */
    sandboxed?: boolean
  }
}

// ==================== 权限系统 ====================

/**
 * 权限级别
 */
export type PermissionLevel = 'none' | 'read' | 'write' | 'execute' | 'admin'

/**
 * 用户权限配置
 */
export interface UserPermissions {
  /** 权限级别 */
  level: PermissionLevel
  /** 允许的工具列表 */
  allowedTools: string[]
  /** 禁止的工具列表 */
  deniedTools: string[]
  /** 允许访问的路径列表 */
  allowedPaths: string[]
  /** 禁止访问的路径列表 */
  deniedPaths: string[]
  /** 是否允许执行危险操作 */
  canExecuteDangerous: boolean
  /** 是否允许网络访问 */
  canAccessNetwork: boolean
  /** 最大执行时间（毫秒） */
  maxExecutionTime: number
}

// ==================== 沙箱配置 ====================

/**
 * 沙箱配置
 */
export interface SandboxConfig {
  /** 是否启用沙箱 */
  enabled: boolean
  /** 允许访问的路径列表 */
  allowedPaths: string[]
  /** 禁止访问的路径列表 */
  deniedPaths: string[]
  /** 最大文件大小（字节） */
  maxFileSize: number
  /** 最大执行时间（毫秒） */
  maxExecutionTime: number
  /** 是否允许网络访问 */
  allowNetwork: boolean
  /** 是否允许子进程 */
  allowChildProcess: boolean
}

/**
 * 默认沙箱配置
 */
export const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  enabled: false,
  allowedPaths: [],
  deniedPaths: ['**/node_modules/**', '**/.git/**', '**/windows/**', '**/System32/**'],
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxExecutionTime: 60000, // 1 minute
  allowNetwork: true,
  allowChildProcess: false,
}

// ==================== 工具定义 ====================

/**
 * 工具类别
 */
export type ToolCategory = 'file' | 'shell' | 'web' | 'system' | 'ai' | 'mcp' | 'agent' | 'plan' | 'development' | 'database' | 'devops' | 'vcs'

/**
 * 工具权限配置
 */
export interface ToolPermissions {
  /** 是否需要认证 */
  requiresAuth?: boolean
  /** 是否为危险操作 */
  dangerous?: boolean
  /** 是否在沙箱中执行 */
  sandboxed?: boolean
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 输入参数 schema */
  inputSchema: {
    type?: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  } | Record<string, unknown>
  /** 工具类别 */
  category: ToolCategory
  /** 处理函数 */
  handler: (
    input: Record<string, unknown>,
    context: ToolExecutionContext,
    sendEvent?: EventSender
  ) => Promise<ToolResult>
  /** 权限配置 */
  permissions?: ToolPermissions
}

// ==================== 运行时类型元数据（供测试使用）====================

/**
 * 运行时类型信息
 */
export const _toolTypeMetadata = {
  interfaces: [
    'ToolExecutionContext',
    'ToolResult',
    'UserPermissions',
    'SandboxConfig',
    'ToolPermissions',
    'ToolDefinition'
  ],
  typeAliases: [
    'PermissionLevel',
    'ToolCategory'
  ],
  constants: [
    'DEFAULT_SANDBOX_CONFIG'
  ]
} as const

// 为了兼容性，导出类型名称字符串（运行时可访问）
export const ToolExecutionContext = 'ToolExecutionContext' as any
export const ToolResult = 'ToolResult' as any
export const UserPermissions = 'UserPermissions' as any
export const SandboxConfig = 'SandboxConfig' as any
export const ToolPermissions = 'ToolPermissions' as any
export const ToolDefinition = 'ToolDefinition' as any
