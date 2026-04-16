/**
 * 增强型容器快照服务
 *
 * 功能改进：
 * - 增量文件备份（rsync）
 * - 文件内容实际存储（tar压缩）
 * - 完整的快照恢复功能
 * - 智能清理策略
 * - 支持存储到本地磁盘或S3
 */

import { v4 as uuidv4 } from 'uuid'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs/promises'
import * as path from 'path'
import { getPool } from '../db/mysql'
import { getLogger } from '../monitoring/structuredLogger'

const execAsync = promisify(exec)
const logger = getLogger('EnhancedSnapshotService')

// ==================== 类型定义 ====================

export type SnapshotType = 'realtime' | 'checkpoint' | 'final'

export interface SnapshotMetadata {
  id: string
  userId: string
  sessionId: string
  containerId?: string
  snapshotType: SnapshotType
  baseSnapshotId?: string
  storageType: 'local' | 's3'
  storagePath: string
  sizeBytes: number
  checksum: string
  fileCount: number
  compressionRatio: number
  gitState?: GitState
  executionState?: ExecutionState
  createdAt: Date
  expiresAt: Date
  restoredAt?: Date
}

export interface GitState {
  branch: string
  uncommittedFiles: string[]
  lastCommit: string
  status: string
}

export interface ExecutionState {
  currentWorkingDirectory: string
  activeTasks: string[]
  recentToolCalls: ToolCallSummary[]
}

export interface ToolCallSummary {
  toolId: string
  toolName: string
  calledAt: Date
  duration?: number
  success: boolean
}

export interface CreateSnapshotOptions {
  userId: string
  sessionId: string
  containerId?: string
  snapshotType: SnapshotType
  workspacePath?: string
  baseSnapshotId?: string
  includeGitState?: boolean
  includeExecutionState?: boolean
}

export interface RestoreSnapshotOptions {
  snapshotId: string
  targetContainerId?: string
  targetSessionId?: string
}

// ==================== 增强型快照服务 ====================

class EnhancedSnapshotService {
  private readonly SNAPSHOT_DIR: string
  private readonly TEMP_DIR: string
  private readonly S3_BUCKET: string = 'claw-web-snapshots'
  private useS3: boolean = false

  // 快照保留策略
  private readonly RETENTION_POLICY: Record<SnapshotType, { count: number; days: number }> = {
    realtime: { count: 5, days: 1 },
    checkpoint: { count: 10, days: 7 },
    final: { count: 0, days: 365 }
  }

  constructor() {
    this.SNAPSHOT_DIR = process.env.SNAPSHOT_STORAGE_PATH || '/var/lib/claw-web/snapshots'
    this.TEMP_DIR = '/tmp/claw-web-snapshots'
    this.useS3 = process.env.USE_S3_STORAGE === 'true'

    // 初始化目录
    this.initializeDirectories()
  }

