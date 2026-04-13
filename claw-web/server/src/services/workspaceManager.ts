/**
 * Agent Workspace Manager - 工作目录管理器
 *
 * 功能：
 * - 用户主工作目录：存储 skills、用户配置、数据、上传文件
 *
 * 目录结构：
 * workspaces/                            # 工作区根目录
 * ├── .claude/                           # Claude 全局目录
 * │   ├── skills/                        # 全局 skills
 * │   └── commands/                      # 全局 commands
 * └── users/                             # 用户主目录
 *     └── {userId}/
 *         ├── skills/                    # 用户的 skills 安装
 *         ├── config/                    # 用户配置文件
 *         ├── data/                      # 用户数据
 *         ├── uploads/                   # 用户上传的文件
 *         ├── outputs/                   # AI 生成的输出文件
 *         ├── temp/                      # 临时文件
 *         ├── .claude/                   # 用户 Claude 目录
 *         │   ├── skills/                # 用户 skills
 *         │   └── commands/              # 用户 commands
 *         ├── .user-workspace.json       # 用户工作区元数据
 *         └── README.md
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { existsSync } from 'fs'

/**
 * 工作区根目录：优先 WORKSPACE_BASE_DIR（绝对路径，迁移后不依赖启动 cwd）
 */
function resolveWorkspaceBaseDir(): string {
  const fromEnv = process.env.WORKSPACE_BASE_DIR?.trim()
  if (fromEnv) {
    return path.resolve(fromEnv)
  }
  return path.resolve(process.cwd(), '..', 'workspaces')
}

