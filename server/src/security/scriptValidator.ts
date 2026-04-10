/**
 * 脚本验证器模块 - Script Validator
 * 
 * 检测和阻止恶意脚本执行，提供：
 * - 脚本内容静态分析
 * - 远程脚本下载检测
 * - 脚本执行路径验证
 * - 文件大小限制
 * 
 * @packageDocumentation
 */

import { readFile, stat } from 'fs/promises'
import { resolve, isAbsolute, relative } from 'path'
import { existsSync } from 'fs'

/**
 * 验证结果
 */
export interface ValidationResult {
  /** 是否允许 */
  allowed: boolean
  /** 拒绝原因 */
  reason?: string
  /** 建议 */
  suggestion?: string
  /** 安全级别 */
  severity?: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * 脚本验证器类
 * 
 * 提供完整的脚本执行安全验证
 */
export class ScriptValidator {
  private userId: string
  private userRoot: string

  constructor(userId: string, userRoot: string) {
    this.userId = userId
    this.userRoot = resolve(userRoot)
  }

  /**
   * 验证脚本文件内容
   * 
   * @param filePath - 脚本文件路径
   * @returns 验证结果
   */
  async validateScriptContent(filePath: string): Promise<ValidationResult> {
    try {
      // 1. 检查文件是否在用户目录内
      const pathResult = this.validatePath(filePath)
      if (!pathResult.allowed) {
        return pathResult
      }

      // 2. 检查文件是否存在
      if (!existsSync(filePath)) {
        return {
          allowed: false,
          reason: '脚本文件不存在',
          severity: 'medium'
        }
      }

      // 3. 检查文件大小
      const stats = await stat(filePath)
      if (stats.size > 1024 * 1024) { // 1MB 限制
        return {
          allowed: false,
          reason: '❌ 安全限制：脚本文件大小超过 1MB 限制',
          severity: 'medium'
        }
      }

      // 4. 读取脚本内容
      const content = await readFile(filePath, 'utf-8')

      // 5. 检测危险模式
      const dangerousPatterns = [
        // 系统调用
        /\bos\.system\s*\(/i,
        /\bsubprocess\./i,
        /\bexec\s*\(/i,
        /\beval\s*\(/i,
        /\brequire\s*\(['"]child_process['"]\)/i,
        /\bshell_exec\s*\(/i,
        /\bsystem\s*\(/i,
        /\bpassthru\s*\(/i,
        /\bexecve\s*\(/i,
        /\bspawn\s*\(/i,
        /\bfork\s*\(/i,
        
        // 网络攻击
        /\bsocket\./i,
        /\brequests\.post\s*\(/i,
        /\bfetch\s*\(/i,
        /\/dev\/tcp\//i,
        /\bsocket\.connect\s*\(/i,
        
        // 文件操作
        /\bopen\s*\(\s*['"]\/etc\//i,
        /\bopen\s*\(\s*['"]\/proc\//i,
        /\bopen\s*\(\s*['"]\/sys\//i,
        /\bshutil\.rmtree\s*\(/i,
        /\bos\.remove\s*\(/i,
        /\bos\.unlink\s*\(/i,
        /\bos\.rmdir\s*\(/i,
        
        // 权限提升
        /\bsudo\s+/i,
        /\bsu\s+/i,
        /\bsetuid\s*\(/i,
        /\bsetgid\s*\(/i,
        /\bchmod\s+\+?s/i,
        
        // 代码注入
        /\b__import__\s*\(/i,
        /\bimportlib\s*\./i,
        /\bcompile\s*\(/i,
        /\bexecfile\s*\(/i,
      ]

      for (const pattern of dangerousPatterns) {
        if (pattern.test(content)) {
          return {
            allowed: false,
            reason: `❌ 安全限制：脚本包含危险代码（匹配模式：${pattern.source}）`,
            severity: 'high'
          }
        }
      }

      // 6. 检查 shebang 行
      const shebangMatch = content.match(/^#!\s*(\/bin\/bash|\/bin\/sh|\/usr\/bin\/env\s+bash)/m)
      if (shebangMatch) {
        // Shebang 是 bash 且包含危险命令
        const dangerousBashPatterns = [
          /\brm\s+(-[rf]+\s+)*\/\s*;/i,
          /\bdd\s+if=/i,
          /\bmkfs/i,
          /\bfusermount\s+/i,
        ]

        for (const pattern of dangerousBashPatterns) {
          if (pattern.test(content)) {
            return {
              allowed: false,
              reason: `❌ 安全限制：脚本包含危险的 bash 命令`,
              severity: 'high'
            }
          }
        }
      }

      return { allowed: true }
    } catch (error) {
      return {
        allowed: false,
        reason: `脚本验证失败：${error instanceof Error ? error.message : String(error)}`,
        severity: 'high'
      }
    }
  }

  /**
   * 验证脚本执行命令
   * 
   * @param command - 执行的命令
   * @returns 验证结果
   */
  validateScriptExecution(command: string): ValidationResult {
    // 提取脚本路径
    const scriptPath = this.extractScriptPath(command)

    if (!scriptPath) {
      return { allowed: true } // 不是脚本执行命令
    }

    // 如果是绝对路径，验证是否在 userRoot 内
    if (isAbsolute(scriptPath)) {
      const resolvedPath = resolve(scriptPath)
      if (!resolvedPath.startsWith(this.userRoot)) {
        return {
          allowed: false,
          reason: '❌ 安全限制：只能执行工作目录内的脚本',
          severity: 'high'
        }
      }
    }
    // 相对路径：假设在当前工作目录内，允许执行
    // 因为 SecureTerminal 会跟踪 cwd，这里简化处理

    return { allowed: true }
  }

  /**
   * 检测并阻止远程脚本下载执行
   * 
   * @param command - 要检测的命令
   * @returns 验证结果
   */
  detectRemoteScriptExecution(command: string): ValidationResult {
    const dangerousPatterns = [
      // curl | bash
      /curl\s+[^|]+\|\s*(bash|sh|zsh)/i,
      // wget | bash
      /wget\s+[^|]+\|\s*(bash|sh|zsh)/i,
      // curl -sSfL | bash
      /curl\s+(-[^\s]+\s+)*\|\s*(bash|sh)/i,
      // wget -qO- | bash
      /wget\s+(-[^\s]+\s+)*\|\s*(bash|sh)/i,
      // bash <(curl ...)
      /bash\s+<\(\s*curl\s+/i,
      // source <(curl ...)
      /source\s+<\(\s*curl\s+/i,
      // . <(curl ...)
      /^\.\s+<\(\s*curl\s+/i,
      // zsh <(curl ...)
      /zsh\s+<\(\s*curl\s+/i,
      // eval $(curl ...)
      /eval\s+\$\(\s*curl\s+/i,
      // eval "$(curl ...)"
      /eval\s+["']\$\(\s*curl\s+/i,
    ]

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return {
          allowed: false,
          reason: '❌ 安全限制：禁止下载并执行远程脚本（可能存在安全风险）',
          suggestion: '请先下载脚本到本地，审查后再执行',
          severity: 'critical'
        }
      }
    }

    return { allowed: true }
  }

  /**
   * 验证路径是否在用户目录内
   */
  private validatePath(filePath: string): ValidationResult {
    try {
      // 如果是绝对路径
      if (isAbsolute(filePath)) {
        const resolvedPath = resolve(filePath)
        if (!resolvedPath.startsWith(this.userRoot)) {
          const relPath = relative(this.userRoot, resolvedPath)
          return {
            allowed: false,
            reason: `🚫 安全限制：路径 "${relPath}" 超出工作目录范围`,
            severity: 'high'
          }
        }
      }
      // 相对路径由调用者处理（在 validateScriptExecution 中）
      
      return { allowed: true }
    } catch (error) {
      return {
        allowed: false,
        reason: `路径验证失败：${error instanceof Error ? error.message : String(error)}`,
        severity: 'high'
      }
    }
  }

  /**
   * 从命令中提取脚本路径
   */
  private extractScriptPath(command: string): string | null {
    // 匹配解释器执行模式
    const interpreterPatterns = [
      /^(python|python3|node|bash|sh|perl|ruby)\s+['"]?([^'"\s&|;]+)['"]?/i,
      /^\.\/([^'"\s&|;]+)/i,
    ]

    for (const pattern of interpreterPatterns) {
      const match = command.match(pattern)
      if (match && match[2]) {
        const path = match[2].trim()
        // 检查是否是脚本文件（有扩展名）
        if (/\.(py|js|sh|pl|rb|ts)$/i.test(path)) {
          return path
        }
      }
    }

    return null
  }
}

/**
 * 创建脚本验证器的工厂函数
 */
export function createScriptValidator(
  userId: string,
  userRoot: string
): ScriptValidator {
  return new ScriptValidator(userId, userRoot)
}
