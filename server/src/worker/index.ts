/**
 * Worker Entry Point - Worker 容器入口
 *
 * 职责：
 * - 启动 Worker Internal API
 * - 处理来自 Master 的请求
 * - 管理 PTY 和沙箱执行
 */

import { workerInternalAPI } from './server'
import { getWorkerInternalPort } from '../shared/utils'

async function main() {
  console.log('[Worker] Starting Worker container...')
  console.log(`[Worker] Role: ${process.env.CONTAINER_ROLE}`)
  console.log(`[Worker] User: ${process.env.USER || 'unknown'}`)

  const port = getWorkerInternalPort()

  try {
    await workerInternalAPI.start(port)
    console.log(`[Worker] Worker is ready and listening on port ${port}`)
  } catch (error) {
    console.error('[Worker] Failed to start:', error)
    process.exit(1)
  }

  process.on('SIGINT', () => {
    console.log('[Worker] Shutting down...')
    workerInternalAPI.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('[Worker] Received SIGTERM, shutting down...')
    workerInternalAPI.stop()
    process.exit(0)
  })
}

main()
