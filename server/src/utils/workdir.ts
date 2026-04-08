/**
 * 工作目录相关辅助函数
 */

import { existsSync } from 'fs'
import type { Dirent } from 'fs'

// 二进制文件扩展名列表
const BINARY_EXTS = [
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.wmv', '.flv',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.exe', '.dll', '.so', '.dylib',
]

export interface DirectoryItem {
  name: string
  path: string
  isDirectory: boolean
  size?: number
  lastModified?: string
  extension?: string
}

/**
 * 读取目录内容并返回文件/文件夹列表
 */
export async function readDirectory(dirPath: string, rootPath: string): Promise<DirectoryItem[]> {
  const fs = await import('fs/promises')
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    
    const items: DirectoryItem[] = []
    
    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`
      
      // 安全检查：确保路径在根目录下
      if (!fullPath.startsWith(rootPath)) {
        continue
      }
      
      let stat
      try {
        stat = await fs.stat(fullPath)
      } catch {
        continue // 跳过无法访问的文件
      }

      // 跳过隐藏的系统文件
      if (entry.name.startsWith('.user-workspace')) {
        continue
      }

      const ext = entry.name.includes('.') ? entry.name.substring(entry.name.lastIndexOf('.')) : ''
      
      items.push({
        name: entry.name,
        path: `/${entry.name}`,
        isDirectory: entry.isDirectory(),
        size: stat.size,
        lastModified: stat.mtime.toISOString(),
        extension: ext,
      })
    }
    
    // 排序：文件夹在前，文件在后，按名称排序
    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
    
    return items
  } catch {
    return []
  }
}

/**
 * 检测文件语言类型（用于语法高亮）
 */
export function detectLanguage(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
  
  const langMap: Record<string, string> = {
    // 前端
    '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
    '.vue': 'vue', '.svelte': 'svelte', '.html': 'html', '.htm': 'html',
    '.css': 'css', '.scss': 'scss', '.sass': 'sass', '.less': 'less',
    '.json': 'json', '.jsonc': 'json',
    
    // 后端
    '.py': 'python', '.pyw': 'python',
    '.java': 'java', '.class': 'java', '.jar': 'java',
    '.go': 'go', '.go.mod': 'go',
    '.rs': 'rust', '.rs.in': 'rust',
    '.rb': 'ruby', '.gemfile': 'ruby',
    '.php': 'php',
    '.cs': 'csharp', '.fs': 'fsharp',
    '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp',
    '.swift': 'swift', '.kt': 'kotlin', '.kts': 'kotlin',
    '.scala': 'scala', '.clj': 'clojure',
    
    // 数据/配置
    '.xml': 'xml', '.yaml': 'yaml', '.yml': 'yaml',
    '.toml': 'toml', '.ini': 'ini', '.cfg': 'ini',
    '.env': 'bash', '.properties': 'properties',
    
    // 容器/编排
    '.dockerfile': 'dockerfile', 'dockerfile': 'dockerfile',
    '.tf': 'hcl', '.tfvars': 'hcl',
    '.k8s': 'yaml', '.kube': 'yaml',
    
    // 文档
    '.md': 'markdown', '.rst': 'rst', '.adoc': 'asciidoc',
    '.tex': 'latex', '.bib': 'bibtex',
    
    // 数据库
    '.sql': 'sql',
    
    // 脚本
    '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
    '.ps1': 'powershell', '.bat': 'batch', '.cmd': 'batch',
  }
  
  // 检查文件名（如 Dockerfile）
  const fileName = filePath.split(/[/\\]/).pop() || ''
  if (fileName.toLowerCase() === 'dockerfile') {
    return 'dockerfile'
  }
  
  return langMap[ext] || 'plaintext'
}

/**
 * 获取文件的 MIME 类型
 */
export function getMimeType(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
  
  const mimeMap: Record<string, string> = {
    // 文本
    '.txt': 'text/plain', '.html': 'text/html', '.htm': 'text/html',
    '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.json': 'application/json', '.xml': 'application/xml',
    '.svg': 'image/svg+xml',
    
    // 图片
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
    '.bmp': 'image/bmp', '.tiff': 'image/tiff', '.tif': 'image/tiff',
    
    // 音视频
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.avi': 'video/x-msvideo',
    
    // 文档
    '.pdf': 'application/pdf', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    
    // 压缩/其他
    '.zip': 'application/zip', '.tar': 'application/x-tar',
    '.gz': 'application/gzip', '.rar': 'application/vnd.rar',
    '.7z': 'application/x-7z-compressed',
  }
  
  return mimeMap[ext] || 'application/octet-stream'
}

/**
 * 判断文件是否为二进制文件
 */
export function isBinaryFile(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
  return BINARY_EXTS.includes(ext)
}

/**
 * 安全地解析工作目录的完整路径
 */
export interface ResolveResult {
  ok: boolean
  fullPath: string
  code?: string
  message?: string
}

/**
 * 解析并验证工作目录路径
 */
export function resolveWorkdirFullPath(
  workspacePath: string,
  targetPath: string
): ResolveResult {
  // 清理目标路径
  const cleanPath = targetPath
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
  
  // 构建完整路径
  const fullPath = `${workspacePath}${cleanPath ? '/' + cleanPath : ''}`
  
  // 安全检查：确保路径在工作区内
  const resolved = fullPath.replace(/\\/g, '/')
  const workspaceResolved = workspacePath.replace(/\\/g, '/')
  
  if (!resolved.startsWith(workspaceResolved)) {
    return {
      ok: false,
      fullPath,
      code: 'FORBIDDEN',
      message: '禁止访问工作区外的路径',
    }
  }
  
  // 检查路径遍历攻击
  if (cleanPath.includes('..')) {
    return {
      ok: false,
      fullPath,
      code: 'FORBIDDEN',
      message: '禁止路径遍历',
    }
  }
  
  return { ok: true, fullPath }
}

/**
 * 测量文件夹的大小和文件数量
 */
export async function measureWorkspaceFolder(dirPath: string): Promise<{ fileCount: number; totalBytes: number }> {
  const fs = await import('fs/promises')
  
  let fileCount = 0
  let totalBytes = 0
  
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`
      
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else {
        try {
          const stat = await fs.stat(fullPath)
          fileCount++
          totalBytes += stat.size
        } catch {
          // 跳过无法访问的文件
        }
      }
    }
  }
  
  await walk(dirPath)
  
  return { fileCount, totalBytes }
}

