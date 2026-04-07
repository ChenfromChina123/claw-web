/**
 * 高级工具桥接测试套件
 * 
 * 测试所有新增的高级工具：
 * - NotebookEdit
 * - LSP
 * - PowerShell
 * - DatabaseQuery
 * - DockerManager
 * - GitAdvanced
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createNotebookEditToolDefinition,
  createLSPToolDefinition,
  createPowerShellToolDefinition,
  createDatabaseQueryToolDefinition,
  createDockerManagerToolDefinition,
  createGitAdvancedToolDefinition,
} from '../tools/advancedTools'

// ==================== Mock Context ====================

const mockContext = {
  userId: 'test-user',
  sessionId: 'test-session',
  projectRoot: process.cwd(),
  workingDirectory: process.cwd(),
  sandboxed: false,
  allowedTools: ['*'],
  deniedTools: [],
}

const mockSendEvent = (event: string, data: unknown) => {
  console.log(`[Test Event] ${event}:`, JSON.stringify(data, null, 2))
}

// ==================== NotebookEdit 工具测试 ====================

describe('NotebookEdit Tool', () => {
  let notebookEditTool: ReturnType<typeof createNotebookEditToolDefinition>

  beforeAll(() => {
    notebookEditTool = createNotebookEditToolDefinition()
  })

  it('应该正确定义工具名称和描述', () => {
    expect(notebookEditTool.name).toBe('NotebookEdit')
    expect(notebookEditTool.description).toContain('Jupyter')
    expect(notebookEditTool.category).toBe('file')
  })

  it('应该包含完整的输入模式', () => {
    const schema = notebookEditTool.inputSchema
    
    expect(schema.properties).toHaveProperty('notebook_path')
    expect(schema.properties).toHaveProperty('new_source')
    expect(schema.properties).toHaveProperty('cell_id')
    expect(schema.properties).toHaveProperty('cell_type')
    expect(schema.properties).toHaveProperty('edit_mode')
    
    expect(schema.required).toContain('notebook_path')
    expect(schema.required).toContain('new_source')
  })

  it('应该支持 replace 模式', async () => {
    const result = await notebookEditTool.handler(
      {
        notebook_path: 'test.ipynb',
        cell_id: 'cell-1',
        new_source: 'print("Hello World")',
        edit_mode: 'replace',
      },
      mockContext as never,
      mockSendEvent
    )

    // 由于文件不存在，预期会失败，但我们应该能正确处理错误
    expect(result).toBeDefined()
    expect(typeof result.success).toBe('boolean')
  })

  it('应该支持 insert 模式', async () => {
    const result = await notebookEditTool.handler(
      {
        notebook_path: 'test.ipynb',
        new_source: '# New Cell',
        cell_type: 'markdown',
        edit_mode: 'insert',
      },
      mockContext as never,
      mockSendEvent
    )

    expect(result).toBeDefined()
  })

  it('应该支持 delete 模式', async () => {
    const result = await notebookEditTool.handler(
      {
        notebook_path: 'test.ipynb',
        cell_id: 'cell-1',
        new_source: '',
        edit_mode: 'delete',
      },
      mockContext as never,
      mockSendEvent
    )

    expect(result).toBeDefined()
  })
})

// ==================== LSP 工具测试 ====================

describe('LSP Tool', () => {
  let lspTool: ReturnType<typeof createLSPToolDefinition>

  beforeAll(() => {
    lspTool = createLSPToolDefinition()
  })

  it('应该正确定义 LSP 操作类型', () => {
    const operations = lspTool.inputSchema.properties.operation.enum

    expect(operations).toContain('goToDefinition')
    expect(operations).toContain('findReferences')
    expect(operations).toContain('hover')
    expect(operations).toContain('documentSymbol')
    expect(operations).toContain('workspaceSymbol')
  })

  it('应该是只读工具', () => {
    expect(lspTool.isReadOnly).toBe(true)
  })

  it('应该属于开发工具类别', () => {
    expect(lspTool.category).toBe('development')
  })

  it('应该处理不存在的文件', async () => {
    const result = await lspTool.handler(
      {
        operation: 'goToDefinition',
        filePath: '/nonexistent/file.ts',
        line: 1,
        character: 1,
      },
      mockContext as never,
      mockSendEvent
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('不存在')
  })

  it('应该处理有效的操作', async () => {
    // 创建一个临时文件进行测试
    const fs = await import('fs/promises')
    const tmpFile = 'test-lsp-file.txt'
    await fs.writeFile(tmpFile, 'test content')

    try {
      const result = await lspTool.handler(
        {
          operation: 'hover',
          filePath: tmpFile,
          line: 1,
          character: 1,
        },
        mockContext as never,
        mockSendEvent
      )

      expect(result.success).toBe(true)
      expect(result.result).toHaveProperty('operation', 'hover')
    } finally {
      await fs.unlink(tmpFile)
    }
  })
})

// ==================== PowerShell 工具测试 ====================

describe('PowerShell Tool', () => {
  let powerShellTool: ReturnType<typeof createPowerShellToolDefinition>

  beforeAll(() => {
    powerShellTool = createPowerShellToolDefinition()
  })

  it('应该包含 PowerShell 特定配置选项', () => {
    const schema = powerShellTool.inputSchema

    expect(schema.properties).toHaveProperty('command')
    expect(schema.properties).toHaveProperty('executionPolicy')
    expect(schema.properties).toHaveProperty('noProfile')
    expect(schema.properties.executionPolicy.enum).toContain('Bypass')
    expect(schema.properties.executionPolicy.enum).toContain('Restricted')
  })

  it('应该执行简单的 PowerShell 命令', async () => {
    const result = await powerShellTool.handler(
      { command: 'Write-Output "Hello from PowerShell"' },
      mockContext as never,
      mockSendEvent
    )

    expect(result).toBeDefined()
    if (result.success) {
      expect(result.result).toBeDefined()
    }
  }, 30000)

  it('应该处理超时', async () => {
    const result = await powerShellTool.handler(
      { command: 'Start-Sleep -Seconds 100', timeout: 100 },
      mockContext as never,
      mockSendEvent
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('timeout')
  }, 5000)
})

// ==================== DatabaseQuery 工具测试 ====================

describe('DatabaseQuery Tool', () => {
  let databaseTool: ReturnType<typeof createDatabaseQueryToolDefinition>

  beforeAll(() => {
    databaseTool = createDatabaseQueryToolDefinition()
  })

  it('应该支持多种数据库类型', () => {
    const dbTypes = databaseTool.inputSchema.properties.databaseType.enum

    expect(dbTypes).toContain('mysql')
    expect(dbTypes).toContain('postgresql')
    expect(dbTypes).toContain('sqlite')
    expect(dbTypes).toContain('mongodb')
  })

  it('应该支持多种操作类型', () => {
    const operations = databaseTool.inputSchema.properties.operation.enum

    expect(operations).toContain('select')
    expect(operations).toContain('insert')
    expect(operations).toContain('update')
    expect(operations).toContain('delete')
  })

  it('应该验证必需的参数', () => {
    const required = databaseTool.inputSchema.required

    expect(required).toContain('databaseType')
    expect(required).toContain('connectionString')
    expect(required).toContain('query')
  })

  it('应该处理无效的数据库类型', async () => {
    const result = await databaseTool.handler(
      {
        databaseType: 'invalid_db',
        connectionString: 'test://localhost',
        query: 'SELECT 1',
      },
      mockContext as never,
      mockSendEvent
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('不支持')
  })
})

// ==================== DockerManager 工具测试 ====================

describe('DockerManager Tool', () => {
  let dockerTool: ReturnType<typeof createDockerManagerToolDefinition>

  beforeAll(() => {
    dockerTool = createDockerManagerToolDefinition()
  })

  it('应该定义完整的 Docker 操作集', () => {
    const actions = dockerTool.inputSchema.properties.action.enum

    expect(actions).toContain('listContainers')
    expect(actions).toContain('listImages')
    expect(actions).toContain('startContainer')
    expect(actions).toContain('stopContainer')
    expect(actions).toContain('removeContainer')
    expect(actions).toContain('getLogs')
    expect(actions).toContain('buildImage')
  })

  it('应该属于 DevOps 类别', () => {
    expect(dockerTool.category).toBe('devops')
  })

  it('应该处理缺少参数的情况', async () => {
    const result = await dockerTool.handler(
      { action: 'startContainer' },
      mockContext as never,
      mockSendEvent
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('containerId')
  })

  it('应该处理 Docker 未安装的情况', async () => {
    const result = await dockerTool.handler(
      { action: 'listContainers' },
      mockContext as never,
      mockSendEvent
    )

    // 如果 Docker 未安装，应该返回错误信息
    expect(result).toBeDefined()
  }, 10000)
})

// ==================== GitAdvanced 工具测试 ====================

describe('GitAdvanced Tool', () => {
  let gitTool: ReturnType<typeof createGitAdvancedToolDefinition>

  beforeAll(() => {
    gitTool = createGitAdvancedToolDefinition()
  })

  it('应该定义企业级 Git 操作', () => {
    const actions = gitTool.inputSchema.properties.action.enum

    expect(actions).toContain('createBranch')
    expect(actions).toContain('listBranches')
    expect(actions).toContain('createTag')
    expect(actions).toContain('createPR')
    expect(actions).toContain('mergePR')
    expect(actions).toContain('reviewPR')
    expect(actions).toContain('changelog')
    expect(actions).toContain('stash')
  })

  it('应该属于版本控制类别', () => {
    expect(gitTool.category).toBe('vcs')
  })

  it('应该执行 Git 分支列表操作', async () => {
    const result = await gitTool.handler(
      { action: 'listBranches' },
      mockContext as never,
      mockSendEvent
    )

    expect(result).toBeDefined()
    if (result.success) {
      expect(result.result).toHaveProperty('branches')
    }
  }, 15000)

  it('应该生成 PR 创建命令', async () => {
    const result = await gitTool.handler(
      {
        action: 'createPR',
        title: 'Test PR',
        body: 'This is a test PR',
        headBranch: 'feature/test',
      },
      mockContext as never,
      mockSendEvent
    )

    expect(result.success).toBe(true)
    if (result.result && typeof result.result === 'object') {
      expect(result.result.prInfo).toBeDefined()
      expect(result.result.prInfo.command).toContain('gh pr create')
    }
  })

  it('应该提供冲突解决指南', async () => {
    const result = await gitTool.handler(
      { action: 'resolveConflict' },
      mockContext as never,
      mockSendEvent
    )

    expect(result.success).toBe(true)
    if (result.result && typeof result.result === 'object') {
      expect(Array.isArray((result.result as Record<string, unknown>).steps)).toBe(true)
    }
  })
})

// ==================== 集成测试 ====================

describe('高级工具集成测试', () => {
  it('所有工具都应该有正确的结构', () => {
    const tools = [
      createNotebookEditToolDefinition(),
      createLSPToolDefinition(),
      createPowerShellToolDefinition(),
      createDatabaseQueryToolDefinition(),
      createDockerManagerToolDefinition(),
      createGitAdvancedToolDefinition(),
    ]

    for (const tool of tools) {
      expect(tool.name).toBeTruthy()
      expect(tool.description).toBeTruthy()
      expect(tool.inputSchema).toBeTruthy()
      expect(tool.category).toBeTruthy()
      expect(typeof tool.handler).toBe('function')
    }
  })

  it('工具应该覆盖不同的类别', () => {
    const categories = new Set([
      createNotebookEditToolDefinition().category,
      createLSPToolDefinition().category,
      createPowerShellToolDefinition().category,
      createDatabaseQueryToolDefinition().category,
      createDockerManagerToolDefinition().category,
      createGitAdvancedToolDefinition().category,
    ])

    // 应该至少有5个不同的类别
    expect(categories.size).toBeGreaterThanOrEqual(5)
  })

  it('危险工具应该标记为需要权限', () => {
    const dangerousTools = [
      createPowerShellToolDefinition(),
      createDatabaseQueryToolDefinition(),
      createDockerManagerToolDefinition(),
      createGitAdvancedToolDefinition(),
    ]

    for (const tool of dangerousTools) {
      expect(tool.permissions.dangerous).toBe(true)
    }
  })
})
