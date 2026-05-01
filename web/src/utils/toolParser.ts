/**
 * 工具解析器 - 深度解析工具输入输出，提取流程和知识
 */

import type {
  ParsedToolInfo,
  ParsedResult,
  KnowledgeCard,
  FlowNode,
  FlowEdge,
  FlowGraph
} from '@/types/flowKnowledge'
import type { ToolCall } from '@/types/tool'
import { getToolCategory, TOOL_CATEGORIES } from '@/types/flowKnowledge'

// ==================== 工具描述模板 ====================

const TOOL_DESCRIPTIONS: Record<string, string> = {
  'Read': '读取文件内容',
  'ReadFile': '读取文件内容',
  'read': '读取文件内容',
  'read_file': '读取文件内容',
  'Write': '写入文件内容',
  'WriteFile': '写入文件内容',
  'write': '写入文件内容',
  'write_file': '写入文件内容',
  'FileWrite': '写入文件',
  'filewrite': '写入文件',
  'Edit': '编辑文件',
  'edit': '编辑文件',
  'EditFile': '编辑文件',
  'edit_file': '编辑文件',
  'Delete': '删除文件',
  'delete': '删除文件',
  'DeleteFile': '删除文件',
  'Glob': '查找匹配的文件',
  'glob': '查找文件',
  'Grep': '在文件中搜索文本',
  'grep': '搜索文本',
  'Bash': '执行 Shell 命令',
  'bash': '执行命令',
  'Shell': '执行 Shell 命令',
  'shell': '执行命令',
  'PowerShell': '执行 PowerShell 命令',
  'powershell': '执行 PowerShell',
  'WebSearch': '网络搜索',
  'web_search': '网络搜索',
  'WebFetch': '获取网页内容',
  'web_fetch': '获取网页',
  'Git': '执行 Git 操作',
  'git': 'Git 操作',
  'MCP': '调用 MCP 服务',
  'Agent': '调用 AI Agent',
  'Todo': '管理待办事项',
  'todo': '待办事项',
  'WebRead': '读取网页内容',
  'webread': '读取网页',
}

// ==================== 工具输入解析器 ====================

interface ParameterInfo {
  name: string
  type: string
  description: string
  required: boolean
  value?: unknown
  isPath?: boolean
}

// 路径相关字段
const PATH_FIELDS = ['path', 'file_path', 'targetPath', 'target_path', 'filePath', 'destPath', 'destination', 'sourcePath', 'source_path', 'dirPath', 'dir_path', 'directory', 'dir', 'file', 'filename', 'name']

// 内容相关字段
const CONTENT_FIELDS = ['content', 'text', 'data', 'body', 'code', 'html', 'css', 'script']

// 命令相关字段
const COMMAND_FIELDS = ['command', 'cmd', 'shell', 'bash', 'script', 'executable']

// 搜索相关字段
const SEARCH_FIELDS = ['query', 'search_term', 'search', 'keyword', 'pattern', 'regex', 'text', 'find']

