/**
 * Worker API 类型定义
 * Master 与 Worker 之间的内部通信类型（必须保持两端同步）
 * 
 * 安全要求：
 * - 所有请求必须携带 X-Master-Token 头
 * - Worker 必须网络隔离，无法访问 MySQL
 * - Worker 必须是无状态的
 */

/**
 * Worker 内部 API 请求类型
 */
export type WorkerRequestType = 
  | 'exec'           // 执行命令
  | 'pty_create'     // 创建 PTY
  | 'pty_write'      // 写入 PTY
  | 'pty_resize'     // 调整 PTY 大小
  | 'pty_destroy'    // 销毁 PTY
  | 'file_read'      // 读取文件
  | 'file_write'     // 写入文件
  | 'file_list'      // 列出目录

/**
 * Worker 内部 API 请求基础接口
 */
export interface WorkerBaseRequest {
  /** 请求唯一标识 */
  requestId: string
  /** 用户 ID */
  userId: string
  /** 请求类型 */
  type: WorkerRequestType
}

/**
 * 执行命令请求
 */
export interface WorkerExecRequest extends WorkerBaseRequest {
  type: 'exec'
  payload: {
    /** 要执行的命令 */
    command: string
    /** 工作目录（可选） */
    cwd?: string
    /** 环境变量（可选） */
    env?: Record<string, string>
    /** 超时时间（毫秒，可选） */
    timeout?: number
  }
}

/**
 * 创建 PTY 请求
 */
export interface WorkerPTYCreateRequest extends WorkerBaseRequest {
  type: 'pty_create'
  payload: {
    /** 列数 */
    cols: number
    /** 行数 */
    rows: number
    /** 工作目录（可选） */
    cwd?: string
  }
}

/**
 * 写入 PTY 请求
 */
export interface WorkerPTYWriteRequest extends WorkerBaseRequest {
  type: 'pty_write'
  payload: {
    /** PTY 会话 ID */
    sessionId: string
    /** 要写入的数据 */
    data: string
  }
}

/**
 * 调整 PTY 大小请求
 */
export interface WorkerPTYResizeRequest extends WorkerBaseRequest {
  type: 'pty_resize'
  payload: {
    /** PTY 会话 ID */
    sessionId: string
    /** 列数 */
    cols: number
    /** 行数 */
    rows: number
  }
}

/**
 * 销毁 PTY 请求
 */
export interface WorkerPTYDestroyRequest extends WorkerBaseRequest {
  type: 'pty_destroy'
  payload: {
    /** PTY 会话 ID */
    sessionId: string
  }
}

/**
 * 读取文件请求
 */
export interface WorkerFileReadRequest extends WorkerBaseRequest {
  type: 'file_read'
  payload: {
    /** 文件路径（相对于 /workspace） */
    path: string
    /** 编码格式（默认 utf8） */
    encoding?: 'utf8' | 'base64'
  }
}

/**
 * 写入文件请求
 */
export interface WorkerFileWriteRequest extends WorkerBaseRequest {
  type: 'file_write'
  payload: {
    /** 文件路径（相对于 /workspace） */
    path: string
    /** 文件内容 */
    content: string | Buffer
    /** 编码格式（默认 utf8） */
    encoding?: 'utf8' | 'base64'
  }
}

/**
 * 列出目录请求
 */
export interface WorkerFileListRequest extends WorkerBaseRequest {
  type: 'file_list'
  payload: {
    /** 目录路径（相对于 /workspace） */
    path: string
    /** 是否递归（可选） */
    recursive?: boolean
  }
}

/**
 * Worker 内部 API 请求联合类型
 */
export type WorkerRequest =
  | WorkerExecRequest
  | WorkerPTYCreateRequest
  | WorkerPTYWriteRequest
  | WorkerPTYResizeRequest
  | WorkerPTYDestroyRequest
  | WorkerFileReadRequest
  | WorkerFileWriteRequest
  | WorkerFileListRequest

/**
 * Worker 内部 API 响应基础接口
 */
export interface WorkerBaseResponse {
  /** 请求唯一标识 */
  requestId: string
  /** 是否成功 */
  success: boolean
  /** 响应数据（成功时） */
  data?: unknown
  /** 错误信息（失败时） */
  error?: string
}

/**
 * 执行命令响应
 */
export interface WorkerExecResponse extends WorkerBaseResponse {
  success: boolean
  data?: {
    /** 标准输出 */
    stdout: string
    /** 标准错误 */
    stderr: string
    /** 退出码 */
    exitCode: number
    /** 执行时长（毫秒） */
    duration: number
  }
  error?: string
}

/**
 * 创建 PTY 响应
 */
export interface WorkerPTYCreateResponse extends WorkerBaseResponse {
  success: boolean
  data?: {
    /** PTY 会话 ID */
    sessionId: string
    /** 进程 ID */
    pid: number
  }
  error?: string
}

/**
 * 写入 PTY 响应
 */
export interface WorkerPTYWriteResponse extends WorkerBaseResponse {
  success: boolean
  data?: {
    /** 是否写入成功 */
    written: boolean
  }
  error?: string
}

/**
 * 调整 PTY 大小响应
 */
export interface WorkerPTYResizeResponse extends WorkerBaseResponse {
  success: boolean
  data?: {
    /** 是否调整成功 */
    resized: boolean
  }
  error?: string
}

/**
 * 销毁 PTY 响应
 */
export interface WorkerPTYDestroyResponse extends WorkerBaseResponse {
  success: boolean
  error?: string
}

/**
 * 读取文件响应
 */
export interface WorkerFileReadResponse extends WorkerBaseResponse {
  success: boolean
  data?: {
    /** 文件内容 */
    content: string | Buffer
    /** 编码格式 */
    encoding: string
  }
  error?: string
}

