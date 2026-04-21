/**
 * 路径沙箱模块 - Path Sandbox
 * 
 * 提供终端会话级别的路径隔离，确保每个用户只能在其工作目录内操作
 * 支持路径验证、命令过滤、虚拟路径显示等功能
 * 
 * @packageDocumentation
 */

import { resolve, normalize, isAbsolute, relative, join, dirname, basename } from 'path'
import { existsSync, statSync, readlinkSync } from 'fs'
import { ScriptValidator, createScriptValidator } from './scriptValidator'

/**
 * 路径验证结果
 */
export interface PathValidationResult {
  /** 是否允许访问 */
  allowed: boolean
  /** 验证后的规范化路径 */
  resolvedPath?: string
  /** 拒绝原因 */
  reason?: string
  /** 安全级别 */
  severity?: 'block' | 'warn'
}

/**
 * 命令验证结果
 */
export interface CommandValidationResult {
  /** 是否允许执行 */
  allowed: boolean
  /** 原因 */
  reason?: string
  /** 建议的安全命令 */
  suggestion?: string
}

/**
 * 路径沙箱配置
 */
export interface PathSandboxConfig {
  /** 用户 ID */
  userId: string
  /** 用户工作目录根路径 */
  userRoot: string
  /** 是否启用严格模式 */
  strictMode?: boolean
  /** 是否隐藏真实路径 */
  hideRealPath?: boolean
  /** 自定义命令白名单 */
  allowedCommands?: string[]
  /** 自定义命令黑名单 */
  blockedCommands?: string[]
}

/**
 * 默认的命令白名单
 */
const DEFAULT_ALLOWED_COMMANDS = [
  // 基础命令
  'ls', 'dir', 'pwd', 'cd', 'echo', 'cat', 'less', 'more', 'head', 'tail',
  'grep', 'find', 'which', 'whereis', 'type', 'man', 'help',
  
  // 文件操作
  'mkdir', 'rm', 'cp', 'mv', 'touch', 'ln', 'chmod', 'chgrp', 'stat',
  'tree', 'basename', 'dirname', 'realpath',
  
  // 文本编辑
  'vi', 'vim', 'nano', 'emacs', 'code',
  
  // 开发工具
  'node', 'bun', 'npm', 'yarn', 'pnpm', 'npx',
  'python', 'python3', 'pip', 'pip3',
  'git', 'diff', 'patch',
  'tsc', 'ts-node',
  
  // 系统信息
  'ps', 'top', 'htop', 'uptime', 'free', 'df', 'du',
  'uname', 'hostname', 'whoami', 'id', 'groups',
  'env', 'printenv', 'set', 'export',
  
  // 网络（受限）
  'curl', 'wget', 'ping', 'nslookup', 'dig',
  
  // 压缩解压
  'tar', 'zip', 'unzip', 'gzip', 'gunzip',
  
  // 其他安全命令
  'date', 'time', 'cal', 'wc', 'sort', 'uniq',
  'awk', 'sed', 'cut', 'tr', 'xargs',
  'tee', 'history',
]

/**
 * 危险命令黑名单（仅包含真正危险的操作）
 *
 * 设计原则：
 * - Worker 容器以 --privileged 模式运行，AI Agent 需要完整的系统权限
 * - 只阻止可能导致容器崩溃或数据丢失的操作
 * - 允许系统管理命令（sudo, systemctl 等），因为这是沙箱环境
 */
const DANGEROUS_COMMANDS = [
  // 容器破坏性操作（会导致容器不可用）
  'shutdown', 'reboot', 'halt', 'poweroff',
  'mkfs',  // 格式化文件系统

  // 网络攻击工具（可能被滥用）
  'nc', 'netcat', 'ncat',

  // 注意：以下命令已从黑名单中移除
  // - sudo, su: AI Agent 需要 root 权限执行管理任务
  // - mount, umount: 文件系统操作是合法需求
  // - systemctl, service: 服务管理是常见操作
  // - chmod, chown: 文件权限管理是基本需求
  // - bash, sh, zsh: Shell 是执行脚本的基础
  // - useradd/userdel: 用户管理在沙箱中是安全的
]

/**
 * 路径沙箱类
 * 
 * 提供完整的路径隔离和命令验证功能
 * 
 * @example
 * ```typescript
 * const sandbox = new PathSandbox({
 *   userId: 'user123',
 *   userRoot: '/workspaces/users/user123'
 * })
 * 
 * // 验证路径
 * const result = sandbox.resolvePath('../etc/passwd')
 * if (!result.allowed) {
 *   console.log(result.reason) // 拒绝访问
 * }
 * 
 * // 验证命令
 * const cmdResult = sandbox.validateCommand('cat ../../etc/passwd')
 * if (!cmdResult.allowed) {
 *   console.log(cmdResult.reason) // 检测到路径遍历攻击
 * }
 * ```
 */
