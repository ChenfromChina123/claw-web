/**
 * 内置工具定义与注册
 *
 * 功能：
 * - 定义所有内置工具的配置
 * - 提供批量注册方法
 * - 集中管理工具元数据
 *
 * 已集成的工具类别：
 * - 文件操作 (FileRead, FileWrite, FileEdit, Glob, Grep, ImageRead, NotebookEdit)
 * - Shell 执行 (Bash, PowerShell)
 * - Web 工具 (WebSearch, WebFetch, HttpRequest)
 * - 搜索工具 (Grep, GrepCount)
 * - 任务管理 (TodoWrite, TodoList, TodoClear)
 * - Agent 工具 (Agent, SendMessage)
 * - 系统工具 (Config, Sleep, ClipboardRead, ClipboardWrite, SystemInfo, ProcessList, EnvGet, EnvSet)
 * - API 工具 (JsonParse, JsonFormat, Base64Encode, Base64Decode, UrlEncode, UrlDecode, HashCalculate, UuidGenerate, Timestamp, RandomGenerate, ColorConvert)
 * - 网络工具 (Ping, DnsLookup, PortScan, Traceroute, IpInfo, NetworkInterfaces, NetConnect, WhoisLookup)
 * - 技能工具 (SkillList, SkillExecute, SkillInfo, SkillRegister, TemplateRender, MacroExpand)
 * - 计划模式 (ExitPlanMode)
 * - 开发工具 (LSP, GitLog, GitStatus, GitDiff, PackageInfo, Exec)
 * - 数据库工具 (DatabaseQuery)
 * - DevOps 工具 (DockerManager)
 * - 版本控制工具 (GitAdvanced)
 * - 编程语言工具 (Python, Node, Ruby, Go, Rust, Java, PHP, Perl, Lua, R, Julia, Dart, Kotlin, Scala)
 * - 构建工具 (Make, CMake, Gradle, Maven, Ant, Scons, Bazel, Ninja, Webpack, Vite, Esbuild)
 * - 包管理器 (npm, pnpm, yarn, pip, pip3, poetry, cargo, go, gem, composer, nuget, brew)
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
    
    // ========== 搜索工具 ==========
    registerSearchTools(registerFn)
    
    // ========== 任务管理工具 ==========
    registerTaskTools(registerFn)
    
    // ========== Agent 工具 ==========
    registerAgentTools(registerFn)
    
    // ========== 系统工具 ==========
    registerSystemTools(registerFn)
    
    // ========== API 工具 ==========
    registerApiTools(registerFn)
    
    // ========== 网络工具 ==========
    registerNetworkTools(registerFn)
    
    // ========== 技能工具 ==========
    registerSkillTools(registerFn)
    
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
    
    // ========== 编程语言工具 ==========
    registerLanguageTools(registerFn)
    
    // ========== 构建工具 ==========
    registerBuilderTools(registerFn)
    
    // ========== 包管理器 ==========
    registerPackageTools(registerFn)
  }

  /**
   * 获取内置工具数量统计
   */
  static getToolCount(): number {
    return 120 // 当前内置工具总数 (增加了很多新工具)
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
    description: '搜索网络信息。使用 DuckDuckGo 进行搜索，返回相关结果摘要和链接。',
    category: TOOL_CATEGORIES.WEB.id,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询' },
        limit: { type: 'number', description: '结果数量限制', default: 10 },
      },
      required: ['query'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['search', 'websearch', 'ddg'],
  })

  registerFn({
    name: 'WebFetch',
    displayName: '获取网页',
    description: '获取网页内容并提取文本。自动清理 HTML 标签，返回纯文本内容。',
    category: TOOL_CATEGORIES.WEB.id,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL 地址' },
        prompt: { type: 'string', description: '提示词，用于提取特定信息' },
        maxLength: { type: 'number', description: '最大内容长度', default: 50000 },
      },
      required: ['url'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['fetch', 'curl', 'wget', 'get'],
  })

  registerFn({
    name: 'HttpRequest',
    displayName: 'HTTP 请求',
    description: '发起 HTTP 请求。支持 GET、POST、PUT、DELETE、PATCH 方法，可设置请求头和 body。',
    category: TOOL_CATEGORIES.WEB.id,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '请求 URL' },
        method: { 
          type: 'string', 
          description: 'HTTP 方法',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          default: 'GET' 
        },
        headers: { type: 'object', description: '请求头' },
        body: { type: 'string', description: '请求体' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 30000 },
      },
      required: ['url'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['http', 'request', 'api'],
  })
}

/**
 * 注册搜索工具
 */
function registerSearchTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'Grep',
    displayName: '内容搜索',
    description: '在文件中搜索正则表达式匹配项。支持多种输出模式：content（显示匹配行）、files_with_matches（仅文件名）、count（统计）。',
    category: TOOL_CATEGORIES.SEARCH.id,
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则表达式模式' },
        path: { type: 'string', description: '搜索目录或文件', default: '.' },
        glob: { type: 'string', description: '文件 glob 模式 (如 "*.ts")' },
        output_mode: { 
          type: 'string', 
          description: '输出模式',
          enum: ['files_with_matches', 'content', 'count'],
          default: 'files_with_matches' 
        },
        '-i': { type: 'boolean', description: '忽略大小写', default: false },
        '-n': { type: 'boolean', description: '显示行号', default: true },
        '-C': { type: 'number', description: '上下文行数' },
        head_limit: { type: 'number', description: '结果数量限制', default: 250 },
        recursive: { type: 'boolean', description: '递归搜索目录', default: true },
      },
      required: ['pattern'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['search', 'find_content', 'grep_search', 'rg'],
  })

  registerFn({
    name: 'GrepCount',
    displayName: '搜索计数',
    description: '统计匹配正则表达式的行数。返回每个文件的匹配数量。',
    category: TOOL_CATEGORIES.SEARCH.id,
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '正则表达式模式' },
        path: { type: 'string', description: '搜索目录或文件', default: '.' },
        glob: { type: 'string', description: '文件 glob 模式' },
        '-i': { type: 'boolean', description: '忽略大小写', default: false },
      },
      required: ['pattern'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['count', 'grep_count', 'count_matches'],
  })
}

/**
 * 注册任务管理工具
 */
function registerTaskTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'TodoWrite',
    displayName: '待办事项',
    description: '创建或更新待办事项列表。支持 in_progress、pending、completed 三种状态。',
    category: TOOL_CATEGORIES.TASK.id,
    inputSchema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              status: { 
                type: 'string',
                enum: ['in_progress', 'pending', 'completed', 'cancelled'],
                description: '任务状态' 
              },
              content: { type: 'string', description: '任务内容' },
              activeForm: { type: 'string', description: '当前执行动作' },
              id: { type: 'string', description: '任务 ID' },
            },
          },
        },
        merge: { type: 'boolean', description: '是否与现有任务合并', default: true },
      },
      required: ['todos'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['todo', 'todos', 'task_write'],
  })

  registerFn({
    name: 'TodoList',
    displayName: '待办列表',
    description: '列出当前会话的所有待办事项及其状态。',
    category: TOOL_CATEGORIES.TASK.id,
    inputSchema: {
      type: 'object',
      properties: {},
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['todos_list', 'list_todos'],
  })

  registerFn({
    name: 'TodoClear',
    displayName: '清空待办',
    description: '清空已完成的任务或所有任务。',
    category: TOOL_CATEGORIES.TASK.id,
    inputSchema: {
      type: 'object',
      properties: {
        all: { type: 'boolean', description: '清空所有任务，默认为只清空已完成', default: false },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['todos_clear', 'clear_todos'],
  })
}

/**
 * 注册 Agent 工具
 * 对齐 agentTool.ts 完整版 Schema 和 sendMessageTool.ts 完整版 Schema
 */
function registerAgentTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'Agent',
    displayName: 'Agent 工具',
    description: '启动子代理来完成任务。会调用真实 LLM 并执行工具来完成用户指定的任务。',
    category: TOOL_CATEGORIES.AGENT.id,
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: '给子代理的任务描述（必需）' },
        description: { type: 'string', description: '任务描述（用于日志和调试）' },
        subagent_type: { type: 'string', description: '子代理类型（如 general-purpose、Explore、Plan）' },
        model: { type: 'string', description: '可选：指定使用的模型（如 claude-sonnet-4-20250514、qwen-plus）' },
        run_in_background: { type: 'boolean', description: '是否在后台运行', default: false },
        name: { type: 'string', description: '团队成员名称（需配合 team_name 使用）' },
        team_name: { type: 'string', description: '团队名称（需配合 name 使用）' },
        mode: { type: 'string', description: '权限模式', enum: ['bypassPermissions', 'acceptEdits', 'auto', 'plan', 'bubble'], default: 'auto' },
        isolation: { type: 'string', description: '隔离模式', enum: ['worktree', 'remote'] },
        cwd: { type: 'string', description: '工作目录' },
        max_turns: { type: 'number', description: '最大轮次限制（默认 20）', minimum: 1, maximum: 100 },
      },
      required: ['prompt'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })

  registerFn({
    name: 'SendMessage',
    displayName: '发送消息',
    description: '向运行中的 Agent 发送消息以继续其执行。使用 to 字段按名称路由（支持 "*" 广播），或使用 agentId 按 ID 路由。',
    category: TOOL_CATEGORIES.AGENT.id,
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: '接收者：队友名称或 "*" 广播' },
        message: { type: 'string', description: '消息内容（纯文本或结构化消息 JSON）' },
        summary: { type: 'string', description: '5-10 词消息摘要，用于预览' },
        agentId: { type: 'string', description: '目标 Agent 的 ID（向后兼容，优先使用 to）' },
        agentName: { type: 'string', description: 'Agent 类型名称（用于验证是否为 One-shot Agent）' },
      },
      required: ['message'],
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

  // ========== 扩展系统工具 ==========

  registerFn({
    name: 'ClipboardRead',
    displayName: '读取剪贴板',
    description: '读取系统剪贴板内容',
    category: TOOL_CATEGORIES.SYSTEM.id,
    inputSchema: {
      type: 'object',
      properties: {},
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['clipboard'],
  })

  registerFn({
    name: 'ClipboardWrite',
    displayName: '写入剪贴板',
    description: '写入内容到系统剪贴板',
    category: TOOL_CATEGORIES.SYSTEM.id,
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '剪贴板内容' },
        append: { type: 'boolean', description: '追加到现有内容', default: false },
        newline: { type: 'boolean', description: '添加换行符', default: false },
      },
      required: ['content'],
    },
    isReadOnly: false,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'SystemInfo',
    displayName: '系统信息',
    description: '获取系统信息（平台、CPU、内存、运行时间等）',
    category: TOOL_CATEGORIES.SYSTEM.id,
    inputSchema: {
      type: 'object',
      properties: {
        detail: { type: 'boolean', description: '显示详细信息', default: false },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['sysinfo', 'system'],
  })

  registerFn({
    name: 'ProcessList',
    displayName: '进程列表',
    description: '列出运行中的进程',
    category: TOOL_CATEGORIES.SYSTEM.id,
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '最大进程数', default: 20 },
        sortBy: { type: 'string', enum: ['cpu', 'memory', 'pid'], description: '排序方式', default: 'pid' },
        filter: { type: 'string', description: '按进程名过滤' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['ps', 'processes'],
  })

  registerFn({
    name: 'EnvGet',
    displayName: '获取环境变量',
    description: '获取环境变量值',
    category: TOOL_CATEGORIES.SYSTEM.id,
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '变量名（留空获取所有）' },
        prefix: { type: 'string', description: '按前缀过滤' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['env', 'getenv'],
  })

  registerFn({
    name: 'EnvSet',
    displayName: '设置环境变量',
    description: '设置环境变量（仅当前会话）',
    category: TOOL_CATEGORIES.SYSTEM.id,
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '变量名' },
        value: { type: 'string', description: '变量值' },
        append: { type: 'boolean', description: '追加到现有值', default: false },
      },
      required: ['key', 'value'],
    },
    isReadOnly: false,
    isConcurrencySafe: true,
  })
}

