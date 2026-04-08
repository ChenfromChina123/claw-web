/**
 * 服务器常量配置
 */

// HTTP/WebSocket 端口配置
export const PORT = parseInt(process.env.PORT || '3000', 10)
export const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10)

// API 超时配置（毫秒）
export const API_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS || '300000', 10)

// 可用模型列表
export const AVAILABLE_MODELS = [
  { id: 'qwen-plus', name: '通义千问 Plus', provider: 'aliyun', description: '最适合编程和复杂推理' },
  { id: 'qwen-turbo', name: '通义千问 Turbo', provider: 'aliyun', description: '快速响应，适合简单任务' },
  { id: 'qwen-max', name: '通义千问 Max', provider: 'aliyun', description: '最强能力，适合最复杂任务' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', description: 'Anthropic 最强编程模型' },
  { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', description: '最通用，最强推理能力' },
]

// 工作目录限制配置
export const WORKDIR_ZIP_MAX_FILES = 500
export const WORKDIR_ZIP_MAX_BYTES = 500 * 1024 * 1024 // 500MB

// 前端 URL 配置（用于 OAuth 重定向���
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'