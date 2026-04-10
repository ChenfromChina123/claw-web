/**
 * 命令执行上下文
 */
export interface CommandContext {
  sessionId: string
  userId?: string
  cwd?: string
  [key: string]: unknown
}

/**
 * 命令结果
 */
export interface CommandResult {
  success: boolean
  output?: string
  error?: string
  data?: unknown
}

/**
 * 命令定义接口
 */
export interface Command {
  name: string
  description: string
  usage: string
  aliases?: string[]
  execute: (
    args: string[], 
    context: CommandContext
  ) => Promise<CommandResult>
}

/**
 * 命令类别
 */
export type CommandCategory = 
  | 'general' 
  | 'session' 
  | 'config' 
  | 'tools' 
  | 'advanced'
