/**
 * Master Services - Master 服务初始化
 * 
 * 负责初始化所有 Master 端的服务
 */

import { SessionManager } from './sessionManager'
import { wsManager } from '../integration/wsBridge'
import { initializePluginSystem } from '../integrations/plugins'

export async function startMasterServices(): Promise<void> {
  console.log('[Master] Initializing Master services...')

  // 1. 初始化会话管理器
  console.log('[Master] Initializing SessionManager...')
  const sessionManager = SessionManager.getInstance()

  // 2. 初始化 WebSocket 桥接
  console.log('[Master] Initializing WebSocket Bridge...')
  // wsManager 已通过导入初始化

  // 3. 初始化插件系统
  console.log('[Master] Initializing Plugin System...')
  await initializePluginSystem()

  console.log('[Master] All services initialized successfully')
}

export function stopMasterServices(): void {
  console.log('[Master] Stopping Master services...')
  
  // 停止会话管理器
  const sessionManager = SessionManager.getInstance()
  // 添加清理逻辑

  console.log('[Master] All services stopped')
}