// 路径提取函数
function extractPathValue(input: Record<string, unknown>, field: string): string | null {
  const value = input[field]
  if (typeof value === 'string' && value.length > 0) {
    // 清理路径格式
    return value.replace(/^["']|["']$/g, '').trim()
  }
  return null
}

// 解析工具输入参数
function parseToolParameters(toolName: string, input: Record<string, unknown>): ParameterInfo[] {
  const params: ParameterInfo[] = []
  const lowerToolName = toolName.toLowerCase()

  // 特殊处理文件读取工具 - 优先显示路径
  if (lowerToolName.includes('read') || lowerToolName.includes('file')) {
    // 查找路径参数
    for (const field of PATH_FIELDS) {
      const pathValue = extractPathValue(input, field)
      if (pathValue) {
        params.push({
          name: 'path',
          type: 'string',
          description: '文件路径',
          required: true,
          value: pathValue,
          isPath: true
        })
        break
      }
    }

    // 查找行数限制参数
    if (input.limit !== undefined || input.maxLines !== undefined || input.max_lines !== undefined) {
      const limitValue = input.limit || input.maxLines || input.max_lines
      params.push({
        name: 'limit',
        type: 'number',
        description: '最大读取行数',
        required: false,
        value: limitValue
      })
    }

    // 查找起始行参数
    if (input.start !== undefined || input.startLine !== undefined || input.start_line !== undefined) {
      const startValue = input.start || input.startLine || input.start_line
      params.push({
        name: 'start',
        type: 'number',
        description: '起始行号',
        required: false,
        value: startValue
      })
    }

    return params
  }

  // 特殊处理文件写入工具
  if (lowerToolName.includes('write') || lowerToolName === 'filewrite') {
    // 路径
    for (const field of PATH_FIELDS) {
      const pathValue = extractPathValue(input, field)
      if (pathValue) {
        params.push({
          name: 'path',
          type: 'string',
          description: '文件路径',
          required: true,
          value: pathValue,
          isPath: true
        })
        break
      }
    }

    // 内容
    for (const field of CONTENT_FIELDS) {
      if (input[field] !== undefined) {
        const contentValue = input[field]
        const displayValue = typeof contentValue === 'string'
          ? (contentValue.length > 150 ? contentValue.substring(0, 150) + '...' : contentValue)
          : String(contentValue)
        params.push({
          name: 'content',
          type: 'string',
          description: '文件内容',
          required: true,
          value: displayValue
        })
        break
      }
    }

    // 追加模式
    if (input.append !== undefined || input.append_mode !== undefined) {
      params.push({
        name: 'append',
        type: 'boolean',
        description: '追加模式',
        required: false,
        value: input.append ?? input.append_mode
      })
    }

    return params
  }

  // 特殊处理文件编辑工具
  if (lowerToolName.includes('edit') || lowerToolName === 'str_replace') {
    // 路径
    for (const field of PATH_FIELDS) {
      const pathValue = extractPathValue(input, field)
      if (pathValue) {
        params.push({
          name: 'path',
          type: 'string',
          description: '文件路径',
          required: true,
          value: pathValue,
          isPath: true
        })
        break
      }
    }

    // 新内容
    if (input.new_content !== undefined) {
      const contentValue = String(input.new_content)
      params.push({
        name: 'new_content',
        type: 'string',
        description: '新内容',
        required: true,
        value: contentValue.length > 150 ? contentValue.substring(0, 150) + '...' : contentValue
      })
    }

    // 旧内容
    if (input.old_string !== undefined) {
      const oldValue = String(input.old_string)
      params.push({
        name: 'old_string',
        type: 'string',
        description: '要替换的内容',
        required: true,
        value: oldValue.length > 100 ? oldValue.substring(0, 100) + '...' : oldValue
      })
    }

    return params
  }

  // 特殊处理搜索工具
  if (lowerToolName.includes('grep') || lowerToolName.includes('search')) {
    for (const field of SEARCH_FIELDS) {
      if (input[field] !== undefined) {
        params.push({
          name: field,
          type: 'string',
          description: field === 'query' || field === 'search' ? '搜索关键词' : field,
          required: true,
          value: input[field]
        })
        break
      }
    }

    // 路径
    for (const field of PATH_FIELDS) {
      const pathValue = extractPathValue(input, field)
      if (pathValue) {
        params.push({
          name: 'path',
          type: 'string',
          description: '搜索目录',
          required: false,
          value: pathValue,
          isPath: true
        })
        break
      }
    }

    return params
  }

  // 特殊处理 Shell 命令
  if (lowerToolName.includes('bash') || lowerToolName.includes('shell') || lowerToolName.includes('powershell')) {
    for (const field of COMMAND_FIELDS) {
      if (input[field] !== undefined) {
        const cmdValue = String(input[field])
        params.push({
          name: 'command',
          type: 'string',
          description: '执行的命令',
          required: true,
          value: cmdValue.length > 200 ? cmdValue.substring(0, 200) + '...' : cmdValue
        })
        break
      }
    }

    // 工作目录
    if (input.working_directory || input.cwd) {
      params.push({
        name: 'cwd',
        type: 'string',
        description: '工作目录',
        required: false,
        value: input.working_directory || input.cwd,
        isPath: true
      })
    }

    // 超时
    if (input.timeout !== undefined) {
      params.push({
        name: 'timeout',
        type: 'number',
        description: '超时时间(ms)',
        required: false,
        value: input.timeout
      })
    }

    return params
  }

  // 通用参数解析
  // 命令
  if (input.command) {
    params.push({
      name: 'command',
      type: 'string',
      description: '要执行的命令',
      required: true,
      value: input.command
    })
  }

  // 路径
  if (input.path) {
    params.push({
      name: 'path',
      type: 'string',
      description: '文件路径',
      required: true,
      value: input.path,
      isPath: true
    })
  }

  if (input.file_path) {
    params.push({
      name: 'file_path',
      type: 'string',
      description: '文件路径',
      required: true,
      value: input.file_path,
      isPath: true
    })
  }

  if (input.filename) {
    params.push({
      name: 'filename',
      type: 'string',
      description: '文件名',
      required: true,
      value: input.filename,
      isPath: true
    })
  }

  // 内容
  if (input.content) {
    params.push({
      name: 'content',
      type: 'string',
      description: '内容',
      required: false,
      value: truncateString(String(input.content), 200)
    })
  }

  if (input.text) {
    params.push({
      name: 'text',
      type: 'string',
      description: '文本内容',
      required: false,
      value: truncateString(String(input.text), 200)
    })
  }

  // 搜索
  if (input.query) {
    params.push({
      name: 'query',
      type: 'string',
      description: '查询内容',
      required: true,
      value: input.query
    })
  }

  if (input.search_term) {
    params.push({
      name: 'search_term',
      type: 'string',
      description: '搜索关键词',
      required: true,
      value: input.search_term
    })
  }

  if (input.pattern) {
    params.push({
      name: 'pattern',
      type: 'string',
      description: '匹配模式',
      required: false,
      value: input.pattern
    })
  }

  if (input.glob) {
    params.push({
      name: 'glob',
      type: 'string',
      description: '文件匹配模式',
      required: false,
      value: input.glob
    })
  }

  if (input.recursive !== undefined) {
    params.push({
      name: 'recursive',
      type: 'boolean',
      description: '是否递归',
      required: false,
      value: input.recursive
    })
  }

  if (input.files_to_read) {
    params.push({
      name: 'files_to_read',
      type: 'string[]',
      description: '要读取的文件列表',
      required: true,
      value: input.files_to_read
    })
  }

  if (input.directory) {
    params.push({
      name: 'directory',
      type: 'string',
      description: '目录路径',
      required: false,
      value: input.directory,
      isPath: true
    })
  }

  if (input.timeout) {
    params.push({
      name: 'timeout',
      type: 'number',
      description: '超时时间(毫秒)',
      required: false,
      value: input.timeout
    })
  }

  if (input.working_directory) {
    params.push({
      name: 'working_directory',
      type: 'string',
      description: '工作目录',
      required: false,
      value: input.working_directory,
      isPath: true
    })
  }

  // 添加其他未知参数（排除已处理的）
  const knownKeys = ['command', 'path', 'file_path', 'filename', 'content', 'text', 'query',
    'search_term', 'pattern', 'glob', 'recursive', 'files_to_read', 'directory',
    'timeout', 'working_directory', 'cwd', 'limit', 'maxLines', 'max_lines', 'start', 'startLine',
    'start_line', 'append', 'append_mode', 'new_content', 'old_string', 'search', 'keyword',
    'regex', 'find', 'maxResults', 'caseSensitive', 'filePattern']

  for (const [key, value] of Object.entries(input)) {
    if (!knownKeys.includes(key) && value !== undefined && value !== null) {
      params.push({
        name: key,
        type: typeof value,
        description: `参数: ${key}`,
        required: false,
        value: typeof value === 'object' ? JSON.stringify(value) : value
      })
    }
  }

  return params
}

// ==================== 工具输出解析器 ====================

interface OutputMetrics {
  lines?: number
  files?: number
  errors?: number
  warnings?: number
  duration?: number
}

// 解析工具输出
function parseToolOutput(_toolName: string, output: unknown): {
  summary: string
  details: string[]
  metrics?: OutputMetrics
  knowledge: KnowledgeCard[]
} {
  const result = {
    summary: '',
    details: [] as string[],
    metrics: undefined as OutputMetrics | undefined,
    knowledge: [] as KnowledgeCard[]
  }
  
  // 处理空输出
  if (output === null || output === undefined) {
    result.summary = '执行完成，无输出'
    return result
  }
  
  // 字符串输出
  if (typeof output === 'string') {
    result.summary = truncateString(output, 150)
    
    // 尝试提取文件列表
    const fileMatches = output.match(/[\w\-.\\/]+\.(ts|tsx|js|jsx|json|md|txt|py|html|css)/gi)
    if (fileMatches) {
      result.metrics = { files: fileMatches.length }
      result.details.push(`涉及 ${fileMatches.length} 个文件`)
    }
    
    // 尝试提取行数
    const lineMatches = output.match(/\d+ lines?/i)
    if (lineMatches) {
      result.metrics = result.metrics || {}
      const lineMatch = output.match(/(\d+) lines?/)
      if (lineMatch) {
        result.metrics.lines = parseInt(lineMatch[1], 10)
      }
    }
    
    // 尝试提取错误
    const errorMatches = output.match(/error/gi)
    if (errorMatches) {
      result.metrics = result.metrics || {}
      result.metrics.errors = errorMatches.length
      result.knowledge.push({
        id: `error-${Date.now()}`,
        type: 'error',
        title: '检测到错误',
        content: output.substring(0, 500),
        confidence: 0.9
      })
    }
    
    return result
  }
  
  // 对象输出
  if (typeof output === 'object') {
    const outputObj = output as Record<string, unknown>
    
    // Git 操作输出
    if (outputObj.stdout || outputObj.output) {
      const stdout = String(outputObj.stdout || outputObj.output)
      result.summary = truncateString(stdout, 150)
      
      // 解析 Git 状态
      if (stdout.includes('modified') || stdout.includes('deleted') || stdout.includes('new file')) {
        const files = stdout.split('\n').filter(line => line.trim())
        result.metrics = { files: files.length }
        result.details.push(`Git 修改了 ${files.length} 个文件`)
        
        // 提取修改的文件
        for (const file of files.slice(0, 5)) {
          result.knowledge.push({
            id: `git-${Date.now()}-${Math.random()}`,
            type: 'fact',
            title: '文件修改',
            content: file.trim(),
            tags: ['git', '修改']
          })
        }
      }
    }
    
    // 文件读取输出
    if (outputObj.content || outputObj.contents) {
      const content = outputObj.content || outputObj.contents
      const contentStr = Array.isArray(content) ? content.join('\n') : String(content)
      result.summary = `读取了 ${contentStr.split('\n').length} 行内容`
      result.metrics = { lines: contentStr.split('\n').length }
    }
    
    // 搜索结果
    if (outputObj.matches || outputObj.results) {
      const matches = outputObj.matches || outputObj.results
      const matchArray = Array.isArray(matches) ? matches : [matches]
      result.summary = `找到 ${matchArray.length} 个匹配结果`
      result.details.push(`共 ${matchArray.length} 处匹配`)
      
      // 提取匹配的文件
      const matchedFiles = new Set<string>()
      for (const match of matchArray.slice(0, 10)) {
        if (typeof match === 'object' && match !== null) {
          const matchObj = match as Record<string, unknown>
          if (matchObj.file_path || matchObj.path || matchObj.file) {
            matchedFiles.add(String(matchObj.file_path || matchObj.path || matchObj.file))
          }
        }
      }
      
      if (matchedFiles.size > 0) {
        result.metrics = { files: matchedFiles.size }
        result.knowledge.push({
          id: `search-${Date.now()}`,
          type: 'fact',
          title: '搜索结果',
          content: `在 ${matchedFiles.size} 个文件中找到匹配`,
          tags: ['搜索', '匹配'],
          metadata: { files: Array.from(matchedFiles) }
        })
      }
    }
    
    // Shell 命令输出
    if (outputObj.exitCode !== undefined || outputObj.exit_code !== undefined) {
      const exitCode = outputObj.exitCode || outputObj.exit_code
      if (exitCode === 0) {
        result.summary = '命令执行成功'
      } else {
        result.summary = `命令执行失败，退出码: ${exitCode}`
        result.metrics = result.metrics || {}
        result.metrics.errors = (result.metrics.errors || 0) + 1
        result.knowledge.push({
          id: `shell-error-${Date.now()}`,
          type: 'error',
          title: 'Shell 命令失败',
          content: `退出码: ${exitCode}`,
          confidence: 1.0
        })
      }
    }
    
    // 错误输出
    if (outputObj.error) {
      result.summary = `错误: ${outputObj.error}`
      result.metrics = result.metrics || {}
      result.metrics.errors = (result.metrics.errors || 0) + 1
      result.knowledge.push({
        id: `error-${Date.now()}`,
        type: 'error',
        title: '执行错误',
        content: String(outputObj.error),
        confidence: 1.0
      })
    }
    
    // 成功标志 - 仅在没有检测到错误时设置
    if ((outputObj.success || outputObj.ok) && !result.metrics?.errors) {
      result.summary = '操作成功完成'
    }
    
    // 总结
    if (!result.summary) {
      result.summary = truncateString(JSON.stringify(output), 100)
    }
  }
  
  return result
}

// ==================== 知识提取器 ====================

// 从工具调用中提取知识
function extractKnowledgeFromTool(toolCall: ToolCall): KnowledgeCard[] {
  const knowledge: KnowledgeCard[] = []
  const category = getToolCategory(toolCall.toolName)
  
  // 提取文件路径
  const input = toolCall.toolInput || {}
  const filePaths: string[] = []
  
  if (input.path) filePaths.push(String(input.path))
  if (input.file_path) filePaths.push(String(input.file_path))
  if (input.filename) filePaths.push(String(input.filename))
  if (input.directory) filePaths.push(String(input.directory))
  
  // 添加文件操作知识
  if (filePaths.length > 0 && ['file', 'git'].includes(category)) {
    for (const path of filePaths) {
      knowledge.push({
        id: `file-${Date.now()}-${Math.random()}`,
        type: 'fact',
        title: '文件操作目标',
        content: path,
        source: { toolName: toolCall.toolName },
        tags: ['file', category]
      })
    }
  }
  
  // 提取命令
  if (input.command) {
    knowledge.push({
      id: `command-${Date.now()}-${Math.random()}`,
      type: 'procedure',
      title: '执行的命令',
      content: String(input.command),
      source: { toolName: toolCall.toolName },
      tags: ['command', 'shell']
    })
  }
  
  // 提取搜索查询
  if (input.query || input.search_term) {
    const query = String(input.query || input.search_term)
    knowledge.push({
      id: `query-${Date.now()}-${Math.random()}`,
      type: 'fact',
      title: '搜索查询',
      content: query,
      source: { toolName: toolCall.toolName },
      tags: ['search', 'query']
    })
  }
  
  // 解析输出中的知识
  if (toolCall.toolOutput) {
    const parsed = parseToolOutput(toolCall.toolName, toolCall.toolOutput)
    knowledge.push(...parsed.knowledge)
  }
  
  return knowledge
}

// ==================== 流程图构建器 ====================

// 从工具调用序列构建流程图
function buildFlowGraph(toolCalls: ToolCall[], sessionId?: string): FlowGraph {
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []
  
  // 添加开始节点
  const startNode: FlowNode = {
    id: 'start',
    type: 'start',
    label: '开始',
    status: 'completed'
  }
  nodes.push(startNode)
  
  let prevNodeId = 'start'
  
  // 添加工具节点
  for (let i = 0; i < toolCalls.length; i++) {
    const tool = toolCalls[i]
    const nodeId = `tool-${i}`
    
    const node: FlowNode = {
      id: nodeId,
      type: 'tool',
      label: TOOL_DESCRIPTIONS[tool.toolName] || tool.toolName,
      status: tool.status === 'completed' ? 'completed' : 
              tool.status === 'error' ? 'error' : 'pending',
      toolName: tool.toolName,
      input: tool.toolInput,
      output: tool.toolOutput
    }
    
    nodes.push(node)
    
    // 添加边
    edges.push({
      id: `edge-${prevNodeId}-${nodeId}`,
      source: prevNodeId,
      target: nodeId
    })
    
    prevNodeId = nodeId
  }
  
  // 添加结束节点
  const endNode: FlowNode = {
    id: 'end',
    type: 'end',
    label: '结束',
    status: 'completed'
  }
  nodes.push(endNode)
  
  edges.push({
    id: `edge-${prevNodeId}-end`,
    source: prevNodeId,
    target: 'end'
  })
  
  return {
    id: sessionId || `flow-${Date.now()}`,
    name: '工具执行流程',
    nodes,
    edges,
    startNode: 'start',
    endNodes: ['end'],
    createdAt: new Date()
  }
}

// ==================== 工具函数 ====================

function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + '...'
}

// ==================== 主解析函数 ====================

// 解析单个工具调用
export function parseToolCall(toolCall: ToolCall): ParsedToolInfo {
  // 处理空值情况
  const toolName = toolCall.toolName || 'unknown'
  const category = getToolCategory(toolName)
  
  return {
    toolName: toolName,
    category,
    description: TOOL_DESCRIPTIONS[toolName] || `${toolName} 操作`,
    parameters: parseToolParameters(toolName, toolCall.toolInput || {}),
    expectedOutput: getExpectedOutput(toolName)
  }
}

// 获取预期输出描述
function getExpectedOutput(toolName: string): string {
  const outputs: Record<string, string> = {
    'Read': '文件内容',
    'Write': '写入结果',
    'Edit': '编辑结果',
    'Glob': '匹配的文件列表',
    'Grep': '搜索匹配结果',
    'Bash': '命令输出',
    'WebSearch': '搜索结果列表',
    'WebFetch': '网页内容',
    'Git': 'Git 操作输出'
  }
  return outputs[toolName] || '操作结果'
}

// 解析工具调用结果
export function parseToolResult(toolCall: ToolCall): ParsedResult {
  const parsed = parseToolOutput(toolCall.toolName, toolCall.toolOutput)
  
  let type: 'success' | 'failure' | 'partial' | 'info' = 'info'
  if (toolCall.status === 'completed') {
    type = parsed.metrics?.errors ? 'partial' : 'success'
  } else if (toolCall.status === 'error') {
    type = 'failure'
  }
  
  return {
    type,
    summary: parsed.summary,
    details: parsed.details,
    extractedKnowledge: parsed.knowledge,
    metrics: parsed.metrics
  }
}

// 解析所有工具调用并生成流程图
export function parseToolCalls(toolCalls: ToolCall[], sessionId?: string): {
  parsedTools: ParsedToolInfo[]
  results: ParsedResult[]
  knowledge: KnowledgeCard[]
  flowGraph: FlowGraph
} {
  const parsedTools = toolCalls.map(parseToolCall)
  const results = toolCalls.map(parseToolResult)
  
  // 收集所有知识
  const allKnowledge: KnowledgeCard[] = []
  for (const tool of toolCalls) {
    allKnowledge.push(...extractKnowledgeFromTool(tool))
  }
  
  // 添加结果中的知识
  for (const result of results) {
    if (result.extractedKnowledge) {
      allKnowledge.push(...result.extractedKnowledge)
    }
  }
  
  // 构建流程图
  const flowGraph = buildFlowGraph(toolCalls, sessionId)
  
  return {
    parsedTools,
    results,
    knowledge: allKnowledge,
    flowGraph
  }
}

// 导出工具类别信息
export { TOOL_CATEGORIES, getToolCategory }
