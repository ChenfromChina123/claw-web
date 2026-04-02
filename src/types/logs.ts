import type { UUID } from 'crypto'
import type { FileHistorySnapshot } from 'src/utils/fileHistory.js'
import type { ContentReplacementRecord } from 'src/utils/toolResultStorage.js'
import type { AgentId } from './ids.js'
import type { Message } from './message.js'
import type { QueueOperationMessage } from './messageQueueTypes.js'

export type SerializedMessage = Message & {
  cwd: string
  userType: string
  entrypoint?: string // CLAUDE_CODE_ENTRYPOINT — 区分 cli/sdk-ts/sdk-py 等
  sessionId: string
  timestamp: string
  version: string
  gitBranch?: string
  slug?: string // 会话slug，用于类似plans的文件（用于恢复）
}

export type LogOption = {
  date: string
  messages: SerializedMessage[]
  fullPath?: string
  value: number
  created: Date
  modified: Date
  firstPrompt: string
  messageCount: number
  fileSize?: number // 文件大小（字节）（用于显示）
  isSidechain: boolean
  isLite?: boolean // 轻量级日志为true（消息未加载）
  sessionId?: string // 轻量级日志的会话ID
  teamName?: string // 如果这是生成的代理会话，则为团队名称
  agentName?: string // 代理的自定义名称（来自 /rename 或 swarm）
  agentColor?: string // 代理的颜色（来自 /rename 或 swarm）
  agentSetting?: string // 使用的代理定义（来自 --agent 标志或 settings.agent）
  isTeammate?: boolean // 此会话是否由 swarm 队友创建
  leafUuid?: UUID // 如果给定，此 uuid 必须出现在数据库中
  summary?: string // 可选的会话摘要
  customTitle?: string // 可选的用户设置自定义标题
  tag?: string // 会话的可选标签（可在 /resume 中搜索）
  fileHistorySnapshots?: FileHistorySnapshot[] // 可选的文件历史快照
  attributionSnapshots?: AttributionSnapshotMessage[] // 可选的归属快照
  contextCollapseCommits?: ContextCollapseCommitEntry[] // 有序的——提交B可能引用提交A的摘要
  contextCollapseSnapshot?: ContextCollapseSnapshotEntry // 最后胜出——暂存队列 + 生成状态
  gitBranch?: string // 会话结束时的 Git 分支
  projectPath?: string // 原始项目目录路径
  prNumber?: number // 链接到此会话的 GitHub PR 编号
  prUrl?: string // 链接PR的完整URL
  prRepository?: string // 仓库的"owner/repo"格式
  mode?: 'coordinator' | 'normal' // 用于协调器/正常检测的会话模式
  worktreeSession?: PersistedWorktreeSession | null // 会话结束时的Worktree状态（null = 已退出，undefined = 从未进入）
  contentReplacements?: ContentReplacementRecord[] // 用于恢复重建的替换决策
}

export type SummaryMessage = {
  type: 'summary'
  leafUuid: UUID
  summary: string
}

export type CustomTitleMessage = {
  type: 'custom-title'
  sessionId: UUID
  customTitle: string
}

/**
 * AI生成的会话标题。区别于CustomTitleMessage，因为：
 * - 用户重命名（custom-title）总是在AI标题上有优先权
 * - reAppendSessionMetadata 不会重新附加AI标题（它们是临时的/
 *   可再生的；重新附加会在恢复时覆盖用户重命名）
 * - VS Code 的 onlyIfNoCustomTitle CAS 检查只匹配用户标题，
 *   允许AI覆盖自己之前的AI标题但不能覆盖用户标题
 */
export type AiTitleMessage = {
  type: 'ai-title'
  sessionId: UUID
  aiTitle: string
}

export type LastPromptMessage = {
  type: 'last-prompt'
  sessionId: UUID
  lastPrompt: string
}

/**
 * 定期分叉生成的摘要，说明代理当前正在做什么。
 * 每 min(5步, 2分钟) 由分叉主线程在中间轮次写入，以便
 * `claude ps` 可以显示比上一个用户提示更有用的内容
 * （通常是"好的，开始吧"或"修复它"）。
 */
