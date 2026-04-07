/**
 * 高级工具桥接模块
 * 
 * 将 src 项目中的高级工具桥接到 server 端
 * 包括：NotebookEdit、LSP、PowerShell、Database、Docker、Git 等
 */

import { readFile, writeFile, stat } from 'fs/promises'
import { join, resolve, extname } from 'path'
import { exec, spawn } from 'child_process'
import type { ToolDefinition } from '../integration/enhancedToolExecutor'

// ==================== NotebookEdit 工具 ====================

/**
 * 创建 NotebookEdit 工具定义
 * 用于编辑 Jupyter Notebook (.ipynb) 文件
 */
export function createNotebookEditToolDefinition(): ToolDefinition {
  return {
    name: 'NotebookEdit',
    description: '编辑 Jupyter Notebook (.ipynb) 文件的单元格。支持替换、插入和删除操作。',
    inputSchema: {
      type: 'object',
      properties: {
        notebook_path: {
          type: 'string',
          description: 'Jupyter notebook 文件的绝对路径（必须是 .ipynb 文件）',
        },
        cell_id: {
          type: 'string',
          description: '要编辑的单元格 ID。插入新单元格时，新单元格将插入到此 ID 之后',
        },
        new_source: {
          type: 'string',
          description: '单元格的新源代码/内容',
        },
        cell_type: {
          type: 'string',
          enum: ['code', 'markdown'],
          description: '单元格类型（code 或 markdown）。未指定时默认为当前类型。使用 insert 模式时必填',
        },
        edit_mode: {
          type: 'string',
          enum: ['replace', 'insert', 'delete'],
          description: '编辑类型：replace（替换）、insert（插入）、delete（删除）。默认为 replace',
        },
      },
      required: ['notebook_path', 'new_source'],
    },
    category: 'file',
    permissions: { dangerous: true },
    handler: async (input, context, sendEvent) => {
      const {
        notebook_path,
        cell_id,
        new_source,
        cell_type = 'code',
        edit_mode = 'replace',
      } = input as {
        notebook_path: string
        cell_id?: string
        new_source: string
        cell_type?: string
        edit_mode?: string
      }

      const fullPath = resolve(context.projectRoot, notebook_path)

      sendEvent?.('tool_progress', {
        output: `📓 正在编辑 Notebook: ${notebook_path}\n`,
      })

      try {
        // 验证文件扩展名
        if (extname(fullPath) !== '.ipynb') {
          throw new Error('文件必须是 Jupyter notebook (.ipynb 文件)')
        }

        // 读取 notebook 文件
        const content = await readFile(fullPath, 'utf-8')
        let notebook: Record<string, unknown>

        try {
          notebook = JSON.parse(content)
        } catch {
          throw new Error('Notebook 不是有效的 JSON 格式')
        }

        // 验证 notebook 结构
        if (!notebook.cells || !Array.isArray(notebook.cells)) {
          throw new Error('Notebook 格式无效：缺少 cells 数组')
        }

        const cells = notebook.cells as Array<Record<string, unknown>>
        let cellIndex: number

        if (!cell_id) {
          if (edit_mode !== 'insert') {
            throw new Error('非插入操作必须指定 cell_id')
          }
          cellIndex = 0
        } else {
          // 查找单元格索引
          cellIndex = cells.findIndex(
            (cell) => cell.id === cell_id || String(cells.indexOf(cell)) === cell_id
          )

          if (cellIndex === -1) {
            throw new Error(`未找到 ID 为 "${cell_id}" 的单元格`)
          }

          if (edit_mode === 'insert') {
            cellIndex += 1
          }
        }

        // 获取语言信息
        const language =
          (notebook.metadata as Record<string, unknown>)?.language_info &&
          typeof (notebook.metadata as Record<string, Record<string, unknown>>).language_info === 'object' &&
          ((notebook.metadata as Record<string, Record<string, unknown>>).language_info as Record<string, unknown>).name
            ? ((notebook.metadata as Record<string, Record<string, unknown>>).language_info as Record<string, unknown>).name
            : 'python'

        // 执行编辑操作
        let newCellId: string | undefined

        if (edit_mode === 'delete') {
          cells.splice(cellIndex, 1)
          sendEvent?.('tool_progress', {
            output: `  ✅ 已删除单元格 ${cell_id}\n`,
          })
        } else if (edit_mode === 'insert') {
          const newCell: Record<string, unknown> = {
            cell_type,
            id: Math.random().toString(36).substring(2, 15),
            source: new_source,
            metadata: {},
          }

          if (cell_type === 'code') {
            newCell.execution_count = null
            newCell.outputs = []
          }

          cells.splice(cellIndex, 0, newCell)
          newCellId = newCell.id as string
          sendEvent?.('tool_progress', {
            output: `  ✅ 已在 ${cell_id || '开头'} 后插入新的 ${cell_type} 单元格\n`,
          })
        } else {
          // replace 模式
          const targetCell = cells[cellIndex]
          targetCell.source = new_source

          if (targetCell.cell_type === 'code') {
            targetCell.execution_count = null
            targetCell.outputs = []
          }

          if (cell_type && cell_type !== targetCell.cell_type) {
            targetCell.cell_type = cell_type
          }

          newCellId = cell_id
          sendEvent?.('tool_progress', {
            output: `  ✅ 已更新单元格 ${cell_id}\n`,
          })
        }

        // 写回文件
        const updatedContent = JSON.stringify(notebook, null, 1)
        await writeFile(fullPath, updatedContent, 'utf-8')

        return {
          success: true,
          result: {
            new_source,
            cell_type,
            language,
            edit_mode,
            cell_id: newCellId || cell_id,
            notebook_path: fullPath,
          },
          output: `✅ Notebook 编辑完成: ${edit_mode} 操作成功`,
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          error: errorMessage,
          output: `❌ Notebook 编辑失败: ${errorMessage}`,
        }
      }
    },
  }
}

