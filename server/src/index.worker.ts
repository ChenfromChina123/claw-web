/**
 * Worker Server - 沙箱执行环境（Worker 模式）
 *
 * 功能：
 * - 纯沙箱执行，不连接数据库
 * - 执行 Agent 和工具调用
 * - 管理 PTY 终端会话
 * - 处理流式响应
 *
 * 安全特性：
 * - 所有请求需要 X-Master-Token 验证
 * - 不连接数据库（Master 负责所有 DB 操作）
 * - 命令黑名单验证
 * - 路径沙箱隔离
 *
 * 与 Master 模式的区别：
 * - 不处理用户认证（由 Master 处理）
 * - 不管理会话（由 Master 管理）
 * - 不访问数据库（由 Master 访问）
 * - 只执行 Agent 逻辑和工具
 */

// 调试信息
console.log('[Env] Worker 模式启动...')
console.log('[Env] ANTHROPIC_AUTH_TOKEN exists:', !!process.env.ANTHROPIC_AUTH_TOKEN)
console.log('[Env] ANTHROPIC_AUTH_TOKEN length:', process.env.ANTHROPIC_AUTH_TOKEN?.length)
console.log('[Env] ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL)
console.log('[Env] MASTER_INTERNAL_TOKEN configured:', !!process.env.MASTER_INTERNAL_TOKEN)
console.log('[Env] PTY_ENABLED:', process.env.PTY_ENABLED)
console.log('[Env] PTY_ENABLED (bool):', process.env.PTY_ENABLED === 'true')

// 导入 Worker 入口（内部 API + PTY + Sandbox）
import './worker/index'

console.log('[Worker] Worker process is running')
