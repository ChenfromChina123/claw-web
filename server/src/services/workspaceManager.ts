/**
 * Agent Workspace Manager - 工作目录管理器
 *
 * 功能：
 * - 用户主工作目录：存储 skills、用户配置、全局数据
 * - 会话工作目录：存储会话相关的临时文件、上传文件、输出文件
 *
 * 目录结构：
 * server/workspaces/
 * ├── users/                              # 用户主目录
 * │   └── {userId}/
 * │       ├── skills/                     # 用户的 skills 安装
 * │       ├── config/                     # 用户配置文件
 * │       ├── data/                       # 用户数据
 * │       ├── .user-workspace.json        # 用户工作区元数据
 * │       └── README.md
 * └── sessions/                           # 会话目录
 *     └── {userId}/
 *         └── {sessionId}/
 *             ├── uploads/                # 用户上传的文件
 *             ├── outputs/                 # AI 生成的输出文件
 *             ├── temp/                    # 临时文件
 *             ├── .workspace.json         # 会话工作区元数据
 *             └── README.md
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
 * 会话工作区元数据
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
 * 用户主工作区元数据
 */
export interface UserWorkspaceMetadata {
  /** 工作区 ID */
  workspaceId: string
  /** 用户 ID */
  userId: string
  /** 创建时间 */
  createdAt: string
  /** 最后更新时间 */
  lastModifiedAt: string
  /** 工作区路径 */
  path: string
  /** 已安装的 skills 列表 */
  installedSkills: Array<{
    skillId: string
    name: string
    version: string
    installedAt: string
    path: string
  }>
  /** 配置信息 */
  config: Record<string, any>
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
  maxStorageSize: 100,
  maxFileCount: 50,
  maxFileSize: 10,
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
  private sessionWorkspaces: Map<string, WorkspaceMetadata> = new Map()
  private userWorkspaces: Map<string, UserWorkspaceMetadata> = new Map()

