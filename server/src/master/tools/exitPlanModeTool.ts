/**
 * ExitPlanMode 工具 - 退出计划模式
 * 
 * 这个工具用于退出计划模式，继续实际执行。
 */

import type { Tool } from '../integration/webStore'
import type { ToolResult, ToolExecutionContext } from '../integration/enhancedToolExecutor'

export interface ExitPlanModeInput {
  mode?: 'approve' | 'reject' | 'cancel'
  reason?: string
}

export interface ExitPlanModeOutput {
  action: 'approved' | 'rejected' | 'cancelled'
  previousMode: string
  newMode: string
  reason?: string
}

/**
 * 验证 ExitPlanMode 输入
 */
export function validateExitPlanModeInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['输入必须是对象'] }
  }
  
  const { mode } = input as Record<string, unknown>
  
  const validModes = ['approve', 'reject', 'cancel']
  if (mode !== undefined && !validModes.includes(mode as string)) {
    errors.push(`mode 必须是以下之一: ${validModes.join(', ')}`)
  }
  
  return { valid: errors.length === 0, errors }
}

/**
 * ExitPlanMode 工具实现
 */
export async function executeExitPlanModeTool(
  input: ExitPlanModeInput,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const validation = validateExitPlanModeInput(input)
  
  if (!validation.valid) {
    return {
      success: false,
      error: `输入验证失败:\n${validation.errors.join('\n')}`,
    }
  }
  
  const { mode = 'approve', reason } = input
  
  try {
    // 检查当前是否处于计划模式
    // 注意：这需要在执行上下文中检查
    
    // 确定操作
    let action: 'approved' | 'rejected' | 'cancelled'
    switch (mode) {
      case 'approve':
        action = 'approved'
        break
      case 'reject':
        action = 'rejected'
        break
      case 'cancel':
        action = 'cancelled'
        break
      default:
        action = 'approved'
    }
    
    return {
      success: true,
      result: {
        action,
        previousMode: 'plan',
        newMode: action === 'rejected' || action === 'cancelled' ? 'idle' : 'execution',
        reason,
        message: action === 'approved' 
          ? '计划已批准，退出计划模式' 
          : action === 'rejected' 
            ? '计划已拒绝，退出计划模式' 
            : '计划已取消，退出计划模式',
      } as ExitPlanModeOutput,
    }
  } catch (error) {
    return {
      success: false,
      error: `退出计划模式失败: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * 创建 ExitPlanMode 工具定义
 */
export function createExitPlanModeToolDefinition(): Tool & { handler: any } {
  return {
    name: 'ExitPlanMode',
    description: '退出计划模式，继续实际执行或取消任务',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: '操作模式',
          enum: ['approve', 'reject', 'cancel'],
          default: 'approve',
        },
        reason: {
          type: 'string',
          description: '原因或备注（可选）',
        },
      },
    },
    category: 'plan',
    handler: executeExitPlanModeTool,
  }
}
