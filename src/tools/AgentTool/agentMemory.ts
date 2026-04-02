import { join, normalize, sep } from 'path'
import { getProjectRoot } from '../../bootstrap/state.js'
import {
  buildMemoryPrompt,
  ensureMemoryDirExists,
} from '../../memdir/memdir.js'
import { getMemoryBaseDir } from '../../memdir/paths.js'
import { getCwd } from '../../utils/cwd.js'
import { findCanonicalGitRoot } from '../../utils/git.js'
import { sanitizePath } from '../../utils/path.js'

// 持久化代理内存作用域：'user' (~/.claude/agent-memory/)、'project' (.claude/agent-memory/) 或 'local' (.claude/agent-memory-local/)
export type AgentMemoryScope = 'user' | 'project' | 'local'

/**
 * 清理代理类型名称用于目录名
 * 替换冒号（Windows 无效，用于插件命名空间代理类型如 "my-plugin:my-agent"）
 */
function sanitizeAgentTypeForPath(agentType: string): string {
  return agentType.replace(/:/g, '-')
}

/**
 * 返回本地代理内存目录，这是项目特定的，不进入 VCS
 * 当 CLAUDE_CODE_REMOTE_MEMORY_DIR 设置时，使用项目名称空间持久化到挂载点
 * 否则使用 <cwd>/.claude/agent-memory-local/<agentType>/
 */
function getLocalAgentMemoryDir(dirName: string): string {
  if (process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR) {
    return (
      join(
        process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR,
        'projects',
        sanitizePath(
          findCanonicalGitRoot(getProjectRoot()) ?? getProjectRoot(),
        ),
        'agent-memory-local',
        dirName,
      ) + sep
    )
  }
  return join(getCwd(), '.claude', 'agent-memory-local', dirName) + sep
}

/**
 * 返回给定代理类型和作用域的代理内存目录
 * - 'user' 作用域：<memoryBase>/agent-memory/<agentType>/
 * - 'project' 作用域：<cwd>/.claude/agent-memory/<agentType>/
 * - 'local' 作用域：见 getLocalAgentMemoryDir()
 */
export function getAgentMemoryDir(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  const dirName = sanitizeAgentTypeForPath(agentType)
  switch (scope) {
    case 'project':
      return join(getCwd(), '.claude', 'agent-memory', dirName) + sep
    case 'local':
      return getLocalAgentMemoryDir(dirName)
    case 'user':
      return join(getMemoryBaseDir(), 'agent-memory', dirName) + sep
  }
}

// 检查文件是否在代理内存目录内（任何作用域）
export function isAgentMemoryPath(absolutePath: string): boolean {
  // 安全：规范化路径以防止通过 .. 段绕过路径遍历
  const normalizedPath = normalize(absolutePath)
  const memoryBase = getMemoryBaseDir()

  // 用户作用域：检查内存基础目录（可能是自定义目录或配置目录）
  if (normalizedPath.startsWith(join(memoryBase, 'agent-memory') + sep)) {
    return true
  }

  // 项目作用域：始终基于 cwd（不会重定向）
  if (
    normalizedPath.startsWith(join(getCwd(), '.claude', 'agent-memory') + sep)
  ) {
    return true
  }

  // 本地作用域：当 CLAUDE_CODE_REMOTE_MEMORY_DIR 设置时持久化到挂载点，否则基于 cwd
  if (process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR) {
    if (
      normalizedPath.includes(sep + 'agent-memory-local' + sep) &&
      normalizedPath.startsWith(
        join(process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR, 'projects') + sep,
      )
    ) {
      return true
    }
  } else if (
    normalizedPath.startsWith(
      join(getCwd(), '.claude', 'agent-memory-local') + sep,
    )
  ) {
    return true
  }

  return false
}

/**
 * 返回给定代理类型和作用域的代理内存文件路径
 */
export function getAgentMemoryEntrypoint(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  return join(getAgentMemoryDir(agentType, scope), 'MEMORY.md')
}

export function getMemoryScopeDisplay(
  memory: AgentMemoryScope | undefined,
): string {
  switch (memory) {
    case 'user':
      return `用户 (${join(getMemoryBaseDir(), 'agent-memory')}/)`
    case 'project':
      return '项目 (.claude/agent-memory/)'
    case 'local':
      return `本地 (${getLocalAgentMemoryDir('...')})`
    default:
      return '无'
  }
}

/**
 * 为启用了内存的代理加载持久化内存
 * 如需要创建内存目录并返回包含内存内容的提示
 *
 * @param agentType 代理的类型名称（用作目录名）
 * @param scope 'user' 用于 ~/.claude/agent-memory/ 或 'project' 用于 .claude/agent-memory/
 */
export function loadAgentMemoryPrompt(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  let scopeNote: string
  switch (scope) {
    case 'user':
      scopeNote =
        '- 由于此内存是用户作用域，保持泛化学习，因为它们适用于所有项目'
      break
    case 'project':
      scopeNote =
        '- 由于此内存是项目作用域并通过版本控制与团队共享，将您的记忆定制到此项目'
      break
    case 'local':
      scopeNote =
        '- 由于此内存是本地作用域（不进入版本控制），将您的记忆定制到此项目和机器'
      break
  }

  const memoryDir = getAgentMemoryDir(agentType, scope)

  // 静默执行：这在 sync getSystemPrompt() 回调内运行（从 React 渲染调用 AgentDetail.tsx，
  // 所以不能是 async）。生成的代理在完整 API 轮次后才尝试 Write，
  // 到那时 mkdir 将已完成。即使没有，FileWriteTool 也会自己 mkdir 父目录
  void ensureMemoryDirExists(memoryDir)

  const coworkExtraGuidelines =
    process.env.CLAUDE_COWORK_MEMORY_EXTRA_GUIDELINES
  return buildMemoryPrompt({
    displayName: '持久化代理内存',
    memoryDir,
    extraGuidelines:
      coworkExtraGuidelines && coworkExtraGuidelines.trim().length > 0
        ? [scopeNote, coworkExtraGuidelines]
        : [scopeNote],
  })
}
