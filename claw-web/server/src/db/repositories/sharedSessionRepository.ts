import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'
import type { Pool } from 'mysql2/promise'

export interface SharedSession {
  id: string
  shareCode: string
  sessionId: string
  userId: string
  title: string
  expiresAt: Date | null
  viewCount: number
  createdAt: Date
}

export class SharedSessionRepository {
  /**
   * 创建分享会话
   */
  async create(sessionId: string, userId: string, title: string = '分享对话', expiresAt: Date | null = null): Promise<SharedSession> {
    const pool = getPool() as Pool
    const id = uuidv4()
    const shareCode = this.generateShareCode()

    await pool.query(
      'INSERT INTO shared_sessions (id, share_code, session_id, user_id, title, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, shareCode, sessionId, userId, title, expiresAt]
    )

    const [rows] = await pool.query(
      'SELECT * FROM shared_sessions WHERE id = ?',
      [id]
    ) as [any[], unknown]

    return this.mapToSharedSession(rows[0])
  }

  /**
   * 通过分享码查找分享会话
   */
  async findByShareCode(shareCode: string): Promise<SharedSession | null> {
    const pool = getPool() as Pool
    const [rows] = await pool.query(
      'SELECT * FROM shared_sessions WHERE share_code = ?',
      [shareCode]
    ) as [any[], unknown]

    if (rows.length === 0) return null
    return this.mapToSharedSession(rows[0])
  }

  /**
   * 增加浏览次数
   */
  async incrementViewCount(id: string): Promise<void> {
    const pool = getPool() as Pool
    await pool.query(
      'UPDATE shared_sessions SET view_count = view_count + 1 WHERE id = ?',
      [id]
    )
  }

  /**
   * 删除分享会话
   */
  async delete(id: string): Promise<void> {
    const pool = getPool() as Pool
    await pool.query('DELETE FROM shared_sessions WHERE id = ?', [id])
  }

  /**
   * 删除用户的某个分享
   */
  async deleteBySessionId(sessionId: string): Promise<void> {
    const pool = getPool() as Pool
    await pool.query('DELETE FROM shared_sessions WHERE session_id = ?', [sessionId])
  }

  /**
   * 获取用户的分享列表
   */
  async findByUserId(userId: string): Promise<SharedSession[]> {
    const pool = getPool() as Pool
    const [rows] = await pool.query(
      'SELECT * FROM shared_sessions WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    ) as [any[], unknown]

    return rows.map(row => this.mapToSharedSession(row))
  }

  /**
   * 检查分享是否过期
   */
  isExpired(sharedSession: SharedSession): boolean {
    if (!sharedSession.expiresAt) return false
    return new Date(sharedSession.expiresAt) < new Date()
  }

  /**
   * 生成随机分享码
   */
  private generateShareCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let result = ''
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  private mapToSharedSession(row: any): SharedSession {
    return {
      id: row.id,
      shareCode: row.share_code,
      sessionId: row.session_id,
      userId: row.user_id,
      title: row.title,
      expiresAt: row.expires_at,
      viewCount: row.view_count,
      createdAt: row.created_at,
    }
  }
}

export const sharedSessionRepository = new SharedSessionRepository()
