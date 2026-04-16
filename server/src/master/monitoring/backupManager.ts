/**
 * Backup & Recovery Manager - 备份恢复管理器
 *
 * 功能：
 * - 自动定时备份用户数据
 * - 增量备份与全量备份
 * - 数据快照管理
 * - 一键恢复到指定时间点
 * - 备份完整性校验
 * - 备份存储策略（本地/远程/S3）
 *
 * 使用场景：
 * - 灾难恢复（DR）
 * - 数据迁移
 * - 误操作回滚
 * - 合规性要求（数据保留）
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { createHash } from 'crypto'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// ==================== 类型定义 ====================

/**
 * 备份类型
 */
export enum BackupType {
  FULL = 'full',           // 全量备份
  INCREMENTAL = 'incremental',  // 增量备份
  DIFFERENTIAL = 'differential'   // 差异备份
}

/**
 * 备份状态
 */
export enum BackupStatus {
  CREATED = 'created',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  VERIFIED = 'verified',
  EXPIRED = 'expired'
}

/**
 * 备份元数据
 */
export interface BackupMetadata {
  /** 唯一ID */
  backupId: string
  /** 备份类型 */
  type: BackupType
  /** 创建时间 */
  createdAt: Date
  /** 完成时间 */
  completedAt?: Date
  /** 数据大小（字节）*/
  sizeBytes: number
  /** 文件数 */
  fileCount: number
  /** 校验和（SHA256）*/
  checksum: string
  /** 状态 */
  status: BackupStatus
  /** 描述/标签 */
  description?: string
  /** 过期时间 */
  expiresAt?: Date
  /** 存储位置 */
  storagePath: string
}

/**
 * 恢复选项
 */
export interface RestoreOptions {
  /** 目标备份ID或时间戳 */
  targetBackupId?: string
  /** 恢复到指定时间点（PITR）*/
  restoreToTimestamp?: Date
  /** 是否先验证备份完整性 */
  verifyBeforeRestore: boolean
  /** 是否创建恢复前快照 */
  createPreRestoreSnapshot: boolean
  /** 是否覆盖现有数据 */
  overwriteExisting: boolean
  /** 回调函数（进度报告）*/
  onProgress?: (progress: number, message: string) => void
}

/**
 * 恢复结果
 */
export interface RestoreResult {
  success: boolean
  restoredFiles: number
  restoredSizeBytes: number
  durationMs: number
  errors: string[]
  warnings: string[]
}

/**
 * 备份配置
 */
export interface BackupConfig {
  /** 备份根目录 */
  backupRootDir: string
  /** 数据源目录（要备份的路径）*/
  dataDirs: string[]
  /** 全量备份间隔（小时）*/
  fullBackupIntervalHours: number
  /** 增量备份间隔（分钟）*/
  incrementalIntervalMinutes: number
  /** 备份保留天数 */
  retentionDays: number
  /** 最大备份数 */
  maxBackups: number
  /** 是否启用压缩 */
  compressionEnabled: boolean
  /** 加密密钥（可选）*/
  encryptionKey?: string
  /** 并行度（同时备份的文件数）*/
  concurrency: number
}

// ==================== 默认配置 ====================

const DEFAULT_BACKUP_CONFIG: Required<BackupConfig> = {
  backupRootDir: process.env.BACKUP_ROOT_DIR || '/app/backups',
  dataDirs: [
    process.env.WORKSPACE_BASE_DIR ? `${process.env.WORKSPACE_BASE_DIR}/users` : '/app/workspaces/users'
  ],
  fullBackupIntervalHours: parseInt(process.env.FULL_BACKUP_INTERVAL_HOURS || '24', 10),
  incrementalIntervalMinutes: parseInt(process.env.INCREMENTAL_BACKUP_INTERVAL_MINUTES || '30', 10),
  retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10),
  maxBackups: parseInt(process.env.MAX_BACKUPS || '50', 10),
  compressionEnabled: process.env.BACKUP_COMPRESSION !== 'false',
  encryptionKey: process.env.BACKUP_ENCRYPTION_KEY,
  concurrency: parseInt(process.env.BACKUP_CONCURRENCY || '4', 10)
}