function pathsEffectivelyEqual(a: string, b: string): boolean {
  const na = path.normalize(path.resolve(a))
  const nb = path.normalize(path.resolve(b))
  if (process.platform === 'win32') {
    return na.toLowerCase() === nb.toLowerCase()
  }
  return na === nb
}

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
  baseDir: resolveWorkspaceBaseDir(),
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
  private userWorkspaces: Map<string, UserWorkspaceMetadata> = new Map()

  /**
   * 获取工作区基础目录
   */
  getBaseDir(): string {
    return this.config.baseDir
  }

  constructor(config?: WorkspaceConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    console.log(`[WorkspaceManager] 工作区根目录: ${this.config.baseDir}`)
    this.ensureBaseDirectory()
  }

  /**
   * 确保基础目录和 .claude 目录存在
   */
  private async ensureBaseDirectory(): Promise<void> {
    try {
      if (!existsSync(this.config.baseDir)) {
        await fs.mkdir(this.config.baseDir, { recursive: true })
        console.log(`[WorkspaceManager] 基础目录已创建: ${this.config.baseDir}`)
      }
      const usersDir = path.join(this.config.baseDir, 'users')
      if (!existsSync(usersDir)) {
        await fs.mkdir(usersDir, { recursive: true })
      }
      await this.ensureClaudeDirectories(this.config.baseDir)
    } catch (error) {
      console.error('[WorkspaceManager] 创建基础目录失败:', error)
    }
  }

  /**
   * 确保 .claude 目录存在（包含 skills 和 commands 子目录）
   */
  private async ensureClaudeDirectories(baseDir: string): Promise<void> {
    const claudeDir = path.join(baseDir, '.claude')
    const skillsDir = path.join(claudeDir, 'skills')
    const commandsDir = path.join(claudeDir, 'commands')
    
    if (!existsSync(claudeDir)) {
      await fs.mkdir(claudeDir, { recursive: true })
      console.log(`[WorkspaceManager] .claude 目录已创建: ${claudeDir}`)
    }
    if (!existsSync(skillsDir)) {
      await fs.mkdir(skillsDir, { recursive: true })
      console.log(`[WorkspaceManager] .claude/skills 目录已创建: ${skillsDir}`)
    }
    if (!existsSync(commandsDir)) {
      await fs.mkdir(commandsDir, { recursive: true })
      console.log(`[WorkspaceManager] .claude/commands 目录已创建: ${commandsDir}`)
    }
  }

  /**
   * 迁移或配置变更后，若 .user-workspace.json 中的 path 与当前 baseDir 不一致则修正并写回
   */
  private async reconcileUserWorkspacePath(
    userId: string,
    metadata: UserWorkspaceMetadata
  ): Promise<UserWorkspaceMetadata> {
    const expectedPath = path.join(this.config.baseDir, 'users', userId)
    if (pathsEffectivelyEqual(metadata.path, expectedPath)) {
      return metadata
    }

    console.warn(
      `[WorkspaceManager] 修正用户工作区路径（迁移/WORKSPACE_BASE_DIR）: ${metadata.path} -> ${expectedPath}`
    )

    const oldRoot = path.resolve(metadata.path)
    const newRoot = path.resolve(expectedPath)

    for (const skill of metadata.installedSkills) {
      try {
        const sp = path.resolve(skill.path)
        if (sp === oldRoot || sp.startsWith(oldRoot + path.sep)) {
          skill.path = path.join(newRoot, path.relative(oldRoot, sp))
        }
      } catch {
        /* ignore */
      }
    }

    metadata.path = expectedPath
    metadata.lastModifiedAt = new Date().toISOString()
    await this.saveUserMetadata(metadata)
    return metadata
  }

  /**
   * 获取用户主工作目录
   * @param userId 用户ID
   * @returns 用户工作区元数据
   */
  async getUserWorkspace(userId: string): Promise<UserWorkspaceMetadata | null> {
    if (this.userWorkspaces.has(userId)) {
      const cached = this.userWorkspaces.get(userId)!
      return await this.reconcileUserWorkspacePath(userId, cached)
    }

    try {
      const userPath = path.join(this.config.baseDir, 'users', userId)
      const metadataPath = path.join(userPath, '.user-workspace.json')

      if (existsSync(metadataPath)) {
        const content = await fs.readFile(metadataPath, 'utf-8')
        const metadata = JSON.parse(content) as UserWorkspaceMetadata
        const fixed = await this.reconcileUserWorkspacePath(userId, metadata)
        this.userWorkspaces.set(userId, fixed)
        return fixed
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

    const dirs = ['skills', 'config', 'data', 'uploads', 'outputs', 'temp']
    for (const dir of dirs) {
      const dirPath = path.join(workspacePath, dir)
      if (!existsSync(dirPath)) {
        await fs.mkdir(dirPath, { recursive: true })
      }
    }

    const claudeDir = path.join(workspacePath, '.claude')
    const skillsDir = path.join(claudeDir, 'skills')
    const commandsDir = path.join(claudeDir, 'commands')
    if (!existsSync(claudeDir)) {
      await fs.mkdir(claudeDir, { recursive: true })
    }
    if (!existsSync(skillsDir)) {
      await fs.mkdir(skillsDir, { recursive: true })
    }
    if (!existsSync(commandsDir)) {
      await fs.mkdir(commandsDir, { recursive: true })
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
   * 上传文件到用户主工作区 uploads/ 目录
   */
  async uploadFileToUserWorkspace(
    userId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string = 'application/octet-stream'
  ): Promise<UploadResult> {
    const workspace = await this.getOrCreateUserWorkspace(userId)
    const uploadsDir = path.join(workspace.path, 'uploads')
    if (!existsSync(uploadsDir)) {
      await fs.mkdir(uploadsDir, { recursive: true })
    }

    const validation = this.validateFile(originalName, fileBuffer.length)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const fileId = uuidv4()
    const ext = path.extname(originalName)
    const safeFilename = `${fileId}${ext}`
    const filePath = path.join(uploadsDir, safeFilename)

    try {
      await fs.writeFile(filePath, fileBuffer)
      console.log(`[WorkspaceManager] 文件已上传到用户主目录: ${originalName} -> ${filePath}`)
      return {
        success: true,
        fileId,
        filename: safeFilename,
        originalName,
        path: filePath,
        size: fileBuffer.length
      }
    } catch (error) {
      console.error('[WorkspaceManager] 上传到用户主目录失败:', error)
      return { success: false, error: error instanceof Error ? error.message : '文件上传失败' }
    }
  }

  /**
   * 列出用户工作区中的所有文件
   */
  async listUserFiles(userId: string): Promise<FileItem[]> {
    const workspace = await this.getOrCreateUserWorkspace(userId)
    const uploadsDir = path.join(workspace.path, 'uploads')
    
    if (!existsSync(uploadsDir)) {
      return []
    }

    const files: FileItem[] = []
    try {
      const entries = await fs.readdir(uploadsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(uploadsDir, entry.name)
          const stat = await fs.stat(filePath)
          files.push({
            filename: entry.name,
            originalName: entry.name,
            size: stat.size,
            sizeFormatted: this.formatFileSize(stat.size),
            type: 'application/octet-stream',
            uploadedAt: stat.mtime.toISOString(),
            path: filePath,
            isUploaded: true
          })
        }
      }
    } catch (error) {
      console.error('[WorkspaceManager] 列出文件失败:', error)
    }

    return files
  }

  /**
   * 删除用户工作区中的文件
   */
  async deleteUserFile(userId: string, filename: string): Promise<boolean> {
    const workspace = await this.getOrCreateUserWorkspace(userId)
    const filePath = path.join(workspace.path, 'uploads', filename)

    if (!filePath.startsWith(workspace.path)) {
      return false
    }

    try {
      if (existsSync(filePath)) {
        await fs.unlink(filePath)
        console.log(`[WorkspaceManager] 文件已删除: ${filename}`)
        return true
      }
      return false
    } catch (error) {
      console.error('[WorkspaceManager] 删除文件失败:', error)
      return false
    }
  }

  /**
   * 清空用户工作区的上传文件
   */
  async clearUserUploads(userId: string): Promise<boolean> {
    const workspace = await this.getOrCreateUserWorkspace(userId)
    const uploadsDir = path.join(workspace.path, 'uploads')

    try {
      if (existsSync(uploadsDir)) {
        const entries = await fs.readdir(uploadsDir)
        await Promise.all(entries.map(f => fs.unlink(path.join(uploadsDir, f))))
        console.log(`[WorkspaceManager] 用户上传文件已清空: ${userId}`)
        return true
      }
      return true
    } catch (error) {
      console.error('[WorkspaceManager] 清空上传文件失败:', error)
      return false
    }
  }

  /**
   * 生成用户主工作区摘要（用于 AI 上下文）
   */
  async getUserWorkspaceSummaryForContext(userId: string): Promise<string> {
    const workspace = await this.getOrCreateUserWorkspace(userId)
    if (!workspace) {
      return ''
    }

    const lines = [
      `## 📁 当前工作环境`,
      `- 工作区路径: ${workspace.path}`
    ]

    // 检查终端会话数量
    let ptyCount = 0
    try {
      const { ptyManager } = await import('../integration/ptyManager')
      ptyCount = ptyManager.getSessionsForUser(userId).length
    } catch {}
    
    if (ptyCount > 0) {
      lines.push(`- 🖥️ 您当前在 IDE 中打开了 ${ptyCount} 个终端会话`)
    }

    // 检查上传的文件
    const uploadsDir = path.join(workspace.path, 'uploads')
    if (existsSync(uploadsDir)) {
      try {
        const files = await fs.readdir(uploadsDir)
        const fileDetails: Array<{ name: string; size: number }> = []
        
        for (const file of files) {
          const filePath = path.join(uploadsDir, file)
          const stat = await fs.stat(filePath)
          if (stat.isFile()) {
            fileDetails.push({ name: file, size: stat.size })
          }
        }

        if (fileDetails.length > 0) {
          lines.push(`- 📎 您已上传 ${fileDetails.length} 个文件，可直接使用`)
          lines.push('\n### 📋 可用文件:')
          
          for (const file of fileDetails.slice(0, 10)) { // 最多显示 10 个
            lines.push(`- **${file.name}** (${this.formatFileSize(file.size)})`)
          }
          
          if (fileDetails.length > 10) {
            lines.push(`- ... 还有 ${fileDetails.length - 10} 个文件`)
          }
          
          lines.push('\n💡 提示：您可以直接引用这些文件名来处理它们')
        } else {
          lines.push('- 💡 您可以通过上传按钮添加文件到工作区')
        }
      } catch (error) {
        lines.push('- 💡 您可以通过上传按钮添加文件到工作区')
      }
    } else {
      lines.push('- 💡 您可以通过上传按钮添加文件到工作区')
    }

    // 已安装的 skills
    if (workspace.installedSkills.length > 0) {
      lines.push(`\n### 🛠️ 已安装的 Skills:`)
      for (const skill of workspace.installedSkills) {
        lines.push(`- **${skill.name}** v${skill.version}`)
      }
    }

    return lines.join('\n')
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
   * 保存用户主工作区元数据到磁盘
   */
  private async saveUserMetadata(metadata: UserWorkspaceMetadata): Promise<void> {
    const metadataPath = path.join(metadata.path, '.user-workspace.json')
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
  }

  /**
   * 创建用户主目录 README.md 文件
   */
  private async createUserReadme(workspacePath: string, userId: string): Promise<void> {
    const readmeContent = `# User Home Workspace - ${userId}

这是您的个人主工作区，用于存储个人配置、已安装的 skills 和上传的文件。

## 目录结构

\`\`\`
skills/    # 已安装的 Skills
config/    # 个人配置文件
data/      # 个人数据
uploads/   # 上传的文件
outputs/   # AI 生成的输出文件
temp/      # 临时文件
\`\`\`

## 使用说明

1. 您的个人 skills 将安装在此目录
2. 个人配置信息存储在 \`config/\` 目录
3. 个人数据存储在 \`data/\` 目录
4. 上传的文件存储在 \`uploads/\` 目录
5. 这些文件是持久化的，不会随着会话结束而删除

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
