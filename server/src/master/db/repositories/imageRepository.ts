/**
 * 图片元数据仓库 - chat_images 表的 CRUD 操作
 */

import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'
import type { ChatImage } from '../../models/imageTypes'

export class ImageRepository {
  /**
   * 创建图片记录
   */
  async create(params: {
    userId: string
    sessionId?: string
    messageId?: string
    filename: string
    originalName?: string
    mimeType: string
    size: number
    width?: number
    height?: number
    storagePath: string
    llmReadyPath?: string
  }): Promise<ChatImage> {
    const pool = getPool()
    const id = uuidv4()

    await pool.query(
      `INSERT INTO chat_images (id, user_id, session_id, message_id, filename, original_name, mime_type, size, width, height, storage_path, llm_ready_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, params.userId, params.sessionId || null, params.messageId || null,
        params.filename, params.originalName || null, params.mimeType,
        params.size, params.width || null, params.height || null,
        params.storagePath, params.llmReadyPath || null,
      ]
    )

    return this.findById(id) as Promise<ChatImage>
  }

  /**
   * 根据 ID 查找图片
   */
  async findById(id: string): Promise<ChatImage | null> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM chat_images WHERE id = ?',
      [id]
    ) as [any[], unknown]

    if (rows.length === 0) return null
    return this.mapToChatImage(rows[0])
  }

  /**
   * 根据会话 ID 查找图片列表
   */
  async findBySessionId(sessionId: string): Promise<ChatImage[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM chat_images WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    ) as [any[], unknown]

    return rows.map((row: any) => this.mapToChatImage(row))
  }

  /**
   * 更新图片关联的消息 ID
   */
  async updateMessageId(imageId: string, messageId: string): Promise<void> {
    const pool = getPool()
    await pool.query(
      'UPDATE chat_images SET message_id = ? WHERE id = ?',
      [messageId, imageId]
    )
  }

  /**
   * 更新图片的分析文本缓存
   */
  async updateAnalysisText(imageId: string, analysisText: string): Promise<void> {
    const pool = getPool()
    await pool.query(
      'UPDATE chat_images SET analysis_text = ? WHERE id = ?',
      [analysisText, imageId]
    )
  }

  /**
   * 删除图片记录
   */
  async delete(id: string): Promise<void> {
    const pool = getPool()
    await pool.query('DELETE FROM chat_images WHERE id = ?', [id])
  }

  /**
   * 删除会话关联的所有图片记录
   */
  async deleteBySessionId(sessionId: string): Promise<void> {
    const pool = getPool()
    await pool.query('DELETE FROM chat_images WHERE session_id = ?', [sessionId])
  }

  /**
   * 根据用户 ID 查找图片列表
   */
  async findByUserId(userId: string): Promise<ChatImage[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM chat_images WHERE user_id = ? ORDER BY created_at ASC',
      [userId]
    ) as [any[], unknown]

    return rows.map((row: any) => this.mapToChatImage(row))
  }

  /**
   * 删除用户关联的所有图片记录
   */
  async deleteByUserId(userId: string): Promise<void> {
    const pool = getPool()
    await pool.query('DELETE FROM chat_images WHERE user_id = ?', [userId])
  }

  /**
   * 查找孤立图片（无 session 关联且超过指定天数）
   */
  async findOrphanImages(olderThanDays: number = 30): Promise<ChatImage[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM chat_images WHERE session_id IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [olderThanDays]
    ) as [any[], unknown]

    return rows.map((row: any) => this.mapToChatImage(row))
  }

  /**
   * 映射数据库行到 ChatImage 对象
   */
  private mapToChatImage(row: any): ChatImage {
    return {
      id: row.id,
      userId: row.user_id,
      sessionId: row.session_id,
      messageId: row.message_id,
      filename: row.filename,
      originalName: row.original_name,
      mimeType: row.mime_type,
      size: row.size,
      width: row.width,
      height: row.height,
      storagePath: row.storage_path,
      llmReadyPath: row.llm_ready_path,
      analysisText: row.analysis_text,
      createdAt: row.created_at,
    }
  }
}