// ==================== BackupManager 类 ====================

class BackupManager {
  private config: Required<BackupConfig>
  private metadataStore: Map<string, BackupMetadata> = new Map()
  private scheduledTimer: NodeJS.Timeout | null = null

  constructor(config?: Partial<BackupConfig>) {
    this.config = { ...DEFAULT_BACKUP_CONFIG, ...config }
    console.log(`[BackupManager] 初始化完成，备份目录: ${this.config.backupRootDir}`)
  }

  /**
   * 初始化备份系统（加载元数据、创建目录、启动定时任务）
   */
  async initialize(): Promise<void> {
    try {
      // 确保备份目录存在
      await fs.mkdir(this.config.backupRootDir, { recursive: true })

      // 加载已有备份的元数据
      await this.loadMetadata()

      // 启动定时备份任务
      this.startScheduledBackups()

      // 清理过期备份
      await this.cleanupExpiredBackups()

      console.log('[BackupManager] ✅ 初始化完成')
    } catch (error) {
      console.error('[BackupManager] ❌ 初始化失败:', error)
      throw error
    }
  }

  /**
   * 执行全量备份
   * @param description 可选描述
   * @returns 备份元数据
   */
  async createFullBackup(description?: string): Promise<BackupMetadata> {
    const backupId = generateBackupId(BackupType.FULL)
    const backupDir = path.join(this.config.backupRootDir, backupId)

    console.log(`[BackupManager] 开始全量备份: ${backupId}`)

    const metadata: BackupMetadata = {
      backupId,
      type: BackupType.FULL,
      createdAt: new Date(),
      sizeBytes: 0,
      fileCount: 0,
      checksum: '',
      status: BackupStatus.IN_PROGRESS,
      description,
      storagePath: backupDir
    }

    this.metadataStore.set(backupId, metadata)
    await this.saveMetadata(metadata)

    try {
      // 创建备份目录
      await fs.mkdir(backupDir, { recursive: true })

      let totalSize = 0
      let fileCount = 0

      // 遍历所有数据目录进行备份
      for (const dataDir of this.config.dataDirs) {
        const result = await this.copyDirectory(dataDir, backupDir)
        totalSize += result.size
        fileCount += result.fileCount
      }

      // 计算校验和
      const checksum = await this.calculateDirectoryChecksum(backupDir)

      // 更新元数据
      metadata.status = BackupStatus.COMPLETED
      metadata.completedAt = new Date()
      metadata.sizeBytes = totalSize
      metadata.fileCount = fileCount
      metadata.checksum = checksum
      metadata.expiresAt = new Date(
        Date.now() + this.config.retentionDays * 24 * 60 * 60 * 1000
      )

      this.metadataStore.set(backupId, metadata)
      await this.saveMetadata(metadata)

      console.log(
        `[BackupManager] ✅ 全量备份完成: ${backupId} ` +
        `(${fileCount}个文件, ${(totalSize / 1024 / 1024).toFixed(2)}MB)`
      )

      return metadata

    } catch (error) {
      metadata.status = BackupStatus.FAILED
      this.metadataStore.set(backupId, metadata)
      await this.saveMetadata(metadata)

      console.error(`[BackupManager] ❌ 全量备份失败 (${backupId}):`, error)
      throw error
    }
  }

