import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'
import type { Session } from '../../models/types'

export class SessionRepository {
  async create(userId: string, title: string = '新对话', model: string = 'qwen-plus'): Promise<Session> {
    const pool = getPool()
    const id = uuidv4()

    await pool.query(
      'INSERT INTO sessions (id, user_id, title, model) VALUES (?, ?, ?, ?)',
      [id, userId, title, model]
    )

    const [rows] = await pool.query(
      'SELECT * FROM sessions WHERE id = ?',
      [id]
    ) as [Session[], unknown]

    return this.mapToSession(rows[0])
  }

  async findById(id: string): Promise<Session | null> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM sessions WHERE id = ?',
      [id]
    ) as [Session[], unknown]

    if (rows.length === 0) return null
    return this.mapToSession(rows[0])
  }

  async findByUserId(userId: string): Promise<Session[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC',
      [userId]
    ) as [Session[], unknown]

    return rows.map(row => this.mapToSession(row))
  }

  async updateTitle(id: string, title: string): Promise<void> {
    const pool = getPool()
    await pool.query(
      'UPDATE sessions SET title = ? WHERE id = ?',
      [title, id]
    )
  }

  async updateModel(id: string, model: string): Promise<void> {
    const pool = getPool()
    await pool.query(
      'UPDATE sessions SET model = ? WHERE id = ?',
      [model, id]
    )
  }

  async updateIsPinned(id: string, isPinned: boolean): Promise<void> {
    const pool = getPool()
    await pool.query(
      'UPDATE sessions SET is_pinned = ? WHERE id = ?',
      [isPinned, id]
    )
  }

  async update(id: string, updates: { title?: string; model?: string; isPinned?: boolean }): Promise<Session | null> {
    const pool = getPool()
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

  async touch(id: string): Promise<void> {
    const pool = getPool()
    await pool.query(
      'UPDATE sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    )
  }

  async delete(id: string): Promise<void> {
    const pool = getPool()
    await pool.query('DELETE FROM sessions WHERE id = ?', [id])
  }

  async findLatestByUserId(userId: string): Promise<Session | null> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