export type TaskSummaryMessage = {
  type: 'task-summary'
  sessionId: UUID
  summary: string
  timestamp: string
}

export type TagMessage = {
  type: 'tag'
  sessionId: UUID
  tag: string
}

export type AgentNameMessage = {
  type: 'agent-name'
  sessionId: UUID
  agentName: string
}

export type AgentColorMessage = {
  type: 'agent-color'
  sessionId: UUID
  agentColor: string
}

export type AgentSettingMessage = {
  type: 'agent-setting'
  sessionId: UUID
  agentSetting: string
}

/**
 * PR link message stored in session transcript.
 * Links a session to a GitHub pull request for tracking and navigation.
 */
export type PRLinkMessage = {
  type: 'pr-link'
  sessionId: UUID
  prNumber: number
  prUrl: string
  prRepository: string // e.g., "owner/repo"
  timestamp: string // ISO timestamp when linked
}

export type ModeEntry = {
  type: 'mode'
  sessionId: UUID
  mode: 'coordinator' | 'normal'
}

/**
 * 持久化到记录以供恢复的工作树会话状态。
 * 是 WorktreeSession（来自 utils/worktree.ts）的子集——
 * 排除临时字段（creationDurationMs、usedSparsePaths），这些字段仅用于
 * 首次运行分析。
 */
export type PersistedWorktreeSession = {
  originalCwd: string
  worktreePath: string
  worktreeName: string
  worktreeBranch?: string
  originalBranch?: string
  originalHeadCommit?: string
  sessionId: string
  tmuxSessionName?: string
  hookBased?: boolean
}

/**
 * 记录会话当前是否处于由
 * EnterWorktree 或 --worktree 创建的工作树中。最后胜出：进入写入会话，
 * 退出写入null。在 --resume 时，仅在 worktreePath
 * 仍存在于磁盘时才恢复（/exit 对话框可能已将其删除）。
 */
export type WorktreeStateEntry = {
  type: 'worktree-state'
  sessionId: UUID
  worktreeSession: PersistedWorktreeSession | null
}

/**
 * 记录其上下文内表示被替换为
 * 较小存根的内容块（完整内容被持久化到其他地方）。在恢复时重放
 * 以实现提示缓存稳定性。每当替换至少一个块的
 * 执行通过时写入一次。当设置了agentId时，记录属于子代理
 * 侧链（AgentTool恢复读取这些）；不存在时，则是主线程
 * （/resume读取这些）。
 */
export type ContentReplacementEntry = {
  type: 'content-replacement'
  sessionId: UUID
  agentId?: AgentId
  replacements: ContentReplacementRecord[]
}

export type FileHistorySnapshotMessage = {
  type: 'file-history-snapshot'
  messageId: UUID
  snapshot: FileHistorySnapshot
  isSnapshotUpdate: boolean
}

/**
 * 每个文件的归属状态跟踪Claude的字符贡献。
 */
export type FileAttributionState = {
  contentHash: string // 文件内容的SHA-256哈希
  claudeContribution: number // Claude编写的字符数
  mtime: number // 文件修改时间
}

/**
 * 存储在会话记录中的归属快照消息。
 * 跟踪Claude用于提交归属的字符级贡献。
 */
export type AttributionSnapshotMessage = {
  type: 'attribution-snapshot'
  messageId: UUID
  surface: string // 客户端表面（cli、ide、web、api）
  fileStates: Record<string, FileAttributionState>
  promptCount?: number // 会话中的总提示数
  promptCountAtLastCommit?: number // 上次提交时的提示数
  permissionPromptCount?: number // 显示的总权限提示数
  permissionPromptCountAtLastCommit?: number // 上次提交时的权限提示数
  escapeCount?: number // 总ESC按键次数（取消的权限提示）
  escapeCountAtLastCommit?: number // 上次提交时的ESC按键次数
}