  /**
   * 执行增量备份（基于最近一次全量备份）
   */
  async createIncrementalBackup(): Promise<BackupMetadata | null> {
    // 查找最近的全量备份
    const lastFullBackup = this.findLatestBackupByType(BackupType.FULL)

    if (!lastFullBackup) {
      console.warn('[BackupManager] 无全量备份，无法执行增量备份')
      return null
    }

    const backupId = generateBackupId(BackupType.INCREMENTAL)
    const backupDir = path.join(this.config.backupRootDir, backupId)

    console.log(`[BackupManager] 开始增量备份: ${backupId}`)

    const metadata: BackupMetadata = {
      backupId,
      type: BackupType.INCREMENTAL,
      createdAt: new Date(),
      sizeBytes: 0,
      fileCount: 0,
      checksum: '',
      status: BackupStatus.IN_PROGRESS,
      storagePath: backupDir
    }

    this.metadataStore.set(backupId, metadata)

    try {
      await fs.mkdir(backupDir, { recursive: true })

      // 实现增量逻辑：比较文件修改时间
      const lastBackupTime = lastFullBackup.createdAt.getTime()
      let totalSize = 0
      let fileCount = 0

      for (const dataDir of this.config.dataDirs) {
        const result = await this.copyModifiedFilesSince(
          dataDir,
          backupDir,
          lastBackupTime
        )
        totalSize += result.size
        fileCount += result.fileCount
      }

      if (fileCount === 0) {
        console.log('[BackupManager] 无变更文件，跳过增量备份')
        // 清理空目录
        await fs.rm(backupDir, { recursive: true })
        this.metadataStore.delete(backupId)
        return null
      }

      metadata.status = BackupStatus.COMPLETED
      metadata.completedAt = new Date()
      metadata.sizeBytes = totalSize
      metadata.fileCount = fileCount

      this.metadataStore.set(backupId, metadata)
      await this.saveMetadata(metadata)

      console.log(
        `[BackupManager] ✅ 增量备份完成: ${backupId} ` +
        `(${fileCount}个变更文件, ${(totalSize / 1024 / 1024).toFixed(2)}MB)`
      )

      return metadata

    } catch (error) {
      metadata.status = BackupStatus.FAILED
      this.metadataStore.set(backupId, metadata)

      console.error(`[BackupManager] ❌ 增量备份失败 (${backupId}):`, error)
      return null
    }
  }

  /**
   * 从备份恢复数据
   * @param options 恢复选项
   * @returns 恢复结果
   */
  async restoreFromBackup(options: RestoreOptions): Promise<RestoreResult> {
    const startTime = Date.now()
    const result: RestoreResult = {
      success: false,
      restoredFiles: 0,
      restoredSizeBytes: 0,
      durationMs: 0,
      errors: [],
      warnings: []
    }

    try {
      // 1. 确定目标备份
      let targetBackup: BackupMetadata | undefined

      if (options.targetBackupId) {
        targetBackup = this.metadataStore.get(options.targetBackupId)
        if (!targetBackup) {
          throw new Error(`备份不存在: ${options.targetBackupId}`)
        }
      } else if (options.restoreToTimestamp) {
        targetBackup = this.findBestBackupForTimestamp(options.restoreToTimestamp)
        if (!targetBackup) {
          throw new Error('未找到指定时间点的有效备份')
        }
      } else {
        // 默认使用最新的完整备份
        targetBackup = this.findLatestBackupByType(BackupType.FULL)
        if (!targetBackup) {
          throw new Error('无可用备份')
        }
      }

      console.log(`[BackupManager] 开始从备份恢复: ${targetBackup.backupId}`)

      // 2. 可选：验证备份完整性
      if (options.verifyBeforeRestore) {
        const isValid = await this.verifyBackup(targetBackup)
        if (!isValid) {
          throw new Error('备份校验失败，可能已损坏')
        }
      }

      // 3. 可选：创建恢复前快照
      if (options.createPreRestoreSnapshot) {
        console.log('[BackupManager] 创建恢复前快照...')
        await this.createPreRestoreSnapshot()
      }

      // 4. 执行恢复
      const sourceDir = targetBackup.storagePath

      for (const dataDir of this.config.dataDirs) {
        const restoreResult = await this.restoreToDirectory(sourceDir, dataDir, options.overwriteExisting)
        result.restoredFiles += restoreResult.fileCount
        result.restoredSizeBytes += restoreResult.size
      }

      result.success = true
      result.durationMs = Date.now() - startTime

      console.log(
        `[BackupManager] ✅ 恢复完成: ${result.restoredFiles}个文件, ` +
        `${(result.restoredSizeBytes / 1024 / 1024).toFixed(2)}MB, ` +
        `耗时${result.durationMs}ms`
      )

      return result

    } catch (error) {
      result.durationMs = Date.now() - startTime
      result.errors.push(error instanceof Error ? error.message : String(error))

      console.error('[BackupManager] ❌ 恢复失败:', error)
      return result
    }
  }

