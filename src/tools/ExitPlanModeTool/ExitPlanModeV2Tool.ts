import { feature } from 'bun:bundle'
import { writeFile } from 'fs/promises'
import { z } from 'zod/v4'
import {
  getAllowedChannels,
  hasExitedPlanModeInSession,
  setHasExitedPlanMode,
  setNeedsAutoModeExitAttachment,
  setNeedsPlanModeExitAttachment,
} from '../../bootstrap/state.js'
import { logEvent } from '../../services/analytics/index.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/metadata.js'
import {
  buildTool,
  type Tool,
  type ToolDef,
  toolMatchesName,
} from '../../Tool.js'
import { formatAgentId, generateRequestId } from '../../utils/agentId.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  findInProcessTeammateTaskId,
  setAwaitingPlanApproval,
} from '../../utils/inProcessTeammateHelpers.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logError } from '../../utils/log.js'
import {
  getPlan,
  getPlanFilePath,
  persistFileSnapshotIfRemote,
} from '../../utils/plans.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  getAgentName,
  getTeamName,
  isPlanModeRequired,
  isTeammate,
} from '../../utils/teammate.js'
import { writeToMailbox } from '../../utils/teammateMailbox.js'
import { AGENT_TOOL_NAME } from '../AgentTool/constants.js'
import { TEAM_CREATE_TOOL_NAME } from '../TeamCreateTool/constants.js'
import { EXIT_PLAN_MODE_V2_TOOL_NAME } from './constants.js'
import { EXIT_PLAN_MODE_V2_TOOL_PROMPT } from './prompt.js'
import {
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseRejectedMessage,
} from './UI.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('../../utils/permissions/autoModeState.js') as typeof import('../../utils/permissions/autoModeState.js'))
  : null
