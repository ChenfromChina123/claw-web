/**
 * Sleep 工具 - 暂停执行
 * 
 * 这个工具用于在任务执行中引入延迟。
 */

import type { Tool, ToolResult, ToolExecutionContext } from './enhancedToolExecutor'

export interface SleepInput {
  duration: number
}

export interface SleepOutput {
  slept: number
  actualDuration: number
}

/**
 * 验证 Sleep 输入
 */
export function validateSleepInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['输入必须是对象'] }
  }
  
  const { duration } = input as Record<string, unknown>
  
  if (duration === undefined || duration === null) {
    errors.push('duration 是必需参数')
    return { valid: false, errors }
  }
  
  if (typeof duration !== 'number') {
    errors.push('duration 必须是数字')
    return { valid: false, errors }
  }
  
  if (duration < 0) {
    errors.push('duration 不能为负数')
  }
  
  if (duration > 300000) {
    errors.push('duration 不能超过 300000 毫秒（5分钟）')
  }
  
  return { valid: errors.length === 0, errors }
}

/**
 * Sleep 工具实现
 */
export async function executeSleepTool(
  input: SleepInput,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const validation = validateSleepInput(input)
  
  if (!validation.valid) {
    return {
      success: false,
      error: `输入验证失败:\n${validation.errors.join('\n')}`,
    }
  }
  
  const { duration } = input
  const startTime = Date.now()
  
  try {
    // 使用 Promise 实现延迟
    await new Promise(resolve => setTimeout(resolve, duration))
    
    const actualDuration = Date.now() - startTime
    
    return {
      success: true,
      result: {
        slept: duration,
        actualDuration,
        message: `已暂停 ${actualDuration} 毫秒`,
      } as SleepOutput,
    }
  } catch (error) {
    return {
      success: false,
      error: `Sleep 执行失败: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * 创建 Sleep 工具定义
 */
export function createSleepToolDefinition(): Tool {
  return {
    name: 'Sleep',
    description: '暂停执行指定的时间（毫秒）',
    inputSchema: {
      type: 'object',
      properties: {
        duration: {
          type: 'number',
          description: '暂停时长（毫秒）',
          minimum: 0,
          maximum: 300000,
        },
      },
      required: ['duration'],
    },
    category: 'system',
    handler: executeSleepTool,
  }
}
