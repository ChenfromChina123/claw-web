/**
 * Master Entry Point - Master 容器入口
 *
 * 职责：
 * - 启动 Master HTTP 服务器
 * - 启动 Master WebSocket 服务器
 * - 管理容器编排和用户调度
 */

import { isMasterContainer, isUsingDefaultToken } from '../shared/utils'

if (!isMasterContainer()) {
  console.error('[Master] Error: CONTAINER_ROLE must be set to "master"')
  process.exit(1)
}

console.log('[Master] Starting Master container...')
console.log(`[Master] Role: ${process.env.CONTAINER_ROLE}`)
console.log(`[Master] Node Environment: ${process.env.NODE_ENV || 'development'}`)

if (isUsingDefaultToken()) {
  console.warn(
    '[Master] ⚠️ 安全警告：MASTER_INTERNAL_TOKEN 使用了默认值或未配置！\n' +
    '  这会导致 Master-Worker 通信存在安全风险。\n' +
    '  请在 .env 文件中设置自定义的 MASTER_INTERNAL_TOKEN。\n' +
    '  系统已自动生成随机 Token 作为临时措施。'
  )
}

async function main() {
  try {
    console.log('[Master] Initializing services...')
    
    const { startServer } = await import('./server/httpServer')
    const { startMasterServices } = await import('./services/index')

    console.log('[Master] Starting HTTP server...')
    await startServer()

    console.log('[Master] Starting Master services...')
    await startMasterServices()

    console.log('[Master] Master is ready!')
    console.log(`[Master] Listening on port ${process.env.PORT || 3000}`)
  } catch (error) {
    console.error('[Master] Failed to start:', error)
    process.exit(1)
  }
}

main()

process.on('SIGINT', () => {
  console.log('[Master] Shutting down...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('[Master] Received SIGTERM, shutting down...')
  process.exit(0)
})