export class PathSandbox {
  private userId: string
  private userRoot: string
  private strictMode: boolean
  private hideRealPath: boolean
  private allowedCommands: Set<string>
  private blockedCommands: Set<string>
  private currentPath: string
  private scriptValidator: ScriptValidator  // ✅ 新增：脚本验证器

  constructor(config: PathSandboxConfig) {
    this.userId = config.userId
    this.userRoot = resolve(config.userRoot)
    this.strictMode = config.strictMode ?? true  // 启用严格模式
    this.hideRealPath = config.hideRealPath ?? true  // 隐藏真实路径

    this.currentPath = this.userRoot

    // 合并自定义白名单和默认白名单
    this.allowedCommands = new Set([
      ...DEFAULT_ALLOWED_COMMANDS,
      ...(config.allowedCommands || [])
    ])

    // 合并危险命令黑名单和自定义黑名单
    this.blockedCommands = new Set([
      ...DANGEROUS_COMMANDS,
      ...(config.blockedCommands || [])
    ])

    // ✅ 新增：初始化脚本验证器
    this.scriptValidator = createScriptValidator(config.userId, config.userRoot)
    
    console.log(`[PathSandbox] 初始化完成: userId=${this.userId}, strictMode=${this.strictMode}`)
    console.log(`[PathSandbox] 危险命令黑名单: ${Array.from(DANGEROUS_COMMANDS).join(', ')}`)
  }

  /**
   * 获取用户根目录
   */
  getUserRoot(): string {
    return this.userRoot
  }

  /**
   * 获取当前路径
   */
  getCurrentPath(): string {
    return this.currentPath
  }

  /**
   * 设置当前路径（内部使用）
   */
  setCurrentPath(path: string): void {
    this.currentPath = path
  }

  /**
   * 验证并解析路径，确保在用户根目录内
   * 
   * @param targetPath - 目标路径（可以是相对路径或绝对路径）
   * @returns 验证结果
   */
  resolvePath(targetPath: string): PathValidationResult {
    try {
      // 1. 处理空路径
      if (!targetPath || targetPath.trim() === '') {
        return {
          allowed: true,
          resolvedPath: this.currentPath
        }
      }

      // 2. 解析绝对路径或相对路径
      const resolvedPath = isAbsolute(targetPath)
        ? resolve(targetPath)
        : resolve(this.currentPath, targetPath)

      // 3. 规范化路径（这会处理 .. 引用）
      const normalizedPath = normalize(resolvedPath)

      // 4. 严格模式：验证最终路径是否在 userRoot 内
      if (this.strictMode) {
        // 使用 relative 检查路径是否在 userRoot 内
        // 如果路径超出 userRoot，relative 会返回以 .. 开头的路径
        const relPath = relative(this.userRoot, normalizedPath)
        
        // 检查是否超出根目录（路径以 .. 开头表示在外）
        if (relPath.startsWith('..')) {
          console.warn(`[PathSandbox] 路径访问被拒绝: ${targetPath} -> ${normalizedPath} (超出 userRoot: ${this.userRoot})`)
          return {
            allowed: false,
            reason: `安全限制：路径超出工作目录范围。Agent 只能访问 ${this.userRoot} 内的文件。`,
            severity: 'block'
          }
        }
      }

      return {
        allowed: true,
        resolvedPath: normalizedPath
      }
    } catch (error) {
      return {
        allowed: false,
        reason: `路径解析失败：${error instanceof Error ? error.message : String(error)}`,
        severity: 'block'
      }
    }
  }

  /**
   * 验证命令是否可以执行
   * 
   * @param command - 要验证的命令
   * @returns 验证结果
   */
  validateCommand(command: string): CommandValidationResult {
    // 提取第一个命令（忽略参数）
    const trimmed = command.trim()
    const firstCmd = trimmed.split(/\s+/)[0].toLowerCase()
    
    // 检查是否是危险命令
    if (this.blockedCommands.has(firstCmd)) {
      console.warn(`[PathSandbox] 命令被拦截: ${firstCmd}`)
      return {
        allowed: false,
        reason: `禁止执行危险命令: ${firstCmd}`
      }
    }

    // 检查是否包含管道或重定向中的危险命令
    const parts = trimmed.split(/[|&;]/)
    for (const part of parts) {
      const cmd = part.trim().split(/\s+/)[0].toLowerCase()
      if (this.blockedCommands.has(cmd)) {
        console.warn(`[PathSandbox] 命令被拦截: ${cmd}`)
        return {
          allowed: false,
          reason: `禁止执行危险命令: ${cmd}`
        }
      }
    }

    // 检查是否有路径遍历攻击
    if (trimmed.includes('..') && trimmed.includes('/etc')) {
      return {
        allowed: false,
        reason: '检测到路径遍历攻击'
      }
    }

    return { allowed: true }
  }

