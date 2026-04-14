/**
 * 用户工作快照服务
 *
 * 功能：
 * - 创建工作区快照（实时、检查点、最终）
 * - 快照持久化存储
 * - 工作区恢复
 * - 快照清理
 */

import { v4 as uuidv4 } from 'uuid'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getPool } from '../db/mysql'
import { getLogger } from '../monitoring/structuredLogger'

const execAsync = promisify(exec)
const logger = getLogger('WorkSnapshotService')

export type SnapshotType = 'realtime' | 'checkpoint' | 'final'

export interface WorkSnapshot {
  id: string
  userId: string
  sessionId: string
  containerId?: string
  snapshotType: SnapshotType
  workspacePath?: string
  workspaceSizeBytes: number
  fileManifest?: WorkspaceFile[]
  processState?: RunningProcess[]
  gitState?: GitState
  executionState?: ExecutionState
  createdAt: Date
  expiresAt?: Date
}

export interface WorkspaceFile {
  path: string
  checksum: string
  sizeBytes: number
  modifiedAt: Date
  isDirectory: boolean
}

export interface RunningProcess {
  pid: number
  command: string
  startedAt: Date
  cwd?: string
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
  includeProcessState?: boolean
  includeGitState?: boolean
  includeExecutionState?: boolean
}

export interface RestoreSnapshotOptions {
  snapshotId: string
  targetPath?: string
  overwrite?: boolean
}

class WorkSnapshotService {
  private readonly SNAPSHOT_RETENTION: Record<SnapshotType, number> = {
    realtime: 24 * 60 * 60 * 1000,  // 24小时
    checkpoint: 7 * 24 * 60 * 60 * 1000,  // 7天
    final: 365 * 24 * 60 * 60 * 1000  // 1年
  }

  /**
   * 创建工作区快照
   */
  async createSnapshot(options: CreateSnapshotOptions): Promise<WorkSnapshot> {
    const pool = getPool()
    const snapshotId = uuidv4()
    const now = new Date()

    const workspacePath = options.workspacePath || `/app/workspaces/sessions/${options.sessionId}`

    // 收集文件清单
    const fileManifest = await this.collectFileManifest(workspacePath)

    // 计算工作区大小
    const workspaceSizeBytes = await this.calculateWorkspaceSize(workspacePath)

    // 收集进程状态
    let processState: RunningProcess[] | undefined
    if (options.includeProcessState) {
      processState = await this.collectProcessState()
    }

    // 收集Git状态
    let gitState: GitState | undefined
    if (options.includeGitState) {
      gitState = await this.collectGitState(workspacePath)
    }

    // 收集执行状态
    let executionState: ExecutionState | undefined
    if (options.includeExecutionState) {
      executionState = await this.collectExecutionState(workspacePath)
    }

    const expiresAt = new Date(now.getTime() + this.SNAPSHOT_RETENTION[options.snapshotType])

    // 保存到数据库
    await pool.execute(
      `INSERT INTO work_snapshots
       (id, user_id, session_id, container_id, snapshot_type, workspace_path, workspace_size_bytes,
        file_manifest, process_state, git_state, execution_state, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshotId,
        options.userId,
        options.sessionId,
        options.containerId || null,
        options.snapshotType,
        workspacePath,
        workspaceSizeBytes,
        JSON.stringify(fileManifest),
        JSON.stringify(processState || []),
        JSON.stringify(gitState || {}),
        JSON.stringify(executionState || {}),
        now,
        expiresAt
      ]
    )

    logger.info(`[WorkSnapshot] Created snapshot ${snapshotId} for session ${options.sessionId}`)

    return {
      id: snapshotId,
      userId: options.userId,
      sessionId: options.sessionId,
      containerId: options.containerId,
      snapshotType: options.snapshotType,
      workspacePath,
      workspaceSizeBytes,
      fileManifest,
      processState,
      gitState,
      executionState,
      createdAt: now,
      expiresAt
    }
  }

  /**
   * 获取用户会话的最新快照
   */
  async getLatestSnapshot(userId: string, sessionId: string): Promise<WorkSnapshot | null> {
    const pool = getPool()
    const [rows] = await pool.query(
      `SELECT * FROM work_snapshots
       WHERE user_id = ? AND session_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, sessionId]
    ) as [any[], unknown]

    if (rows.length === 0) {
      return null
    }