export type TranscriptMessage = SerializedMessage & {
  parentUuid: UUID | null
  logicalParentUuid?: UUID | null // Preserves logical parent when parentUuid is nullified for session breaks
  isSidechain: boolean
  gitBranch?: string
  agentId?: string // Agent ID for sidechain transcripts to enable resuming agents
  teamName?: string // Team name if this is a spawned agent session
  agentName?: string // Agent's custom name (from /rename or swarm)
  agentColor?: string // Agent's color (from /rename or swarm)
  promptId?: string // Correlates with OTel prompt.id for user prompt messages
}

export type SpeculationAcceptMessage = {
  type: 'speculation-accept'
  timestamp: string
  timeSavedMs: number
}

/**
 * 持久化的上下文折叠提交。归档的消息本身NOT
 * 持久化——它们已经在记录中作为普通的用户/
 * 助手消息。我们只持久化足够的信息来重建拼接
 * 指令（边界uuid）和摘要占位符（NOT
 * 在记录中，因为它从未产生到REPL）。
 *
 * 在恢复时，存储重建带有 archived=[] 的 CommittedCollapse；
 * projectView 在首次找到跨度时延迟填充归档。
 *
 * 区分符被混淆以匹配gate名称。sessionStorage.ts
 * 不是功能门控的（它是每个条目标类型使用的通用记录管道），
 * 所以这里的一个描述性字符串会泄漏到外部版本
 * 通过 appendEntry 调度 / loadTranscriptFile 解析器，即使
 * 外部版本中的任何内容从未写入或读取此条目。
 */
export type ContextCollapseCommitEntry = {
  type: 'marble-origami-commit'
  sessionId: UUID
  /** 16位折叠ID。条目的最大值重新设置ID计数器。 */
  collapseId: string
  /** 摘要占位符的uuid — registerSummary() 需要它。 */
  summaryUuid: string
  /** 完整的 <collapsed id="...">text</collapsed> 字符串作为占位符。 */
  summaryContent: string
  /** 用于 ctx_inspect 的纯摘要文本。 */
  summary: string
  /** 跨度边界 — projectView 在恢复的 Message[] 中找到这些。 */
  firstArchivedUuid: string
  lastArchivedUuid: string
}

/**
 * 暂存队列和生成触发器状态的快照。与提交
 * （追加-所有、重放-所有）不同，快照是最后胜出——仅最
 * 新的快照条目在恢复时应用。每当暂存内容可能发生变化的
 * ctx-agent生成解析完成后写入。
 *
 * 暂存边界是UUID（会话稳定的），而不是折叠ID（随
 * uuidToId bimap重置）。恢复暂存跨度在下一个
 * decorate/display时分发新的折叠ID，但跨度本身是正确的。
 */
export type ContextCollapseSnapshotEntry = {
  type: 'marble-origami-snapshot'
  sessionId: UUID
  staged: Array<{
    startUuid: string
    endUuid: string
    summary: string
    risk: number
    stagedAt: number
  }>
  /** 生成触发器状态——以便 +interval 时钟从它停止的地方继续。 */
  armed: boolean
  lastSpawnTokens: number
}

export type Entry =
  | TranscriptMessage
  | SummaryMessage
  | CustomTitleMessage
  | AiTitleMessage
  | LastPromptMessage
  | TaskSummaryMessage
  | TagMessage
  | AgentNameMessage
  | AgentColorMessage
  | AgentSettingMessage
  | PRLinkMessage
  | FileHistorySnapshotMessage
  | AttributionSnapshotMessage
  | QueueOperationMessage
  | SpeculationAcceptMessage
  | ModeEntry
  | WorktreeStateEntry
  | ContentReplacementEntry
  | ContextCollapseCommitEntry
  | ContextCollapseSnapshotEntry

export function sortLogs(logs: LogOption[]): LogOption[] {
  return logs.sort((a, b) => {
    // 按修改日期排序（最新的在前）
    const modifiedDiff = b.modified.getTime() - a.modified.getTime()
    if (modifiedDiff !== 0) {
      return modifiedDiff
    }

    // 如果修改日期相等，按创建日期排序（最新的在前）
    return b.created.getTime() - a.created.getTime()
  })
}
