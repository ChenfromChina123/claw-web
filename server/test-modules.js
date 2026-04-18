/**
 * 模块拆分功能测试脚本
 */

console.log('='.repeat(70))
console.log('  模块拆分功能测试 - 开始')
console.log('='.repeat(70))

let passedTests = 0
let failedTests = 0

function test(name, fn) {
  try {
    fn()
    console.log('✅ ' + name)
    passedTests++
  } catch (error) {
    console.log('❌ ' + name + ': ' + error.message)
    failedTests++
  }
}

// ==================== 1. 测试 containerOrchestrator 模块 ====================
console.log('\n📦 测试 containerOrchestrator 模块 (8个子模块)\n')

test('导入 types.ts', () => {
  const types = require('./src/master/orchestrator/types.ts')
  if (!types.DEFAULT_POOL_CONFIG) throw new Error('DEFAULT_POOL_CONFIG 未导出')
  if (!types.ContainerInstance) throw new Error('ContainerInstance 类型未定义')
})

test('导入 containerOperations.ts', () => {
  const ops = require('./src/master/orchestrator/containerOperations.ts')
  if (!ops.ContainerOperations) throw new Error('ContainerOperations 类未导出')
})

test('导入 workspaceManager.ts', () => {
  const wm = require('./src/master/orchestrator/workspaceManager.ts')
  if (!wm.WorkspaceManager) throw new Error('WorkspaceManager 类未导出')
})

test('导入 containerLifecycle.ts', () => {
  const cl = require('./src/master/orchestrator/containerLifecycle.ts')
  if (!cl.ContainerLifecycle) throw new Error('ContainerLifecycle 类未导出')
})

test('导入 healthMonitor.ts', () => {
  const hm = require('./src/master/orchestrator/healthMonitor.ts')
  if (!hm.HealthMonitor) throw new Error('HealthMonitor 类未导出')
})

test('导入 dockerCleanup.ts', () => {
  const dc = require('./src/master/orchestrator/dockerCleanup.ts')
  if (!dc.DockerCleanup) throw new Error('DockerCleanup 类未导出')
})

test('导入 mappingPersistence.ts', () => {
  const mp = require('./src/master/orchestrator/mappingPersistence.ts')
  if (!mp.MappingPersistence) throw new Error('MappingPersistence 类未导出')
})

test('导入主协调器 containerOrchestrator.ts', () => {
  const co = require('./src/master/orchestrator/containerOrchestrator.ts')
  if (!co.ContainerOrchestrator) throw new Error('ContainerOrchestrator 类未导出')
  if (!co.getContainerOrchestrator) throw new Error('getContainerOrchestrator 函数未导出')
})

// ==================== 2. 测试 enhancedToolExecutor 模块 ====================
console.log('\n📦 测试 enhancedToolExecutor 模块 (3个子模块)\n')

test('导入 toolTypes.ts', () => {
  const types = require('./src/master/integration/types/toolTypes.ts')
  if (!types.ToolExecutionContext) throw new Error('ToolExecutionContext 类型未定义')
  if (!types.ToolResult) throw new Error('ToolResult 类型未定义')
  if (!types.DEFAULT_SANDBOX_CONFIG) throw new Error('DEFAULT_SANDBOX_CONFIG 未导出')
})

test('导入 fileTools.ts', () => {
  const ft = require('./src/master/integration/tools/fileTools.ts')
  if (!ft.createFileTools) throw new Error('createFileTools 函数未导出')
})

test('导入 shellTools.ts', () => {
  const st = require('./src/master/integration/tools/shellTools.ts')
  if (!st.createShellTools) throw new Error('createShellTools 函数未导出')
})

test('导入主协调器 enhancedToolExecutor.ts', () => {
  const ete = require('./src/master/integration/enhancedToolExecutor.ts')
  if (!ete.EnhancedToolExecutor) throw new Error('EnhancedToolExecutor 类未导出')
  if (!ete.getToolExecutor) throw new Error('getToolExecutor 函数未导出')
})

// ==================== 3. 测试 toolRegistry 模块 ====================
console.log('\n📦 测试 toolRegistry 模块 (5个子模块)\n')

test('导入 toolRegistryTypes.ts', () => {
  const types = require('./src/master/integrations/types/toolRegistryTypes.ts')
  if (!types.TOOL_CATEGORIES) throw new Error('TOOL_CATEGORIES 常量未导出')
  if (!types.PERMISSION_LEVELS) throw new Error('PERMISSION_LEVELS 常量未导出')
  if (!types.ToolRegistrationConfig) throw new Error('ToolRegistrationConfig 类型未定义')
})