/**
 * 写入文件响应
 */
export interface WorkerFileWriteResponse extends WorkerBaseResponse {
  success: boolean
  error?: string
}

/**
 * 列出目录响应
 */
export interface WorkerFileListResponse extends WorkerBaseResponse {
  success: boolean
  data?: {
    /** 文件/目录列表 */
    items: Array<{
      /** 文件名 */
      name: string
      /** 完整路径 */
      path: string
      /** 是否是目录 */
      isDirectory: boolean
      /** 文件大小（字节） */
      size: number
      /** 修改时间 */
      modifiedAt: Date
    }>
    /** 错误信息（如果有） */
    error?: string
  }
  error?: string
}

/**
 * Worker 内部 API 响应联合类型
 */
export type WorkerResponse =
  | WorkerExecResponse
  | WorkerPTYCreateResponse
  | WorkerPTYWriteResponse
  | WorkerPTYResizeResponse
  | WorkerPTYDestroyResponse
  | WorkerFileReadResponse
  | WorkerFileWriteResponse
  | WorkerFileListResponse

/**
 * Worker 健康检查响应
 */
export interface WorkerHealthResponse {
  /** 状态 */
  status: 'ok' | 'error'
  /** 角色 */
  role: 'worker'
  /** 运行时间（秒） */
  uptime: number
  /** PTY 会话统计 */
  ptySessions: {
    /** 活跃会话数 */
    active: number
    /** 总会话数 */
    total: number
  }
}

/**
 * Worker WebSocket PTY 消息类型（实时双向通信）
 */
export type WorkerWebSocketMessageType =
  | 'create'        // 创建 PTY
  | 'created'       // PTY 创建成功
  | 'input'         // 向 PTY 发送输入
  | 'output'        // PTY 输出
  | 'resize'        // 调整 PTY 大小
  | 'destroy'       // 销毁 PTY
  | 'destroyed'     // PTY 销毁完成
  | 'exec'          // 执行命令
  | 'exec_result'   // 命令执行结果
  | 'exit'          // 进程退出
  | 'error'         // 错误

/**
 * Worker WebSocket 消息基础接口
 */
export interface WorkerWebSocketBaseMessage {
  /** 消息类型 */
  type: WorkerWebSocketMessageType
  /** 请求 ID（可选） */
  requestId?: string
  /** 会话 ID（可选） */
  sessionId?: string
}

/**
 * Worker WebSocket 创建 PTY 消息
 */
export interface WorkerWebSocketCreateMessage extends WorkerWebSocketBaseMessage {
  type: 'create'
  cols: number
  rows: number
  cwd?: string
}

/**
 * Worker WebSocket PTY 创建成功消息
 */
export interface WorkerWebSocketCreatedMessage extends WorkerWebSocketBaseMessage {
  type: 'created'
  sessionId: string
  pid: number
}

/**
 * Worker WebSocket PTY 输入消息
 */
export interface WorkerWebSocketInputMessage extends WorkerWebSocketBaseMessage {
  type: 'input'
  sessionId: string
  data: string
}

/**
 * Worker WebSocket PTY 输出消息
 */
export interface WorkerWebSocketOutputMessage extends WorkerWebSocketBaseMessage {
  type: 'output'
  sessionId: string
  data: string
}

/**
 * Worker WebSocket PTY 调整大小消息
 */
export interface WorkerWebSocketResizeMessage extends WorkerWebSocketBaseMessage {
  type: 'resize'
  sessionId: string
  cols: number
  rows: number
}

/**
 * Worker WebSocket PTY 销毁消息
 */
export interface WorkerWebSocketDestroyMessage extends WorkerWebSocketBaseMessage {
  type: 'destroy'
  sessionId: string
}

/**
 * Worker WebSocket PTY 销毁完成消息
 */
export interface WorkerWebSocketDestroyedMessage extends WorkerWebSocketBaseMessage {
  type: 'destroyed'
  sessionId: string
  success: boolean
}

/**
 * Worker WebSocket 执行命令消息
 */
export interface WorkerWebSocketExecMessage extends WorkerWebSocketBaseMessage {
  type: 'exec'
  command: string
  cwd?: string
}

/**
 * Worker WebSocket 命令执行结果消息
 */
export interface WorkerWebSocketExecResultMessage extends WorkerWebSocketBaseMessage {
  type: 'exec_result'
  success: boolean
  data?: {
    stdout: string
    stderr: string
    exitCode: number
  }
  error?: string
}

/**
 * Worker WebSocket 进程退出消息
 */
export interface WorkerWebSocketExitMessage extends WorkerWebSocketBaseMessage {
  type: 'exit'
  sessionId: string
  exitCode: number
}

/**
 * Worker WebSocket 错误消息
 */
export interface WorkerWebSocketErrorMessage extends WorkerWebSocketBaseMessage {
  type: 'error'
  error: string
}

/**
 * Worker WebSocket 消息联合类型
 */
export type WorkerWebSocketMessage =
  | WorkerWebSocketCreateMessage
  | WorkerWebSocketCreatedMessage
  | WorkerWebSocketInputMessage
  | WorkerWebSocketOutputMessage
  | WorkerWebSocketResizeMessage
  | WorkerWebSocketDestroyMessage
  | WorkerWebSocketDestroyedMessage
  | WorkerWebSocketExecMessage
  | WorkerWebSocketExecResultMessage
  | WorkerWebSocketExitMessage
  | WorkerWebSocketErrorMessage

/**
 * Worker 连接元数据（用于 WebSocket 连接）
 */
export interface WorkerConnectionMetadata {
  /** 用户 ID */
  userId: string
  /** Master Token */
  token: string
  /** PTY 会话 ID 集合 */
  sessions: Set<string>
  /** 连接 URL */
  url: string
}
