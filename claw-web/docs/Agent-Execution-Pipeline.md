# Claude Code HAHA 项目 - Agent 执行链路完整说明

## 📋 目录

1. [项目概述](#项目概述)
2. [项目结构](#项目结构)
3. [Agent 核心架构](#agent-核心架构)
4. [Agent 完整执行链路](#agent-完整执行链路)
5. [关键模块详解](#关键模块详解)
6. [内置 Agent 类型](#内置-agent-类型)
7. [多 Agent 协作机制](#多-agent-协作机制)
8. [工具系统](#工具系统)
9. [权限与安全](#权限与安全)
10. [状态管理](#状态管理)

---

## 项目概述

Claude Code HAHA 项目是一个基于 Claude AI 的智能代码助手系统，核心特性是通过 **Agent 系统** 实现复杂任务的自动化分解和并行处理。该项目采用模块化架构，支持多种 Agent 类型（通用、探索、规划、验证等），并具备完整的工具调用、权限控制、状态管理和多 Agent 协作能力。

**核心技术栈：**
- **运行时**: Bun / Node.js
- **语言**: TypeScript
- **UI 框架**: React
- **状态管理**: Zustand-like store
- **AI 引擎**: Anthropic Claude API
- **工具协议**: MCP (Model Context Protocol)

---

## 项目结构

```
src/
├── main.tsx                          # 应用入口点
├── query.ts                          # 核心查询引擎（Agent 执行循环）
├── tools.ts                          # 工具注册与组装
├── commands.ts                       # 命令注册
│
├── tools/                            # 工具实现层
│   ├── AgentTool/                    # ⭐ 核心：Agent 工具实现
│   │   ├── AgentTool.tsx             # Agent 工具定义（入口）
│   │   ├── runAgent.ts               # Agent 运行时引擎
│   │   ├── prompt.ts                 # Agent 提示词生成
│   │   ├── loadAgentsDir.ts          # Agent 定义加载器
│   │   ├── builtInAgents.ts          # 内置 Agent 注册
│   │   ├── constants.ts              # 常量定义
│   │   ├── agentToolUtils.ts         # 工具函数集合
│   │   ├── UI.tsx                    # UI 渲染组件
│   │   ├── forkSubagent.ts           # Fork 子代理机制
│   │   └── built-in/                 # 内置 Agent 实现
│   │       ├── generalPurposeAgent.ts    # 通用 Agent
│   │       ├── exploreAgent.ts           # 探索 Agent
│   │       ├── planAgent.ts              # 规划 Agent
│   │       ├── verificationAgent.ts      # 验证 Agent
│   │       ├── claudeCodeGuideAgent.ts   # 代码指南 Agent
│   │       └── statuslineSetup.ts        # 状态栏设置 Agent
│   │
│   ├── BashTool/                     # Bash 命令执行工具
│   ├── FileReadTool/                 # 文件读取工具
│   ├── FileWriteTool/                # 文件写入工具
│   ├── FileEditTool/                 # 文件编辑工具
│   ├── GlobTool/                     # 文件搜索工具
│   ├── GrepTool/                     # 内容搜索工具
│   └── ...                           # 其他工具
│
├── services/                         # 服务层
│   ├── mcp/                          # MCP 服务器管理
│   ├── analytics/                    # 分析与遥测
│   ├── api/                          # API 调用封装
│   └── compact/                      # 上下文压缩
│
├── utils/                            # 工具函数库
│   ├── permissions/                  # 权限管理
│   ├── model/                        # 模型配置
│   ├── messages/                     # 消息处理
│   ├── hooks/                        # 钩子系统
│   └── sessionStorage/               # 会话存储
│
├── state/                            # 状态管理
│   ├── AppStateStore.ts              # 全局状态
│   ├── store.ts                      # Store 初始化
│   └── selectors.ts                  # 状态选择器
│
├── tasks/                            # 任务管理
│   ├── LocalAgentTask/               # 本地 Agent 任务
│   └── RemoteAgentTask/              # 远程 Agent 任务
│
├── types/                            # 类型定义
│   ├── message.ts                    # 消息类型
│   ├── ids.ts                        # ID 类型
│   └── tools.ts                      # 工具类型
│
└── components/                       # React 组件
    └── agents/                       # Agent 相关组件
```

---

## Agent 核心架构

### 3.1 架构设计理念

Agent 系统采用 **"主从式多智能体"** 架构：

```
┌─────────────────────────────────────────────────────┐
│                   主 Agent (Coordinator)            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ Agent   │ │ Agent   │ │ Agent   │ │ Agent   │  │
│  │ Tool    │ │ Tool    │ │ Tool    │ │ Tool    │  │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │
│       ▼           ▼           ▼           ▼         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │
│  │ Sub-Agent│ │ Sub-Agent│ │ Sub-Agent│ │ Sub-Agent│  │
│  │ (Explore)│ │ (Plan)  │ │ (Code)  │ │ (Test)  │  │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘  │
└─────────────────────────────────────────────────────┘
```

### 3.2 核心设计原则

1. **任务分解**: 复杂任务自动拆分为多个子任务
2. **专业化分工**: 不同 Agent 专注不同领域（探索、规划、编码等）
3. **并行执行**: 支持多个 Agent 并行工作以提高效率
4. **上下文隔离**: 每个 Agent 有独立的上下文和工具集
5. **权限控制**: 细粒度的权限管理和审批流程
6. **可扩展性**: 支持自定义 Agent 和插件扩展

---

## Agent 完整执行链路

### 4.1 总体流程图

```
用户输入
    │
    ▼
┌─────────────────┐
│  主循环接收消息  │  ← query.ts (QueryEngine)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         LLM 推理决策                     │  ← Claude API
│  "是否需要使用 Agent 工具？"              │
└────────┬────────────────────────────────┘
         │
         ├─ 是 → 进入 Agent 执行路径
         │        │
         │        ▼
         │  ┌─────────────────────┐
         │  │  AgentTool.call()   │  ← AgentTool.tsx:239
         │  └──────────┬──────────┘
         │             │
         │             ▼
         │  ┌─────────────────────────────────┐
         │  │  1. 参数解析与校验                 │
         │  │     - prompt, subagent_type      │
         │  │     - description, model         │
         │  │     - run_in_background          │
         │  └──────────────┬──────────────────┘
         │                 │
         │                 ▼
         │  ┌─────────────────────────────────┐
         │  │  2. Agent 选择与路由              │
         │  │     - 多 Agent 团队？→ spawnTeammate()
         │  │     - Fork 模式？→ FORK_AGENT    │
         │  │     - 普通 Agent？→ selectedAgent │
         │  └──────────────┬──────────────────┘
         │                 │
         │                 ▼
         │  ┌─────────────────────────────────┐
         │  │  3. 权限检查                     │
         │  │     - MCP 服务器可用性           │
         │  │     - 权限规则过滤               │
         │  │     - 隔离模式配置               │
         │  └──────────────┬──────────────────┘
         │                 │
         │                 ▼
         │  ┌─────────────────────────────────┐
         │  │  4. 系统提示构建                  │
         │  │     - Agent 定义提示             │
         │  │     - 环境信息增强               │
         │  │     - Fork 上下文继承            │
         │  └──────────────┬──────────────────┘
         │                 │
         │                 ▼
         │  ┌─────────────────────────────────┐
         │  │  5. 执行模式决定                  │
         │  │     - 同步执行 (shouldRunAsync=false)│
         │  │     - 异步后台 (shouldRunAsync=true) │
         │  └──────────────┬──────────────────┘
         │                 │
         │        ┌────────┴────────┐
         │        ▼                 ▼
         │  ┌──────────┐    ┌──────────────┐
         │  │ 同步模式  │    │ 异步后台模式  │
         │  └────┬─────┘    └──────┬───────┘
         │       │                 │
         │       ▼                 ▼
         │  ┌─────────────────────────────────┐
         │  │  6. runAgent() 执行              │  ← runAgent.ts:248
         │  └──────────────┬──────────────────┘
         │                 │
         │                 ▼
         │  ┌─────────────────────────────────┐
         │  │  7. Agent 初始化                  │
         │  │     - 创建 Agent ID              │
         │  │     - 解析模型配置               │
         │  │     - 构建 User/System Context   │
         │  │     - 解析工具列表               │
         │  │     - 初始化 MCP 服务器          │
         │  │     - 预加载 Skills              │
         │  │     - 注册 Hooks                │
         │  └──────────────┬──────────────────┘
         │                 │
         │                 ▼
         │  ┌─────────────────────────────────┐
         │  │  8. Query 循环 (主执行循环)       │  ← query()
         │  │     ┌─────────────────────┐     │
         │  │     │ while (!done) {     │     │
         │  │     │   ① LLM API 调用    │     │
         │  │     │   ② 流式响应处理     │     │
         │  │     │   ③ 工具调用执行     │     │
         │  │     │   ④ 结果收集         │     │
         │  │     │   ⑤ 进度更新         │     │
         │  │     │   ⑥ 上下文压缩检测   │     │
         │  │     │ }                   │     │
         │  │     └─────────────────────┘     │
         │  └──────────────┬──────────────────┘
         │                 │
         │                 ▼
         │  ┌─────────────────────────────────┐
         │  │  9. 结果处理与返回                │
         │  │     - finalizeAgentTool()       │
         │  │     - 分类 Handoff 警告         │
         │  │     - Worktree 清理             │
         │  │     - 通知发送                  │
         │  └──────────────┬──────────────────┘
         │                 │
         │                 ▼
         │  ┌─────────────────────────────────┐
         │  │  10. 清理资源                    │
         │  │      - MCP 断开连接             │
         │  │      - 注销 Hooks              │
         │  │      - 清理文件缓存             │
         │  │      - 杀死 Shell 任务          │
         │  └─────────────────────────────────┘
         │
         └─ 否 → 直接使用其他工具
                  │
                  ▼
               返回结果
```

### 4.2 详细执行步骤

#### 步骤 1: 用户输入与触发

**位置**: [query.ts](src/query.ts) → 主循环

```typescript
// 用户输入消息后，LLM 决定是否使用 Agent 工具
// LLM 输出 tool_use 块，name = "Agent"
{
  "type": "tool_use",
  "id": "toolu_xxx",
  "name": "Agent",
  "input": {
    "prompt": "分析这个项目的架构",
    "subagent_type": "Explore",
    "description": "项目架构分析"
  }
}
```

#### 步骤 2: AgentTool.call() 入口

**位置**: [AgentTool.tsx:239](src/tools/AgentTool/AgentTool.tsx#L239-L250)

```typescript
async call({
  prompt,
  subagent_type,
  description,
  model: modelParam,
  run_in_background,
  name,
  team_name,
  mode: spawnMode,
  isolation,
  cwd
}: AgentToolInput, toolUseContext, canUseTool, assistantMessage, onProgress?)
```

**主要职责**:
- 解析输入参数
- 获取应用状态 (`appState`)
- 检查权限和功能开关
- 决定执行路径

#### 步骤 3: Agent 选择与路由

**位置**: [AgentTool.tsx:284-356](src/tools/AgentTool/AgentTool.tsx#L284-L356)

**三种路由分支**:

1. **多 Agent 团队模式** (`teamName && name`)
   ```typescript
   if (teamName && name) {
     const result = await spawnTeammate({...})
     return { status: 'teammate_spawned', ... }
   }
   ```

2. **Fork 子代理模式** (`isForkPath`)
   ```typescript
   if (isForkPath) {
     selectedAgent = FORK_AGENT
     // 继承父代理的完整上下文
   }
   ```

3. **普通 Agent 模式**
   ```typescript
   const found = agents.find(agent => agent.agentType === effectiveType)
   selectedAgent = found
   ```

#### 步骤 4: 权限与前置检查

**位置**: [AgentTool.tsx:370-410](src/tools/AgentTool/AgentTool.tsx#L370-L410)

**检查项**:
- ✅ MCP 服务器可用性（必需的服务器必须已连接且认证）
- ✅ 权限规则过滤（`filterDeniedAgents`）
- ✅ 隔离模式配置（worktree / remote）
- ✅ 后台任务禁用检查

#### 步骤 5: 系统提示构建

**位置**: [AgentTool.tsx:493-541](src/tools/AgentTool/AgentTool.tsx#L493-L541)

**Fork 路径 vs 普通路径**:

| 特性 | Fork 路径 | 普通路径 |
|------|----------|---------|
| System Prompt | 继承父代理 | 使用 Agent 自身定义 |
| Prompt Messages | `buildForkedMessages()` | 简单 user message |
| 工具池 | 继承父代理（精确匹配） | 独立构建 |
| 缓存策略 | 字节级前缀匹配 | 独立缓存 |

```typescript
if (isForkPath) {
  // Fork: 继承父代理的 system prompt 和工具
  forkParentSystemPrompt = toolUseContext.renderedSystemPrompt
  promptMessages = buildForkedMessages(prompt, assistantMessage)
} else {
  // 普通: 使用 Agent 自己的 system prompt
  enhancedSystemPrompt = await enhanceSystemPromptWithEnvDetails([...])
  promptMessages = [createUserMessage({ content: prompt })]
}
```

#### 步骤 6: 执行模式决定

**位置**: [AgentTool.tsx:556-567](src/tools/AgentTool/AgentTool.tsx#L556-L567)

**异步条件判断**:

```typescript
const shouldRunAsync =
  (run_in_background === true ||
   selectedAgent.background === true ||
   isCoordinator ||
   forceAsync ||
   assistantForceAsync ||
   proactiveModule?.isProactiveActive()) &&
  !isBackgroundTasksDisabled
```

**触发场景**:
- ✅ 显式指定 `run_in_background: true`
- ✅ Agent 定义中 `background: true`
- ✅ 协调器模式
- ✅ Fork 子代理实验开启
- ✅ 助手模式 (Kairos)
- ✅ Proactive 模块激活

#### 步骤 7: runAgent() 核心执行

**位置**: [runAgent.ts:248](src/tools/AgentTool/runAgent.ts#L248-L329)

**函数签名**:

```typescript
export async function* runAgent({
  agentDefinition,        // Agent 定义
  promptMessages,         // 初始消息
  toolUseContext,         // 工具使用上下文
  canUseTool,             // 工具权限检查函数
  isAsync,                // 是否异步执行
  querySource,            // 查询来源标识
  override,               // 覆盖配置
  model,                  // 模型覆盖
  availableTools,         // 可用工具列表
  // ... 更多参数
}): AsyncGenerator<Message, void>
```

**初始化阶段** ([runAgent.ts:330-730](src/tools/AgentTool/runAgent.ts#L330-L730)):

1. **创建 Agent ID**
   ```typescript
   const agentId = override?.agentId ? override.agentId : createAgentId()
   ```

2. **解析模型配置**
   ```typescript
   const resolvedAgentModel = getAgentModel(
     agentDefinition.model,
     toolUseContext.options.mainLoopModel,
     model,
     permissionMode
   )
   ```

3. **构建 User/System Context**
   ```typescript
   const [baseUserContext, baseSystemContext] = await Promise.all([
     override?.userContext ?? getUserContext(),
     override?.systemContext ?? getSystemContext(),
   ])
   ```

4. **优化只读 Agent 的上下文** (Explore/Plan)
   ```typescript
   // 移除 CLAUDE.md 以节省 token (~5-15 Gtok/周)
   const shouldOmitClaudeMd = agentDefinition.omitClaudeMd && ...
   // 移除 gitStatus (~1-3 Gtok/周)
   const resolvedSystemContext = agentDefinition.agentType === 'Explore' || ...
     ? systemContextNoGit : baseSystemContext
   ```

5. **解析工具列表**
   ```typescript
   const resolvedTools = useExactTools
     ? availableTools
     : resolveAgentTools(agentDefinition, availableTools, isAsync).resolvedTools
   ```

6. **构建 System Prompt**
   ```typescript
   const agentSystemPrompt = override?.systemPrompt
     ? override.systemPrompt
     : asSystemPrompt(await getAgentSystemPrompt(...))
   ```

7. **初始化 MCP 服务器** ([runAgent.ts:95-218](src/tools/AgentTool/runAgent.ts#L95-L218))
   ```typescript
   const { clients: mergedMcpClients, tools: agentMcpTools, cleanup: mcpCleanup } =
     await initializeAgentMcpServers(agentDefinition, parentClients)
   ```

8. **预加载 Skills**
   ```typescript
   const skillsToPreload = agentDefinition.skills ?? []
   // 解析 skill 名称 → 加载内容 → 添加到 initialMessages
   ```

9. **注册 Frontmatter Hooks**
   ```typescript
   if (agentDefinition.hooks && hooksAllowedForThisAgent) {
     registerFrontmatterHooks(rootSetAppState, agentId, agentDefinition.hooks, ...)
   }
   ```

10. **创建子代理上下文**
    ```typescript
    const agentToolUseContext = createSubagentContext(toolUseContext, {
      options: agentOptions,
      agentId,
      agentType: agentDefinition.agentType,
      messages: initialMessages,
      // ...
    })
    ```

**执行阶段 - Query 循环** ([runAgent.ts:748-806](src/tools/AgentTool/runAgent.ts#L748-L806)):

```typescript
for await (const message of query({
  messages: initialMessages,
  systemPrompt: agentSystemPrompt,
  userContext: resolvedUserContext,
  systemContext: resolvedSystemContext,
  canUseTool,
  toolUseContext: agentToolUseContext,
  querySource,
  maxTurns: maxTurns ?? agentDefinition.maxTurns,
})) {
  // 处理每种消息类型:
  // 1. stream_event - API 指标更新 (TTFT, OTPS)
  // 2. attachment - 附件消息 (max_turns_reached 等)
  // 3. recordable messages - 记录并 yield
  //    - assistant, user, progress, system(compact_boundary)
}
```

**Query 内部循环** (简化):

```
┌────────────────────────────────────┐
│         Query Loop                  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ 1. 调用 Claude API           │  │
│  │    - 发送 messages + system  │  │
│  │    - 接收流式响应            │  │
│  └──────────────┬───────────────┘  │
│                 ▼                   │
│  ┌──────────────────────────────┐  │
│  │ 2. 处理 Assistant Message    │  │
│  │    - 提取 tool_use 块        │  │
│  │    - yield stream events     │  │
│  └──────────────┬───────────────┘  │
│                 ▼                   │
│  ┌──────────────────────────────┐  │
│  │ 3. 执行工具调用              │  │
│  │    - Bash, Read, Write...    │  │
│  │    - 权限检查                │  │
│  │    - 收集结果                │  │
│  └──────────────┬───────────────┘  │
│                 ▼                   │
│  ┌──────────────────────────────┐  │
│  │ 4. 上下文管理                │  │
│  │    - Token 计数             │  │
│  │    - 压缩检测               │  │
│  │    - 消息归约               │  │
│  └──────────────┬───────────────┘  │
│                 │                   │
│          ┌──────┴──────┐           │
│          ▼             ▼           │
│     [完成]       [继续循环]         │
└────────────────────────────────────┘
```

**清理阶段** ([runAgent.ts:816-859](src/tools/AgentTool/runAgent.ts#L816-L859)):

```typescript
finally {
  // 1. 清理 MCP 连接
  await mcpCleanup()

  // 2. 注销 Session Hooks
  if (agentDefinition.hooks) {
    clearSessionHooks(rootSetAppState, agentId)
  }

  // 3. 清理 Prompt Cache Tracking
  cleanupAgentTracking(agentId)

  // 4. 释放文件缓存
  agentToolUseContext.readFileState.clear()

  // 5. 释放 Perfetto 注册
  unregisterPerfettoAgent(agentId)

  // 6. 清理 Transcript 子目录
  clearAgentTranscriptSubdir(agentId)

  // 7. 清理 Todos 条目
  rootSetAppState(prev => {
    const { [agentId]: _removed, ...todos } = prev.todos
    return { ...prev, todos }
  })

  // 8. 杀死 Shell 任务
  killShellTasksForAgent(agentId, ...)
}
```

#### 步骤 8: 同步模式详细流程

**位置**: [AgentTool.tsx:785-1261](src/tools/AgentTool/AgentTool.tsx#L785-L1261)

**特点**:
- 阻塞等待 Agent 完成
- 支持前台转后台 (auto-background)
- 实时进度更新
- 可被用户中断 (AbortError)

**关键逻辑**:

```typescript
return runWithAgentContext(syncAgentContext, () => wrapWithCwd(async () => {
  // 1. 创建进度跟踪器
  const syncTracker = createProgressTracker()

  // 2. 注册为前台任务 (支持 auto-background)
  const registration = registerAgentForeground({...})

  // 3. 获取 AsyncIterator
  const agentIterator = runAgent({...})[Symbol.asyncIterator]()

  // 4. 消息处理循环
  while (true) {
    // Race: 下一条消息 vs 后台信号
    const raceResult = await Promise.race([
      agentIterator.next().then(r => ({ type: 'message', result: r })),
      backgroundPromise
    ])

    // 处理消息
    if (raceResult.type === 'message') {
      const { result } = raceResult
      if (result.done) break
      // 更新进度、转发事件...
    }

    // 处理后台转换
    if (raceResult.type === 'background') {
      // 转换为异步执行，立即返回
      void runWithAgentContext(async () => {
        // 在后台继续执行...
      })
      return { status: 'async_launched', ... }
    }
  }

  // 5. 最终化结果
  const agentResult = finalizeAgentTool(agentMessages, syncAgentId, metadata)

  // 6. Handoff 分类检查
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    const handoffWarning = await classifyHandoffIfNeeded({...})
    if (handoffWarning) {
      agentResult.content = [{ type: 'text', text: handoffWarning }, ...]
    }
  }

  return { data: { status: 'completed', prompt, ...agentResult } }
}))
```

#### 步骤 9: 异步后台模式详细流程

**位置**: [AgentTool.tsx:686-764](src/tools/AgentTool/AgentTool.tsx#L686-L764)

**特点**:
- 立即返回 `async_launched` 状态
- Agent 在后台独立运行
- 完成后通过通知回调
- 支持手动终止

**关键逻辑**:

```typescript
if (shouldRunAsync) {
  // 1. 注册异步任务
  const agentBackgroundTask = registerAsyncAgent({
    agentId: asyncAgentId,
    description,
    prompt,
    selectedAgent,
    setAppState: rootSetAppState,
    toolUseId: toolUseContext.toolUseId
  })

  // 2. 注册名称映射 (用于 SendMessage 路由)
  if (name) {
    rootSetAppState(prev => {
      const next = new Map(prev.agentNameRegistry)
      next.set(name, asAgentId(asyncAgentId))
      return { ...prev, agentNameRegistry: next }
    })
  }

  // 3. 启动后台执行 (fire-and-forget)
  void runWithAgentContext(asyncAgentContext, () =>
    wrapWithCwd(() => runAsyncAgentLifecycle({
      taskId: agentBackgroundTask.agentId,
      abortController: agentBackgroundTask.abortController!,
      makeStream: onCacheSafeParams => runAgent({...}),
      metadata,
      description,
      toolUseContext,
      rootSetAppState,
      agentIdForCleanup: asyncAgentId,
      enableSummarization: ...,
      getWorktreeResult: cleanupWorktreeIfNeeded
    }))
  )

  // 4. 立即返回
  return {
    data: {
      status: 'async_launched',
      agentId: agentBackgroundTask.agentId,
      description,
      prompt,
      outputFile: getTaskOutputPath(agentBackgroundTask.agentId),
      canReadOutputFile
    }
  }
}
```

#### 步骤 10: 结果格式化与返回

**位置**: [AgentTool.tsx:1298-1379](src/tools/AgentTool/AgentTool.tsx#L1298-L1379)

**输出状态类型**:

| 状态 | 触发条件 | 返回内容 |
|------|----------|----------|
| `completed` | 同步 Agent 正常完成 | Agent 输出 + 统计信息 |
| `async_launched` | 异步/后台启动 | agentId + outputFile |
| `teammate_spawned` | 多 Agent 团队模式 | teammate_id + tmux 信息 |
| `remote_launched` | 远程隔离模式 | taskId + sessionUrl |

**示例返回**:

```typescript
// completed
{
  status: 'completed',
  prompt: '分析项目架构',
  content: [{ type: 'text', text: '项目使用模块化架构...' }],
  agentId: 'agent_abc123',
  totalTokens: 15000,
  totalToolUseCount: 8,
  totalDurationMs: 12000
}

// async_launched
{
  status: 'async_launched',
  agentId: 'agent_def456',
  description: '项目架构分析',
  prompt: '分析这个项目的架构',
  outputFile: '/path/to/output.txt',
  canReadOutputFile: true
}
```

---

## 关键模块详解

### 5.1 AgentTool.tsx - Agent 工具定义

**文件**: [src/tools/AgentTool/AgentTool.tsx](src/tools/AgentTool/AgentTool.tsx)

**职责**:
- 定义 Agent 工具的接口 (inputSchema, outputSchema)
- 实现 `call()` 方法作为 Agent 执行入口
- 处理参数解析、路由决策、权限检查
- 管理同步/异步执行模式
- 协调结果格式化和返回

**核心常量**:
```typescript
export const AGENT_TOOL_NAME = 'Agent'           // 工具名称
export const LEGACY_AGENT_TOOL_NAME = 'Task'     // 兼容旧名
const PROGRESS_THRESHOLD_MS = 2000               // 后台提示显示阈值 (2秒)
```

**输入 Schema**:
```typescript
{
  description: string,           // 任务描述 (3-5个词)
  prompt: string,                // 任务指令
  subagent_type?: string,        // Agent 类型 (可选)
  model?: 'sonnet' | 'opus' | 'haiku',  // 模型覆盖
  run_in_background?: boolean,   // 是否后台运行
  name?: string,                 // Agent 名称 (团队模式)
  team_name?: string,            // 团队名称
  mode?: PermissionMode,         // 权限模式
  isolation?: 'worktree' | 'remote',  // 隔离模式
  cwd?: string                   // 工作目录覆盖
}
```

### 5.2 runAgent.ts - Agent 运行时引擎

**文件**: [src/tools/AgentTool/runAgent.ts](src/tools/AgentTool/runAgent.ts)

**职责**:
- Agent 生命周期管理 (创建 → 执行 → 清理)
- 上下文构建 (System Prompt, User Context, Tools)
- MCP 服务器初始化与管理
- Skill 预加载
- Hook 注册与注销
- Query 循环执行
- 资源清理

**关键函数**:

| 函数 | 行号 | 职责 |
|------|------|------|
| `runAgent()` | 248 | 主入口，AsyncGenerator |
| `initializeAgentMcpServers()` | 95 | 初始化 Agent 专用 MCP 服务器 |
| `getAgentSystemPrompt()` | 906 | 构建 Agent 系统提示 |
| `resolveSkillName()` | 945 | 解析 Skill 名称 |
| `filterIncompleteToolCalls()` | 866 | 过滤不完整的工具调用 |

### 5.3 prompt.ts - 提示词生成

**文件**: [src/tools/AgentTool/prompt.ts](src/tools/AgentTool/prompt.ts)

**职责**:
- 为 LLM 生成 Agent 工具的使用说明
- 包含 Agent 列表和使用示例
- 支持 Fork 模式的特殊指令
- 动态注入 Agent 列表 (附件或内联)

**核心函数**:
```typescript
export async function getPrompt(
  agentDefinitions: AgentDefinition[],
  isCoordinator?: boolean,
  allowedAgentTypes?: string[],
): Promise<string>
```

**生成的提示包含**:
1. 工具描述 ("Launch a new agent...")
2. 可用 Agent 类型和工具列表
3. 使用示例 (Example usage)
4. 使用注意事项 (Usage notes)
5. Fork 模式指令 (When to fork)
6. 提示写作指南 (Writing the prompt)

### 5.4 loadAgentsDir.ts - Agent 加载器

**文件**: [src/tools/AgentTool/loadAgentsDir.ts](src/tools/AgentTool/loadAgentsDir.ts)

**职责**:
- 从多个来源加载 Agent 定义
- 解析 Markdown 和 JSON 格式的 Agent
- 管理 Agent 优先级和去重
- 处理内存快照初始化

**Agent 来源优先级** (高→低):
1. **Built-in** - 内置 Agent (最高优先级)
2. **Plugin** - 插件提供的 Agent
3. **User Settings** - 用户自定义
4. **Project Settings** - 项目级别定义
5. **Policy Settings** - 策略配置
6. **Flag Settings** - 功能标志配置

**支持的格式**:

**Markdown 格式** (.md 文件):
```markdown
---
name: my-agent
description: 自定义 Agent 说明
model: sonnet
tools: [Bash, Read, Write]
disallowedTools: [Edit]
permissionMode: acceptEdits
mcpServers: ["slack"]
skills: ["skill-name"]
maxTurns: 20
background: false
memory: user
isolation: worktree
color: blue
effort: high
hooks:
  SubagentStart:
    - command: "/setup"
---

这里是 Agent 的系统提示内容...
```

**JSON 格式**:
```json
{
  "my-agent": {
    "description": "自定义 Agent",
    "prompt": "系统提示...",
    "model": "sonnet",
    "tools": ["Bash", "Read"]
  }
}
```

**类型定义**:
```typescript
type AgentDefinition =
  | BuiltInAgentDefinition    // source: 'built-in'
  | CustomAgentDefinition     // source: 'userSettings' | 'projectSettings' | ...
  | PluginAgentDefinition     // source: 'plugin'
```

### 5.5 builtInAgents.ts - 内置 Agent 注册

**文件**: [src/tools/AgentTool/builtInAgents.ts](src/tools/AgentTool/builtInAgents.ts)

**职责**:
- 注册所有内置 Agent
- 根据 Feature Flags 启用/禁用特定 Agent
- 支持协调器模式的特殊 Agent 集

**当前内置 Agent**:

| Agent | 文件 | 用途 | 默认启用 |
|-------|------|------|----------|
| `general-purpose` | generalPurposeAgent.ts | 通用任务处理 | ✅ |
| `statusline-setup` | statuslineSetup.ts | 状态栏配置 | ✅ |
| `Explore` | exploreAgent.ts | 代码探索与搜索 | 条件启用 |
| `Plan` | planAgent.ts | 任务规划 | 条件启用 |
| `claude-code-guide` | claudeCodeGuideAgent.ts | 代码指南 | 非 SDK 模式 |
| `verification` | verificationAgent.ts | 验证检查 | 实验性 |

---

## 内置 Agent 类型

### 6.1 General Purpose Agent (通用 Agent)

**定义**: [generalPurposeAgent.ts](src/tools/AgentTool/built-in/generalPurposeAgent.ts)

**用途**: 处理各种复杂的多步骤任务

**特点**:
- 工具访问: 全部工具 (`*`)
- 模型: 继承父代理 (无特殊配置)
- 适用场景: 研究、搜索、执行、分析等多步骤任务

**System Prompt 要点**:
```
You are an agent for Claude Code...
- Searching for code, configurations, and patterns across large codebases
- Analyzing multiple files to understand system architecture
- Investigating complex questions that require exploring many files
- Performing multi-step research tasks
```

### 6.2 Explore Agent (探索 Agent)

**定义**: [exploreAgent.ts](src/tools/AgentTool/built-in/exploreAgent.ts)

**用途**: 快速代码库探索和搜索

**特点**:
- **只读模式**: 禁止任何文件修改操作
- 工具限制: 禁止 Edit, Write, Agent, ExitPlanMode 等
- 模型: Ant 环境 inherit, 外部环境 haiku (速度优化)
- 优化: 省略 CLAUDE.md 和 gitStatus (节省 ~6-18 Gtok/周)
- 设计目标: 快速返回结果

**禁用的工具**:
```typescript
disallowedTools: [
  AGENT_TOOL_NAME,           // 不能嵌套 Agent
  EXIT_PLAN_TOOL_NAME,       // 不能退出计划模式
  FILE_EDIT_TOOL_NAME,       // 不能编辑
  FILE_WRITE_TOOL_NAME,      // 不能写入
  NOTEBOOK_EDIT_TOOL_NAME,   // 不能编辑笔记本
]
```

**使用建议**:
- 快速文件定位 (glob 模式匹配)
- 代码关键词搜索 (regex)
- 代码库问题回答
- 指定 thoroughness level: quick / medium / very thorough

### 6.3 Plan Agent (规划 Agent)

**定义**: [planAgent.ts](src/tools/AgentTool/built-in/planAgent.ts)

**用途**: 任务规划和方案设计

**特点**:
- 只读模式 (类似 Explore)
- 专注于分析和规划而非执行
- 输出结构化的实施计划

### 6.4 Verification Agent (验证 Agent)

**定义**: [verificationAgent.ts](src/tools/AgentTool/built-in/verificationAgent.ts)

**用途**: 代码验证和质量检查

**状态**: 实验性功能 (Feature Flag 控制)

### 6.5 Claude Code Guide Agent (代码指南 Agent)

**定义**: [claudeCodeGuideAgent.ts](src/tools/AgentTool/built-in/claudeCodeGuideAgent.ts)

**用途**: 提供 Claude Code 使用指导

**适用范围**: 仅非 SDK 入口点 (CLI 直接使用)

---

## 多 Agent 协作机制

### 7.1 Teammate (团队成员) 模式

**触发条件**: `team_name && name` 参数同时提供

**实现**: [spawnTeammate()](src/tools/shared/spawnMultiAgent.ts)

**特点**:
- Agent 作为团队成员运行
- 通过 mailbox (消息队列) 通信
- 支持 tmux 分屏显示
- 支持计划模式强制审批

**示例**:
```typescript
Agent({
  name: "code-reviewer",
  prompt: "审查 PR #123 的代码变更",
  team_name: "my-team",
  mode: "plan"  // 强制计划审批
})
```

**返回值**:
```typescript
{
  status: 'teammate_spawned',
  teammate_id: 'agent_xxx',
  name: 'code-reviewer',
  color: '#xxx',
  tmux_session_name: 'session_xxx',
  tmux_window_name: 'window_xxx',
  tmux_pane_id: '%pane_id',
  team_name: 'my-team'
}
```

### 7.2 Fork (分叉) 子代理模式

**触发条件**: Feature Flag `FORK_SUBAGENT` 开启 + 省略 `subagent_type`

**实现**: [forkSubagent.ts](src/tools/AgentTool/forkSubagent.ts)

**核心理念**:
> **Fork yourself when the intermediate tool output isn't worth keeping in your context.**

**优势**:
- **继承上下文**: 共享父代理的完整对话历史
- **缓存共享**: 字节级前缀匹配，提高缓存命中率
- **轻量级**: 不需要重新构建 System Prompt
- **低成本**: 与普通 Agent 相比 token 消耗更低

**使用场景**:
- **研究类**: 开放性问题，可并行分解
- **实现类**: 需要多次编辑的任务

**最佳实践**:
```typescript
// ✅ 好的 Fork 用法
Agent({
  name: "ship-audit",
  description: "Branch ship-readiness audit",
  prompt: "Audit what's left before this branch can ship..."
  // 注意: 没有 subagent_type → 触发 Fork
})

// ❌ 避免
- 不要读取 output_file (除非用户明确要求)
- 不要预测或伪造 Fork 结果
- 不要在 Fork 上设置不同 model (破坏缓存)
```

### 7.3 SendMessage 继续机制

**工具**: SendMessageTool

**用途**: 继续之前启动的 Agent 对话

**用法**:
```typescript
SendMessage({
  to: 'agent_abc123',  // Agent ID 或 name
  content: "继续深入分析这个问题..."
})
```

**支持的场景**:
- 同步完成的 Agent (有 agentId)
- 异步完成的 Agent (有 agentId)
- 命名的 Agent (有 name)

**例外**: One-shot 内置 Agent (Explore, Plan) 不支持继续

---

## 工具系统

### 8.1 工具池构建

**位置**: [tools.ts](src/tools.ts) → `assembleToolPool()`

**流程**:
```
assembleToolPool(permissionContext, mcpTools)
    │
    ├── 1. 获取所有注册的工具定义
    ├── 2. 应用权限过滤
    │       ├── alwaysAllowRules (始终允许)
    │       ├── sessionRules (会话规则)
    │       └── denyRules (拒绝规则)
    ├── 3. 合并 MCP 工具
    └── 4. 返回最终工具列表
```

### 8.2 Agent 工具解析

**位置**: [runAgent.ts](src/tools/AgentTool/runAgent.ts) → `resolveAgentTools()`

**解析规则**:
```typescript
function resolveAgentTools(agentDef, availableTools, isAsync) {
  let tools = [...availableTools]

  // 1. 应用白名单 (如果定义了 tools)
  if (agentDef.tools && agentDef.tools !== ['*']) {
    tools = tools.filter(t => agentDef.tools.includes(t.name))
  }

  // 2. 应用黑名单 (如果定义了 disallowedTools)
  if (agentDef.disallowedTools) {
    tools = tools.filter(t => !agentDef.disallowedTools.includes(t.name))
  }

  // 3. 异步 Agent 移除交互式工具
  if (isAsync) {
    tools = tools.filter(t => !t.isInteractive)
  }

  return { resolvedTools: tools }
}
```

### 8.3 主要工具列表

| 工具名 | 文件 | 功能 |
|--------|------|------|
| `Bash` | BashTool/ | 执行 Shell 命令 |
| `Read` | FileReadTool/ | 读取文件内容 |
| `Write` | FileWriteTool/ | 写入文件 |
| `Edit` | FileEditTool/ | 编辑文件 (基于 diff) |
| `Glob` | GlobTool/ | 文件名模式匹配 |
| `Grep` | GrepTool/ | 文件内容正则搜索 |
| `Agent` | AgentTool/ | 启动子代理 |
| `SendMessage` | SendMessageTool/ | 向 Agent 发送消息 |
| `TodoWrite` | TodoWriteTool/ | 任务列表管理 |
| `AskUserQuestion` | AskUserQuestionTool/ | 向用户提问 |
| `WebFetch` | WebFetchTool/ | 获取网页内容 |
| `WebSearch` | WebSearchTool/ | 网络搜索 |
| `NotebookEdit` | NotebookEditTool/ | 编辑 Jupyter Notebook |
| `ExitPlanMode` | ExitPlanModeTool/ | 退出计划模式 |
| `Sleep` | SleepTool/ | 等待/延迟 |

---

## 权限与安全

### 9.1 权限模式

**定义**: [PermissionMode.ts](src/utils/permissions/PermissionMode.ts)

| 模式 | 行为 |
|------|------|
| `bypassPermissions` | 跳过所有权限检查 |
| `acceptEdits` | 自动接受文件编辑 |
| `auto` | 自动分类器决定 |
| `plan` | 需要计划审批 |
| `bubble` | 冒泡到父代理审批 |

### 9.2 Agent 级别权限

**每个 Agent 可以独立配置**:
```yaml
permissionMode: acceptEdits  # Agent 定义中的权限覆盖
```

**继承规则**:
- 父代理是 `bypassPermissions` 或 `acceptEdits` → Agent 无法覆盖
- 其他情况 → Agent 的 `permissionMode` 生效

### 9.3 权限规则过滤

**函数**: `filterDeniedAgents()`

**语法**: `Agent(AgentName)` 规则

**示例**:
```
# 设置中定义拒绝规则
deny:
  - "Agent(Explore)"  # 禁止使用 Explore Agent
```

**过滤流程**:
```
所有 Agents → MCP 过滤 → 权限规则过滤 → 可用 Agents
```

### 9.4 安全特性

1. **工具白名单/黑名单**: 每个 Agent 可限制可用工具
2. **只读模式**: Explore/Plan Agent 禁止修改操作
3. **隔离执行**: Worktree 隔离防止影响主仓库
4. **MCP 服务器验证**: 必需的 MCP 服务器未连接时阻止启动
5. **最大轮次限制**: `maxTurns` 防止无限循环
6. **AbortController**: 支持用户中断长时间运行的 Agent

---

## 状态管理

### 10.1 AppState 结构 (关键部分)

**文件**: [state/AppStateStore.ts](src/state/AppStateStore.ts)

**Agent 相关状态**:
```typescript
interface AppState {
  // Agent 定义
  agentDefinitions: {
    activeAgents: AgentDefinition[]
    allAgents: AgentDefinition[]
    allowedAgentTypes?: string[]
  }

  // 当前 Agent
  agent?: string

  // 任务管理
  tasks: Record<string, Task>

  // Agent 名称注册表 (用于 SendMessage 路由)
  agentNameRegistry: Map<string, AgentId>

  // 工具权限上下文
  toolPermissionContext: {
    mode: PermissionMode
    additionalWorkingDirectories: Map<string, string>
    alwaysAllowRules: {...}
    shouldAvoidPermissionPrompts: boolean
  }

  // MCP 状态
  mcp: {
    clients: MCPServerConnection[]
    tools: Tool[]
  }

  // 团队上下文
  teamContext?: {
    teamName: string
  }
}
```

### 10.2 任务状态生命周期

```
┌─────────────┐
 │   Created    │
 └──────┬──────┘
        │
        ▼
 ┌─────────────┐
 │   Running    │ ◄── foreground (同步)
 │   (活跃)     │
 └──────┬──────┘
        │
   ┌────┴────┐
   ▼         ▼
┌───────┐ ┌──────────┐
│Backgrounded│ │Completed │
│(转为后台)  │ │(完成)    │
└───────┘ └──────────┘
   │
   ▼
┌──────────┐
│ Completed │ (后台完成)
└──────────┘

异常路径:
Running ──▶ Killed (用户终止)
Running ──▶ Failed (错误)
Backgrounded ──▶ Killed
Backgrounded ──▶ Failed
```

### 10.3 进度跟踪

**数据结构**:
```typescript
interface ProgressUpdate {
  tokenCount: number
  toolUseCount: number
  lastActivity?: string
  activityDescription?: string
}
```

**更新时机**:
- 每条 Assistant 消息处理后
- 每次 Tool Use 执行后
- 定期汇总到全局状态

**展示渠道**:
- VS Code 子代理面板 (SDK 事件)
- CLI Spinner (token 计数)
- 任务通知 (完成时汇总)

---

## 附录 A: 关键配置与环境变量

| 变量名 | 用途 | 默认值 |
|--------|------|--------|
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` | 禁用后台任务 | false |
| `CLAUDE_AUTO_BACKGROUND_TASKS` | 自动后台阈值 (ms) | 0 (禁用) |
| `CLAUDE_CODE_COORDINATOR_MODE` | 启用协调器模式 | false |
| `CLAUDE_CODE_SIMPLE` | 简单模式 (仅内置 Agent) | false |
| `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS` | SDK 禁用内置 Agent | false |
| `CLAUDE_CODE_AGENT_LIST_IN_MESSAGES` | Agent 列表注入方式 | auto (Feature Flag) |

---

## 附录 B: Feature Flags 控制

| Flag | 影响 |
|------|------|
| `BUILTIN_EXPLORE_PLAN_AGENTS` | 启用 Explore/Plan Agent |
| `COORDINATOR_MODE` | 启用协调器模式 |
| `FORK_SUBAGENT` | 启用 Fork 子代理实验 |
| `KAIROS` | 启用助手模式 (强制异步) |
| `PROACTIVE` / `KAIROS` | 启用主动式模块 |
| `VERIFICATION_AGENT` | 启用验证 Agent |
| `AGENT_MEMORY_SNAPSHOT` | 启用 Agent 内存快照 |
| `TRANSCRIPT_CLASSIFIER` | 启用转录分类器 (Handoff 检测) |
| `PROMPT_CACHE_BREAK_DETECTION` | 启用 Prompt 缓存破坏检测 |
| `MONITOR_TOOL` | 启用监控工具 |
| `tengu_agent_list_attach` | Agent 列表以附件形式注入 |
| `tengu_slim_subagent_claudemd` | 精简子代理 CLAUDE.md |
| `tengu_auto_background_agents` | 自动后台 Agent |
| `tengu_explore_agent` | Explore Agent 模型选择 |
| `tengu_hive_evidence` | 验证 Agent 启用 |
| `tengu_amber_stoat` | Explore/Plan Agent 启用 |

---

## 附录 C: 性能优化要点

### Token 优化

1. **Explore/Plan Agent 上下文精简**
   - 省略 CLAUDE.md (~5-15 Gtok/周)
   - 省略 gitStatus (~1-3 Gtok/周)
   - 影响: 34M+ Explore spawns/周

2. **One-shot Agent 输出精简**
   - Explore/Plan 完成时不输出 agentId/trailer
   - 节省: ~135 chars × 34M runs/周 ≈ 1-2 Gtok/周

3. **Fork 缓存共享**
   - 字节级前缀匹配
   - 继承父代理的精确工具数组
   - 避免重复构建 System Prompt

4. **Agent List 注入优化**
   - 附件消息模式 (vs 内联)
   - 避免 MCP 变更导致工具描述缓存失效
   - 节省: ~10.2% fleet cache_creation tokens

### 执行效率

1. **并行 Agent 启动**
   - 单条消息多个 Agent 调用
   - 最大化并行度

2. **Auto-background**
   - 长时间运行 Agent 自动转入后台
   - 不阻塞主循环
   - 阈值: 120秒 (可配置)

3. **MCP 连接复用**
   - 按名称引用共享连接
   - 仅内联定义创建新连接
   - Agent 结束时清理

---

## 附录 D: 错误处理与恢复

### 常见错误场景

| 场景 | 处理方式 |
|------|----------|
| Agent 类型不存在 | 抛出错误，列出可用类型 |
| Agent 被权限规则拒绝 | 显示拒绝规则来源 |
| MCP 服务器不可用 | 等待最多 30 秒，超时报错 |
| Fork 递归调用 | 检测并拒绝 (Fork 中不能再 Fork) |
| 用户中断 (ESC) | 抛出 AbortError，优雅清理 |
| API 错误 | 重试机制 (withRetry) |
| 最大轮次达到 | 生成 max_turns_reached 附件，正常结束 |
| 同步 Agent 错误 | 尝试返回已有消息的部分结果 |

### 资源清理保证

无论成功、失败还是中断，以下资源都会在 `finally` 块中清理:
- ✅ MCP 服务器连接
- ✅ Session Hooks
- ✅ Prompt Cache Tracking 状态
- ✅ 文件状态缓存
- ✅ Perfetto 注册
- ✅ Transcript 子目录映射
- ✅ Todos 条目
- ✅ Shell 后台任务
- ✅ Monitor MCP 任务 (如启用)

---

## 总结

Claude Code HAHA 项目的 Agent 系统是一个高度复杂但精心设计的多智能体协作框架。其核心优势在于:

1. **灵活的任务分解**: 通过 Agent 工具将复杂任务自动化拆解
2. **专业化的 Agent 类型**: 内置 + 自定义 + 插件扩展
3. **多样的执行模式**: 同步/异步/Fork/Teammate/Remote
4. **完善的隔离机制**: Worktree 隔离、权限控制、上下文管理
5. **强大的可观测性**: 进度跟踪、日志记录、性能指标
6. **极致的性能优化**: Token 节省、缓存共享、并行执行

该系统的设计充分体现了现代 AI Agent 架构的最佳实践，值得深入学习和借鉴。

---

**文档版本**: 1.0
**最后更新**: 2026-04-05
**基于代码版本**: Claude Code HAHA (src 目录)
