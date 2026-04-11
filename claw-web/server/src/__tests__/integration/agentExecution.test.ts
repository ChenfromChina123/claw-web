/**
 * Agent 执行 E2E 测试
 * 
 * 测试 Agent 完整执行链路
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  routeAgent,
  createRuntimeContext,
  AgentRouteMode,
} from '../../agents/agentRouter'
import {
  createRuntimeContext as createContext,
  RuntimeStatus,
  PermissionMode,
} from '../../agents/runtimeContext'
import { GENERAL_PURPOSE_AGENT, EXPLORE_AGENT, PLAN_AGENT } from '../../agents/builtInAgents'

describe('Agent 完整执行链路测试', () => {
  describe('2.1 Agent 定义体系', () => {
    test('应该验证所有内置 Agent 定义', () => {
      const agents = [GENERAL_PURPOSE_AGENT, EXPLORE_AGENT, PLAN_AGENT]

      for (const agent of agents) {
        expect(agent.agentType).toBeDefined()
        expect(agent.whenToUse).toBeDefined()
        expect(agent.getSystemPrompt).toBeDefined()
        expect(typeof agent.getSystemPrompt()).toBe('string')
      }
    })

    test('应该验证 Explore Agent 是只读的', () => {
      expect(EXPLORE_AGENT.isReadOnly).toBe(true)
      expect(EXPLORE_AGENT.disallowedTools).toContain('Write')
      expect(EXPLORE_AGENT.disallowedTools).toContain('Edit')
    })

    test('应该验证 Plan Agent 是只读的', () => {
      expect(PLAN_AGENT.isReadOnly).toBe(true)
    })
  })

  describe('2.2 AgentTool 路由', () => {
    test('应该路由到 Explore Agent', () => {
      const result = routeAgent({
        prompt: '分析代码结构',
        subagent_type: 'Explore',
      })

      expect(result.mode).toBe(AgentRouteMode.NORMAL)
      expect(result.agentDefinition).toBeDefined()
      expect(result.agentDefinition?.agentType).toBe('Explore')
    })

    test('应该路由到 Team 成员', () => {
      const result = routeAgent({
        prompt: '执行任务',
        name: 'worker1',
        team_name: 'my-team',
      })

      expect(result.mode).toBe(AgentRouteMode.TEAM)
      expect(result.teammateInfo).toBeDefined()
    })

    test('应该拒绝无效的 Agent 类型', () => {
      const result = routeAgent({
        prompt: '任务',
        subagent_type: 'InvalidAgent',
      })

      expect(result.error).toBeDefined()
    })

    test('应该支持异步执行', () => {
      const result = routeAgent({
        prompt: '后台任务',
        subagent_type: 'Explore',
        run_in_background: true,
      })

      expect(result.isAsync).toBe(true)
    })
  })

  describe('2.3 运行时上下文', () => {
    test('应该创建运行时上下文', () => {
      const context = createContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      expect(context.runtimeId).toBeDefined()
      expect(context.agentId).toBeDefined()
      expect(context.agentDefinition).toBe(GENERAL_PURPOSE_AGENT)
    })

    test('只读 Agent 应该禁用写入工具', () => {
      const context = createContext(EXPLORE_AGENT, {
        sessionId: 'test-session',
      })

      expect(context.canUseTool('Write')).toBe(false)
      expect(context.canUseTool('Edit')).toBe(false)
      expect(context.canUseTool('Read')).toBe(true)
    })

    test('bypassPermissions 应该允许所有工具', () => {
      const context = createContext(EXPLORE_AGENT, {
        sessionId: 'test-session',
        permissionMode: PermissionMode.BYPASS,
      })

      expect(context.canUseTool('Write')).toBe(true)
      expect(context.canUseTool('Bash')).toBe(true)
    })

    test('应该正确跟踪轮次', () => {
      const context = createContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        maxTurns: 3,
      })

      expect(context.currentTurn).toBe(0)
      expect(context.hasReachedMaxTurns()).toBe(false)

      context.incrementTurn()
      expect(context.currentTurn).toBe(1)

      context.incrementTurn()
      context.incrementTurn()
      expect(context.hasReachedMaxTurns()).toBe(true)
    })

    test('应该支持 Abort', () => {
      const context = createContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      const signal = context.getAbortSignal()
      expect(signal.aborted).toBe(false)

      context.requestAbort()
      expect(signal.aborted).toBe(true)
    })

    test('应该执行清理钩子', async () => {
      const context = createContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
      })

      let cleanupCalled = false
      context.addCleanupHook(() => {
        cleanupCalled = true
      })

      await context.cleanup()
      expect(cleanupCalled).toBe(true)
    })
  })

  describe('2.4 执行结果', () => {
    test('状态摘要应该返回正确信息', () => {
      const context = createContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        maxTurns: 10,
      })

      context.start()
      context.incrementTurn()
      context.incrementTurn()

      const summary = context.getStatusSummary()

      expect(summary.agentId).toBe(context.agentId)
      expect(summary.agentType).toBe('general-purpose')
      expect(summary.status).toBe(RuntimeStatus.INITIALIZING)
      expect(summary.currentTurn).toBe(2)
      expect(summary.maxTurns).toBe(10)
    })
  })

  describe('权限模式', () => {
    test('plan 模式应该只允许读取', () => {
      const context = createContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        permissionMode: PermissionMode.PLAN,
      })

      expect(context.canWrite()).toBe(false)
    })

    test('acceptEdits 模式应该允许写入', () => {
      const context = createContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        permissionMode: PermissionMode.ACCEPT_EDITS,
      })

      expect(context.canWrite()).toBe(true)
    })

    test('bypassPermissions 模式应该允许危险操作', () => {
      const context = createContext(GENERAL_PURPOSE_AGENT, {
        sessionId: 'test-session',
        permissionMode: PermissionMode.BYPASS,
      })

      expect(context.canExecuteDangerous()).toBe(true)
    })
  })
})

describe('Agent 类型转换测试', () => {
  test('应该正确识别内置 Agent', () => {
    const agents = [GENERAL_PURPOSE_AGENT, EXPLORE_AGENT, PLAN_AGENT]

    for (const agent of agents) {
      expect(agent.source).toBe('built-in')
    }
  })

  test('应该验证所有 Agent 有有效的 permissionMode', () => {
    const validModes = ['bypassPermissions', 'acceptEdits', 'auto', 'plan', 'bubble']
    
    const agents = [GENERAL_PURPOSE_AGENT, EXPLORE_AGENT, PLAN_AGENT]
    
    for (const agent of agents) {
      if (agent.permissionMode) {
        expect(validModes).toContain(agent.permissionMode)
      }
    }
  })
})