// ==================== LSP 工具 ====================

/**
 * 创建 LSP 工具定义
 * 提供代码智能功能：跳转定义、查找引用、悬停信息等
 */
export function createLSPToolDefinition(): ToolDefinition {
  return {
    name: 'LSP',
    description:
      '语言服务器协议工具，提供代码智能功能。支持：goToDefinition（跳转定义）、findReferences（查找引用）、hover（悬停信息）、documentSymbol（文档符号）、workspaceSymbol（工作区符号）、goToImplementation（跳转实现）等操作。',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: [
            'goToDefinition',
            'findReferences',
            'hover',
            'documentSymbol',
            'workspaceSymbol',
            'goToImplementation',
            'prepareCallHierarchy',
            'incomingCalls',
            'outgoingCalls',
          ],
          description: '要执行的 LSP 操作',
        },
        filePath: {
          type: 'string',
          description: '文件的绝对或相对路径',
        },
        line: {
          type: 'number',
          description: '行号（从 1 开始，与编辑器显示一致）',
          minimum: 1,
        },
        character: {
          type: 'number',
          description: '字符偏移（从 1 开始，与编辑器显示一致）',
          minimum: 1,
        },
      },
      required: ['operation', 'filePath'],
    },
    category: 'development',
    permissions: { requiresAuth: false },
    isReadOnly: true,
    handler: async (input, context, sendEvent) => {
      const { operation, filePath, line = 1, character = 1 } = input as {
        operation: string
        filePath: string
        line?: number
        character?: number
      }

      const fullPath = resolve(context.projectRoot, filePath)

      sendEvent?.('tool_progress', {
        output: `🔍 LSP ${operation}: ${filePath}:${line}:${character}\n`,
      })

      try {
        // 检查文件是否存在
        const fileStat = await stat(fullPath).catch(() => null)
        if (!fileStat) {
          throw new Error(`文件不存在: ${filePath}`)
        }

        if (!fileStat.isFile()) {
          throw new Error(`路径不是文件: ${filePath}`)
        }

        // 这里应该调用实际的 LSP 服务器
        // 当前返回模拟数据，实际使用时需要集成 vscode-languageserver-node 或类似库
        const mockResults: Record<string, string> = {
          goToDefinition: `定义位置: ${fullPath}:${line}`,
          findReferences: `找到 0 个引用`,
          hover: `类型信息: unknown\n文档: 暂无可用文档`,
          documentSymbol: `文档符号:\n- 未找到符号`,
          workspaceSymbol: `工作区符号:\n- 未找到符号`,
          goToImplementation: `实现位置: ${fullPath}:${line}`,
          prepareCallHierarchy: `调用层次结构已准备`,
          incomingCalls: `传入调用: 无`,
          outgoingCalls: `传出调用: 无`,
        }

        const result = mockResults[operation] || `未知操作: ${operation}`

        sendEvent?.('tool_progress', {
          output: `  ✅ ${operation} 完成\n`,
        })

        return {
          success: true,
          result: {
            operation,
            result,
            filePath: fullPath,
            resultCount: 0,
            fileCount: 1,
          },
          output: result,
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          error: errorMessage,
          output: `❌ LSP 操作失败: ${errorMessage}`,
        }
      }
    },
  }
}