    return this.rowToSnapshot(rows[0])
  }

  /**
   * 获取快照详情
   */
  async getSnapshot(snapshotId: string): Promise<WorkSnapshot | null> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM work_snapshots WHERE id = ?',
      [snapshotId]
    ) as [any[], unknown]

    if (rows.length === 0) {
      return null
    }

    return this.rowToSnapshot(rows[0])
  }

  /**
   * 获取用户的所有快照
   */
  async getSnapshotsByUser(userId: string, limit: number = 50): Promise<WorkSnapshot[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      `SELECT * FROM work_snapshots
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit]
    ) as [any[], unknown]

    return rows.map(row => this.rowToSnapshot(row))
  }

  /**
   * 删除快照
   */
  async deleteSnapshot(snapshotId: string): Promise<boolean> {
    const pool = getPool()
    const [result] = await pool.execute(
      'DELETE FROM work_snapshots WHERE id = ?',
      [snapshotId]
    ) as [any, unknown]

    const affected = (result as any).affectedRows
    if (affected > 0) {
      logger.info(`[WorkSnapshot] Deleted snapshot ${snapshotId}`)
    }
    return affected > 0
  }

  /**
   * 清理过期快照
   */
  async cleanupExpiredSnapshots(): Promise<number> {
    const pool = getPool()
    const [result] = await pool.execute(
      'DELETE FROM work_snapshots WHERE expires_at < NOW() AND snapshot_type != "final"'
    ) as [any, unknown]

    const deletedCount = (result as any).affectedRows
    if (deletedCount > 0) {
      logger.info(`[WorkSnapshot] Cleaned up ${deletedCount} expired snapshots`)
    }
    return deletedCount
  }

  /**
   * 验证快照是否可用于恢复
   */
  async validateSnapshot(snapshotId: string): Promise<{ valid: boolean; reason?: string }> {
    const snapshot = await this.getSnapshot(snapshotId)
    if (!snapshot) {
      return { valid: false, reason: 'Snapshot not found' }
    }

    if (snapshot.expiresAt && snapshot.expiresAt < new Date()) {
      return { valid: false, reason: 'Snapshot has expired' }
    }

    if (!snapshot.fileManifest || snapshot.fileManifest.length === 0) {
      return { valid: false, reason: 'Snapshot has no files' }
    }

    return { valid: true }
  }

  /**
   * 收集工作区文件清单
   */
  private async collectFileManifest(workspacePath: string): Promise<WorkspaceFile[]> {
    try {
      const output = await execAsync(
        `find "${workspacePath}" -type f -exec md5sum {} \\; 2>/dev/null || echo ""`,
        { timeout: 30000 }
      )

      const files: WorkspaceFile[] = []
      const lines = output.stdout.trim().split('\n').filter(Boolean)

      for (const line of lines) {
        const parts = line.match(/^([a-f0-9]+)\s+(.+)$/)
        if (parts) {
          const filePath = parts[2]
          const checksum = parts[1]

          try {
            const stat = await execAsync(`stat -c "%s %Y" "${filePath}" 2>/dev/null || echo "0 0"`)
            const [sizeBytes, modifiedAtTs] = stat.stdout.trim().split(' ').map(Number)

            files.push({
              path: filePath.replace(workspacePath, ''),
              checksum,
              sizeBytes,
              modifiedAt: new Date(modifiedAtTs * 1000),
              isDirectory: false
            })
          } catch {
            // 忽略无法获取信息的文件
          }
        }
      }

      return files
    } catch (error) {
      logger.error(`[WorkSnapshot] Failed to collect file manifest:`, error)
      return []
    }
  }

  /**
   * 计算工作区大小
   */
  private async calculateWorkspaceSize(workspacePath: string): Promise<number> {
    try {
      const output = await execAsync(
        `du -sb "${workspacePath}" 2>/dev/null | cut -f1 || echo "0"`,
        { timeout: 10000 }
      )
      return parseInt(output.stdout.trim(), 10) || 0
    } catch {
      return 0
    }
  }

  /**
   * 收集运行中的进程状态
   */
  private async collectProcessState(): Promise<RunningProcess[]> {
    try {
      const output = await execAsync(
        'ps aux --no-headers | grep -v grep | head -20',
        { timeout: 5000 }
      )

      const processes: RunningProcess[] = []
      const lines = output.stdout.trim().split('\n').filter(Boolean)

      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 11) {
          const pid = parseInt(parts[1], 10)
          const command = parts.slice(10).join(' ')

          processes.push({
            pid,
            command,
            startedAt: new Date()
          })
        }
      }

      return processes
    } catch {
      return []
    }
  }

  /**
   * 收集Git状态
   */
  private async collectGitState(workspacePath: string): Promise<GitState | undefined> {
    try {
      // 检查是否是git仓库
      const branchOutput = await execAsync(
        `cd "${workspacePath}" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo ""`,
        { timeout: 5000 }
      )
      const branch = branchOutput.stdout.trim()
      if (!branch) return undefined

      // 获取未提交文件
      const statusOutput = await execAsync(
        `cd "${workspacePath}" && git status --porcelain 2>/dev/null || echo ""`,
        { timeout: 5000 }
      )
      const uncommittedFiles = statusOutput.stdout
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.substring(3).trim())

      // 获取最后提交
      const lastCommitOutput = await execAsync(
        `cd "${workspacePath}" && git log -1 --format="%H %s" 2>/dev/null || echo ""`,
        { timeout: 5000 }
      )
      const lastCommit = lastCommitOutput.stdout.trim()

      return {
        branch,
        uncommittedFiles,
        lastCommit,
        status: statusOutput.stdout.trim()
      }
    } catch {
      return undefined
    }
  }

  /**
   * 收集执行状态
   */
  private async collectExecutionState(workspacePath: string): Promise<ExecutionState | undefined> {
    // 简化实现，实际应从agentStatusService获取
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

  /**
   * 将数据库行转换为快照对象
   */
  private rowToSnapshot(row: any): WorkSnapshot {
    return {
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      containerId: row.container_id,
      snapshotType: row.snapshot_type,
      workspacePath: row.workspace_path,
      workspaceSizeBytes: row.workspace_size_bytes,
      fileManifest: row.file_manifest ? JSON.parse(row.file_manifest) : undefined,
      processState: row.process_state ? JSON.parse(row.process_state) : undefined,
      gitState: row.git_state ? JSON.parse(row.git_state) : undefined,
      executionState: row.execution_state ? JSON.parse(row.execution_state) : undefined,
      createdAt: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined
    }
  }
}

// 单例模式
let workSnapshotService: WorkSnapshotService | null = null

export function getWorkSnapshotService(): WorkSnapshotService {
  if (!workSnapshotService) {
    workSnapshotService = new WorkSnapshotService()
  }
  return workSnapshotService
}

export default WorkSnapshotService