  /**
   * 验证备份完整性
   */
  async verifyBackup(backup: BackupMetadata): Promise<boolean> {
    try {
      const currentChecksum = await this.calculateDirectoryChecksum(backup.storagePath)
      const isValid = currentChecksum === backup.checksum

      if (isValid) {
        backup.status = BackupStatus.VERIFIED
        await this.saveMetadata(backup)
      }

      return isValid

    } catch (error) {
      console.error(`[BackupManager] 验证备份失败 (${backup.backupId}):`, error)
      return false
    }
  }

  /**
   * 获取所有备份列表
   */
  listBackups(): BackupMetadata[] {
    return Array.from(this.metadataStore.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  }

  /**
   * 获取备份统计信息
   */
  getStats(): {
    totalBackups: number
    totalSizeBytes: number
    byType: Record<BackupType, number>
    oldestBackup: Date | null
    newestBackup: Date | null
  } {
    const backups = this.listBackups()
    const byType: Record<string, number> = {
      [BackupType.FULL]: 0,
      [BackupType.INCREMENTAL]: 0,
      [BackupType.DIFFERENTIAL]: 0
    }

    let totalSize = 0

    for (const backup of backups) {
      byType[backup.type]++
      totalSize += backup.sizeBytes
    }

    return {
      totalBackups: backups.length,
      totalSizeBytes: totalSize,
      byType: byType as Record<BackupType, number>,
      oldestBackup: backups.length > 0 ? backups[backups.length - 1].createdAt : null,
      newestBackup: backups.length > 0 ? backups[0].createdAt : null
    }
  }

  /**
   * 关闭备份管理器（停止定时任务）
   */
  shutdown(): void {
    if (this.scheduledTimer) {
      clearInterval(this.scheduledTimer)
      this.scheduledTimer = null
    }
    console.log('[BackupManager] 已关闭')
  }

  // ==================== 私有方法 ====================

  /**
   * 启动定时备份任务
   */
  private startScheduledBackups(): void {
    // 增量备份（每30分钟）
    setInterval(async () => {
      try {
        await this.createIncrementalBackup()
      } catch (error) {
        console.error('[BackupManager] 定时增量备份失败:', error)
      }
    }, this.config.incrementalIntervalMinutes * 60 * 1000)

    // 全量备份（每24小时）
    this.scheduledTimer = setInterval(async () => {
      try {
        await this.createFullBackup('Scheduled full backup')
      } catch (error) {
        console.error('[BackupManager] 定时全量备份失败:', error)
      }
    }, this.config.fullBackupIntervalHours * 60 * 60 * 1000)

    console.log(
      `[BackupManager] 定时备份已启动: ` +
      `增量=${this.config.incrementalIntervalMinutes}分钟, ` +
      `全量=${this.config.fullBackupIntervalHours}小时`
    )
  }

  /**
   * 清理过期备份
   */
  private async cleanupExpiredBackups(): Promise<number> {
    const now = Date.now()
    let cleanedCount = 0

    for (const [backupId, metadata] of this.metadataStore) {
      if (metadata.expiresAt && metadata.expiresAt.getTime() < now) {
        console.log(`[BackupManager] 清理过期备份: ${backupId}`)
        await fs.rm(metadata.storagePath, { recursive: true }).catch(() => {})
        this.metadataStore.delete(backupId)
        cleanedCount++
      }
    }

    // 如果超过最大数量限制，删除最旧的
    const sortedBackups = Array.from(this.metadataStore.values())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    while (sortedBackups.length > this.config.maxBackups) {
      const oldest = sortedBackups.shift()!
      console.log(`[BackupManager] 清理超限备份: ${oldest.backupId}`)
      await fs.rm(oldest.storagePath, { recursive: true }).catch(() => {})
      this.metadataStore.delete(oldest.backupId)
      cleanedCount++
    }

    if (cleanedCount > 0) {
      await this.persistMetadata()
    }

    return cleanedCount
  }

  /**
   * 复制目录
   */
  private async copyDirectory(src: string, dest: string): Promise<{ size: number; fileCount: number }> {
    let totalSize = 0
    let fileCount = 0

    async function copyRecursive(currentSrc: string, currentDest: string): Promise<void> {
      const entries = await fs.readdir(currentSrc, { withFileTypes: true })

      for (const entry of entries) {
        const srcPath = path.join(currentSrc, entry.name)
        const destPath = path.join(currentDest, entry.name)

        if (entry.isDirectory()) {
          await fs.mkdir(destPath, { recursive: true })
          await copyRecursive(srcPath, destPath)
        } else {
          await fs.copyFile(srcPath, destPath)
          const stat = await fs.stat(srcPath)
          totalSize += stat.size
          fileCount++
        }
      }
    }

    await fs.mkdir(dest, { recursive: true })
    await copyRecursive(src, dest)

    return { size: totalSize, fileCount }
  }

  /**
   * 仅复制指定时间后修改的文件
   */
  private async copyModifiedFilesSince(
    src: string,
    dest: string,
    sinceTime: number
  ): Promise<{ size: number; fileCount: number }> {
    let totalSize = 0
    let fileCount = 0

    async function findAndCopy(currentSrc: string, currentDest: string): Promise<void> {
      const entries = await fs.readdir(currentSrc, { withFileTypes: true })

      for (const entry of entries) {
        const srcPath = path.join(currentSrc, entry.name)
        const destPath = path.join(currentDest, entry.name)

        if (entry.isDirectory()) {
          await fs.mkdir(destPath, { recursive: true })
          await findAndCopy(srcPath, destPath)
        } else {
          const stat = await fs.stat(srcPath)
          if (stat.mtimeMs > sinceTime) {
            await fs.copyFile(srcPath, destPath)
            totalSize += stat.size
            fileCount++
          }
        }
      }
    }

    await fs.mkdir(dest, { recursive: true })
    await findAndCopy(src, dest)

    return { size: totalSize, fileCount }
  }

  /**
   * 恢复到目标目录
   */
  private async restoreToDirectory(
    src: string,
    dest: string,
    overwrite: boolean
  ): Promise<{ size: number; fileCount: number }> {
    let totalSize = 0
    let fileCount = 0

    async function restoreRecursive(currentSrc: string, currentDest: string): Promise<void> {
      const entries = await fs.readdir(currentSrc, { withFileTypes: true })

      for (const entry of entries) {
        const srcPath = path.join(currentSrc, entry.name)
        const destPath = path.join(currentDest, entry.name)

        if (entry.isDirectory()) {
          await fs.mkdir(destPath, { recursive: true })
          await restoreRecursive(srcPath, destPath)
        } else {
          if (!overwrite) {
            try {
              await fs.access(destPath)
              continue  // 文件存在且不覆盖，跳过
          } catch {
              // 文件不存在，可以复制
            }
          }

          await fs.copyFile(srcPath, destPath)
          const stat = await fs.stat(srcPath)
          totalSize += stat.size
          fileCount++
        }
      }
    }

    await fs.mkdir(dest, { recursive: true })
    await restoreRecursive(src, dest)

    return { size: totalSize, fileCount }
  }

  /**
   * 计算目录SHA256校验和
   */
  private async calculateDirectoryChecksum(dirPath: string): Promise<string> {
    const hash = createHash('sha256')

    async function hashDirectory(currentPath: string): Promise<void> {
      const entries = await fs.readdir(currentPath, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name)

        if (entry.isDirectory()) {
          await hashDirectory(fullPath)
        } else {
          const content = await fs.readFile(fullPath)
          hash.update(entry.name + '|' + content.toString('base64'))
        }
      }
    }

    await hashDirectory(dirPath)
    return hash.digest('hex').substring(0, 32)  // 截取前32位
  }

