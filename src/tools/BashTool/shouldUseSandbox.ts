import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import { splitCommand_DEPRECATED } from '../../utils/bash/commands.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'
import {
  BINARY_HIJACK_VARS,
  bashPermissionRule,
  matchWildcardPattern,
  stripAllLeadingEnvVars,
  stripSafeWrappers,
} from './bashPermissions.js'

type SandboxInput = {
  command?: string
  dangerouslyDisableSandbox?: boolean
}

// 注意：excludedCommands 是一个面向用户的便利功能，而不是安全边界。
// 能够绕过 excludedCommands 并不是安全漏洞——沙箱权限
// 系统（提示用户）才是真正的安全控制。
function containsExcludedCommand(command: string): boolean {
  // 检查动态配置中的禁用命令和子字符串（仅针对 ants）
  if (process.env.USER_TYPE === 'ant') {
    const disabledCommands = getFeatureValue_CACHED_MAY_BE_STALE<{
      commands: string[]
      substrings: string[]
    }>('tengu_sandbox_disabled_commands', { commands: [], substrings: [] })

    // 检查命令是否包含任何禁用的子字符串
    for (const substring of disabledCommands.substrings) {
      if (command.includes(substring)) {
        return true
      }
    }

    // 检查命令是否以任何禁用命令开头
    try {
      const commandParts = splitCommand_DEPRECATED(command)
      for (const part of commandParts) {
        const baseCommand = part.trim().split(' ')[0]
        if (baseCommand && disabledCommands.commands.includes(baseCommand)) {
          return true
        }
      }
    } catch {
      // 如果我们无法解析命令（例如，格式错误的 bash 语法），
      // 将其视为不排除，以允许其他验证检查处理它
      // 这可以防止在渲染工具使用消息时崩溃
    }
  }

  // 从设置中检查用户配置的排除命令
  const settings = getSettings_DEPRECATED()
  const userExcludedCommands = settings.sandbox?.excludedCommands ?? []

  if (userExcludedCommands.length === 0) {
    return false
  }

  // 将复合命令（例如 "docker ps && curl evil.com"）拆分为单独的
  // 子命令，并针对排除模式检查每个子命令。这可以防止
  // 复合命令仅因为其第一个子命令匹配排除模式而逃离沙箱。
  let subcommands: string[]
  try {
    subcommands = splitCommand_DEPRECATED(command)
  } catch {
    subcommands = [command]
  }

  for (const subcommand of subcommands) {
    const trimmed = subcommand.trim()
    // 还尝试匹配剥离了环境变量前缀和包装器命令的情况，因此
    // `FOO=bar bazel ...` 和 `timeout 30 bazel ...` 可以匹配 `bazel:*`。这不是
    // 安全边界（参见顶部的注释）；上面的 &&-split 已经允许
    // `export FOO=bar && bazel ...` 匹配。BINARY_HIJACK_VARS 作为启发式保留。
    //
    // 我们迭代地应用两种剥离操作，直到没有产生新的候选者（不动点），
    // 与 filterRulesByContentsMatchingInput 中的方法相匹配。
    // 这处理像 `timeout 300 FOO=bar bazel run` 这样的交错模式，
    // 其中单次传递组合会失败。
    const candidates = [trimmed]
    const seen = new Set(candidates)
    let startIdx = 0
    while (startIdx < candidates.length) {
      const endIdx = candidates.length
      for (let i = startIdx; i < endIdx; i++) {
        const cmd = candidates[i]!
        const envStripped = stripAllLeadingEnvVars(cmd, BINARY_HIJACK_VARS)
        if (!seen.has(envStripped)) {
          candidates.push(envStripped)
          seen.add(envStripped)
        }
        const wrapperStripped = stripSafeWrappers(cmd)
        if (!seen.has(wrapperStripped)) {
          candidates.push(wrapperStripped)
          seen.add(wrapperStripped)
        }
      }
      startIdx = endIdx
    }

    for (const pattern of userExcludedCommands) {
      const rule = bashPermissionRule(pattern)
      for (const cand of candidates) {
        switch (rule.type) {
          case 'prefix':
            if (cand === rule.prefix || cand.startsWith(rule.prefix + ' ')) {
              return true
            }
            break
          case 'exact':
            if (cand === rule.command) {
              return true
            }
            break
          case 'wildcard':
            if (matchWildcardPattern(rule.pattern, cand)) {
              return true
            }
            break
        }
      }
    }
  }

  return false
}

export function shouldUseSandbox(input: Partial<SandboxInput>): boolean {
  if (!SandboxManager.isSandboxingEnabled()) {
    return false
  }

  // 如果显式覆盖并且策略允许非沙箱命令，则不使用沙箱
  if (
    input.dangerouslyDisableSandbox &&
    SandboxManager.areUnsandboxedCommandsAllowed()
  ) {
    return false
  }

  if (!input.command) {
    return false
  }

  // 如果命令包含用户配置的排除命令，则不使用沙箱
  if (containsExcludedCommand(input.command)) {
    return false
  }

  return true
}
