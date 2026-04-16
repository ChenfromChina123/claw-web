/**
 * 统一错误码定义
 * Master 和 Worker 共用的错误码枚举（必须保持两端同步）
 * 
 * 错误码命名规范：
 * - 大写字母 + 下划线
 * - 按模块分类前缀
 * - 语义化描述错误类型
 */

/**
 * 通用错误码（所有模块共用）
 */
export enum CommonErrorCode {
  /** 未知错误 */
  UNKNOWN = 'UNKNOWN_ERROR',
  /** 内部服务器错误 */
  INTERNAL_SERVER = 'INTERNAL_SERVER_ERROR',
  /** 未认证或认证失败 */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** 权限不足 */
  FORBIDDEN = 'FORBIDDEN',
  /** 资源不存在 */
  NOT_FOUND = 'NOT_FOUND',
  /** 请求参数无效 */
  INVALID_PARAMS = 'INVALID_PARAMS',
  /** 请求方法不允许 */
  METHOD_NOT_ALLOWED = 'METHOD_NOT_ALLOWED',
  /** 请求超时 */
  TIMEOUT = 'TIMEOUT',
  /** 速率限制 */
  RATE_LIMIT = 'RATE_LIMIT',
  /** 服务不可用 */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  /** 冲突（资源已存在） */
  CONFLICT = 'CONFLICT',
  /** 无效的请求体 */
  INVALID_REQUEST_BODY = 'INVALID_REQUEST_BODY',
}

/**
 * 认证相关错误码
 */
export enum AuthErrorCode {
  /** 无效的认证令牌 */
  INVALID_TOKEN = 'INVALID_TOKEN',
  /** 认证令牌已过期 */
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  /** 未提供认证令牌 */
  NO_TOKEN = 'NO_TOKEN',
  /** 用户名或密码错误 */
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  /** 用户不存在 */
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  /** 用户已被禁用 */
  USER_DISABLED = 'USER_DISABLED',
  /** 邮箱已被注册 */
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  /** 用户名已被占用 */
  USERNAME_ALREADY_EXISTS = 'USERNAME_ALREADY_EXISTS',
  /** 验证码无效 */
  INVALID_VERIFICATION_CODE = 'INVALID_VERIFICATION_CODE',
  /** 验证码已过期 */
  VERIFICATION_CODE_EXPIRED = 'VERIFICATION_CODE_EXPIRED',
}

/**
 * 会话相关错误码
 */
export enum SessionErrorCode {
  /** 会话不存在 */
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  /** 会话已过期 */
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  /** 会话已结束 */
  SESSION_ENDED = 'SESSION_ENDED',
  /** 会话已锁定 */
  SESSION_LOCKED = 'SESSION_LOCKED',
  /** 创建会话失败 */
  CREATE_SESSION_FAILED = 'CREATE_SESSION_FAILED',
  /** 更新会话失败 */
  UPDATE_SESSION_FAILED = 'UPDATE_SESSION_FAILED',
  /** 删除会话失败 */
  DELETE_SESSION_FAILED = 'DELETE_SESSION_FAILED',
  /** 获取会话列表失败 */
  GET_SESSIONS_FAILED = 'GET_SESSIONS_FAILED',
  /** 清空会话消息失败 */
  CLEAR_SESSION_FAILED = 'CLEAR_SESSION_FAILED',
  /** 搜索消息失败 */
  SEARCH_MESSAGES_FAILED = 'SEARCH_MESSAGES_FAILED',
  /** 获取打开文件失败 */
  GET_OPEN_FILES_FAILED = 'GET_OPEN_FILES_FAILED',
  /** 保存打开文件失败 */
  SAVE_OPEN_FILES_FAILED = 'SAVE_OPEN_FILES_FAILED',
}

/**
 * 工具相关错误码
 */
