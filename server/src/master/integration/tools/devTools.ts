/**
 * 开发工具集
 * 
 * 功能：
 * - LSP: 语言服务器协议工具（代码导航、跳转、引用查找）
 * - PackageInfo: 获取包信息
 * - GitLog: 获取 Git 提交历史
 * 
 * 参考 Claude Code 实现：
 * - src/tools/LSPTool/LSPTool.ts
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { stat } from 'fs/promises'
import type { ToolDefinition } from '../types/toolTypes'

const execAsync = promisify(exec)

/**
 * 开发工具配置
 */
const DEV_CONFIG = {
  // Git 日志默认条数
  DEFAULT_GIT_LOG_COUNT: 20,
  // 最大 git 日志条数
  MAX_GIT_LOG_COUNT: 100,
  // Git 日志格式
  GIT_LOG_FORMAT: '%H|%an|%ae|%ad|%s',
}

/**
 * 格式化 Git 提交信息
 */
function formatGitLog(commits: Array<{
  hash: string
  author: string
  email: string
  date: string
  message: string
}>): string {
  if (commits.length === 0) {
    return 'No commits found'
  }

  return commits.map(c => {
    const shortHash = c.hash.substring(0, 7)
    const date = new Date(c.date).toLocaleDateString()
    return `${shortHash} | ${date} | ${c.author}\n  ${c.message}`
  }).join('\n\n')
}

/**
 * 解析 Git 日志行
 */
function parseGitLogLine(line: string): {
  hash: string
  author: string
  email: string
  date: string
  message: string
} | null {
  const parts = line.split('|')
  if (parts.length < 5) return null

  return {
    hash: parts[0],
    author: parts[1],
    email: parts[2],
    date: parts[3],
    message: parts.slice(4).join('|'), // 消息中可能包含 |
  }
}

/**
 * 解析 Git diff
 */
function parseGitDiff(diff: string): {
  files: Array<{
    path: string
    additions: number
    deletions: number
    status: 'added' | 'modified' | 'deleted' | 'renamed'
  }>
  totalAdditions: number
  totalDeletions: number
} {
  const files: Array<{
    path: string
    additions: number
    deletions: number
    status: 'added' | 'modified' | 'deleted' | 'renamed'
  }> = []
  let totalAdditions = 0
  let totalDeletions = 0

  const lines = diff.split('\n')
  let currentFile: typeof files[0] | null = null

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.*) b\/(.*)/)
      if (match) {
        currentFile = {
          path: match[2],
          additions: 0,
          deletions: 0,
          status: 'modified',
        }
      }
    } else if (line.startsWith('new file mode')) {
      if (currentFile) currentFile.status = 'added'
    } else if (line.startsWith('deleted file mode')) {
      if (currentFile) currentFile.status = 'deleted'
    } else if (line.startsWith('rename from')) {
      if (currentFile) currentFile.status = 'renamed'
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      if (currentFile) {
        currentFile.additions++
        totalAdditions++
      }
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      if (currentFile) {
        currentFile.deletions++
        totalDeletions++
      }
    } else if (line.startsWith('@@')) {
      if (currentFile) files.push(currentFile)
      currentFile = null
    }
  }

  if (currentFile) files.push(currentFile)

  return { files, totalAdditions, totalDeletions }
}

/**
 * 获取包管理器信息
 */
async function getPackageInfo(projectRoot: string): Promise<{
  packageManager: string
  hasPackageJson: boolean
  hasRequirements: boolean
  hasCargo: boolean
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}> {
  const result = {
    packageManager: 'unknown' as string,
    hasPackageJson: false,
    hasRequirements: false,
    hasCargo: false,
  }

  try {
    const packageJsonPath = `${projectRoot}/package.json`
    await stat(packageJsonPath)
    result.hasPackageJson = true

    const content = await readFile(packageJsonPath, 'utf-8')
    const pkg = JSON.parse(content)
    
    if (pkg.dependencies) result.dependencies = pkg.dependencies
    if (pkg.devDependencies) result.devDependencies = pkg.devDependencies

    // 检测包管理器
    if (await checkFile(`${projectRoot}/pnpm-lock.yaml`)) {
      result.packageManager = 'pnpm'
    } else if (await checkFile(`${projectRoot}/yarn.lock`)) {
      result.packageManager = 'yarn'
    } else if (await checkFile(`${projectRoot}/package-lock.json`)) {
      result.packageManager = 'npm'
    }
  } catch {
    // 忽略错误
  }

  try {
    await stat(`${projectRoot}/requirements.txt`)
    result.hasRequirements = true
  } catch {}

  try {
    await stat(`${projectRoot}/Cargo.toml`)
    result.hasCargo = true
  } catch {}

  return result
}