test('导入 toolLifecycle.ts', () => {
  const tl = require('./src/master/integrations/core/toolLifecycle.ts')
  if (!tl.ToolEventEmitter) throw new Error('ToolEventEmitter 类未导出')
})

test('导入 toolDependency.ts', () => {
  const td = require('./src/master/integrations/core/toolDependency.ts')
  if (!td.ToolDependencyManager) throw new Error('ToolDependencyManager 类未导出')
})

test('导入 toolTimeout.ts', () => {
  const tt = require('./src/master/integrations/core/toolTimeout.ts')
  if (!tt.ToolTimeoutManager) throw new Error('ToolTimeoutManager 类未导出')
})

test('导入 builtinTools.ts', () => {
  const bt = require('./src/master/integrations/core/builtinTools.ts')
  if (!bt.BuiltinToolRegistrar) throw new Error('BuiltinToolRegistrar 类未导出')
})

test('导入主协调器 toolRegistry.ts', () => {
  const tr = require('./src/master/integrations/toolRegistry.ts')
  if (!tr.ToolRegistry) throw new Error('ToolRegistry 类未导出')
  if (!tr.getToolRegistry) throw new Error('getToolRegistry 函数未导出')
})

// ==================== 4. 测试 httpServer 模块 ====================
console.log('\n📦 测试 httpServer 模块 (2个子模块)\n')

test('导入 serverAuth.ts', () => {
  const sa = require('./src/master/server/serverAuth.ts')
  if (!sa.verifyMasterToken) throw new Error('verifyMasterToken 函数未导出')
  if (!sa.extractUserFromRequest) throw new Error('extractUserFromRequest 函数未导出')
})

test('导入 workerHandlers.ts', () => {
  const wh = require('./src/master/server/workerHandlers.ts')
  if (!wh.handleWorkerRequest) throw new Error('handleWorkerRequest 函数未导出')
  if (!wh.handleWorkerAgentExecute) throw new Error('handleWorkerAgentExecute 函数未导出')
})

// ==================== 5. 功能集成测试 ====================
console.log('\n🔗 集成测试\n')

test('创建 ContainerOrchestrator 实例', () => {
  const { getContainerOrchestrator } = require('./src/master/orchestrator/containerOrchestrator.ts')
  const orchestrator = getContainerOrchestrator()
  if (!orchestrator) throw new Error('无法创建实例')
  if (typeof orchestrator.initialize !== 'function') throw new Error('initialize 方法不存在')
})

test('创建 EnhancedToolExecutor 实例', () => {
  const { getToolExecutor } = require('./src/master/integration/enhancedToolExecutor.ts')
  const executor = getToolExecutor()
  if (!executor) throw new Error('无法创建实例')
  if (typeof executor.execute !== 'function') throw new Error('execute 方法不存在')
  if (typeof executor.registerTool !== 'function') throw new Error('registerTool 方法不存在')
})

test('创建 ToolRegistry 实例', () => {
  const { getToolRegistry } = require('./src/master/integrations/toolRegistry.ts')
  const registry = getToolRegistry()
  if (!registry) throw new Error('无法创建实例')
  if (typeof registry.getAllTools !== 'function') throw new Error('getAllTools 方法不存在')
  if (typeof registry.getTool !== 'function') throw new Error('getTool 方法不存在')
  
  // 验证内置工具是否注册成功
  const tools = registry.getAllTools()
  if (tools.length === 0) throw new Error('没有注册任何工具')
  console.log('   └─ 注册了 ' + tools.length + ' 个工具')
})

test('验证 serverAuth 认证函数', () => {
  const { verifyMasterToken, extractUserFromRequest } = require('./src/master/server/serverAuth.ts')
  
  // 创建模拟请求对象
  const mockReq = {
    headers: new Map([['X-Master-Token', 'test-token']])
  }
  
  // 测试 verifyMasterToken 返回布尔值
  const result = verifyMasterToken(mockReq)
  if (typeof result !== 'boolean') throw new Error('verifyMasterToken 应该返回布尔值')
})

// ==================== 测试结果汇总 ====================
console.log('\n' + '='.repeat(70))
console.log('  测试完成 - 通过: ' + passedTests + ', 失败: ' + failedTests)
console.log('='.repeat(70))

if (failedTests > 0) {
  process.exit(1)
} else {
  console.log('\n🎉 所有测试通过！模块拆分成功！\n')
}