/**
 * 注册 API 工具
 */
function registerApiTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'JsonParse',
    displayName: 'JSON 解析',
    description: '解析并验证 JSON 字符串',
    category: TOOL_CATEGORIES.API.id,
    inputSchema: {
      type: 'object',
      properties: {
        json: { type: 'string', description: 'JSON 字符串' },
        strict: { type: 'boolean', description: '严格模式（不允许多余逗号）', default: false },
      },
      required: ['json'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['parse_json'],
  })

  registerFn({
    name: 'JsonFormat',
    displayName: 'JSON 格式化',
    description: '格式化或压缩 JSON',
    category: TOOL_CATEGORIES.API.id,
    inputSchema: {
      type: 'object',
      properties: {
        json: { type: 'string', description: 'JSON 字符串' },
        indent: { type: 'number', description: '缩进空格数', default: 2 },
        minify: { type: 'boolean', description: '压缩而不是格式化', default: false },
      },
      required: ['json'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['format_json'],
  })

  registerFn({
    name: 'Base64Encode',
    displayName: 'Base64 编码',
    description: '将字符串编码为 Base64',
    category: TOOL_CATEGORIES.API.id,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要编码的文本' },
        urlSafe: { type: 'boolean', description: 'URL 安全 Base64', default: false },
      },
      required: ['text'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'Base64Decode',
    displayName: 'Base64 解码',
    description: '解码 Base64 字符串',
    category: TOOL_CATEGORIES.API.id,
    inputSchema: {
      type: 'object',
      properties: {
        encoded: { type: 'string', description: 'Base64 字符串' },
        encoding: { type: 'string', enum: ['utf8', 'hex', 'ascii'], description: '输出编码', default: 'utf8' },
      },
      required: ['encoded'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'UrlEncode',
    displayName: 'URL 编码',
    description: '对字符串进行 URL 编码',
    category: TOOL_CATEGORIES.API.id,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要编码的文本' },
        component: { type: 'boolean', description: '作为 URL 组件编码', default: true },
      },
      required: ['text'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'UrlDecode',
    displayName: 'URL 解码',
    description: '解码 URL 编码的字符串',
    category: TOOL_CATEGORIES.API.id,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'URL 编码的字符串' },
      },
      required: ['text'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'HashCalculate',
    displayName: '计算哈希',
    description: '计算字符串的哈希值',
    category: TOOL_CATEGORIES.API.id,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '要哈希的文本' },
        algorithm: { type: 'string', enum: ['md5', 'sha1', 'sha256', 'sha512'], description: '哈希算法', default: 'sha256' },
        encoding: { type: 'string', enum: ['hex', 'base64'], description: '输出编码', default: 'hex' },
      },
      required: ['text'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['hash'],
  })

  registerFn({
    name: 'UuidGenerate',
    displayName: '生成 UUID',
    description: '生成 UUID v4',
    category: TOOL_CATEGORIES.API.id,
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: '生成数量', default: 1 },
        format: { type: 'string', enum: ['standard', 'no-dash'], description: '格式', default: 'standard' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['uuid'],
  })

  registerFn({
    name: 'Timestamp',
    displayName: '时间戳',
    description: '获取当前时间戳或转换时间',
    category: TOOL_CATEGORIES.API.id,
    inputSchema: {
      type: 'object',
      properties: {
        time: { type: 'string', description: '要转换的时间（ISO 字符串或 Unix 时间戳）' },
        format: { type: 'string', enum: ['unix', 'iso', 'unix-ms', 'relative'], description: '输出格式', default: 'iso' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'RandomGenerate',
    displayName: '生成随机数据',
    description: '生成随机字符串、数字或 UUID',
    category: TOOL_CATEGORIES.API.id,
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['string', 'number', 'hex', 'base64', 'uuid'], description: '数据类型', default: 'string' },
        length: { type: 'number', description: '长度', default: 32 },
        min: { type: 'number', description: '最小值（number 类型）', default: 0 },
        max: { type: 'number', description: '最大值（number 类型）', default: 100 },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['random'],
  })

  registerFn({
    name: 'ColorConvert',
    displayName: '颜色转换',
    description: '在不同颜色格式之间转换（hex, rgb, hsl）',
    category: TOOL_CATEGORIES.API.id,
    inputSchema: {
      type: 'object',
      properties: {
        color: { type: 'string', description: '颜色值（hex, rgb, hsl）' },
        to: { type: 'string', enum: ['hex', 'rgb', 'hsl', 'all'], description: '输出格式', default: 'hex' },
      },
      required: ['color'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })
}

/**
 * 注册网络工具
 */
function registerNetworkTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'Ping',
    displayName: 'Ping 测试',
    description: 'Ping 主机检查连通性',
    category: TOOL_CATEGORIES.NETWORK.id,
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string', description: '主机或 IP 地址' },
        count: { type: 'number', description: '数据包数量', default: 4 },
        timeout: { type: 'number', description: '超时时间（秒）', default: 5 },
      },
      required: ['host'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'DnsLookup',
    displayName: 'DNS 查询',
    description: 'DNS 记录查询',
    category: TOOL_CATEGORIES.NETWORK.id,
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: '域名' },
        type: { type: 'string', enum: ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA', 'all'], description: '记录类型', default: 'A' },
      },
      required: ['domain'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['dns'],
  })

  registerFn({
    name: 'PortScan',
    displayName: '端口扫描',
    description: '扫描主机端口',
    category: TOOL_CATEGORIES.NETWORK.id,
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string', description: '主机或 IP 地址' },
        ports: { type: 'string', description: '端口列表（逗号分隔）或 "common"' },
        timeout: { type: 'number', description: '每个端口超时（毫秒）', default: 1000 },
      },
      required: ['host'],
    },
    isReadOnly: true,
    isConcurrencySafe: false,
  })

  registerFn({
    name: 'Traceroute',
    displayName: '路由追踪',
    description: '追踪到主机的路由',
    category: TOOL_CATEGORIES.NETWORK.id,
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string', description: '主机或 IP 地址' },
        maxHops: { type: 'number', description: '最大跳数', default: 30 },
        timeout: { type: 'number', description: '每跳超时（秒）', default: 5 },
      },
      required: ['host'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'IpInfo',
    displayName: 'IP 信息',
    description: '获取公网 IP 和位置信息',
    category: TOOL_CATEGORIES.NETWORK.id,
    inputSchema: {
      type: 'object',
      properties: {
        ip: { type: 'string', description: 'IP 地址（留空获取公网 IP）' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['myip', 'ipinfo'],
  })

  registerFn({
    name: 'NetworkInterfaces',
    displayName: '网络接口',
    description: '获取网络接口信息',
    category: TOOL_CATEGORIES.NETWORK.id,
    inputSchema: {
      type: 'object',
      properties: {
        family: { type: 'string', enum: ['IPv4', 'IPv6', 'all'], description: 'IP 类型', default: 'all' },
        internal: { type: 'boolean', description: '包含内部接口', default: true },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['ifconfig', 'networks'],
  })

  registerFn({
    name: 'NetConnect',
    displayName: '连接测试',
    description: '测试 TCP 连接到主机端口',
    category: TOOL_CATEGORIES.NETWORK.id,
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string', description: '主机' },
        port: { type: 'number', description: '端口' },
        timeout: { type: 'number', description: '超时（毫秒）', default: 5000 },
      },
      required: ['host', 'port'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'WhoisLookup',
    displayName: 'Whois 查询',
    description: '查询域名的 WHOIS 信息',
    category: TOOL_CATEGORIES.NETWORK.id,
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: '域名' },
      },
      required: ['domain'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['whois'],
  })
}

/**
 * 注册技能工具
 */
function registerSkillTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'SkillList',
    displayName: '技能列表',
    description: '列出所有可用的技能',
    category: TOOL_CATEGORIES.SKILL.id,
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '按类别过滤' },
        search: { type: 'string', description: '搜索名称/描述' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'SkillExecute',
    displayName: '执行技能',
    description: '执行指定技能',
    category: TOOL_CATEGORIES.SKILL.id,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '技能名称' },
        input: { type: 'object', description: '技能输入参数' },
      },
      required: ['name'],
    },
    isReadOnly: false,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'SkillInfo',
    displayName: '技能信息',
    description: '获取技能的详细信息',
    category: TOOL_CATEGORIES.SKILL.id,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '技能名称' },
      },
      required: ['name'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'SkillRegister',
    displayName: '注册技能',
    description: '注册新的自定义技能',
    category: TOOL_CATEGORIES.SKILL.id,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '技能名称' },
        description: { type: 'string', description: '技能描述' },
        category: { type: 'string', description: '技能类别' },
        code: { type: 'string', description: '技能处理代码' },
      },
      required: ['name', 'description', 'code'],
    },
    isReadOnly: false,
    isConcurrencySafe: true,
  })

  registerFn({
    name: 'TemplateRender',
    displayName: '模板渲染',
    description: '使用变量渲染模板',
    category: TOOL_CATEGORIES.SKILL.id,
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: '模板字符串（使用 {{variable}} 占位符）' },
        variables: { type: 'object', description: '要替换的变量' },
      },
      required: ['template'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['render'],
  })

  registerFn({
    name: 'MacroExpand',
    displayName: '宏展开',
    description: '展开文本中的宏',
    category: TOOL_CATEGORIES.SKILL.id,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '包含宏的文本' },
        date: { type: 'string', description: '日期覆盖（ISO 格式）' },
        time: { type: 'string', description: '时间覆盖（HH:mm:ss）' },
      },
      required: ['text'],
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

  registerFn({
    name: 'GitLog',
    displayName: 'Git 提交历史',
    description: '查看 Git 提交历史。显示提交哈希、作者、日期和提交信息。',
    category: TOOL_CATEGORIES.DEVELOPMENT.id,
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: '提交数量', default: 20 },
        path: { type: 'string', description: '仓库路径', default: '.' },
        author: { type: 'string', description: '按作者筛选' },
        since: { type: 'string', description: '起始日期 (如 "1 week ago")' },
        until: { type: 'string', description: '截止日期' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['git_log', 'git_history', 'log'],
  })

  registerFn({
    name: 'GitStatus',
    displayName: 'Git 状态',
    description: '查看 Git 仓库状态。显示当前分支、暂存区更改、工作区更改。',
    category: TOOL_CATEGORIES.DEVELOPMENT.id,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '仓库路径', default: '.' },
        short: { type: 'boolean', description: '简短格式', default: true },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['git_status', 'status'],
  })

  registerFn({
    name: 'GitDiff',
    displayName: 'Git 差异',
    description: '显示 Git 差异。比较提交、工作区或暂存区的差异。',
    category: TOOL_CATEGORIES.DEVELOPMENT.id,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '仓库路径', default: '.' },
        commit: { type: 'string', description: '提交哈希或 ref' },
        cached: { type: 'boolean', description: '显示暂存区更改', default: false },
        stat: { type: 'boolean', description: '显示统计信息', default: true },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['git_diff', 'diff'],
  })

  registerFn({
    name: 'PackageInfo',
    displayName: '包管理器信息',
    description: '获取项目包管理器信息。包括使用的包管理器（npm/yarn/pnpm）和依赖列表。',
    category: TOOL_CATEGORIES.DEVELOPMENT.id,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '项目路径', default: '.' },
        showDependencies: { type: 'boolean', description: '显示依赖列表', default: false },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    aliases: ['package_info', 'deps', 'dependencies'],
  })

  registerFn({
    name: 'Exec',
    displayName: '执行命令',
    description: '执行 Shell 命令并返回输出。用于运行开发命令如 npm、git、docker 等。',
    category: TOOL_CATEGORIES.DEVELOPMENT.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        cwd: { type: 'string', description: '工作目录', default: '.' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 60000 },
      },
      required: ['command'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['run', 'execute', 'exec_command'],
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

// ==================== 编程语言工具 ====================

/**
 * 注册编程语言工具
 */
function registerLanguageTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  // ========== Python ==========
  registerFn({
    name: 'Python',
    displayName: 'Python',
    description: '执行 Python 代码或脚本。支持 Python 2/3，检查版本并运行代码。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python 代码或脚本路径' },
        args: { type: 'array', items: { type: 'string' }, description: '命令行参数' },
        version: { type: 'string', enum: ['2', '3', 'auto'], description: 'Python 版本', default: 'auto' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 60000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['python3', 'python2', 'py'],
  })

  registerFn({
    name: 'Pip',
    displayName: 'Pip 包管理器',
    description: 'Python pip 包管理器。安装、升级、卸载 Python 包。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['install', 'uninstall', 'list', 'show', 'freeze', 'search', 'check'], description: 'pip 命令' },
        package: { type: 'string', description: '包名' },
        version: { type: 'string', description: '包版本' },
        options: { type: 'string', description: '额外选项（如 --user, --upgrade）' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 120000 },
      },
      required: ['command'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })

  // ========== Node.js ==========
  registerFn({
    name: 'Node',
    displayName: 'Node.js',
    description: '执行 Node.js 代码或脚本。支持 CommonJS 和 ES Modules。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript 代码或脚本路径' },
        args: { type: 'array', items: { type: 'string' }, description: '命令行参数' },
        moduleType: { type: 'string', enum: ['commonjs', 'module', 'auto'], description: '模块类型', default: 'auto' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 60000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['nodejs', 'node', 'npx'],
  })

  registerFn({
    name: 'Npm',
    displayName: 'NPM 包管理器',
    description: 'Node.js NPM 包管理器。安装、运行脚本、管理依赖。',
    category: TOOL_CATEGORIES.PACKAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['install', 'uninstall', 'update', 'list', 'outdated', 'run', 'init', 'pack', 'publish', 'version'], description: 'npm 命令' },
        package: { type: 'string', description: '包名' },
        version: { type: 'string', description: '版本或标签' },
        options: { type: 'array', items: { type: 'string' }, description: '额外选项' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 180000 },
      },
      required: ['command'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['npm_install'],
  })

  registerFn({
    name: 'Pnpm',
    displayName: 'PNPM 包管理器',
    description: 'Node.js PNPM 包管理器。快速的、磁盘空间高效的包管理器。',
    category: TOOL_CATEGORIES.PACKAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['install', 'add', 'remove', 'update', 'list', 'outdated', 'run', 'init'], description: 'pnpm 命令' },
        package: { type: 'string', description: '包名' },
        version: { type: 'string', description: '版本或标签' },
        options: { type: 'array', items: { type: 'string' }, description: '额外选项' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 180000 },
      },
      required: ['command'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })

  registerFn({
    name: 'Yarn',
    displayName: 'Yarn 包管理器',
    description: 'Node.js Yarn 包管理器。快速、可靠的依赖管理工具。',
    category: TOOL_CATEGORIES.PACKAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['install', 'add', 'remove', 'upgrade', 'list', 'outdated', 'run', 'init'], description: 'yarn 命令' },
        package: { type: 'string', description: '包名' },
        version: { type: 'string', description: '版本或标签' },
        options: { type: 'array', items: { type: 'string' }, description: '额外选项' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 180000 },
      },
      required: ['command'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })

  // ========== Ruby ==========
  registerFn({
    name: 'Ruby',
    displayName: 'Ruby',
    description: '执行 Ruby 代码或脚本。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Ruby 代码或脚本路径' },
        args: { type: 'array', items: { type: 'string' }, description: '命令行参数' },
        version: { type: 'string', description: 'Ruby 版本（如 3.0）' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 60000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['rb', 'ruby'],
  })

  registerFn({
    name: 'Bundler',
    displayName: 'Bundler',
    description: 'Ruby Bundler Gem 包管理器。管理 Ruby 依赖。',
    category: TOOL_CATEGORIES.PACKAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['install', 'update', 'exec', 'add', 'remove', 'outdated', 'config', 'lock', ' pristine'], description: 'bundler 命令' },
        gem: { type: 'string', description: 'Gem 名称' },
        version: { type: 'string', description: 'Gem 版本' },
        options: { type: 'string', description: '额外选项' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 120000 },
      },
      required: ['command'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['bundle', 'gem'],
  })

  // ========== Go ==========
  registerFn({
    name: 'Go',
    displayName: 'Go',
    description: '执行 Go 代码或脚本。运行 Go 程序或测试。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Go 代码或脚本路径' },
        args: { type: 'array', items: { type: 'string' }, description: '命令行参数' },
        subcommand: { type: 'string', enum: ['run', 'build', 'test', 'get', 'install'], description: 'Go 子命令', default: 'run' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 60000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['golang', 'go'],
  })

  // ========== Rust ==========
  registerFn({
    name: 'Rust',
    displayName: 'Rust',
    description: '执行 Rust 代码。使用 rustc 编译或 cargo 运行。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Rust 代码或脚本路径' },
        args: { type: 'array', items: { type: 'string' }, description: '命令行参数' },
        subcommand: { type: 'string', enum: ['run', 'build', 'test', 'check', 'clippy', 'fmt'], description: 'Cargo 子命令', default: 'run' },
        release: { type: 'boolean', description: '发布模式编译', default: false },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 120000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['rustc', 'cargo'],
  })

  // ========== Java ==========
  registerFn({
    name: 'Java',
    displayName: 'Java',
    description: '执行 Java 代码或编译 Java 程序。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Java 代码或 .java 文件路径' },
        args: { type: 'array', items: { type: 'string' }, description: '命令行参数' },
        subcommand: { type: 'string', enum: ['run', 'compile', 'jar'], description: '子命令', default: 'run' },
        className: { type: 'string', description: '主类名' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 60000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['javac'],
  })

  // ========== C/C++ ==========
  registerFn({
    name: 'GCC',
    displayName: 'GCC/G++ 编译器',
    description: 'GNU C/C++ 编译器。编译 C 或 C++ 代码。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'C/C++ 代码或源文件路径' },
        language: { type: 'string', enum: ['c', 'cpp', 'auto'], description: '语言类型', default: 'auto' },
        output: { type: 'string', description: '输出文件名' },
        options: { type: 'string', description: '编译选项（如 -Wall -O2）' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 60000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['g++', 'gcc', 'c', 'cpp', 'c++'],
  })

  // ========== PHP ==========
  registerFn({
    name: 'PHP',
    displayName: 'PHP',
    description: '执行 PHP 代码或脚本。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'PHP 代码或脚本路径' },
        args: { type: 'array', items: { type: 'string' }, description: '命令行参数' },
        version: { type: 'string', description: 'PHP 版本' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 60000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['php'],
  })

  // ========== Composer ==========
  registerFn({
    name: 'Composer',
    displayName: 'Composer',
    description: 'PHP Composer 包管理器。管理 PHP 依赖。',
    category: TOOL_CATEGORIES.PACKAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['install', 'require', 'remove', 'update', 'dump-autoload', 'show', 'outdated', 'init'], description: 'composer 命令' },
        package: { type: 'string', description: '包名' },
        version: { type: 'string', description: '版本约束' },
        options: { type: 'string', description: '额外选项' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 120000 },
      },
      required: ['command'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })

  // ========== 其他语言 ==========
  registerFn({
    name: 'Lua',
    displayName: 'Lua',
    description: '执行 Lua 脚本。轻量级脚本语言。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Lua 代码或脚本路径' },
        args: { type: 'array', items: { type: 'string' }, description: '命令行参数' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 30000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })

  registerFn({
    name: 'Perl',
    displayName: 'Perl',
    description: '执行 Perl 脚本。强大的文本处理语言。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Perl 代码或脚本路径' },
        args: { type: 'array', items: { type: 'string' }, description: '命令行参数' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 30000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['perl'],
  })

  registerFn({
    name: 'Rscript',
    displayName: 'R 语言',
    description: '执行 R 脚本。统计计算和数据分析。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'R 代码或脚本路径' },
        args: { type: 'array', items: { type: 'string' }, description: '命令行参数' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 60000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['r', 'rscript'],
  })

  registerFn({
    name: 'Julia',
    displayName: 'Julia',
    description: '执行 Julia 脚本。高性能科学计算语言。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Julia 代码或脚本路径' },
        args: { type: 'array', items: { type: 'string' }, description: '命令行参数' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 60000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['julia'],
  })

  registerFn({
    name: 'Dart',
    displayName: 'Dart',
    description: '执行 Dart 代码或脚本。Flutter 开发语言。',
    category: TOOL_CATEGORIES.LANGUAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Dart 代码或脚本路径' },
        args: { type: 'array', items: { type: 'string' }, description: '命令行参数' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 60000 },
      },
      required: ['code'],
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['dart'],
  })
}

