/**
 * sed 编辑命令（-i 标志替换）的解析器
 * 提取文件路径和替换模式以启用文件编辑风格的渲染
 */

import { randomBytes } from 'crypto'
import { tryParseShellCommand } from '../../utils/bash/shellQuote.js'

// BRE→ERE conversion placeholders (null-byte sentinels, never appear in user input)
const BACKSLASH_PLACEHOLDER = '\x00BACKSLASH\x00'
const PLUS_PLACEHOLDER = '\x00PLUS\x00'
const QUESTION_PLACEHOLDER = '\x00QUESTION\x00'
const PIPE_PLACEHOLDER = '\x00PIPE\x00'
const LPAREN_PLACEHOLDER = '\x00LPAREN\x00'
const RPAREN_PLACEHOLDER = '\x00RPAREN\x00'
const BACKSLASH_PLACEHOLDER_RE = new RegExp(BACKSLASH_PLACEHOLDER, 'g')
const PLUS_PLACEHOLDER_RE = new RegExp(PLUS_PLACEHOLDER, 'g')
const QUESTION_PLACEHOLDER_RE = new RegExp(QUESTION_PLACEHOLDER, 'g')
const PIPE_PLACEHOLDER_RE = new RegExp(PIPE_PLACEHOLDER, 'g')
const LPAREN_PLACEHOLDER_RE = new RegExp(LPAREN_PLACEHOLDER, 'g')
const RPAREN_PLACEHOLDER_RE = new RegExp(RPAREN_PLACEHOLDER, 'g')

export type SedEditInfo = {
  /** The file path being edited */
  filePath: string
  /** The search pattern (regex) */
  pattern: string
  /** The replacement string */
  replacement: string
  /** Substitution flags (g, i, etc.) */
  flags: string
  /** Whether to use extended regex (-E or -r flag) */
  extendedRegex: boolean
}

/**
 * 检查命令是否是 sed 就地编辑命令
 * 仅对简单的 sed -i 's/pattern/replacement/flags' file 命令返回 true
 */
export function isSedInPlaceEdit(command: string): boolean {
  const info = parseSedEditCommand(command)
  return info !== null
}

/**
 * 解析 sed 编辑命令并提取编辑信息
 * 如果不是有效的 sed 就地编辑则返回 null
 */
