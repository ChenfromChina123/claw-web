/**
 * Agent 定义验证器测试
 * 
 * 测试 Agent 定义验证器的完整功能
 */

import { describe, test, expect } from 'vitest'
import {
  validateAgentDefinition,
  validateBuiltInAgentDefinition,
  validateCustomAgentDefinition,
  validateAgentCallInput,
  getValidAgentTypes,
  getValidPermissionModes,
  getValidIsolationModes,
} from '../../agents/validator'
import {
  GENERAL_PURPOSE_AGENT,
  EXPLORE_AGENT,
  PLAN_AGENT,
  VERIFICATION_AGENT,
} from '../../agents/builtInAgents'

describe('Agent 定义验证器测试', () => {
  describe('validateAgentDefinition', () => {
    test('应该验证有效的内置 Agent 定义', () => {
      const result = validateAgentDefinition(GENERAL_PURPOSE_AGENT)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    test('应该验证只读 Agent 定义', () => {
      const result = validateAgentDefinition(EXPLORE_AGENT)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    test('应该拒绝缺少 agentType 的定义', () => {
      const result = validateAgentDefinition({
        whenToUse: '测试',
        source: 'built-in',
        baseDir: 'built-in',
        getSystemPrompt: () => 'test',
      } as any)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'agentType')).toBe(true)
    })

    test('应该拒绝缺少 whenToUse 的定义', () => {
      const result = validateAgentDefinition({
        agentType: 'test-agent',
        whenToUse: '',
        source: 'built-in',
        baseDir: 'built-in',
        getSystemPrompt: () => 'test',
      } as any)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'whenToUse')).toBe(true)
    })

    test('应该拒绝 tools 和 disallowedTools 有重叠的定义', () => {
      const result = validateAgentDefinition({
        agentType: 'test-agent',
        whenToUse: '测试',
        source: 'built-in',
        baseDir: 'built-in',
        getSystemPrompt: () => 'test',
        tools: ['Read', 'Write'],
        disallowedTools: ['Write', 'Edit'],
      } as any)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'disallowedTools')).toBe(true)
    })

    test('应该拒绝无效的 permissionMode', () => {
      const result = validateAgentDefinition({
        agentType: 'test-agent',
        whenToUse: '测试',
        source: 'built-in',
        baseDir: 'built-in',
        getSystemPrompt: () => 'test',
        permissionMode: 'invalid-mode',
      } as any)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'permissionMode')).toBe(true)
    })

    test('应该拒绝无效的 maxTurns 范围', () => {
      const result = validateAgentDefinition({
        agentType: 'test-agent',
        whenToUse: '测试',
        source: 'built-in',
        baseDir: 'built-in',
        getSystemPrompt: () => 'test',
        maxTurns: 5000,
      } as any)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'maxTurns')).toBe(true)
    })

    test('应该拒绝无效的 isolation 模式', () => {
      const result = validateAgentDefinition({
        agentType: 'test-agent',
        whenToUse: '测试',
        source: 'built-in',
        baseDir: 'built-in',
        getSystemPrompt: () => 'test',
        isolation: 'invalid-isolation',
      } as any)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'isolation')).toBe(true)
    })
  })

  describe('validateBuiltInAgentDefinition', () => {
    test('应该验证有效的内置 Agent', () => {
      const result = validateBuiltInAgentDefinition(PLAN_AGENT)
      expect(result.valid).toBe(true)
    })

    test('应该拒绝 source 不是 built-in 的定义', () => {
      const result = validateBuiltInAgentDefinition({
        agentType: 'test-agent',
        whenToUse: '测试',
        source: 'user',
        baseDir: 'built-in',
        getSystemPrompt: () => 'test',
      } as any)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'source')).toBe(true)
    })

    test('应该拒绝缺少 getSystemPrompt 的定义', () => {
      const result = validateBuiltInAgentDefinition({
        agentType: 'test-agent',
        whenToUse: '测试',
        source: 'built-in',
        baseDir: 'built-in',
      } as any)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'getSystemPrompt')).toBe(true)
    })

    test('应该警告只读 Agent 没有 disallowedTools', () => {
      const result = validateBuiltInAgentDefinition({
        agentType: 'test-agent',
        whenToUse: '测试',
        source: 'built-in',
        baseDir: 'built-in',
        getSystemPrompt: () => 'test',
        isReadOnly: true,
      } as any)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'disallowedTools')).toBe(true)
    })
  })

  describe('validateCustomAgentDefinition', () => {
    test('应该验证有效的自定义 Agent', () => {
      const result = validateCustomAgentDefinition({
        agentType: 'my-custom-agent',
        whenToUse: '自定义测试 Agent',
        source: 'user',
        getSystemPrompt: () => 'Custom system prompt',
        tools: ['Read', 'Bash'],
      })

      expect(result.valid).toBe(true)
    })

    test('应该拒绝无效的 source', () => {
      const result = validateCustomAgentDefinition({
        agentType: 'test-agent',
        whenToUse: '测试',
        source: 'invalid-source',
        getSystemPrompt: () => 'test',
      } as any)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'source')).toBe(true)
    })
  })
})

