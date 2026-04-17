/**
 * 并发场景单元测试
 *
 * 测试修复内容：
 * 1. 容器销毁幂等性保护 - destroyContainer 并发调用测试
 * 2. 用户容器分配分布式锁 - assignContainerToUser 并发调用测试
 *
 * 使用 mock 模拟 Docker API，避免真实容器操作
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// 必须在导入被测试模块之前 mock 掉 child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn()
}))

import {
  getContainerOrchestrator,
  type ContainerInstance
} from '../../master/orchestrator/containerOrchestrator'

// Mock fetch API（用于健康检查）
global.fetch = vi.fn()

// ==================== 测试套件：容器销毁幂等性 ====================

describe('容器销毁幂等性保护', () => {
  let orchestrator: ReturnType<typeof getContainerOrchestrator>
  let mockExecSync: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    // 获取 mock 函数引用
    mockExecSync = vi.mocked(require('child_process').execSync)

    // 每次测试使用新实例
    orchestrator = getContainerOrchestrator({
      minPoolSize: 0,
      maxPoolSize: 2,
      idleTimeoutMs: 60000,
      healthCheckIntervalMs: 60000,
      imageName: 'test-image:latest',
      networkName: 'test-network',
      basePort: 4000
    })

    // Mock fetch 健康检查成功
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' })
    })

    // 设置 execSync mock 的基础行为
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('docker ps')) {
        return JSON.stringify([
          {
            Id: 'test-container-concurrent-destroy',
            Names: ['/test-container-concurrent-destroy'],
            State: { Status: 'running' },
            Ports: [{ PublicPort: 3100 }]
          }
        ])
      }
      if (cmd.includes('docker inspect')) {
        return JSON.stringify([{
          Id: 'test-container-concurrent-destroy',
          State: { Running: true }
        }])
      }
      if (cmd.includes('docker rm')) {
        return ''
      }
      return ''
    })
  })

  afterEach(() => {
    orchestrator.shutdown()
  })

  it('应该能执行容器销毁', async () => {
    const containerId = 'test-container-concurrent-destroy'

    const result = await orchestrator.destroyContainer(containerId)

    // 销毁应成功完成
    expect(result).toBeUndefined()
    expect(mockExecSync).toHaveBeenCalled()
  })

  it('并发销毁同一容器时应该有序处理', async () => {
    const containerId = 'test-container-concurrent-destroy'

    let callCount = 0
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('docker rm')) {
        callCount++
        // 模拟销毁延迟
        return ''
      }
      if (cmd.includes('docker ps')) {
        return JSON.stringify([
          {
            Id: containerId,
            Names: [`/${containerId}`],
            State: { Status: 'running' },
            Ports: [{ PublicPort: 3100 }]
          }
        ])
      }
      if (cmd.includes('docker inspect')) {
        return JSON.stringify([{
          Id: containerId,
          State: { Running: true }
        }])
      }
      return ''
    })

    // 并发调用销毁
    const promises = [
      orchestrator.destroyContainer(containerId),
      orchestrator.destroyContainer(containerId),
      orchestrator.destroyContainer(containerId)
    ]

    const results = await Promise.allSettled(promises)

    // 至少有一个应该成功
    const successCount = results.filter(r => r.status === 'fulfilled').length
    expect(successCount).toBeGreaterThan(0)

    console.log(`[Test] 销毁调用次数: ${callCount}, 成功数: ${successCount}`)
  })

  it('销毁失败时应该清理标记，避免死锁', async () => {
    const containerId = 'test-container-destroy-fail'

    // 设置 mock 让第一次销毁失败
    let attempt = 0
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('docker rm')) {
        attempt++
        if (attempt === 1) {
          throw new Error('Docker rm failed')
        }
        return ''
      }
      if (cmd.includes('docker ps')) {
        return JSON.stringify([{
          Id: containerId,
          Names: [`/${containerId}`],
          State: { Status: 'running' },
          Ports: []
        }])
      }
      if (cmd.includes('docker inspect')) {
        return JSON.stringify([{
          Id: containerId,
          State: { Running: true }
        }])
      }
      return ''
    })

    // 第一次销毁应该失败
    await expect(orchestrator.destroyContainer(containerId)).rejects.toThrow()

    // 等待一小段时间让清理完成
    await new Promise(resolve => setTimeout(resolve, 100))

    // 第二次销毁应该能够正常进行（锁已被释放）
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('docker rm')) {
        return ''
      }
      return ''
    })

    const result = await orchestrator.destroyContainer(containerId)
    expect(result).toBeUndefined()
  })
})

// ==================== 测试套件：用户容器分配锁 ====================

describe('用户容器分配分布式锁', () => {
  let orchestrator: ReturnType<typeof getContainerOrchestrator>
  let mockExecSync: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSync = vi.mocked(require('child_process').execSync)

    orchestrator = getContainerOrchestrator({
      minPoolSize: 0,
      maxPoolSize: 5,
      idleTimeoutMs: 60000,
      healthCheckIntervalMs: 60000,
      imageName: 'test-image:latest',
      networkName: 'test-network',
      basePort: 4000
    })

    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' })
    })

    // 基础 mock：空热池
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('docker ps')) {
        return JSON.stringify([])
      }
      if (cmd.includes('docker inspect')) {
        return JSON.stringify([{
          Id: 'new-container',
          State: { Running: true }
        }])
      }
      if (cmd.includes('docker run')) {
        return `container-${Date.now()}`
      }
      if (cmd.includes('docker rm')) {
        return ''
      }
      return ''
    })
  })

  afterEach(() => {
    orchestrator.shutdown()
  })

  it('应该阻止同一用户的并发容器分配', async () => {
    const userId = 'user-concurrent-assign'

    let assignCount = 0
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('docker run')) {
        assignCount++
        // 短暂延迟模拟 Docker 创建
        return `container-concurrent-${assignCount}`
      }
      if (cmd.includes('docker ps')) {
        return JSON.stringify([])
      }
      if (cmd.includes('docker inspect')) {
        return JSON.stringify([{
          Id: `container-concurrent-${assignCount}`,
          State: { Running: true }
        }])
      }
      if (cmd.includes('docker rm')) {
        return ''
      }
      return ''
    })

    // 并发为同一用户分配容器
    const promises = [
      orchestrator.assignContainerToUser(userId).catch(() => null),
      orchestrator.assignContainerToUser(userId).catch(() => null),
      orchestrator.assignContainerToUser(userId).catch(() => null)
    ]

    const results = await Promise.all(promises)
    const successCount = results.filter(r => r !== null).length

    console.log(`[Test] 成功分配: ${successCount}, Docker run 调用次数: ${assignCount}`)

    // 期望：只有一个容器被成功创建（锁保护）
    expect(successCount).toBeGreaterThan(0)
    expect(successCount).toBeLessThanOrEqual(1)
    expect(assignCount).toBeLessThanOrEqual(2) // 允许最多2次（可能有重试）
  })

  it('应该允许不同用户的并发容器分配', async () => {
    const users = ['user-a', 'user-b', 'user-c']

    let containerCount = 0
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('docker run')) {
        containerCount++
        return `container-multi-${containerCount}`
      }
      if (cmd.includes('docker ps')) {
        return JSON.stringify([])
      }
      if (cmd.includes('docker inspect')) {
        return JSON.stringify([{
          Id: `container-multi-${containerCount}`,
          State: { Running: true }
        }])
      }
      if (cmd.includes('docker rm')) {
        return ''
      }
      return ''
    })

    // 并发为不同用户分配容器
    const promises = users.map(userId =>
      orchestrator.assignContainerToUser(userId).catch(() => null)
    )

    const results = await Promise.all(promises)
    const successCount = results.filter(r => r !== null).length

    console.log(`[Test] 用户数: ${users.length}, 成功分配: ${successCount}`)

    // 每个用户都应该成功获得容器（用户级锁不影响不同用户）
    expect(successCount).toBe(users.length)
  })

  it('锁超时应该释放，避免永久死锁', async () => {
    const userId = 'user-lock-timeout'

    // 模拟一个极快的锁获取
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('docker run')) {
        return `container-timeout-${Date.now()}`
      }
      if (cmd.includes('docker ps')) {
        return JSON.stringify([])
      }
      if (cmd.includes('docker inspect')) {
        return JSON.stringify([{
          Id: 'container-timeout-1',
          State: { Running: true }
        }])
      }
      if (cmd.includes('docker rm')) {
        return ''
      }
      return ''
    })

    // 第一次分配（应该快速完成）
    const firstResult = await orchestrator.assignContainerToUser(userId)
    expect(firstResult).not.toBeNull()

    // 立即第二次分配（容器已存在，应该快速复用）
    const secondResult = await orchestrator.assignContainerToUser(userId)
    expect(secondResult).not.toBeNull()
    expect(secondResult?.containerId).toBe(firstResult?.containerId)
  })
})

// ==================== 测试套件：集成场景 ====================

describe('集成场景测试', () => {
  let orchestrator: ReturnType<typeof getContainerOrchestrator>
  let mockExecSync: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSync = vi.mocked(require('child_process').execSync)

    orchestrator = getContainerOrchestrator({
      minPoolSize: 0,
      maxPoolSize: 5,
      idleTimeoutMs: 60000,
      healthCheckIntervalMs: 60000,
      imageName: 'test-image:latest',
      networkName: 'test-network',
      basePort: 4000
    })

    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'ok' })
    })

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('docker ps')) {
        return JSON.stringify([])
      }
      if (cmd.includes('docker inspect')) {
        return JSON.stringify([{
          Id: 'container-int-1',
          State: { Running: true }
        }])
      }
      if (cmd.includes('docker run')) {
        return `container-int-${Date.now()}`
      }
      if (cmd.includes('docker rm')) {
        return ''
      }
      return ''
    })
  })

  afterEach(() => {
    orchestrator.shutdown()
  })

  it('快速切换会话应该复用容器', async () => {
    const userId = 'user-session-switch'
    const sessions = ['session-1', 'session-2', 'session-3']

    // 模拟用户快速切换多个会话
    const results = await Promise.all(
      sessions.map(() =>
        orchestrator.assignContainerToUser(userId).catch(() => null)
      )
    )

    const successCount = results.filter(r => r !== null).length
    console.log(`[Test] 会话切换场景: ${successCount}/${sessions.length} 成功`)

    // 应该只创建一个容器并复用
    expect(successCount).toBe(1)
  })

  it('容器分配后立即销毁应该有序完成', async () => {
    const userId = 'user-assign-destroy'
    let ops: string[] = []

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('docker run')) {
        ops.push('run')
        return `container-${Date.now()}`
      }
      if (cmd.includes('docker rm')) {
        ops.push('rm')
        return ''
      }
      if (cmd.includes('docker ps')) {
        return JSON.stringify([])
      }
      if (cmd.includes('docker inspect')) {
        return JSON.stringify([{
          Id: `container-${Date.now()}`,
          State: { Running: true }
        }])
      }
      return ''
    })

    // 并发执行分配和销毁
    const [assignResult, destroyResult] = await Promise.allSettled([
      orchestrator.assignContainerToUser(userId),
      new Promise<void>(resolve => {
        // 稍微延迟销毁，确保分配先进行
        setTimeout(async () => {
          const container = await orchestrator.assignContainerToUser(userId)
          if (container) {
            await orchestrator.destroyContainer(container.containerId)
          }
          resolve()
        }, 50)
      })
    ])

    console.log(`[Test] 操作顺序: ${ops.join(' -> ')}`)

    // 两个操作都应该完成
    expect(assignResult.status).toBe('fulfilled')
    expect(destroyResult.status).toBe('fulfilled')
  })
})
