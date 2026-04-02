/**
 * 流程知识可视化系统 - 类型定义
 */

// ==================== 流程节点 ====================

export type FlowNodeType = 
  | 'start'        // 开始节点
  | 'end'          // 结束节点
  | 'tool'         // 工具调用
  | 'decision'     // 决策节点
  | 'input'        // 输入节点
  | 'output'       // 输出节点
  | 'process'      // 处理节点
  | 'branch'       // 分支节点
  | 'merge'        // 合并节点

export type FlowNodeStatus = 'pending' | 'running' | 'completed' | 'error' | 'skipped'

export interface FlowNodePosition {
  x: number
  y: number
}

export interface FlowNode {
  id: string
  type: FlowNodeType
  label: string
  description?: string
  status: FlowNodeStatus
  toolName?: string
  input?: Record<string, unknown>
  output?: unknown
  duration?: number  // 执行耗时(ms)
  timestamp?: number
  children?: FlowNode[]  // 子流程
  metadata?: Record<string, unknown>
}

export interface FlowEdge {
  id: string
  source: string
  target: string
  label?: string
  type?: 'normal' | 'success' | 'error' | 'conditional'
  condition?: string
}

// ==================== 流程图 ====================

export interface FlowGraph {
  id: string
  name: string
  description?: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  startNode: string
  endNodes: string[]
  totalDuration?: number
  createdAt: Date
  metadata?: {
    model?: string
    iteration?: number
    sessionId?: string
  }
}

// ==================== 知识卡片 ====================

export type KnowledgeType = 
  | 'concept'      // 概念定义
  | 'fact'         // 事实信息
  | 'rule'         // 规则/约束
  | 'pattern'      // 模式/规律
  | 'relationship' // 关系/关联
  | 'procedure'    // 步骤/流程
  | 'example'      // 示例
  | 'warning'      // 警告/注意事项
  | 'tip'          // 技巧/建议
  | 'error'        // 错误/问题

export interface KnowledgeCard {
  id: string
  type: KnowledgeType
  title: string
  content: string
  source?: {
    nodeId?: string
    toolName?: string
    messageIndex?: number
  }
  confidence?: number  // 置信度 0-1
  tags?: string[]
  relatedCards?: string[]  // 关联卡片ID
  metadata?: Record<string, unknown>
}

// ==================== 知识图谱 ====================

export interface KnowledgeGraph {
  id: string
  name: string
  cards: KnowledgeCard[]
  relationships: Array<{
    source: string
    target: string
    type: 'implies' | 'contradicts' | 'similar' | 'part-of' | 'causes'
    label?: string
  }>
  rootConcepts: string[]  // 核心概念ID
  metadata?: Record<string, unknown>
}

// ==================== 解析结果 ====================

export interface ParsedToolInfo {
  toolName: string
  category: string
  description: string
  parameters: Array<{
    name: string
    type: string
    required: boolean
    description?: string
    value?: unknown
  }>
  expectedOutput?: string
}

export interface ParsedResult {
  type: 'success' | 'failure' | 'partial' | 'info'
  summary: string
  details?: string[]
  extractedKnowledge?: KnowledgeCard[]
  metrics?: {
    lines?: number
    files?: number
    errors?: number
    warnings?: number
    duration?: number
  }
}

// ==================== 工具分类定义 ====================

export const TOOL_CATEGORIES: Record<string, { icon: string; color: string; description: string }> = {
  file: {
    icon: '📁',
    color: '#3b82f6',
    description: '文件系统操作'
  },
  shell: {
    icon: '💻',
    color: '#8b5cf6',
    description: 'Shell 命令执行'
  },
  search: {
    icon: '🔍',
    color: '#10b981',
    description: '搜索和查找'
  },
  web: {
    icon: '🌐',
    color: '#06b6d4',
    description: '网络操作'
  },
  git: {
    icon: '📦',
    color: '#f59e0b',
    description: 'Git 版本控制'
  },
  mcp: {
    icon: '🔌',
    color: '#ec4899',
    description: 'MCP 服务'
  },
  agent: {
    icon: '🤖',
    color: '#6366f1',
    description: 'AI Agent'
  },
  config: {
    icon: '⚙️',
    color: '#64748b',
    description: '配置管理'
  },
  other: {
    icon: '📎',
    color: '#78716c',
    description: '其他工具'
  }
}

// ==================== 工具名称到分类的映射 ====================

export const TOOL_CATEGORY_MAP: Record<string, string> = {
  // 文件操作
  'Read': 'file',
  'Write': 'file',
  'Edit': 'file',
  'Delete': 'file',
  'Glob': 'file',
  'Grep': 'search',
  'LSP': 'file',
  'NotebookEdit': 'file',
  'FileRead': 'file',
  'FileWrite': 'file',
  'FileEdit': 'file',
  
  // Shell 操作
  'Bash': 'shell',
  'bash': 'shell',
  'PowerShell': 'shell',
  'Subprocess': 'shell',
  
  // Git 操作
  'Git': 'git',
  'Worktree': 'git',
  
  // Web 操作
  'WebSearch': 'web',
  'WebFetch': 'web',
  'Browser': 'web',
  
  // MCP 服务
  'MCP': 'mcp',
  'MCPTool': 'mcp',
  
  // Agent
  'Agent': 'agent',
  'Task': 'agent',
  
  // 配置
  'Config': 'config',
  'Settings': 'config'
}

// 获取工具分类
export function getToolCategory(toolName: string): string {
  // 处理空值情况
  if (!toolName) {
    return 'other'
  }
  
  // 尝试精确匹配
  if (TOOL_CATEGORY_MAP[toolName]) {
    return TOOL_CATEGORY_MAP[toolName]
  }
  
  // 尝试前缀匹配
  for (const [key, value] of Object.entries(TOOL_CATEGORY_MAP)) {
    if (toolName.toLowerCase().startsWith(key.toLowerCase())) {
      return value
    }
  }
  
  return 'other'
}
