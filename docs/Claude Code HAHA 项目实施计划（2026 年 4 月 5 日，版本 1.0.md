# Claude Code HAHA 项目实施计划（2026 年 4 月 5 日，版本 1.0）

# Claude Code HAHA 项目实施计划

基于 `Implementation-Progress.md` 的完整开发路线图

**文档版本**: 1.0

**创建日期**: 2026-04-05

**预计总工期**: 约 12-16 周

---

## 计划概览

```Plain Text

阶段 1: 基础完善 (1-2 周) ✅ 已完成
阶段 2: Agent 核心链路 (3-4 周) ✅ 已完成
    │
    ├── 2.1 Agent 定义体系完善 ✅
    ├── 2.2 AgentTool.call() 实现 ✅
    ├── 2.3 runAgent() 运行时实现 ✅
    └── 2.4 Query 循环集成 ✅
阶段 3: 权限系统 (2 周) ✅ 已完成
    │
    ├── 3.1 Permission Mode 实现 ✅
    ├── 3.2 工具白名单/黑名单 ✅
    └── 3.3 运行时权限检查 ✅
阶段 4: 多 Agent 协作 (3-4 周) ✅ 已完成
    │
    ├── 4.1 单 Agent 执行增强 ✅
    ├── 4.2 SendMessage 机制 ✅
    ├── 4.3 Fork 子代理模式 ✅
    └── 4.4 Teammate 团队模式 ✅
阶段 5: 异步与后台 (2 周) ✅
    │
    ├── 5.1 后台任务管理 ✅
    ├── 5.2 任务状态跟踪 ✅
    └── 5.3 通知机制 ✅
阶段 6: 高级功能 (2-3 周) ✅
    │
    ├── 6.1 Skill 预加载 ✅
    ├── 6.2 Hook 系统 ✅
    └── 6.3 性能优化 ✅
阶段 7: 集成与测试 (2 周) ✅
    │
    ├── 7.1 端到端测试 ✅
    ├── 7.2 前端集成 ✅
    └── 7.3 文档完善 ✅
```

---

## 阶段 1: 基础完善

### 目标

完善工具系统，建立测试框架，为 Agent 开发打下坚实基础。

### 1.1 工具系统收尾

| 任务 | 描述 | 依赖 | 工期 | 验收标准 | 状态 |
|---|---|---|---|---|---|
| T1.1.1 | 实现缺失的工具 (`Agent`, `SendMessage`, `ExitPlanMode`, `Sleep`, `NotebookEdit`) | 无 | 2天 | 工具可注册、可执行、有测试 | ✅ 已完成 |
| T1.1.2 | 统一工具命名规范 (Read/FileRead, Write/FileWrite 等) | T1.1.1 | 1天 | 所有工具别名映射正确 | ✅ 已完成 |
| T1.1.3 | 完善工具输入验证 (JSON Schema 校验) | T1.1.2 | 1天 | 无效输入返回明确错误 | ✅ 已完成 |
**验收测试**:

```Bash

# 测试工具注册
curl http://localhost:3000/api/tools | jq '.data.tools | length'  # 应 >= 17
# 测试工具执行
curl -X POST http://localhost:3000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"toolName":"Read","toolInput":{"path":".env"}}'
```

### 1.2 工具注册表重构

| 任务 | 描述 | 依赖 | 工期 | 验收标准 | 状态 |
|---|---|---|---|---|---|
| T1.2.1 | 抽取 `ToolRegistry` 为独立模块 | 无 | 1天 | 可单独导入使用 | ✅ 已完成 |
| T1.2.2 | 实现工具生命周期事件 (`tool.registered`, `tool.unregistered`) | T1.2.1 | 1天 | 事件正确触发 | ✅ 已完成 |
| T1.2.3 | 添加工具依赖声明与自动加载 | T1.2.2 | 1天 | 依赖工具先加载 | ✅ 已完成 |
| T1.2.4 | 工具执行超时控制 | T1.2.3 | 1天 | 超时正确中断 | ✅ 已完成 |
**验收测试**:

```TypeScript

// 单元测试: ToolRegistry
const registry = new ToolRegistry()
registry.registerTool({
  name: 'TestTool',
  handler: async () => ({ success: true })
})
assert(registry.getTool('TestTool') !== undefined)
```

