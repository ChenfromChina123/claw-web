import { homedir } from 'os'
import { isAbsolute, resolve } from 'path'
import type { z } from 'zod/v4'
import type { ToolPermissionContext } from '../../Tool.js'
import type { Redirect, SimpleCommand } from '../../utils/bash/ast.js'
import {
  extractOutputRedirections,
  splitCommand_DEPRECATED,
} from '../../utils/bash/commands.js'
import { tryParseShellCommand } from '../../utils/bash/shellQuote.js'
import { getDirectoryForPath } from '../../utils/path.js'
import { allWorkingDirectories } from '../../utils/permissions/filesystem.js'
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js'
import { createReadRuleSuggestion } from '../../utils/permissions/PermissionUpdate.js'
import type { PermissionUpdate } from '../../utils/permissions/PermissionUpdateSchema.js'
import {
  expandTilde,
  type FileOperationType,
  formatDirectoryList,
  isDangerousRemovalPath,
  validatePath,
} from '../../utils/permissions/pathValidation.js'
import type { BashTool } from './BashTool.js'
import { stripSafeWrappers } from './bashPermissions.js'
import { sedCommandIsAllowedByAllowlist } from './sedValidation.js'

export type PathCommand =
  | 'cd'
  | 'ls'
  | 'find'
  | 'mkdir'
  | 'touch'
  | 'rm'
  | 'rmdir'
  | 'mv'
  | 'cp'
  | 'cat'
  | 'head'
  | 'tail'
  | 'sort'
  | 'uniq'
  | 'wc'
  | 'cut'
  | 'paste'
  | 'column'
  | 'tr'
  | 'file'
  | 'stat'
  | 'diff'
  | 'awk'
  | 'strings'
  | 'hexdump'
  | 'od'
  | 'base64'
  | 'nl'
  | 'grep'
  | 'rg'
  | 'sed'
  | 'git'
  | 'jq'
  | 'sha256sum'
  | 'sha1sum'
  | 'md5sum'

/**
 * Checks if an rm/rmdir command targets dangerous paths that should always
 * require explicit user approval, even if allowlist rules exist.
 * This prevents catastrophic data loss from commands like `rm -rf /`.
 */
