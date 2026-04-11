/**
 * Agent 工具测试
 * 
 * 测试 Agent 工具的创建和执行
 */

import { describe, test, expect, beforeEach } from 'vitest'
import {
  validateAgentInput,
  getAvailableAgentTypes,
  createAgentToolDefinition,
  executeAgentTool,
} from '../../tools/agentTool'

describe('Agent 工具测试', () => {
  describe('validateAgentInput', () => {
    test('应该验证有效的 Agent 输入', () => {
      const result = validateAgentInput({
        prompt: '分析代码结构',
        description: '架构分析任务',
      })
      
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
    
    test('应该拒绝缺少 prompt 的输入', () => {
      const result = validateAgentInput({
        description: '没有 prompt',
      })
      
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('prompt'))).toBe(true)
    })
    
    test('应该拒绝空 prompt', () => {
      const result = validateAgentInput({
        prompt: '   ',
      })
      
      expect(result.valid).toBe(false)
    })
    
    test('应该验证 team 参数的完整性', () => {
      // 只有 name 没有 team_name
      const result1 = validateAgentInput({
        prompt: '任务',
        name: 'worker1',
      })
      expect(result1.valid).toBe(false)
      
      // 只有 team_name 没有 name
      const result2 = validateAgentInput({
        prompt: '任务',
        team_name: 'my-team',
      })
      expect(result2.valid).toBe(false)
      
      // 两个都有
      const result3 = validateAgentInput({
        prompt: '任务',
        name: 'worker1',
        team_name: 'my-team',
      })
      expect(result3.valid).toBe(true)
    })
    
    test('应该验证 subagent_type 类型', () => {
      const result = validateAgentInput({
        prompt: '任务',
        subagent_type: 123, // 应该是字符串
      })
      
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('subagent_type'))).toBe(true)
    })
  })
  
  describe('getAvailableAgentTypes', () => {
    test('应该返回内置 Agent 类型列表', () => {
      const types = getAvailableAgentTypes()
      
      expect(types).toContain('general-purpose')
      expect(types).toContain('Explore')
      expect(types).toContain('Plan')
      expect(types).toContain('verification')
      expect(types).toContain('claude-code-guide')
      expect(types).toContain('statusline-setup')
    })
    
    test('应该返回 6 种内置 Agent', () => {
      const types = getAvailableAgentTypes()
      expect(types.length).toBe(6)
    })
  })
  
  describe('createAgentToolDefinition', () => {
    test('应该创建有效的工具定义', () => {
      const tool = createAgentToolDefinition()
      
      expect(tool.name).toBe('Agent')
      expect(tool.description).toBeTruthy()
      expect(tool.inputSchema).toBeDefined()
      expect(tool.inputSchema.properties).toBeDefined()
      expect(tool.inputSchema.properties.prompt).toBeDefined()
      expect(tool.inputSchema.required).toContain('prompt')
    })
    
    test('应该包含所有 Agent 类型作为枚举值', () => {
      const tool = createAgentToolDefinition()
      const types = getAvailableAgentTypes()
      
      expect(tool.inputSchema.properties.subagent_type.enum).toEqual(types)
    })
    
    test('应该包含权限模式枚举', () => {
      const tool = createAgentToolDefinition()
      
      expect(tool.inputSchema.properties.mode.enum).toContain('bypassPermissions')
      expect(tool.inputSchema.properties.mode.enum).toContain('acceptEdits')
      expect(tool.inputSchema.properties.mode.enum).toContain('auto')
      expect(tool.inputSchema.properties.mode.enum).toContain('plan')
      expect(tool.inputSchema.properties.mode.enum).toContain('bubble')
    })
  })
  
  describe('executeAgentTool', () => {
    const mockContext = {
      userId: 'test-user',
      projectRoot: '/tmp/test',
    }
    
    test('应该成功执行有效的 Agent 输入', async () => {
      const result = await executeAgentTool({
        prompt: '分析代码结构',
        description: '架构分析',
        subagent_type: 'Explore',
      }, mockContext as any)
      
      expect(result.success).toBe(true)
      expect(result.result).toBeDefined()
    })
    
    test('应该返回正确的 Agent 类型', async () => {
      const result = await executeAgentTool({
        prompt: '搜索代码',
        subagent_type: 'Explore',
      }, mockContext as any)
      
      expect(result.success).toBe(true)
      const output = result.result as any
      expect(output.agentType).toBe('Explore')
    })
    
    test('应该拒绝无效的 Agent 类型', async () => {
      const result = await executeAgentTool({
        prompt: '任务',
        subagent_type: 'InvalidAgentType',
      }, mockContext as any)
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('未知的 Agent 类型')
    })
    
    test('应该处理团队成员模式', async () => {
      const result = await executeAgentTool({
        prompt: '执行任务',
        name: 'worker1',
        team_name: 'my-team',
      }, mockContext as any)
      
      expect(result.success).toBe(true)
      const output = result.result as any
      expect(output.status).toBe('teammate_spawned')
      expect(output.teamName).toBe('my-team')
      expect(output.memberName).toBe('worker1')
    })
    
    test('应该处理后台执行模式', async () => {
      const result = await executeAgentTool({
        prompt: '后台任务',
        run_in_background: true,
      }, mockContext as any)
      
      expect(result.success).toBe(true)
      const output = result.result as any
      expect(output.status).toBe('async_launched')
    })
    
    test('应该验证输入失败', async () => {
      const result = await executeAgentTool({
        // 缺少 prompt
      }, mockContext as any)
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('输入验证失败')
    })
  })
})
