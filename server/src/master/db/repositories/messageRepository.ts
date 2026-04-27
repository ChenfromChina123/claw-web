import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'
import type { Message } from '../../models/types'
import type { MessageContent, ImageAttachment } from '../../models/imageTypes'

export class MessageRepository {
  /**
   * 获取下一个消息序号
   */
  private async getNextSequence(sessionId: string): Promise<number> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT COALESCE(MAX(sequence), 0) + 1 as next_seq FROM messages WHERE session_id = ?',
      [sessionId]
    ) as [{ next_seq: number }[], unknown]
    return rows[0]?.next_seq || 1
  }

  /**
   * 创建消息（使用指定ID）
   * 使用 UPSERT 避免重复插入错误
   */
  async createWithId(id: string, sessionId: string, role: 'user' | 'assistant' | 'system', content: MessageContent, attachments?: ImageAttachment[]): Promise<Message> {
    const pool = getPool()

    let contentForDb: string
    if (typeof content === 'string') {
      contentForDb = content
    } else {
      contentForDb = JSON.stringify(content)
    }

    const attachmentsJson = attachments && attachments.length > 0
      ? JSON.stringify(attachments)
      : null

    console.log(`[MessageRepository] Creating/updating message with id: ${id}, role=${role}`)

    const sequence = await this.getNextSequence(sessionId)

    await pool.query(
      `INSERT INTO messages (id, session_id, role, content, sequence, attachments) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), sequence = VALUES(sequence), attachments = VALUES(attachments)`,
      [id, sessionId, role, contentForDb, sequence, attachmentsJson]
    )

    const [rows] = await pool.query(
      'SELECT * FROM messages WHERE id = ?',
      [id]
    ) as [Message[], unknown]

    return this.mapToMessage(rows[0])
  }

  async create(sessionId: string, role: 'user' | 'assistant' | 'system', content: MessageContent, attachments?: ImageAttachment[]): Promise<Message> {
    const id = uuidv4()
    return this.createWithId(id, sessionId, role, content, attachments)
  }

  async findBySessionId(sessionId: string): Promise<Message[]> {
    const pool = getPool()
    // 使用 created_at 字段作为主要排序依据，sequence 作为辅助
    // 这样可以避免回滚后 sequence 不连续导致的顺序错乱问题
    const [rows] = await pool.query(
      `SELECT * FROM messages WHERE session_id = ?
       ORDER BY created_at ASC, sequence ASC`,
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
   * 按主键删除指定会话内的多条消息（用于时间线回滚）
   */
  async deleteByIdsForSession(sessionId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const pool = getPool()
    const placeholders = ids.map(() => '?').join(',')
    await pool.query(
      `DELETE FROM messages WHERE session_id = ? AND id IN (${placeholders})`,
      [sessionId, ...ids],
    )
  }

  /**
   * 更新消息内容
   */
  async updateContent(id: string, content: MessageContent): Promise<void> {
    const pool = getPool()

    let contentForDb: string
    if (typeof content === 'string') {
      contentForDb = content
    } else {
      contentForDb = JSON.stringify(content)
    }

    console.log(`[MessageRepository] Updating message content: id=${id}`)

    await pool.query(
      'UPDATE messages SET content = ? WHERE id = ?',
      [contentForDb, id]
    )
  }

  /**
   * 搜索消息
   * @param userId 用户 ID
   * @param options 搜索选项
   * @param options.keyword 关键词（可选）
   * @param options.sessionId 会话 ID 筛选（可选）
   * @param options.startDate 开始时间（可选）
   * @param options.endDate 结束时间（可选）
   * @param options.limit 返回数量限制（可选，默认 100）
   * @param options.offset 偏移量（可选，默认 0）
   * @returns 搜索到的消息列表，包含所属会话信息
   */
  async searchMessages(
    userId: string,
    options: {
      keyword?: string
      sessionId?: string
      startDate?: string
      endDate?: string
      limit?: number
      offset?: number
    }
  ): Promise<{ message: Message; sessionTitle: string; total: number }[]> {
    const pool = getPool()
    const conditions: string[] = []
    const params: (string | number)[] = []

    // 构建 WHERE 条件
    if (options.keyword) {
      conditions.push('m.content LIKE ?')
      params.push(`%${options.keyword}%`)
    }

    if (options.sessionId) {
      conditions.push('m.session_id = ?')
      params.push(options.sessionId)
    }

    if (options.startDate) {
      conditions.push('m.created_at >= ?')
      params.push(options.startDate)
    }

    if (options.endDate) {
      conditions.push('m.created_at <= ?')
      params.push(options.endDate)
    }

    // 必须通过会话关联到用户
    conditions.push('s.user_id = ?')
    params.push(userId)

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // 查询总数
    const countQuery = `
      SELECT COUNT(DISTINCT m.id) as total
      FROM messages m
      INNER JOIN sessions s ON m.session_id = s.id
      ${whereClause}
    `
    const [countResult] = await pool.query(countQuery, params) as [{ total: number }[], unknown]
    const total = countResult[0]?.total || 0

    // 查询消息
    const limit = options.limit || 100
    const offset = options.offset || 0
    const dataQuery = `
      SELECT m.*, s.title as session_title, s.user_id as session_user_id
      FROM messages m
      INNER JOIN sessions s ON m.session_id = s.id
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `
    const [rows] = await pool.query(dataQuery, [...params, limit, offset]) as [any[], unknown]

    return rows.map(row => ({
      message: this.mapToMessage(row),
      sessionTitle: row.session_title,
      total,
    }))
  }

  private mapToMessage(row: any): Message {
    let content: MessageContent = row.content

    if (typeof content === 'string') {
      try {
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed)) {
          content = parsed as MessageContent
        }
      } catch {
        // 纯文本消息，保持字符串
      }
    } else if (typeof content === 'object' && content !== null) {
      if (Array.isArray(content)) {
        content = content as MessageContent
      } else {
        content = JSON.stringify(content)
      }
    }

    let attachments: ImageAttachment[] | undefined
    if (row.attachments) {
      try {
        const raw = typeof row.attachments === 'string'
          ? JSON.parse(row.attachments)
          : row.attachments
        if (Array.isArray(raw)) {
          attachments = raw
        }
      } catch {
        // 忽略解析错误
      }
    }

    const message: Message = {
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content,
      createdAt: row.created_at,
      sequence: row.sequence,
      attachments,
    }

    return message
  }
}
