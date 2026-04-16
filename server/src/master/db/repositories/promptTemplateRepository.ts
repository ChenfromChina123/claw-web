import { v4 as uuidv4 } from 'uuid'
import { getPool } from '../mysql'

export interface PromptTemplate {
  id: string
  userId: string | null
  categoryId: string | null
  title: string
  content: string
  description: string | null
  isBuiltin: boolean
  isFavorite: boolean
  useCount: number
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

export interface PromptTemplateCategory {
  id: string
  name: string
  icon: string
  sortOrder: number
  createdAt: Date
}

export class PromptTemplateRepository {
  async createCategory(name: string, icon: string = 'folder', sortOrder: number = 0): Promise<PromptTemplateCategory> {
    const pool = getPool()
    const id = uuidv4()

    await pool.query(
      'INSERT INTO prompt_template_categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
      [id, name, icon, sortOrder]
    )

    const [rows] = await pool.query(
      'SELECT * FROM prompt_template_categories WHERE id = ?',
      [id]
    ) as [any[], unknown]

    return this.mapToCategory(rows[0])
  }

  async getAllCategories(): Promise<PromptTemplateCategory[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM prompt_template_categories ORDER BY sort_order ASC'
    ) as [any[], unknown]

    return rows.map((row: any) => this.mapToCategory(row))
  }

  async updateCategory(id: string, name: string, icon?: string, sortOrder?: number): Promise<void> {
    const pool = getPool()
    const updates: string[] = ['name = ?']
    const params: any[] = [name]

    if (icon !== undefined) {
      updates.push('icon = ?')
      params.push(icon)
    }
    if (sortOrder !== undefined) {
      updates.push('sort_order = ?')
      params.push(sortOrder)
    }

    params.push(id)
    await pool.query(
      `UPDATE prompt_template_categories SET ${updates.join(', ')} WHERE id = ?`,
      params
    )
  }

  async deleteCategory(id: string): Promise<void> {
    const pool = getPool()
    await pool.query('DELETE FROM prompt_template_categories WHERE id = ?', [id])
  }

  async create(data: {
    userId?: string
    categoryId?: string
    title: string
    content: string
    description?: string
    isBuiltin?: boolean
    tags?: string[]
  }): Promise<PromptTemplate> {
    const pool = getPool()
    const id = uuidv4()

    await pool.query(
      `INSERT INTO prompt_templates 
       (id, user_id, category_id, title, content, description, is_builtin, tags) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.userId || null,
        data.categoryId || null,
        data.title,
        data.content,
        data.description || null,
        data.isBuiltin || false,
        data.tags ? JSON.stringify(data.tags) : null
      ]
    )

    const [rows] = await pool.query(
      'SELECT * FROM prompt_templates WHERE id = ?',
      [id]
    ) as [any[], unknown]

    return this.mapToTemplate(rows[0])
  }

  async findById(id: string): Promise<PromptTemplate | null> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM prompt_templates WHERE id = ?',
      [id]
    ) as [any[], unknown]

    if (rows.length === 0) return null
    return this.mapToTemplate(rows[0])
  }

  async findByUserId(userId: string): Promise<PromptTemplate[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM prompt_templates WHERE user_id = ? OR is_builtin = TRUE ORDER BY created_at DESC',
      [userId]
    ) as [any[], unknown]

    return rows.map((row: any) => this.mapToTemplate(row))
  }

  async findByCategoryId(categoryId: string): Promise<PromptTemplate[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM prompt_templates WHERE category_id = ? OR is_builtin = TRUE ORDER BY use_count DESC',
      [categoryId]
    ) as [any[], unknown]

    return rows.map((row: any) => this.mapToTemplate(row))
  }

  async findFavorites(userId: string): Promise<PromptTemplate[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM prompt_templates WHERE user_id = ? AND is_favorite = TRUE ORDER BY updated_at DESC',
      [userId]
    ) as [any[], unknown]

    return rows.map((row: any) => this.mapToTemplate(row))
  }

  async searchTemplates(userId: string, keyword: string): Promise<PromptTemplate[]> {
    const pool = getPool()
    const searchPattern = `%${keyword}%`
    const [rows] = await pool.query(
      `SELECT * FROM prompt_templates 
       WHERE (user_id = ? OR is_builtin = TRUE) 
       AND (title LIKE ? OR description LIKE ? OR content LIKE ? OR tags LIKE ?)
       ORDER BY use_count DESC`,
      [userId, searchPattern, searchPattern, searchPattern, searchPattern]
    ) as [any[], unknown]

    return rows.map((row: any) => this.mapToTemplate(row))
  }

  async getBuiltins(): Promise<PromptTemplate[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM prompt_templates WHERE is_builtin = TRUE ORDER BY use_count DESC'
    ) as [any[], unknown]

    return rows.map((row: any) => this.mapToTemplate(row))
  }

  async update(id: string, data: {
    title?: string
    content?: string
    description?: string
    categoryId?: string
    tags?: string[]
    isFavorite?: boolean
  }): Promise<void> {
    const pool = getPool()
    const updates: string[] = []
    const params: any[] = []

    if (data.title !== undefined) {
      updates.push('title = ?')
      params.push(data.title)
    }
    if (data.content !== undefined) {
      updates.push('content = ?')
      params.push(data.content)
    }
    if (data.description !== undefined) {
      updates.push('description = ?')
      params.push(data.description)
    }
    if (data.categoryId !== undefined) {
      updates.push('category_id = ?')
      params.push(data.categoryId)
    }
    if (data.tags !== undefined) {
      updates.push('tags = ?')
      params.push(JSON.stringify(data.tags))
    }
    if (data.isFavorite !== undefined) {
      updates.push('is_favorite = ?')
      params.push(data.isFavorite)
    }

    if (updates.length === 0) return

    params.push(id)
    await pool.query(
      `UPDATE prompt_templates SET ${updates.join(', ')} WHERE id = ?`,
      params
    )
  }

  async toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
    const pool = getPool()
    await pool.query(
      'UPDATE prompt_templates SET is_favorite = ? WHERE id = ?',
      [isFavorite, id]
    )
  }

  async incrementUseCount(id: string): Promise<void> {
    const pool = getPool()
    await pool.query(
      'UPDATE prompt_templates SET use_count = use_count + 1 WHERE id = ?',
      [id]
    )
  }

  async delete(id: string): Promise<void> {
    const pool = getPool()
    await pool.query('DELETE FROM prompt_templates WHERE id = ? AND is_builtin = FALSE', [id])
  }

  async getAllForUser(userId: string): Promise<PromptTemplate[]> {
    const pool = getPool()
    const [rows] = await pool.query(
      'SELECT * FROM prompt_templates WHERE user_id = ? OR is_builtin = TRUE ORDER BY category_id, use_count DESC',
      [userId]
    ) as [any[], unknown]

    return rows.map((row: any) => this.mapToTemplate(row))
  }

  private mapToTemplate(row: any): PromptTemplate {
    let tags: string[] = []
    if (row.tags) {
      try {
        tags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags
      } catch {
        tags = []
      }
    }

    return {
      id: row.id,
      userId: row.user_id,
      categoryId: row.category_id,
      title: row.title,
      content: row.content,
      description: row.description,
      isBuiltin: Boolean(row.is_builtin),
      isFavorite: Boolean(row.is_favorite),
      useCount: row.use_count || 0,
      tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  private mapToCategory(row: any): PromptTemplateCategory {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sort_order,
      createdAt: row.created_at
    }
  }
}

export const promptTemplateRepository = new PromptTemplateRepository()