function checkDangerousRemovalPaths(
  command: 'rm' | 'rmdir',
  args: string[],
  cwd: string,
): PermissionResult {
  // Extract paths using the existing path extractor
  const extractor = PATH_EXTRACTORS[command]
  const paths = extractor(args)

  for (const path of paths) {
    // Expand tilde and resolve to absolute path
    // NOTE: We check the path WITHOUT resolving symlinks, because dangerous paths
    // like /tmp should be caught even though /tmp is a symlink to /private/tmp on macOS
    const cleanPath = expandTilde(path.replace(/^['"]|['"]$/g, ''))
    const absolutePath = isAbsolute(cleanPath)
      ? cleanPath
      : resolve(cwd, cleanPath)

    // Check if this is a dangerous path (using the non-symlink-resolved path)
    if (isDangerousRemovalPath(absolutePath)) {
      return {
        behavior: 'ask',
        message: `Dangerous ${command} operation detected: '${absolutePath}'\n\nThis command would remove a critical system directory. This requires explicit approval and cannot be auto-allowed by permission rules.`,
        decisionReason: {
          type: 'other',
          reason: `Dangerous ${command} operation on critical path: ${absolutePath}`,
        },
        // Don't provide suggestions - we don't want to encourage saving dangerous commands
        suggestions: [],
      }
    }
  }

  // No dangerous paths found
  return {
    behavior: 'passthrough',
    message: `No dangerous removals detected for ${command} command`,
  }
}

/**
 * 安全检查：提取位置（非标志）参数，正确处理 POSIX `--` 结束选项分隔符。
 *
 * 大多数命令（rm、cat、touch 等）在 `--` 处停止解析选项，
 * 并将所有后续参数视为位置参数，即使它们以 `-` 开头。
 * 简单的 `!arg.startsWith('-')` 过滤会丢弃这些参数，
 * 导致路径验证被静默跳过，攻击有效载荷如：
 *
 *   rm -- -/../.claude/settings.local.json
 *
 * 这里 `-/../.claude/settings.local.json` 以 `-` 开头，
 * 所以简单过滤器会丢弃它，验证看到零路径，返回 passthrough，
 * 文件被删除而没有提示。
 * 使用 `--` 处理后，路径被提取并验证
 * （被 isClaudeConfigFilePath/pathInAllowedWorkingPath 阻止）。
 */
function filterOutFlags(args: string[]): string[] {
  const result: string[] = []
  let afterDoubleDash = false
  for (const arg of args) {
    if (afterDoubleDash) {
      result.push(arg)
    } else if (arg === '--') {
      afterDoubleDash = true
    } else if (!arg?.startsWith('-')) {
      result.push(arg)
    }
  }
  return result
}

// Helper: Parse grep/rg style commands (pattern then paths)
function parsePatternCommand(
  args: string[],
  flagsWithArgs: Set<string>,
  defaults: string[] = [],
): string[] {
  const paths: string[] = []
  let patternFound = false
  // SECURITY: Track `--` end-of-options delimiter. After `--`, all args are
  // positional regardless of leading `-`. See filterOutFlags() doc comment.
  let afterDoubleDash = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined || arg === null) continue

    if (!afterDoubleDash && arg === '--') {
      afterDoubleDash = true
      continue
    }

    if (!afterDoubleDash && arg.startsWith('-')) {
      const flag = arg.split('=')[0]
      // Pattern flags mark that we've found the pattern
      if (flag && ['-e', '--regexp', '-f', '--file'].includes(flag)) {
        patternFound = true
      }
      // Skip next arg if flag needs it
      if (flag && flagsWithArgs.has(flag) && !arg.includes('=')) {
        i++
      }
      continue
    }

    // First non-flag is pattern, rest are paths
    if (!patternFound) {
      patternFound = true
      continue
    }
    paths.push(arg)
  }

  return paths.length > 0 ? paths : defaults
}

/**
 * 从命令参数中提取不同路径命令的路径。
 * 每个命令都有特定的处理路径和标志的逻辑。
 */
export const PATH_EXTRACTORS: Record<
  PathCommand,
  (args: string[]) => string[]
> = {
  // cd: 特殊情况 - 所有参数组成一个路径
  cd: args => (args.length === 0 ? [homedir()] : [args.join(' ')]),

  // ls: 过滤标志，默认为当前目录
  ls: args => {
    const paths = filterOutFlags(args)
    return paths.length > 0 ? paths : ['.']
  },

  // find: 在遇到真正的标志之前收集路径，也检查带路径的标志
  // 安全检查: `find -- -path` 使 `-path` 成为起点（不是谓词）。
  // GNU find 支持 `--` 以允许以 `-` 开头的搜索根目录。
  // 在 `--` 之后，我们保守地将所有剩余参数作为路径收集以进行验证。
  // 这会过度包含谓词如 `-name foo`，但 find 是只读操作，
  // 谓词解析为 cwd 内的路径（允许），因此对合法使用没有误报阻止。
  // 过度包含确保攻击路径如 `find -- -/../../etc` 被捕获。
  find: args => {
    const paths: string[] = []
    const pathFlags = new Set([
      '-newer',
      '-anewer',
      '-cnewer',
      '-mnewer',
      '-samefile',
      '-path',
      '-wholename',
      '-ilname',
      '-lname',
      '-ipath',
      '-iwholename',
    ])
    const newerPattern = /^-newer[acmBt][acmtB]$/
    let foundNonGlobalFlag = false
    let afterDoubleDash = false

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (!arg) continue

      if (afterDoubleDash) {
        paths.push(arg)
        continue
      }

      if (arg === '--') {
        afterDoubleDash = true
        continue
      }

      // Handle flags
      if (arg.startsWith('-')) {
        // Global options don't stop collection
        if (['-H', '-L', '-P'].includes(arg)) continue

        // Mark that we've seen a non-global flag
        foundNonGlobalFlag = true

        // Check if this flag takes a path argument
        if (pathFlags.has(arg) || newerPattern.test(arg)) {
          const nextArg = args[i + 1]
          if (nextArg) {
            paths.push(nextArg)
            i++ // Skip the path we just processed
          }
        }
        continue
      }

      // Only collect non-flag arguments before first non-global flag
      if (!foundNonGlobalFlag) {
        paths.push(arg)
      }
    }
    return paths.length > 0 ? paths : ['.']
  },

  // 所有简单命令：只过滤标志
  mkdir: filterOutFlags,
  touch: filterOutFlags,
  rm: filterOutFlags,
  rmdir: filterOutFlags,
  mv: filterOutFlags,
  cp: filterOutFlags,
  cat: filterOutFlags,
  head: filterOutFlags,
  tail: filterOutFlags,
  sort: filterOutFlags,
  uniq: filterOutFlags,
  wc: filterOutFlags,
  cut: filterOutFlags,
  paste: filterOutFlags,
  column: filterOutFlags,
  file: filterOutFlags,
  stat: filterOutFlags,
  diff: filterOutFlags,
  awk: filterOutFlags,
  strings: filterOutFlags,
  hexdump: filterOutFlags,
  od: filterOutFlags,
  base64: filterOutFlags,
  nl: filterOutFlags,
  sha256sum: filterOutFlags,
  sha1sum: filterOutFlags,
  md5sum: filterOutFlags,

  // tr: 特殊情况 - 跳过字符集
  tr: args => {
    const hasDelete = args.some(
      a =>
        a === '-d' ||
        a === '--delete' ||
        (a.startsWith('-') && a.includes('d')),
    )
    const nonFlags = filterOutFlags(args)
    return nonFlags.slice(hasDelete ? 1 : 2) // 跳过 SET1 或 SET1+SET2
  },

  // grep: 模式然后路径，默认为 stdin
  grep: args => {
    const flags = new Set([
      '-e',
      '--regexp',
      '-f',
      '--file',
      '--exclude',
      '--include',
      '--exclude-dir',
      '--include-dir',
      '-m',
      '--max-count',
      '-A',
      '--after-context',
      '-B',
      '--before-context',
      '-C',
      '--context',
    ])
    const paths = parsePatternCommand(args, flags)
    // 特殊情况: 如果存在 -r/-R 标志且没有路径，使用当前目录
    if (
      paths.length === 0 &&
      args.some(a => ['-r', '-R', '--recursive'].includes(a))
    ) {
      return ['.']
    }
    return paths
  },

  // rg: 模式然后路径，默认为当前目录
  rg: args => {
    const flags = new Set([
      '-e',
      '--regexp',
      '-f',
      '--file',
      '-t',
      '--type',
      '-T',
      '--type-not',
      '-g',
      '--glob',
      '-m',
      '--max-count',
      '--max-depth',
      '-r',
      '--replace',
      '-A',
      '--after-context',
      '-B',
      '--before-context',
      '-C',
      '--context',
    ])
    return parsePatternCommand(args, flags, ['.'])
  },

  // sed: 就地处理文件或从 stdin 读取
  sed: args => {
    const paths: string[] = []
    let skipNext = false
    let scriptFound = false
    // SECURITY: Track `--` end-of-options delimiter. After `--`, all args are
    // positional regardless of leading `-`. See filterOutFlags() doc comment.
    let afterDoubleDash = false

    for (let i = 0; i < args.length; i++) {
      if (skipNext) {
        skipNext = false
        continue
      }

      const arg = args[i]
      if (!arg) continue

      if (!afterDoubleDash && arg === '--') {
        afterDoubleDash = true
        continue
      }

      // 处理标志（仅在 `--` 之前）
      if (!afterDoubleDash && arg.startsWith('-')) {
        // -f 标志: 下一个参数是需要验证的脚本文件
        if (['-f', '--file'].includes(arg)) {
          const scriptFile = args[i + 1]
          if (scriptFile) {
            paths.push(scriptFile) // 添加脚本文件到路径以进行验证
            skipNext = true
          }
          scriptFound = true
        }
        // -e 标志: 下一个参数是表达式，不是文件
        else if (['-e', '--expression'].includes(arg)) {
          skipNext = true
          scriptFound = true
        }
        // 组合标志如 -ie 或 -nf
        else if (arg.includes('e') || arg.includes('f')) {
          scriptFound = true
        }
        continue
      }

      // 第一个非标志是脚本（如果没有通过 -e/-f 找到）
      if (!scriptFound) {
        scriptFound = true
        continue
      }

      // 其余的是文件路径
      paths.push(arg)
    }

    return paths
  },

  // jq: 过滤器然后文件路径（类似于 grep）
  // jq 命令结构: jq [flags] filter [files...]
  // 如果没有提供文件，jq 从 stdin 读取
  jq: args => {
    const paths: string[] = []
    const flagsWithArgs = new Set([
      '-e',
      '--expression',
      '-f',
      '--from-file',
      '--arg',
      '--argjson',
      '--slurpfile',
      '--rawfile',
      '--args',
      '--jsonargs',
      '-L',
      '--library-path',
      '--indent',
      '--tab',
    ])
    let filterFound = false
    // SECURITY: Track `--` end-of-options delimiter. After `--`, all args are
    // positional regardless of leading `-`. See filterOutFlags() doc comment.
    let afterDoubleDash = false

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      if (arg === undefined || arg === null) continue

      if (!afterDoubleDash && arg === '--') {
        afterDoubleDash = true
        continue
      }

      if (!afterDoubleDash && arg.startsWith('-')) {
        const flag = arg.split('=')[0]
        // Pattern flags mark that we've found the filter
        if (flag && ['-e', '--expression'].includes(flag)) {
          filterFound = true
        }
        // Skip next arg if flag needs it
        if (flag && flagsWithArgs.has(flag) && !arg.includes('=')) {
          i++
        }
        continue
      }

      // First non-flag is filter, rest are file paths
      if (!filterFound) {
        filterFound = true
        continue
      }
      paths.push(arg)
    }

    // If no file paths, jq reads from stdin (no paths to validate)
    return paths
  },

  // git: handle subcommands that access arbitrary files outside the repository
  git: args => {
    // git diff --no-index is special - it explicitly compares files outside git's control
    // This flag allows git diff to compare any two files on the filesystem, not just
    // files within the repository, which is why it needs path validation
    if (args.length >= 1 && args[0] === 'diff') {
      if (args.includes('--no-index')) {
        // SECURITY: git diff --no-index accepts `--` before file paths.
        // Use filterOutFlags which handles `--` correctly instead of naive
        // startsWith('-') filtering, to catch paths like `-/../etc/passwd`.
        const filePaths = filterOutFlags(args.slice(1))
        return filePaths.slice(0, 2) // git diff --no-index expects exactly 2 paths
      }
    }
    // Other git commands (add, rm, mv, show, etc.) operate within the repository context
    // and are already constrained by git's own security model, so they don't need
    // additional path validation
    return []
  },
}

