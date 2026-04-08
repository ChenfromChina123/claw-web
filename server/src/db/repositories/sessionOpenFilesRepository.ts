import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'
import type { Pool } from 'mysql2/promise'

/**
 * 已打开文件的持久化记录
 */
export interface SessionOpenFileRecord {
  id: string
  sessionId: string
  openFilePaths: string[]
  activeFilePath: string | null
  timestamp: Date
}

/**
 * SessionOpenFilesRepository - 会话打开文件的数据访问层
 * 
 * 用于持久化记录用户上次打开的文件，方便二次加载
 */
export class SessionOpenFilesRepository {

  /**
   * 保存或更新会话的已打开文件记录
   * @param sessionId 会话 ID
   * @param openFilePaths 打开的文件路径列表
   * @param activeFilePath 当前激活的文件路径
   */
  async upsert(sessionId: string, openFilePaths: string[], activeFilePath: string | null): Promise<void> {
    const pool = getPool() as Pool

    // 检查记录是否已存在
    const [existing] = await pool.query(
      'SELECT id FROM session_open_files WHERE session_id = ?',
      [sessionId]
    ) as [SessionOpenFileRecord[], unknown]

    if (existing.length > 0) {
      // 更新现有记录
      await pool.query(
        'UPDATE session_open_files SET open_file_paths = ?, active_file_path = ? WHERE session_id = ?',
        [JSON.stringify(openFilePaths), activeFilePath, sessionId]
      )
    } else {
      // 插入新记录
      const id = uuidv4()
      await pool.query(
        'INSERT INTO session_open_files (id, session_id, open_file_paths, active_file_path) VALUES (?, ?, ?, ?)',
        [id, sessionId, JSON.stringify(openFilePaths), activeFilePath]
      )
    }
  }

  /**
   * 获取指定会话的已打开文件记录
   * @param sessionId 会话 ID
   * @returns 已打开文件记录，如果不存在则返回 null
   */
  async findBySessionId(sessionId: string): Promise<SessionOpenFileRecord | null> {
    const pool = getPool() as Pool

    const [rows] = await pool.query(
      'SELECT * FROM session_open_files WHERE session_id = ?',
      [sessionId]
    ) as [any[], unknown]

    if (rows.length === 0) return null

    const row = rows[0]
    let openFilePaths: string[] = []
    
    // 解析 JSON 字段
    if (row.open_file_paths) {
      try {
        openFilePaths = typeof row.open_file_paths === 'string' 
          ? JSON.parse(row.open_file_paths) 
          : row.open_file_paths
      } catch {
        console.warn('[SessionOpenFilesRepo] 解析 open_file_paths 失败:', row.open_file_paths)
        openFilePaths = []
      }
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      openFilePaths,
      activeFilePath: row.active_file_path,
      timestamp: row.timestamp,
    }
  }

  /**
   * 删除指定会话的已打开文件记录
   * @param sessionId 会话 ID
   */
  async delete(sessionId: string): Promise<void> {
    const pool = getPool() as Pool
    await pool.query(
      'DELETE FROM session_open_files WHERE session_id = ?',
      [sessionId]
    )
  }

  /**
   * 清理过期记录（删除超过指定天数的记录）
   * @param days 保留天数，默认 7 天
   */
  async cleanupOldRecords(days: number = 7): Promise<number> {
    const pool = getPool() as Pool
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const [result] = await pool.query(
      'DELETE FROM session_open_files WHERE timestamp < ?',
      [cutoffDate]
    ) as [any, unknown]

    return (result as { affectedRows: number }).affectedRows
  }
}

// 导出单例
export const sessionOpenFilesRepository = new SessionOpenFilesRepository()