  /**
   * 初始化存储目录
   */
  private async initializeDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.SNAPSHOT_DIR, { recursive: true })
      await fs.mkdir(this.TEMP_DIR, { recursive: true })
      logger.info(`[Snapshot] 快照目录初始化完成: ${this.SNAPSHOT_DIR}`)
    } catch (error) {
      logger.error(`[Snapshot] 初始化目录失败:`, error)
    }
  }

  /**
   * 创建完整快照（包含文件内容）
   */
  async createSnapshot(options: CreateSnapshotOptions): Promise<SnapshotMetadata> {
    const snapshotId = uuidv4()
    const workspacePath = options.workspacePath || `/app/workspaces/sessions/${options.sessionId}`
    const tempSnapshotDir = path.join(this.TEMP_DIR, snapshotId)

    logger.info(`[Snapshot] 开始创建快照: ${snapshotId}, session=${options.sessionId}, type=${options.snapshotType}`)

    try {
      // 1. 创建临时目录
      await fs.mkdir(tempSnapshotDir, { recursive: true })

      // 2. 获取基础快照（用于增量备份）
      const baseSnapshot = options.baseSnapshotId
        ? await this.getSnapshotMetadata(options.baseSnapshotId)
        : null

      // 3. 备份文件（增量或全量）
      const fileBackupResult = await this.backupFiles(
        workspacePath,
        tempSnapshotDir,
        baseSnapshot?.storagePath
      )

      // 4. 收集Git状态
      let gitState: GitState | undefined
      if (options.includeGitState) {
        gitState = await this.collectGitState(workspacePath)
      }

      // 5. 收集执行状态
      let executionState: ExecutionState | undefined
      if (options.includeExecutionState) {
        executionState = await this.collectExecutionState(workspacePath)
      }

      // 6. 打包并压缩
      const tarPath = await this.createTarArchive(tempSnapshotDir, snapshotId)

      // 7. 计算校验和
      const checksum = await this.calculateChecksum(tarPath)

      // 8. 移动到最终存储位置
      const storagePath = await this.moveToStorage(tarPath, options.sessionId, snapshotId)

      // 9. 获取文件信息
      const stats = await fs.stat(storagePath)

      // 10. 保存元数据到数据库
      const metadata: SnapshotMetadata = {
        id: snapshotId,
        userId: options.userId,
        sessionId: options.sessionId,
        containerId: options.containerId,
        snapshotType: options.snapshotType,
        baseSnapshotId: options.baseSnapshotId,
        storageType: this.useS3 ? 's3' : 'local',
        storagePath,
        sizeBytes: stats.size,
        checksum,
        fileCount: fileBackupResult.fileCount,
        compressionRatio: fileBackupResult.compressionRatio,
        gitState,
        executionState,
        createdAt: new Date(),
        expiresAt: this.calculateExpiryDate(options.snapshotType)
      }

      await this.saveSnapshotMetadata(metadata)

      // 11. 清理旧快照
      await this.cleanupOldSnapshots(options.sessionId, options.snapshotType)

      logger.info(`[Snapshot] 快照创建成功: ${snapshotId}, size=${this.formatBytes(stats.size)}, files=${fileBackupResult.fileCount}`)

      return metadata
    } catch (error) {
      logger.error(`[Snapshot] 创建快照失败:`, error)
      throw error
    } finally {
      // 清理临时目录
      await this.cleanupTempDir(tempSnapshotDir)
    }
  }

  /**
   * 备份文件（支持增量备份）
   */
  private async backupFiles(
    sourcePath: string,
    targetDir: string,
    baseSnapshotPath?: string
  ): Promise<{ fileCount: number; compressionRatio: number }> {
    const filesDir = path.join(targetDir, 'files')
    await fs.mkdir(filesDir, { recursive: true })

    try {
      let rsyncCmd: string

      if (baseSnapshotPath && await this.fileExists(baseSnapshotPath)) {
        // 增量备份：基于基础快照
        logger.info(`[Snapshot] 执行增量备份，基础快照: ${baseSnapshotPath}`)

        // 解压基础快照到临时目录
        const baseDir = path.join(targetDir, 'base')
        await fs.mkdir(baseDir, { recursive: true })
        await execAsync(`tar -xzf ${baseSnapshotPath} -C ${baseDir}`)

        // 使用 rsync 进行增量备份
        rsyncCmd = `rsync -avz --delete --compare-dest=${baseDir}/files/ "${sourcePath}/" "${filesDir}/"`
      } else {
        // 全量备份
        logger.info(`[Snapshot] 执行全量备份`)
        rsyncCmd = `rsync -avz --delete "${sourcePath}/" "${filesDir}/"`
      }

      // 执行备份
      const { stdout, stderr } = await execAsync(rsyncCmd, { timeout: 300000 })

      // 统计文件数量
      const fileCount = await this.countFiles(filesDir)

      // 计算原始大小和压缩比例
      const sourceSize = await this.calculateDirectorySize(sourcePath)
      const backupSize = await this.calculateDirectorySize(filesDir)
      const compressionRatio = sourceSize > 0 ? (sourceSize - backupSize) / sourceSize : 0

      logger.info(`[Snapshot] 文件备份完成: ${fileCount} 个文件, 压缩率: ${(compressionRatio * 100).toFixed(2)}%`)

      return { fileCount, compressionRatio }
    } catch (error) {
      logger.error(`[Snapshot] 文件备份失败:`, error)
      throw error
    }
  }

  /**
   * 创建 tar.gz 压缩包
   */
  private async createTarArchive(sourceDir: string, snapshotId: string): Promise<string> {
    const tarPath = path.join(this.TEMP_DIR, `${snapshotId}.tar.gz`)

    try {
      // 使用 tar 创建压缩包，排除不必要的文件
      const excludePatterns = [
        '--exclude=node_modules',
        '--exclude=.git/objects',
        '--exclude=*.log',
        '--exclude=.cache',
        '--exclude=tmp'
      ]

      await execAsync(
        `tar -czf ${tarPath} -C ${sourceDir} ${excludePatterns.join(' ')} .`,
        { timeout: 120000 }
      )

      return tarPath
    } catch (error) {
      logger.error(`[Snapshot] 创建压缩包失败:`, error)
      throw error
    }
  }

  /**
   * 计算文件校验和
   */
  private async calculateChecksum(filePath: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`md5sum "${filePath}"`)
      return stdout.split(' ')[0]
    } catch (error) {
      logger.error(`[Snapshot] 计算校验和失败:`, error)
      throw error
    }
  }

  /**
   * 移动文件到存储位置
   */
  private async moveToStorage(tarPath: string, sessionId: string, snapshotId: string): Promise<string> {
    if (this.useS3) {
      // 上传到 S3
      const s3Key = `snapshots/${sessionId}/${snapshotId}.tar.gz`
      await this.uploadToS3(tarPath, s3Key)
      return s3Key
    } else {
      // 保存到本地
      const sessionDir = path.join(this.SNAPSHOT_DIR, sessionId)
      await fs.mkdir(sessionDir, { recursive: true })
      const storagePath = path.join(sessionDir, `${snapshotId}.tar.gz`)
      await fs.rename(tarPath, storagePath)
      return storagePath
    }
  }

  /**
   * 上传到 S3（简化版，实际需要集成 AWS SDK）
   */
  private async uploadToS3(localPath: string, s3Key: string): Promise<void> {
    // TODO: 集成 AWS S3 SDK
    // 这里使用本地存储作为 fallback
    const s3Dir = path.join(this.SNAPSHOT_DIR, 's3-mirror', path.dirname(s3Key))
    await fs.mkdir(s3Dir, { recursive: true })
    await fs.copyFile(localPath, path.join(this.SNAPSHOT_DIR, 's3-mirror', s3Key))
    logger.info(`[Snapshot] S3上传模拟完成: ${s3Key}`)
  }

  /**
   * 保存快照元数据到数据库
   */
  private async saveSnapshotMetadata(metadata: SnapshotMetadata): Promise<void> {
    const pool = getPool()

    await pool.execute(
      `INSERT INTO work_snapshots
       (id, user_id, session_id, container_id, snapshot_type, base_snapshot_id,
        storage_type, storage_path, size_bytes, checksum, file_count,
        compression_ratio, git_state, execution_state, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        metadata.id,
        metadata.userId,
        metadata.sessionId,
        metadata.containerId || null,
        metadata.snapshotType,
        metadata.baseSnapshotId || null,
        metadata.storageType,
        metadata.storagePath,
        metadata.sizeBytes,
        metadata.checksum,
        metadata.fileCount,
        metadata.compressionRatio,
        JSON.stringify(metadata.gitState || {}),
        JSON.stringify(metadata.executionState || {}),
        metadata.createdAt,
        metadata.expiresAt
      ]
    )
  }

  /**
   * 恢复快照
   */
  async restoreSnapshot(options: RestoreSnapshotOptions): Promise<void> {
    const { snapshotId, targetContainerId, targetSessionId } = options

    logger.info(`[Snapshot] 开始恢复快照: ${snapshotId}`)

    // 1. 获取快照元数据
    const metadata = await this.getSnapshotMetadata(snapshotId)
    if (!metadata) {
      throw new Error(`快照不存在: ${snapshotId}`)
    }

    // 2. 验证快照完整性
    const isValid = await this.validateSnapshot(metadata)
    if (!isValid) {
      throw new Error(`快照校验失败: ${snapshotId}`)
    }

    // 3. 如果是增量快照，先恢复基础快照
    if (metadata.baseSnapshotId) {
      logger.info(`[Snapshot] 先恢复基础快照: ${metadata.baseSnapshotId}`)
      await this.restoreSnapshot({
        snapshotId: metadata.baseSnapshotId,
        targetContainerId,
        targetSessionId
      })
    }

    // 4. 确定目标路径
    const sessionId = targetSessionId || metadata.sessionId
    const workspacePath = `/app/workspaces/sessions/${sessionId}`

    // 5. 下载/获取快照文件
    const tempTarPath = await this.downloadSnapshot(metadata)

    try {
      if (targetContainerId) {
        // 恢复到指定容器
        await this.restoreToContainer(tempTarPath, targetContainerId, workspacePath)
      } else {
        // 恢复到本地（用于调试或迁移）
        await this.restoreToLocal(tempTarPath, workspacePath)
      }

      // 6. 恢复Git状态
      if (metadata.gitState) {
        await this.restoreGitState(metadata.gitState, targetContainerId, workspacePath)
      }

      // 7. 更新恢复时间
      await this.updateRestoreTime(snapshotId)

      logger.info(`[Snapshot] 快照恢复成功: ${snapshotId}`)
    } finally {
      // 清理临时文件
      await this.cleanupFile(tempTarPath)
    }
  }

  /**
   * 下载快照文件
   */
  private async downloadSnapshot(metadata: SnapshotMetadata): Promise<string> {
    const tempPath = path.join(this.TEMP_DIR, `${metadata.id}.tar.gz`)

    if (metadata.storageType === 's3') {
      // 从 S3 下载
      // TODO: 实现 S3 下载
      const localMirrorPath = path.join(this.SNAPSHOT_DIR, 's3-mirror', metadata.storagePath)
      await fs.copyFile(localMirrorPath, tempPath)
    } else {
      // 从本地复制
      await fs.copyFile(metadata.storagePath, tempPath)
    }

    return tempPath
  }

  /**
   * 恢复到容器
   */
  private async restoreToContainer(tarPath: string, containerId: string, targetPath: string): Promise<void> {
    try {
      // 1. 复制 tar 文件到容器
      const containerTarPath = '/tmp/snapshot-restore.tar.gz'
      await execAsync(`docker cp "${tarPath}" ${containerId}:${containerTarPath}`)

      // 2. 在容器内解压
      await execAsync(
        `docker exec ${containerId} bash -c "mkdir -p '${targetPath}' && tar -xzf ${containerTarPath} -C '${targetPath}' --strip-components=1"`,
        { timeout: 120000 }
      )

      // 3. 清理容器内的临时文件
      await execAsync(`docker exec ${containerId} rm -f ${containerTarPath}`)

      logger.info(`[Snapshot] 已恢复到容器 ${containerId}: ${targetPath}`)
    } catch (error) {
      logger.error(`[Snapshot] 恢复到容器失败:`, error)
      throw error
    }
  }

  /**
   * 恢复到本地
   */
  private async restoreToLocal(tarPath: string, targetPath: string): Promise<void> {
    try {
      await fs.mkdir(targetPath, { recursive: true })
      await execAsync(
        `tar -xzf "${tarPath}" -C "${targetPath}" --strip-components=1`,
        { timeout: 120000 }
      )
      logger.info(`[Snapshot] 已恢复到本地: ${targetPath}`)
    } catch (error) {
      logger.error(`[Snapshot] 恢复到本地失败:`, error)
      throw error
    }
  }

  /**
   * 恢复Git状态
   */
  private async restoreGitState(gitState: GitState, containerId: string | undefined, workspacePath: string): Promise<void> {
    try {
      const execCmd = containerId
        ? (cmd: string) => execAsync(`docker exec ${containerId} bash -c "cd '${workspacePath}' && ${cmd}"`)
        : (cmd: string) => execAsync(`cd "${workspacePath}" && ${cmd}`)

      // 切换到正确的分支
      if (gitState.branch) {
        await execCmd(`git checkout ${gitState.branch} 2>/dev/null || true`)
      }

      logger.info(`[Snapshot] Git状态恢复完成: branch=${gitState.branch}`)
    } catch (error) {
      logger.warn(`[Snapshot] Git状态恢复失败（非关键）:`, error)
    }
  }

  /**
   * 验证快照完整性
   */
  async validateSnapshot(metadata: SnapshotMetadata): Promise<boolean> {
    try {
      let filePath: string

      if (metadata.storageType === 's3') {
        // 下载到临时位置进行验证
        filePath = await this.downloadSnapshot(metadata)
      } else {
        filePath = metadata.storagePath
      }

      // 计算当前校验和
      const currentChecksum = await this.calculateChecksum(filePath)

      // 清理临时文件
      if (metadata.storageType === 's3') {
        await this.cleanupFile(filePath)
      }

      return currentChecksum === metadata.checksum
    } catch (error) {
      logger.error(`[Snapshot] 验证快照失败:`, error)
      return false
    }
  }

  /**
   * 获取快照元数据
   */
  async getSnapshotMetadata(snapshotId: string): Promise<SnapshotMetadata | null> {
    const pool = getPool()

    try {
      const [rows] = await pool.query(
        'SELECT * FROM work_snapshots WHERE id = ?',
        [snapshotId]
      ) as [any[], unknown]

      if (rows.length === 0) {
        return null
      }

      return this.rowToMetadata(rows[0])
    } catch (error) {
      logger.error(`[Snapshot] 获取快照元数据失败:`, error)
      return null
    }
  }

  /**
   * 获取会话的最新快照
   */
  async getLatestSnapshot(sessionId: string): Promise<SnapshotMetadata | null> {
    const pool = getPool()

    try {
      const [rows] = await pool.query(
        `SELECT * FROM work_snapshots
         WHERE session_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [sessionId]
      ) as [any[], unknown]

      if (rows.length === 0) {
        return null
      }

      return this.rowToMetadata(rows[0])
    } catch (error) {
      logger.error(`[Snapshot] 获取最新快照失败:`, error)
      return null
    }
  }

  /**
   * 获取用户的所有快照
   */
  async getSnapshotsByUser(userId: string, limit: number = 50): Promise<SnapshotMetadata[]> {
    const pool = getPool()

    try {
      const [rows] = await pool.query(
        `SELECT * FROM work_snapshots
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [userId, limit]
      ) as [any[], unknown]

      return rows.map(row => this.rowToMetadata(row))
    } catch (error) {
      logger.error(`[Snapshot] 获取用户快照列表失败:`, error)
      return []
    }
  }

  /**
   * 删除快照
   */
  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    const metadata = await this.getSnapshotMetadata(snapshotId)
    if (!metadata) {
      return false
    }

    try {
      // 1. 删除存储文件
      if (metadata.storageType === 'local') {
        await this.cleanupFile(metadata.storagePath)
      } else {
        // TODO: 删除 S3 文件
      }

      // 2. 删除数据库记录
      const pool = getPool()
      await pool.execute('DELETE FROM work_snapshots WHERE id = ?', [snapshotId])

      logger.info(`[Snapshot] 快照已删除: ${snapshotId}`)
      return true
    } catch (error) {
      logger.error(`[Snapshot] 删除快照失败:`, error)
      return false
    }
  }

  /**
   * 智能清理旧快照
   */
  async cleanupOldSnapshots(sessionId: string, type: SnapshotType): Promise<void> {
    const policy = this.RETENTION_POLICY[type]
    const snapshots = await this.getSnapshotsBySessionAndType(sessionId, type)

    // 按时间排序（最新的在前）
    snapshots.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    const toDelete: string[] = []
    const cutoffDate = new Date(Date.now() - policy.days * 24 * 60 * 60 * 1000)

    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i]

      // 超过数量限制
      if (policy.count > 0 && i >= policy.count) {
        toDelete.push(snapshot.id)
        continue
      }

      // 超过时间限制（final类型除外）
      if (type !== 'final' && snapshot.createdAt < cutoffDate) {
        toDelete.push(snapshot.id)
      }
    }

    // 执行删除
    for (const snapshotId of toDelete) {
      await this.deleteSnapshot(snapshotId)
    }

    if (toDelete.length > 0) {
      logger.info(`[Snapshot] 清理了 ${toDelete.length} 个旧快照 (session=${sessionId}, type=${type})`)
    }
  }

  /**
   * 清理过期快照（定时任务调用）
   */
  async cleanupExpiredSnapshots(): Promise<number> {
    const pool = getPool()

    try {
      // 获取所有过期的非 final 快照
      const [rows] = await pool.query(
        `SELECT id FROM work_snapshots
         WHERE expires_at < NOW() AND snapshot_type != 'final'`
      ) as [any[], unknown]

      let deletedCount = 0
      for (const row of rows) {
        const success = await this.deleteSnapshot(row.id)
        if (success) deletedCount++
      }

      if (deletedCount > 0) {
        logger.info(`[Snapshot] 清理了 ${deletedCount} 个过期快照`)
      }

      return deletedCount
    } catch (error) {
      logger.error(`[Snapshot] 清理过期快照失败:`, error)
      return 0
    }
  }

  // ==================== 辅助方法 ====================

  private async getSnapshotsBySessionAndType(sessionId: string, type: SnapshotType): Promise<SnapshotMetadata[]> {
    const pool = getPool()

    const [rows] = await pool.query(
      `SELECT * FROM work_snapshots
       WHERE session_id = ? AND snapshot_type = ?
       ORDER BY created_at DESC`,
      [sessionId, type]
    ) as [any[], unknown]

    return rows.map(row => this.rowToMetadata(row))
  }

  private rowToMetadata(row: any): SnapshotMetadata {
    return {
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      containerId: row.container_id,
      snapshotType: row.snapshot_type,
      baseSnapshotId: row.base_snapshot_id,
      storageType: row.storage_type,
      storagePath: row.storage_path,
      sizeBytes: row.size_bytes,
      checksum: row.checksum,
      fileCount: row.file_count,
      compressionRatio: row.compression_ratio,
      gitState: row.git_state ? JSON.parse(row.git_state) : undefined,
      executionState: row.execution_state ? JSON.parse(row.execution_state) : undefined,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      restoredAt: row.restored_at ? new Date(row.restored_at) : undefined
    }
  }

  private async collectGitState(workspacePath: string): Promise<GitState | undefined> {
    try {
      const branchOutput = await execAsync(
        `cd "${workspacePath}" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""`,
        { timeout: 5000 }
      )
      const branch = branchOutput.stdout.trim()
      if (!branch) return undefined

      const statusOutput = await execAsync(
        `cd "${workspacePath}" && git status --porcelain 2>/dev/null || echo ""`,
        { timeout: 5000 }
      )
      const uncommittedFiles = statusOutput.stdout
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.substring(3).trim())

      const lastCommitOutput = await execAsync(
        `cd "${workspacePath}" && git log -1 --format="%H %s" 2>/dev/null || echo ""`,
        { timeout: 5000 }
      )

      return {
        branch,
        uncommittedFiles,
        lastCommit: lastCommitOutput.stdout.trim(),
        status: statusOutput.stdout.trim()
      }
    } catch {
      return undefined
    }
  }

  private async collectExecutionState(workspacePath: string): Promise<ExecutionState | undefined> {
    try {
      const cwdOutput = await execAsync('pwd', { timeout: 5000 })
      return {
        currentWorkingDirectory: cwdOutput.stdout.trim(),
        activeTasks: [],
        recentToolCalls: []
      }
    } catch {
      return undefined
    }
  }

  private calculateExpiryDate(type: SnapshotType): Date {
    const days = this.RETENTION_POLICY[type].days
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  }

  private async updateRestoreTime(snapshotId: string): Promise<void> {
    const pool = getPool()
    await pool.execute(
      'UPDATE work_snapshots SET restored_at = NOW() WHERE id = ?',
      [snapshotId]
    )
  }

  private async countFiles(dir: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`find "${dir}" -type f | wc -l`)
      return parseInt(stdout.trim(), 10) || 0
    } catch {
      return 0
    }
  }

  private async calculateDirectorySize(dir: string): Promise<number> {
    try {
      const { stdout } = await execAsync(`du -sb "${dir}" 2>/dev/null | cut -f1 || echo "0"`)
      return parseInt(stdout.trim(), 10) || 0
    } catch {
      return 0
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  private async cleanupTempDir(dir: string): Promise<void> {
    try {
      await execAsync(`rm -rf "${dir}"`)
    } catch (error) {
      logger.warn(`[Snapshot] 清理临时目录失败:`, error)
    }
  }

  private async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
    } catch (error) {
      logger.warn(`[Snapshot] 清理文件失败:`, error)
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

// ==================== 单例模式 ====================

let enhancedSnapshotService: EnhancedSnapshotService | null = null

export function getEnhancedSnapshotService(): EnhancedSnapshotService {
  if (!enhancedSnapshotService) {
    enhancedSnapshotService = new EnhancedSnapshotService()
  }
  return enhancedSnapshotService
}

export default EnhancedSnapshotService
