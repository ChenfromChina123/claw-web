/**
 * 服务器常量配置
 */

/**
 * 获取HTTP端口（从环境变量或默认值）
 */
export const PORT = parseInt(process.env.PORT || process.env.MASTER_PORT || '3000', 10)

/**
 * 获取WebSocket端口（从环境变量或默认值）
 */
export const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10)

// API 超时配置（毫秒）
export const API_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS || '300000', 10)

/**
 * 获取可用模型列表（从环境变量或默认值）
 * 环境变量 AVAILABLE_MODELS_JSON 可以覆盖默认列表
 */
export const AVAILABLE_MODELS = (() => {
  const defaultModels = [
    { id: 'qwen-plus', name: '通义千问 Plus', provider: 'aliyun', description: '最适合编程和复杂推理' },
    { id: 'qwen-turbo', name: '通义千问 Turbo', provider: 'aliyun', description: '快速响应，适合简单任务' },
    { id: 'qwen-max', name: '通义千问 Max', provider: 'aliyun', description: '最强能力，适合最复杂任务' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', description: 'Anthropic 最强编程模型' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', description: '最通用，最强推理能力' },
  ]
  
  const envModels = process.env.AVAILABLE_MODELS_JSON
  if (envModels) {
    try {
      return JSON.parse(envModels)
    } catch (error) {
      console.error('[Constants] 解析 AVAILABLE_MODELS_JSON 失败，使用默认值:', error)
      return defaultModels
    }
  }
  
  return defaultModels
})()

// 工作目录限制配置
export const WORKDIR_ZIP_MAX_FILES = parseInt(process.env.WORKDIR_ZIP_MAX_FILES || '500', 10)
export const WORKDIR_ZIP_MAX_BYTES = parseInt(process.env.WORKDIR_ZIP_MAX_BYTES || String(500 * 1024 * 1024), 10)

/**
 * 获取前端URL（从环境变量或默认值）
 */
export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'