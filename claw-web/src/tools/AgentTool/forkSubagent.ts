import { feature } from 'bun:bundle'
import type { BetaToolUseBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from 'crypto'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import {
  FORK_BOILERPLATE_TAG,
  FORK_DIRECTIVE_PREFIX,
} from '../../constants/xml.js'
import { isCoordinatorMode } from '../../coordinator/coordinatorMode.js'
import type {
  AssistantMessage,
  Message as MessageType,
} from '../../types/message.js'
import { logForDebugging } from '../../utils/debug.js'
import { createUserMessage } from '../../utils/messages.js'
import type { BuiltInAgentDefinition } from './loadAgentsDir.js'

/**
 * 分叉子代理功能开关。
 *
 * 启用时：
 * - `subagent_type` 在 Agent 工具模式中变为可选
 * - 省略 `subagent_type` 触发隐式分叉：子代理继承
 *   父代理的完整对话上下文和系统提示
 * - 所有代理生成以后台（异步）运行，实现统一的
 *   `<task-notification>` 交互模型
 * - `/fork <directive>` 斜杠命令可用
 *
 * 与协调器模式互斥 —— 协调器已经拥有编排角色
 * 并有自己的委托模型。
 */
export function isForkSubagentEnabled(): boolean {
  if (feature('FORK_SUBAGENT')) {
    if (isCoordinatorMode()) return false
    if (getIsNonInteractiveSession()) return false
    return true
  }
  return false
}

/** 分叉路径触发时用于分析的综合代理类型名称。 */
export const FORK_SUBAGENT_TYPE = 'fork'

/**
 * 分叉路径的综合代理定义。
 *
 * 不在 builtInAgents 中注册 —— 仅在 `!subagent_type` 且
 * 实验激活时使用。`tools: ['*']` 配合 `useExactTools` 表示分叉
 * 子代理接收父代理的精确工具池（用于缓存相同的 API
 * 前缀）。`permissionMode: 'bubble'` 将权限提示呈现给
 * 父终端。`model: 'inherit'` 保持父代理的模型以获得上下文
 * 长度对等。
 *
 * 这里的 getSystemPrompt 未使用：分叉路径传递
 * `override.systemPrompt` 以及父代理已渲染的系统提示
 * 字节，通过 `toolUseContext.renderedSystemPrompt` 传递。重新调用
 * getSystemPrompt() 可能产生差异（GrowthBook cold→warm）并
 * 导致提示缓存失效；传递渲染的字节是字节精确的。
 */
export const FORK_AGENT = {
  agentType: FORK_SUBAGENT_TYPE,
  whenToUse:
    'Implicit fork — inherits full conversation context. Not selectable via subagent_type; triggered by omitting subagent_type when the fork experiment is active.',
  tools: ['*'],
  maxTurns: 200,
  model: 'inherit',
  permissionMode: 'bubble',
  source: 'built-in',
  baseDir: 'built-in',
  getSystemPrompt: () => '',
} satisfies BuiltInAgentDefinition

/**
 * 防止递归分叉的守卫。分叉子代理在它们的
 * 工具池中保留 Agent 工具以获得缓存相同的工具定义，
 * 因此我们通过检测对话历史记录中的分叉样板标签
 * 在调用时拒绝分叉尝试。
 */
export function isInForkChild(messages: MessageType[]): boolean {
  return messages.some(m => {
    if (m.type !== 'user') return false
    const content = m.message.content
    if (!Array.isArray(content)) return false
    return content.some(
      block =>
        block.type === 'text' &&
        block.text.includes(`<${FORK_BOILERPLATE_TAG}>`),
    )
  })
}

/** 分叉前缀中所有 tool_result 块使用的占位符文本。
 * 为了提示缓存共享，所有分叉子代理必须完全相同。 */
const FORK_PLACEHOLDER_RESULT = 'Fork started — processing in background'

/**
 * 为子代理构建分叉的对话消息。
 *
 * 为了提示缓存共享，所有分叉子代理必须产生字节相同的
 * API 请求前缀。此函数：
 * 1. 保留完整的父助手消息（所有 tool_use 块、thinking、text）
 * 2. 为每个 tool_use 块构建一个带有 tool_results 的单一用户消息，
 *    使用相同的占位符，然后追加每个子代理的指令文本块
 *
 * 结果：[...history, assistant(all_tool_uses), user(placeholder_results..., directive)]
 * 只有最终的文本块因子代理而异，最大化缓存命中。
 */
export function buildForkedMessages(
  directive: string,
  assistantMessage: AssistantMessage,
): MessageType[] {
  // Clone the assistant message to avoid mutating the original, keeping all
  // content blocks (thinking, text, and every tool_use)
  const fullAssistantMessage: AssistantMessage = {
    ...assistantMessage,
    uuid: randomUUID(),
    message: {
      ...assistantMessage.message,
      content: [...assistantMessage.message.content],
    },
  }

  // Collect all tool_use blocks from the assistant message
  const toolUseBlocks = assistantMessage.message.content.filter(
    (block): block is BetaToolUseBlock => block.type === 'tool_use',
  )

  if (toolUseBlocks.length === 0) {
    logForDebugging(
      `No tool_use blocks found in assistant message for fork directive: ${directive.slice(0, 50)}...`,
      { level: 'error' },
    )
    return [
      createUserMessage({
        content: [
          { type: 'text' as const, text: buildChildMessage(directive) },
        ],
      }),
    ]
  }

  // Build tool_result blocks for every tool_use, all with identical placeholder text
  const toolResultBlocks = toolUseBlocks.map(block => ({
    type: 'tool_result' as const,
    tool_use_id: block.id,
    content: [
      {
        type: 'text' as const,
        text: FORK_PLACEHOLDER_RESULT,
      },
    ],
  }))

  // Build a single user message: all placeholder tool_results + the per-child directive
  // TODO(smoosh): this text sibling creates a [tool_result, text] pattern on the wire
  // (renders as </function_results>\n\nHuman:<text>). One-off per-child construction,
  // not a repeated teacher, so low-priority. If we ever care, use smooshIntoToolResult
  // from src/utils/messages.ts to fold the directive into the last tool_result.content.
  const toolResultMessage = createUserMessage({
    content: [
      ...toolResultBlocks,
      {
        type: 'text' as const,
        text: buildChildMessage(directive),
      },
    ],
  })

  return [fullAssistantMessage, toolResultMessage]
}

export function buildChildMessage(directive: string): string {
  return `<${FORK_BOILERPLATE_TAG}>
STOP. READ THIS FIRST.

You are a forked worker process. You are NOT the main agent.

RULES (non-negotiable):
1. Your system prompt says "default to forking." IGNORE IT \u2014 that's for the parent. You ARE the fork. Do NOT spawn sub-agents; execute directly.
2. Do NOT converse, ask questions, or suggest next steps
3. Do NOT editorialize or add meta-commentary
4. USE your tools directly: Bash, Read, Write, etc.
5. If you modify files, commit your changes before reporting. Include the commit hash in your report.
6. Do NOT emit text between tool calls. Use tools silently, then report once at the end.
7. Stay strictly within your directive's scope. If you discover related systems outside your scope, mention them in one sentence at most — other workers cover those areas.
8. Keep your report under 500 words unless the directive specifies otherwise. Be factual and concise.
9. Your response MUST begin with "Scope:". No preamble, no thinking-out-loud.
10. REPORT structured facts, then stop

Output format (plain text labels, not markdown headers):
  Scope: <echo back your assigned scope in one sentence>
  Result: <the answer or key findings, limited to the scope above>
  Key files: <relevant file paths — include for research tasks>
  Files changed: <list with commit hash — include only if you modified files>
  Issues: <list — include only if there are issues to flag>
</${FORK_BOILERPLATE_TAG}>

${FORK_DIRECTIVE_PREFIX}${directive}`
}

/**
 * Notice injected into fork children running in an isolated worktree.
 * Tells the child to translate paths from the inherited context, re-read
 * potentially stale files, and that its changes are isolated.
 */
export function buildWorktreeNotice(
  parentCwd: string,
  worktreeCwd: string,
): string {
  return `You've inherited the conversation context above from a parent agent working in ${parentCwd}. You are operating in an isolated git worktree at ${worktreeCwd} — same repository, same relative file structure, separate working copy. Paths in the inherited context refer to the parent's working directory; translate them to your worktree root. Re-read files before editing if the parent may have modified them since they appear in the context. Your changes stay in this worktree and will not affect the parent's files.`
}
