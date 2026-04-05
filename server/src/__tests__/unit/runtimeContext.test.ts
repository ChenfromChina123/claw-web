/**
 * Agent 运行时上下文测试
 * 
 * 测试运行时上下文的完整功能
 */

import { describe, test, expect, beforeEach } from 'vitest'
import {
  AgentRuntimeContext,
  createRuntimeContext,
  RuntimeStatus,
  PermissionMode,
} from '../../agents/runtimeContext'
import {
  EXPLORE_AGENT,
  PLAN_AGENT,
  GENERAL_PURPOSE_AGENT,
} from '../../agents/builtInAgents'

describe('AgentRuntimeContext 测试', () => {
  describe('创建上下文', () => {
    test('应该创建基本的运行时上下文', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      expect(context.agentId).toBeDefined()
      expect(context.runtimeId).toBeDefined()
      expect(context.agentDefinition).toBe(GENERAL_PURPOSE_AGENT)
      expect(context.status).toBe(RuntimeStatus.CREATED)
      expect(context.currentTurn).toBe(0)
    })

    test('应该使用提供的 Agent ID', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        agentId: 'my-custom-agent',
      })

      expect(context.agentId).toBe('my-custom-agent')
    })

    test('应该设置正确的默认参数', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      expect(context.maxTurns).toBe(100)
      expect(context.permissionMode).toBe(PermissionMode.AUTO)
      expect(context.cwd).toBeDefined()
    })

    test('应该接受自定义参数', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        maxTurns: 50,
        permissionMode: PermissionMode.BYPASS,
        cwd: '/custom/path',
      })

      expect(context.maxTurns).toBe(50)
      expect(context.permissionMode).toBe(PermissionMode.BYPASS)
      expect(context.cwd).toBe('/custom/path')
    })
  })

  describe('工具权限', () => {
    test('只读 Agent 应该禁用写入工具', () => {
      const context = createRuntimeContext(EXPLORE_AGENT, {
        sessionId: 'test-session',
      })

      // 写入工具应该被禁用（因为 Explore 有 disallowedTools）
      expect(context.canUseTool('Write')).toBe(false)
      expect(context.canUseTool('Edit')).toBe(false)
      expect(context.canUseTool('Delete')).toBe(false)
    })

    test('bypassPermissions 模式应该允许所有工具', () => {
      const context = createRuntimeContext(EXPLORE_AGENT, {
        sessionId: 'test-session',
        permissionMode: PermissionMode.BYPASS,
      })

      expect(context.canUseTool('Write')).toBe(true)
      expect(context.canUseTool('Edit')).toBe(true)
      expect(context.canUseTool('Bash')).toBe(true)
    })

    test('plan 模式应该只允许读取工具', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        permissionMode: PermissionMode.PLAN,
      })

      expect(context.canUseTool('Read')).toBe(true)
      expect(context.canUseTool('Write')).toBe(false)
      expect(context.canUseTool('Bash')).toBe(false)
    })

    test('getAvailableTools 应该正确过滤工具', () => {
      const context = createRuntimeContext(EXPLORE_AGENT, {
        sessionId: 'test-session',
      })

      const allTools = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep']
      const available = context.getAvailableTools(allTools)

      expect(available).toContain('Read')
      expect(available).toContain('Glob')
      expect(available).toContain('Grep')
      expect(available).not.toContain('Write')
      expect(available).not.toContain('Edit')
      expect(available).not.toContain('Bash')
    })
  })

  describe('状态管理', () => {
    test('start 应该设置状态为 INITIALIZING', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      context.start()
      expect(context.status).toBe(RuntimeStatus.INITIALIZING)
    })

    test('run 应该设置状态为 RUNNING', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      context.start()
      context.run()
      expect(context.status).toBe(RuntimeStatus.RUNNING)
    })

    test('complete 应该设置状态为 COMPLETED', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      context.start()
      context.complete()
      expect(context.status).toBe(RuntimeStatus.COMPLETED)
    })

    test('fail 应该设置状态为 FAILED', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      context.start()
      context.fail('Test error')
      expect(context.status).toBe(RuntimeStatus.FAILED)
      expect(context.getCache<string>('lastError')).toBe('Test error')
    })

    test('cancel 应该设置状态为 CANCELLED', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      context.start()
      context.cancel()
      expect(context.status).toBe(RuntimeStatus.CANCELLED)
    })
  })

  describe('轮次管理', () => {
    test('incrementTurn 应该增加轮次', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        maxTurns: 5,
      })

      expect(context.currentTurn).toBe(0)
      context.incrementTurn()
      expect(context.currentTurn).toBe(1)
    })

    test('incrementTurn 应该检查是否超过最大轮次', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        maxTurns: 2,
      })

      context.incrementTurn() // 1
      const result1 = context.incrementTurn() // 2
      const result2 = context.incrementTurn() // 3

      expect(result1).toBe(true)
      expect(result2).toBe(false)
      expect(context.hasReachedMaxTurns()).toBe(true)
    })

    test('hasReachedMaxTurns 应该正确判断', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        maxTurns: 10,
      })

      expect(context.hasReachedMaxTurns()).toBe(false)

      for (let i = 0; i < 10; i++) {
        context.incrementTurn()
      }

      expect(context.hasReachedMaxTurns()).toBe(true)
    })
  })

  describe('中止信号', () => {
    test('requestAbort 应该触发中止', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      const signal = context.getAbortSignal()
      expect(signal.aborted).toBe(false)

      context.requestAbort()
      expect(signal.aborted).toBe(true)
    })
  })

  describe('清理钩子', () => {
    test('addCleanupHook 应该添加钩子', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      let called = false
      context.addCleanupHook(() => {
        called = true
      })

      // 通过检查 getStatusSummary 来验证上下文存在
      expect(context.getStatusSummary()).toBeDefined()
    })

    test('cleanup 应该执行所有钩子', async () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      let callOrder: string[] = []
      context.addCleanupHook(() => {
        callOrder.push('hook1')
      })
      context.addCleanupHook(async () => {
        callOrder.push('hook2')
      })

      await context.cleanup()
      expect(callOrder).toEqual(['hook1', 'hook2'])
    })

    test('cleanup 应该处理钩子错误', async () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      context.addCleanupHook(() => {
        throw new Error('Hook error')
      })

      // 不应该抛出错误
      await expect(context.cleanup()).resolves.not.toThrow()
    })
  })

  describe('缓存', () => {
    test('setCache 和 getCache 应该工作正常', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      context.setCache('key1', 'value1')
      context.setCache('key2', { nested: 'object' })

      expect(context.getCache<string>('key1')).toBe('value1')
      expect(context.getCache<{ nested: string }>('key2')).toEqual({ nested: 'object' })
    })

    test('getCache 应该返回 undefined 对于不存在的键', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      expect(context.getCache('nonexistent')).toBeUndefined()
    })
  })

  describe('状态摘要', () => {
    test('getStatusSummary 应该返回正确的信息', () => {
      const context = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        maxTurns: 50,
      })

      context.start()
      context.incrementTurn()
      context.incrementTurn()

      const summary = context.getStatusSummary()

      expect(summary.runtimeId).toBe(context.runtimeId)
      expect(summary.agentId).toBe(context.agentId)
      expect(summary.agentType).toBe('general-purpose')
      expect(summary.status).toBe(RuntimeStatus.INITIALIZING)
      expect(summary.currentTurn).toBe(2)
      expect(summary.maxTurns).toBe(50)
      expect(summary.duration).toBeGreaterThanOrEqual(0)
    })
  })

  describe('权限检查', () => {
    test('canWrite 应该正确判断', () => {
      const readOnlyContext = createRuntimeContext(EXPLORE_AGENT, {
        sessionId: 'test-session',
      })
      expect(readOnlyContext.canWrite()).toBe(false)

      const writableContext = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })
      expect(writableContext.canWrite()).toBe(true)

      const planContext = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        permissionMode: PermissionMode.PLAN,
      })
      expect(planContext.canWrite()).toBe(false)
    })

    test('canExecuteDangerous 应该只允许 bypassPermissions', () => {
      const bypassContext = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        permissionMode: PermissionMode.BYPASS,
      })
      expect(bypassContext.canExecuteDangerous()).toBe(true)

      const autoContext = createRuntimeContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        permissionMode: PermissionMode.AUTO,
      })
      expect(autoContext.canExecuteDangerous()).toBe(false)
    })
  })
})
