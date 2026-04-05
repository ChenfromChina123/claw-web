/**
 * 工具执行集成测试
 * 
 * 测试工具注册表的完整功能
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { ToolRegistry, ToolRegistryConfig, ToolRegistrationConfig } from '../../integrations/toolRegistry'

// 创建测试配置
function createTestRegistry(): ToolRegistry {
  return new ToolRegistry({
    projectRoot: '/tmp/test-project',
    enableCLI: false,
    enableMCP: false,
    enableCustom: true,
    defaultEnabled: true,
    defaultTimeout: 5000,
  })
}

describe('ToolRegistry 集成测试', () => {
  let registry: ToolRegistry
  
  beforeEach(() => {
    registry = createTestRegistry()
  })
  
  afterEach(() => {
    registry.removeAllListeners()
  })
  
  describe('工具注册', () => {
    test('应该正确注册内置工具', () => {
      const config: ToolRegistrationConfig = {
        name: 'TestTool',
        description: '测试工具',
        category: 'test',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
          required: ['input'],
        },
      }
      
      registry.registerBuiltinTool(config)
      
      const tool = registry.getTool('TestTool')
      expect(tool).toBeDefined()
      expect(tool?.name).toBe('TestTool')
      expect(tool?.displayName).toBe('TestTool')
    })
    
    test('应该触发注册事件', () => {
      let eventFired = false
      let eventData: unknown = null
      
      registry.on('tool.registered', (data) => {
        eventFired = true
        eventData = data
      })
      
      registry.registerBuiltinTool({
        name: 'EventTestTool',
        description: '测试事件',
        category: 'test',
        inputSchema: {},
      })
      
      expect(eventFired).toBe(true)
      expect(eventData).toHaveProperty('tool')
      expect((eventData as any).tool.name).toBe('EventTestTool')
    })
    
    test('应该正确处理别名', () => {
      registry.registerBuiltinTool({
        name: 'AliasedTool',
        description: '测试别名',
        category: 'test',
        inputSchema: {},
        aliases: ['alias1', 'alias2'],
      })
      
      const aliasedTool = registry.getTool('alias1')
      expect(aliasedTool).toBeDefined()
      expect(aliasedTool?.name).toBe('AliasedTool')
    })
  })
  
  describe('工具查询', () => {
    test('应该获取所有工具', () => {
      registry.registerBuiltinTool({
        name: 'Tool1',
        description: '工具1',
        category: 'test',
        inputSchema: {},
      })
      
      registry.registerBuiltinTool({
        name: 'Tool2',
        description: '工具2',
        category: 'test',
        inputSchema: {},
      })
      
      const tools = registry.getAllTools()
      expect(tools.length).toBeGreaterThanOrEqual(2)
    })
    
    test('应该按类别获取工具', () => {
      registry.registerBuiltinTool({
        name: 'FileTool',
        description: '文件工具',
        category: 'file',
        inputSchema: {},
      })
      
      const fileTools = registry.getToolsByCategory('file')
      expect(fileTools.some(t => t.name === 'FileTool')).toBe(true)
    })
    
    test('应该搜索工具', () => {
      registry.registerBuiltinTool({
        name: 'SearchableTool',
        description: '可搜索的工具',
        category: 'test',
        inputSchema: {},
      })
      
      const results = registry.searchTools('search')
      expect(results.length).toBeGreaterThan(0)
    })
    
    test('应该获取按类别分组的工具', () => {
      registry.registerBuiltinTool({
        name: 'GroupedTool',
        description: '分组工具',
        category: 'test',
        inputSchema: {},
      })
      
      const grouped = registry.getToolsGroupedByCategory()
      expect(grouped).toHaveProperty('test')
    })
  })
  
  describe('工具执行', () => {
    test('应该正确执行工具', async () => {
      registry.registerBuiltinTool({
        name: 'EchoTool',
        description: '回显工具',
        category: 'test',
        inputSchema: {},
        handler: async (args) => ({
          success: true,
          result: { echo: args },
        }),
      })
      
      const result = await registry.executeTool({
        toolName: 'EchoTool',
        toolInput: { message: 'hello' },
      })
      
      expect(result.success).toBe(true)
      expect(result.result).toBeDefined()
    })
    
    test('应该处理工具不存在的情况', async () => {
      const result = await registry.executeTool({
        toolName: 'NonExistentTool',
        toolInput: {},
      })
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('工具未找到')
    })
    
    test('应该触发执行事件', async () => {
      let startedFired = false
      let completedFired = false
      
      registry.on('tool.execution_started', () => {
        startedFired = true
      })
      
      registry.on('tool.execution_completed', () => {
        completedFired = true
      })
      
      registry.registerBuiltinTool({
        name: 'EventTool',
        description: '事件测试',
        category: 'test',
        inputSchema: {},
        handler: async () => ({ success: true, result: {} }),
      })
      
      await registry.executeTool({
        toolName: 'EventTool',
        toolInput: {},
      })
      
      expect(startedFired).toBe(true)
      expect(completedFired).toBe(true)
    })
  })
  
  describe('超时控制', () => {
    test('应该使用默认超时', () => {
      const config = registry.getTimeoutConfig()
      expect(config.defaultTimeout).toBe(5000)
    })
    
    test('应该设置工具超时', () => {
      registry.setToolTimeout('TestTool', 10000)
      expect(registry.getToolTimeout('TestTool')).toBe(10000)
    })
    
    test('应该执行超时工具', async () => {
      registry.setToolTimeout('SlowTool', 100)
      
      registry.registerBuiltinTool({
        name: 'SlowTool',
        description: '慢工具',
        category: 'test',
        inputSchema: {},
        handler: async () => {
          await new Promise(resolve => setTimeout(resolve, 500))
          return { success: true, result: {} }
        },
      })
      
      const result = await registry.executeTool({
        toolName: 'SlowTool',
        toolInput: {},
      })
      
      expect(result.success).toBe(false)
      expect(result.timedOut).toBe(true)
    })
  })
  
  describe('依赖管理', () => {
    test('应该检查依赖是否已加载', () => {
      registry.registerBuiltinTool({
        name: 'DependentTool',
        description: '有依赖的工具',
        category: 'test',
        inputSchema: {},
        dependencies: ['BaseTool'],
      })
      
      const check = registry.areDependenciesLoaded('DependentTool')
      expect(check.loaded).toBe(false)
      expect(check.missing).toContain('BaseTool')
    })
    
    test('应该获取工具依赖', () => {
      registry.registerBuiltinTool({
        name: 'ToolWithDeps',
        description: '有依赖的工具',
        category: 'test',
        inputSchema: {},
        dependencies: ['Dep1', 'Dep2'],
      })
      
      const deps = registry.getDependencies('ToolWithDeps')
      expect(deps).toContain('Dep1')
      expect(deps).toContain('Dep2')
    })
  })
  
  describe('工具管理', () => {
    test('应该启用/禁用工具', () => {
      registry.registerBuiltinTool({
        name: 'ToggleableTool',
        description: '可切换的工具',
        category: 'test',
        inputSchema: {},
      })
      
      expect(registry.setToolEnabled('ToggleableTool', false)).toBe(true)
      
      const tool = registry.getTool('ToggleableTool')
      expect(tool?.isEnabled).toBe(false)
    })
    
    test('应该注册自定义工具', () => {
      registry.registerCustomTool({
        name: 'CustomTool',
        displayName: '自定义工具',
        description: '用户自定义的工具',
        category: 'custom',
        inputSchema: {},
        isReadOnly: false,
        isConcurrencySafe: true,
        aliases: [],
      })
      
      const tool = registry.getTool('CustomTool')
      expect(tool).toBeDefined()
      expect(tool?.source).toBe('custom')
    })
    
    test('应该移除自定义工具', () => {
      registry.registerCustomTool({
        name: 'RemovableTool',
        displayName: '可移除的工具',
        description: '测试移除',
        category: 'custom',
        inputSchema: {},
        isReadOnly: false,
        isConcurrencySafe: true,
        aliases: [],
      })
      
      expect(registry.removeCustomTool('RemovableTool')).toBe(true)
      expect(registry.getTool('RemovableTool')).toBeUndefined()
    })
  })
  
  describe('执行历史', () => {
    test('应该记录执行历史', async () => {
      registry.registerBuiltinTool({
        name: 'HistoryTool',
        description: '历史测试',
        category: 'test',
        inputSchema: {},
        handler: async () => ({ success: true, result: {} }),
      })
      
      await registry.executeTool({
        toolName: 'HistoryTool',
        toolInput: {},
      })
      
      const history = registry.getHistory()
      expect(history.length).toBeGreaterThan(0)
      expect(history[0].toolName).toBe('HistoryTool')
    })
    
    test('应该清空历史', async () => {
      registry.registerBuiltinTool({
        name: 'ClearTool',
        description: '清空测试',
        category: 'test',
        inputSchema: {},
        handler: async () => ({ success: true, result: {} }),
      })
      
      await registry.executeTool({
        toolName: 'ClearTool',
        toolInput: {},
      })
      
      registry.clearHistory()
      
      const history = registry.getHistory()
      expect(history.length).toBe(0)
    })
  })
  
  describe('统计信息', () => {
    test('应该获取正确的统计信息', () => {
      registry.registerBuiltinTool({
        name: 'StatsTool',
        description: '统计工具',
        category: 'test',
        inputSchema: {},
      })
      
      const stats = registry.getStats()
      expect(stats.total).toBeGreaterThan(0)
      expect(stats.builtin).toBeGreaterThan(0)
    })
  })
})
