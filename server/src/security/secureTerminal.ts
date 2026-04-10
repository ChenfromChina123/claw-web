/**
 * 安全终端包装器 - Secure Terminal
 * 
 * 基于 Bun PTY API 的安全终端实现，提供：
 * - 命令输入验证和过滤
 * - 路径沙箱隔离
 * - 虚拟路径显示（隐藏真实路径）
 * - 命令审计日志
 * 
 * @packageDocumentation
 */

import { PathSandbox, createPathSandbox } from './pathSandbox'
import type { PTYSession } from '../integration/ptyManager'

/**
 * 安全终端配置
 */
export interface SecureTerminalConfig {
  /** 用户 ID */
  userId: string
  /** 用户工作目录 */
  userRoot: string
  /** 终端列数 */
  cols?: number
  /** 终端行数 */
  rows?: number
  /** 是否启用严格模式 */
  strictMode?: boolean
  /** 是否启用命令审计 */
  enableAudit?: boolean
  /** 审计日志回调 */
  auditCallback?: (event: AuditEvent) => void
}

/**
 * 审计事件类型
 */
export type AuditEventType = 
  | 'command_executed'
  | 'command_blocked'
  | 'path_violation'
  | 'session_started'
  | 'session_ended'
  | 'resize'
  | 'error'
  // ✅ 新增：脚本安全相关事件
  | 'script_blocked'          // 脚本执行被阻止
  | 'remote_script_blocked'   // 远程脚本下载被阻止
  | 'interpreter_abuse'       // 解释器滥用检测
  | 'escape_attempt'          // 逃逸尝试检测

/**
 * 审计事件
 */
export interface AuditEvent {
  /** 事件类型 */
  type: AuditEventType
  /** 用户 ID */
  userId: string
  /** 会话 ID */
  sessionId: string
  /** 时间戳 */
  timestamp: Date
  /** 命令内容（如果适用） */
  command?: string
  /** 原因（如果适用） */
  reason?: string
  /** 额外数据 */
  data?: Record<string, any>
  /** ✅ 新增：安全级别 */
  severity?: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * 终端输入拦截结果
 */
export interface InputInterceptResult {
  /** 是否允许执行 */
  allowed: boolean
  /** 拦截的输入（如果要修改） */
  modifiedInput?: string
  /** 拒绝原因 */
  reason?: string
  /** 是否发送错误提示 */
  sendErrorPrompt?: boolean
}

/**
 * 安全终端类
 * 
 * 包装 Bun PTY，提供安全的终端会话管理
 */
export class SecureTerminal {
  private sandbox: PathSandbox
  private userId: string
  private sessionId: string
  private enableAudit: boolean
  private auditCallback?: (event: AuditEvent) => void
  private commandBuffer: string = ''
  private isCommandInProgress: boolean = false

  constructor(
    sessionId: string,
    config: SecureTerminalConfig
  ) {
    this.sessionId = sessionId
    this.userId = config.userId
    this.enableAudit = config.enableAudit ?? true
    this.auditCallback = config.auditCallback

    // 创建路径沙箱
    this.sandbox = createPathSandbox(config.userId, config.userRoot, {
      strictMode: config.strictMode ?? true,
      hideRealPath: true
    })

    // 记录会话开始
    this.audit('session_started', {
      cols: config.cols,
      rows: config.rows
    })
  }

  /**
   * 获取路径沙箱实例
   */
  getSandbox(): PathSandbox {
    return this.sandbox
  }

