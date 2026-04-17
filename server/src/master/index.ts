/**
 * Master Entry Point - Master 容器入口
 *
 * 职责：
 * - 启动 Master HTTP 服务器
 * - 启动 Master WebSocket 服务器
 * - 管理容器编排和用户调度
 */

import { isMasterContainer } from '../shared/utils'

if (!isMasterContainer()) {
  console.error('[Master] Error: CONTAINER_ROLE must be set to "master"')
  process.exit(1)
}

console.log('[Master] Starting Master container...')
console.log(`[Master] Role: ${process.env.CONTAINER_ROLE}`)
console.log(`[Master] Node Environment: ${process.env.NODE_ENV || 'development'}`)

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