const SUPPORTED_PATH_COMMANDS = Object.keys(PATH_EXTRACTORS) as PathCommand[]

const ACTION_VERBS: Record<PathCommand, string> = {
  cd: 'change directories to',
  ls: 'list files in',
  find: 'search files in',
  mkdir: 'create directories in',
  touch: 'create or modify files in',
  rm: 'remove files from',
  rmdir: 'remove directories from',
  mv: 'move files to/from',
  cp: 'copy files to/from',
  cat: 'concatenate files from',
  head: 'read the beginning of files from',
  tail: 'read the end of files from',
  sort: 'sort contents of files from',
  uniq: 'filter duplicate lines from files in',
  wc: 'count lines/words/bytes in files from',
  cut: 'extract columns from files in',
  paste: 'merge files from',
  column: 'format files from',
  tr: 'transform text from files in',
  file: 'examine file types in',
  stat: 'read file stats from',
  diff: 'compare files from',
  awk: 'process text from files in',
  strings: 'extract strings from files in',
  hexdump: 'display hex dump of files from',
  od: 'display octal dump of files from',
  base64: 'encode/decode files from',
  nl: 'number lines in files from',
  grep: 'search for patterns in files from',
  rg: 'search for patterns in files from',
  sed: 'edit files in',
  git: 'access files with git from',
  jq: 'process JSON from files in',
  sha256sum: 'compute SHA-256 checksums for files in',
  sha1sum: 'compute SHA-1 checksums for files in',
  md5sum: 'compute MD5 checksums for files in',
}

