/**
 * API 端点常量定义
 * 统一管理所有后端 API 路径，避免硬编码
 * 
 * 使用规范：
 * 1. 所有 API 路径都以 /api 开头（相对路径，依赖 axios baseURL）
 * 2. 按模块分组，便于查找和维护
 * 3. 支持路径参数替换（使用模板字符串）
 */

/**
 * 认证相关 API
 */
export const AUTH_ENDPOINTS = {
  /** 发送注册验证码 */
  SEND_REGISTER_CODE: '/api/auth/register/send-code',
  /** 用户注册 */
  REGISTER: '/api/auth/register',
  /** 用户登录 */
  LOGIN: '/api/auth/login',
  /** 发送忘记密码验证码 */
  SEND_FORGOT_PASSWORD_CODE: '/api/auth/forgot-password/send-code',
  /** 重置密码 */
  FORGOT_PASSWORD: '/api/auth/forgot-password',
  /** 获取当前用户信息 */
  ME: '/api/auth/me',
  /** GitHub OAuth 登录 */
  GITHUB: '/api/auth/github',
  /** GitHub OAuth 回调 */
  GITHUB_CALLBACK: '/api/auth/github/callback',
} as const

/**
 * 会话管理 API
 */
export const SESSION_ENDPOINTS = {
  /** 获取用户会话列表 */
  LIST: '/api/sessions',
  /** 创建新会话 */
  CREATE: '/api/sessions',
  /** 获取会话详情 */
  DETAIL: (id: string) => `/api/sessions/${id}`,
  /** 更新会话 */
  UPDATE: (id: string) => `/api/sessions/${id}`,
  /** 删除会话 */
  DELETE: (id: string) => `/api/sessions/${id}`,
  /** 清空会话消息 */
  CLEAR: (id: string) => `/api/sessions/${id}/clear`,
  /** 获取会话已打开文件 */
  OPEN_FILES: (id: string) => `/api/sessions/${id}/open-files`,
  /** 保存会话已打开文件 */
  SAVE_OPEN_FILES: (id: string) => `/api/sessions/${id}/open-files`,
  /** 删除会话已打开文件记录 */
  DELETE_OPEN_FILES: (id: string) => `/api/sessions/${id}/open-files`,
  /** 搜索消息 */
  SEARCH_MESSAGES: '/api/sessions/messages/search',
} as const

/**
 * Agent 工作目录 API
 */
export const WORKDIR_ENDPOINTS = {
  /** 获取目录列表 */
  LIST: '/api/agent/workdir/list',
  /** 获取文件内容 */
  CONTENT: '/api/agent/workdir/content',
  /** 保存文件 */
  SAVE: '/api/agent/workdir/save',
  /** 创建文件/文件夹 */
  CREATE: '/api/agent/workdir/create',
  /** 下载文件 */
  DOWNLOAD: '/api/agent/workdir/download',
  /** 下载文件夹（ZIP） */
  DOWNLOAD_ZIP: '/api/agent/workdir/download-zip',
  /** 上传文件 */
  UPLOAD: '/api/agent/workdir/upload',
  /** 删除文件/文件夹 */
  DELETE: '/api/agent/workdir/delete',
} as const

/**
 * Agent 相关 API
 */
export const AGENT_ENDPOINTS = {
  /** 获取 Agent 列表 */
  LIST: '/api/agents',
  /** 获取 Agent 详情 */
  DETAIL: (type: string) => `/api/agents/${type}`,
  /** 获取协调状态 */
  ORCHESTRATION_STATE: '/api/agents/orchestration/state',
  /** 初始化多 Agent 协调 */
  ORCHESTRATION_INIT: '/api/agents/orchestration/init',
  /** 执行 Agent 任务 */
  EXECUTE: '/api/agents/execute',
  /** 中断 Agent */
  INTERRUPT: (agentId: string) => `/api/agents/${agentId}/interrupt`,
  /** 发送消息到 Agent */
  MESSAGE: (agentId: string) => `/api/agents/${agentId}/message`,
  /** 获取有效工作区路径 */
  EFFECTIVE_WORKSPACE: '/api/agent/session/effective-workspace',
} as const

/**
 * 工具管理 API
 */
export const TOOL_ENDPOINTS = {
  /** 获取工具列表 */
  LIST: '/api/tools',
  /** 获取工具详情 */
  DETAIL: (name: string) => `/api/tools/${name}`,
  /** 执行工具 */
  EXECUTE: '/api/tools/execute',
  /** 获取工具执行历史 */
  HISTORY: '/api/tools/history',
  /** 清空工具执行历史 */
  CLEAR_HISTORY: '/api/tools/history/clear',
  /** 验证工具输入 */
  VALIDATE: '/api/tools/validate',
} as const

/**
 * MCP 服务 API
 */