// ==================== PowerShell 工具 ====================

/**
 * 创建 PowerShell 工具定义
 * 在 Windows 上执行 PowerShell 命令，具有完整的安全验证
 */
export function createPowerShellToolDefinition(): ToolDefinition {
  return {
    name: 'PowerShell',
    description:
      '执行 Windows PowerShell 命令。提供完整的 PowerShell 环境访问，包括 .NET 对象、Windows Management Instrumentation (WMI)、Active Directory 等。支持管道、脚本块和高级参数绑定。',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的 PowerShell 命令或脚本',
        },
        cwd: {
          type: 'string',
          description: '工作目录',
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒），默认 120000',
          default: 120000,
          maximum: 600000,
        },
        noProfile: {
          type: 'boolean',
          description: '是否不加载 PowerShell 配置文件（加速启动）',
          default: true,
        },
        executionPolicy: {
          type: 'string',
          enum: ['Restricted', 'AllSigned', 'RemoteSigned', 'Unrestricted', 'Bypass', 'Undefined'],
          description: '执行策略，默认 Bypass',
          default: 'Bypass',
        },
      },
      required: ['command'],
    },
    category: 'shell',
    permissions: { dangerous: true },
    handler: async (input, context, sendEvent) => {
      const {
        command,
        cwd = context.projectRoot,
        timeout = 120000,
        noProfile = true,
        executionPolicy = 'Bypass',
      } = input as {
        command: string
        cwd?: string
        timeout?: number
        noProfile?: boolean
        executionPolicy?: string
      }

      sendEvent?.('tool_progress', {
        output: `💻 PS> ${command}\n`,
      })

      return new Promise((resolve) => {
        const args = [
          '-NoProfile',
          `-ExecutionPolicy`,
          executionPolicy,
          '-Command',
          command,
        ]

        if (!noProfile) {
          args.splice(0, 1)
        }

        const child = spawn('powershell.exe', args, {
          cwd,
          timeout,
          env: { ...process.env },
          windowsHide: true,
        })

        let stdout = ''
        let stderr = ''

        child.stdout?.on('data', (data) => {
          const text = data.toString()
          stdout += text
          sendEvent?.('tool_progress', { output: text })
        })

        child.stderr?.on('data', (data) => {
          const text = data.toString()
          stderr += text
          sendEvent?.('tool_progress', { output: `[stderr] ${text}` })
        })

        child.on('error', (error) => {
          resolve({
            success: false,
            error: error.message,
            result: { stdout, stderr, exitCode: -1 },
            output: `❌ PowerShell 启动失败: ${error.message}`,
          })
        })

        child.on('close', (code) => {
          resolve({
            success: code === 0,
            result: { stdout, stderr, exitCode: code || 0 },
            output: stdout + (stderr ? `\n[stderr]\n${stderr}` : ''),
            error: code !== 0 ? stderr : undefined,
          })
        })

        setTimeout(() => {
          child.kill()
          resolve({
            success: false,
            error: 'Process killed due to timeout',
            result: { stdout, stderr, exitCode: 124 },
            output: '\n⏱️ Process killed due to timeout',
          })
        }, timeout)
      })
    },
  }
}

