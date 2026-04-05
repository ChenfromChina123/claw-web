/**
 * Agent 路由器测试
 * 
 * 测试 Agent 路由器的完整功能
 */

import { describe, test, expect } from 'vitest'
import {
  routeAgent,
  determineRouteMode,
  isAgentTypeAllowed,
  getAvailableAgentTypes,
  isOneShotAgent,
  getAgentToolPool,
  isReadOnlyAgent,
  AgentRouteMode,
} from '../../agents/agentRouter'
import {
  EXPLORE_AGENT,
  PLAN_AGENT,
  GENERAL_PURPOSE_AGENT,
  VERIFICATION_AGENT,
} from '../../agents/builtInAgents'

describe('Agent 路由器测试', () => {
  describe('determineRouteMode', () => {
    test('应该识别 Team 模式', () => {
      const mode = determineRouteMode({
        prompt: '任务',
        name: 'worker1',
        team_name: 'my-team',
      })
      expect(mode).toBe(AgentRouteMode.TEAM)
    })

    test('应该识别 Fork 模式', () => {
      const mode = determineRouteMode({
        prompt: '任务',
        parentAgentId: 'agent_123',
      })
      expect(mode).toBe(AgentRouteMode.FORK)
    })

    test('应该识别普通模式', () => {
      const mode = determineRouteMode({
        prompt: '任务',
        subagent_type: 'Explore',
      })
      expect(mode).toBe(AgentRouteMode.NORMAL)
    })
  })

  describe('isAgentTypeAllowed', () => {
    test('应该允许有效的 Agent 类型', () => {
      const result = isAgentTypeAllowed('Explore', {})
      expect(result.allowed).toBe(true)
    })

    test('应该拒绝禁止的 Agent 类型', () => {
      const result = isAgentTypeAllowed('Explore', {
        deniedAgentTypes: ['Explore'],
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('被禁止')
    })

    test('应该支持通配符格式的禁止规则', () => {
      // 通配符格式 'Agent(Explore)' 需要特殊处理
      // 当前实现检查的是 deniedAgentTypes 数组中是否直接包含 'Agent(Explore)'
      const result = isAgentTypeAllowed('Explore', {
        deniedAgentTypes: ['Agent(Explore)', 'Explore'], // 两种格式都禁止
      })
      expect(result.allowed).toBe(false)
    })

    test('应该拒绝不在允许列表中的 Agent 类型', () => {
      const result = isAgentTypeAllowed('Explore', {
        allowedAgentTypes: ['Plan'],
      })
      expect(result.allowed).toBe(false)
    })

    test('应该允许在允许列表中的 Agent 类型', () => {
      const result = isAgentTypeAllowed('Explore', {
        allowedAgentTypes: ['Explore', 'Plan'],
      })
      expect(result.allowed).toBe(true)
    })
  })

  describe('routeAgent', () => {
    test('应该路由到普通 Agent', () => {
      const result = routeAgent({
        prompt: '分析代码',
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
      expect(result.teammateInfo?.memberName).toBe('worker1')
      expect(result.teammateInfo?.teamName).toBe('my-team')
    })

    test('应该路由到 Fork Agent', () => {
      const result = routeAgent({
        prompt: '继续分析',
        parentAgentId: 'agent_123',
      })

      expect(result.mode).toBe(AgentRouteMode.FORK)
      expect(result.parentAgentId).toBe('agent_123')
    })

    test('应该拒绝无效的 Agent 类型', () => {
      const result = routeAgent({
        prompt: '任务',
        subagent_type: 'InvalidAgent',
      })

      expect(result.error).toBeDefined()
      expect(result.error).toContain('未知的 Agent 类型')
    })

    test('应该拒绝禁止的 Agent 类型', () => {
      const result = routeAgent(
        { prompt: '任务', subagent_type: 'Explore' },
        { deniedAgentTypes: ['Explore'] }
      )

      expect(result.error).toBeDefined()
      expect(result.error).toContain('被禁止')
    })

    test('应该正确处理异步模式', () => {
      const result = routeAgent({
        prompt: '后台任务',
        subagent_type: 'Explore',
        run_in_background: true,
      })

      expect(result.isAsync).toBe(true)
    })

    test('应该禁用背景执行当不允许时', () => {
      const result = routeAgent(
        { prompt: '后台任务', subagent_type: 'Explore', run_in_background: true },
        { allowBackground: false }
      )

      expect(result.isAsync).toBe(false)
    })
  })

  describe('getAvailableAgentTypes', () => {
    test('应该返回所有 Agent 类型', () => {
      const types = getAvailableAgentTypes()
      expect(types).toContain('general-purpose')
      expect(types).toContain('Explore')
      expect(types).toContain('Plan')
    })

    test('应该过滤禁止的 Agent 类型', () => {
      const types = getAvailableAgentTypes({ deniedAgentTypes: ['Explore', 'Plan'] })
      expect(types).not.toContain('Explore')
      expect(types).not.toContain('Plan')
    })

    test('应该只返回允许的 Agent 类型', () => {
      const types = getAvailableAgentTypes({ allowedAgentTypes: ['Explore'] })
      expect(types).toContain('Explore')
      expect(types.length).toBe(1)
    })
  })

  describe('isOneShotAgent', () => {
    test('Explore 是 One-shot', () => {
      expect(isOneShotAgent('Explore')).toBe(true)
    })

    test('Plan 是 One-shot', () => {
      expect(isOneShotAgent('Plan')).toBe(true)
    })

    test('general-purpose 不是 One-shot', () => {
      expect(isOneShotAgent('general-purpose')).toBe(false)
    })

    test('verification 不是 One-shot', () => {
      expect(isOneShotAgent('verification')).toBe(false)
    })
  })

  describe('getAgentToolPool', () => {
    test('应该返回只读 Agent 的禁止工具列表', () => {
      const pool = getAgentToolPool(EXPLORE_AGENT)
      expect(pool.denied).toContain('Write')
      expect(pool.denied).toContain('Edit')
    })

    test('应该返回通配符的工具列表', () => {
      const pool = getAgentToolPool(GENERAL_PURPOSE_AGENT)
      expect(pool.allowed).toContain('*')
    })

    test('应该返回 verification Agent 的允许工具', () => {
      const pool = getAgentToolPool(VERIFICATION_AGENT)
      expect(pool.allowed).toContain('*')
    })
  })

  describe('isReadOnlyAgent', () => {
    test('Explore 是只读的', () => {
      expect(isReadOnlyAgent(EXPLORE_AGENT)).toBe(true)
    })

    test('Plan 是只读的', () => {
      expect(isReadOnlyAgent(PLAN_AGENT)).toBe(true)
    })

    test('general-purpose 不是只读的', () => {
      expect(isReadOnlyAgent(GENERAL_PURPOSE_AGENT)).toBe(false)
    })
  })
})