  constructor(config?: WorkspaceConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
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
      const usersDir = path.join(this.config.baseDir, 'users')
      const sessionsDir = path.join(this.config.baseDir, 'sessions')
      if (!existsSync(usersDir)) {
        await fs.mkdir(usersDir, { recursive: true })
      }
      if (!existsSync(sessionsDir)) {
        await fs.mkdir(sessionsDir, { recursive: true })
      }
    } catch (error) {
      console.error('[WorkspaceManager] 创建基础目录失败:', error)
    }
  }

  /**
   * 获取用户主工作目录
   * @param userId 用户ID
   * @returns 用户工作区元数据
   */
  async getUserWorkspace(userId: string): Promise<UserWorkspaceMetadata | null> {
    if (this.userWorkspaces.has(userId)) {
      return this.userWorkspaces.get(userId)!
    }

    try {
      const userPath = path.join(this.config.baseDir, 'users', userId)
      const metadataPath = path.join(userPath, '.user-workspace.json')

      if (existsSync(metadataPath)) {
        const content = await fs.readFile(metadataPath, 'utf-8')
        const metadata = JSON.parse(content) as UserWorkspaceMetadata
        this.userWorkspaces.set(userId, metadata)
        return metadata
      }
    } catch (error) {
      console.error('[WorkspaceManager] 加载用户工作区失败:', error)
    }

    return null
  }

  /**
   * 获取或创建用户主工作目录
   * @param userId 用户ID
   * @returns 用户工作区元数据
   */
  async getOrCreateUserWorkspace(userId: string): Promise<UserWorkspaceMetadata> {
    let workspace = await this.getUserWorkspace(userId)

    if (!workspace) {
      workspace = await this.createUserWorkspace(userId)
    }

    return workspace
  }

  /**
   * 创建用户主工作目录
   * @param userId 用户ID
   * @returns 用户工作区元数据
   */
  async createUserWorkspace(userId: string): Promise<UserWorkspaceMetadata> {
    const workspacePath = path.join(this.config.baseDir, 'users', userId)

    const dirs = ['skills', 'config', 'data']
    for (const dir of dirs) {
      const dirPath = path.join(workspacePath, dir)
      if (!existsSync(dirPath)) {
        await fs.mkdir(dirPath, { recursive: true })
      }
    }

    const now = new Date().toISOString()
    const metadata: UserWorkspaceMetadata = {
      workspaceId: `uw_${userId}`,
      userId,
      createdAt: now,
      lastModifiedAt: now,
      path: workspacePath,
      installedSkills: [],
      config: {}
    }

    await this.saveUserMetadata(metadata)
    await this.createUserReadme(workspacePath, userId)

    this.userWorkspaces.set(userId, metadata)

    console.log(`[WorkspaceManager] 用户主工作区已创建: ${workspacePath}`)
    return metadata
  }

  /**
   * 为会话创建工作目录
   * @param userId 用户ID
   * @param sessionId 会话ID
   * @returns 会话工作区元数据
   */
  async createWorkspace(userId: string, sessionId: string): Promise<WorkspaceMetadata> {
    const workspaceId = `ws_${userId}_${sessionId}`
    const workspacePath = path.join(this.config.baseDir, 'sessions', userId, sessionId)

    if (this.sessionWorkspaces.has(workspaceId)) {
      return this.sessionWorkspaces.get(workspaceId)!
    }

    const dirs = ['uploads', 'outputs', 'temp']
    for (const dir of dirs) {
      const dirPath = path.join(workspacePath, dir)
      if (!existsSync(dirPath)) {
        await fs.mkdir(dirPath, { recursive: true })
      }
    }

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

    await this.saveMetadata(metadata)
    await this.createReadme(workspacePath, sessionId)

    this.sessionWorkspaces.set(workspaceId, metadata)

    console.log(`[WorkspaceManager] 会话工作区已创建: ${workspacePath}`)
    return metadata
  }

  /**
   * 获取会话工作区信息
   * @param sessionId 会话ID
   * @returns 会话工作区元数据或null
   */
  async getWorkspace(sessionId: string): Promise<WorkspaceMetadata | null> {
    for (const [, metadata] of this.sessionWorkspaces) {
      if (metadata.sessionId === sessionId) {
        return metadata
      }
    }

    try {
      const metadata = await this.loadMetadataBySession(sessionId)
      if (metadata) {
        this.sessionWorkspaces.set(metadata.workspaceId, metadata)
        return metadata
      }
    } catch (error) {
      console.error('[WorkspaceManager] 加载会话工作区失败:', error)
    }

    return null
  }

  /**
   * 将会话工作区或用户主工作区的元数据写回磁盘（供 WorkDir API 在变更后刷新时间戳）
   */
  async persistWorkspace(metadata: WorkspaceMetadata | UserWorkspaceMetadata): Promise<void> {
    if ('sessionId' in metadata) {
      await this.saveMetadata(metadata as WorkspaceMetadata)
    } else {
      await this.saveUserMetadata(metadata as UserWorkspaceMetadata)
    }
  }

  /**
   * 获取用户主工作目录的真实路径
   * @param userId 用户ID
   * @returns 用户主目录路径
   */
  async getUserHomeDirectory(userId: string): Promise<string> {
    const workspace = await this.getOrCreateUserWorkspace(userId)
    return workspace.path
  }

  /**
   * 安装 skill 到用户主目录
   * @param userId 用户ID
   * @param skillId Skill ID
   * @param skillData Skill 内容
   * @param skillName Skill 名称
   * @param version 版本号
   */
  async installSkill(
    userId: string,
    skillId: string,
    skillData: any,
    skillName: string,
    version: string = '1.0.0'
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const workspace = await this.getOrCreateUserWorkspace(userId)
      const skillPath = path.join(workspace.path, 'skills', `${skillId}.json`)

      const skillRecord = {
        skillId,
        name: skillName,
        version,
        installedAt: new Date().toISOString(),
        path: skillPath
      }

      workspace.installedSkills.push(skillRecord)
      workspace.lastModifiedAt = new Date().toISOString()

      await fs.writeFile(skillPath, JSON.stringify(skillData, null, 2), 'utf-8')
      await this.saveUserMetadata(workspace)

      console.log(`[WorkspaceManager] Skill 已安装: ${skillName} -> ${skillPath}`)
      return { success: true, path: skillPath }
    } catch (error) {
      console.error('[WorkspaceManager] 安装 Skill 失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '安装失败' }
    }
  }

  /**
   * 列出用户已安装的 skills
   * @param userId 用户ID
   */
  async listUserSkills(userId: string): Promise<Array<{ skillId: string; name: string; version: string; installedAt: string }>> {
    const workspace = await this.getOrCreateUserWorkspace(userId)
    return workspace.installedSkills.map(s => ({
      skillId: s.skillId,
      name: s.name,
      version: s.version,
      installedAt: s.installedAt
    }))
  }

  /**
   * 卸载用户 skill
   * @param userId 用户ID
   * @param skillId Skill ID
   */
  async uninstallSkill(userId: string, skillId: string): Promise<boolean> {
    try {
      const workspace = await this.getOrCreateUserWorkspace(userId)
      const skillIndex = workspace.installedSkills.findIndex(s => s.skillId === skillId)

      if (skillIndex === -1) {
        return false
      }

      const skill = workspace.installedSkills[skillIndex]
      await fs.unlink(skill.path)

      workspace.installedSkills.splice(skillIndex, 1)
      workspace.lastModifiedAt = new Date().toISOString()

      await this.saveUserMetadata(workspace)

      console.log(`[WorkspaceManager] Skill 已卸载: ${skillId}`)
      return true
    } catch (error) {
      console.error('[WorkspaceManager] 卸载 Skill 失败:', error)
      return false
    }
  }

  /**
   * 上传文件到会话工作区
   */
  async uploadFile(
    sessionId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string = 'application/octet-stream'
  ): Promise<UploadResult> {
    let workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      throw new Error('会话工作区不存在，请先创建会话')
    }

    const validation = this.validateFile(originalName, fileBuffer.length)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    if (workspace.stats.totalSize + fileBuffer.length > this.config.maxStorageSize * 1024 * 1024) {
      return { success: false, error: `存储空间不足（最大 ${this.config.maxStorageSize}MB）` }
    }

    if (workspace.stats.totalFiles >= this.config.maxFileCount) {
      return { success: false, error: `文件数量已达上限（最大 ${this.config.maxFileCount} 个）` }
    }

    const fileId = uuidv4()
    const ext = path.extname(originalName)
    const safeFilename = `${fileId}${ext}`
    const filePath = path.join(workspace.path, 'uploads', safeFilename)

    try {
      await fs.writeFile(filePath, fileBuffer)

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
      return { success: false, error: error instanceof Error ? error.message : '文件上传失败' }
    }
  }

  /**
   * 使用流式上传大文件
   */
  async uploadFileStream(
    sessionId: string,
    readStream: NodeJS.ReadableStream,
    originalName: string,
    fileSize: number,
    mimeType: string = 'application/octet-stream'
  ): Promise<UploadResult> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return { success: false, error: '会话工作区不存在' }
    }

    const validation = this.validateFile(originalName, fileSize)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const fileId = uuidv4()
    const ext = path.extname(originalName)
    const safeFilename = `${fileId}${ext}`
    const filePath = path.join(workspace.path, 'uploads', safeFilename)

    return new Promise((resolve) => {
      const writeStream = createWriteStream(filePath)
      let receivedBytes = 0

      readStream.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length

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
          resolve({ success: false, error: error instanceof Error ? error.message : '保存元数据失败' })
        }
      })

      writeStream.on('error', (error) => {
        resolve({ success: false, error: error.message })
      })

      readStream.on('error', (error) => {
        resolve({ success: false, error: error.message })
      })

      readStream.pipe(writeStream)
    })
  }

  /**
   * 获取会话工作区中的所有文件
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
   * 删除会话文件
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
      await fs.unlink(file.path)

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
   * 获取会话文件的完整路径
   */
  async getFilePathsForContext(sessionId: string): Promise<string[]> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace || workspace.uploadedFiles.length === 0) {
      return []
    }

    return workspace.uploadedFiles.map(file => file.path)
  }

  /**
   * 生成会话工作区摘要
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
   * 生成用户主工作区摘要
   */
  async getUserWorkspaceSummaryForContext(userId: string): Promise<string> {
    const workspace = await this.getOrCreateUserWorkspace(userId)
    if (!workspace) {
      return ''
    }

    const lines = [
      `\n## 🏠 用户主工作区`,
      `- 路径: ${workspace.path}`
    ]

    if (workspace.installedSkills.length > 0) {
      lines.push(`\n### 🛠️ 已安装的 Skills:`)
      for (const skill of workspace.installedSkills) {
        lines.push(`- **${skill.name}** v${skill.version} (${skill.installedAt})`)
      }
    } else {
      lines.push(`\n- 💡 您还没有安装任何 skills`)
    }

    return lines.join('\n')
  }

  /**
   * 清空会话工作区
   */
  async clearWorkspace(sessionId: string): Promise<boolean> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return false
    }

    try {
      await fs.rm(workspace.path, { recursive: true, force: true })
      this.sessionWorkspaces.delete(workspace.workspaceId)

      console.log(`[WorkspaceManager] 会话工作区已清空: ${sessionId}`)
      return true
    } catch (error) {
      console.error('[WorkspaceManager] 清空会话工作区失败:', error)
      return false
    }
  }

  /**
   * 获取用户可见的主目录路径（虚拟路径）
   */
  async getVirtualHomeDirectory(userId: string): Promise<string> {
    return `~/home`
  }

  /**
   * 获取用户主目录的真实路径
   */
  async getRealHomeDirectory(userId: string): Promise<string> {
    const workspace = await this.getOrCreateUserWorkspace(userId)
    return workspace.path
  }

  /**
   * 获取会话的虚拟工作目录
   */
  async getVirtualWorkingDirectory(sessionId: string): Promise<string> {
    return `~/workspace`
  }

  /**
   * 获取会话的真实工作目录
   */
  async getRealWorkingDirectory(sessionId: string): Promise<string> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return ''
    }
    return workspace.path
  }

  /**
   * 将虚拟/相对路径转换为真实路径
   */
  async resolvePath(sessionId: string, virtualPath: string): Promise<string> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return virtualPath
    }

    if (path.isAbsolute(virtualPath) && virtualPath.startsWith(workspace.path)) {
      return virtualPath
    }

    const matchedFile = workspace.uploadedFiles.find(
      f => f.originalName === virtualPath ||
           f.filename === virtualPath ||
           path.basename(virtualPath) === f.originalName
    )

    if (matchedFile) {
      return matchedFile.path
    }

    if (!path.isAbsolute(virtualPath)) {
      const resolved = path.resolve(workspace.path, virtualPath)
      if (resolved.startsWith(workspace.path)) {
        return resolved
      }

      return path.join(workspace.path, 'uploads', path.basename(virtualPath))
    }

    return virtualPath
  }

  /**
   * 将真实路径转换为虚拟路径
   */
  async toVirtualPath(sessionId: string, realPath: string): Promise<string> {
    const workspace = await this.getWorkspace(sessionId)
    if (!workspace) {
      return path.basename(realPath)
    }

    const fileRecord = workspace.uploadedFiles.find(f => f.path === realPath)
    if (fileRecord) {
      return fileRecord.originalName
    }

    if (realPath.startsWith(workspace.path)) {
      const relative = path.relative(workspace.path, realPath)
      return relative
    }

    return path.basename(realPath)
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 验证文件是否符合要求
   */
  private validateFile(filename: string, size: number): { valid: boolean; error?: string } {
    if (size > this.config.maxFileSize * 1024 * 1024) {
      return {
        valid: false,
        error: `文件过大（最大 ${this.config.maxFileSize}MB，当前 ${this.formatFileSize(size)}）`
      }
    }

    const ext = path.extname(filename).toLowerCase()

    if (this.config.deniedFileTypes.includes(ext)) {
      return { valid: false, error: `不允许的文件类型: ${ext}` }
    }

    if (!this.config.allowedFileTypes.includes(ext)) {
      return { valid: false, error: `不支持的文件类型: ${ext}` }
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
   * 保存会话工作区元数据到磁盘
   */
  private async saveMetadata(metadata: WorkspaceMetadata): Promise<void> {
    const metadataPath = path.join(metadata.path, '.workspace.json')
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
  }

  /**
   * 保存用户主工作区元数据到磁盘
   */
  private async saveUserMetadata(metadata: UserWorkspaceMetadata): Promise<void> {
    const metadataPath = path.join(metadata.path, '.user-workspace.json')
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
  }

  /**
   * 从磁盘加载会话元数据
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
   * 根据会话ID从磁盘加载元数据
   */
  private async loadMetadataBySession(sessionId: string): Promise<WorkspaceMetadata | null> {
    try {
      const sessionsDir = path.join(this.config.baseDir, 'sessions')

      if (!existsSync(sessionsDir)) {
        return null
      }

      const users = await fs.readdir(sessionsDir)

      for (const userId of users) {
        const sessionPath = path.join(sessionsDir, userId, sessionId)
        const metadata = await this.loadMetadata(sessionPath)
        if (metadata && metadata.sessionId === sessionId) {
          return metadata
        }
      }
    } catch (error) {
      console.error('[WorkspaceManager] 查找会话工作区失败:', error)
    }

    return null
  }

  /**
   * 创建会话 README.md 文件
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

  /**
   * 创建用户主目录 README.md 文件
   */
  private async createUserReadme(workspacePath: string, userId: string): Promise<void> {
    const readmeContent = `# User Home Workspace - ${userId}

这是您的个人主工作区，用于存储个人配置和已安装的 skills。

## 目录结构

\`\`\`
skills/    # 已安装的 Skills
config/    # 个人配置文件
data/      # 个人数据
\`\`\`

## 使用说明

1. 您的个人 skills 将安装在此目录
2. 个人配置信息存储在 \`config/\` 目录
3. 个人数据存储在 \`data/\` 目录
4. 这些文件是持久化的，不会随着会话结束而删除

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
