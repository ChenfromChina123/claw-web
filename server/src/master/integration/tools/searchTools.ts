/**
 * 搜索工具集
 * 
 * 功能：
 * - Grep: 在文件中搜索内容
 * - GrepContent: 显示匹配行的内容
 * 
 * 参考 Claude Code 实现：
 * - src/tools/GrepTool/GrepTool.ts
 */

import { readFile } from 'fs/promises'
import { readdir, stat } from 'fs/promises'
import { join, basename } from 'path'
import type { ToolDefinition } from '../types/toolTypes'
import { TOOL_RESULT_LIMITS, truncateString } from '../../utils/fileLimits'

/**
 * Grep 工具配置
 */
const GREP_CONFIG = {
  // 默认最多显示结果数
  DEFAULT_LIMIT: 250,
  // 最大限制
  MAX_LIMIT: 1000,
  // 排除的目录
  EXCLUDED_DIRS: new Set([
    'node_modules', '.git', '.svn', '.hg', '.bzr',
    'dist', 'build', 'coverage', '.next', '.nuxt',
    '__pycache__', '.pytest_cache', '.mypy_cache',
    '.turbo', '.cache', 'tmp', 'temp',
  ]),
  // 排除的文件模式
  EXCLUDED_EXTENSIONS: new Set([
    '.exe', '.dll', '.so', '.dylib', '.bin',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp',
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.ttf', '.otf', '.woff', '.woff2', '.eot',
    '.db', '.sqlite', '.mdb',
    '.class', '.pyc', '.pyd', '.pyo', '.o',
  ]),
}

/**
 * 搜索匹配结果
 */
interface SearchMatch {
  file: string
  line: number
  content: string
  lineContent: string
}

/**
 * 搜索文件内容
 */
async function searchInFile(
  filePath: string,
  pattern: RegExp,
  options: {
    context?: number
    maxResults?: number
    caseSensitive?: boolean
  }
): Promise<SearchMatch[]> {
  const results: SearchMatch[] = []

  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const lineContent = lines[i]
      if (pattern.test(lineContent)) {
        results.push({
          file: filePath,
          line: i + 1, // 行号从 1 开始
          content: lineContent,
          lineContent,
        })

        if (options.maxResults && results.length >= options.maxResults) {
          break
        }
      }
    }
  } catch {
    // 跳过无法读取的文件
  }

  return results
}

/**
 * 递归搜索目录
 */
async function searchDirectory(
  dirPath: string,
  pattern: RegExp,
  options: {
    glob?: string
    recursive?: boolean
    context?: number
    maxResults?: number
    caseSensitive?: boolean
  }
): Promise<SearchMatch[]> {
  const results: SearchMatch[] = []

  async function walk(currentPath: string): Promise<void> {
    if (options.maxResults && results.length >= options.maxResults) {
      return
    }

    try {
      const entries = await readdir(currentPath, { withFileTypes: true })

      for (const entry of entries) {
        if (options.maxResults && results.length >= options.maxResults) {
          break
        }

        const fullPath = join(currentPath, entry.name)

        // 跳过排除的目录
        if (entry.isDirectory()) {
          if (!options.recursive) continue
          if (GREP_CONFIG.EXCLUDED_DIRS.has(entry.name)) continue
          if (entry.name.startsWith('.')) continue

          await walk(fullPath)
          continue
        }

        // 跳过排除的文件扩展名
        const ext = entry.name.substring(entry.name.lastIndexOf('.'))
        if (GREP_CONFIG.EXCLUDED_EXTENSIONS.has(ext.toLowerCase())) {
          continue
        }

        // glob 模式匹配
        if (options.glob) {
          const globPattern = new RegExp(
            '^' + options.glob
              .replace(/\./g, '\\.')
              .replace(/\*/g, '.*')
              .replace(/\?/g, '.') + '$'
          )
          if (!globPattern.test(entry.name)) {
            continue
          }
        }

        // 搜索文件
        const matches = await searchInFile(fullPath, pattern, options)
        results.push(...matches)
      }
    } catch {
      // 跳过无法访问的目录
    }
  }

  await walk(dirPath)
  return results
}