  /**
   * 查找最新指定类型的备份
   */
  private findLatestBackupByType(type: BackupType): BackupMetadata | undefined {
    let latest: BackupMetadata | undefined

    for (const metadata of this.metadataStore.values()) {
      if (metadata.type === type &&
          (!latest || metadata.createdAt > latest.createdAt)) {
        latest = metadata
      }
    }

    return latest
  }

  /**
   * 查找最适合指定时间点的备份
   */
  private findBestBackupForTimestamp(timestamp: Date): BackupMetadata | undefined {
    const targetTime = timestamp.getTime()
    let bestMatch: BackupMetadata | undefined
    let minDiff = Infinity

    for (const metadata of this.metadataStore.values()) {
      if (metadata.type === BackupType.FULL && metadata.status === BackupStatus.COMPLETED) {
        const diff = Math.abs(metadata.createdAt.getTime() - targetTime)
        if (diff < minDiff && metadata.createdAt.getTime() <= targetTime) {
          minDiff = diff
          bestMatch = metadata
        }
      }
    }

    return bestMatch
  }

  /**
   * 创建恢复前快照
   */
  private async createPreRestoreSnapshot(): Promise<BackupMetadata> {
    return this.createFullBackup('Pre-restore snapshot')
  }

  /**
   * 加载元数据
   */
  private async loadMetadata(): Promise<void> {
    try {
      const metadataPath = path.join(this.config.backupRootDir, '.metadata.json')
      const content = await fs.readFile(metadataPath, 'utf-8')
      const parsed = JSON.parse(content)

      for (const item of parsed) {
        item.createdAt = new Date(item.createdAt)
        if (item.completedAt) item.completedAt = new Date(item.completedAt)
        if (item.expiresAt) item.expiresAt = new Date(item.expiresAt)

        this.metadataStore.set(item.backupId, item)
      }

      console.log(`[BackupManager] 已加载 ${this.metadataStore.size} 个备份记录`)

    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        console.log('[BackupManager] 无现有元数据文件，将创建新的')
      } else {
        console.warn('[BackupManager] 加载元数据失败:', error)
      }
    }
  }

  /**
   * 保存单个备份元数据
   */
  private async saveMetadata(metadata: BackupMetadata): Promise<void> {
    await this.persistMetadata()
  }

  /**
   * 持久化所有元数据到磁盘
   */
  private async persistMetadata(): Promise<void> {
    const metadataPath = path.join(this.config.backupRootDir, '.metadata.json')
    const serialized = JSON.stringify(Array.from(this.metadataStorage.values()), null, 2)

    await fs.writeFile(metadataPath, serialized, 'utf-8')
  }

  // 兼容性别名
  get metadataStorage() {
    return this.metadataStore
  }
}

// ==================== 辅助函数 ====================

function generateBackupId(type: BackupType): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const random = Math.random().toString(36).substring(2, 8)
  return `backup-${type}-${timestamp}-${random}`
}

// ==================== 导出 ====================

let backupManagerInstance: BackupManager | null = null

/**
 * 获取BackupManager单例实例
 */
export function getBackupManager(config?: Partial<BackupConfig>): BackupManager {
  if (!backupManagerInstance) {
    backupManagerInstance = new BackupManager(config)
  }
  return backupManagerInstance
}

export default BackupManager
