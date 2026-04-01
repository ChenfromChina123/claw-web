import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'
import type { Message } from '../../models/types'

export class MessageRepository {
  async create(sessionId: string, role: 'user' | 'assistant' | 'system', content: string): Promise<Message> {
    const pool = getPool()
    const id = uuidv4()

    await pool.query(
      'INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)',
      [id, sessionId, role, content]
    )

    const [rows] = await pool.query(
      'SELECT * FROM messages WHERE id = ?',
      [id]
    ) as [Message[], unknown]

    return this.mapToMessage(rows[0])
  }

  async findBySessionId(sessionId: string): Promise<Message[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    ) as [Message[], unknown]

    return rows.map(row => this.mapToMessage(row))
  }

  async findById(id: string): Promise<Message | null> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM messages WHERE id = ?',
      [id]
    ) as [Message[], unknown]

    if (rows.length === 0) return null
    return this.mapToMessage(rows[0])
  }

  async delete(id: string): Promise<void> {
    const pool = getPool()
    await pool.query('DELETE FROM messages WHERE id = ?', [id])
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    const pool = getPool()
    await pool.query('DELETE FROM messages WHERE session_id = ?', [sessionId])
  }

  private mapToMessage(row: any): Message {
    return {
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
    }
  }
}