async function checkFile(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * 创建开发工具定义列表
 */
export function createDevTools(
  resolvePathFn: (path: string) => string,
  projectRoot: string = process.cwd()
): ToolDefinition[] {
  return [
    // ========== GitLog 工具 ==========
    {
      name: 'GitLog',
      description: 'Get recent git commit history',
      inputSchema: {
        type: 'object',
        properties: {
          count: { 
            type: 'number', 
            description: 'Number of commits to show',
            default: 20 
          },
          path: { 
            type: 'string', 
            description: 'Path to repository (defaults to current directory)',
            default: '.' 
          },
          author: { 
            type: 'string', 
            description: 'Filter by author name' 
          },
          since: { 
            type: 'string', 
            description: 'Show commits since date (e.g., "1 week ago", "2024-01-01")' 
          },
          until: { 
            type: 'string', 
            description: 'Show commits until date' 
          },
        },
      },
      category: 'development',
      isConcurrencySafe: true,
      handler: async (input, context) => {
        const count = Math.min(
          (input.count as number) || DEV_CONFIG.DEFAULT_GIT_LOG_COUNT,
          DEV_CONFIG.MAX_GIT_LOG_COUNT
        )
        const path = resolvePathFn((input.path as string) || '.')
        const author = input.author as string | undefined
        const since = input.since as string | undefined
        const until = input.until as string | undefined

        try {
          let command = `git log --format="${DEV_CONFIG.GIT_LOG_FORMAT}" -n ${count}`
          
          if (author) {
            command += ` --author="${author}"`
          }
          
          if (since) {
            command += ` --since="${since}"`
          }
          
          if (until) {
            command += ` --until="${until}"`
          }

          const { stdout } = await execAsync(command, { cwd: path })
          
          const lines = stdout.trim().split('\n').filter(Boolean)
          const commits = lines
            .map(parseGitLogLine)
            .filter((c): c is NonNullable<typeof c> => c !== null)

          const formatted = formatGitLog(commits)

          return {
            success: true,
            result: {
              count: commits.length,
              commits,
            },
            output: formatted,
          }
        } catch (error) {
          return {
            success: false,
            error: `Git error: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== GitStatus 工具 ==========
    {
      name: 'GitStatus',
      description: 'Get current git repository status',
      inputSchema: {
        type: 'object',
        properties: {
          path: { 
            type: 'string', 
            description: 'Path to repository',
            default: '.' 
          },
          short: { 
            type: 'boolean', 
            description: 'Use short format',
            default: true 
          },
        },
      },
      category: 'development',
      isConcurrencySafe: true,
      handler: async (input, context) => {
        const path = resolvePathFn((input.path as string) || '.')
        const short = (input.short as boolean) ?? true

        try {
          const command = short ? 'git status --short' : 'git status'
          const { stdout } = await execAsync(command, { cwd: path })

          if (!stdout.trim()) {
            return {
              success: true,
              result: {
                clean: true,
                changes: [],
              },
              output: 'Working tree is clean',
            }
          }

          const changes = stdout.trim().split('\n').filter(Boolean)

          return {
            success: true,
            result: {
              clean: false,
              changes,
            },
            output: stdout.trim(),
          }
        } catch (error) {
          return {
            success: false,
            error: `Git error: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== GitDiff 工具 ==========
    {
      name: 'GitDiff',
      description: 'Show changes between commits, working tree, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { 
            type: 'string', 
            description: 'Path to repository',
            default: '.' 
          },
          commit: { 
            type: 'string', 
            description: 'Commit hash or ref (defaults to HEAD vs working tree)' 
          },
          cached: { 
            type: 'boolean', 
            description: 'Show staged changes',
            default: false 
          },
          stat: { 
            type: 'boolean', 
            description: 'Show diffstat',
            default: true 
          },
        },
      },
      category: 'development',
      handler: async (input, context) => {
        const path = resolvePathFn((input.path as string) || '.')
        const commit = input.commit as string | undefined
        const cached = (input.cached as boolean) ?? false
        const stat = (input.stat as boolean) ?? true

        try {
          let command = 'git diff'
          
          if (cached) {
            command += ' --cached'
          }
          
          if (commit) {
            command += ` ${commit}`
          }
          
          if (stat) {
            command += ' --stat'
          }

          const { stdout } = await execAsync(command, { cwd: path })

          if (!stdout.trim()) {
            return {
              success: true,
              result: {
                hasChanges: false,
                diff: '',
              },
              output: 'No changes',
            }
          }

          const parsed = parseGitDiff(stdout)

          return {
            success: true,
            result: {
              hasChanges: true,
              ...parsed,
              rawDiff: stdout,
            },
            output: stdout,
          }
        } catch (error) {
          return {
            success: false,
            error: `Git error: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== PackageInfo 工具 ==========
    {
      name: 'PackageInfo',
      description: 'Get package manager and dependency information',
      inputSchema: {
        type: 'object',
        properties: {
          path: { 
            type: 'string', 
            description: 'Path to project root',
            default: '.' 
          },
          showDependencies: { 
            type: 'boolean', 
            description: 'Include dependency list',
            default: false 
          },
        },
      },
      category: 'development',
      isConcurrencySafe: true,
      handler: async (input, context) => {
        const path = resolvePathFn((input.path as string) || '.')
        const showDeps = (input.showDependencies as boolean) ?? false

        try {
          const info = await getPackageInfo(path)
          
          let output = `Package Manager: ${info.packageManager}\n`
          output += `package.json: ${info.hasPackageJson ? 'Found' : 'Not found'}\n`
          output += `requirements.txt: ${info.hasRequirements ? 'Found' : 'Not found'}\n`
          output += `Cargo.toml: ${info.hasCargo ? 'Found' : 'Not found'}\n`

          if (showDeps && info.dependencies) {
            output += `\nDependencies (${Object.keys(info.dependencies).length}):\n`
            for (const [name, version] of Object.entries(info.dependencies)) {
              output += `  ${name}: ${version}\n`
            }
          }

          if (showDeps && info.devDependencies) {
            output += `\nDev Dependencies (${Object.keys(info.devDependencies).length}):\n`
            for (const [name, version] of Object.entries(info.devDependencies)) {
              output += `  ${name}: ${version}\n`
            }
          }

          return {
            success: true,
            result: info,
            output: output.trim(),
          }
        } catch (error) {
          return {
            success: false,
            error: `Error: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      },
    },

    // ========== Exec 工具（安全的命令执行） ==========
    {
      name: 'Exec',
      description: 'Execute a shell command and return output',
      inputSchema: {
        type: 'object',
        properties: {
          command: { 
            type: 'string', 
            description: 'Command to execute' 
          },
          cwd: { 
            type: 'string', 
            description: 'Working directory',
            default: '.' 
          },
          timeout: { 
            type: 'number', 
            description: 'Timeout in milliseconds',
            default: 60000 
          },
        },
        required: ['command'],
      },
      category: 'development',
      permissions: { dangerous: true },
      handler: async (input, context) => {
        const command = input.command as string
        const cwd = resolvePathFn((input.cwd as string) || '.')
        const timeout = (input.timeout as number) || 60000

        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd,
            timeout,
            maxBuffer: 10 * 1024 * 1024, // 10MB
          })

          let output = stdout
          if (stderr) {
            output += `\n[stderr]\n${stderr}`
          }

          return {
            success: true,
            result: {
              stdout,
              stderr,
              exitCode: 0,
            },
            output,
          }
        } catch (error: any) {
          return {
            success: false,
            error: error.message || String(error),
            result: {
              stdout: error.stdout || '',
              stderr: error.stderr || '',
              exitCode: error.code || 1,
            },
            output: (error.stdout || '') + '\n' + (error.stderr || '') + '\n' + (error.message || ''),
          }
        }
      },
    },
  ]
}

export default createDevTools
