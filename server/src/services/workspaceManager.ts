/**
 * Agent Workspace Manager - 工作目录管理器
 * 
 * 功能：
 * - 为每个会话创建独立的工作目录
 * - 管理用户上传的文件
 * - 维护工作区元数据
 * - 提供文件操作接口
 * 
 * 目录结构：
 * server/workspaces/
 * └── {userId}/
 *     └── {sessionId}/
 *         ├── uploads/          # 用户上传的文件
 *         ├── outputs/         # AI 生成的输出文件
 *         ├── temp/            # 临时文件
 *         ├── .workspace.json  # 工作区元数据
 *         └── README.md        # 工作区说明文档
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { createWriteStream, existsSync } from 'fs'

// ==================== 类型定义 ====================

/** 
 * 工作区配置
 */
export interface WorkspaceConfig {
  /** 基础目录路径 */
  baseDir?: string
  /** 最大存储空间 (MB) */
  maxStorageSize?: number
  /** 最大文件数量 */
  maxFileCount?: number
  /** 单个文件最大大小 (MB) */
  maxFileSize?: number
  /** 允许的文件类型 */
  allowedFileTypes?: string[]
  /** 禁止的文件类型 */
  deniedFileTypes?: string[]
}

/**
 * 工作区元数据
 */
export interface WorkspaceMetadata {
  /** 工作区 ID */
  workspaceId: string
  /** 用户 ID */
  userId: string
  /** 会话 ID */
  sessionId: string
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  lastModifiedAt: string
  /** 工作区路径 */
  path: string
  /** 文件统计 */
  stats: {
    totalFiles: number
    totalSize: number
    uploadCount: number
    outputCount: number
  }
  /** 上传的文件列表 */
  uploadedFiles: Array<{
    filename: string
    originalName: string
    size: number
    type: string
    uploadedAt: string
    path: string
  }>
}

/**
 * 上传结果
 */
export interface UploadResult {
  success: boolean
  fileId?: string
  filename?: string
  originalName?: string
  path?: string
  size?: number
  error?: string
}

/**
 * 文件列表项
 */
export interface FileItem {
  filename: string
  originalName: string
  size: number
  sizeFormatted: string
  type: string
  uploadedAt: string
  path: string
  isUploaded: boolean
}

// ==================== 默认配置 ====================

const DEFAULT_CONFIG: Required<WorkspaceConfig> = {
  baseDir: path.join(process.cwd(), '..', 'workspaces'),
  maxStorageSize: 100,      // 100MB
  maxFileCount: 50,
  maxFileSize: 10,          // 10MB
  allowedFileTypes: [
    '.txt', '.md', '.json', '.csv', '.xml', '.yaml', '.yml',
    '.js', '.ts', '.py', '.java', '.c', '.cpp', '.h',
    '.html', '.css', '.scss', '.less',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.zip', '.tar', '.gz'
  ],
  deniedFileTypes: [
    '.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs',
    '.msi', '.dll', '.so', '.dylib',
    '.com', '.scr', '.pif'
  ]
}

// ==================== Workspace Manager ====================

export class WorkspaceManager {
  private config: Required<WorkspaceConfig>
  private workspaces: Map<string, WorkspaceMetadata> = new Map()

  constructor(config?: WorkspaceConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    
    // 确保基础目录存在
    this.ensureBaseDirectory()
  }

  /**
   * 确保基础目录存在
   */
  private async ensureBaseDirectory(): Promise<void> {
    try {
      if (!existsSync(this.config.baseDir)) {
        await fs.mkdir(this.config.baseDir, { recursive: true })
        console.log(`[WorkspaceManager] 基础目录已创建: ${this.config.baseDir}`)
      }
    } catch (error) {
      console.error('[WorkspaceManager] 创建基础目录失败:', error)
    }
  }