const permissionSetupModule = feature('TRANSCRIPT_CLASSIFIER')
  ? (require('../../utils/permissions/permissionSetup.js') as typeof import('../../utils/permissions/permissionSetup.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * 基于提示的权限请求模式。
 * 在退出计划模式时供 Claude 请求语义权限。
 */
const allowedPromptSchema = lazySchema(() =>
  z.object({
    tool: z.enum(['Bash']).describe('此提示适用的工具'),
    prompt: z
      .string()
      .describe(
        '操作的语义描述，例如 "run tests"、"install dependencies"',
      ),
  }),
)

export type AllowedPrompt = z.infer<ReturnType<typeof allowedPromptSchema>>

const inputSchema = lazySchema(() =>
  z
    .strictObject({
      // 计划请求的基于提示的权限
      allowedPrompts: z
        .array(allowedPromptSchema())
        .optional()
        .describe(
          '实施计划所需的基于提示的权限。这些描述的是操作类别而非特定命令。',
        ),
    })
    .passthrough(),
)
type InputSchema = ReturnType<typeof inputSchema>

/**
 * SDK-facing 输入模式 - 包含由 normalizeToolInput 注入的字段。
 * 内部 inputSchema 没有这些字段，因为计划是从磁盘读取的，
 * 但 SDK/hooks 看到的是包含计划和文件路径的规范化版本。
 */
export const _sdkInputSchema = lazySchema(() =>
  inputSchema().extend({
    plan: z
      .string()
      .optional()
      .describe('The plan content (injected by normalizeToolInput from disk)'),
    planFilePath: z
      .string()
      .optional()
      .describe('The plan file path (injected by normalizeToolInput)'),
  }),
)

export const outputSchema = lazySchema(() =>
  z.object({
    plan: z
      .string()
      .nullable()
      .describe('呈现给用户的计划'),
    isAgent: z.boolean(),
    filePath: z
      .string()
      .optional()
      .describe('计划保存的文件路径'),
    hasTaskTool: z
      .boolean()
      .optional()
      .describe('Agent 工具在当前上下文中是否可用'),
    planWasEdited: z
      .boolean()
      .optional()
      .describe(
        '用户是否编辑了计划（CCR web UI 或 Ctrl+G）；决定计划是否会在 tool_result 中回显',
      ),
    awaitingLeaderApproval: z
      .boolean()
      .optional()
      .describe(
        '为 true 时，队友已向团队负责人发送计划审批请求',
      ),
    requestId: z
      .string()
      .optional()
      .describe('计划审批请求的唯一标识符'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ExitPlanModeV2Tool: Tool<InputSchema, Output> = buildTool({
  name: EXIT_PLAN_MODE_V2_TOOL_NAME,
  searchHint: '提交计划供批准并开始编码（仅计划模式）',
  maxResultSizeChars: 100_000,
  async description() {
    return '提示用户退出计划模式并开始编码'
  },
  async prompt() {
    return EXIT_PLAN_MODE_V2_TOOL_PROMPT
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return ''
  },
  shouldDefer: true,
  isEnabled() {
    // 当 --channels 处于活动状态时，用户可能在 Telegram/Discord 上，而不是在观看 TUI。
    // 计划审批对话框会挂起。与 EnterPlanMode 上的相同门控配对，因此计划模式不会成为陷阱。
    if (
      (feature('KAIROS') || feature('KAIROS_CHANNELS')) &&
      getAllowedChannels().length > 0
    ) {
      return false
    }
    return true
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return false // Now writes to disk
  },
  requiresUserInteraction() {
    // 对于所有队友，不需要本地用户交互：
    // - 如果 isPlanModeRequired()：团队负责人通过邮箱批准
    // - 否则：本地退出（自愿计划模式）
    if (isTeammate()) {
      return false
    }
    // 对于非队友，需要用户确认才能退出计划模式
    return true
  },
  async validateInput(_input, { getAppState, options }) {
    // 队友 AppState 可能显示负责人的模式（runAgent.ts 在
    // acceptEdits/bypassPermissions/auto 中跳过 override）；
    // isPlanModeRequired() 是真正的来源
    if (isTeammate()) {
      return { result: true }
    }
    // 延迟工具列表会公布此工具而不考虑模式，因此模型可以在计划批准后调用它
    //（在 compact/clear 上的新鲜增量）。在 checkPermissions 之前拒绝以避免显示批准对话框。
    const mode = getAppState().toolPermissionContext.mode
    if (mode !== 'plan') {
      logEvent('tengu_exit_plan_mode_called_outside_plan', {
        model:
          options.mainLoopModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        mode: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        hasExitedPlanModeInSession: hasExitedPlanModeInSession(),
      })
      return {
        result: false,
        message:
          '您不在计划模式中。此工具仅用于在编写计划后退出计划模式。如果您的计划已被批准，请继续实施。',
        errorCode: 1,
      }
    }
    return { result: true }
  },
  async checkPermissions(input, context) {
    // 对于所有队友，跳过权限 UI 以避免发送 permission_request
    // call() 方法处理适当的行为：
    // - 如果 isPlanModeRequired()：向负责人发送 plan_approval_request
    // - 否则：本地退出计划模式（自愿计划模式）
    if (isTeammate()) {
      return {
        behavior: 'allow' as const,
        updatedInput: input,
      }
    }

    // 对于非队友，需要用户确认才能退出计划模式
    return {
      behavior: 'ask' as const,
      message: '退出计划模式？',
      updatedInput: input,
    }
  },
  renderToolUseMessage,
  renderToolResultMessage,
  renderToolUseRejectedMessage,
  async call(input, context) {
    const isAgent = !!context.agentId

    const filePath = getPlanFilePath(context.agentId)
    // CCR web UI may send an edited plan via permissionResult.updatedInput.
    // queryHelpers.ts full-replaces finalInput, so when CCR sends {} (no edit)
    // input.plan is undefined -> disk fallback. The internal inputSchema omits
    // `plan` (normally injected by normalizeToolInput), hence the narrowing.
    const inputPlan =
      'plan' in input && typeof input.plan === 'string' ? input.plan : undefined
    const plan = inputPlan ?? getPlan(context.agentId)

    // 同步磁盘以便 VerifyPlanExecution / Read 看到编辑。
    // 之后重新快照：唯一其他 persistFileSnapshotIfRemote 调用 (api.ts)
    // 在 normalizeToolInput 中运行，在权限之前 —— 它捕获了旧计划。
    if (inputPlan !== undefined && filePath) {
      await writeFile(filePath, inputPlan, 'utf-8').catch(e => logError(e))
      void persistFileSnapshotIfRemote()
    }

    // 检查这是否是需要负责人批准的队友
    if (isTeammate() && isPlanModeRequired()) {
      // Plan is required for plan_mode_required teammates
      if (!plan) {
        throw new Error(
          `未找到计划文件 ${filePath}。请在调用 ExitPlanMode 之前将您的计划写入此文件。`,
        )
      }
      const agentName = getAgentName() || 'unknown'
      const teamName = getTeamName()
      const requestId = generateRequestId(
        'plan_approval',
        formatAgentId(agentName, teamName || 'default'),
      )

      const approvalRequest = {
        type: 'plan_approval_request',
        from: agentName,
        timestamp: new Date().toISOString(),
        planFilePath: filePath,
        planContent: plan,
        requestId,
      }

      await writeToMailbox(
        'team-lead',
        {
          from: agentName,
          text: jsonStringify(approvalRequest),
          timestamp: new Date().toISOString(),
        },
        teamName,
      )

      // 更新任务状态以显示等待批准（用于进程内队友）
      const appState = context.getAppState()
      const agentTaskId = findInProcessTeammateTaskId(agentName, appState)
      if (agentTaskId) {
        setAwaitingPlanApproval(agentTaskId, context.setAppState, true)
      }

      return {
        data: {
          plan,
          isAgent: true,
          filePath,
          awaitingLeaderApproval: true,
          requestId,
        },
      }
    }

    // 注意：后台验证钩子在 REPL.tsx 中的上下文清除之后通过
    // registerPlanVerificationHook() 注册。在此注册会在上下文清除期间被清除。

    // 确保在退出计划模式时更改模式。
    // 这处理了权限流程未设置模式的情况
    //（例如：当 PermissionRequest 钩子自动批准而未提供 updatedPermissions）。
    const appState = context.getAppState()
    // 在 setAppState 之前计算门控回退，以便我们可以通知用户。
    // 断路器防御：如果 prePlanMode 是类似 auto 的模式但现在门控关闭了
    //（断路器或设置禁用），则恢复到 'default'。
    // 没有这个，ExitPlanMode 会通过直接调用 setAutoModeActive(true) 来绕过断路器。
    let gateFallbackNotification: string | null = null
    if (feature('TRANSCRIPT_CLASSIFIER')) {
      const prePlanRaw = appState.toolPermissionContext.prePlanMode ?? 'default'
      if (
        prePlanRaw === 'auto' &&
        !(permissionSetupModule?.isAutoModeGateEnabled() ?? false)
      ) {
        const reason =
          permissionSetupModule?.getAutoModeUnavailableReason() ??
          'circuit-breaker'
        gateFallbackNotification =
          permissionSetupModule?.getAutoModeUnavailableNotification(reason) ??
          'auto mode unavailable'
        logForDebugging(
          `[auto-mode gate @ ExitPlanModeV2Tool] prePlanMode=${prePlanRaw} ` +
            `but gate is off (reason=${reason}) — falling back to default on plan exit`,
          { level: 'warn' },
        )
      }
    }
    if (gateFallbackNotification) {
      context.addNotification?.({
        key: 'auto-mode-gate-plan-exit-fallback',
        text: `plan exit → default · ${gateFallbackNotification}`,
        priority: 'immediate',
        color: 'warning',
        timeoutMs: 10000,
      })
    }

    context.setAppState(prev => {
      if (prev.toolPermissionContext.mode !== 'plan') return prev
      setHasExitedPlanMode(true)
      setNeedsPlanModeExitAttachment(true)
      let restoreMode = prev.toolPermissionContext.prePlanMode ?? 'default'
      if (feature('TRANSCRIPT_CLASSIFIER')) {
        if (
          restoreMode === 'auto' &&
          !(permissionSetupModule?.isAutoModeGateEnabled() ?? false)
        ) {
          restoreMode = 'default'
        }
        const finalRestoringAuto = restoreMode === 'auto'
        // 捕获预恢复状态 —— isAutoModeActive() 是权威信号
        //（prePlanMode/strippedDangerousRules 在 transitionPlanAutoMode 
        // 停用后是过时的）。
        const autoWasUsedDuringPlan =
          autoModeStateModule?.isAutoModeActive() ?? false
        autoModeStateModule?.setAutoModeActive(finalRestoringAuto)
        if (autoWasUsedDuringPlan && !finalRestoringAuto) {
          setNeedsAutoModeExitAttachment(true)
        }
      }
      // 如果恢复到非自动模式且权限被剥离（要么是从 auto 进入计划时，
      // 要么是从 shouldPlanUseAutoMode），则恢复它们。
      // 如果恢复到 auto，则保持剥离状态。
      const restoringToAuto = restoreMode === 'auto'
      let baseContext = prev.toolPermissionContext
      if (restoringToAuto) {
        baseContext =
          permissionSetupModule?.stripDangerousPermissionsForAutoMode(
            baseContext,
          ) ?? baseContext
      } else if (prev.toolPermissionContext.strippedDangerousRules) {
        baseContext =
          permissionSetupModule?.restoreDangerousPermissions(baseContext) ??
          baseContext
      }
      return {
        ...prev,
        toolPermissionContext: {
          ...baseContext,
          mode: restoreMode,
          prePlanMode: undefined,
        },
      }
    })

    const hasTaskTool =
      isAgentSwarmsEnabled() &&
      context.options.tools.some(t => toolMatchesName(t, AGENT_TOOL_NAME))

    return {
      data: {
        plan,
        isAgent,
        filePath,
        hasTaskTool: hasTaskTool || undefined,
        planWasEdited: inputPlan !== undefined || undefined,
      },
    }
  },
  mapToolResultToToolResultBlockParam(
    {
      isAgent,
      plan,
      filePath,
      hasTaskTool,
      planWasEdited,
      awaitingLeaderApproval,
      requestId,
    },
    toolUseID,
  ) {
    // 处理等待负责人批准的队友
    if (awaitingLeaderApproval) {
      return {
        type: 'tool_result',
        content: `您的计划已提交给团队负责人审批。

计划文件：${filePath}

**接下来会发生什么：**
1. 等待团队负责人审核您的计划
2. 您将在收件箱中收到批准/拒绝消息
3. 如果批准，您可以继续实施
4. 如果被拒绝，根据反馈完善您的计划

**重要：** 在收到批准之前不要继续。查看您的收件箱获取回复。

请求 ID：${requestId}`,
        tool_use_id: toolUseID,
      }
    }

    if (isAgent) {
      return {
        type: 'tool_result',
        content:
          '用户已批准计划。您现在不需要做任何事情。请回复"ok"',
        tool_use_id: toolUseID,
      }
    }

    // 处理空计划
    if (!plan || plan.trim() === '') {
      return {
        type: 'tool_result',
        content: '用户已批准退出计划模式。您现在可以继续。',
        tool_use_id: toolUseID,
      }
    }

    const teamHint = hasTaskTool
      ? `\n\n如果这个计划可以分解为多个独立任务，请考虑使用 ${TEAM_CREATE_TOOL_NAME} 工具创建团队并行工作。`
      : ''

    // 始终包含计划 —— Ultraplan CCR 流程中的 extractApprovedPlan()
    // 解析 tool_result 以检索本地 CLI 的计划文本。
    // 标记编辑的计划，以便模型知道用户更改了内容。
    const planLabel = planWasEdited
      ? '批准的计划（已由用户编辑）'
      : '批准的计划'

    return {
      type: 'tool_result',
      content: `用户已批准您的计划。您现在可以开始编码。如果适用的话，先更新您的待办列表。

您的计划已保存到：${filePath}
您可以在实施过程中需要时参考它。${teamHint}

## ${planLabel}：
${plan}`,
      tool_use_id: toolUseID,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