export const COMMAND_OPERATION_TYPE: Record<PathCommand, FileOperationType> = {
  cd: 'read',
  ls: 'read',
  find: 'read',
  mkdir: 'create',
  touch: 'create',
  rm: 'write',
  rmdir: 'write',
  mv: 'write',
  cp: 'write',
  cat: 'read',
  head: 'read',
  tail: 'read',
  sort: 'read',
  uniq: 'read',
  wc: 'read',
  cut: 'read',
  paste: 'read',
  column: 'read',
  tr: 'read',
  file: 'read',
  stat: 'read',
  diff: 'read',
  awk: 'read',
  strings: 'read',
  hexdump: 'read',
  od: 'read',
  base64: 'read',
  nl: 'read',
  grep: 'read',
  rg: 'read',
  sed: 'write',
  git: 'read',
  jq: 'read',
  sha256sum: 'read',
  sha1sum: 'read',
  md5sum: 'read',
}

/**
 * 命令特定的验证器，在路径验证之前运行。
 * 如果命令有效则返回 true，如果应该被拒绝则返回 false。
 * 用于阻止带有可能绕过路径验证的标志的命令。
 */
const COMMAND_VALIDATOR: Partial<
  Record<PathCommand, (args: string[]) => boolean>
> = {
  mv: (args: string[]) => !args.some(arg => arg?.startsWith('-')),
  cp: (args: string[]) => !args.some(arg => arg?.startsWith('-')),
}

function validateCommandPaths(
  command: PathCommand,
  args: string[],
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
  compoundCommandHasCd?: boolean,
  operationTypeOverride?: FileOperationType,
): PermissionResult {
  const extractor = PATH_EXTRACTORS[command]
  const paths = extractor(args)
  const operationType = operationTypeOverride ?? COMMAND_OPERATION_TYPE[command]

  // 安全检查: 检查特定于命令的验证器（例如，阻止可能绕过路径验证的标志）
  // 某些命令如 mv/cp 有标志（--target-directory=PATH）可以绕过路径提取，
  // 因此我们阻止这些命令的所有标志以确保安全。
  const validator = COMMAND_VALIDATOR[command]
  if (validator && !validator(args)) {
    return {
      behavior: 'ask',
      message: `${command} 带标志需要手动批准以确保路径安全。为了安全起见，Claude Code 无法自动验证使用标志的 ${command} 命令，因为某些标志如 --target-directory=PATH 可以绕过路径验证。`,
      decisionReason: {
        type: 'other',
        reason: `${command} 命令带标志需要手动批准`,
      },
    }
  }

  // 安全检查: 在包含 'cd' 的复合命令中阻止写操作
  // 这防止了通过目录更改之前的操作来绕过路径安全检查。
  // 示例攻击: cd .claude/ && mv test.txt settings.json
  // 这会绕过对 .claude/settings.json 的检查，因为路径是相对于
  // 原始 CWD 解析的，没有考虑 cd 的效果。
  //
  // 替代方法: 我们可以通过命令链跟踪有效的 CWD
  // （例如，在 "cd .claude/" 之后，后续命令将使用 CWD=".claude/" 进行验证）。
  // 这会更宽松，但需要仔细处理:
  // - 相对路径 (cd ../foo)
  // - 特殊 cd 目标 (cd ~, cd -, cd 无参数)
  // - 连续多个 cd 命令
  // - cd 目标无法确定的错误情况
  // 目前，我们采用保守方法，需要手动批准。
  if (compoundCommandHasCd && operationType !== 'read') {
    return {
      behavior: 'ask',
      message: `Commands that change directories and perform write operations require explicit approval to ensure paths are evaluated correctly. For security, Claude Code cannot automatically determine the final working directory when 'cd' is used in compound commands.`,
      decisionReason: {
        type: 'other',
        reason:
          'Compound command contains cd with write operation - manual approval required to prevent path resolution bypass',
      },
    }
  }

  for (const path of paths) {
    const { allowed, resolvedPath, decisionReason } = validatePath(
      path,
      cwd,
      toolPermissionContext,
      operationType,
    )

    if (!allowed) {
      const workingDirs = Array.from(
        allWorkingDirectories(toolPermissionContext),
      )
      const dirListStr = formatDirectoryList(workingDirs)

      // 使用安全检查的自定义原因（如果有的话，类型为 'other' 或 'safetyCheck'）
      // 否则使用标准的 "被阻止" 消息
      const message =
        decisionReason?.type === 'other' ||
        decisionReason?.type === 'safetyCheck'
          ? decisionReason.reason
          : `${command} in '${resolvedPath}' was blocked. For security, Claude Code may only ${ACTION_VERBS[command]} the allowed working directories for this session: ${dirListStr}.`

      if (decisionReason?.type === 'rule') {
        return {
          behavior: 'deny',
          message,
          decisionReason,
        }
      }

      return {
        behavior: 'ask',
        message,
        blockedPath: resolvedPath,
        decisionReason,
      }
    }
  }

  // 所有路径都有效 - 返回 passthrough
  return {
    behavior: 'passthrough',
    message: `Path validation passed for ${command} command`,
  }
}