// ==================== 构建工具 ====================

/**
 * 注册构建工具
 */
function registerBuilderTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'Make',
    displayName: 'Make',
    description: 'GNU Make 构建工具。执行 Makefile 构建项目。',
    category: TOOL_CATEGORIES.BUILDER.id,
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '构建目标（如 all, clean, install）', default: 'all' },
        makefile: { type: 'string', description: 'Makefile 路径' },
        jobs: { type: 'number', description: '并行任务数', default: 1 },
        options: { type: 'string', description: '额外选项' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 300000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['make', 'gmake'],
  })

  registerFn({
    name: 'CMake',
    displayName: 'CMake',
    description: 'CMake 构建系统生成器。生成平台构建文件。',
    category: TOOL_CATEGORIES.BUILDER.id,
    inputSchema: {
      type: 'object',
      properties: {
        sourceDir: { type: 'string', description: '源码目录' },
        buildDir: { type: 'string', description: '构建目录' },
        generator: { type: 'string', description: '生成器（如 Unix Makefiles, Ninja, Visual Studio）' },
        options: { type: 'string', description: 'CMake 选项（如 -DCMAKE_BUILD_TYPE=Release）' },
        preset: { type: 'string', description: '使用 CMake Preset' },
        command: { type: 'string', enum: ['configure', 'build', 'install', 'clean'], description: 'CMake 命令', default: 'configure' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 120000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
  })

  registerFn({
    name: 'Gradle',
    displayName: 'Gradle',
    description: 'Gradle 构建工具。Java/Kotlin/Android 项目构建。',
    category: TOOL_CATEGORIES.BUILDER.id,
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Gradle 任务（如 build, test, clean）', default: 'build' },
        options: { type: 'string', description: '额外选项（如 --info, --no-daemon）' },
        buildFile: { type: 'string', description: 'build.gradle 路径' },
        daemon: { type: 'boolean', description: '使用 Gradle Daemon', default: true },
        parallel: { type: 'boolean', description: '并行执行', default: false },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 300000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['gradle'],
  })

  registerFn({
    name: 'Maven',
    displayName: 'Maven',
    description: 'Apache Maven 构建工具。Java 项目构建和依赖管理。',
    category: TOOL_CATEGORIES.BUILDER.id,
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'Maven 目标（如 compile, test, package, install）', default: 'compile' },
        phase: { type: 'string', description: '生命周期阶段' },
        options: { type: 'string', description: '额外选项（如 -DskipTests, --offline）' },
        pomFile: { type: 'string', description: 'pom.xml 路径' },
        threads: { type: 'string', description: '并行线程数（如 2C）' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 300000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['mvn', 'maven'],
  })

  registerFn({
    name: 'Webpack',
    displayName: 'Webpack',
    description: 'Webpack 模块打包器。打包 JavaScript 应用。',
    category: TOOL_CATEGORIES.BUILDER.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['build', 'watch', 'serve', 'info'], description: '命令', default: 'build' },
        config: { type: 'string', description: '配置文件路径' },
        mode: { type: 'string', enum: ['production', 'development'], description: '构建模式', default: 'production' },
        options: { type: 'string', description: '额外选项' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 120000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['webpack'],
  })

  registerFn({
    name: 'Vite',
    displayName: 'Vite',
    description: 'Vite 构建工具。快速的下一代前端构建工具。',
    category: TOOL_CATEGORIES.BUILDER.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['build', 'dev', 'preview', 'optimize'], description: '命令', default: 'build' },
        config: { type: 'string', description: '配置文件路径' },
        mode: { type: 'string', description: '环境模式', default: 'production' },
        options: { type: 'string', description: '额外选项' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 120000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['vite'],
  })

  registerFn({
    name: 'Bazel',
    displayName: 'Bazel',
    description: 'Bazel 构建系统。多语言、高性能构建工具。',
    category: TOOL_CATEGORIES.BUILDER.id,
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '构建目标（如 //src:app, //...' },
        command: { type: 'string', enum: ['build', 'test', 'run', 'query', 'clean'], description: '命令', default: 'build' },
        options: { type: 'string', description: '额外选项' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 300000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['bazel'],
  })

  registerFn({
    name: 'Ninja',
    displayName: 'Ninja',
    description: 'Ninja 构建系统。极快的构建工具。',
    category: TOOL_CATEGORIES.BUILDER.id,
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '构建目标', default: 'all' },
        jobs: { type: 'number', description: '并行任务数' },
        options: { type: 'string', description: '额外选项' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 300000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['ninja'],
  })

  registerFn({
    name: 'Scons',
    displayName: 'SCons',
    description: 'SCons 构建工具。Python 写的软件构建工具。',
    category: TOOL_CATEGORIES.BUILDER.id,
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '构建目标' },
        options: { type: 'string', description: '额外选项' },
        clean: { type: 'boolean', description: '清理后构建', default: false },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 300000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['scons'],
  })
}

// ==================== 包管理器 ====================

/**
 * 注册包管理器工具
 */
function registerPackageTools(registerFn: (config: ToolRegistrationConfig) => void): void {
  registerFn({
    name: 'Cargo',
    displayName: 'Cargo',
    description: 'Rust Cargo 包管理器和构建工具。管理依赖和构建项目。',
    category: TOOL_CATEGORIES.PACKAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['build', 'run', 'test', 'check', 'update', 'add', 'remove', 'search', 'publish', 'doc', 'fmt', 'clippy'], description: 'cargo 命令' },
        package: { type: 'string', description: '包名' },
        version: { type: 'string', description: '版本约束' },
        options: { type: 'string', description: '额外选项' },
        release: { type: 'boolean', description: '发布模式', default: false },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 300000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['cargo'],
  })

  registerFn({
    name: 'Poetry',
    displayName: 'Poetry',
    description: 'Python Poetry 包管理器。现代化的 Python 依赖管理。',
    category: TOOL_CATEGORIES.PACKAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['install', 'add', 'remove', 'update', 'lock', 'build', 'publish', 'run', 'shell'], description: 'poetry 命令' },
        package: { type: 'string', description: '包名' },
        version: { type: 'string', description: '版本约束' },
        options: { type: 'string', description: '额外选项' },
        dev: { type: 'boolean', description: '开发依赖', default: false },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 180000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['poetry'],
  })

  registerFn({
    name: 'NuGet',
    displayName: 'NuGet',
    description: '.NET NuGet 包管理器。管理 .NET 依赖包。',
    category: TOOL_CATEGORIES.PACKAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['install', 'update', 'uninstall', 'list', 'search', 'pack', 'push', 'restore'], description: 'nuget 命令' },
        package: { type: 'string', description: '包名' },
        version: { type: 'string', description: '版本' },
        source: { type: 'string', description: '包源 URL' },
        options: { type: 'string', description: '额外选项' },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 120000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['nuget'],
  })

  registerFn({
    name: 'Brew',
    displayName: 'Homebrew',
    description: 'macOS/Linux Homebrew 包管理器。管理系统软件包。',
    category: TOOL_CATEGORIES.PACKAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['install', 'uninstall', 'update', 'upgrade', 'list', 'search', 'info', 'doctor', 'cleanup'], description: 'brew 命令' },
        formula: { type: 'string', description: '软件包名' },
        options: { type: 'string', description: '额外选项' },
        outdated: { type: 'boolean', description: '检查过期包', default: false },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 180000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['brew', 'homebrew'],
  })

  registerFn({
    name: 'Apt',
    displayName: 'APT',
    description: 'Debian/Ubuntu APT 包管理器。管理系统软件包。',
    category: TOOL_CATEGORIES.PACKAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['install', 'remove', 'update', 'upgrade', 'search', 'show', 'list', 'autoremove'], description: 'apt 命令' },
        package: { type: 'string', description: '包名' },
        options: { type: 'string', description: '额外选项' },
        assumeYes: { type: 'boolean', description: '自动确认', default: false },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 180000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['apt-get', 'apt'],
  })

  registerFn({
    name: 'Yum',
    displayName: 'Yum/DNF',
    description: 'CentOS/RHEL Yum/DNF 包管理器。管理系统软件包。',
    category: TOOL_CATEGORIES.PACKAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['install', 'remove', 'update', 'upgrade', 'search', 'info', 'list', 'makecache'], description: 'yum/dnf 命令' },
        package: { type: 'string', description: '包名' },
        options: { type: 'string', description: '额外选项' },
        assumeYes: { type: 'boolean', description: '自动确认', default: false },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 180000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['yum', 'dnf'],
  })

  registerFn({
    name: 'Chocolatey',
    displayName: 'Chocolatey',
    description: 'Windows Chocolatey 包管理器。Windows 软件包管理。',
    category: TOOL_CATEGORIES.PACKAGE.id,
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['install', 'uninstall', 'update', 'upgrade', 'list', 'search', 'info', 'outdated'], description: 'choco 命令' },
        package: { type: 'string', description: '包名' },
        version: { type: 'string', description: '版本' },
        options: { type: 'string', description: '额外选项' },
        assumeYes: { type: 'boolean', description: '自动确认', default: false },
        cwd: { type: 'string', description: '工作目录' },
        timeout: { type: 'number', description: '超时时间（毫秒）', default: 300000 },
      },
    },
    isReadOnly: false,
    isConcurrencySafe: false,
    aliases: ['choco', 'chocolatey'],
  })
}