export enum ToolErrorCode {
  /** 工具不存在 */
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  /** 工具输入无效 */
  INVALID_TOOL_INPUT = 'INVALID_TOOL_INPUT',
  /** 工具执行失败 */
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  /** 获取工具列表失败 */
  GET_TOOLS_FAILED = 'GET_TOOLS_FAILED',
  /** 获取工具详情失败 */
  GET_TOOL_FAILED = 'GET_TOOL_FAILED',
  /** 获取工具历史失败 */
  GET_TOOL_HISTORY_FAILED = 'GET_TOOL_HISTORY_FAILED',
  /** 清空工具历史失败 */
  CLEAR_TOOL_HISTORY_FAILED = 'CLEAR_TOOL_HISTORY_FAILED',
  /** 工具权限不足 */
  TOOL_PERMISSION_DENIED = 'TOOL_PERMISSION_DENIED',
}

/**
 * Agent 相关错误码
 */
export enum AgentErrorCode {
  /** Agent 不存在 */
  AGENT_NOT_FOUND = 'AGENT_NOT_FOUND',
  /** Agent 执行失败 */
  AGENT_EXECUTION_FAILED = 'AGENT_EXECUTION_FAILED',
  /** Agent 中断失败 */
  AGENT_INTERRUPT_FAILED = 'AGENT_INTERRUPT_FAILED',
  /** Agent 消息发送失败 */
  AGENT_MESSAGE_FAILED = 'AGENT_MESSAGE_FAILED',
  /** Agent 协调失败 */
  AGENT_ORCHESTRATION_FAILED = 'AGENT_ORCHESTRATION_FAILED',
  /** Agent 初始化失败 */
  AGENT_INIT_FAILED = 'AGENT_INIT_FAILED',
  /** Agent 超时 */
  AGENT_TIMEOUT = 'AGENT_TIMEOUT',
  /** Agent 已被取消 */
  AGENT_CANCELLED = 'AGENT_CANCELLED',
  /** 获取 Agent 列表失败 */
  GET_AGENTS_FAILED = 'GET_AGENTS_FAILED',
  /** 获取 Agent 详情失败 */
  GET_AGENT_FAILED = 'GET_AGENT_FAILED',
}

/**
 * 工作目录相关错误码
 */
export enum WorkdirErrorCode {
  /** 文件不存在 */
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  /** 目录不存在 */
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',
  /** 文件已存在 */
  FILE_ALREADY_EXISTS = 'FILE_ALREADY_EXISTS',
  /** 路径不安全 */
  UNSAFE_PATH = 'UNSAFE_PATH',
  /** 读取文件失败 */
  READ_FILE_FAILED = 'READ_FILE_FAILED',
  /** 写入文件失败 */
  WRITE_FILE_FAILED = 'WRITE_FILE_FAILED',
  /** 删除文件失败 */
  DELETE_FILE_FAILED = 'DELETE_FILE_FAILED',
  /** 列出目录失败 */
  LIST_DIRECTORY_FAILED = 'LIST_DIRECTORY_FAILED',
  /** 创建文件失败 */
  CREATE_FILE_FAILED = 'CREATE_FILE_FAILED',
  /** 上传文件失败 */
  UPLOAD_FILE_FAILED = 'UPLOAD_FILE_FAILED',
  /** 下载文件失败 */
  DOWNLOAD_FILE_FAILED = 'DOWNLOAD_FILE_FAILED',
  /** 文件过大 */
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  /** 无效的文件类型 */
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
}

/**
 * PTY 相关错误码
 */
export enum PTYErrorCode {
  /** PTY 会话不存在 */
  PTY_NOT_FOUND = 'PTY_NOT_FOUND',
  /** PTY 创建失败 */
  PTY_CREATE_FAILED = 'PTY_CREATE_FAILED',
  /** PTY 写入失败 */
  PTY_WRITE_FAILED = 'PTY_WRITE_FAILED',
  /** PTY 调整大小失败 */
  PTY_RESIZE_FAILED = 'PTY_RESIZE_FAILED',
  /** PTY 销毁失败 */
  PTY_DESTROY_FAILED = 'PTY_DESTROY_FAILED',
  /** PTY 进程数超限 */
  PTY_LIMIT_EXCEEDED = 'PTY_LIMIT_EXCEEDED',
  /** PTY 超时 */
  PTY_TIMEOUT = 'PTY_TIMEOUT',
}

