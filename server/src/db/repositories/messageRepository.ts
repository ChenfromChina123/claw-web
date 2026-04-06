import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'
import type { Message } from '../../models/types'

export class MessageRepository {
  /**
   * 创建消息（使用指定ID）
   * 使用 UPSERT 避免重复插入错误
   */
  async createWithId(id: string, sessionId: string, role: 'user' | 'assistant' | 'system', content: string | any[]): Promise<Message> {
    const pool = getPool()

    let contentStr: string
    if (typeof content === 'string') {
      contentStr = content
    } else {
      contentStr = JSON.stringify(content)
    }

    console.log(`[MessageRepository] Creating/updating message with id: ${id}, role=${role}`)

    // 使用 INSERT ... ON DUPLICATE KEY UPDATE 避免重复插入错误
    await pool.query(
      `INSERT INTO messages (id, session_id, role, content) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content)`,
      [id, sessionId, role, contentStr]
    )

    const [rows] = await pool.query(
      'SELECT * FROM messages WHERE id = ?',
      [id]
    ) as [Message[], unknown]

    return this.mapToMessage(rows[0])
  }

  async create(sessionId: string, role: 'user' | 'assistant' | 'system', content: string | any[]): Promise<Message> {
    const id = uuidv4()
    return this.createWithId(id, sessionId, role, content)
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

  /**
   * 更新消息内容
   */
  async updateContent(id: string, content: string | any[]): Promise<void> {
    const pool = getPool()
    
    // 将 content 转换为字符串存储
    let contentStr: string
    if (typeof content === 'string') {
      contentStr = content
    } else {
      contentStr = JSON.stringify(content)
    }

    console.log(`[MessageRepository] Updating message content: id=${id}`)

    await pool.query(
      'UPDATE messages SET content = ? WHERE id = ?',
      [contentStr, id]
    )
  }

  private mapToMessage(row: any): Message {
    let content = row.content
    
    console.log(`[MessageRepository] Mapping message: id=${row.id}, role=${row.role}, content type=${typeof content}`)
    
    // 如果 content 是字符串，尝试解析为 JSON
    if (typeof content === 'string' && content.length > 0) {
      try {
        // 先检查是否看起来像 JSON
        const firstChar = content.trim().charAt(0)
        if (firstChar === '[' || firstChar === '{') {
          const parsed = JSON.parse(content)
          console.log(`[MessageRepository] Successfully parsed content as JSON:`, typeof parsed)
          content = parsed
        }
      } catch (e) {
        // 解析失败，保持原字符串
        console.debug('[MessageRepository] Failed to parse content as JSON, keeping as string:', (e as Error).message)
      }
    }
    
    const message: Message = {
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: content,
      createdAt: row.created_at,
    }
    
    console.log(`[MessageRepository] Mapped message:`, message)
    
    return message
  }
}
