import type { Command, CommandResult, CommandContext } from '../types/commands'

/**
 * 命令处理器接口
 * 定义命令系统的统一抽象
 */
export interface ICommandHandler {
  /**
   * 执行命令
   */
  execute(
    commandStr: string,
    context: CommandContext
  ): Promise<CommandResult>
  
  /**
   * 注册命令
   */
  registerCommand(command: Command): void
  
  /**
   * 获取所有已注册的命令
   */
  getCommands(): Command[]
  
  /**
   * 获取命令历史
   */
  getHistory(sessionId?: string, limit?: number): Array<{
    command: string
    timestamp: number
    sessionId: string
    result: CommandResult
  }>
}
