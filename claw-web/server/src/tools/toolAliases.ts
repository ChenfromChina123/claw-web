/**
 * 工具命名规范和别名映射
 * 
 * 统一管理工具名称，确保不同命名风格（PascalCase、snake_case、kebab-case）
 * 都能正确映射到标准工具名称。
 */

/**
 * 标准工具名称列表
 */
export const STANDARD_TOOL_NAMES = [
  'Agent',
  'AskUserQuestion',
  'Bash',
  'Config',
  'ExitPlanMode',
  'FileDelete',
  'FileEdit',
  'FileList',
  'FileRead',
  'FileRename',
  'FileWrite',
  'Glob',
  'Grep',
  'NotebookEdit',
  'SendMessage',
  'Sleep',
  'TaskCreate',
  'TaskList',
  'TodoWrite',
  'WebFetch',
  'WebSearch',
  'Shell',
] as const

export type StandardToolName = typeof STANDARD_TOOL_NAMES[number]

/**
 * 工具别名映射
 * 键是别名，值是标准工具名称
 */
export const TOOL_ALIASES: Record<string, StandardToolName> = {
  // Read/FileRead 别名
  'Read': 'FileRead',
  'read': 'FileRead',
  'file_read': 'FileRead',
  'file-read': 'FileRead',
  
  // Write/FileWrite 别名
  'Write': 'FileWrite',
  'write': 'FileWrite',
  'file_write': 'FileWrite',
  'file-write': 'FileWrite',
  
  // Edit/FileEdit 别名
  'Edit': 'FileEdit',
  'edit': 'FileEdit',
  'file_edit': 'FileEdit',
  'file-edit': 'FileEdit',
  
  // Delete/FileDelete 别名
  'Delete': 'FileDelete',
  'delete': 'FileDelete',
  'file_delete': 'FileDelete',
  'file-delete': 'FileDelete',
  
  // List/FileList 别名
  'List': 'FileList',
  'list': 'FileList',
  'file_list': 'FileList',
  'file-list': 'FileList',
  'ls': 'FileList',
  
  // Rename/FileRename 别名
  'Rename': 'FileRename',
  'rename': 'FileRename',
  'file_rename': 'FileRename',
  'file-rename': 'FileRename',
  'mv': 'FileRename',
  
  // Glob 别名
  'glob': 'Glob',
  'find': 'Glob',
  'file_glob': 'Glob',
  'file-glob': 'Glob',
  
  // Grep 别名
  'grep': 'Grep',
  'search': 'Grep',
  'find_content': 'Grep',
  'find-content': 'Grep',
  
  // Bash 别名
  'bash': 'Bash',
  'shell': 'Bash',
  'exec': 'Bash',
  'run': 'Bash',
  'command': 'Bash',
  
  // WebSearch 别名
  'WebSearch': 'WebSearch',
  'websearch': 'WebSearch',
  'web_search': 'WebSearch',
  'web-search': 'WebSearch',
  'search_web': 'WebSearch',
  
  // WebFetch 别名
  'WebFetch': 'WebFetch',
  'webfetch': 'WebFetch',
  'web_fetch': 'WebFetch',
  'web-fetch': 'WebFetch',
  'fetch': 'WebFetch',
  'curl': 'WebFetch',
  'wget': 'WebFetch',
  
  // TodoWrite 别名
  'TodoWrite': 'TodoWrite',
  'todowrite': 'TodoWrite',
  'todo_write': 'TodoWrite',
  'todo-write': 'TodoWrite',
  'todo': 'TodoWrite',
  'todos': 'TodoWrite',
  
  // TaskCreate 别名
  'TaskCreate': 'TaskCreate',
  'taskcreate': 'TaskCreate',
  'task_create': 'TaskCreate',
  'task-create': 'TaskCreate',
  'task': 'TaskCreate',
  
  // TaskList 别名
  'TaskList': 'TaskList',
  'tasklist': 'TaskList',
  'task_list': 'TaskList',
  'task-list': 'TaskList',
  'list_tasks': 'TaskList',
  
  // Config 别名
  'config': 'Config',
  'get': 'Config',
  'set': 'Config',
  'setting': 'Config',
  'config_get': 'Config',
  'config_set': 'Config',
  
  // Agent 别名
  'agent': 'Agent',
  'subagent': 'Agent',
  'sub_agent': 'Agent',
  'spawn': 'Agent',
  
  // SendMessage 别名
  'sendmessage': 'SendMessage',
  'send_message': 'SendMessage',
  'send-message': 'SendMessage',
  'message': 'SendMessage',
  
  // Sleep 别名
  'sleep': 'Sleep',
  'wait': 'Sleep',
  'delay': 'Sleep',
  
  // NotebookEdit 别名
  'NotebookEdit': 'NotebookEdit',
  'notebookedit': 'NotebookEdit',
  'notebook_edit': 'NotebookEdit',
  'notebook-edit': 'NotebookEdit',
  'ipynb_edit': 'NotebookEdit',
  
  // ExitPlanMode 别名
  'ExitPlanMode': 'ExitPlanMode',
  'exitplanmode': 'ExitPlanMode',
  'exit_plan_mode': 'ExitPlanMode',
  'exit-plan-mode': 'ExitPlanMode',
  'exit': 'ExitPlanMode',
  'approve': 'ExitPlanMode',
  'reject': 'ExitPlanMode',
}

/**
 * 将任意工具名称映射到标准名称
 */
export function normalizeToolName(name: string): StandardToolName | null {
  // 首先检查是否是标准名称
  if (STANDARD_TOOL_NAMES.includes(name as StandardToolName)) {
    return name as StandardToolName
  }
  
  // 检查别名映射
  const normalized = TOOL_ALIASES[name]
  if (normalized) {
    return normalized
  }
  
  return null
}

/**
 * 检查工具名称是否有效
 */
export function isValidToolName(name: string): boolean {
  return normalizeToolName(name) !== null
}

/**
 * 获取工具的标准名称（如果存在别名则返回标准名称）
 */
export function getStandardToolName(name: string): string {
  return normalizeToolName(name) || name
}

/**
 * 根据类别获取推荐的工具名称
 */
export function getRecommendedToolsByCategory(category: string): StandardToolName[] {
  const categoryMap: Record<string, StandardToolName[]> = {
    file: ['FileRead', 'FileWrite', 'FileEdit', 'FileDelete', 'FileList', 'FileRename', 'Glob', 'Grep', 'NotebookEdit'],
    shell: ['Bash', 'Shell'],
    web: ['WebSearch', 'WebFetch'],
    task: ['TodoWrite', 'TaskCreate', 'TaskList'],
    system: ['Config', 'Sleep'],
    agent: ['Agent', 'SendMessage'],
    plan: ['ExitPlanMode'],
    ai: ['AskUserQuestion'],
  }
  
  return categoryMap[category] || []
}
