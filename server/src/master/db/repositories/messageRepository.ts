import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'
import type { Message } from '../../models/types'

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
  async createWithId(id: string, sessionId: string, role: 'user' | 'assistant' | 'system', content: string | any[]): Promise<Message> {
    const pool = getPool()

    let contentStr: string
    if (typeof content === 'string') {
      contentStr = content
    } else {
      contentStr = JSON.stringify(content)
    }

    console.log(`[MessageRepository] Creating/updating message with id: ${id}, role=${role}`)

    // 获取下一个序号
    const sequence = await this.getNextSequence(sessionId)

    // 使用 INSERT ... ON DUPLICATE KEY UPDATE 避免重复插入错误
    await pool.query(
      `INSERT INTO messages (id, session_id, role, content, sequence) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), sequence = VALUES(sequence)`,
      [id, sessionId, role, contentStr, sequence]
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
    let content = row.content

    console.log(`[MessageRepository] Mapping message: id=${row.id}, role=${row.role}, content type=${typeof content}`)

    // 确保 content 始终是字符串返回给客户端
    // 如果 content 是数组或对象，转换为 JSON 字符串
    if (typeof content === 'object' && content !== null) {
      content = JSON.stringify(content)
      console.log(`[MessageRepository] Converted object content to string`)
    }

    const message: Message = {
      id: row.id,
      sessionId: row.session_id,
      role: row.role,
      content: content,
      createdAt: row.created_at,
      sequence: row.sequence,
    }

    console.log(`[MessageRepository] Mapped message:`, message)

    return message
  }
}
