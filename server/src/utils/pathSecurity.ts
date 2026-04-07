/**
 * 路径安全验证模块
 * 
 * 防止 Agent 访问工作目录之外的文件，特别是禁止：
 * 1. 通过 cd .. 切换到上层目录
 * 2. 通过 ../ 路径遍历访问受限区域
 * 3. 查看或修改上层目录结构
 * 
 * 参考 src 项目 pathValidation.ts 和 bashSecurity.ts 的安全机制
 */

import { resolve, normalize, isAbsolute, relative, dirname } from 'path'
import { existsSync, statSync, realpathSync } from 'fs'

// ==================== 类型定义 ====================

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
  /** 安全级别：block = 直接阻止，warn = 警告但允许 */
  severity?: 'block' | 'warn'
}

/**
 * 路径安全配置
 */
export interface PathSecurityConfig {
  /** 允许的根目录（工作目录） */
  allowedRoot: string
  /** 是否严格模式（阻止所有上层访问） */
  strictMode: boolean
  /** 额外允许的路径（白名单） */
  allowedPaths?: string[]
  /** 禁止访问的敏感路径 */
  blockedPaths?: string[]
}

// ==================== 常量定义 ====================

/** 危险的目录切换命令 */
const DIRECTORY_CHANGE_COMMANDS = new Set(['cd', 'pushd', 'popd'])

/** 敏感路径模式（正则表达式） */
const SENSITIVE_PATH_PATTERNS = [
  /\/etc\//,
  /\/usr\/share\//,
  /\/windows\//i,
  /\\windows\\/i,
  /\.ssh\//,
  /.env$/,
  /credentials/i,
]

// ==================== 核心验证函数 ====================

/**
 * 检测命令是否包含目录遍历攻击
 * 
 * @param command - 要检查的 Shell 命令
 * @returns 验证结果
 * 
 * @example
 * // 应该被阻止
 * validateCommandForTraversal('cd ..')           // { allowed: false }
 * validateCommandForTraversal('cd ../secret')     // { allowed: false }
 * validateCommandForTraversal('cat ../../etc/passwd') // { allowed: false }
 * 
 * // 应该允许
 * validateCommandForTraversal('cd src')          // { allowed: true }
 * validateCommandForTraversal('ls -la')          // { allowed: true }
 */
export function validateCommandForTraversal(command: string): PathValidationResult {
  const trimmed = command.trim()

  // 1. 检测 cd/pushd + ..
  if (/^\s*(cd|pushd)\s+\.\./.test(trimmed)) {
    return {
      allowed: false,
      reason: '❌ 安全限制：禁止使用 "cd .." 切换到父目录。Agent 必须保持在当前工作目录内操作。',
      severity: 'block',
    }
  }

  // 2. 检测路径中的 ..
  if (/\.\.[\/\\]/.test(trimmed) || /[\/\\]\.\./.test(trimmed)) {
    return {
      allowed: false,
      reason: '❌ 安全限制：检测到路径包含 ".."（父目录引用）。Agent 只能访问当前工作目录及其子目录。',
      severity: 'block',
    }
  }

  // 3. 检测以 .. 结尾的路径（可能是正在构建遍历路径）
  if (/[\/\\]\.\.\s*$/.test(trimmed)) {
    return {
      allowed: false,
      reason: '❌ 安全限制：路径以 ".." 结尾，可能存在目录遍历风险。',
      severity: 'block',
    }
  }

  return { allowed: true }
}

/**
 * 验证文件路径是否在允许的工作目录内
 * 
 * @param filePath - 要验证的文件路径
 * @param workingDir - 工作目录（根目录）
 * @param config - 可选的安全配置
 * @returns 验证结果
 * 
 * @example
 * const result = validatePathWithinRoot('../config.json', '/project/root')
 * if (!result.allowed) {
 *   console.log(result.reason) // "路径超出工作目录范围"
 * }
 */
