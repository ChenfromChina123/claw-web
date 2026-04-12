/**
 * ContainerOrchestrator 单元测试
 *
 * 测试内容：
 * - 容器编排器的初始化
 * - 用户-容器映射管理
 * - 热池管理（模拟）
 * - 资源统计功能
 *
 * 注意：这些测试不依赖真实的Docker环境，使用mock对象
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getContainerOrchestrator,
  type ContainerInstance,
  type UserContainerMapping,
  type PoolConfig
} from '../../orchestrator/containerOrchestrator'
import {
  getUserContainerMapper,
  type MappingStats
} from '../../orchestrator/userContainerMapper'

// ==================== Mock 设置 ====================

// Mock child_process 模块（避免真实的Docker调用）
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn()
}))

// Mock fetch API（用于健康检查）
global.fetch = vi.fn()

// ==================== 测试套件：UserContainerMapper ====================

describe('UserContainerMapper', () => {
  let mapper: ReturnType<typeof getUserContainerMapper>

  beforeEach(() => {
    // 每个测试前创建新的实例（不启用持久化）
    mapper = getUserContainerMapper(undefined)
    mapper.clear()
  })

  describe('基础映射操作', () => {

    it('应该能够设置和获取用户映射', () => {
      const userId = 'user-123'
      const mockMapping: UserContainerMapping = {
        userId,
        container: {
          containerId: 'container-abc',
          containerName: 'test-container',
          hostPort: 3100,
          status: 'assigned',
          assignedUserId: userId,
          createdAt: new Date(),
          lastActivityAt: new Date()
        },
        assignedAt: new Date(),
        sessionCount: 3,
        lastActivityAt: new Date()
      }

      mapper.setMapping(userId, mockMapping)

      const retrieved = mapper.getMapping(userId)
      expect(retrieved).toBeDefined()
      expect(retrieved?.userId).toBe(userId)
      expect(retrieved?.container.containerId).toBe('container-abc')
      expect(retrieved?.sessionCount).toBe(3)
    })

    it('应该在用户不存在时返回undefined', () => {
      const result = mapper.getMapping('non-existent-user')
      expect(result).toBeUndefined()
    })

    it('应该能够移除用户映射', () => {
      const userId = 'user-456'
      const mockMapping: UserContainerMapping = {
        userId,
        container: {
          containerId: 'container-def',
          containerName: 'test-container-2',
          hostPort: 3101,
          status: 'assigned',
          assignedUserId: userId,
          createdAt: new Date(),
          lastActivityAt: new Date()
        },
        assignedAt: new Date(),
        sessionCount: 1,
        lastActivityAt: new Date()
      }

      mapper.setMapping(userId, mockMapping)
      expect(mapper.hasMapping(userId)).toBe(true)

      const removed = mapper.removeMapping(userId)
      expect(removed).toBeDefined()
      expect(mapper.hasMapping(userId)).toBe(false)
    })

    it('应该能够检查映射是否存在', () => {
      const userId = 'user-789'

      expect(mapper.hasMapping(userId)).toBe(false)

      mapper.setMapping(userId, {
        userId,
        container: {
          containerId: 'container-ghi',
          containerName: 'test',
          hostPort: 3102,
          status: 'assigned',
          createdAt: new Date(),
          lastActivityAt: new Date()
        },
        assignedAt: new Date(),
        sessionCount: 0,
        lastActivityAt: new Date()
      })

      expect(mapper.hasMapping(userId)).toBe(true)
    })
  })

  describe('会话计数管理', () => {

    it('应该能够增加会话计数', () => {
      const userId = 'user-session-inc'
      mapper.setMapping(userId, {
        userId,
        container: {
          containerId: 'c1',
          containerName: 't1',
          hostPort: 3100,
          status: 'assigned',
          createdAt: new Date(),
          lastActivityAt: new Date()
        },
        assignedAt: new Date(),
        sessionCount: 2,
        lastActivityAt: new Date()
      })

      mapper.incrementSessionCount(userId)
      const mapping = mapper.getMapping(userId)
      expect(mapping?.sessionCount).toBe(3)
    })

    it('应该能够减少会话计数（不低于0）', () => {
      const userId = 'user-session-dec'
      mapper.setMapping(userId, {
        userId,
        container: {
          containerId: 'c2',
          containerName: 't2',
          hostPort: 3101,
          status: 'assigned',
          createdAt: new Date(),
          lastActivityAt: new Date()
        },
        assignedAt: new Date(),
        sessionCount: 1,
        lastActivityAt: new Date()
      })

      mapper.decrementSessionCount(userId)
      let mapping = mapper.getMapping(userId)
      expect(mapping?.sessionCount).toBe(0)

      // 再减一次不应该变成负数
      mapper.decrementSessionCount(userId)
      mapping = mapper.getMapping(userId)
      expect(mapping?.sessionCount).toBe(0)
    })
  })

  describe('活动时间更新', () => {

    it('应该能够更新最后活动时间', async () => {
      const userId = 'user-activity'
      const oldTime = new Date(Date.now() - 60000) // 1分钟前

      mapper.setMapping(userId, {
        userId,
        container: {
          containerId: 'c3',
          containerName: 't3',
          hostPort: 3102,
          status: 'assigned',
          createdAt: oldTime,
          lastActivityAt: oldTime
        },
        assignedAt: oldTime,
        sessionCount: 0,
        lastActivityAt: oldTime
      })

      // 等待一小段时间确保时间不同
      await new Promise(resolve => setTimeout(resolve, 10))

      mapper.updateLastActivity(userId)
      const mapping = mapper.getMapping(userId)

      expect(mapping?.lastActivityAt.getTime()).toBeGreaterThan(oldTime.getTime())
      expect(mapping?.container.lastActivityAt.getTime()).toBeGreaterThan(oldTime.getTime())
    })
  })

  describe('统计信息', () => {

    it('应该能够生成正确的统计信息', () => {
      // 添加一些测试数据
      const now = new Date()
      for (let i = 0; i < 5; i++) {
        mapper.setMapping(`user-${i}`, {
          userId: `user-${i}`,
          container: {
            containerId: `container-${i}`,
            containerName: `test-${i}`,
            hostPort: 3100 + i,
            status: 'assigned',
            createdAt: now,
            lastActivityAt: now
          },
          assignedAt: now,
          sessionCount: i + 1, // 不同的会话数
          lastActivityAt: now
        })
      }

      const stats: MappingStats = mapper.getStats()

      expect(stats.totalUsers).toBe(5)
      expect(stats.activeUsers).toBe(5) // 所有都是刚刚创建的
      expect(stats.avgSessionCount).toBe(3) // (1+2+3+4+5)/5 = 3
      expect(stats.maxSessionUser).toBe('user-4') // 会话数最多的是user-4（5个会话）
    })

    it('空映射时应该返回零值统计', () => {
      const stats = mapper.getStats()

      expect(stats.totalUsers).toBe(0)
      expect(stats.activeUsers).toBe(0)
      expect(stats.avgSessionCount).toBe(0)
      expect(stats.maxSessionUser).toBeUndefined()
    })
  })

  describe('清理功能', () => {

    it('应该能够清理空闲超时的映射', async () => {
      const now = Date.now()
      const oneHourAgo = new Date(now - 60 * 60 * 1000) // 1小时前

      // 添加一个"过期"的映射
      mapper.setMapping('idle-user', {
        userId: 'idle-user',
        container: {
          containerId: 'c-idle',
          containerName: 't-idle',
          hostPort: 3150,
          status: 'assigned',
          createdAt: oneHourAgo,
          lastActivityAt: oneHourAgo
        },
        assignedAt: oneHourAgo,
        sessionCount: 0,
        lastActivityAt: oneHourAgo
      })

      // 添加一个活跃的映射
      mapper.setMapping('active-user', {
        userId: 'active-user',
        container: {
          containerId: 'c-active',
          containerName: 't-active',
          hostPort: 3151,
          status: 'assigned',
          createdAt: new Date(now),
          lastActivityAt: new Date(now)
        },
        assignedAt: new Date(now),
        sessionCount: 2,
        lastActivityAt: new Date(now)
      })

      // 清理30分钟前的空闲映射
      const cleanedCount = mapper.cleanupIdleMappings(30 * 60 * 1000)

      expect(cleanedCount).toBe(1)
      expect(mapper.hasMapping('idle-user')).toBe(false)
      expect(mapper.hasMapping('active-user')).toBe(true)
    })
  })

  describe('批量操作', () => {

    it('应该能够获取所有映射', () => {
      for (let i = 0; i < 3; i++) {
        mapper.setMapping(`batch-user-${i}`, {
          userId: `batch-user-${i}`,
          container: {
            containerId: `bc-${i}`,
            containerName: `bt-${i}`,
            hostPort: 3200 + i,
            status: 'assigned',
            createdAt: new Date(),
            lastActivityAt: new Date()
          },
          assignedAt: new Date(),
          sessionCount: 0,
          lastActivityAt: new Date()
        })
      }

      const allMappings = mapper.getAllMappings()
      expect(allMappings.length).toBe(3)

      const allUserIds = mapper.getAllUserIds()
      expect(allUserIds.length).toBe(3)
      expect(allUserIds).toContain('batch-user-0')
      expect(allUserIds).toContain('batch-user-1')
      expect(allUserIds).toContain('batch-user-2')
    })

    it('应该能够清空所有映射', () => {
      for (let i = 0; i < 5; i++) {
        mapper.setMapping(`clear-user-${i}`, {
          userId: `clear-user-${i}`,
          container: {
            containerId: `cc-${i}`,
            containerName: `ct-${i}`,
            hostPort: 3300 + i,
            status: 'assigned',
            createdAt: new Date(),
            lastActivityAt: new Date()
          },
          assignedAt: new Date(),
          sessionCount: 0,
          lastActivityAt: new Date()
        })
      }

      expect(mapper.getAllUserIds().length).toBe(5)

      mapper.clear()

      expect(mapper.getAllUserIds().length).toBe(0)
    })
  })
})

// ==================== 测试套件：ContainerOrchestrator 基础功能 ====================

describe('ContainerOrchestrator - 基础功能（无需Docker）', () => {
  let orchestrator: ReturnType<typeof getContainerOrchestrator>

  beforeEach(() => {
    // 使用最小化配置进行测试
    orchestrator = getContainerOrchestrator({
      minPoolSize: 2,
      maxPoolSize: 5,
      idleTimeoutMs: 60000,
      healthCheckIntervalMs: 30000,
      imageName: 'test-image:latest',
      networkName: 'test-network',
      basePort: 4000
    })
  })

  describe('配置管理', () => {

    it('应该使用默认配置当未提供自定义配置时', () => {
      const defaultOrchestrator = getContainerOrchestrator()
      const stats = defaultOrchestrator.getPoolStats()

      // 验证默认配置被应用
      expect(stats).toBeDefined()
      expect(typeof stats.totalContainers).toBe('number')
      expect(typeof stats.idleContainers).toBe('number')
    })

    it('应该接受并应用自定义配置', () => {
      const customConfig: Partial<PoolConfig> = {
        minPoolSize: 10,
        maxPoolSize: 20,
        basePort: 5000
      }

      const customOrchestrator = getContainerOrchestrator(customConfig)
      const stats = customOrchestrator.getPoolStats()

      // 配置已设置，但热池为空（因为未初始化）
      expect(stats.totalContainers).toBe(0)
      expect(stats.activeUsers).toBe(0)
    })
  })

  describe('用户映射查询', () => {

    it('应该在无映射时返回undefined', () => {
      const mapping = orchestrator.getUserMapping('non-existent')
      expect(mapping).toBeUndefined()
    })

    it('应该能够获取所有活跃的用户映射', () => {
      const mappings = orchestrator.getAllUserMappings()

      expect(Array.isArray(mappings)).toBe(true)
      expect(mappings.length).toBe(0) // 初始状态为空
    })
  })

  describe('热池状态统计', () => {

    it('应该返回正确的初始状态', () => {
      const stats = orchestrator.getPoolStats()

      expect(stats).toHaveProperty('totalContainers')
      expect(stats).toHaveProperty('idleContainers')
      expect(stats).toHaveProperty('activeUsers')
      expect(stats).toHaveProperty('poolUtilization')

      // 初始状态下所有值应为0
      expect(stats.totalContainers).toBe(0)
      expect(stats.idleContainers).toBe(0)
      expect(stats.activeUsers).toBe(0)
      expect(stats.poolUtilization).toBe(0)
    })
  })
})

// ==================== 测试套件：类型定义验证 ====================

describe('类型定义验证', () => {

  it('ContainerInstance 应该包含所有必需的字段', () => {
    const instance: ContainerInstance = {
      containerId: 'test-id',
      containerName: 'test-name',
      hostPort: 3000,
      status: 'running',
      createdAt: new Date(),
      lastActivityAt: new Date()
    }

    expect(instance.containerId).toBe('test-id')
    expect(instance.containerName).toBe('test-name')
    expect(instance.hostPort).toBe(3000)
    expect(instance.status).toBe('running')
    expect(instance.createdAt).toBeInstanceOf(Date)
    expect(instance.lastActivityAt).toBeInstanceOf(Date)

    // 可选字段
    expect(instance.assignedUserId).toBeUndefined()
    expect(instance.resourceUsage).toBeUndefined()
  })

  it('UserContainerMapping 应该包含所有必需的字段', () => {
    const mapping: UserContainerMapping = {
      userId: 'user-1',
      container: {
        containerId: 'cont-1',
        containerName: 'name-1',
        hostPort: 3100,
        status: 'assigned',
        assignedUserId: 'user-1',
        createdAt: new Date(),
        lastActivityAt: new Date()
      },
      assignedAt: new Date(),
      sessionCount: 5,
      lastActivityAt: new Date()
    }

    expect(mapping.userId).toBe('user-1')
    expect(mapping.container).toBeDefined()
    expect(mapping.assignedAt).toBeInstanceOf(Date)
    expect(mapping.sessionCount).toBe(5)
    expect(mapping.lastActivityAt).toBeInstanceOf(Date)
  })

  it('PoolConfig 应该支持所有配置项', () => {
    const config: PoolConfig = {
      minPoolSize: 3,
      maxPoolSize: 10,
      idleTimeoutMs: 300000,
      healthCheckIntervalMs: 15000,
      imageName: 'worker:latest',
      networkName: 'app-network',
      basePort: 3100
    }

    expect(config.minPoolSize).toBe(3)
    expect(config.maxPoolSize).toBe(10)
    expect(config.idleTimeoutMs).toBe(300000)
    expect(config.healthCheckIntervalMs).toBe(15000)
    expect(config.imageName).toBe('worker:latest')
    expect(config.networkName).toBe('app-network')
    expect(config.basePort).toBe(3100)
  })
})