  /**
   * 获取用户 ID
   */
  getUserId(): string {
    return this.userId
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string {
    return this.sessionId
  }

  /**
   * 拦截并验证终端输入
   * 
   * @param input - 用户输入
   * @returns 拦截结果
   */
  interceptInput(input: string): InputInterceptResult {
    this.commandBuffer += input

    // 检测命令结束（回车）
    if (input.includes('\n') || input.includes('\r')) {
      const command = this.commandBuffer.trim()
      this.commandBuffer = ''

      // 验证命令
      const validationResult = this.sandbox.validateCommand(command)

      if (!validationResult.allowed) {
        // ✅ 增强：根据拒绝原因记录不同的审计事件
        const auditType = this.determineAuditType(command, validationResult)
        
        // 记录审计事件
        this.audit(auditType, {
          command,
          reason: validationResult.reason,
          severity: this.determineSeverity(auditType)
        })

        return {
          allowed: false,
          reason: validationResult.reason,
          sendErrorPrompt: true
        }
      }

      // 记录审计事件
      this.audit('command_executed', {
        command
      })
    }

    return {
      allowed: true
    }
  }

  /**
   * ✅ 新增：根据验证结果确定审计事件类型
   */
  private determineAuditType(command: string, result: any): AuditEventType {
    const reason = result.reason || ''
    
    // 检测远程脚本下载
    if (reason.includes('远程脚本') || reason.includes('下载并执行')) {
      return 'remote_script_blocked'
    }
    
    // 检测脚本执行
    if (reason.includes('脚本') || reason.includes('脚本文件')) {
      return 'script_blocked'
    }
    
    // 检测解释器滥用
    if (reason.includes('解释器') || reason.includes('os.system') || reason.includes('child_process')) {
      return 'interpreter_abuse'
    }
    
    // 检测逃逸尝试
    if (reason.includes('超出工作目录') || reason.includes('..')) {
      return 'escape_attempt'
    }
    
    // 默认
    return 'command_blocked'
  }

  /**
   * ✅ 新增：确定安全级别
   */
  private determineSeverity(auditType: AuditEventType): 'low' | 'medium' | 'high' | 'critical' {
    switch (auditType) {
      case 'remote_script_blocked':
        return 'critical'  // 远程脚本下载是最危险的
      case 'escape_attempt':
        return 'high'      // 逃逸尝试很危险
      case 'interpreter_abuse':
        return 'high'      // 解释器滥用
      case 'script_blocked':
        return 'medium'    // 脚本执行被阻止
      case 'command_blocked':
        return 'medium'    // 普通命令被阻止
      case 'path_violation':
        return 'high'      // 路径违规
      default:
        return 'low'
    }
  }

  /**
   * 处理终端输出，替换真实路径为虚拟路径
   * 
   * @param output - 原始输出
   * @returns 处理后的输出
   */
  processOutput(output: string): string {
    const userRoot = this.sandbox.getUserRoot()
    
    // 替换真实路径为虚拟路径
    // 需要处理多种路径格式
    let processed = output

    // Windows 路径处理
    const winPathRegex = new RegExp(userRoot.replace(/\\/g, '\\\\'), 'g')
    processed = processed.replace(winPathRegex, `/${this.userId}`)

    // Unix 路径处理
    const unixPathRegex = new RegExp(userRoot.replace(/\//g, '/'), 'g')
    processed = processed.replace(unixPathRegex, `/${this.userId}`)

    // 处理当前路径的显示
    const currentPath = this.sandbox.getCurrentPath()
    if (currentPath !== userRoot) {
      const currentWinPath = new RegExp(currentPath.replace(/\\/g, '\\\\'), 'g')
      const currentUnixPath = new RegExp(currentPath.replace(/\//g, '/'), 'g')
      
      processed = processed.replace(currentWinPath, this.sandbox.getVirtualPath(currentPath))
      processed = processed.replace(currentUnixPath, this.sandbox.getVirtualPath(currentPath))
    }

    return processed
  }

  /**
   * 获取安全的终端提示符
   */
  getPrompt(): string {
    return this.sandbox.getPrompt()
  }

  /**
   * 获取安全的环境变量
   */
  getSecureEnv(): Record<string, string> {
    return this.sandbox.getSecureEnv()
  }

  /**
   * 更新当前路径（在 cd 命令执行后调用）
   */
  updateCurrentPath(newPath: string): void {
    this.sandbox.updateCurrentPath(newPath)
  }

  /**
   * 记录审计事件
   */
  private audit(
    type: AuditEventType,
    data?: Record<string, any>
  ): void {
    if (!this.enableAudit || !this.auditCallback) {
      return
    }

    const event: AuditEvent = {
      type,
      userId: this.userId,
      sessionId: this.sessionId,
      timestamp: new Date(),
      ...data
    }

    this.auditCallback(event)
  }

  /**
   * 处理终端尺寸调整
   */
  onResize(cols: number, rows: number): void {
    this.audit('resize', {
      cols,
      rows
    })
  }

  /**
   * 处理会话结束
   */
  onSessionEnd(exitCode?: number): void {
    this.audit('session_ended', {
      exitCode
    })
  }

  /**
   * 记录错误
   */
  onError(error: Error, context?: string): void {
    this.audit('error', {
      message: error.message,
      stack: error.stack,
      context
    })
  }
}

/**
 * 创建安全终端的工厂函数
 */
export function createSecureTerminal(
  sessionId: string,
  config: SecureTerminalConfig
): SecureTerminal {
  return new SecureTerminal(sessionId, config)
}

/**
 * 安全终端管理器
 * 
 * 管理所有安全终端实例
 */
export class SecureTerminalManager {
  private terminals: Map<string, SecureTerminal> = new Map()

  /**
   * 创建新的安全终端
   */
  createTerminal(
    sessionId: string,
    config: SecureTerminalConfig
  ): SecureTerminal {
    const terminal = createSecureTerminal(sessionId, config)
    this.terminals.set(sessionId, terminal)
    return terminal
  }

  /**
   * 获取安全终端
   */
  getTerminal(sessionId: string): SecureTerminal | undefined {
    return this.terminals.get(sessionId)
  }

  /**
   * 移除安全终端
   */
  removeTerminal(sessionId: string): boolean {
    const terminal = this.terminals.get(sessionId)
    if (terminal) {
      terminal.onSessionEnd()
      this.terminals.delete(sessionId)
      return true
    }
    return false
  }

  /**
   * 获取用户的所有终端
   */
  getUserTerminals(userId: string): SecureTerminal[] {
    const result: SecureTerminal[] = []
    for (const terminal of this.terminals.values()) {
      if (terminal.getUserId() === userId) {
        result.push(terminal)
      }
    }
    return result
  }

  /**
   * 清理所有终端
   */
  cleanup(): void {
    for (const terminal of this.terminals.values()) {
      terminal.onSessionEnd()
    }
    this.terminals.clear()
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalTerminals: number
    activeUsers: number
  } {
    const activeUsers = new Set(
      Array.from(this.terminals.values()).map(t => t.getUserId())
    )

    return {
      totalTerminals: this.terminals.size,
      activeUsers: activeUsers.size
    }
  }
}

// 单例实例
let secureTerminalManagerInstance: SecureTerminalManager | null = null

/**
 * 获取安全终端管理器单例
 */
export function getSecureTerminalManager(): SecureTerminalManager {
  if (!secureTerminalManagerInstance) {
    secureTerminalManagerInstance = new SecureTerminalManager()
  }
  return secureTerminalManagerInstance
}
