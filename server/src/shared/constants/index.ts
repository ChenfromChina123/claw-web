/**
 * Shared Constants - Master 和 Worker 共用的常量定义
 */

export const DEFAULT_WORKER_PORT = 4000

export const DEFAULT_MASTER_PORT = 3000

export const DEFAULT_WORKSPACE_DIR = '/workspace'

export const INTERNAL_API_PATHS = {
  EXEC: '/internal/exec',
  PTY_CREATE: '/internal/pty/create',
  PTY_WRITE: '/internal/pty/write',
  PTY_RESIZE: '/internal/pty/resize',
  PTY_DESTROY: '/internal/pty/destroy',
  FILE_READ: '/internal/file/read',
  FILE_WRITE: '/internal/file/write',
  FILE_LIST: '/internal/file/list',
  HEALTH: '/internal/health',
} as const

export const CONTAINER_ROLE = {
  MASTER: 'master',
  WORKER: 'worker',
} as const

export const WS_MESSAGE_TYPES = {
  USER_MESSAGE: 'user_message',
  EXECUTE_COMMAND: 'execute_command',
  PTY_CREATE: 'pty_create',
  PTY_INPUT: 'pty_input',
  PTY_RESIZE: 'pty_resize',
  PTY_OUTPUT: 'pty_output',
  PTY_CLOSED: 'pty_closed',
  ERROR: 'error',
  RESULT: 'result',
  TASK_STATUS_CHANGED: 'task_status_changed',
} as const

export const ANTHROPIC_EVENT_TYPES = {
  MESSAGE_START: 'message_start',
  MESSAGE_DELTA: 'message_delta',
  MESSAGE_STOP: 'message_stop',
  CONTENT_BLOCK_START: 'content_block_start',
  CONTENT_BLOCK_DELTA: 'content_block_delta',
  CONTENT_BLOCK_STOP: 'content_block_stop',
  TOOL_USE: 'tool_use',
  TOOL_INPUT_DELTA: 'tool_input_delta',
  TOOL_START: 'tool_start',
  TOOL_END: 'tool_end',
  TOOL_ERROR: 'tool_error',
  TOOL_PROGRESS: 'tool_progress',
  CONVERSATION_END: 'conversation_end',
  MESSAGE_SAVED: 'message_saved',
  AGENT_PUSH: 'agent_push',
  ERROR: 'error',
} as const

export const ERROR_CODES = {
  CONTAINER_UNAVAILABLE: 'CONTAINER_UNAVAILABLE',
  EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT',
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export const DEFAULT_TIMEOUTS = {
  EXEC: 30000,
  PTY_IDLE: 300000,
  WORKER_HEALTH_CHECK: 15000,
} as const

export const RESOURCE_LIMITS = {
  WORKER: {
    MAX_MEMORY_MB: 256,
    MAX_THREADS: 2,
    MAX_OPEN_FILES: 100,
    MAX_PROCESSES: 50,
  },
} as const