describe('Agent 工具调用验证测试', () => {
  describe('validateAgentCallInput', () => {
    test('应该验证有效的 Agent 调用输入', () => {
      const result = validateAgentCallInput({
        prompt: '分析代码结构',
        description: '架构分析',
      })

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    test('应该验证有效的 Agent 类型', () => {
      const result = validateAgentCallInput({
        prompt: '任务',
        subagent_type: 'Explore',
      })

      expect(result.valid).toBe(true)
    })

    test('应该拒绝缺少 prompt', () => {
      const result = validateAgentCallInput({
        description: '没有 prompt',
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'prompt')).toBe(true)
    })

    test('应该拒绝空 prompt', () => {
      const result = validateAgentCallInput({
        prompt: '   ',
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'prompt')).toBe(true)
    })

    test('应该拒绝无效的 subagent_type', () => {
      const result = validateAgentCallInput({
        prompt: '任务',
        subagent_type: 'InvalidAgent',
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'subagent_type')).toBe(true)
    })

    test('应该拒绝无效的 mode', () => {
      const result = validateAgentCallInput({
        prompt: '任务',
        mode: 'invalid-mode',
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'mode')).toBe(true)
    })

    test('应该拒绝无效的 isolation', () => {
      const result = validateAgentCallInput({
        prompt: '任务',
        isolation: 'invalid',
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'isolation')).toBe(true)
    })

    test('应该拒绝无效的 max_turns', () => {
      const result = validateAgentCallInput({
        prompt: '任务',
        max_turns: -1,
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'max_turns')).toBe(true)
    })

    test('应该拒绝非布尔 run_in_background', () => {
      const result = validateAgentCallInput({
        prompt: '任务',
        run_in_background: 'yes',
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'run_in_background')).toBe(true)
    })

    test('应该验证 team 参数完整性 - 只有 name', () => {
      const result = validateAgentCallInput({
        prompt: '任务',
        name: 'worker1',
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'team_name')).toBe(true)
    })

    test('应该验证 team 参数完整性 - 只有 team_name', () => {
      const result = validateAgentCallInput({
        prompt: '任务',
        team_name: 'my-team',
      })

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'name')).toBe(true)
    })

    test('应该接受完整的 team 参数', () => {
      const result = validateAgentCallInput({
        prompt: '任务',
        name: 'worker1',
        team_name: 'my-team',
      })

      expect(result.valid).toBe(true)
    })

    test('应该拒绝非对象输入', () => {
      const result = validateAgentCallInput('not an object')

      expect(result.valid).toBe(false)
      expect(result.errors[0].field).toBe('input')
    })
  })
})

describe('枚举值获取函数测试', () => {
  test('getValidAgentTypes 应该返回 6 种类型', () => {
    const types = getValidAgentTypes()
    expect(types).toContain('general-purpose')
    expect(types).toContain('Explore')
    expect(types).toContain('Plan')
    expect(types).toContain('verification')
    expect(types).toContain('claude-code-guide')
    expect(types).toContain('statusline-setup')
    expect(types.length).toBe(6)
  })

  test('getValidPermissionModes 应该返回 5 种模式', () => {
    const modes = getValidPermissionModes()
    expect(modes).toContain('bypassPermissions')
    expect(modes).toContain('acceptEdits')
    expect(modes).toContain('auto')
    expect(modes).toContain('plan')
    expect(modes).toContain('bubble')
    expect(modes.length).toBe(5)
  })

  test('getValidIsolationModes 应该返回 2 种模式', () => {
    const modes = getValidIsolationModes()
    expect(modes).toContain('worktree')
    expect(modes).toContain('remote')
    expect(modes.length).toBe(2)
  })
})

describe('内置 Agent 定义测试', () => {
  test('GENERAL_PURPOSE_AGENT 应该有所有必需字段', () => {
    const result = validateAgentDefinition(GENERAL_PURPOSE_AGENT)
    expect(result.valid).toBe(true)
    expect(GENERAL_PURPOSE_AGENT.agentType).toBe('general-purpose')
    expect(GENERAL_PURPOSE_AGENT.tools).toEqual(['*'])
    expect(typeof GENERAL_PURPOSE_AGENT.getSystemPrompt).toBe('function')
  })

  test('EXPLORE_AGENT 应该是只读的', () => {
    const result = validateAgentDefinition(EXPLORE_AGENT)
    expect(result.valid).toBe(true)
    expect(EXPLORE_AGENT.isReadOnly).toBe(true)
    expect(EXPLORE_AGENT.disallowedTools).toContain('Write')
    expect(EXPLORE_AGENT.disallowedTools).toContain('Edit')
  })

  test('PLAN_AGENT 应该是只读的', () => {
    const result = validateAgentDefinition(PLAN_AGENT)
    expect(result.valid).toBe(true)
    expect(PLAN_AGENT.isReadOnly).toBe(true)
  })

  test('VERIFICATION_AGENT 应该有完整定义', () => {
    const result = validateAgentDefinition(VERIFICATION_AGENT)
    expect(result.valid).toBe(true)
    expect(VERIFICATION_AGENT.tools).toEqual(['*'])
  })

  test('getSystemPrompt 应该返回非空字符串', () => {
    expect(GENERAL_PURPOSE_AGENT.getSystemPrompt().length).toBeGreaterThan(0)
    expect(EXPLORE_AGENT.getSystemPrompt().length).toBeGreaterThan(0)
    expect(PLAN_AGENT.getSystemPrompt().length).toBeGreaterThan(0)
    expect(VERIFICATION_AGENT.getSystemPrompt().length).toBeGreaterThan(0)
  })
})