export function validatePathWithinRoot(
  filePath: string,
  workingDir: string,
  config?: Partial<PathSecurityConfig>
): PathValidationResult {
  const fullConfig: PathSecurityConfig = {
    allowedRoot: resolve(workingDir),
    strictMode: true,
    ...config,
  }

  let absolutePath: string

  try {
    // 规范化路径
    absolutePath = isAbsolute(filePath)
      ? resolve(filePath)
      : resolve(workingDir, filePath)

    // 解析符号链接获取真实路径
    if (existsSync(absolutePath)) {
      const fileStat = statSync(absolutePath)
      if (fileStat.isSymbolicLink()) {
        absolutePath = realpathSync(absolutePath)
      }
    }
  } catch (error) {
    return {
      allowed: false,
      resolvedPath: filePath,
      reason: `路径解析失败: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'block',
    }
  }

  const normalizedAllowedRoot = normalize(fullConfig.allowedRoot).toLowerCase()
  const normalizedAbsolutePath = normalize(absolutePath).toLowerCase()

  // 检查是否在允许的根目录内
  if (!normalizedAbsolutePath.startsWith(normalizedAllowedRoot)) {
    // 计算相对路径以便显示更友好的错误信息
    const relativePath = relative(fullConfig.allowedRoot, absolutePath)

    return {
      allowed: false,
      resolvedPath: absolutePath,
      reason: `🚫 安全限制：路径 "${relativePath}" 超出工作目录范围。Agent 只能访问 ${fullConfig.allowedRoot} 及其子目录。`,
      severity: fullConfig.strictMode ? 'block' : 'warn',
    }
  }

  // 检查是否匹配敏感路径
  for (const pattern of SENSITIVE_PATH_PATTERNS) {
    if (pattern.test(normalizedAbsolutePath)) {
      return {
        allowed: false,
        resolvedPath: absolutePath,
        reason: '🔒 安全限制：尝试访问敏感路径，此操作已被阻止。',
        severity: 'block',
      }
    }
  }

  // 检查自定义黑名单
  if (fullConfig.blockedPaths) {
    for (const blocked of fullConfig.blockedPaths) {
      const normalizedBlocked = normalize(resolve(blocked)).toLowerCase()
      if (normalizedAbsolutePath.startsWith(normalizedBlocked) || normalizedBlocked.startsWith(normalizedAbsolutePath)) {
        return {
          allowed: false,
          resolvedPath: absolutePath,
          reason: '🚫 此路径已被管理员列入黑名单。',
          severity: 'block',
        }
      }
    }
  }

  return {
    allowed: true,
    resolvedPath: absolutePath,
  }
}

/**
 * 检查 Bash/PowerShell 命令的安全性
 * 
 * 综合验证命令是否安全，包括：
 * - 目录遍历检测
 * - 危险命令检测
 * - 路径越权检测
 * 
 * @param command - 要验证的命令
 * @param workingDir - 工作目录
 * @param commandType - 命令类型 (bash/powershell)
 * @returns 验证结果
 */
export function validateCommandSecurity(
  command: string,
  workingDir: string,
  commandType: 'bash' | 'powershell' = 'bash'
): PathValidationResult {
  // 1. 目录遍历检测
  const traversalCheck = validateCommandForTraversal(command)
  if (!traversalCheck.allowed && traversalCheck.severity === 'block') {
    return traversalCheck
  }

  // 2. 提取命令中的路径参数并验证
  const pathsInCommand = extractPathsFromCommand(command)
  
  for (const path of pathsInCommand) {
    const pathCheck = validatePathWithinRoot(path, workingDir)
    
    if (!pathCheck.allowed && pathCheck.severity === 'block') {
      return {
        ...pathCheck,
        reason: `${pathCheck.reason}\n\n💡 提示：如需访问其他位置的文件，请使用已授权的工具或请求管理员添加路径到白名单。`,
      }
    }
  }

  // 3. PowerShell 特定检查
  if (commandType === 'powershell') {
    const psCheck = validatePowerShellCommand(command)
    if (!psCheck.allowed) {
      return psCheck
    }
  }

  return { allowed: true }
}

/**
 * 从命令字符串中提取可能的路径参数
 * 
 * 支持提取：
 * - 引号内的路径
 * - --path=xxx 或 -p xxx 格式
 * - 直接作为参数的路径
 */
function extractPathsFromCommand(command: string): string[] {
  const paths: string[] = []

  // 匹配引号内的路径（支持单引号和双引号）
  const quotedPathRegex = /['"]([^'"]*[\/\\][^'"]*)['"]/g
  let match
  
  while ((match = quotedPathRegex.exec(command)) !== null) {
    if (match[1] && !match[1].startsWith('-')) {
      paths.push(match[1])
    }
  }

  // 匹配 --xxx=path 或 -x path 格式中的路径
  const optionPathRegex = /(?:--?\w+[= ])([^\s&|;'"`<>]+)/g
  
  while ((match = optionPathRegex.exec(command)) !== null) {
    const potentialPath = match[1]
    
    // 过滤掉明显的非路径（选项、标志等）
    if (
      potentialPath &&
      !potentialPath.startsWith('-') &&
      (potentialPath.includes('/') || potentialPath.includes('\\') || potentialPath.includes('.'))
    ) {
      paths.push(potentialPath)
    }
  }

  return [...new Set(paths)] // 去重
}