export const MCP_ENDPOINTS = {
  /** 获取 MCP 服务器列表 */
  SERVERS: '/api/mcp/servers',
  /** 添加 MCP 服务器 */
  ADD_SERVER: '/api/mcp/servers',
  /** 移除 MCP 服务器 */
  REMOVE_SERVER: (id: string) => `/api/mcp/servers/${id}`,
  /** 启用/禁用 MCP 服务器 */
  TOGGLE_SERVER: (id: string) => `/api/mcp/servers/${id}/toggle`,
  /** 测试 MCP 服务器连接 */
  TEST_SERVER: (id: string) => `/api/mcp/servers/${id}/test`,
  /** 获取 MCP 工具列表 */
  TOOLS: '/api/mcp/tools',
  /** 调用 MCP 工具 */
  CALL: '/api/mcp/call',
  /** 获取 MCP 状态 */
  STATUS: '/api/mcp/status',
} as const

/**
 * 监控与诊断 API
 */
export const MONITORING_ENDPOINTS = {
  /** 性能统计 */
  PERFORMANCE: '/api/monitoring/performance',
  /** 资源使用情况 */
  RESOURCES: '/api/monitoring/resources',
  /** 系统健康状态 */
  HEALTH: '/api/monitoring/health',
  /** 容器状态 */
  CONTAINERS: '/api/monitoring/containers',
  /** 健康检查 */
  DIAGNOSTICS_HEALTH: '/api/diagnostics/health',
  /** 组件详细信息 */
  DIAGNOSTICS_COMPONENTS: '/api/diagnostics/components',
} as const

/**
 * 工作区管理 API
 */
export const WORKSPACE_ENDPOINTS = {
  /** 上传文件到工作区 */
  UPLOAD: (sessionId: string) => `/api/workspace/${sessionId}/upload`,
  /** 获取工作区文件列表 */
  FILES: (sessionId: string) => `/api/workspace/${sessionId}/files`,
  /** 删除工作区文件 */
  DELETE_FILE: (sessionId: string, filename: string) => `/api/workspace/${sessionId}/files/${filename}`,
  /** 获取工作区信息 */
  INFO: (sessionId: string) => `/api/workspace/${sessionId}`,
  /** 清空工作区 */
  CLEAR: (sessionId: string) => `/api/workspace/${sessionId}`,
} as const

/**
 * 提示词模板 API
 */
export const PROMPT_TEMPLATE_ENDPOINTS = {
  /** 获取所有分类 */
  CATEGORIES: '/api/prompt-templates/categories',
  /** 创建分类 */
  CREATE_CATEGORY: '/api/prompt-templates/categories',
  /** 更新分类 */
  UPDATE_CATEGORY: (id: string) => `/api/prompt-templates/categories/${id}`,
  /** 删除分类 */
  DELETE_CATEGORY: (id: string) => `/api/prompt-templates/categories/${id}`,
  /** 获取模板列表 */
  LIST: '/api/prompt-templates',
  /** 创建模板 */
  CREATE: '/api/prompt-templates',
  /** 获取单个模板 */
  DETAIL: (id: string) => `/api/prompt-templates/${id}`,
  /** 更新模板 */
  UPDATE: (id: string) => `/api/prompt-templates/${id}`,
  /** 删除模板 */
  DELETE: (id: string) => `/api/prompt-templates/${id}`,
  /** 切换收藏状态 */
  FAVORITE: (id: string) => `/api/prompt-templates/${id}/favorite`,
  /** 使用模板 */
  USE: (id: string) => `/api/prompt-templates/${id}/use`,
} as const

/**
 * Skills 技能 API
 */
export const SKILL_ENDPOINTS = {
  /** 列出所有技能 */
  LIST: '/api/skills',
  /** 获取技能详情 */
  DETAIL: (id: string) => `/api/skills/${id}`,
  /** 启用/禁用技能 */
  TOGGLE: (id: string) => `/api/skills/${id}/toggle`,
  /** 获取所有类别 */
  CATEGORIES: '/api/skills/categories',
  /** 获取统计信息 */
  STATS: '/api/skills/stats',
  /** 从 URL 导入技能 */
  IMPORT_URL: '/api/skills/import/url',
  /** 上传技能文件 */
  IMPORT_FILE: '/api/skills/import/file',
  /** 验证技能内容 */
  VALIDATE: '/api/skills/validate',
} as const

/**
 * 用户等级 API
 */
export const TIER_ENDPOINTS = {
  /** 获取所有配额配置 */
  QUOTAS: '/api/tier/quotas',
  /** 获取当前用户等级和配额 */
  MY_QUOTA: '/api/tier/my-quota',
  /** 更新用户等级（管理员） */
  UPDATE_USER: (userId: string) => `/api/tier/update/${userId}`,
  /** 设置自定义配额（管理员） */
  CUSTOM_QUOTA: (userId: string) => `/api/tier/custom-quota/${userId}`,
  /** 获取用户资源使用统计 */
  USAGE_STATS: (userId: string) => `/api/tier/usage-stats/${userId}`,
  /** 获取所有用户等级列表（管理员） */
  USERS: '/api/tier/users',
} as const

/**
 * 快照管理 API
 */