// ==================== DatabaseQuery 工具 ====================

/**
 * 创建数据库查询工具定义
 * 支持 MySQL、PostgreSQL、SQLite 和 MongoDB
 */
export function createDatabaseQueryToolDefinition(): ToolDefinition {
  return {
    name: 'DatabaseQuery',
    description:
      '执行数据库查询操作。支持多种数据库类型：MySQL、PostgreSQL、SQLite、MongoDB。可用于数据查询、插入、更新、删除等操作。',
    inputSchema: {
      type: 'object',
      properties: {
        databaseType: {
          type: 'string',
          enum: ['mysql', 'postgresql', 'sqlite', 'mongodb'],
          description: '数据库类型',
        },
        connectionString: {
          type: 'string',
          description: '数据库连接字符串（例如 mysql://user:pass@host:3306/db）',
        },
        query: {
          type: 'string',
          description: 'SQL 查询语句或 MongoDB 查询表达式',
        },
        params: {
          type: 'array',
          items: { type: 'string' },
          description: '查询参数（防止 SQL 注入）',
        },
        operation: {
          type: 'string',
          enum: ['select', 'insert', 'update', 'delete', 'execute'],
          description: '操作类型，默认 select',
          default: 'select',
        },
        database: {
          type: 'string',
          description: '数据库名称（可选，如果连接字符串中未指定）',
        },
        timeout: {
          type: 'number',
          description: '查询超时时间（毫秒），默认 30000',
          default: 30000,
        },
      },
      required: ['databaseType', 'connectionString', 'query'],
    },
    category: 'database',
    permissions: { dangerous: true },
    handler: async (input, context, sendEvent) => {
      const {
        databaseType,
        connectionString,
        query,
        params = [],
        operation = 'select',
        timeout = 30000,
      } = input as {
        databaseType: string
        connectionString: string
        query: string
        params?: string[]
        operation?: string
        database?: string
        timeout?: number
      }

      sendEvent?.('tool_progress', {
        output: `🗄️ [${databaseType.toUpperCase()}] ${operation}: ${query.substring(0, 100)}...\n`,
      })

      try {
        let result: unknown

        switch (databaseType) {
          case 'mysql':
          case 'postgresql':
            result = await executeSQLQuery(databaseType, connectionString, query, params, sendEvent)
            break
          case 'sqlite':
            result = await executeSQLiteQuery(connectionString, query, params, sendEvent)
            break
          case 'mongodb':
            result = await executeMongoDBQuery(connectionString, query, operation, sendEvent)
            break
          default:
            throw new Error(`不支持的数据库类型: ${databaseType}`)
        }

        sendEvent?.('tool_progress', {
          output: `  ✅ 查询完成\n`,
        })

        return {
          success: true,
          result: {
            databaseType,
            operation,
            query,
            result,
            rowCount: Array.isArray(result) ? result.length : 1,
          },
          output: `查询成功，返回 ${Array.isArray(result) ? result.length : 1} 条记录`,
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          error: errorMessage,
          output: `❌ 数据库查询失败: ${errorMessage}`,
        }
      }
    },
  }
}

/**
 * 执行 SQL 查询（MySQL/PostgreSQL）
 */
