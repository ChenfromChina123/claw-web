/**
 * NotebookEdit 工具 - 编辑 Jupyter Notebook
 * 
 * 这个工具用于编辑 Jupyter Notebook 的单元格内容。
 */

import { readFile, writeFile } from 'fs/promises'
import type { Tool } from '../integration/webStore'
import type { ToolResult, ToolExecutionContext } from '../integration/enhancedToolExecutor'

export interface NotebookCell {
  cell_type: 'code' | 'markdown' | 'raw'
  source: string
  metadata?: Record<string, unknown>
  outputs?: unknown[]
  execution_count?: number | null
}

export interface NotebookEditInput {
  path: string
  cell_idx: number
  new_source?: string
  new_cell_type?: 'code' | 'markdown' | 'raw'
  insert_after?: boolean
  delete?: boolean
}

export interface NotebookEditOutput {
  path: string
  cell_idx: number
  action: 'edited' | 'inserted' | 'deleted'
  cell_type?: string
}

/**
 * 验证 NotebookEdit 输入
 */
export function validateNotebookEditInput(input: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['输入必须是对象'] }
  }
  
  const { path, cell_idx } = input as Record<string, unknown>
  
  if (!path || typeof path !== 'string') {
    errors.push('path 是必需参数，且必须是字符串')
  }
  
  if (cell_idx === undefined || cell_idx === null) {
    errors.push('cell_idx 是必需参数')
    return { valid: false, errors }
  }
  
  if (typeof cell_idx !== 'number') {
    errors.push('cell_idx 必须是数字')
  } else if (cell_idx < 0) {
    errors.push('cell_idx 不能为负数')
  }
  
  return { valid: errors.length === 0, errors }
}

/**
 * 加载并解析 Jupyter Notebook
 */
async function loadNotebook(path: string): Promise<{
  nbformat: string
  cells: NotebookCell[]
  metadata: Record<string, unknown>
}> {
  const content = await readFile(path, 'utf-8')
  const notebook = JSON.parse(content)
  
  // 验证基本结构
  if (!notebook.cells || !Array.isArray(notebook.cells)) {
    throw new Error('无效的 Notebook 格式：缺少 cells 数组')
  }
  
  return {
    nbformat: notebook.nbformat || '4.0',
    cells: notebook.cells,
    metadata: notebook.metadata || {},
  }
}

/**
 * 保存 Jupyter Notebook
 */
async function saveNotebook(
  path: string,
  nbformat: string,
  cells: NotebookCell[],
  metadata: Record<string, unknown>
): Promise<void> {
  const notebook = {
    nbformat,
    nbformat_minor: 0,
    metadata,
    cells,
  }
  
  await writeFile(path, JSON.stringify(notebook, null, 2), 'utf-8')
}

/**
 * NotebookEdit 工具实现
 */
export async function executeNotebookEditTool(
  input: NotebookEditInput,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const validation = validateNotebookEditInput(input)
  
  if (!validation.valid) {
    return {
      success: false,
      error: `输入验证失败:\n${validation.errors.join('\n')}`,
    }
  }
  
  const { path, cell_idx, new_source, new_cell_type, insert_after, delete: shouldDelete } = input
  
  try {
    // 解析路径
    const filePath = context.projectRoot 
      ? `${context.projectRoot}/${path}`
      : path
    
    // 加载 Notebook
    const { nbformat, cells, metadata } = await loadNotebook(filePath)
    
    // 检查单元格索引
    if (cell_idx >= cells.length) {
      return {
        success: false,
        error: `单元格索引 ${cell_idx} 超出范围（Notebook 共有 ${cells.length} 个单元格）`,
      }
    }
    
    // 执行操作
    if (shouldDelete) {
      // 删除单元格
      cells.splice(cell_idx, 1)
      await saveNotebook(filePath, nbformat, cells, metadata)
      
      return {
        success: true,
        result: {
          path: filePath,
          cell_idx,
          action: 'deleted',
          message: `已删除第 ${cell_idx + 1} 个单元格`,
        } as NotebookEditOutput,
      }
    }
    
    if (insert_after) {
      // 在指定位置后插入新单元格
      const newCell: NotebookCell = {
        cell_type: new_cell_type || 'code',
        source: new_source || '',
        metadata: {},
        execution_count: null,
      }
      
      cells.splice(cell_idx + 1, 0, newCell)
      await saveNotebook(filePath, nbformat, cells, metadata)
      
      return {
        success: true,
        result: {
          path: filePath,
          cell_idx: cell_idx + 1,
          action: 'inserted',
          cell_type: newCell.cell_type,
          message: `已在第 ${cell_idx + 1} 个单元格后插入新单元格`,
        } as NotebookEditOutput,
      }
    }
    
    // 编辑现有单元格
    if (new_source !== undefined) {
      cells[cell_idx].source = new_source
    }
    
    if (new_cell_type !== undefined) {
      cells[cell_idx].cell_type = new_cell_type
    }
    
    await saveNotebook(filePath, nbformat, cells, metadata)
    
    return {
      success: true,
      result: {
        path: filePath,
        cell_idx,
        action: 'edited',
        cell_type: cells[cell_idx].cell_type,
        message: `已编辑第 ${cell_idx + 1} 个单元格`,
      } as NotebookEditOutput,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        success: false,
        error: `文件不存在: ${path}`,
      }
    }
    
    return {
      success: false,
      error: `Notebook 编辑失败: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * 创建 NotebookEdit 工具定义
 */
export function createNotebookEditToolDefinition(): Tool & { handler: any; permissions?: any } {
  return {
    name: 'NotebookEdit',
    description: '编辑 Jupyter Notebook 的单元格内容',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Notebook 文件路径（.ipynb）',
        },
        cell_idx: {
          type: 'number',
          description: '单元格索引（从 0 开始）',
          minimum: 0,
        },
        new_source: {
          type: 'string',
          description: '新的单元格内容',
        },
        new_cell_type: {
          type: 'string',
          description: '新的单元格类型',
          enum: ['code', 'markdown', 'raw'],
        },
        insert_after: {
          type: 'boolean',
          description: '是否在指定位置后插入新单元格',
          default: false,
        },
        delete: {
          type: 'boolean',
          description: '是否删除指定单元格',
          default: false,
        },
      },
      required: ['path', 'cell_idx'],
    },
    category: 'file',
    permissions: { dangerous: true },
    handler: executeNotebookEditTool,
  }
}
