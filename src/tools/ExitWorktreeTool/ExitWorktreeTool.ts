import { z } from 'zod/v4'
import {
  getOriginalCwd,
  getProjectRoot,
  setOriginalCwd,
  setProjectRoot,
} from '../../bootstrap/state.js'
import { clearSystemPromptSections } from '../../constants/systemPromptSections.js'
import { logEvent } from '../../services/analytics/index.js'
import type { Tool } from '../../Tool.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { count } from '../../utils/array.js'
import { clearMemoryFileCaches } from '../../utils/claudemd.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { updateHooksConfigSnapshot } from '../../utils/hooks/hooksConfigSnapshot.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getPlansDirectory } from '../../utils/plans.js'
import { setCwd } from '../../utils/Shell.js'
import { saveWorktreeState } from '../../utils/sessionStorage.js'
import {
  cleanupWorktree,
  getCurrentWorktreeSession,
  keepWorktree,
  killTmuxSession,
} from '../../utils/worktree.js'
import { EXIT_WORKTREE_TOOL_NAME } from './constants.js'
import { getExitWorktreeToolPrompt } from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    action: z
      .enum(['keep', 'remove'])
      .describe(
        '"keep" leaves the worktree and branch on disk; "remove" deletes both.',
      ),
    discard_changes: z
      .boolean()
      .optional()
      .describe(
        'Required true when action is "remove" and the worktree has uncommitted files or unmerged commits. The tool will refuse and list them otherwise.',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['keep', 'remove']),
    originalCwd: z.string(),
    worktreePath: z.string(),
    worktreeBranch: z.string().optional(),
    tmuxSessionName: z.string().optional(),
    discardedFiles: z.number().optional(),
    discardedCommits: z.number().optional(),
    message: z.string(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
export type Output = z.infer<OutputSchema>

type ChangeSummary = {
  changedFiles: number
  commits: number
}

/**
 * 当状态无法可靠确定时返回 null——使用此作为安全门的调用者必须
 * 将 null 视为"未知，假定不安全"（故障关闭）。静默 0/0 会让
 * cleanupWorktree 销毁真实的工作。
 *
 * 在以下情况下返回 null：
 * - git status 或 rev-list 退出非零（锁文件、损坏的索引、错误的 ref）
 * - originalHeadCommit 是 undefined 但 git status 成功——这是
 *   基于钩子的-worktree-wrapping-git 的情况（worktree.ts:525-532 没有设置
 *   originalHeadCommit）。我们可以看到工作树是 git，但无法在没有基线的情况下
 *   计算 commit 数，所以我们无法证明分支是干净的。
 */
async function countWorktreeChanges(
  worktreePath: string,
  originalHeadCommit: string | undefined,
): Promise<ChangeSummary | null> {
  const status = await execFileNoThrow('git', [
    '-C',
    worktreePath,
    'status',
    '--porcelain',
  ])
  if (status.code !== 0) {
    return null
  }
  const changedFiles = count(status.stdout.split('\n'), l => l.trim() !== '')

  if (!originalHeadCommit) {
    // git status 成功 → 这是一个 git repo，但没有基线
    // commit 我们无法计算 commit 数。故障关闭而不是声称 0。
    return null
  }

  const revList = await execFileNoThrow('git', [
    '-C',
    worktreePath,
    'rev-list',
    '--count',
    `${originalHeadCommit}..HEAD`,
  ])
  if (revList.code !== 0) {
    return null
  }
  const commits = parseInt(revList.stdout.trim(), 10) || 0

  return { changedFiles, commits }
}

/**
 * 恢复会话状态以反映原始目录。
 * 这是 EnterWorktreeTool.call() 中会话级别变动的逆操作。
 *
 * keepWorktree()/cleanupWorktree() 处理 process.chdir 和 currentWorktreeSession；
 * 这处理 worktree 实用程序层之上的所有内容。
 */
function restoreSessionToOriginalCwd(
  originalCwd: string,
  projectRootIsWorktree: boolean,
): void {
  setCwd(originalCwd)
  // EnterWorktree 将 originalCwd 设置为 *worktree* 路径（故意的——见
  // state.ts getProjectRoot 注释）。重置为真正的原始值。
  setOriginalCwd(originalCwd)
  // --worktree 启动将 projectRoot 设置为 worktree；会话中期
  // EnterWorktreeTool 不会。只有在实际上被更改时才恢复——
  // 否则我们会移动 projectRoot 到用户进入 worktree 之前 cd 到的任何地方
  //（session.originalCwd），破坏"稳定项目身份"契约。
  if (projectRootIsWorktree) {
    setProjectRoot(originalCwd)
    // setup.ts 的 --worktree 块调用 updateHooksConfigSnapshot() 以从头重读
    // worktree 的 hooks。对称地恢复。（会话中期
    // EnterWorktreeTool 从未触及快照，所以那里是无操作。）
    updateHooksConfigSnapshot()
  }
  saveWorktreeState(null)
  clearSystemPromptSections()
  clearMemoryFileCaches()
  getPlansDirectory.cache.clear?.()
}

export const ExitWorktreeTool: Tool<InputSchema, Output> = buildTool({
  name: EXIT_WORKTREE_TOOL_NAME,
  searchHint: 'exit a worktree session and return to the original directory',
  maxResultSizeChars: 100_000,
  async description() {
    return 'Exits a worktree session created by EnterWorktree and restores the original working directory'
  },
  async prompt() {
    return getExitWorktreeToolPrompt()
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return 'Exiting worktree'
  },
  shouldDefer: true,
  isDestructive(input) {
    return input.action === 'remove'
  },
  toAutoClassifierInput(input) {
    return input.action
  },
  async validateInput(input) {
    // 范围守卫：getCurrentWorktreeSession() 除非 EnterWorktree
    //（特别地是 createWorktreeForSession）在此会话中运行，否则为 null。通过
    // `git worktree add` 创建的工作树，或在之前会话中的 EnterWorktree，不会填充它。
    // 这是唯一的入口门——之后的一切都操作 EnterWorktree 创建的路径。
    const session = getCurrentWorktreeSession()
    if (!session) {
      return {
        result: false,
        message:
          'No-op: there is no active EnterWorktree session to exit. This tool only operates on worktrees created by EnterWorktree in the current session — it will not touch worktrees created manually or in a previous session. No filesystem changes were made.',
        errorCode: 1,
      }
    }

    if (input.action === 'remove' && !input.discard_changes) {
      const summary = await countWorktreeChanges(
        session.worktreePath,
        session.originalHeadCommit,
      )
      if (summary === null) {
        return {
          result: false,
          message: `Could not verify worktree state at ${session.worktreePath}. Refusing to remove without explicit confirmation. Re-invoke with discard_changes: true to proceed — or use action: "keep" to preserve the worktree.`,
          errorCode: 3,
        }
      }
      const { changedFiles, commits } = summary
      if (changedFiles > 0 || commits > 0) {
        const parts: string[] = []
        if (changedFiles > 0) {
          parts.push(
            `${changedFiles} uncommitted ${changedFiles === 1 ? 'file' : 'files'}`,
          )
        }
        if (commits > 0) {
          parts.push(
            `${commits} ${commits === 1 ? 'commit' : 'commits'} on ${session.worktreeBranch ?? 'the worktree branch'}`,
          )
        }
        return {
          result: false,
          message: `Worktree has ${parts.join(' and ')}. Removing will discard this work permanently. Confirm with the user, then re-invoke with discard_changes: true — or use action: "keep" to preserve the worktree.`,
          errorCode: 2,
        }
      }
    }

    return { result: true }
  },
  renderToolUseMessage,
  renderToolResultMessage,
  async call(input) {
    const session = getCurrentWorktreeSession()
    if (!session) {
      // validateInput 守卫了这一点，但 session 是模块级可变
      // 状态——防止验证和执行之间的竞争。
      throw new Error('Not in a worktree session')
    }

    // 在 keepWorktree/cleanupWorktree 将 currentWorktreeSession 置空之前捕获。
    const {
      originalCwd,
      worktreePath,
      worktreeBranch,
      tmuxSessionName,
      originalHeadCommit,
    } = session

    // --worktree 启动在 setCwd(worktreePath) 之后立即背靠背调用
    // setOriginalCwd(getCwd()) 和 setProjectRoot(getCwd())
    //（setup.ts:235/239），所以两者都保存相同的 realpath'd 值，BashTool
    // cd 不会触及任何一个。会话中期的 EnterWorktreeTool 设置 originalCwd
    // 但不设置 projectRoot。（不能使用 getCwd()——BashTool 每次
    // cd 都改变它。不能使用 session.worktreePath——它是 join()'d，而不是 realpath'd。）
    const projectRootIsWorktree = getProjectRoot() === getOriginalCwd()

    // 在执行时重新计数以获得准确的分析和输出——验证时的
    // worktree 状态可能与现在不匹配。Null（git 失败）退回到 0/0；
    // 安全门控已经在 validateInput 中发生，所以这只影响分析 + 消息。
    const { changedFiles, commits } = (await countWorktreeChanges(
      worktreePath,
      originalHeadCommit,
    )) ?? { changedFiles: 0, commits: 0 }

    if (input.action === 'keep') {
      await keepWorktree()
      restoreSessionToOriginalCwd(originalCwd, projectRootIsWorktree)

      logEvent('tengu_worktree_kept', {
        mid_session: true,
        commits,
        changed_files: changedFiles,
      })

      const tmuxNote = tmuxSessionName
        ? ` Tmux session ${tmuxSessionName} is still running; reattach with: tmux attach -t ${tmuxSessionName}`
        : ''
      return {
        data: {
          action: 'keep' as const,
          originalCwd,
          worktreePath,
          worktreeBranch,
          tmuxSessionName,
          message: `Exited worktree. Your work is preserved at ${worktreePath}${worktreeBranch ? ` on branch ${worktreeBranch}` : ''}. Session is now back in ${originalCwd}.${tmuxNote}`,
        },
      }
    }

    // action === 'remove'
    if (tmuxSessionName) {
      await killTmuxSession(tmuxSessionName)
    }
    await cleanupWorktree()
    restoreSessionToOriginalCwd(originalCwd, projectRootIsWorktree)

    logEvent('tengu_worktree_removed', {
      mid_session: true,
      commits,
      changed_files: changedFiles,
    })

    const discardParts: string[] = []
    if (commits > 0) {
      discardParts.push(`${commits} ${commits === 1 ? 'commit' : 'commits'}`)
    }
    if (changedFiles > 0) {
      discardParts.push(
        `${changedFiles} uncommitted ${changedFiles === 1 ? 'file' : 'files'}`,
      )
    }
    const discardNote =
      discardParts.length > 0 ? ` Discarded ${discardParts.join(' and ')}.` : ''
    return {
      data: {
        action: 'remove' as const,
        originalCwd,
        worktreePath,
        worktreeBranch,
        discardedFiles: changedFiles,
        discardedCommits: commits,
        message: `Exited and removed worktree at ${worktreePath}.${discardNote} Session is now back in ${originalCwd}.`,
      },
    }
  },
  mapToolResultToToolResultBlockParam({ message }, toolUseID) {
    return {
      type: 'tool_result',
      content: message,
      tool_use_id: toolUseID,
    }
  },
} satisfies ToolDef<InputSchema, Output>)