export function createPathChecker(
  command: PathCommand,
  operationTypeOverride?: FileOperationType,
) {
  return (
    args: string[],
    cwd: string,
    context: ToolPermissionContext,
    compoundCommandHasCd?: boolean,
  ): PermissionResult => {
    // First check normal path validation (which includes explicit deny rules)
    const result = validateCommandPaths(
      command,
      args,
      cwd,
      context,
      compoundCommandHasCd,
      operationTypeOverride,
    )

    // 如果被明确拒绝，尊重该决定（不要用危险路径消息覆盖）
  if (result.behavior === 'deny') {
    return result
  }

  // 在显式拒绝规则之后但在其他结果之前检查危险移除路径
  // 这确保检查即使在用户有允许列表规则或 glob 模式被拒绝时也会运行，
  // 但尊重显式拒绝规则。危险模式会获得特定错误消息，
  // 覆盖通用的 glob 模式拒绝消息。
  if (command === 'rm' || command === 'rmdir') {
    const dangerousPathResult = checkDangerousRemovalPaths(command, args, cwd)
    if (dangerousPathResult.behavior !== 'passthrough') {
      return dangerousPathResult
    }
  }

  // 如果是 passthrough，直接返回
  if (result.behavior === 'passthrough') {
    return result
  }

  // 如果是 ask 决定，根据操作类型添加建议
  if (result.behavior === 'ask') {
    const operationType =
      operationTypeOverride ?? COMMAND_OPERATION_TYPE[command]
    const suggestions: PermissionUpdate[] = []

    // 只有在有被阻止的路径时才建议添加目录/规则
    if (result.blockedPath) {
      if (operationType === 'read') {
        // 对于读操作，建议为目录添加读取规则（仅在存在时）
        const dirPath = getDirectoryForPath(result.blockedPath)
        const suggestion = createReadRuleSuggestion(dirPath, 'session')
        if (suggestion) {
          suggestions.push(suggestion)
        }
      } else {
        // 对于写/创建操作，建议添加目录
        suggestions.push({
          type: 'addDirectories',
          directories: [getDirectoryForPath(result.blockedPath)],
          destination: 'session',
        })
      }
    }

    // 对于写操作，也建议启用接受编辑模式
    if (operationType === 'write' || operationType === 'create') {
      suggestions.push({
        type: 'setMode',
        mode: 'acceptEdits',
        destination: 'session',
      })
    }

    result.suggestions = suggestions
  }

  // 直接返回决定
    return result
  }
}

/**
 * 使用 shell-quote 解析命令参数，将 glob 对象转换为字符串。
 * 这是必要的，因为 shell-quote 将像 *.txt 这样的模式解析为 glob 对象，
 * 但我们需要它们作为字符串来进行路径验证。
 */
function parseCommandArguments(cmd: string): string[] {
  const parseResult = tryParseShellCommand(cmd, env => `$${env}`)
  if (!parseResult.success) {
    // 格式错误的 shell 语法，返回空数组
    return []
  }
  const parsed = parseResult.tokens
  const extractedArgs: string[] = []

  for (const arg of parsed) {
    if (typeof arg === 'string') {
      // 包含空字符串 - 它们是有效的参数（例如 grep "" /tmp/t）
      extractedArgs.push(arg)
    } else if (
      typeof arg === 'object' &&
      arg !== null &&
      'op' in arg &&
      arg.op === 'glob' &&
      'pattern' in arg
    ) {
      // shell-quote 将 glob 模式解析为对象，但我们需要它们作为字符串以进行验证
      extractedArgs.push(String(arg.pattern))
    }
  }

  return extractedArgs
}

/**
 * 验证单个命令的路径约束和 shell 安全性。
 *
 * 此函数:
 * 1. 解析命令参数
 * 2. 检查是否是路径命令（cd、ls、find）
 * 3. 验证 shell 注入模式
 * 4. 验证所有路径都在允许的目录内
 *
 * @param cmd - 要验证的命令字符串
 * @param cwd - 当前工作目录
 * @param toolPermissionContext - 包含允许目录的上下文
 * @param compoundCommandHasCd - 完整复合命令是否包含 cd
 * @returns PermissionResult - 如果不是路径命令则返回 'passthrough'，否则返回验证结果
 */
function validateSinglePathCommand(
  cmd: string,
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
  compoundCommandHasCd?: boolean,
): PermissionResult {
  // 安全检查: 在提取基础命令之前，先剥离包装命令（timeout、nice、nohup、time）
  // 否则，包装了这些工具的危险命令会绕过路径验证，
  // 因为会检查包装命令（如 'timeout'）而不是实际命令（如 'rm'）。
  // 示例: 'timeout 10 rm -rf /' 否则会看到 'timeout' 作为基础命令。
  const strippedCmd = stripSafeWrappers(cmd)

  // 解析命令参数，处理引号和 glob
  const extractedArgs = parseCommandArguments(strippedCmd)
  if (extractedArgs.length === 0) {
    return {
      behavior: 'passthrough',
      message: 'Empty command - no paths to validate',
    }
  }

  // 检查这是否是我们需要验证的路径命令
  const [baseCmd, ...args] = extractedArgs
  if (!baseCmd || !SUPPORTED_PATH_COMMANDS.includes(baseCmd as PathCommand)) {
    return {
      behavior: 'passthrough',
      message: `Command '${baseCmd}' is not a path-restricted command`,
    }
  }

  // 对于只读 sed 命令（如 sed -n '1,10p' file.txt），
  // 将文件路径验证为读操作而不是写操作。
  // sed 通常被归类为 'write' 以进行路径验证，但当命令是纯读操作时
  // （使用 -n 进行行打印），文件参数是只读的。
  const operationTypeOverride =
    baseCmd === 'sed' && sedCommandIsAllowedByAllowlist(strippedCmd)
      ? ('read' as FileOperationType)
      : undefined

  // 验证所有路径都在允许的目录内
  const pathChecker = createPathChecker(
    baseCmd as PathCommand,
    operationTypeOverride,
  )
  return pathChecker(args, cwd, toolPermissionContext, compoundCommandHasCd)
}

/**
 * 类似于 validateSinglePathCommand 但直接对 AST 派生的 argv 进行操作，
 * 而不是使用 shell-quote 重新解析命令字符串。
 * 避免 shell-quote 单引号反斜杠 bug 导致 parseCommandArguments
 * 静默返回 [] 并跳过路径验证。
 */