/**
 * MCP 相关错误码
 */
export enum MCPErrorCode {
  /** MCP 服务器不存在 */
  MCP_SERVER_NOT_FOUND = 'MCP_SERVER_NOT_FOUND',
  /** MCP 工具不存在 */
  MCP_TOOL_NOT_FOUND = 'MCP_TOOL_NOT_FOUND',
  /** MCP 服务器连接失败 */
  MCP_CONNECTION_FAILED = 'MCP_CONNECTION_FAILED',
  /** MCP 调用失败 */
  MCP_CALL_FAILED = 'MCP_CALL_FAILED',
  /** MCP 服务器添加失败 */
  MCP_ADD_SERVER_FAILED = 'MCP_ADD_SERVER_FAILED',
  /** MCP 服务器删除失败 */
  MCP_DELETE_SERVER_FAILED = 'MCP_DELETE_SERVER_FAILED',
  /** MCP 服务器配置无效 */
  MCP_INVALID_CONFIG = 'MCP_INVALID_CONFIG',
}

/**
 * 监控相关错误码
 */
export enum MonitoringErrorCode {
  /** 获取性能统计失败 */
  GET_PERFORMANCE_FAILED = 'GET_PERFORMANCE_FAILED',
  /** 获取资源使用情况失败 */
  GET_RESOURCES_FAILED = 'GET_RESOURCES_FAILED',
  /** 获取健康状态失败 */
  GET_HEALTH_FAILED = 'GET_HEALTH_FAILED',
  /** 获取容器状态失败 */
  GET_CONTAINERS_FAILED = 'GET_CONTAINERS_FAILED',
}

/**
 * Worker 相关错误码
 */
export enum WorkerErrorCode {
  /** Worker 不可用 */
  WORKER_UNAVAILABLE = 'WORKER_UNAVAILABLE',
  /** Worker 连接失败 */
  WORKER_CONNECTION_FAILED = 'WORKER_CONNECTION_FAILED',
  /** Worker 执行失败 */
  WORKER_EXEC_FAILED = 'WORKER_EXEC_FAILED',
  /** Worker 响应超时 */
  WORKER_TIMEOUT = 'WORKER_TIMEOUT',
  /** Worker 未授权（缺少 Master Token） */
  WORKER_UNAUTHORIZED = 'WORKER_UNAUTHORIZED',
  /** Worker 网络隔离 */
  WORKER_NETWORK_ISOLATED = 'WORKER_NETWORK_ISOLATED',
  /** Worker 容器不存在 */
  WORKER_CONTAINER_NOT_FOUND = 'WORKER_CONTAINER_NOT_FOUND',
}

/**
 * 所有错误码的联合类型（用于类型推导）
 */
export type ErrorCode =
  | CommonErrorCode
  | AuthErrorCode
  | SessionErrorCode
  | ToolErrorCode
  | AgentErrorCode
  | WorkdirErrorCode
  | PTYErrorCode
  | MCPErrorCode
  | MonitoringErrorCode
  | WorkerErrorCode

/**
 * 错误详情接口（用于 API 响应）
 */
export interface ErrorDetails {
  /** 错误码 */
  code: ErrorCode
  /** 错误消息 */
  message: string
  /** 详细错误信息（可选，用于开发环境） */
  details?: unknown
  /** 请求 ID（用于追踪） */
  requestId?: string
  /** 错误发生时间 */
  timestamp?: string
}

/**
 * 创建标准错误响应数据
 * 
 * @param code - 错误码
 * @param message - 错误消息
 * @param details - 详细错误信息（可选）
 * @returns 错误详情对象
 */
export function createErrorDetails(
  code: ErrorCode,
  message: string,
  details?: unknown,
  requestId?: string
): ErrorDetails {
  return {
    code,
    message,
    details,
    requestId,
    timestamp: new Date().toISOString(),
  }
}
