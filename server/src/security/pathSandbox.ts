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
 * 危险命令黑名单
 */
const DANGEROUS_COMMANDS = [
  // 权限提升
  'sudo', 'su', 'pkexec', 'doas',
  
  // 系统操作
  'mount', 'umount', 'fdisk', 'mkfs', 'dd',
  'shutdown', 'reboot', 'halt', 'poweroff',
  'systemctl', 'service', 'init',
  
  // 网络攻击
  'nc', 'netcat', 'ncat', 'telnet', 'ftp', 'sftp',
  'ssh', 'scp', 'rsync',
  'nmap', 'tcpdump', 'wireshark',
  
  // 用户管理
  'useradd', 'userdel', 'usermod',
  'groupadd', 'groupdel', 'groupmod',
  'passwd', 'chpasswd',
  
  // 其他危险命令
  'chmod', 'chown',  // 在某些场景下危险
  'crontab', 'at',
  'kill', 'killall', 'pkill',
  'bash', 'sh', 'zsh',  // 防止启动新的 shell 绕过限制
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

  constructor(config: PathSandboxConfig) {
    this.userId = config.userId
    this.userRoot = resolve(config.userRoot)
    this.strictMode = config.strictMode ?? true
    this.hideRealPath = config.hideRealPath ?? true
    this.currentPath = this.userRoot

    // 初始化命令白名单和黑名单
    this.allowedCommands = new Set([
      ...DEFAULT_ALLOWED_COMMANDS,
      ...(config.allowedCommands || [])
    ])

    this.blockedCommands = new Set([
      ...DANGEROUS_COMMANDS,
      ...(config.blockedCommands || [])
    ])
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

      // 2. 规范化输入路径
      const normalizedInput = normalize(targetPath)

      // 3. 检查是否包含 .. 引用
      if (normalizedInput.includes('..')) {
        return {
          allowed: false,
          reason: '❌ 安全限制：路径包含 ".."（父目录引用），禁止访问工作目录外的区域。',
          severity: 'block'
        }
      }

      // 4. 解析绝对路径
      const resolvedPath = isAbsolute(targetPath)
        ? resolve(targetPath)
        : resolve(this.currentPath, targetPath)

      // 5. 规范化路径
      const normalizedPath = normalize(resolvedPath)

      // 6. 检查是否在用户根目录内
      if (!normalizedPath.startsWith(this.userRoot)) {
        const relPath = relative(this.userRoot, normalizedPath)
        return {
          allowed: false,
          resolvedPath: normalizedPath,
          reason: `🚫 安全限制：路径 "${relPath}" 超出工作目录范围。只能访问 ${this.userRoot} 及其子目录。`,
          severity: 'block'
        }
      }

      // 7. 检查符号链接（如果路径存在）
      if (existsSync(normalizedPath)) {
        try {
          const stats = statSync(normalizedPath)
          if (stats.isSymbolicLink()) {
            const linkTarget = readlinkSync(normalizedPath)
            const resolvedLink = resolve(dirname(normalizedPath), linkTarget)
            
            if (!resolvedLink.startsWith(this.userRoot)) {
              return {
                allowed: false,
                resolvedPath: normalizedPath,
                reason: '🔒 安全限制：符号链接指向工作目录外的位置，禁止访问。',
                severity: 'block'
              }
            }
          }
        } catch (err) {
          // 忽略统计错误，继续
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
    const trimmed = command.trim()

    // 1. 空命令检查
    if (!trimmed) {
      return { allowed: true }
    }

    // 2. 提取基础命令名
    const baseCommand = this.extractBaseCommand(trimmed)
    
    if (!baseCommand) {
      return { allowed: true }
    }

    // 3. 检查命令黑名单
    if (this.blockedCommands.has(baseCommand)) {
      return {
        allowed: false,
        reason: `❌ 安全限制：命令 "${baseCommand}" 已被禁止使用。`,
        suggestion: '该命令可能存在安全风险，请使用其他替代方案。'
      }
    }

    // 4. 检查命令白名单（严格模式下）
    if (this.strictMode && !this.allowedCommands.has(baseCommand)) {
      return {
        allowed: false,
        reason: `⚠️ 严格模式：命令 "${baseCommand}" 不在白名单中。`,
        suggestion: '如需使用该命令，请联系管理员添加到白名单。'
      }
    }

    // 5. 检查命令中的路径参数
    const pathArgs = this.extractPathsFromCommand(trimmed)
    for (const pathArg of pathArgs) {
      // 跳过选项和标志
      if (pathArg.startsWith('-')) {
        continue
      }

      const pathResult = this.resolvePath(pathArg)
      if (!pathResult.allowed) {
        return {
          allowed: false,
          reason: pathResult.reason,
          suggestion: '请确保所有路径参数都在工作目录内。'
        }
      }
    }

    // 6. 特殊命令检查（如 cd）
    if (baseCommand === 'cd') {
      return this.validateCdCommand(trimmed)
    }

    return { allowed: true }
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

    // 检查是否包含 ..
    if (unquotedPath.includes('..')) {
      return {
        allowed: false,
        reason: '❌ 安全限制：cd 命令禁止使用 ".." 访问父目录。',
        suggestion: '请使用绝对路径或相对路径（不使用 ..）切换到目标目录。'
      }
    }

    // 解析目标路径
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