function validateSinglePathCommandArgv(
  cmd: SimpleCommand,
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
  compoundCommandHasCd?: boolean,
): PermissionResult {
  const argv = stripWrappersFromArgv(cmd.argv)
  if (argv.length === 0) {
    return {
      behavior: 'passthrough',
      message: 'Empty command - no paths to validate',
    }
  }
  const [baseCmd, ...args] = argv
  if (!baseCmd || !SUPPORTED_PATH_COMMANDS.includes(baseCmd as PathCommand)) {
    return {
      behavior: 'passthrough',
      message: `Command '${baseCmd}' is not a path-restricted command`,
    }
  }
  // sed read-only override: use .text for the allowlist check since
  // sedCommandIsAllowedByAllowlist takes a string. argv is already
  // wrapper-stripped but .text is raw tree-sitter span (includes
  // `timeout 5 ` prefix), so strip here too.
  const operationTypeOverride =
    baseCmd === 'sed' &&
    sedCommandIsAllowedByAllowlist(stripSafeWrappers(cmd.text))
      ? ('read' as FileOperationType)
      : undefined
  const pathChecker = createPathChecker(
    baseCmd as PathCommand,
    operationTypeOverride,
  )
  return pathChecker(args, cwd, toolPermissionContext, compoundCommandHasCd)
}

/**
 * 检查包含 'cd' 的复合命令中的输出重定向。
 * 这防止了通过目录更改之前的重定向来绕过路径安全检查。
 * 示例攻击: cd .claude/ && echo "malicious" > settings.json
 * 重定向目标将相对于原始 CWD 验证，但实际写入
 * 发生在 'cd' 执行后更改的目录中。
 */
function validateOutputRedirections(
  redirections: Array<{ target: string; operator: '>' | '>>' }>,
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
  compoundCommandHasCd?: boolean,
): PermissionResult {
  // SECURITY: Block output redirections in compound commands containing 'cd'
  // This prevents bypassing path safety checks via directory changes before redirections.
  // Example attack: cd .claude/ && echo "malicious" > settings.json
  // The redirection target would be validated relative to the original CWD, but the
  // actual write happens in the changed directory after 'cd' executes.
  if (compoundCommandHasCd && redirections.length > 0) {
    return {
      behavior: 'ask',
      message: `Commands that change directories and write via output redirection require explicit approval to ensure paths are evaluated correctly. For security, Claude Code cannot automatically determine the final working directory when 'cd' is used in compound commands.`,
      decisionReason: {
        type: 'other',
        reason:
          'Compound command contains cd with output redirection - manual approval required to prevent path resolution bypass',
      },
    }
  }
  for (const { target } of redirections) {
    // /dev/null is always safe - it discards output
    if (target === '/dev/null') {
      continue
    }
    const { allowed, resolvedPath, decisionReason } = validatePath(
      target,
      cwd,
      toolPermissionContext,
      'create', // Treat > and >> as create operations
    )

    if (!allowed) {
      const workingDirs = Array.from(
        allWorkingDirectories(toolPermissionContext),
      )
      const dirListStr = formatDirectoryList(workingDirs)

      // Use security check's custom reason if available (type: 'other' or 'safetyCheck')
      // Otherwise use the standard message for deny rules or working directory restrictions
      const message =
        decisionReason?.type === 'other' ||
        decisionReason?.type === 'safetyCheck'
          ? decisionReason.reason
          : decisionReason?.type === 'rule'
            ? `Output redirection to '${resolvedPath}' was blocked by a deny rule.`
            : `Output redirection to '${resolvedPath}' was blocked. For security, Claude Code may only write to files in the allowed working directories for this session: ${dirListStr}.`

      // If denied by a deny rule, return 'deny' behavior
      if (decisionReason?.type === 'rule') {
        return {
          behavior: 'deny',
          message,
          decisionReason,
        }
      }

      return {
        behavior: 'ask',
        message,
        blockedPath: resolvedPath,
        decisionReason,
        suggestions: [
          {
            type: 'addDirectories',
            directories: [getDirectoryForPath(resolvedPath)],
            destination: 'session',
          },
        ],
      }
    }
  }

  return {
    behavior: 'passthrough',
    message: 'No unsafe redirections found',
  }
}

/**
 * Checks path constraints for commands that access the filesystem (cd, ls, find).
 * Also validates output redirections to ensure they're within allowed directories.
 *
 * @returns
 * - 'ask' if any path command or redirection tries to access outside allowed directories
 * - 'passthrough' if no path commands were found or if all are within allowed directories
 */