export const SNAPSHOT_ENDPOINTS = {
  /** 获取用户快照列表 */
  LIST: '/api/snapshots',
  /** 创建新快照 */
  CREATE: '/api/snapshots',
  /** 获取快照详情 */
  DETAIL: (snapshotId: string) => `/api/snapshots/${snapshotId}`,
  /** 删除快照 */
  DELETE: (snapshotId: string) => `/api/snapshots/${snapshotId}`,
  /** 恢复快照 */
  RESTORE: (snapshotId: string) => `/api/snapshots/${snapshotId}/restore`,
} as const

/**
 * 导出与分享 API
 */
export const EXPORT_ENDPOINTS = {
  /** 导出为 Markdown */
  MARKDOWN: '/api/export/markdown',
  /** 导出为 HTML */
  HTML: '/api/export/html',
  /** 导出为 JSON */
  JSON: '/api/export/json',
  /** 分享会话 */
  SHARE: '/api/share',
  /** 获取分享内容 */
  SHARE_DETAIL: (shareCode: string) => `/api/share/${shareCode}`,
  /** 删除分享 */
  SHARE_DELETE: (shareId: string) => `/api/share/${shareId}`,
  /** 获取用户分享列表 */
  SHARE_LIST: '/api/share/user/list',
} as const

/**
 * 部署管理 API
 */
export const DEPLOYMENT_ENDPOINTS = {
  /** 创建部署 */
  CREATE: '/api/deployments',
  /** 获取部署列表 */
  LIST: '/api/deployments',
  /** 获取部署详情 */
  DETAIL: (projectId: string) => `/api/deployments/${projectId}`,
  /** 启动部署 */
  START: (projectId: string) => `/api/deployments/${projectId}/start`,
  /** 停止部署 */
  STOP: (projectId: string) => `/api/deployments/${projectId}/stop`,
  /** 重启部署 */
  RESTART: (projectId: string) => `/api/deployments/${projectId}/restart`,
  /** 删除部署 */
  DELETE: (projectId: string) => `/api/deployments/${projectId}`,
  /** 获取部署日志 */
  LOGS: (projectId: string) => `/api/deployments/${projectId}/logs`,
  /** 获取部署状态 */
  STATUS: (projectId: string) => `/api/deployments/${projectId}/status`,
} as const

/**
 * 外部访问 API
 */
export const EXTERNAL_ACCESS_ENDPOINTS = {
  /** 创建域名 */
  CREATE_DOMAIN: '/api/external-access/domain',
  /** 验证域名 */
  VERIFY_DOMAIN: '/api/external-access/domain/verify',
  /** 配置 SSL */
  SSL: '/api/external-access/ssl',
  /** 创建隧道 */
  TUNNEL: '/api/external-access/tunnel',
  /** 配置代理 */
  PROXY: '/api/external-access/proxy',
} as const

/**
 * 容器管理 API（管理员）
 */
export const CONTAINER_ADMIN_ENDPOINTS = {
  /** 获取容器列表 */
  LIST: '/api/admin/containers',
  /** 获取容器详情 */
  DETAIL: (containerId: string) => `/api/admin/containers/${containerId}`,
  /** 启动容器 */
  START: (containerId: string) => `/api/admin/containers/${containerId}/start`,
  /** 停止容器 */
  STOP: (containerId: string) => `/api/admin/containers/${containerId}/stop`,
  /** 重启容器 */
  RESTART: (containerId: string) => `/api/admin/containers/${containerId}/restart`,
  /** 删除容器 */
  DELETE: (containerId: string) => `/api/admin/containers/${containerId}`,
  /** 清理容器 */
  PRUNE: '/api/admin/containers/prune',
  /** 获取容器池统计 */
  POOL_STATS: '/api/admin/pool/stats',
} as const

/**
 * 所有端点的聚合对象（便于统一导出）
 */
export const API_ENDPOINTS = {
  AUTH: AUTH_ENDPOINTS,
  SESSION: SESSION_ENDPOINTS,
  WORKDIR: WORKDIR_ENDPOINTS,
  AGENT: AGENT_ENDPOINTS,
  TOOL: TOOL_ENDPOINTS,
  MCP: MCP_ENDPOINTS,
  MONITORING: MONITORING_ENDPOINTS,
  WORKSPACE: WORKSPACE_ENDPOINTS,
  PROMPT_TEMPLATE: PROMPT_TEMPLATE_ENDPOINTS,
  SKILL: SKILL_ENDPOINTS,
  TIER: TIER_ENDPOINTS,
  SNAPSHOT: SNAPSHOT_ENDPOINTS,
  EXPORT: EXPORT_ENDPOINTS,
  DEPLOYMENT: DEPLOYMENT_ENDPOINTS,
  EXTERNAL_ACCESS: EXTERNAL_ACCESS_ENDPOINTS,
  CONTAINER_ADMIN: CONTAINER_ADMIN_ENDPOINTS,
} as const

/**
 * 端点类型推导（用于类型安全）
 */
export type ApiEndpoints = typeof API_ENDPOINTS