/**
 * 判断文件是否为图片文件
 */
export function isImageFile(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.ico'].includes(ext)
}

/**
 * 判断文件是否为文档文件
 */
export function isDocumentFile(filePath: string): boolean {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
  return ['.md', '.markdown', '.txt', '.rst', '.adoc', '.pdf', '.doc', '.docx'].includes(ext)
}

/**
 * 获取文件类型的友好名称
 */
export function getFileTypeFriendlyName(filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase()
  
  const typeMap: Record<string, string> = {
    // 代码
    '.js': 'JavaScript', '.ts': 'TypeScript', '.jsx': 'React JSX', '.tsx': 'React TSX',
    '.py': 'Python', '.java': 'Java', '.go': 'Go', '.rs': 'Rust',
    '.c': 'C', '.cpp': 'C++', '.cs': 'C#', '.rb': 'Ruby',
    '.php': 'PHP', '.swift': 'Swift', '.kt': 'Kotlin',
    
    // 前端
    '.html': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.less': 'LESS',
    '.vue': 'Vue', '.svelte': 'Svelte',
    
    // 配置/数据
    '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML',
    '.xml': 'XML', '.toml': 'TOML', '.ini': 'INI',
    '.sql': 'SQL', '.csv': 'CSV',
    
    // 文档
    '.md': 'Markdown', '.txt': '文本文件', '.pdf': 'PDF',
    
    // 图片
    '.png': 'PNG 图片', '.jpg': 'JPEG 图片', '.gif': 'GIF 图片',
    '.svg': 'SVG 图片', '.webp': 'WebP 图片',
    
    // 其他
    '.zip': 'ZIP 压缩包', '.tar': 'TAR 归档', '.gz': 'GZIP 压缩',
    '.exe': '可执行文件', '.dll': '动态链接库',
  }
  
  return typeMap[ext] || '文件'
}