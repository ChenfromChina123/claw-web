/**
 * 内置工具定义与注册
 *
 * 功能：
 * - 定义所有内置工具的配置
 * - 提供批量注册方法
 * - 集中管理工具元数据
 */

import type { ToolRegistrationConfig, RegisteredTool } from '../types/toolRegistryTypes'
import { TOOL_CATEGORIES } from '../types/toolRegistryTypes'
import { normalizeToolName } from '../../tools/toolAliases'

// ==================== BuiltinToolRegistrar 类 ====================

export class BuiltinToolRegistrar {
  /**
   * 注册所有内置工具到注册表
   */
  static registerAll(registerFn: (config: ToolRegistrationConfig) => void): void {
    // ========== 文件操作工具 ==========
    registerFileTools(registerFn)
    
    // ========== Shell 执行工具 ==========
    registerShellTools(registerFn)
    
    // ========== Web 工具 ==========
    registerWebTools(registerFn)
    
    // ========== 任务管理工具 ==========
    registerTaskTools(registerFn)
    
    // ========== Agent 工具 ==========
    registerAgentTools(registerFn)
    
    // ========== 系统工具 ==========
    registerSystemTools(registerFn)
    
    // ========== 计划模式工具 ==========
    registerPlanTools(registerFn)
    
    // ========== 开发工具 ==========
    registerDevelopmentTools(registerFn)
    
    // ========== 数据库工具 ==========
    registerDatabaseTools(registerFn)
    
    // ========== DevOps 工具 ==========
    registerDevopsTools(registerFn)
    
    // ========== 版本控制工具 ==========
    registerVcsTools(registerFn)
  }

  /**
   * 获取内置工具数量统计
   */
  static getToolCount(): number {
    return 20 // 当前内置工具总数
  }
}

// ==================== 私有注册函数 ====================

/**
 * 注册文件操作工具
 */
function registerFileTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'FileRead',
    displayName: '读取文件',
    description: '读取文件内容，支持分页和偏移',
    category: TOOL_CATEGORIES.FILE.id,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        limit: { type: 'number', description: '最大行数' },
        offset: { type: 'number', description: '起始行号' },
      },
      required: ['path'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'FileWrite',
    displayName: '写入文件',
    description: '写入内容到文件',
    category: TOOL_CATEGORIES.FILE.id,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '内容' },
      },
      required: ['path', 'content'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })

  registerFn({
    name: 'Glob',
    displayName: '文件搜索',
    description: '查找匹配模式的文件',
    category: TOOL_CATEGORIES.FILE.id,
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob 模式' },
        path: { type: 'string', description: '搜索目录' },
      },
      required: ['pattern'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['file_glob', 'find'],
  })

  registerFn({
    name: 'Grep',
    displayName: '内容搜索',
    description: '在文件中搜索正则表达式',
    category: TOOL_CATEGORIES.FILE.id,
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则表达式' },
        path: { type: 'string', description: '搜索目录' },
      },
      required: ['pattern'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['search', 'find_content'],
  })

  registerFn({
    name: 'ImageRead',
    displayName: '读取图片',
    description: '读取图片文件并返回给 Agent 分析。支持 PNG、JPG、JPEG、GIF、WebP 等格式，自动压缩优化',
    category: TOOL_CATEGORIES.FILE.id,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '图片文件路径' },
        maxWidth: { type: 'number', description: '最大宽度（像素）' },
        maxHeight: { type: 'number', description: '最大高度（像素）' },
        quality: { type: 'number', description: '图片质量 (0-100)' },
        fullSize: { type: 'boolean', description: '是否返回原始尺寸' },
      },
      required: ['path'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['read_image', 'view_image', 'image'],
  })

  registerFn({
    name: 'NotebookEdit',
    displayName: '编辑 Notebook',
    description: '编辑 Jupyter Notebook (.ipynb) 文件的单元格。支持替换、插入和删除操作。',
    category: TOOL_CATEGORIES.FILE.id,
    inputSchema: {
      type: 'object',
      properties: {
        notebook_path: { type: 'string', description: 'Notebook 文件路径' },
        cell_id: { type: 'string', description: '单元格 ID' },
        new_source: { type: 'string', description: '新源代码' },
        cell_type: { type: 'string', enum: ['code', 'markdown'], description: '单元格类型' },
        edit_mode: { type: 'string', enum: ['replace', 'insert', 'delete'], description: '编辑模式' },
      },
      required: ['notebook_path', 'new_source'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })
}

/**
 * 注册 Shell 执行工具
 */
function registerShellTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'Bash',
    displayName: '执行命令',
    description: '执行 Shell 命令',
    category: TOOL_CATEGORIES.SHELL.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '命令' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时(毫秒)' },
      },
      required: ['command'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['shell', 'exec', 'run'],
  })

  registerFn({
    name: 'PowerShell',
    displayName: 'PowerShell 命令',
    description: '执行 Windows PowerShell 命令。提供完整的 PowerShell 环境访问。',
    category: TOOL_CATEGORIES.SHELL.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'PowerShell 命令' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）' },
        executionPolicy: { 
          type: 'string', 
          enum: ['Restricted', 'AllSigned', 'RemoteSigned', 'Unrestricted', 'Bypass'], 
          description: '执行策略' 
        },
      },
      required: ['command'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })
}

/**
 * 注册 Web 工具
 */
function registerWebTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'WebSearch',
    displayName: '网络搜索',
    description: '搜索网络信息',
    category: TOOL_CATEGORIES.WEB.id,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询' },
      },
      required: ['query'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['search', 'websearch'],
  })

  registerFn({
    name: 'WebFetch',
    displayName: '获取网页',
    description: '获取网页内容',
    category: TOOL_CATEGORIES.WEB.id,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL' },
      },
      required: ['url'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['fetch', 'curl', 'wget'],
  })
}

