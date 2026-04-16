/**
 * Master Server - 主控制服务（Master模式）
 *
 * 功能：
 * - 用户认证与授权
 * - API请求路由到Worker容器
 * - WebSocket连接管理与消息转发
 * - 容器生命周期调度
 * - 资源监控与配额管理
 *
 * 与普通模式的区别：
 * - 不直接处理业务逻辑，而是路由到Worker容器
 * - 管理容器池的生命周期
 * - 提供全局性的管理和监控功能
 */

import { getContainerOrchestrator } from './master/orchestrator/containerOrchestrator'
import { getUserContainerMapper } from './master/orchestrator/userContainerMapper'

// ==================== 主函数 ====================

async function startMasterServer(): Promise<void> {
  console.log('====================================')
  console.log('  Claw-Web Master Service Starting')
  console.log('  Mode: MASTER (Controller)')
  console.log('====================================')

  // 检查运行环境
  const role = process.env.ROLE || 'worker'
  if (role !== 'master') {
    console.warn(`[Master] 当前角色为 ${role}，但以Master模式启动`)
    console.warn('[Master] 请确保 docker-compose.yml 中设置了 ROLE=master')
  }

  try {
    // 1. 初始化容器编排器
    console.log('\n[Master] Step 1: 初始化容器编排器...')
    const orchestrator = getContainerOrchestrator()
    const initResult = await orchestrator.initialize()

    if (!initResult.success) {
      console.error('[Master] 容器编排器初始化失败:', initResult.error)
      console.error('[Master] 将以兼容模式运行（无容器池化）')
      // 可以选择继续运行或退出
    } else {
      console.log('[Master] ✅ 容器编排器初始化成功')

      // 显示热池状态
      const poolStats = orchestrator.getPoolStats()
      console.log(`[Master] 热池状态:`)
      console.log(`  - 总容器数: ${poolStats.totalContainers}`)
      console.log(`  - 空闲容器: ${poolStats.idleContainers}`)
      console.log(`  - 活跃用户: ${poolStats.activeUsers}`)
    }

    // 2. 初始化用户映射管理器
    console.log('\n[Master] Step 2: 初始化用户映射管理器...')
    const mapper = getUserContainerMapper(process.env.WORKSPACE_BASE_DIR)
    const loadedCount = await mapper.loadFromFile()
    console.log(`[Master] ✅ 用户映射管理器就绪 (已加载 ${loadedCount} 个映射)`)

    // 3. 启动HTTP服务器（包含API路由和反向代理）
    console.log('\n[Master] Step 3: 启动HTTP服务器...')
    const { startServer } = await import('./master/server/httpServer')
    await startServer()

    console.log('\n====================================')
    console.log('  ✅ Master Service 启动完成!')
    console.log('  端口: 3000')
    console.log('  模式: Container Orchestration')
    console.log('====================================\n')

    // 4. 注册优雅关闭处理
    setupGracefulShutdown(orchestrator, mapper)

  } catch (error) {
    console.error('\n[Master] ❌ 启动失败:', error)
    process.exit(1)
  }
}

/**
 * 设置优雅关闭处理
 */
function setupGracefulShutdown(
  orchestrator: ReturnType<typeof getContainerOrchestrator>,
  mapper: ReturnType<typeof getUserContainerMapper>
): void {
  const shutdown = async (signal: string) => {
    console.log(`\n[Master] 收到 ${signal} 信号，开始优雅关闭...`)

    try {
      // 1. 停止接受新请求（由httpServer处理）

      // 2. 保存用户映射数据
      console.log('[Master] 保存用户映射数据...')
      await mapper.saveToFile()

      // 3. 关闭容器编排器（不销毁活跃的用户容器）
      console.log('[Master] 关闭容器编排器...')
      await orchestrator.shutdown()

      console.log('[Master] ✅ 优雅关闭完成')
      process.exit(0)

    } catch (error) {
      console.error('[Master] 关闭过程中出错:', error)
      process.exit(1)
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

// 启动服务
startMasterServer().catch((error) => {
  console.error('[Master] 未捕获的错误:', error)
  process.exit(1)
})
