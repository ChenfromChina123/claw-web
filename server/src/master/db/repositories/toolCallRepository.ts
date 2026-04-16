import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'
import type { ToolCall } from '../../models/types'

export class ToolCallRepository {
  /**
   * 创建工具调用（使用指定ID）
   * 使用 UPSERT 避免重复插入错误
   */
  async createWithId(
    id: string,
    messageId: string,
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    status: 'pending' | 'executing' | 'completed' | 'error' = 'pending',
    toolOutput?: Record<string, unknown>
  ): Promise<ToolCall> {
    const pool = getPool()

    // 使用 INSERT ... ON DUPLICATE KEY UPDATE 避免重复插入错误
    await pool.query(
      `INSERT INTO tool_calls (id, message_id, session_id, tool_name, tool_input, status, tool_output) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE tool_input = VALUES(tool_input), status = VALUES(status), tool_output = VALUES(tool_output)`,
      [id, messageId, sessionId, toolName, JSON.stringify(toolInput), status, toolOutput ? JSON.stringify(toolOutput) : null]
    )

    const [rows] = await pool.query(
      'SELECT * FROM tool_calls WHERE id = ?',
      [id]
    ) as [ToolCall[], unknown]

    return this.mapToToolCall(rows[0])
  }

  async create(
    messageId: string,
    sessionId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    status: 'pending' | 'executing' | 'completed' | 'error' = 'pending'
  ): Promise<ToolCall> {
    const id = uuidv4()
    return this.createWithId(id, messageId, sessionId, toolName, toolInput, status)
  }

  async findByMessageId(messageId: string): Promise<ToolCall[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM tool_calls WHERE message_id = ? ORDER BY created_at ASC',
      [messageId]
    ) as [ToolCall[], unknown]

    return rows.map(row => this.mapToToolCall(row))
  }

  async findBySessionId(sessionId: string): Promise<ToolCall[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM tool_calls WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId]
    ) as [ToolCall[], unknown]

    return rows.map(row => this.mapToToolCall(row))
  }

  async updateOutput(id: string, toolOutput: Record<string, unknown>, status: 'pending' | 'executing' | 'completed' | 'error'): Promise<void> {
    const pool = getPool()
    await pool.query(
      'UPDATE tool_calls SET tool_output = ?, status = ? WHERE id = ?',
      [JSON.stringify(toolOutput), status, id]
    )
  }

  async delete(id: string): Promise<void> {
    const pool = getPool()
    await pool.query('DELETE FROM tool_calls WHERE id = ?', [id])
  }

  async deleteBySessionId(sessionId: string): Promise<void> {
    const pool = getPool()
    await pool.query('DELETE FROM tool_calls WHERE session_id = ?', [sessionId])
  }

  /** 删除挂在已移除助手消息上的工具调用记录 */
  async deleteByMessageIds(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return
    const pool = getPool()
    const placeholders = messageIds.map(() => '?').join(',')
    await pool.query(`DELETE FROM tool_calls WHERE message_id IN (${placeholders})`, messageIds)
  }

  private mapToToolCall(row: any): ToolCall {
    return {
      id: row.id,
      messageId: row.message_id,
      sessionId: row.session_id,
      toolName: row.tool_name,
      toolInput: typeof row.tool_input === 'string' ? JSON.parse(row.tool_input) : row.tool_input || {},
      toolOutput: typeof row.tool_output === 'string' ? JSON.parse(row.tool_output) : row.tool_output || null,
      status: row.status,
      createdAt: row.created_at,
    }
  }
}