### 1.3 基础测试框架

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
| T1.3.1 | 搭建 Vitest 测试环境 | 无 | 1天 | 测试可运行 | ✅ 已完成 |
| T1.3.2 | 编写工具执行集成测试模板 | T1.3.1 | 1天 | 有 3 个示例测试 | ✅ 已完成 |
| T1.3.3 | 添加 CI 流程配置 | T1.3.2 | 1天 | PR 自动跑测试 | ✅ 已完成 |
| T1.3.4 | 建立测试覆盖率基线 | T1.3.3 | 1天 | 覆盖率 > 60% | ✅ 已完成 |
**目录结构**:

```Plain Text

server/src/__tests__/
├── unit/
│   ├── tools/
│   │   ├── BashTool.test.ts
│   │   ├── FileReadTool.test.ts
│   │   └── ...
│   └── agents/
│       └── builtInAgents.test.ts
├── integration/
│   ├── toolExecution.test.ts
│   └── agentExecution.test.ts
└── fixtures/
    └── testFiles/
```

**验收标准**: `npm test` 通过率 100%，覆盖率报告生成

---

## 阶段 2: Agent 核心链路

### 目标

实现 Agent 的完整执行链路，包括定义、加载、运行、清理。

### 2.1 Agent 定义体系完善

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T2.1.1|完善 `AgentDefinition` 接口，添加所有字段|T1.3|1天|接口完整，包含所有文档字段|
|T2.1.2|实现 `AgentDefinitionValidator` 验证器|T2.1.1|1天|无效定义抛出明确错误|
|T2.1.3|编写所有内置 Agent 的完整 System Prompt|T2.1.2|2天|6 个 Agent 均可通过 LLM 测试|
|T2.1.4|添加 Agent 单元测试|T2.1.3|1天|每个 Agent 有独立测试|
**Agent 定义文件结构** (新):

```Plain Text

server/src/agents/
├── definitions/
│   ├── generalPurpose.ts
│   ├── explore.ts
│   ├── plan.ts
│   ├── verification.ts
│   ├── claudeCodeGuide.ts
│   └── statuslineSetup.ts
├── core/
│   ├── types.ts
│   ├── loader.ts          # 从文件加载 Agent 定义
│   ├── validator.ts
│   └── registry.ts        # Agent 注册表
└── builtInAgents.ts
```

**验收测试**:

```TypeScript

// 测试 Agent 加载
const agents = loadBuiltInAgents()
assert(agents.length === 6)
assert(agents.find(a => a.agentType === 'Explore') !== undefined)
// 测试 System Prompt 生成
const exploreAgent = agents.find(a => a.agentType === 'Explore')
const prompt = exploreAgent.getSystemPrompt()
assert(prompt.includes('READ-ONLY'))
```

### 2.2 AgentTool.call() 实现

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T2.2.1|创建 `AgentTool` 类，定义 inputSchema/outputSchema|T2.1|1天|Schema 与文档一致|
|T2.2.2|实现参数解析与校验|T2.2.1|1天|无效参数返回错误|
|T2.2.3|实现 Agent 选择与路由逻辑|T2.2.2|2天|支持 type/name/team_name 路由|
|T2.2.4|实现权限前置检查|T2.2.3|1天|拒绝返回明确原因|
|T2.2.5|实现同步/异步模式分发|T2.2.4|1天|两种模式均正确工作|
**核心代码结构**:

```TypeScript

// server/src/agents/core/AgentTool.ts
export class AgentTool {
  readonly name = 'Agent'
  readonly description = 'Launch a new agent to complete a task'
  
  readonly inputSchema = {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '...' },
      subagent_type: { type: 'string', enum: ['Explore', 'Plan', ...] },
      model: { type: 'string' },
      run_in_background: { type: 'boolean' },
      name: { type: 'string' },
      team_name: { type: 'string' },
      mode: { type: 'string', enum: ['bypassPermissions', 'acceptEdits', ...] },
      isolation: { type: 'string', enum: ['worktree', 'remote'] },
      cwd: { type: 'string' },
    },
    required: ['prompt', 'description']
  }
  async call(
    input: AgentToolInput,
    context: ToolUseContext
  ): Promise<ToolResult> {
    // 1. 解析参数
    // 2. 权限检查
    // 3. Agent 选择
    // 4. 路由分发
  }
}
```