/**
 * PowerShell 命令特定安全检查
 * 
 * 检测危险的 PowerShell 操作：
 * - Set-Location 到父目录
 * - 访问敏感位置
 * - 危险 cmdlet
 */
function validatePowerShellCommand(command: string): PathValidationResult {
  const trimmed = command.trim().toLowerCase()

  // 检测 Set-Location/CD/Push-Location 到父目录
  if (/(set-location|sl|cd|push-location)[\s]+(\.\.|[a-z]:\\..)/i.test(command)) {
    return {
      allowed: false,
      reason: '❌ 安全限制：PowerShell 中禁止切换到父目录。',
      severity: 'block',
    }
  }

  // 检测访问 Windows 系统目录
  const systemDirs = ['c:\\windows', 'c:\\program files', 'c:\\users']
  
  for (const sysDir of systemDirs) {
    if (trimmed.includes(sysDir.toLowerCase())) {
      return {
        allowed: false,
        reason: `🔒 安全限制：禁止直接访问系统目录 (${sysDir})。`,
        severity: 'block',
      }
    }
  }

  return { allowed: true }
}

// ==================== 辅助工具函数 ====================

/**
 * 清理用户输入的路径，移除危险字符
 * 
 * @param rawPath - 原始路径输入
 * @returns 清理后的安全路径
 */
export function sanitizePath(rawPath: string): string {
  let sanitized = rawPath.trim()
  
  // 移除空字节和其他控制字符
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '')
  
  // 移除多余的斜杠
  sanitized = sanitized.replace(/[\/\\]+/g, '/')
  
  // 移除末尾的斜杠（保留根路径 /）
  if (sanitized.length > 1) {
    sanitized = sanitized.replace(/\/+$/, '')
  }
  
  return sanitized
}

/**
 * 获取相对于工作目录的安全相对路径
 * 
 * 如果目标路径在工作目录内，返回相对路径；
 * 否则返回 null 表示不安全。
 * 
 * @param targetPath - 目标路径
 * @param workingDir - 工作目录
 * @returns 安全的相对路径，如果不安全则返回 null
 */
export function getSafeRelativePath(
  targetPath: string,
  workingDir: string
): string | null {
  const validation = validatePathWithinRoot(targetPath, workingDir)
  
  if (!validation.allowed || !validation.resolvedPath) {
    return null
  }
  
  try {
    const relPath = relative(workingDir, validation.resolvedPath)
    
    // 确保相对路径不以 .. 开头
    if (relPath.startsWith('..')) {
      return null
    }
    
    return relPath
  } catch {
    return null
  }
}

/**
 * 检查路径是否为潜在的上层目录访问尝试
 * 
 * @param path - 要检查的路径
 * @returns 如果是可疑的上层访问则返回 true
 */
export function containsParentDirectoryReference(path: string): boolean {
  // 检查各种形式的父目录引用
  const patterns = [
    /\.\./,                    // ..
    /\.\.[\/\\]/,              // ../ 或 ..\
    /[\/\\]\.\.(?=[\/\\]|$)/,  // /.. 或 \..
    /^\.\.$/,                  // 单独的 ..
  ]
  
  return patterns.some(pattern => pattern.test(path))
}
