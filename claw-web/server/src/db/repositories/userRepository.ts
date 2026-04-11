import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'
import type { User } from '../../models/types'

export class UserRepository {
  async create(username: string): Promise<User> {
    const pool = getPool()
    const id = uuidv4()

    await pool.query(
      'INSERT INTO users (id, username) VALUES (?, ?)',
      [id, username]
    )

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [id]
    ) as [User[], unknown]

    return this.mapToUser(rows[0])
  }

  async findById(id: string): Promise<User | null> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [id]
    ) as [User[], unknown]

    if (rows.length === 0) return null
    return this.mapToUser(rows[0])
  }

  async findByUsername(username: string): Promise<User | null> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    ) as [User[], unknown]

    if (rows.length === 0) return null
    return this.mapToUser(rows[0])
  }

  async findOrCreate(username: string): Promise<User> {
    const existing = await this.findByUsername(username)
    if (existing) return existing
    return this.create(username)
  }

  private mapToUser(row: any): User {
    return {
      id: row.id,
      username: row.username,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