  /**
   * 为会话创建工作目录
   * @param userId 用户ID
   * @param sessionId 会话ID
   * @returns 工作区元数据
   */
  async createWorkspace(userId: string, sessionId: string): Promise<WorkspaceMetadata> {
    const workspaceId = `ws_${userId}_${sessionId}`
    const workspacePath = path.join(this.config.baseDir, userId, sessionId)
    
    // 检查是否已存在
    if (this.workspaces.has(workspaceId)) {
      return this.workspaces.get(workspaceId)!
    }

    // 创建目录结构
    const dirs = ['uploads', 'outputs', 'temp']
    for (const dir of dirs) {
      const dirPath = path.join(workspacePath, dir)
      if (!existsSync(dirPath)) {
        await fs.mkdir(dirPath, { recursive: true })
      }
    }

    // 创建工作区元数据
    const now = new Date().toISOString()
    const metadata: WorkspaceMetadata = {
      workspaceId,
      userId,
      sessionId,
      createdAt: now,
      lastModifiedAt: now,
      path: workspacePath,
      stats: {
        totalFiles: 0,
        totalSize: 0,
        uploadCount: 0,
        outputCount: 0
      },
      uploadedFiles: []
    }

    // 保存元数据
    await this.saveMetadata(metadata)

    // 创建 README.md 文件
    await this.createReadme(workspacePath, sessionId)

    // 缓存到内存
    this.workspaces.set(workspaceId, metadata)

    console.log(`[WorkspaceManager] 工作区已创建: ${workspacePath}`)
    return metadata
  }

  /**
   * 获取工作区信息
   * @param sessionId 会话ID
   * @returns 工作区元数据或null
   */
  async getWorkspace(sessionId: string): Promise<WorkspaceMetadata | null> {
    // 先从内存查找
    for (const [, metadata] of this.workspaces) {
      if (metadata.sessionId === sessionId) {
        return metadata
      }
    }

    // 从磁盘加载
    try {
      const metadata = await this.loadMetadataBySession(sessionId)
      if (metadata) {
        this.workspaces.set(metadata.workspaceId, metadata)
        return metadata
      }
    } catch (error) {
      console.error('[WorkspaceManager] 加载工作区失败:', error)
    }

    return null
  }

  /**
   * 上传文件到工作区
   * @param sessionId 会话ID
   * @param fileBuffer 文件缓冲区
   * @param originalName 原始文件名
   * @param mimeType MIME类型
   * @returns 上传结果
   */
  async uploadFile(
    sessionId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string = 'application/octet-stream'
  ): Promise<UploadResult> {
    // 获取或创建工作区
    let workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      // 尝试从会话ID推断用户ID（需要外部传入）
      throw new Error('工作区不存在，请先创建会话')
    }

