import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'
import type { Session } from '../../models/types'
import type { Pool } from 'mysql2/promise'

export class SessionRepository {
  /**
   * 查找或创建空会话（原子操作）
   * 使用数据库事务确保在高并发场景下不会创建多个空会话
   * 优先使用 is_empty 字段，fallback 到 LEFT JOIN 查询
   * 
   * @param userId 用户ID
   * @param title 会话标题
   * @param model 使用的模型
   * @returns 存在的空会话或新创建的会话
   */
  async findOrCreateEmptySession(userId: string, title: string = '新对话', model: string = 'qwen-plus'): Promise<Session> {
    const pool = getPool() as Pool
    const connection = await pool.getConnection()
    
    try {
      await connection.beginTransaction()
      
      // 1. 先查找是否已有空会话（FOR UPDATE 锁防止并发插入）
      // 优先使用 is_empty 字段（更快）
      let rows: any[] = []
      try {
        const [result] = await connection.query(
          `SELECT * FROM sessions 
           WHERE user_id = ? AND is_empty = TRUE 
           ORDER BY updated_at DESC 
           LIMIT 1
           FOR UPDATE`,
          [userId]
        )
        rows = result as any[]
      } catch (error) {
        // 如果 is_empty 字段不存在，fallback 到 LEFT JOIN 查询
        console.warn('[SessionRepo] findOrCreateEmptySession: is_empty 字段不存在，使用 LEFT JOIN')
        const [result] = await connection.query(
          `SELECT s.* FROM sessions s 
           LEFT JOIN messages m ON s.id = m.session_id 
           WHERE s.user_id = ? AND m.id IS NULL 
           ORDER BY s.updated_at DESC 
           LIMIT 1
           FOR UPDATE`,
          [userId]
        )
        rows = result as any[]
      }

      if (rows.length > 0) {
        // 找到空会话，提交事务并返回
        await connection.commit()
        console.log(`[SessionRepo] findOrCreateEmptySession: 找到已有空会话 ${rows[0].id}`)
        return this.mapToSession(rows[0])
      }

      // 2. 没有空会话，创建新的
      const id = uuidv4()
      await connection.query(
        'INSERT INTO sessions (id, user_id, title, model, is_empty) VALUES (?, ?, ?, ?, TRUE)',
        [id, userId, title, model]
      )

      // 3. 获取新创建的会话
      const [newRows] = await connection.query(
        'SELECT * FROM sessions WHERE id = ?',
        [id]
      ) as [Session[], unknown]

      await connection.commit()
      console.log(`[SessionRepo] findOrCreateEmptySession: 创建新会话 ${id}`)
      return this.mapToSession(newRows[0])
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  async create(userId: string, title: string = '新对话', model: string = 'qwen-plus'): Promise<Session> {
    const pool = getPool() as Pool
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
    // 联表查询最后一条消息的预览内容（取前100个字符）
    const [rows] = await pool.query(
      `SELECT s.*, 
        SUBSTRING(m.content, 1, 100) as last_message
       FROM sessions s
       LEFT JOIN (
         SELECT session_id, content
         FROM messages
         WHERE role = 'assistant'
         AND (session_id, created_at) IN (
           SELECT session_id, MAX(created_at)
           FROM messages
           WHERE role = 'assistant'
           GROUP BY session_id
         )
       ) m ON s.id = m.session_id
       WHERE s.user_id = ? 
       ORDER BY s.updated_at DESC`,
      [userId]
    ) as [any[], unknown]
    console.log(`[SessionRepo] findByUserId: found ${rows.length} sessions for user ${userId}`)

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
    const isPinnedValue = session.isPinned ? 1 : 0
    await pool.query(
      'UPDATE sessions SET title = ?, model = ?, is_pinned = ? WHERE id = ?',
      [session.title, session.model, isPinnedValue, session.id]
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
   * 优先使用 is_empty 字段（更快），fallback 到 LEFT JOIN 查询
   * @param userId 用户 ID
   * @returns 返回最新的空会话，如果没有则返回 null
   */
  async findEmptySessionByUserId(userId: string): Promise<Session | null> {
    const pool = getPool() as Pool
    
    // 尝试使用 is_empty 字段（更快，有索引）
    try {
      const [rows] = await pool.query(
        `SELECT * FROM sessions 
         WHERE user_id = ? AND is_empty = TRUE 
         ORDER BY updated_at DESC 
         LIMIT 1`,
        [userId]
      ) as [Session[], unknown]

      if (rows.length > 0) {
        return this.mapToSession(rows[0])
      }
    } catch (error) {
      // 如果 is_empty 字段不存在，fallback 到 LEFT JOIN 查询
      console.warn('[SessionRepo] is_empty 字段不存在，使用 LEFT JOIN 查询')
    }

    // Fallback: 使用 LEFT JOIN 查询（兼容旧数据）
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

  /**
   * 标记会话已有消息（非空）
   * 在添加第一条用户消息时调用
   * @param sessionId 会话 ID
   */
  async markAsNonEmpty(sessionId: string): Promise<void> {
    const pool = getPool() as Pool
    try {
      await pool.query(
        'UPDATE sessions SET is_empty = FALSE WHERE id = ?',
        [sessionId]
      )
    } catch (error) {
      // 如果 is_empty 字段不存在，静默忽略
      console.warn('[SessionRepo] 标记会话非空失败（is_empty 字段可能不存在）:', error)
    }
  }

  private mapToSession(row: any): Session {
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      model: row.model,
      // 数据库中 is_pinned 是 INTEGER (0/1)，需要转换为布尔值
      // 使用 Boolean() 构造函数确保严格转换为布尔类型，避免返回数字
      isPinned: Boolean(row.is_pinned),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessage: row.last_message || undefined,
      isRunning: Boolean(row.is_running),
    }
  }
}
