/**
 * Shared Types - Master 和 Worker 共用的类型定义
 */

export * from './worker'

export interface User {
  id: string
  username: string
  email: string
  tier: UserTier
  createdAt: Date
  updatedAt: Date
}

export type UserTier = 'free' | 'pro' | 'enterprise'

export interface Session {
  id: string
  userId: string
  title: string
  createdAt: Date
  updatedAt: Date
  messages: Message[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  attachments?: Attachment[]
}

export interface Attachment {
  id: string
  filename: string
  mimeType: string
  size: number
  path: string
}

export interface ContainerInfo {
  id: string
  name: string
  status: 'running' | 'stopped' | 'error'
  hostPort: number
  userId?: string
  createdAt: Date
  lastUsedAt?: Date
}

export interface WorkspaceInfo {
  userId: string
  path: string
  quota: WorkspaceQuota
}

export interface WorkspaceQuota {
  maxStorageMB: number
  maxSessions: number
  maxPtyProcesses: number
  maxFiles: number
  maxFileSizeMB: number
}

export interface WorkerConfig {
  port: number
  workspaceDir: string
  maxMemoryMB: number
  timeout: number
}

export interface InternalAPIRequest {
  type: 'exec' | 'pty_create' | 'pty_write' | 'pty_resize' | 'pty_destroy' | 'file_read' | 'file_write' | 'file_list'
  requestId: string
  userId: string
  payload: unknown
}

export interface InternalAPIResponse {
  requestId: string
  success: boolean
  data?: unknown
  error?: string
}

export interface PTYCreateRequest {
  cols: number
  rows: number
  cwd?: string
}

export interface PTYCreateResponse {
  sessionId: string
  pid: number
}

export interface ExecRequest {
  command: string
  cwd?: string
  env?: Record<string, string>
  timeout?: number
}

export interface ExecResponse {
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

export interface FileReadRequest {
  path: string
  encoding?: 'utf8' | 'base64'
}

export interface FileWriteRequest {
  path: string
  content: string | Buffer
  encoding?: 'utf8' | 'base64'
}

export interface FileListRequest {
  path: string
  recursive?: boolean
}

export interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: Date
}

export interface WSMessage {
  type: 'user_message' | 'execute_command' | 'pty_create' | 'pty_input' | 'pty_resize' | 'pty_output' | 'pty_closed' | 'error' | 'result'
  payload: unknown
  requestId?: string
  sessionId?: string
  timestamp?: number
}

/**
 * Worker WebSocket PTY 消息类型（实时双向通信）
 */
export type WorkerWSPTYMessageType =
  | 'create'
  | 'created'
  | 'input'
  | 'output'
  | 'resize'
  | 'destroy'
  | 'destroyed'
  | 'exec'
  | 'exec_result'
  | 'exit'
  | 'error'

export interface WorkerWSPTYBaseMessage {
  type: WorkerWSPTYMessageType
  requestId?: string
  sessionId?: string
}

export interface WorkerWSPTYCreateMessage extends WorkerWSPTYBaseMessage {
  type: 'create'
  cols: number
  rows: number
  cwd?: string
}

export interface WorkerWSPTYCreatedMessage extends WorkerWSPTYBaseMessage {
  type: 'created'
  sessionId: string
  pid: number
}

export interface WorkerWSPTYInputMessage extends WorkerWSPTYBaseMessage {
  type: 'input'
  sessionId: string
  data: string
}

export interface WorkerWSPTYOutputMessage extends WorkerWSPTYBaseMessage {
  type: 'output'
  sessionId: string
  data: string
}

export interface WorkerWSPTYResizeMessage extends WorkerWSPTYBaseMessage {
  type: 'resize'
  sessionId: string
  cols: number
  rows: number
}

export interface WorkerWSPTYDestroyMessage extends WorkerWSPTYBaseMessage {
  type: 'destroy'
  sessionId: string
}

export interface WorkerWSPTYDestroyedMessage extends WorkerWSPTYBaseMessage {
  type: 'destroyed'
  sessionId: string
  success: boolean
}

export interface WorkerWSPTYExecMessage extends WorkerWSPTYBaseMessage {
  type: 'exec'
  command: string
  cwd?: string
}

export interface WorkerWSPTYExecResultMessage extends WorkerWSPTYBaseMessage {
  type: 'exec_result'
  success: boolean
  data?: { stdout: string; stderr: string; exitCode: number }
  error?: string
}

export interface WorkerWSPTYExitMessage extends WorkerWSPTYBaseMessage {
  type: 'exit'
  sessionId: string
  exitCode: number
}

export interface WorkerWSPTYErrorMessage extends WorkerWSPTYBaseMessage {
  type: 'error'
  error: string
}

export type WorkerWSPTYMessage =
  | WorkerWSPTYCreateMessage
  | WorkerWSPTYCreatedMessage
  | WorkerWSPTYInputMessage
  | WorkerWSPTYOutputMessage
  | WorkerWSPTYResizeMessage
  | WorkerWSPTYDestroyMessage
  | WorkerWSPTYDestroyedMessage
  | WorkerWSPTYExecMessage
  | WorkerWSPTYExecResultMessage
  | WorkerWSPTYExitMessage
  | WorkerWSPTYErrorMessage

export interface WebSocketData {
  userId?: string
  sessionId?: string
  authenticated: boolean
  containerId?: string
}

export type ContainerRole = 'master' | 'worker'

export interface ContainerRuntimeContext {
  role: ContainerRole
  containerId?: string
  userId?: string
  workspacePath?: string
}