**验收测试**:

```TypeScript

// 测试路由
const tool = new AgentTool()
// 测试: 普通 Agent
const result1 = await tool.call({
  prompt: '分析项目结构',
  description: '架构分析',
  subagent_type: 'Explore'
}, mockContext)
assert(result1.status === 'async_launched' || result1.status === 'completed')
// 测试: Team 模式
const result2 = await tool.call({
  prompt: '代码审查',
  description: 'PR审查',
  name: 'reviewer',
  team_name: 'my-team'
}, mockContext)
assert(result2.status === 'teammate_spawned')
// 测试: 权限拒绝
const result3 = await tool.call({
  prompt: '删除所有文件',
  description: '危险操作',
  subagent_type: 'general-purpose'
}, { ...mockContext, deniedTools: ['Agent'] })
assert(result3.success === false)
```

### 2.3 runAgent() 运行时实现

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T2.3.1|创建 `AgentRuntimeContext` 上下文类|T2.2|1天|上下文正确传递|
|T2.3.2|实现 MCP 服务器初始化|T2.3.1|1天|Agent 可获得 MCP 工具|
|T2.3.3|实现 System Prompt 构建|T2.3.2|1天|Prompt 包含必要信息|
|T2.3.4|实现工具池解析 (白名单/黑名单)|T2.3.3|1天|只读 Agent 无写工具|
|T2.3.5|实现资源清理 (finally 块)|T2.3.4|1天|所有资源正确释放|
**核心代码结构**:

```TypeScript

// server/src/agents/core/runAgent.ts
export async function* runAgent(
  params: RunAgentParams
): AsyncGenerator<AgentMessage> {
  const {
    agentDefinition,
    promptMessages,
    toolUseContext,
    canUseTool,
    isAsync,
  } = params
  // 初始化阶段
  const agentId = createAgentId()
  const runtimeContext = await createRuntimeContext(agentDefinition, params)
  
  try {
    // Query 循环
    for await (const message of query({
      messages: initialMessages,
      systemPrompt: agentSystemPrompt,
      canUseTool,
      toolUseContext: runtimeContext,
    })) {
      yield message
    }
  } finally {
    // 清理阶段
    await cleanupResources(agentId)
  }
}
```

**验收测试**:

```TypeScript

// 测试 Explore Agent 工具限制
const exploreRuntime = await createRuntimeContext(
  builtInAgents.Explore,
  { ...params }
)
const tools = exploreRuntime.availableTools
assert(!tools.find(t => t.name === 'Write'))
assert(!tools.find(t => t.name === 'Edit'))
assert(!tools.find(t => t.name === 'Bash'))
// 测试资源清理
let cleanupCalled = false
jest.spyOn(cleanupModule, 'cleanupResources').mockImplementation(() => {
  cleanupCalled = true
})
// 执行 Agent
await consumeGenerator(runAgent(params))
assert(cleanupCalled)
```

### 2.4 Query 循环集成

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T2.4.1|重构现有 `SessionConversationManager` 的循环逻辑|T2.3|2天|循环可中断、可恢复|
|T2.4.2|实现工具调用结果回传|T2.4.1|1天|AI 收到工具结果继续推理|
|T2.4.3|实现 `maxTurns` 限制|T2.4.2|1天|达到限制正常结束|
|T2.4.4|实现用户中断 (Abort)|T2.4.3|1天|ESC 可中断执行|
|T2.4.5|集成测试: 完整 Agent 执行|T2.4.4|2天|E2E 测试通过|
**验收测试**:

```TypeScript

// 测试 maxTurns 限制
const params = { ...defaultParams, maxTurns: 3 }
let turnCount = 0
for await (const msg of runAgent(params)) {
  if (msg.type === 'assistant') turnCount++
}
assert(turnCount <= 3)
// 测试工具结果回传
let receivedToolResult = false
for await (const msg of runAgent(params)) {
  if (msg.type === 'tool_result' && msg.toolName === 'Read') {
    receivedToolResult = true
  }
}
assert(receivedToolResult)
// E2E 测试
await request(app)
  .post('/api/agents/execute')
  .send({ agentType: 'Explore', prompt: '找 package.json' })
  .expect(200)
  .expect(res => {
    assert(res.body.status === 'completed')
    assert(res.body.result.includes('package.json'))
  })
```