export function parseSedEditCommand(command: string): SedEditInfo | null {
  const trimmed = command.trim()

  // Must start with sed
  const sedMatch = trimmed.match(/^\s*sed\s+/)
  if (!sedMatch) return null

  const withoutSed = trimmed.slice(sedMatch[0].length)
  const parseResult = tryParseShellCommand(withoutSed)
  if (!parseResult.success) return null
  const tokens = parseResult.tokens

  // 提取字符串标记
  const args: string[] = []
  for (const token of tokens) {
    if (typeof token === 'string') {
      args.push(token)
    } else if (
      typeof token === 'object' &&
      token !== null &&
      'op' in token &&
      token.op === 'glob'
    ) {
      // Glob 模式对此简单解析器来说太复杂了
      return null
    }
  }

  // 解析标志和参数
  let hasInPlaceFlag = false
  let extendedRegex = false
  let expression: string | null = null
  let filePath: string | null = null

  let i = 0
  while (i < args.length) {
    const arg = args[i]!

    // 处理 -i 标志（带或不带备份后缀）
    if (arg === '-i' || arg === '--in-place') {
      hasInPlaceFlag = true
      i++
      // 在 macOS 上，-i 需要后缀参数（即使为空字符串）
      // 检查下一个参数是否看起来像备份后缀（空，或以点开头）
      // 不要消耗标志（-E、-r）或 sed 表达式（以 s、y、d 开头）
      if (i < args.length) {
        const nextArg = args[i]
        // 如果下一个参数是空字符串或以点开头，那就是备份后缀
        if (
          typeof nextArg === 'string' &&
          !nextArg.startsWith('-') &&
          (nextArg === '' || nextArg.startsWith('.'))
        ) {
          i++ // 跳过备份后缀
        }
      }
      continue
    }
    if (arg.startsWith('-i')) {
      // -i.bak 或类似（内联后缀）
      hasInPlaceFlag = true
      i++
      continue
    }

    // 处理扩展正则表达式标志
    if (arg === '-E' || arg === '-r' || arg === '--regexp-extended') {
      extendedRegex = true
      i++
      continue
    }

    // 处理带表达式的 -e 标志
    if (arg === '-e' || arg === '--expression') {
      if (i + 1 < args.length && typeof args[i + 1] === 'string') {
        // 只支持单个表达式
        if (expression !== null) return null
        expression = args[i + 1]!
        i += 2
        continue
      }
      return null
    }
    if (arg.startsWith('--expression=')) {
      if (expression !== null) return null
      expression = arg.slice('--expression='.length)
      i++
      continue
    }

    // 跳过我们不理解的其他标志
    if (arg.startsWith('-')) {
      // 未知标志 - 不安全解析
      return null
    }

    // 非标志参数
    if (expression === null) {
      // 第一个非标志参数是表达式
      expression = arg
    } else if (filePath === null) {
      // 第二个非标志参数是文件路径
      filePath = arg
    } else {
      // 超过一个文件 - 不支持简单渲染
      return null
    }

    i++
  }

  // 必须有 -i 标志、表达式和文件路径
  if (!hasInPlaceFlag || !expression || !filePath) {
    return null
  }

  // 解析替换表达式: s/pattern/replacement/flags
  // 为简单起见，仅支持 / 作为分隔符
  const substMatch = expression.match(/^s\//)
  if (!substMatch) {
    return null
  }

  const rest = expression.slice(2) // 跳过 's/'

  // 通过跟踪转义字符来查找模式和替换
  let pattern = ''
  let replacement = ''
  let flags = ''
  let state: 'pattern' | 'replacement' | 'flags' = 'pattern'
  let j = 0

  while (j < rest.length) {
    const char = rest[j]!

    if (char === '\\' && j + 1 < rest.length) {
      // 转义字符
      if (state === 'pattern') {
        pattern += char + rest[j + 1]
      } else if (state === 'replacement') {
        replacement += char + rest[j + 1]
      } else {
        flags += char + rest[j + 1]
      }
      j += 2
      continue
    }

    if (char === '/') {
      if (state === 'pattern') {
        state = 'replacement'
      } else if (state === 'replacement') {
        state = 'flags'
      } else {
        // 标志中额外的分隔符 - 意外
        return null
      }
      j++
      continue
    }

    if (state === 'pattern') {
      pattern += char
    } else if (state === 'replacement') {
      replacement += char
    } else {
      flags += char
    }
    j++
  }

  // 必须找到所有三个部分（模式、替换分隔符和可选标志）
  if (state !== 'flags') {
    return null
  }

  // 验证标志 - 只允许安全的替换标志
  const validFlags = /^[gpimIM1-9]*$/
  if (!validFlags.test(flags)) {
    return null
  }

  return {
    filePath,
    pattern,
    replacement,
    flags,
    extendedRegex,
  }
}

/**
 * 对文件内容应用 sed 替换
 * 返回应用替换后的新内容
 */
export function applySedSubstitution(
  content: string,
  sedInfo: SedEditInfo,
): string {
  // Convert sed pattern to JavaScript regex
  let regexFlags = ''

  // Handle global flag
  if (sedInfo.flags.includes('g')) {
    regexFlags += 'g'
  }

  // Handle case-insensitive flag (i or I in sed)
  if (sedInfo.flags.includes('i') || sedInfo.flags.includes('I')) {
    regexFlags += 'i'
  }

  // Handle multiline flag (m or M in sed)
  if (sedInfo.flags.includes('m') || sedInfo.flags.includes('M')) {
    regexFlags += 'm'
  }

  // Convert sed pattern to JavaScript regex pattern
  let jsPattern = sedInfo.pattern
    // Unescape \/ to /
    .replace(/\\\//g, '/')

  // 在 BRE 模式下（无 -E 标志），元字符有相反的转义:
  // BRE: \+ 表示 "一个或多个"，+ 是字面的
  // ERE/JS: + 表示 "一个或多个"，\+ 是字面的
  // 我们需要将 BRE 转义转换为 ERE 用于 JavaScript 正则表达式
  if (!sedInfo.extendedRegex) {
    jsPattern = jsPattern
      // 步骤 1: 保护字面反斜杠 (\\) - 在 BRE 和 ERE 中，\\ 都是字面反斜杠
      .replace(/\\\\/g, BACKSLASH_PLACEHOLDER)
      // 步骤 2: 用占位符替换转义的元字符（这些应该在 JS 中变成非转义）
      .replace(/\\\+/g, PLUS_PLACEHOLDER)
      .replace(/\\\?/g, QUESTION_PLACEHOLDER)
      .replace(/\\\|/g, PIPE_PLACEHOLDER)
      .replace(/\\\(/g, LPAREN_PLACEHOLDER)
      .replace(/\\\)/g, RPAREN_PLACEHOLDER)
      // 步骤 3: 转义未转义的元字符（这些在 BRE 中是字面的）
      .replace(/\+/g, '\\+')
      .replace(/\?/g, '\\?')
      .replace(/\|/g, '\\|')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      // 步骤 4: 用它们的 JS 等价物替换占位符
      .replace(BACKSLASH_PLACEHOLDER_RE, '\\\\')
      .replace(PLUS_PLACEHOLDER_RE, '+')
      .replace(QUESTION_PLACEHOLDER_RE, '?')
      .replace(PIPE_PLACEHOLDER_RE, '|')
      .replace(LPAREN_PLACEHOLDER_RE, '(')
      .replace(RPAREN_PLACEHOLDER_RE, ')')
  }

  // 在替换中取消转义 sed 特定转义
  // 将 \n 转换为换行符，& 转换为 $&（匹配）等
  // 使用随机盐的唯一占位符来防止注入攻击
  const salt = randomBytes(8).toString('hex')
  const ESCAPED_AMP_PLACEHOLDER = `___ESCAPED_AMPERSAND_${salt}___`
  const jsReplacement = sedInfo.replacement
    // Unescape \/ to /
    .replace(/\\\//g, '/')
    // First escape \& to a placeholder
    .replace(/\\&/g, ESCAPED_AMP_PLACEHOLDER)
    // Convert & to $& (full match) - use $$& to get literal $& in output
    .replace(/&/g, '$$&')
    // Convert placeholder back to literal &
    .replace(new RegExp(ESCAPED_AMP_PLACEHOLDER, 'g'), '&')

  try {
    const regex = new RegExp(jsPattern, regexFlags)
    return content.replace(regex, jsReplacement)
  } catch {
    // If regex is invalid, return original content
    return content
  }
}
