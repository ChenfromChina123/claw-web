import type { Tool, ToolResult } from '../types/tools'

/**
 * 工具执行器接口
 * 定义工具系统的统一抽象
 */
export interface IToolExecutor {
  /**
   * 执行工具
   */
  executeTool(
    toolName: string,
    input: Record<string, unknown>,
    sessionId?: string
  ): Promise<ToolResult>
  
  /**
   * 获取所有可用工具
   */
  getTools(): Tool[]
  
  /**
   * 检查工具是否可用
   */
  isToolAvailable(toolName: string): boolean
  
  /**
   * 获取工具调用历史
   */
  getAuditLog(sessionId?: string, limit?: number): Array<{
    toolName: string
    input: Record<string, unknown>
    result: ToolResult
    duration: number
    sessionId: string
    timestamp: number
  }>
}
