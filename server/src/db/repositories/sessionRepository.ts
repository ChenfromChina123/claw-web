import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'
import type { Session } from '../../models/types'
import type { Pool } from 'mysql2/promise'

export class SessionRepository {
  async create(userId: string, title: string = '新对话', model: string = 'qwen-plus', isMaster: boolean = false): Promise<Session> {
    const pool = getPool() as Pool
    const id = uuidv4()

    await pool.query(
      'INSERT INTO sessions (id, user_id, title, model, is_master) VALUES (?, ?, ?, ?, ?)',
      [id, userId, title, model, isMaster]
    )

    const [rows] = await pool.query(
      'SELECT * FROM sessions WHERE id = ?',
      [id]
    ) as [Session[], unknown]

    return this.mapToSession(rows[0])
  }

  async findById(id: string): Promise<Session | null> {
    const pool = getPool() as Pool
    const [rows] = await pool.query(
      'SELECT * FROM sessions WHERE id = ?',
      [id]
    ) as [Session[], unknown]

    if (rows.length === 0) return null
    return this.mapToSession(rows[0])
  }

  async findByUserId(userId: string): Promise<Session[]> {
    const pool = getPool() as Pool
    console.log(`[SessionRepo] findByUserId: userId=${userId}`)
    const [rows] = await pool.query(
      'SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC',
      [userId]
    ) as [Session[], unknown]
    console.log(`[SessionRepo] findByUserId: found ${rows.length} sessions for user ${userId}, rows:`, JSON.stringify(rows, null, 2))

    return rows.map(row => this.mapToSession(row))
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const pool = getPool() as Pool
    await pool.query(
      'UPDATE sessions SET title = ? WHERE id = ?',
      [title, id]
    )
  }

  async updateModel(id: string, model: string): Promise<void> {
    const pool = getPool() as Pool
    await pool.query(
      'UPDATE sessions SET model = ? WHERE id = ?',
      [model, id]
    )
  }

  async updateIsPinned(id: string, isPinned: boolean): Promise<void> {
    const pool = getPool() as Pool
    await pool.query(
      'UPDATE sessions SET is_pinned = ? WHERE id = ?',
      [isPinned, id]
    )
  }

  async update(id: string, updates: { title?: string; model?: string; isPinned?: boolean }): Promise<Session | null> {
    const pool = getPool() as Pool
    const setClauses: string[] = []
    const values: (string | boolean)[] = []

    if (updates.title !== undefined) {
      setClauses.push('title = ?')
      values.push(updates.title)
    }
    if (updates.model !== undefined) {
      setClauses.push('model = ?')
      values.push(updates.model)
    }
    if (updates.isPinned !== undefined) {
      setClauses.push('is_pinned = ?')
      values.push(updates.isPinned)
    }

    if (setClauses.length === 0) {
      return this.findById(id)
    }

    values.push(id)
    await pool.query(
      `UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    )

    return this.findById(id)
  }

  async save(session: Session): Promise<void> {
    const pool = getPool() as Pool
    // 将布尔值转换为整数（0/1）以确保 MySQL 正确存储
    const isMasterValue = session.isMaster ? 1 : 0
    const isPinnedValue = session.isPinned ? 1 : 0
    await pool.query(
      'UPDATE sessions SET title = ?, model = ?, is_pinned = ?, is_master = ? WHERE id = ?',
      [session.title, session.model, isPinnedValue, isMasterValue, session.id]
    )
  }

  async touch(id: string): Promise<void> {
    const pool = getPool() as Pool
    await pool.query(
      'UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    )
  }

  async delete(id: string): Promise<void> {
    const pool = getPool() as Pool
    await pool.query('DELETE FROM sessions WHERE id = ?', [id])
  }

  async findLatestByUserId(userId: string): Promise<Session | null> {
    const pool = getPool() as Pool
    const [rows] = await pool.query(
      'SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
      [userId]
    ) as [Session[], unknown]

    if (rows.length === 0) return null
    return this.mapToSession(rows[0])
  }

  /**
   * 查找用户的空会话 (没有消息的会话)
   * @param userId 用户 ID
   * @returns 返回最新的空会话，如果没有则返回 null
   */
  async findEmptySessionByUserId(userId: string): Promise<Session | null> {
    const pool = getPool() as Pool
    const [rows] = await pool.query(
      `SELECT s.* FROM sessions s 
       LEFT JOIN messages m ON s.id = m.session_id 
       WHERE s.user_id = ? AND m.id IS NULL 
       ORDER BY s.updated_at DESC 
       LIMIT 1`,
      [userId]
    ) as [Session[], unknown]

    if (rows.length === 0) return null
    return this.mapToSession(rows[0])
  }

  private mapToSession(row: any): Session {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      model: row.model,
      isPinned: row.is_pinned ?? false,
      isMaster: row.is_master ?? false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