---

## 阶段 3: 权限系统

### 目标

实现完整的权限控制体系，确保 Agent 操作安全可控。

### 3.1 Permission Mode 实现

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T3.1.1|定义 `PermissionMode` 枚举|T2.4|0.5天|5 种模式定义完整|
|T3.1.2|实现各模式的行为逻辑|T3.1.1|2天|每种模式行为正确|
|T3.1.3|实现 Agent 权限覆盖规则|T3.1.2|1天|子 Agent 不能提升权限|
|T3.1.4|添加权限测试|T3.1.3|1天|全覆盖测试|
**模式行为矩阵**:

|模式|文件读取|文件写入|Bash|权限提示|
|---|---|---|---|---|
|`bypassPermissions`|✅|✅|✅|无|
|`acceptEdits`|✅|✅ (自动)|⚠️|无|
|`auto`|✅|⚠️|⚠️|有|
|`plan`|✅|❌|❌|强制审批|
|`bubble`|✅|⚠️|⚠️|冒泡到父|
**验收测试**:

```TypeScript

// 测试 plan 模式
const result = await agentTool.call({
  prompt: '写代码',
  mode: 'plan'
}, context)
// 应返回需要审批
assert(result.status === 'requires_approval')
// 测试权限冒泡
const parentContext = { mode: 'bypassPermissions' }
const childTool = new AgentTool()
const childResult = await childTool.call({ ... }, childContext)
// bypassPermissions 不可被覆盖
assert(childResult.error?.includes('权限不可提升'))
```

### 3.2 工具白名单/黑名单

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T3.2.1|实现 `filterAllowedTools()`|T3.1|1天|白名单生效|
|T3.2.2|实现 `filterDeniedTools()`|T3.2.1|1天|黑名单生效|
|T3.2.3|实现 `filterDeniedAgents()`|T3.2.2|1天|Agent 规则过滤|
|T3.2.4|添加规则测试|T3.2.3|1天|规则正确生效|
**验收测试**:

```TypeScript

// 测试白名单
const allowed = filterAllowedTools(allTools, ['Read', 'Glob', 'Grep'])
assert(allowed.length === 3)
assert(allowed.find(t => t.name === 'Write') === undefined)
// 测试黑名单
const denied = filterDeniedTools(allTools, ['Bash', 'Write'])
assert(denied.find(t => t.name === 'Bash') === undefined)
// 测试 Agent 规则
const rules = { deny: ['Agent(Explore)', 'Agent(Plan)'] }
const filteredAgents = filterDeniedAgents(allAgents, rules)
assert(!filteredAgents.find(a => a.agentType === 'Explore'))
```

### 3.3 运行时权限检查

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T3.3.1|在工具执行前注入权限检查|T3.2|1天|检查在执行前|
|T3.3.2|实现路径访问控制|T3.3.1|1天|禁止访问 System32|
|T3.3.3|实现危险操作二次确认|T3.3.2|1天|rm -rf 等需确认|
|T3.3.4|权限测试|T3.3.3|1天|全覆盖|
**验收测试**:

```TypeScript

// 测试路径限制
const result = await toolExecutor.execute('Read', {
  path: 'C:\\Windows\\System32\\config\\SAM'
}, { deniedPaths: ['**/System32/**'] })
assert(result.success === false)
assert(result.error.includes('访问被拒绝'))
// 测试危险命令
const bashResult = await toolExecutor.execute('Bash', {
  command: 'rm -rf /'
}, { canExecuteDangerous: false })
assert(bashResult.success === false)
```

---

## 阶段 4: 多 Agent 协作

### 目标

实现复杂的多 Agent 协作场景。

### 4.1 单 Agent 执行增强

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T4.1.1|实现 `executeAgent()` 函数|T3.3|1天|可执行单个 Agent|
|T4.1.2|实现进度回调|T4.1.1|1天|WebSocket 推送进度|
|T4.1.3|实现 Agent 状态查询|T4.1.2|1天|可查询运行状态|
|T4.1.4|单 Agent 集成测试|T4.1.3|1天|3 个 Agent 测试通过|
### 4.2 SendMessage 机制

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T4.2.1|创建 `SendMessageTool`|T4.1|1天|可发送消息|
|T4.2.2|实现 Agent 消息路由|T4.2.1|1天|按 ID/Name 路由|
|T4.2.3|实现消息队列|T4.2.2|1天|消息不丢失|
|T4.2.4|One-shot Agent 排除|T4.2.3|0.5天|Explore/Plan 不可继续|
|T4.2.5|SendMessage 测试|T4.2.4|1天|全场景测试|
**验收测试**:

```TypeScript

// 测试向运行中的 Agent 发送消息
const agent = await executeAgent({ agentType: 'Explore' })
await sendMessage(agent.id, '继续搜索 src 目录')
const response = await getAgentResponse(agent.id)
assert(response.includes('src'))
// 测试 One-shot Agent 不可继续
const exploreResult = await executeAgent({ agentType: 'Explore' })
const sendResult = await sendMessage(exploreResult.id, '继续')
assert(sendResult.error.includes('One-shot'))
```

### 4.3 Fork 子代理模式

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T4.3.1|实现 `ForkAgent`|T4.2|2天|继承父上下文|
|T4.3.2|实现上下文共享|T4.3.1|1天|消息历史共享|
|T4.3.3|实现工具池继承|T4.3.2|1天|工具完全一致|
|T4.3.4|实现缓存优化|T4.3.3|1天|相同前缀复用缓存|
|T4.3.5|实现 Fork 检测|T4.3.4|0.5天|防止递归 Fork|
|T4.3.6|Fork 模式测试|T4.3.5|1天|全场景测试|
**验收测试**:

```TypeScript

// 测试 Fork 上下文继承
const fork = await forkAgent({
  parentAgentId: parent.id,
  prompt: '深入分析这个模块'
})
const parentMessages = await getAgentMessages(parent.id)
const forkMessages = await getAgentMessages(fork.id)
assert(forkMessages.length >= parentMessages.length)
// 测试工具完全一致
const parentTools = await getAgentTools(parent.id)
const forkTools = await getAgentTools(fork.id)
assert(JSON.stringify(parentTools) === JSON.stringify(forkTools))
// 测试递归 Fork 拒绝
const nestedFork = await forkAgent({
  parentAgentId: fork.id,
  prompt: '再次深入'
})
assert(nestedFork.error.includes('不允许嵌套 Fork'))
```

### 4.4 Teammate 团队模式

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T4.4.1|实现 `spawnTeammate()`|T4.3|2天|创建团队成员|
|T4.4.2|实现 Mailbox 消息队列|T4.4.1|1天|异步消息传递|
|T4.4.3|实现团队协调器|T4.4.2|2天|任务分发|
|T4.4.4|实现团队状态同步|T4.4.3|1天|状态一致性|
|T4.4.5|团队模式测试|T4.4.4|2天|协作场景测试|
**验收测试**:

```TypeScript

// 测试创建团队
const team = await createTeam({
  orchestratorType: 'general-purpose',
  members: ['Explore', 'Plan', 'verification']
})
assert(team.members.length === 3)
// 测试任务分发
await team.orchestrator.assignTask({
  to: 'Explore',
  task: '分析代码结构'
})
const exploreStatus = await getAgentStatus(team.members[0].id)
assert(exploreStatus.currentTask === '分析代码结构')
// 测试消息传递
await team.sendMessage('Plan', '请审查 Explore 的结果')
const planMessages = await getAgentMessages(team.members[1].id)
assert(planMessages.length > 0)
```

---

## 阶段 5: 异步与后台

### 目标

实现后台任务管理和通知机制。

### 5.1 后台任务管理

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
||T5.1.1|创建 `BackgroundTaskManager`|T4.4|1天|任务注册/跟踪|✅|
|T5.1.2|实现任务优先级|T5.1.1|1天|优先级调度|✅|
|T5.1.3|实现资源限制|T5.1.2|1天|并发数限制|✅|
|T5.1.4|任务管理测试|T5.1.3|1天|全场景测试|✅|
### 5.2 任务状态跟踪

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T5.2.1|定义任务状态枚举|T5.1|0.5天|状态完整|✅|
|T5.2.2|实现状态机转换|T5.2.1|1天|合法转换|✅|
|T5.2.3|实现持久化|T5.2.2|1天|重启后恢复|✅|
|T5.2.4|状态跟踪测试|T5.2.3|1天|覆盖所有转换|✅|
**任务状态机**:

```Plain Text

CREATED → RUNNING → COMPLETED
           ↓    ↘
        FAILED  CANCELLED
           ↓
        BLOCKED
```

### 5.3 通知机制

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T5.3.1|实现 WebSocket 推送|T5.2|1天|实时通知|✅|
|T5.3.2|实现邮件通知|T5.3.1|1天|可选通知|✅|
|T5.3.3|实现通知模板|T5.3.2|1天|模板可配置|✅|
|T5.3.4|通知测试|T5.3.3|1天|发送成功验证|✅|
**验收测试**:

```TypeScript

// 测试 WebSocket 推送
const ws = new WebSocket('ws://localhost:3001')
const messages: string[] = []
ws.onmessage = (e) => messages.push(e.data)
await backgroundAgent.execute({ prompt: '分析项目' })
await wait(1000)
assert(messages.some(m => m.includes('task_started')))
assert(messages.some(m => m.includes('task_completed')))
// 测试通知
await notificationService.notify({
  type: 'task_completed',
  agentId: 'agent_123',
  message: '任务已完成'
})
assert(emailSent === true)
```

---

## 阶段 6: 高级功能

### 目标

实现 Skill、Hook 和性能优化。

### 6.1 Skill 预加载

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T6.1.1|定义 Skill 接口|T5.3|0.5天|接口完整|✅|
|T6.1.2|实现 Skill 加载器|T6.1.1|1天|动态加载|✅|
|T6.1.3|实现 Skill 注入|T6.1.2|1天|注入到 Agent|✅|
|T6.1.4|Skill 测试|T6.1.3|1天|加载成功验证|✅|
### 6.2 Hook 系统

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T6.2.1|定义 Hook 类型|T6.1|0.5天|6 种 Hook|✅|
|T6.2.2|实现 Hook 注册器|T6.2.1|1天|按事件注册|✅|
|T6.2.3|实现 Hook 执行器|T6.2.2|1天|同步/异步|✅|
|T6.2.4|Hook 测试|T6.2.3|1天|全场景测试|✅|
**Hook 列表**:

|Hook|触发时机|
|---|---|
|`SubagentStart`|子 Agent 启动时|
|`SubagentComplete`|子 Agent 完成时|
|`ToolBeforeCall`|工具调用前|
|`ToolAfterCall`|工具调用后|
|`AgentError`|Agent 出错时|
|`AgentComplete`|Agent 正常结束时|
### 6.3 性能优化

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T6.3.1|实现 Token 计数|T6.2|0.5天|精确计数|✅|
|T6.3.2|实现上下文压缩|T6.3.1|1天|节省 Token|✅|
|T6.3.3|实现 Prompt 缓存|T6.3.2|1天|缓存命中|✅|
|T6.3.4|实现 Auto-backup|T6.3.3|1天|长任务自动后台|✅|
|T6.3.5|性能测试|T6.3.4|1天|性能提升验证|✅|
**验收测试**:

```TypeScript

// 测试上下文压缩
const compressed = compressContext(longMessages)
assert(compressed.tokenCount < originalCount)
assert(compressed.meaningPreserved === true)
// 测试 Prompt 缓存
const cache1 = await getCachedPrompt('Explore', systemPrompt)
const cache2 = await getCachedPrompt('Explore', systemPrompt)
assert(cache2.hit === true)
assert(cache2.responseTime < cache1.responseTime)
// 测试 Auto-backup
const longTask = { prompt: '分析 10000 个文件' }
const result = await executeAgent(longTask, { autoBackgroundThreshold: 10000 })
assert(result.status === 'async_launched')
```

---

## 阶段 7: 集成与测试

### 目标

端到端测试，前端集成，文档完善。

### 7.1 端到端测试

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T7.1.1|编写 E2E 测试套件|T6.3|2天|Playwright 配置|✅|
|T7.1.2|测试 Agent 执行|T7.1.1|1天|真实 LLM 调用|✅|
|T7.1.3|测试多 Agent 协作|T7.1.2|1天|团队场景|✅|
|T7.1.4|性能基准测试|T7.1.3|1天|建立基线|✅|
### 7.2 前端集成

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T7.2.1|连接前端到真实 Agent|T7.1|1天|组件真实工作|✅|
|T7.2.2|实现 Agent 选择器|T7.2.1|1天|可选择 Agent|✅|
|T7.2.3|实现状态面板实时更新|T7.2.2|1天|WebSocket 同步|✅|
|T7.2.4|前端 E2E 测试|T7.2.3|1天|用户流程测试|✅|
### 7.3 文档完善

