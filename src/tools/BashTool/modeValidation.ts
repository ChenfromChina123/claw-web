import type { z } from 'zod/v4'
import type { ToolPermissionContext } from '../../Tool.js'
import { splitCommand_DEPRECATED } from '../../utils/bash/commands.js'
import type { PermissionResult } from '../../utils/permissions/PermissionResult.js'
import type { BashTool } from './BashTool.js'

const ACCEPT_EDITS_ALLOWED_COMMANDS = [
  'mkdir',
  'touch',
  'rm',
  'rmdir',
  'mv',
  'cp',
  'sed',
] as const

type FilesystemCommand = (typeof ACCEPT_EDITS_ALLOWED_COMMANDS)[number]

/**
 * 检查 rm/rmdir 命令是否针对危险路径，
 * 即使存在允许列表规则也需要用户明确批准。
 * 这可以防止像 `rm -rf /` 这样的灾难性数据丢失命令。
 */
function isFilesystemCommand(command: string): command is FilesystemCommand {
  return ACCEPT_EDITS_ALLOWED_COMMANDS.includes(command as FilesystemCommand)
}

function validateCommandForMode(
  cmd: string,
  toolPermissionContext: ToolPermissionContext,
): PermissionResult {
  const trimmedCmd = cmd.trim()
  const [baseCmd] = trimmedCmd.split(/\s+/)

  if (!baseCmd) {
    return {
      behavior: 'passthrough',
      message: 'Base command not found',
    }
  }

  // 在接受编辑模式下，自动允许文件系统操作
  if (
    toolPermissionContext.mode === 'acceptEdits' &&
    isFilesystemCommand(baseCmd)
  ) {
    return {
      behavior: 'allow',
      updatedInput: { command: cmd },
      decisionReason: {
        type: 'mode',
        mode: 'acceptEdits',
      },
    }
  }

  return {
    behavior: 'passthrough',
    message: `No mode-specific handling for '${baseCmd}' in ${toolPermissionContext.mode} mode`,
  }
}

/**
 * 根据当前权限模式检查命令是否应该以不同方式处理
 *
 * 这是模式权限逻辑的主入口点。
 * 目前处理接受编辑模式的文件系统命令，
 * 但设计为可扩展其他模式。
 *
 * @param input - bash命令输入
 * @param toolPermissionContext - 包含模式和权限的上下文
 * @returns
 * - 如果当前模式允许自动批准则返回 'allow'
 * - 如果命令需要在当前模式下批准则返回 'ask'
 * - 如果没有特定于模式的处理则返回 'passthrough'
 */
export function checkPermissionMode(
  input: z.infer<typeof BashTool.inputSchema>,
  toolPermissionContext: ToolPermissionContext,
): PermissionResult {
  // Skip if in bypass mode (handled elsewhere)
  if (toolPermissionContext.mode === 'bypassPermissions') {
    return {
      behavior: 'passthrough',
      message: 'Bypass mode is handled in main permission flow',
    }
  }

  // 如果处于dontAsk模式，则跳过（在主权限流程中处理）
  if (toolPermissionContext.mode === 'dontAsk') {
    return {
      behavior: 'passthrough',
      message: 'DontAsk mode is handled in main permission flow',
    }
  }

  const commands = splitCommand_DEPRECATED(input.command)

  // 检查每个子命令
  for (const cmd of commands) {
    const result = validateCommandForMode(cmd, toolPermissionContext)

    // 如果任何命令触发特定于模式的行为，返回该结果
    if (result.behavior !== 'passthrough') {
      return result
    }
  }

  // 不需要特定于模式的处理
  return {
    behavior: 'passthrough',
    message: 'No mode-specific validation required',
  }
}

export function getAutoAllowedCommands(
  mode: ToolPermissionContext['mode'],
): readonly string[] {
  return mode === 'acceptEdits' ? ACCEPT_EDITS_ALLOWED_COMMANDS : []
}