    // 验证文件
    const validation = this.validateFile(originalName, fileBuffer.length)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      }
    }

    // 检查存储空间
    if (workspace.stats.totalSize + fileBuffer.length > this.config.maxStorageSize * 1024 * 1024) {
      return {
        success: false,
        error: `存储空间不足（最大 ${this.config.maxStorageSize}MB）`
      }
    }

    // 检查文件数量
    if (workspace.stats.totalFiles >= this.config.maxFileCount) {
      return {
        success: false,
        error: `文件数量已达上限（最大 ${this.config.maxFileCount} 个）`
      }
    }

    // 生成安全的文件名
    const fileId = uuidv4()
    const ext = path.extname(originalName)
    const safeFilename = `${fileId}${ext}`
    const filePath = path.join(workspace.path, 'uploads', safeFilename)

    // 写入文件
    try {
      await fs.writeFile(filePath, fileBuffer)

      // 更新元数据
      const fileRecord = {
        filename: safeFilename,
        originalName,
        size: fileBuffer.length,
        type: mimeType,
        uploadedAt: new Date().toISOString(),
        path: filePath
      }

      workspace.uploadedFiles.push(fileRecord)
      workspace.stats.totalFiles++
      workspace.stats.totalSize += fileBuffer.length
      workspace.stats.uploadCount++
      workspace.lastModifiedAt = new Date().toISOString()

      // 保存更新后的元数据
      await this.saveMetadata(workspace)

      console.log(`[WorkspaceManager] 文件已上传: ${originalName} -> ${filePath}`)
      
      return {
        success: true,
        fileId,
        filename: safeFilename,
        originalName,
        path: filePath,
        size: fileBuffer.length
      }
    } catch (error) {
      console.error('[WorkspaceManager] 文件上传失败:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : '文件上传失败'
      }
    }
  }

  /**
   * 使用流式上传大文件
   * @param sessionId 会话ID
   * @param readStream 文件读取流
   * @param originalName 原始文件名
   * @param fileSize 文件大小
   * @param mimeType MIME类型
   * @returns 上传结果
   */
  async uploadFileStream(
    sessionId: string,
    readStream: NodeJS.ReadableStream,
    originalName: string,
    fileSize: number,
    mimeType: string = 'application/octet-stream'
  ): Promise<UploadResult> {
    // 获取工作区
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return {
        success: false,
        error: '工作区不存在'
      }
    }

    // 验证文件
    const validation = this.validateFile(originalName, fileSize)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      }
    }

    // 生成文件路径
    const fileId = uuidv4()
    const ext = path.extname(originalName)
    const safeFilename = `${fileId}${ext}`
    const filePath = path.join(workspace.path, 'uploads', safeFilename)

    // 流式写入
    return new Promise((resolve) => {
      const writeStream = createWriteStream(filePath)
      let receivedBytes = 0

      readStream.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length
        
        // 实时检查大小限制
        if (receivedBytes > this.config.maxFileSize * 1024 * 1024) {
          readStream.destroy()
          writeStream.destroy()
          fs.unlink(filePath).catch(() => {})
          
          resolve({
            success: false,
            error: `文件过大（最大 ${this.config.maxFileSize}MB）`
          })
        }
      })

      writeStream.on('finish', async () => {
        try {
          // 更新元数据
          const fileRecord = {
            filename: safeFilename,
            originalName,
            size: receivedBytes,
            type: mimeType,
            uploadedAt: new Date().toISOString(),
            path: filePath
          }

          workspace.uploadedFiles.push(fileRecord)
          workspace.stats.totalFiles++
          workspace.stats.totalSize += receivedBytes
          workspace.stats.uploadCount++
          workspace.lastModifiedAt = new Date().toISOString()

          await this.saveMetadata(workspace)

          resolve({
            success: true,
            fileId,
            filename: safeFilename,
            originalName,
            path: filePath,
            size: receivedBytes
          })
        } catch (error) {
          resolve({
            success: false,
            error: error instanceof Error ? error.message : '保存元数据失败'
          })
        }
      })

      writeStream.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        })
      })

      readStream.on('error', (error) => {
        resolve({
          success: false,
          error: error.message
        })
      })

      // 开始流式传输
      readStream.pipe(writeStream)
    })
  }

  /**
   * 获取工作区中的所有文件
   * @param sessionId 会话ID
   * @returns 文件列表
   */
  async listFiles(sessionId: string): Promise<FileItem[]> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return []
    }

    return workspace.uploadedFiles.map(file => ({
      ...file,
      sizeFormatted: this.formatFileSize(file.size),
      isUploaded: true
    }))
  }

  /**
   * 删除文件
   * @param sessionId 会话ID
   * @param filename 文件名
   * @returns 是否成功
   */
  async deleteFile(sessionId: string, filename: string): Promise<boolean> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return false
    }

    const fileIndex = workspace.uploadedFiles.findIndex(f => f.filename === filename)
    if (fileIndex === -1) {
      return false
    }

    const file = workspace.uploadedFiles[fileIndex]
    
    try {
      // 删除物理文件
      await fs.unlink(file.path)

      // 更新元数据
      workspace.uploadedFiles.splice(fileIndex, 1)
      workspace.stats.totalFiles--
      workspace.stats.totalSize -= file.size
      workspace.stats.uploadCount--
      workspace.lastModifiedAt = new Date().toISOString()

      await this.saveMetadata(workspace)

      console.log(`[WorkspaceManager] 文件已删除: ${filename}`)
      return true
    } catch (error) {
      console.error('[WorkspaceManager] 删除文件失败:', error)
      return false
    }
  }

  /**
   * 获取文件的完整路径（用于注入到AI上下文中）
   * @param sessionId 会话ID
   * @returns 文件路径数组
   */
  async getFilePathsForContext(sessionId: string): Promise<string[]> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace || workspace.uploadedFiles.length === 0) {
      return []
    }

    return workspace.uploadedFiles.map(file => file.path)
  }

  /**
   * 生成工作区摘要（用于注入到AI上下文）
   * 采用无感模式：不暴露真实路径，Agent 只感知到工作区内的文件
   * @param sessionId 会话ID
   * @returns 工作区摘要文本
   */
  async getWorkspaceSummaryForContext(sessionId: string): Promise<string> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return ''
    }

    const lines = [
      `\n## 📁 当前工作环境`,
      `- 已就绪的工作区已为您准备好`
    ]

    if (workspace.uploadedFiles.length > 0) {
      lines.push(`- 📎 您已上传 ${workspace.uploadedFiles.length} 个文件，可直接使用`)
      lines.push('\n### 📋 可用文件:')
      
      for (const file of workspace.uploadedFiles) {
        // 只显示文件名，不暴露完整路径
        lines.push(`- **${file.originalName}** (${this.formatFileSize(file.size)})`)
        lines.push(`  - 类型: ${file.type}`)
      }
      
      lines.push('\n💡 提示：您可以直接引用这些文件名来处理它们')
    } else {
      lines.push('- 💡 您可以通过上传按钮添加文件到工作区')
    }

    return lines.join('\n')
  }

  /**
   * 清空工作区
   * @param sessionId 会话ID
   * @returns 是否成功
   */
  async clearWorkspace(sessionId: string): Promise<boolean> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return false
    }

    try {
      // 删除整个工作区目录
      await fs.rm(workspace.path, { recursive: true, force: true })

      // 从缓存中移除
      this.workspaces.delete(workspace.workspaceId)

      console.log(`[WorkspaceManager] 工作区已清空: ${sessionId}`)
      return true
    } catch (error) {
      console.error('[WorkspaceManager] 清空工作区失败:', error)
      return false
    }
  }

  /**
   * 销毁工作区（删除并清理）
   * @param sessionId 会话ID
   */
  async destroyWorkspace(sessionId: string): Promise<void> {
    await this.clearWorkspace(sessionId)
  }

  // ==================== 无感路径映射（Agent 透明层）====================

  /**
   * 获取 Agent 可见的工作目录（简化路径，不暴露真实位置）
   * Agent 看到的只是 ~/workspace 这样的虚拟路径
   * @param sessionId 会话ID
   * @returns 虚拟工作目录路径
   */
  async getVirtualWorkingDirectory(sessionId: string): Promise<string> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return ''
    }
    
    // 返回虚拟路径，让 Agent 感知不到真实位置
    return `~/workspace`
  }

  /**
   * 获取真实的物理工作目录（内部使用）
   * @param sessionId 会话ID
   * @returns 真实文件系统路径
   */
  async getRealWorkingDirectory(sessionId: string): Promise<string> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return ''
    }
    
    return workspace.path
  }

  /**
   * 将 Agent 提供的虚拟/相对路径转换为真实路径
   * 例如：'data.csv' → 'D:/.../workspaces/xxx/uploads/data.csv'
   * @param sessionId 会话ID
   * @param virtualPath 虚拟或相对路径
   * @returns 真实文件系统路径
   */
  async resolvePath(sessionId: string, virtualPath: string): Promise<string> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return virtualPath
    }

    // 如果已经是绝对路径且在 workspace 内部，直接返回
    if (path.isAbsolute(virtualPath) && virtualPath.startsWith(workspace.path)) {
      return virtualPath
    }

    // 尝试匹配已上传的文件名
    const matchedFile = workspace.uploadedFiles.find(
      f => f.originalName === virtualPath || 
           f.filename === virtualPath ||
           path.basename(virtualPath) === f.originalName
    )

    if (matchedFile) {
      return matchedFile.path
    }

    // 如果是相对路径，解析为 workspace 下的路径
    if (!path.isAbsolute(virtualPath)) {
      // 安全检查：防止路径穿越攻击
      const resolved = path.resolve(workspace.path, virtualPath)
      if (resolved.startsWith(workspace.path)) {
        return resolved
      }
      
      // 不安全的路径，返回 uploads 目录下的安全路径
      return path.join(workspace.path, 'uploads', path.basename(virtualPath))
    }

    // 默认返回原始路径（外部绝对路径）
    return virtualPath
  }

  /**
   * 将真实路径转换为 Agent 可见的虚拟路径（隐藏细节）
   * @param sessionId 会话ID
   * @param realPath 真实路径
   * @returns 虚拟路径（只显示文件名）
   */
  async toVirtualPath(sessionId: string, realPath: string): Promise<string> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return path.basename(realPath)
    }

    // 查找对应的上传文件记录
    const fileRecord = workspace.uploadedFiles.find(f => f.path === realPath)
    if (fileRecord) {
      return fileRecord.originalName
    }

    // 如果路径在 workspace 内部，转换为相对路径
    if (realPath.startsWith(workspace.path)) {
      const relative = path.relative(workspace.path, realPath)
      return relative
    }

    // 外部路径，只显示文件名
    return path.basename(realPath)
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 验证文件是否符合要求
   */
  private validateFile(filename: string, size: number): { valid: boolean; error?: string } {
    // 检查文件大小
    if (size > this.config.maxFileSize * 1024 * 1024) {
      return {
        valid: false,
        error: `文件过大（最大 ${this.config.maxFileSize}MB，当前 ${this.formatFileSize(size)}）`
      }
    }

    // 检查文件扩展名
    const ext = path.extname(filename).toLowerCase()
    
    if (this.config.deniedFileTypes.includes(ext)) {
      return {
        valid: false,
        error: `不允许的文件类型: ${ext}`
      }
    }

    if (!this.config.allowedFileTypes.includes(ext)) {
      return {
        valid: false,
        error: `不支持的文件类型: ${ext}（允许的类型: ${this.config.allowedFileTypes.join(', ')}）`
      }
    }

    return { valid: true }
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let unitIndex = 0
    let size = bytes

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`
  }

  /**
   * 保存工作区元数据到磁盘
   */
  private async saveMetadata(metadata: WorkspaceMetadata): Promise<void> {
    const metadataPath = path.join(metadata.path, '.workspace.json')
    await fs.writeFile(
      metadataPath,
      JSON.stringify(metadata, null, 2),
      'utf-8'
    )
  }

  /**
   * 从磁盘加载元数据
   */
  private async loadMetadata(workspacePath: string): Promise<WorkspaceMetadata | null> {
    try {
      const metadataPath = path.join(workspacePath, '.workspace.json')
      const content = await fs.readFile(metadataPath, 'utf-8')
      return JSON.parse(content) as WorkspaceMetadata
    } catch {
      return null
    }
  }

  /**
   * 根据会话ID加载元数据
   */
  private async loadMetadataBySession(sessionId: string): Promise<WorkspaceMetadata | null> {
    // 遍历用户目录查找
    try {
      const usersDir = this.config.baseDir
      const users = await fs.readdir(usersDir)

      for (const userId of users) {
        const sessionPath = path.join(usersDir, userId, sessionId)
        const metadata = await this.loadMetadata(sessionPath)
        if (metadata && metadata.sessionId === sessionId) {
          return metadata
        }
      }
    } catch (error) {
      console.error('[WorkspaceManager] 查找工作区失败:', error)
    }

    return null
  }

  /**
   * 创建 README.md 文件
   */
  private async createReadme(workspacePath: string, sessionId: string): Promise<void> {
    const readmeContent = `# Agent Workspace - ${sessionId}

这是该会话的工作目录，用于存放用户上传的文件和 AI 生成的输出。

## 目录结构

\`\`\`
uploads/   # 用户上传的文件
outputs/   # AI 生成的输出文件
temp/      # 临时文件
\`\`\`

## 使用说明

1. 用户可以通过界面上传文件到此工作区的 \`uploads/\` 目录
2. AI 可以访问这些文件并进行处理
3. 处理结果可以保存到 \`outputs/\` 目录
4. 会话结束后，工作区将根据配置自动清理

---
*由 Claude Code HAHA 自动生成*
`

    const readmePath = path.join(workspacePath, 'README.md')
    await fs.writeFile(readmePath, readmeContent, 'utf-8')
  }
}

// ==================== 单例模式 ====================

let workspaceManagerInstance: WorkspaceManager | null = null

/**
 * 获取 WorkspaceManager 单例实例
 */
export function getWorkspaceManager(config?: WorkspaceConfig): WorkspaceManager {
  if (!workspaceManagerInstance) {
    workspaceManagerInstance = new WorkspaceManager(config)
  }
  return workspaceManagerInstance
}
