import { getPool } from '../mysql'
import type { AgentPushMessage } from '../../../shared/types'

interface PushMessageRow {
  id: string
  user_id: string
  session_id: string | null
  category: string
  title: string
  content: string
  sensitive_data: string | null
  priority: string
  is_read: number
  expires_at: string | null
  created_at: string
}

export class PushMessageRepository {
  async create(message: Omit<AgentPushMessage, 'timestamp'> & { isRead?: boolean }): Promise<string> {
    const pool = getPool()
    const sensitiveDataJson = message.sensitiveData ? JSON.stringify(message.sensitiveData) : null
    const isRead = message.isRead ? 1 : 0

    await pool.query(
      `INSERT INTO agent_push_messages (id, user_id, session_id, category, title, content, sensitive_data, priority, is_read, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        message.userId,
        message.sessionId,
        message.category,
        message.title,
        message.content,
        sensitiveDataJson,
        message.priority,
        isRead,
        message.expiresAt ?? null,
      ]
    )

    return message.id
  }

  async findById(id: string): Promise<AgentPushMessage | null> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM agent_push_messages WHERE id = ?',
      [id]
    ) as [PushMessageRow[], unknown]

    if (rows.length === 0) return null
    return this.mapToPushMessage(rows[0])
  }

  async findByUserId(
    userId: string,
    options?: {
      category?: string
      unreadOnly?: boolean
      limit?: number
    }
  ): Promise<AgentPushMessage[]> {
    const pool = getPool()
    const conditions = ['user_id = ?']
    const params: unknown[] = [userId]

    if (options?.category) {
      conditions.push('category = ?')
      params.push(options.category)
    }

    if (options?.unreadOnly) {
      conditions.push('is_read = 0')
    }

    conditions.push('(expires_at IS NULL OR expires_at > NOW())')

    const whereClause = conditions.join(' AND ')
    const limitClause = options?.limit ? `LIMIT ${Math.min(options.limit, 100)}` : ''

    const [rows] = await pool.query(
      `SELECT * FROM agent_push_messages WHERE ${whereClause} ORDER BY created_at DESC ${limitClause}`,
      params
    ) as [PushMessageRow[], unknown]

    return rows.map(row => this.mapToPushMessage(row))
  }

  async markAsRead(id: string): Promise<boolean> {
    const pool = getPool()
    const [result] = await pool.query(
      'UPDATE agent_push_messages SET is_read = 1 WHERE id = ?',
      [id]
    ) as [unknown, { affectedRows: number }]

    return result.affectedRows > 0
  }

  async markAllAsRead(userId: string): Promise<number> {
    const pool = getPool()
    const [result] = await pool.query(
      'UPDATE agent_push_messages SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [userId]
    ) as [unknown, { affectedRows: number }]

    return result.affectedRows
  }

  async deleteById(id: string): Promise<boolean> {
    const pool = getPool()
    const [result] = await pool.query(
      'DELETE FROM agent_push_messages WHERE id = ?',
      [id]
    ) as [unknown, { affectedRows: number }]

    return result.affectedRows > 0
  }

  async getUnreadCount(userId: string): Promise<number> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT COUNT(*) as count FROM agent_push_messages WHERE user_id = ? AND is_read = 0 AND (expires_at IS NULL OR expires_at > NOW())',
      [userId]
    ) as [{ count: number }[], unknown]

    return rows[0]?.count ?? 0
  }

  async cleanupExpired(): Promise<number> {
    const pool = getPool()
    const [result] = await pool.query(
      'DELETE FROM agent_push_messages WHERE expires_at IS NOT NULL AND expires_at < NOW()'
    ) as [unknown, { affectedRows: number }]

    return result.affectedRows
  }

  private mapToPushMessage(row: PushMessageRow): AgentPushMessage {
    let sensitiveData: AgentPushMessage['sensitiveData'] = undefined
    if (row.sensitive_data) {
      try {
        sensitiveData = JSON.parse(row.sensitive_data)
      } catch {
        sensitiveData = undefined
      }
    }

    return {
      id: row.id,
      type: 'agent_push',
      category: row.category as AgentPushMessage['category'],
      title: row.title,
      content: row.content,
      sensitiveData,
      sessionId: row.session_id ?? '',
      userId: row.user_id,
      timestamp: new Date(row.created_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      priority: row.priority as AgentPushMessage['priority'],
    }
  }
}

let instance: PushMessageRepository | null = null

export function getPushMessageRepository(): PushMessageRepository {
  if (!instance) {
    instance = new PushMessageRepository()
  }
  return instance
}
