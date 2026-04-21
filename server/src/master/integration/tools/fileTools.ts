/**
 * 文件操作工具集
 *
 * 功能：
 * - FileRead: 读取文件内容
 * - FileWrite: 写入文件
 * - FileEdit: 编辑文件（替换文本）
 * - FileDelete: 删除文件/目录
 * - FileRename: 重命名/移动文件
 * - Glob: 文件模式匹配
 * - FileList: 列出目录内容
 */

import { readFile, writeFile, readdir, stat, chmod, rename, unlink } from 'fs/promises'
import { join, resolve, relative, dirname, extname } from 'path'
import { glob as globAsync } from 'glob'
import type { ToolDefinition, ToolExecutionContext, ToolResult } from '../types/toolTypes'
import { FILE_READ_LIMITS, TOOL_RESULT_LIMITS, formatBytes, truncateString } from '../../utils/fileLimits'

/**
 * 二进制文件扩展名（不应该被读取为文本）
 */
const BINARY_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flv',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.db', '.sqlite', '.mdb',
  '.class', '.pyc', '.pyd', '.pyo',
])

/**
 * 创建文件操作工具定义列表
 */
export function createFileTools(resolvePathFn: (path: string) => string, ensureDirFn: (dir: string) => Promise<void>): ToolDefinition[] {
  return [
    {
      name: 'FileRead',
      description: 'Read contents of a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          limit: { type: 'number', description: 'Maximum number of lines to read' },
          offset: { type: 'number', description: 'Starting line number (0-indexed)' },
          encoding: { type: 'string', description: 'File encoding', default: 'utf-8' },
        },
        required: ['path'],
      },
      category: 'file',
      handler: async (input, context) => {
        const filePath = resolvePathFn(input.path as string)
        const limit = input.limit as number
        const offset = input.offset as number
        const encoding = (input.encoding as string) || 'utf-8'

        // 检查文件是否存在
        let st
        try {
          st = await stat(filePath)
        } catch {
          return {
            success: false,
            error: `文件不存在: ${filePath}`,
          }
        }

        if (st.isDirectory()) {
          return {
            success: false,
            error: '路径是文件夹，无法按文件打开。请在文件浏览器中选择具体文件，或使用 FileList 查看目录内容。',
          }
        }

        // 检查文件大小限制
        if (st.size > FILE_READ_LIMITS.MAX_BYTES) {
          return {
            success: false,
            error: `文件过大 (${formatBytes(st.size)})，超过限制 (${formatBytes(FILE_READ_LIMITS.MAX_BYTES)})。请使用 offset 和 limit 参数读取部分内容。`,
          }
        }

        // 检查是否为二进制文件
        const ext = extname(filePath).toLowerCase()
        if (BINARY_EXTENSIONS.has(ext)) {
          return {
            success: false,
            error: `无法读取二进制文件: ${extname(filePath)}。请使用其他方式处理此文件。`,
          }
        }

        const content = await readFile(filePath, encoding as BufferEncoding)

        // 检查内容大小
        if (content.length > TOOL_RESULT_LIMITS.MAX_BYTES) {
          const truncated = truncateString(content, TOOL_RESULT_LIMITS.MAX_BYTES)
          return {
            success: true,
            result: {
              content: truncated.truncated,
              path: filePath,
              totalLines: content.split('\n').length,
              wasTruncated: true,
              originalSize: content.length,
              truncationNotice: `\n\n[输出已截断] 原始大小: ${formatBytes(content.length)}, 截断至: ${formatBytes(TOOL_RESULT_LIMITS.MAX_BYTES)}`,
            },
          }
        }

        if (limit || offset) {
          const lines = content.split('\n')
          const start = offset || 0
          const end = limit ? Math.min(start + limit, lines.length) : lines.length

          // 检查截断后的内容大小
          const slicedContent = lines.slice(start, end).join('\n')
          let finalContent = slicedContent
          let truncationInfo: { wasTruncated: boolean; originalSize?: number } = { wasTruncated: false }

          if (slicedContent.length > TOOL_RESULT_LIMITS.MAX_CHARS) {
            const truncated = truncateString(slicedContent, TOOL_RESULT_LIMITS.MAX_CHARS)
            finalContent = truncated.truncated
            truncationInfo = {
              wasTruncated: true,
              originalSize: slicedContent.length,
            }
          }

          return {
            success: true,
            result: {
              content: finalContent,
              path: filePath,
              totalLines: lines.length,
              readLines: end - start,
              startLine: start,
              ...truncationInfo,
              ...(truncationInfo.wasTruncated ? {
                truncationNotice: `\n\n[输出已截断] 原始大小: ${formatBytes(truncationInfo.originalSize!)}, 截断至: ${formatBytes(TOOL_RESULT_LIMITS.MAX_CHARS)}`,
              } : {}),
            },
          }
        }

        return {
          success: true,
          result: {
            content,
            path: filePath,
            size: content.length,
            sizeFormatted: formatBytes(content.length),
            lines: content.split('\n').length,
          },
        }
      },
    },

    {
      name: 'FileWrite',
      description: 'Write content to a file',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          content: { type: 'string', description: 'Content to write' },
          append: { type: 'boolean', description: 'Append to existing file', default: false },
          mode: { type: 'string', description: 'File permissions (octal)' },
        },
        required: ['path', 'content'],
      },
      category: 'file',
      permissions: { dangerous: true },
      handler: async (input) => {
        const filePath = resolvePathFn(input.path as string)
        const content = input.content as string
        const append = (input.append as boolean) || false
        const mode = input.mode as string

        // Create parent directory if it doesn't exist
        const dir = dirname(filePath)
        await ensureDirFn(dir)

        if (append) {
          await writeFile(filePath, content, { flag: 'a' })
        } else {
          await writeFile(filePath, content)
        }

        if (mode) {
          await chmod(filePath, parseInt(mode, 8))
        }

        const stats = await stat(filePath)
        const rel = relative(context.projectRoot, filePath)
        const virtualPath = '/' + rel.split(/[/\\]/).filter(Boolean).join('/')

        return {
          success: true,
          result: {
            path: filePath,
            virtualPath,
            bytesWritten: stats.size,
            mode: stats.mode.toString(8),
          },
        }
      },
    },

    {
      name: 'FileEdit',
      description: 'Edit a file by replacing text',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file' },
          old_string: { type: 'string', description: 'Text to find and replace' },
          new_string: { type: 'string', description: 'Replacement text' },
          replace_all: { type: 'boolean', description: 'Replace all occurrences', default: false },
        },
        required: ['path', 'old_string', 'new_string'],
      },
      category: 'file',
      permissions: { dangerous: true },
      handler: async (input) => {
        const filePath = resolvePathFn(input.path as string)
        const oldString = input.old_string as string
        const newString = input.new_string as string
        const replaceAll = (input.replace_all as boolean) || false

        const content = await readFile(filePath, 'utf-8')

        if (!content.includes(oldString)) {
          return { success: false, error: `Text not found: ${oldString.substring(0, 50)}...` }
        }

        let newContent: string
        let replaceCount: number

        if (replaceAll) {
          const regex = new RegExp(escapeRegex(oldString), 'g')
          const matches = content.match(regex)
          replaceCount = matches?.length || 0
          newContent = content.replace(regex, newString)
        } else {
          replaceCount = 1
          newContent = content.replace(oldString, newString)
        }

        await writeFile(filePath, newContent)

        return {
          success: true,
          result: {
            path: filePath,
            replacements: replaceCount,
          },
        }
      },
    },

    {
      name: 'FileDelete',
      description: 'Delete a file or directory',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to delete' },
          recursive: { type: 'boolean', description: 'Delete directories recursively', default: false },
        },
        required: ['path'],
      },
      category: 'file',
      permissions: { dangerous: true },
      handler: async (input) => {
        const targetPath = resolvePathFn(input.path as string)
        const recursive = (input.recursive as boolean) || false

        const stats = await stat(targetPath)
        if (stats.isDirectory() && !recursive) {
          return { success: false, error: 'Use recursive=true to delete directories' }
        }

        await unlink(targetPath)

        return {
          success: true,
          result: { path: targetPath, deleted: true },
        }
      },
    },

    {
      name: 'FileRename',
      description: 'Rename or move a file',
      inputSchema: {
        type: 'object',
        properties: {
          oldPath: { type: 'string', description: 'Current path' },
          newPath: { type: 'string', description: 'New path' },
        },
        required: ['oldPath', 'newPath'],
      },
      category: 'file',
      permissions: { dangerous: true },
      handler: async (input) => {
        const oldPath = resolvePathFn(input.oldPath as string)
        const newPath = resolvePathFn(input.newPath as string)

        await rename(oldPath, newPath)

        return {
          success: true,
          result: { oldPath, newPath },
        }
      },
    },

    {
      name: 'Glob',
      description: 'Find files matching a pattern',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern (e.g., "**/*.ts")' },
          path: { type: 'string', description: 'Directory to search in', default: '.' },
          excludePatterns: { type: 'array', description: 'Patterns to exclude' },
        },
        required: ['pattern'],
      },
      category: 'file',
      handler: async (input, context) => {
        const pattern = input.pattern as string
        const searchPath = (input.path as string) || context.projectRoot
        const excludePatterns = (input.excludePatterns as string[]) || []

        // 检查结果数量限制
        const MAX_GLOB_RESULTS = 500

        try {
          const files = await globAsync(pattern, {
            cwd: searchPath,
            ignore: excludePatterns,
            absolute: true,
          })

          // 如果结果过多，进行截断
          const totalMatches = files.length
          const limitedFiles = files.slice(0, MAX_GLOB_RESULTS)
          const wasTruncated = totalMatches > MAX_GLOB_RESULTS

          return {
            success: true,
            result: {
              pattern,
              path: searchPath,
              matches: totalMatches,
              files: limitedFiles,
              wasTruncated,
              truncationNotice: wasTruncated
                ? `\n\n[结果已截断] 共找到 ${totalMatches} 个匹配项，显示前 ${MAX_GLOB_RESULTS} 个。请使用更精确的模式进行搜索。`
                : undefined,
            },
          }
        } catch (error) {
          return {
            success: false,
            error: `无效的 glob 模式: ${pattern}`,
          }
        }
      },
    },

    {
      name: 'FileList',
      description: 'List contents of a directory',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path', default: '.' },
          recursive: { type: 'boolean', description: 'List recursively', default: false },
          showHidden: { type: 'boolean', description: 'Show hidden files', default: false },
        },
      },
      category: 'file',
      handler: async (input, context) => {
        const dirPath = resolvePathFn((input.path as string) || '.')
        const recursive = (input.recursive as boolean) || false
        const showHidden = (input.showHidden as boolean) || false

        // 检查结果数量限制
        const MAX_LIST_RESULTS = 500

        try {
          const entries = await readdir(dirPath, {
            withFileTypes: true,
            recursive
          })

          let files = entries
            .filter(entry => showHidden || !entry.name.startsWith('.'))
            .map(entry => ({
              name: entry.name,
              path: join(dirPath, entry.name),
              isDirectory: entry.isDirectory(),
              isFile: entry.isFile(),
            }))

          const totalCount = files.length
          const limitedFiles = files.slice(0, MAX_LIST_RESULTS)
          const wasTruncated = totalCount > MAX_LIST_RESULTS

          return {
            success: true,
            result: {
              path: dirPath,
              count: totalCount,
              files: limitedFiles,
              wasTruncated,
              truncationNotice: wasTruncated
                ? `\n\n[结果已截断] 目录共有 ${totalCount} 个项目，显示前 ${MAX_LIST_RESULTS} 个。`
                : undefined,
            },
          }
        } catch (error) {
          return {
            success: false,
            error: `无法列出目录: ${dirPath}`,
          }
        }
      },
    },
  ]
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