/**
 * 创建搜索工具定义列表
 */
export function createSearchTools(
  resolvePathFn: (path: string) => string,
  cwd: string = process.cwd()
): ToolDefinition[] {
  return [
    // ========== Grep 工具 ==========
    {
      name: 'Grep',
      description: 'Search for text pattern in files',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { 
            type: 'string', 
            description: 'Regular expression pattern to search for' 
          },
          path: { 
            type: 'string', 
            description: 'File or directory path to search in',
            default: '.' 
          },
          glob: { 
            type: 'string', 
            description: 'File glob pattern (e.g., "*.ts", "*.{js,ts}")' 
          },
          output_mode: { 
            type: 'string', 
            description: 'Output mode: "files_with_matches" or "content"',
            enum: ['files_with_matches', 'content', 'count'],
            default: 'files_with_matches' 
          },
          '-i': { 
            type: 'boolean', 
            description: 'Case insensitive search',
            default: false 
          },
          '-n': { 
            type: 'boolean', 
            description: 'Show line numbers',
            default: true 
          },
          '-C': { 
            type: 'number', 
            description: 'Show N lines of context around matches' 
          },
          head_limit: { 
            type: 'number', 
            description: 'Maximum number of results',
            default: 250 
          },
          recursive: { 
            type: 'boolean', 
            description: 'Search recursively in directories',
            default: true 
          },
        },
        required: ['pattern'],
      },
      category: 'search',
      isConcurrencySafe: true,
      handler: async (input, context) => {
        const pattern = input.pattern as string
        const searchPath = (input.path as string) || '.'
        const glob = input.glob as string | undefined
        const outputMode = (input.output_mode as string) || 'files_with_matches'
        const caseInsensitive = (input['-i'] as boolean) || false
        const showLineNumbers = input['-n'] !== false
        const contextLines = (input['-C'] as number) || 0
        const headLimit = Math.min((input.head_limit as number) || GREP_CONFIG.DEFAULT_LIMIT, GREP_CONFIG.MAX_LIMIT)
        const recursive = input.recursive !== false

        // 构建正则表达式
        let regexPattern: RegExp
        try {
          regexPattern = new RegExp(pattern, caseInsensitive ? 'i' : '')
        } catch (error) {
          return {
            success: false,
            error: `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
          }
        }

        // 解析搜索路径
        const resolvedPath = resolvePathFn(searchPath)

        // 检查路径是否存在
        let isDirectory = false
        try {
          const stats = await stat(resolvedPath)
          isDirectory = stats.isDirectory()
        } catch {
          return {
            success: false,
            error: `Path not found: ${resolvedPath}`,
          }
        }

        let results: SearchMatch[] = []
        let totalMatches = 0

        if (isDirectory) {
          results = await searchDirectory(resolvedPath, regexPattern, {
            glob,
            recursive,
            maxResults: outputMode === 'content' ? headLimit * 10 : headLimit,
          })
        } else {
          results = await searchInFile(resolvedPath, regexPattern, {
            maxResults: outputMode === 'content' ? headLimit * 10 : headLimit,
          })
        }

        totalMatches = results.length

        // 根据输出模式格式化结果
        if (outputMode === 'files_with_matches') {
          // 只返回文件名
          const uniqueFiles = [...new Set(results.map(r => r.file))]
          const limitedFiles = uniqueFiles.slice(0, headLimit)
          
          return {
            success: true,
            result: {
              pattern,
              path: resolvedPath,
              numFiles: uniqueFiles.length,
              files: limitedFiles,
              totalMatches,
              wasTruncated: uniqueFiles.length > headLimit,
            },
            output: limitedFiles.join('\n'),
          }
        } else if (outputMode === 'count') {
          // 返回每个文件的匹配数
          const fileCounts = new Map<string, number>()
          for (const match of results) {
            fileCounts.set(match.file, (fileCounts.get(match.file) || 0) + 1)
          }
          
          const counts = Array.from(fileCounts.entries())
            .map(([file, count]) => `${count} ${file}`)
            .slice(0, headLimit)
            .join('\n')

          return {
            success: true,
            result: {
              pattern,
              path: resolvedPath,
              totalMatches,
              fileCounts: Object.fromEntries(fileCounts),
            },
            output: counts,
          }
        } else {
          // content 模式：返回带行号的内容
          let output = ''
          const limitedResults = results.slice(0, headLimit)
          
          for (const match of limitedResults) {
            const linePrefix = showLineNumbers ? `${match.line}:` : ''
            const contextStart = Math.max(0, match.line - 1 - contextLines)
            const contextEnd = match.line // 上下文行不包含在这里，实际需要重新读取文件

            output += `${match.file}:${linePrefix}${match.content}\n`
          }

          // 检查是否截断
          if (output.length > TOOL_RESULT_LIMITS.MAX_CHARS) {
            const truncated = truncateString(output, TOOL_RESULT_LIMITS.MAX_CHARS)
            return {
              success: true,
              result: {
                pattern,
                path: resolvedPath,
                totalMatches,
                displayedMatches: limitedResults.length,
                wasTruncated: true,
                originalSize: output.length,
              },
              output: truncated.truncated + `\n\n[Results truncated. Showing ${limitedResults.length} of ${totalMatches} matches]`,
            }
          }

          if (totalMatches > headLimit) {
            output += `\n\n[Results truncated. Showing ${limitedResults.length} of ${totalMatches} matches]`
          }

          return {
            success: true,
            result: {
              pattern,
              path: resolvedPath,
              totalMatches,
              displayedMatches: limitedResults.length,
              wasTruncated: totalMatches > headLimit,
            },
            output,
          }
        }
      },
    },

    // ========== GrepCount 工具 ==========
    {
      name: 'GrepCount',
      description: 'Count number of matches for a pattern',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { 
            type: 'string', 
            description: 'Regular expression pattern to search for' 
          },
          path: { 
            type: 'string', 
            description: 'File or directory path to search in',
            default: '.' 
          },
          glob: { 
            type: 'string', 
            description: 'File glob pattern' 
          },
          '-i': { 
            type: 'boolean', 
            description: 'Case insensitive search',
            default: false 
          },
        },
        required: ['pattern'],
      },
      category: 'search',
      isConcurrencySafe: true,
      handler: async (input, context) => {
        const pattern = input.pattern as string
        const searchPath = (input.path as string) || '.'
        const glob = input.glob as string | undefined
        const caseInsensitive = (input['-i'] as boolean) || false

        let regexPattern: RegExp
        try {
          regexPattern = new RegExp(pattern, caseInsensitive ? 'i' : '')
        } catch (error) {
          return {
            success: false,
            error: `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
          }
        }

        const resolvedPath = resolvePathFn(searchPath)

        try {
          const stats = await stat(resolvedPath)
          const isDirectory = stats.isDirectory()

          let results: SearchMatch[] = []
          if (isDirectory) {
            results = await searchDirectory(resolvedPath, regexPattern, {
              glob,
              recursive: true,
            })
          } else {
            results = await searchInFile(resolvedPath, regexPattern, {})
          }

          // 统计每个文件的匹配数
          const fileCounts = new Map<string, number>()
          for (const match of results) {
            fileCounts.set(match.file, (fileCounts.get(match.file) || 0) + 1)
          }

          const totalCount = results.length
          const fileCount = fileCounts.size

          return {
            success: true,
            result: {
              pattern,
              path: resolvedPath,
              totalCount,
              fileCount,
              fileCounts: Object.fromEntries(fileCounts),
            },
            output: `${totalCount} matches in ${fileCount} files`,
          }
        } catch {
          return {
            success: false,
            error: `Path not found: ${resolvedPath}`,
          }
        }
      },
    },
  ]
}

export default createSearchTools
