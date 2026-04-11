import { z } from 'zod/v4'
import type { TaskStateBase } from '../../Task.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { stopTask } from '../../tasks/stopTask.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { DESCRIPTION, TASK_STOP_TOOL_NAME } from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    task_id: z
      .string()
      .optional()
      .describe('要停止的后台任务ID'),
    // shell_id 是为与已弃用的 KillShell 工具向后兼容而接受的
    shell_id: z.string().optional().describe('已弃用：请改用 task_id'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    message: z.string().describe('操作的状态消息'),
    task_id: z.string().describe('被停止的任务ID'),
    task_type: z.string().describe('被停止的任务类型'),
    // 可选：工具输出被持久化到 transcripts 并在 --resume 时重放，
    // 因此在此字段添加之前的会话缺少它。
    command: z
      .string()
      .optional()
      .describe('被停止任务的命令或描述'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const TaskStopTool = buildTool({
  name: TASK_STOP_TOOL_NAME,
  searchHint: '停止运行的后台任务',
  // KillShell 是已弃用的名称 - 作为别名保留以与现有 transcripts 和 SDK 用户向后兼容
  aliases: ['KillShell'],
  maxResultSizeChars: 100_000,
  userFacingName: () => (process.env.USER_TYPE === 'ant' ? '' : 'Stop Task'),
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  shouldDefer: true,
  isConcurrencySafe() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.task_id ?? input.shell_id ?? ''
  },
  async validateInput({ task_id, shell_id }, { getAppState }) {
    // 同时支持 task_id 和 shell_id（已弃用的 KillShell 兼容）
    const id = task_id ?? shell_id
    if (!id) {
      return {
        result: false,
        message: 'Missing required parameter: task_id',
        errorCode: 1,
      }
    }

    const appState = getAppState()
    const task = appState.tasks?.[id] as TaskStateBase | undefined

    if (!task) {
      return {
        result: false,
        message: `No task found with ID: ${id}`,
        errorCode: 1,
      }
    }

    if (task.status !== 'running') {
      return {
        result: false,
        message: `Task ${id} is not running (status: ${task.status})`,
        errorCode: 3,
      }
    }

    return { result: true }
  },
  async description() {
    return `通过 ID 停止运行的后台任务`
  },
  async prompt() {
    return DESCRIPTION
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: jsonStringify(output),
    }
  },
  renderToolUseMessage,
  renderToolResultMessage,
  async call(
    { task_id, shell_id },
    { getAppState, setAppState, abortController },
  ) {
    // 同时支持 task_id 和 shell_id（已弃用的 KillShell 兼容）
    const id = task_id ?? shell_id
    if (!id) {
      throw new Error('缺少必需参数：task_id')
    }

    const result = await stopTask(id, {
      getAppState,
      setAppState,
    })

    return {
      data: {
        message: `成功停止任务：${result.taskId} (${result.command})`,
        task_id: result.taskId,
        task_type: result.taskType,
        command: result.command,
      },
    }
  },
} satisfies ToolDef<InputSchema, Output>)