export function checkPathConstraints(
  input: z.infer<typeof BashTool.inputSchema>,
  cwd: string,
  toolPermissionContext: ToolPermissionContext,
  compoundCommandHasCd?: boolean,
  astRedirects?: Redirect[],
  astCommands?: SimpleCommand[],
): PermissionResult {
  // 安全检查: 进程替换 >(cmd) 可以执行写入文件的命令，
  // 而这些文件不会作为重定向目标出现。例如:
  //   echo secret > >(tee .git/config)
  // tee 命令写入 .git/config 但它没有被检测为重定向。
  // 需要对任何包含进程替换的命令进行明确批准。
  // 在 AST 路径上跳过 - process_substitution 在 DANGEROUS_TYPES 中
  // 并且在到达这里之前已经返回 too-complex。
  if (!astCommands && />>\s*>\s*\(|>\s*>\s*\(|<\s*\(/.test(input.command)) {
    return {
      behavior: 'ask',
      message:
        '进程替换 (>(...) 或 <(...)) 可以执行任意命令，需要手动批准',
      decisionReason: {
        type: 'other',
        reason: '进程替换需要手动批准',
      },
    }
  }

  // 安全检查: 当 AST 派生的重定向可用时，直接使用它们，
  // 而不是用 shell-quote 重新解析。
  // shell-quote 有一个已知的单引号反斜杠 bug，
  // 它在成功解析（不是解析失败）时将重定向操作符静默合并为
  // 乱码标记，因此 fail-closed 保护没有帮助。
  // AST 已经正确解析了目标，checkSemantics 也验证了它们。
  const { redirections, hasDangerousRedirection } = astRedirects
    ? astRedirectsToOutputRedirections(astRedirects)
    : extractOutputRedirections(input.command)

  // SECURITY: If we found a redirection operator with a target containing shell expansion
  // syntax ($VAR or %VAR%), require manual approval since the target can't be safely validated.
  if (hasDangerousRedirection) {
    return {
      behavior: 'ask',
      message: 'Shell expansion syntax in paths requires manual approval',
      decisionReason: {
        type: 'other',
        reason: 'Shell expansion syntax in paths requires manual approval',
      },
    }
  }
  const redirectionResult = validateOutputRedirections(
    redirections,
    cwd,
    toolPermissionContext,
    compoundCommandHasCd,
  )
  if (redirectionResult.behavior !== 'passthrough') {
    return redirectionResult
  }

  // SECURITY: When AST-derived commands are available, iterate them with
  // pre-parsed argv instead of re-parsing via splitCommand_DEPRECATED + shell-quote.
  // shell-quote has a single-quote backslash bug that causes
  // parseCommandArguments to silently return [] and skip path validation
  // (isDangerousRemovalPath etc). The AST already resolved argv correctly.
  if (astCommands) {
    for (const cmd of astCommands) {
      const result = validateSinglePathCommandArgv(
        cmd,
        cwd,
        toolPermissionContext,
        compoundCommandHasCd,
      )
      if (result.behavior === 'ask' || result.behavior === 'deny') {
        return result
      }
    }
  } else {
    const commands = splitCommand_DEPRECATED(input.command)
    for (const cmd of commands) {
      const result = validateSinglePathCommand(
        cmd,
        cwd,
        toolPermissionContext,
        compoundCommandHasCd,
      )
      if (result.behavior === 'ask' || result.behavior === 'deny') {
        return result
      }
    }
  }

  // 始终返回 passthrough 以让其他权限检查处理命令
  return {
    behavior: 'passthrough',
    message: 'All path commands validated successfully',
  }
}

/**
 * 将 AST 派生的 Redirect[] 转换为
 * validateOutputRedirections 期望的格式。
 * 仅过滤输出重定向（排除 fd 复制如 2>&1）并将操作符映射到 '>' | '>>'。
 */
function astRedirectsToOutputRedirections(redirects: Redirect[]): {
  redirections: Array<{ target: string; operator: '>' | '>>' }>
  hasDangerousRedirection: boolean
} {
  const redirections: Array<{ target: string; operator: '>' | '>>' }> = []
  for (const r of redirects) {
    switch (r.op) {
      case '>':
      case '>|':
      case '&>':
        redirections.push({ target: r.target, operator: '>' })
        break
      case '>>':
      case '&>>':
        redirections.push({ target: r.target, operator: '>>' })
        break
      case '>&':
        // >&N（仅数字）是 fd 复制（例如 2>&1、>&10），不是文件
        // 写入。>&file 是 &>file 的已弃用形式（重定向到文件）。
        if (!/^\d+$/.test(r.target)) {
          redirections.push({ target: r.target, operator: '>' })
        }
        break
      case '<':
      case '<<':
      case '<&':
      case '<<<':
        // 输入重定向 - 跳过
        break
    }
  }
  // AST 目标是完全解析的（没有 shell 扩展）- checkSemantics
  // 已经验证了它们。不可能有危险的重定向。
  return { redirections, hasDangerousRedirection: false }
}

// ───────────────────────────────────────────────────────────────────────────
// Argv 级别的安全包装器剥离（timeout、nice、stdbuf、env、time、nohup）
//
// 这是规范化的 stripWrappersFromArgv。bashPermissions.ts 仍然
// 导出一个较旧的较窄副本（仅 timeout/nice-n-N），是死代码
// - 没有生产消费者 - 但不能删除: bashPermissions.ts 正好
// 在 Bun 的 feature() DCE 复杂度阈值，删除约 80 行会
// 静默破坏 feature('BASH_CLASSIFIER') 评估（删除
// 每个 pendingClassifierCheck spread）。
// 在 PR #21503 第 3 轮验证:
// 基线分类器测试 30/30 通过，删除后 22/30 失败。参见
// team memory: bun-feature-dce-cliff.md。在 PR #21075 + #21503
// 中命中 3 次。扩展版本在此处（唯一生产消费者）。
//
// 与以下保持同步:
//   - bashPermissions.ts 中的 SAFE_WRAPPER_PATTERNS（基于文本的 stripSafeWrappers）
//   - checkSemantics 中的包装器剥离循环 (src/utils/bash/ast.ts ~1860)
// 如果你在任一位置添加包装器，也在此处添加。不对称意味着
// checkSemantics 将包装命令暴露给语义检查，但路径
// 验证看到包装器名称 → passthrough → 包装路径从未
// 验证（PR #21503 评论 2907319120）。
// ───────────────────────────────────────────────────────────────────────────

// 安全检查: timeout 标志值的允许列表（信号为 TERM/KILL/9，
// 持续时间为 5/5s/10.5）。拒绝 $ ( ) ` | ; & 和换行符
// 以前匹配 [^ \t]+ — `timeout -k$(id) 10 ls` 不能剥离。
const TIMEOUT_FLAG_VALUE_RE = /^[A-Za-z0-9_.+-]+$/

/**
 * 解析 timeout 的 GNU 标志（长 + 短，融合 + 空格分隔）
 * 并返回 DURATION 标记的 argv 索引，如果标志不可解析则返回 -1。
 */
function skipTimeoutFlags(a: readonly string[]): number {
  let i = 1
  while (i < a.length) {
    const arg = a[i]!
    const next = a[i + 1]
    if (
      arg === '--foreground' ||
      arg === '--preserve-status' ||
      arg === '--verbose'
    )
      i++
    else if (/^--(?:kill-after|signal)=[A-Za-z0-9_.+-]+$/.test(arg)) i++
    else if (
      (arg === '--kill-after' || arg === '--signal') &&
      next &&
      TIMEOUT_FLAG_VALUE_RE.test(next)
    )
      i += 2
    else if (arg === '--') {
      i++
      break
    } // end-of-options marker
    else if (arg.startsWith('--')) return -1
    else if (arg === '-v') i++
    else if (
      (arg === '-k' || arg === '-s') &&
      next &&
      TIMEOUT_FLAG_VALUE_RE.test(next)
    )
      i += 2
    else if (/^-[ks][A-Za-z0-9_.+-]+$/.test(arg)) i++
    else if (arg.startsWith('-')) return -1
    else break
  }
  return i
}

/**
 * 解析 stdbuf 的标志（-i/-o/-e 融合/空格分隔/long-= 形式）。
 * 返回包装命令的 argv 索引，如果不可解析或没有消耗标志则返回 -1
 *（stdbuf 没有标志是惰性的）。镜像 checkSemantics (ast.ts)。
 */
function skipStdbufFlags(a: readonly string[]): number {
  let i = 1
  while (i < a.length) {
    const arg = a[i]!
    if (/^-[ioe]$/.test(arg) && a[i + 1]) i += 2
    else if (/^-[ioe]./.test(arg)) i++
    else if (/^--(input|output|error)=/.test(arg)) i++
    else if (arg.startsWith('-'))
      return -1 // unknown flag: fail closed
    else break
  }
  return i > 1 && i < a.length ? i : -1
}

/**
 * 解析 env 的 VAR=val 和安全标志（-i/-0/-v/-u NAME）。
 * 返回包装命令的 argv 索引，如果不可解析/没有包装 cmd 则返回 -1。
 * 拒绝 -S（argv 分割器）、-C/-P（altwd/altpath）。
 * 镜像 checkSemantics (ast.ts)。
 */
function skipEnvFlags(a: readonly string[]): number {
  let i = 1
  while (i < a.length) {
    const arg = a[i]!
    if (arg.includes('=') && !arg.startsWith('-')) i++
    else if (arg === '-i' || arg === '-0' || arg === '-v') i++
    else if (arg === '-u' && a[i + 1]) i += 2
    else if (arg.startsWith('-'))
      return -1 // -S/-C/-P/unknown: fail closed
    else break
  }
  return i < a.length ? i : -1
}

/**
 * stripSafeWrappers (bashPermissions.ts) 的 Argv 级对应物。
 * 从 AST 派生的 argv 剥离包装命令。
 * Env vars 已经分离到 SimpleCommand.envVars，所以这里没有 env-var 剥离。
 */
export function stripWrappersFromArgv(argv: string[]): string[] {
  let a = argv
  for (;;) {
    if (a[0] === 'time' || a[0] === 'nohup') {
      a = a.slice(a[1] === '--' ? 2 : 1)
    } else if (a[0] === 'timeout') {
      const i = skipTimeoutFlags(a)
      // 安全检查（PR #21503 第 3 轮）: 无法识别的持续时间（`.5`、`+5`、
      // `inf` — strtod 格式 GNU timeout 接受）→ 返回不变的 a。
      // 安全是因为 checkSemantics (ast.ts) 对相同输入失败 CLOSED
      // 并且首先在 bashToolHasPermission 中运行，所以我们永远不会到达这里。
      if (i < 0 || !a[i] || !/^\d+(?:\.\d+)?[smhd]?$/.test(a[i]!)) return a
      a = a.slice(i + 1)
    } else if (a[0] === 'nice') {
      // 安全检查（PR #21503 第 3 轮）: 镜像 checkSemantics - 处理裸
      // `nice cmd` 和传统 `nice -N cmd`，而不仅仅是 `nice -n N cmd`。
      // 以前只剥离 `-n N`: `nice rm /outside` →
      // baseCmd='nice' → passthrough → /outside 从未路径验证。
      if (a[1] === '-n' && a[2] && /^-?\d+$/.test(a[2]))
        a = a.slice(a[3] === '--' ? 4 : 3)
      else if (a[1] && /^-\d+$/.test(a[1])) a = a.slice(a[2] === '--' ? 3 : 2)
      else a = a.slice(a[1] === '--' ? 2 : 1)
    } else if (a[0] === 'stdbuf') {
      // 安全检查（PR #21503 第 3 轮）: PR-扩大。PR 前，
      // `stdbuf -o0 -eL rm` 被片段检查拒绝（旧的 checkSemantics
      // slice(2) 留下 name='-eL'）。PR 后，checkSemantics 剥离两个标志
      // → name='rm' → 通过。但 stripWrappersFromArgv 返回不变
      // → baseCmd='stdbuf' → 不在 SUPPORTED_PATH_COMMANDS 中 → passthrough。
      const i = skipStdbufFlags(a)
      if (i < 0) return a
      a = a.slice(i)
    } else if (a[0] === 'env') {
      // 相同的不对称: checkSemantics 剥离 env，我们没有。
      const i = skipEnvFlags(a)
      if (i < 0) return a
      a = a.slice(i)
    } else {
      return a
    }
  }
}