|任务|描述|依赖|工期|验收标准|
|---|---|---|---|---|
|T7.3.1|更新 API 文档|T7.2|1天|Swagger/OpenAPI|✅|
|T7.3.2|编写使用指南|T7.3.1|1天|快速入门|✅|
|T7.3.3|更新进度文档|T7.3.2|0.5天|所有功能标记完成|✅|
|T7.3.4|代码注释完善|T7.3.3|1天|JSDoc 完整|✅|
---

## 测试检查清单

### 单元测试清单

- [ ] `AgentDefinition` 验证

- [ ] `AgentTool` 参数解析

- [ ] `AgentTool` 路由逻辑

- [ ] `runAgent` 初始化

- [ ] `runAgent` 资源清理

- [ ] `PermissionMode` 各模式

- [ ] 工具白名单/黑名单

- [ ] `SendMessage` 路由

- [ ] `Fork` 上下文继承

- [ ] `Teammate` 团队创建

### 集成测试清单

- [ ] 工具执行完整流程

- [ ] 单 Agent 完整执行

- [ ] 多 Agent 协作场景

- [ ] 权限检查端到端

- [ ] 后台任务完整生命周期

- [ ] WebSocket 通知

### E2E 测试清单

- [ ] 用户注册/登录

- [ ] 创建会话

- [ ] 发送消息触发 Agent

- [ ] 查看 Agent 执行状态

- [ ] Agent 完成结果展示

- [ ] 会话历史

---

## 里程碑

|里程碑|完成时间|交付物|
|---|---|---|
|**M1: 工具完善**|第 1 周末|20+ 工具，测试框架|
|**M2: Agent 核心**|第 4 周末|Agent 可执行|
|**M3: 权限系统**|第 6 周末|安全可控|
|**M4: 多 Agent**|第 10 周末|协作可用|
|**M5: 后台任务**|第 12 周末|异步任务|
|**M6: 完整系统**|第 16 周末|可发布版本|
---

## 风险与应对

|风险|影响|应对措施|
|---|---|---|
|LLM API 不稳定|高|添加重试机制，本地降级|
|前端集成复杂|中|预留 2 周缓冲|
|权限绕过|高|严格代码审查|
|Token 超出限制|中|实现强制压缩|
---

## 附录: 任务依赖图

```Plain Text

T1.1 ─┬─ T1.2 ─ T1.3 ─┐
       │               │
       └───────────────┼──────────────────┐
                       │                  │
                       ▼                  │
                    T2.1 ────────────────┤
                       │                  │
                       ▼                  │
                    T2.2 ────────────────┤
                       │                  │
                       ▼                  │
                    T2.3 ────────────────┤
                       │                  │
                       ▼                  │
                    T2.4 ────────────────┤
                       │                  │
                       ▼                  │
                    T3.1 ────────────────┤
                       │                  │
                       ▼                  │
                    T3.2 ────────────────┤
                       │                  │
                       ▼                  │
                    T3.3 ────────────────┤
                       │                  │
                       ▼                  │
                    T4.1 ────────────────┤
                       │                  │
                       ▼                  │
                    T4.2 ────────────────┤
                       │                  │
                       ▼                  │
                    T4.3 ────────────────┤
                       │                  │
                       ▼                  │
                    T4.4 ────────────────┤
                       │                  │
                       ▼                  │
                    T5.1 ────────────────┤
                       │                  │
                       ▼                  │
                    T5.2 ────────────────┤
                       │                  │
                       ▼                  │
                    T5.3 ────────────────┤
                       │                  │
                       ▼                  │
                    T6.1 ────────────────┤
                       │                  │
                       ▼                  │
                    T6.2 ────────────────┤
                       │                  │
                       ▼                  │
                    T6.3 ────────────────┤
                       │                  │
                       ▼                  │
                    T7.1 ────────────────┤
                       │                  │
                       ▼                  │
                    T7.2 ────────────────┤
                       │                  │
                       ▼                  │
                    T7.3 ────────────────┘
```