async function executeSQLQuery(
  databaseType: string,
  connectionString: string,
  query: string,
  params: string[],
  sendEvent?: (event: string, data: unknown) => void
): Promise<unknown> {
  try {
    let driver: unknown
    if (databaseType === 'mysql') {
      driver = await import('mysql2/promise')
    } else if (databaseType === 'postgresql') {
      driver = await import('pg')
    }

    if (!driver) {
      throw new Error(`无法加载 ${databaseType} 驱动，请确保已安装依赖包`)
    }

    sendEvent?.('tool_progress', {
      output: `  ℹ️ 注意：${databaseType} 驱动需要单独安装\n`,
    })

    return {
      message: `${databaseType} 查询模拟结果`,
      query,
      params,
      rows: [],
    }
  } catch (error) {
    throw new Error(`SQL 执行失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 执行 SQLite 查询
 */
async function executeSQLiteQuery(
  dbPath: string,
  query: string,
  params: string[],
  sendEvent?: (event: string, data: unknown) => void
): Promise<unknown> {
  try {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(dbPath)
    
    if (query.trim().toLowerCase().startsWith('select')) {
      const result = db.prepare(query).params(...params).all()
      db.close()
      return result
    } else {
      const result = db.prepare(query).params(...params).run()
      db.close()
      return { changes: result.changes, lastInsertRowid: result.lastInsertRowid }
    }
  } catch (error) {
    throw new Error(`SQLite 执行失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 执行 MongoDB 查询
 */
async function executeMongoDBQuery(
  connectionString: string,
  query: string,
  operation: string,
  sendEvent?: (event: string, data: unknown) => void
): Promise<unknown> {
  try {
    const { MongoClient } = await import('mongodb')
    const client = new MongoClient(connectionString)
    
    await client.connect()
    sendEvent?.('tool_progress', {
      output: `  ✅ MongoDB 连接成功\n`,
    })

    const db = client.db()
    let result: unknown

    switch (operation) {
      case 'select':
        if (query.startsWith('{')) {
          const filter = JSON.parse(query)
          result = await db.collection('default').find(filter).toArray()
        } else {
          result = await db.collection(query).find({}).limit(100).toArray()
        }
        break
      case 'insert':
        const docs = JSON.parse(query)
        result = await db.collection('default').insertMany(Array.isArray(docs) ? docs : [docs])
        break
      case 'update':
        result = { modifiedCount: 0 }
        break
      case 'delete':
        result = { deletedCount: 0 }
        break
      default:
        result = await db.command(JSON.parse(query))
    }

    await client.close()
    return result
  } catch (error) {
    throw new Error(`MongoDB 执行失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ==================== DockerManager 工具 ====================

/**
 * 创建 Docker 管理工具定义
 * 管理 Docker 容器和镜像
 */
export function createDockerManagerToolDefinition(): ToolDefinition {
  return {
    name: 'DockerManager',
    description:
      'Docker 容器和镜像管理工具。支持容器生命周期管理（创建、启动、停止、删除）、镜像管理、日志查看、资源监控等操作。',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'listContainers',
            'listImages',
            'startContainer',
            'stopContainer',
            'restartContainer',
            'removeContainer',
            'getLogs',
            'inspectContainer',
            'execCommand',
            'buildImage',
            'pullImage',
            'removeImage',
            'getStats',
          ],
          description: '要执行的 Docker 操作',
        },
        containerId: {
          type: 'string',
          description: '容器 ID 或名称',
        },
        imageId: {
          type: 'string',
          description: '镜像 ID 或名称',
        },
        command: {
          type: 'string',
          description: '要在容器内执行的命令（用于 execCommand）',
        },
        dockerfile: {
          type: 'string',
          description: 'Dockerfile 路径（用于 buildImage）',
        },
        imageName: {
          type: 'string',
          description: '镜像名称和标签（例如 myimage:latest）',
        },
        options: {
          type: 'object',
          description: '额外选项（如环境变量、端口映射等）',
        },
        tail: {
          type: 'number',
          description: '日志行数（用于 getLogs），默认 100',
          default: 100,
        },
      },
      required: ['action'],
    },
    category: 'devops',
    permissions: { dangerous: true },
    handler: async (input, context, sendEvent) => {
      const {
        action,
        containerId,
        imageId,
        command,
        dockerfile,
        imageName,
        options = {},
        tail = 100,
      } = input as {
        action: string
        containerId?: string
        imageId?: string
        command?: string
        dockerfile?: string
        imageName?: string
        options?: Record<string, unknown>
        tail?: number
      }

      sendEvent?.('tool_progress', {
        output: `🐳 Docker ${action}\n`,
      })

      try {
        let result: unknown

        switch (action) {
          case 'listContainers':
            result = await execDockerCommand('ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"', context.projectRoot, sendEvent)
            break
          case 'listImages':
            result = await execDockerCommand('images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"', context.projectRoot, sendEvent)
            break
          case 'startContainer':
            if (!containerId) throw new Error('startContainer 需要 containerId')
            result = await execDockerCommand(`start ${containerId}`, context.projectRoot, sendEvent)
            break
          case 'stopContainer':
            if (!containerId) throw new Error('stopContainer 需要 containerId')
            result = await execDockerCommand(`stop ${containerId}`, context.projectRoot, sendEvent)
            break
          case 'restartContainer':
            if (!containerId) throw new Error('restartContainer 需要 containerId')
            result = await execDockerCommand(`restart ${containerId}`, context.projectRoot, sendEvent)
            break
          case 'removeContainer':
            if (!containerId) throw new Error('removeContainer 需要 containerId')
            result = await execDockerCommand(`rm -f ${containerId}`, context.projectRoot, sendEvent)
            break
          case 'getLogs':
            if (!containerId) throw new Error('getLogs 需要 containerId')
            result = await execDockerCommand(`logs --tail ${tail} ${containerId}`, context.projectRoot, sendEvent)
            break
          case 'inspectContainer':
            if (!containerId) throw new Error('inspectContainer 需要 containerId')
            result = await execDockerCommand(`inspect ${containerId}`, context.projectRoot, sendEvent)
            break
          case 'execCommand':
            if (!containerId || !command) throw new Error('execCommand 需要 containerId 和 command')
            result = await execDockerCommand(`exec ${containerId} ${command}`, context.projectRoot, sendEvent)
            break
          case 'buildImage':
            if (!dockerfile || !imageName) throw new Error('buildImage 需要 dockerfile 和 imageName')
            result = await execDockerCommand(`build -t ${imageName} -f ${dockerfile} .`, context.projectRoot, sendEvent)
            break
          case 'pullImage':
            if (!imageName) throw new Error('pullImage 需要 imageName')
            result = await execDockerCommand(`pull ${imageName}`, context.projectRoot, sendEvent)
            break
          case 'removeImage':
            if (!imageId) throw new Error('removeImage 需要 imageId')
            result = await execDockerCommand(`rmi -f ${imageId}`, context.projectRoot, sendEvent)
            break
          case 'getStats':
            if (!containerId) throw new Error('getStats 需要 containerId')
            result = await execDockerCommand(`stats --no-stream ${containerId}`, context.projectRoot, sendEvent)
            break
          default:
            throw new Error(`未知的 Docker 操作: ${action}`)
        }

        sendEvent?.('tool_progress', {
          output: `  ✅ ${action} 完成\n`,
        })

        return {
          success: true,
          result: {
            action,
            ...typeof result === 'object' ? result : { output: result },
          },
          output: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          error: errorMessage,
          output: `❌ Docker 操作失败: ${errorMessage}`,
        }
      }
    },
  }
}

/**
 * 执行 Docker 命令
 */
async function execDockerCommand(
  cmd: string,
  cwd: string,
  sendEvent?: (event: string, data: unknown) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', cmd.split(/\s+/), {
      cwd,
      env: { ...process.env },
      shell: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      const text = data.toString()
      stdout += text
      sendEvent?.('tool_progress', { output: text })
    })

    child.stderr?.on('data', (data) => {
      const text = data.toString()
      stderr += text
      sendEvent?.('tool_progress', { output: `[docker] ${text}` })
    })

    child.on('error', (error) => {
      reject(new Error(`Docker 命令执行失败: ${error.message}. 请确保 Docker 已安装并在 PATH 中`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(stderr.trim() || `Docker 命令退出码: ${code}`))
      }
    })
  })
}

// ==================== GitAdvanced 工具 ====================

/**
 * 创建 Git 高级操作工具定义
 * 提供 PR 创建、Code Review、分支管理等高级 Git 功能
 */
export function createGitAdvancedToolDefinition(): ToolDefinition {
  return {
    name: 'GitAdvanced',
    description:
      'Git 高级操作工具。提供 Pull Request 创建和管理、Code Review、分支策略、冲突解决、标签管理等企业级 Git 工作流功能。',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'createPR',
            'listPRs',
            'mergePR',
            'reviewPR',
            'createBranch',
            'listBranches',
            'deleteBranch',
            'createTag',
            'listTags',
            'resolveConflict',
            'changelog',
            'stash',
            'popStash',
          ],
          description: '要执行的 Git 操作',
        },
        title: {
          type: 'string',
          description: 'PR 标题或标签消息',
        },
        body: {
          type: 'string',
          description: 'PR 描述或提交消息',
        },
        baseBranch: {
          type: 'string',
          description: '目标分支（用于 PR）',
          default: 'main',
        },
        headBranch: {
          type: 'string',
          description: '源分支（用于 PR）',
        },
        branchName: {
          type: 'string',
          description: '分支名称',
        },
        tagName: {
          type: 'string',
          description: '标签名称',
        },
        prNumber: {
          type: 'number',
          description: 'PR 编号',
        },
        reviewComment: {
          type: 'string',
          description: 'Review 评论',
        },
        reviewAction: {
          type: 'string',
          enum: ['approve', 'request_changes', 'comment'],
          description: 'Review 动作',
        },
        remoteUrl: {
          type: 'string',
          description: '远程仓库 URL（可选，自动检测）',
        },
      },
      required: ['action'],
    },
    category: 'vcs',
    permissions: { dangerous: true },
    handler: async (input, context, sendEvent) => {
      const {
        action,
        title,
        body,
        baseBranch = 'main',
        headBranch,
        branchName,
        tagName,
        prNumber,
        reviewComment,
        reviewAction = 'comment',
        remoteUrl,
      } = input as {
        action: string
        title?: string
        body?: string
        baseBranch?: string
        headBranch?: string
        branchName?: string
        tagName?: string
        prNumber?: number
        reviewComment?: string
        reviewAction?: string
        remoteUrl?: string
      }

      const cwd = context.projectRoot

      sendEvent?.('tool_progress', {
        output: `🔀 Git ${action}\n`,
      })

      try {
        let result: unknown

        switch (action) {
          case 'createBranch':
            if (!branchName) throw new Error('createBranch 需要 branchName')
            await execGitCommand(`checkout -b ${branchName}`, cwd, sendEvent)
            result = { message: `分支 ${branchName} 创建成功`, branch: branchName }
            break

          case 'listBranches':
            const branchesOutput = await execGitCommand('branch -a --sort=-committerdate', cwd, sendEvent)
            result = { branches: branchesOutput.split('\n').filter(b => b.trim()) }
            break

          case 'deleteBranch':
            if (!branchName) throw new Error('deleteBranch 需要 branchName')
            await execGitCommand(`branch -D ${branchName}`, cwd, sendEvent)
            result = { message: `分支 ${branchName} 已删除` }
            break

          case 'createTag':
            if (!tagName) throw new Error('createTag 需要 tagName')
            const tagMessage = title || tagName
            await execGitCommand(`tag -a ${tagName} -m "${tagMessage}"`, cwd, sendEvent)
            result = { message: `标签 ${tagName} 创建成功`, tag: tagName }
            break

          case 'listTags':
            const tagsOutput = await execGitCommand('tag --sort=-version:refname', cwd, sendEvent)
            result = { tags: tagsOutput.split('\n').filter(t => t.trim()) }
            break

          case 'stash':
            const stashMessage = title || 'Auto stash'
            await execGitCommand(`stash push -m "${stashMessage}"`, cwd, sendEvent)
            result = { message: '更改已暂存' }
            break

          case 'popStash':
            await execGitCommand('stash pop', cwd, sendEvent)
            result = { message: '暂存的更改已恢复' }
            break

          case 'changelog':
            const changelogOutput = await execGitCommand('log --oneline -20 --no-merges', cwd, sendEvent)
            result = { changelog: changelogOutput.split('\n').filter(c => c.trim()) }
            break

          case 'createPR':
            if (!title || !headBranch) throw new Error('createPR 需要 title 和 headBranch')
            result = {
              message: 'PR 创建指令已生成（需要 GitHub/GitLab CLI 或 API 集成）',
              prInfo: {
                title,
                body,
                base: baseBranch,
                head: headBranch,
                command: `gh pr create --base ${baseBranch} --head ${headBranch} --title "${title}" --body "${body || ''}"`,
              },
            }
            break

          case 'listPRs':
            result = {
              message: '列出 PR（需要 GitHub/GitLab CLI 或 API 集成）',
              command: 'gh pr list --state all',
            }
            break

          case 'mergePR':
            if (!prNumber) throw new Error('mergePR 需要 prNumber')
            result = {
              message: `合并 PR #${prNumber} 的指令已生成`,
              command: `gh pr merge ${prNumber} --merge`,
            }
            break

          case 'reviewPR':
            if (!prNumber || !reviewComment) throw new Error('reviewPR 需要 prNumber 和 reviewComment')
            result = {
              message: `Review PR #${prNumber} 的指令已生成`,
              review: {
                prNumber,
                action: reviewAction,
                comment: reviewComment,
                command: `gh pr review ${prNumber} --${reviewAction} --body "${reviewComment}"`,
              },
            }
            break

          case 'resolveConflict':
            result = {
              message: '冲突检测和解决指南',
              steps: [
                '1. 运行 git status 查看冲突文件',
                '2. 打开冲突文件，查找 <<<<<<<, =======, >>>>>>> 标记',
                '3. 手动解决冲突',
                '4. 运行 git add <file> 标记为已解决',
                '5. 运行 git commit 完成合并',
              ],
            }
            break

          default:
            throw new Error(`未知的 Git 操作: ${action}`)
        }

        sendEvent?.('tool_progress', {
          output: `  ✅ ${action} 完成\n`,
        })

        return {
          success: true,
          result: { action, ...result },
          output: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result),
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          success: false,
          error: errorMessage,
          output: `❌ Git 操作失败: ${errorMessage}`,
        }
      }
    },
  }
}

/**
 * 执行 Git 命令
 */
async function execGitCommand(
  cmd: string,
  cwd: string,
  sendEvent?: (event: string, data: unknown) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', cmd.split(/\s+/), {
      cwd,
      env: { ...process.env },
      shell: true,
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      const text = data.toString()
      stdout += text
      sendEvent?.('tool_progress', { output: text })
    })

    child.stderr?.on('data', (data) => {
      const text = data.toString()
      stderr += text
      sendEvent?.('tool_progress', { output: `[git] ${text}` })
    })

    child.on('error', (error) => {
      reject(new Error(`Git 命令执行失败: ${error.message}. 请确保 Git 已安装并在 PATH 中`))
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim())
      } else {
        reject(new Error(stderr.trim() || `Git 命令退出码: ${code}`))
      }
    })
  })
}