  /**
   * ✅ 新增：异步验证脚本执行（包含内容分析）
   * 
   * 对于脚本执行命令，需要在执行前验证脚本内容
   * 这个方法应该在 PTY 写入前调用
   * 
   * @param command - 要验证的命令
   * @returns 验证结果（Promise）
   */
  async validateCommandAsync(command: string): Promise<CommandValidationResult> {
    // 先进行同步验证
    const syncResult = this.validateCommand(command)
    if (!syncResult.allowed) {
      return syncResult
    }

    // 检查是否是脚本执行命令
    if (this.isScriptExecution(command)) {
      const scriptPath = this.extractScriptPathFromCommand(command)
      if (scriptPath) {
        // 异步验证脚本内容
        const contentResult = await this.scriptValidator.validateScriptContent(scriptPath)
        if (!contentResult.allowed) {
          return {
            allowed: false,
            reason: contentResult.reason,
            severity: contentResult.severity
          }
        }
      }
    }

    return { allowed: true }
  }

  /**
   * 判断是否是脚本执行命令
   */
  private isScriptExecution(command: string): boolean {
    const scriptPatterns = [
      /^(python|python3|node|bash|sh|perl|ruby)\s+['"]?([^'"\s&|;]+\.)(py|js|sh|pl|rb|ts)/i,
      /^\.\/([^'"\s&|;]+\.)(py|js|sh|pl|rb|ts)/i,
    ]

    for (const pattern of scriptPatterns) {
      if (pattern.test(command)) {
        return true
      }
    }

    return false
  }

  /**
   * 从命令中提取脚本路径
   */
  private extractScriptPathFromCommand(command: string): string | null {
    const patterns = [
      /^(python|python3|node|bash|sh|perl|ruby)\s+['"]?([^'"\s&|;]+)/i,
      /^\.\/([^'"\s&|;]+)/i,
    ]

    for (const pattern of patterns) {
      const match = command.match(pattern)
      if (match && match[2]) {
        return match[2].trim()
      }
    }

    return null
  }

  /**
   * 验证 cd 命令
   */
  private validateCdCommand(command: string): CommandValidationResult {
    // 提取 cd 的参数
    const match = command.match(/^cd\s+(.+)$/)
    if (!match) {
      return { allowed: true } // cd 不带参数，返回当前目录
    }

    const targetPath = match[1].trim()

    // 移除引号
    const unquotedPath = targetPath.replace(/^['"]|['"]$/g, '')

    // ✅ 改进：不再简单阻止包含 .. 的路径
    // 而是解析路径后检查最终结果是否在 userRoot 内
    // 这样允许用户 cd .. 只要在安全范围内
    
    // 解析目标路径（resolvePath 会规范化路径并检查）
    const targetResult = this.resolvePath(unquotedPath)
    if (!targetResult.allowed) {
      return {
        allowed: false,
        reason: targetResult.reason,
        suggestion: '只能切换到工作目录内的子目录。'
      }
    }

    return { allowed: true }
  }

  /**
   * 从命令中提取基础命令名
   */
  private extractBaseCommand(command: string): string {
    // 处理管道、重定向等
    const firstCommand = command.split(/[;&|]/)[0].trim()
    
    // 提取第一个词（命令名）
    const parts = firstCommand.split(/\s+/)
    let cmd = parts[0]

    // 移除路径前缀
    cmd = basename(cmd)

    // 处理 env 前缀
    if (cmd === 'env') {
      cmd = parts[1] || cmd
    }

    return cmd.toLowerCase()
  }

  /**
   * 从命令中提取路径参数
   */
  private extractPathsFromCommand(command: string): string[] {
    const paths: string[] = []

    // 匹配引号内的路径
    const quotedPathRegex = /['"]([^'"]*[\/\\][^'"]*)['"]/g
    let match

    while ((match = quotedPathRegex.exec(command)) !== null) {
      if (match[1] && !match[1].startsWith('-')) {
        paths.push(match[1])
      }
    }

    // 匹配 --path=xxx 或 -p xxx 格式
    const optionPathRegex = /(?:--?[a-zA-Z]+[= ])([^\s&|;'"`<>]+)/g

    while ((match = optionPathRegex.exec(command)) !== null) {
      const potentialPath = match[1]
      if (
        potentialPath &&
        !potentialPath.startsWith('-') &&
        (potentialPath.includes('/') || potentialPath.includes('\\'))
      ) {
        paths.push(potentialPath)
      }
    }

    // 匹配命令后的位置参数（简单的空格分隔）
    const baseCmdRemoved = command.replace(/^[^\s]+\s+/, '')
    const args = baseCmdRemoved.split(/\s+/).filter(arg => 
      arg && 
      !arg.startsWith('-') && 
      !arg.includes('=') &&
      (arg.includes('/') || arg.includes('\\') || arg.includes('.'))
    )

    paths.push(...args)

    return [...new Set(paths)]
  }

  /**
   * ✅ 新增：检测解释器调用危险模式
   * 
   * 防止通过解释器执行系统命令绕过限制
   * 例如：python -c "import os; os.system('rm -rf /')"
   */
  private checkInterpreterCalls(command: string): CommandValidationResult {
    const dangerousPatterns = [
      // Python 系统调用
      /python[3]?\s+(-c|-m)\s+["'].*os\.system\s*\(/i,
      /python[3]?\s+(-c|-m)\s+["'].*subprocess\./i,
      /python[3]?\s+(-c|-m)\s+["'].*__import__\s*\(/i,
      
      // Node.js 执行
      /node\s+(-e|-p)\s+["'].*exec\s*\(/i,
      /node\s+(-e|-p)\s+["'].*spawn\s*\(/i,
      /node\s+(-e|-p)\s+["'].*require\s*\(['"]child_process['"]\)/i,
      
      // Bash 嵌套执行
      /bash\s+(-c|--command)\s+["'].*sudo/i,
      /sh\s+-c\s+["'].*sudo/i,
      
      // Perl/Ruby 系统调用
      /perl\s+(-e)\s+["'].*system\s*\(/i,
      /ruby\s+(-e)\s+["'].*system\s*\(/i,
      
      // 通用危险模式
      /eval\s*\(/i,
      /exec\s*\(/i,
      /system\s*\(/i,
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: `❌ 安全限制：检测到通过解释器执行系统命令的尝试。`,
          suggestion: '该操作可能存在安全风险，请使用其他替代方案。'
        }
      }
    }

    return { allowed: true }
  }

  /**
   * 获取虚拟路径显示（隐藏真实路径）
   * 
   * @param realPath - 真实路径
   * @returns 虚拟路径显示
   */
  getVirtualPath(realPath: string): string {
    if (!this.hideRealPath) {
      return realPath
    }

    const relativePath = relative(this.userRoot, realPath)
    
    if (relativePath === '') {
      return `/${this.userId}`
    }

    return `/${this.userId}/${relativePath.replace(/\\/g, '/')}`
  }

  /**
   * 获取虚拟提示符
   */
  getPrompt(): string {
    const virtualPath = this.getVirtualPath(this.currentPath)
    return `${this.userId}:${virtualPath}$ `
  }

  /**
   * 更新当前路径（用于 cd 命令后）
   */
  updateCurrentPath(newPath: string): void {
    const result = this.resolvePath(newPath)
    if (result.allowed && result.resolvedPath) {
      this.currentPath = result.resolvedPath
    }
  }

  /**
   * 获取环境变量配置（安全版本）
   */
  getSecureEnv(): Record<string, string> {
    const env: Record<string, string> = {
      HOME: this.userRoot,
      USER: this.userId,
      USERNAME: this.userId,
      SHELL: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
      TERM: 'xterm-256color',
      PROMPT: this.getPrompt(),
      HISTFILE: '/dev/null',  // 不记录历史
      HISTSIZE: '0',
      HISTFILESIZE: '0',
    }

    // 设置受限的 PATH
    if (process.platform === 'win32') {
      env.PATH = `${process.env.SystemRoot}\\System32;${process.env.SystemRoot};${process.env.SystemRoot}\\System32\\Wbem`
    } else {
      env.PATH = '/usr/local/bin:/usr/bin:/bin'
    }

    return env
  }
}

/**
 * 创建路径沙箱的工厂函数
 */
export function createPathSandbox(
  userId: string,
  userRoot: string,
  config?: Partial<Omit<PathSandboxConfig, 'userId' | 'userRoot'>>
): PathSandbox {
  return new PathSandbox({
    userId,
    userRoot,
    ...config
  })
}