/**
 * 注册任务管理工具
 */
function registerTaskTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'TodoWrite',
    displayName: '待办事项',
    description: '创建或更新待办事项',
    category: TOOL_CATEGORIES.TASK.id,
    inputSchema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              content: { type: 'string' },
              id: { type: 'string' },
            },
          },
        },
        merge: { type: 'boolean' },
      },
      required: ['todos'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['todo', 'todos'],
  })
}

/**
 * 注册 Agent 工具
 */
function registerAgentTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'Agent',
    displayName: 'Agent 工具',
    description: '启动子代理来完成任务',
    category: TOOL_CATEGORIES.AGENT.id,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '给子代理的任务描述' },
        subagent_type: { type: 'string', description: '子代理类型' },
      },
      required: ['prompt'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })

  registerFn({
    name: 'SendMessage',
    displayName: '发送消息',
    description: '向运行中的 Agent 发送消息以继续其执行',
    category: TOOL_CATEGORIES.AGENT.id,
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: '目标 Agent 的 ID' },
        message: { type: 'string', description: '要发送的消息内容' },
      },
      required: ['agentId', 'message'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })
}

/**
 * 注册系统工具
 */
function registerSystemTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'Config',
    displayName: '配置管理',
    description: '获取或设置配置值',
    category: TOOL_CATEGORIES.SYSTEM.id,
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '配置键' },
        value: { type: 'string', description: '配置值' },
        list: { type: 'boolean', description: '列出所有' },
      },
      required: ['key'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['get', 'set', 'setting', 'config_get', 'config_set'],
  })

  registerFn({
    name: 'Sleep',
    displayName: '暂停执行',
    description: '暂停执行指定的时间（毫秒）',
    category: TOOL_CATEGORIES.SYSTEM.id,
    inputSchema: {
      type: 'object',
      properties: {
        duration: { type: 'number', description: '暂停时长（毫秒）', minimum: 0, maximum: 300000 },
      },
      required: ['duration'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })
}

/**
 * 注册计划模式工具
 */
function registerPlanTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'ExitPlanMode',
    displayName: '退出计划模式',
    description: '退出计划模式，继续实际执行或取消任务',
    category: TOOL_CATEGORIES.PLAN.id,
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', description: '操作模式', enum: ['approve', 'reject', 'cancel'] },
        reason: { type: 'string', description: '原因或备注' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })
}

/**
 * 注册开发工具
 */
function registerDevelopmentTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'LSP',
    displayName: '代码智能',
    description: '语言服务器协议工具，提供代码智能功能：跳转定义、查找引用、悬停信息等。',
    category: TOOL_CATEGORIES.DEVELOPMENT.id,
    inputSchema: {
      type: 'object',
      properties: {
        operation: { 
          type: 'string', 
          enum: ['goToDefinition', 'findReferences', 'hover', 'documentSymbol', 'workspaceSymbol'],
          description: 'LSP 操作类型' 
        },
        filePath: { type: 'string', description: '文件路径' },
        line: { type: 'number', description: '行号' },
        character: { type: 'number', description: '字符偏移' },
      },
      required: ['operation', 'filePath'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })
}

/**
 * 注册数据库工具
 */
function registerDatabaseTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'DatabaseQuery',
    displayName: '数据库查询',
    description: '执行数据库查询操作。支持 MySQL、PostgreSQL、SQLite、MongoDB。',
    category: TOOL_CATEGORIES.DATABASE.id,
    inputSchema: {
      type: 'object',
      properties: {
        databaseType: { type: 'string', enum: ['mysql', 'postgresql', 'sqlite', 'mongodb'], description: '数据库类型' },
        connectionString: { type: 'string', description: '连接字符串' },
        query: { type: 'string', description: '查询语句' },
        operation: { type: 'string', enum: ['select', 'insert', 'update', 'delete'], description: '操作类型' },
      },
      required: ['databaseType', 'connectionString', 'query'],
    },
    isReadOnly: false,
    isConcurrencySafe: true,
  })
}

/**
 * 注册 DevOps 工具
 */
function registerDevopsTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'DockerManager',
    displayName: 'Docker 管理',
    description: 'Docker 容器和镜像管理工具。支持容器生命周期管理、镜像管理等。',
    category: TOOL_CATEGORIES.DEVOPS.id,
    inputSchema: {
      type: 'object',
      properties: {
        action: { 
          type: 'string', 
          enum: ['listContainers', 'listImages', 'startContainer', 'stopContainer', 'removeContainer', 'getLogs', 'buildImage'],
          description: 'Docker 操作' 
        },
        containerId: { type: 'string', description: '容器 ID' },
        imageName: { type: 'string', description: '镜像名称' },
      },
      required: ['action'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })
}

/**
 * 注册版本控制工具
 */
function registerVcsTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'GitAdvanced',
    displayName: 'Git 高级操作',
    description: 'Git 高级操作工具。提供 PR 管理、Code Review、分支策略等功能。',
    category: TOOL_CATEGORIES.VCS.id,
    inputSchema: {
      type: 'object',
      properties: {
        action: { 
          type: 'string', 
          enum: ['createBranch', 'listBranches', 'createTag', 'listTags', 'changelog', 'stash', 'createPR', 'mergePR'],
          description: 'Git 操作' 
        },
        branchName: { type: 'string', description: '分支名称' },
        title: { type: 'string', description: '标题' },
      },
      required: ['action'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })
}
