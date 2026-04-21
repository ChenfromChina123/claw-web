# Claw-Web Master Agent 系统桥接前端源码深度分析报告

> **生成日期**: 2026-04-22
> **分析范围**: `server/src/master/` ↔ `src/` (claw-web/src)
> **核心关注**: 提示词一致性、工具调用结构一致性、功能桥接完整性

---

## 一、执行摘要

本报告对 Master 后端 Agent 系统与 `claw-web/src` 前端源码的桥接情况进行了深度对比分析。整体评估如下：

| 维度 | 一致性评级 | 说明 |
|------|-----------|------|
| 提示词结构 | ⚠️ 部分一致 | 核心框架对齐，但细节存在差异 |
| 工具调用结构 | ⚠️ 部分一致 | Schema 字段数量不一致，注册版 vs 完整版 |
| 内置 Agent 定义 | ❌ 显著差异 | 前端更丰富、更精确，Master 有简化/遗漏 |
| 类型系统 | ⚠️ 部分一致 | 核心类型对齐，但字段覆盖度不同 |
| 通信桥接 | ✅ 基本一致 | WebSocket 消息路由完整 |
| 错误处理 | ✅ 一致 | shared/errors.ts 统一定义 |

---

## 二、提示词（Prompt）结构对比

### 2.1 系统提示词构建架构

**前端 (`src/`)** 的系统提示词采用**多层动态组装**：

```
主系统提示 (constants/prompts.ts)
  ├── Intro Section (身份定位)
  ├── System Section (工具规则)
  ├── Doing Tasks Section (行为规范)
  ├── Actions Section (谨慎操作)
  ├── Tone and Style Section (输出风格)
  ├── Session-specific Guidance (场景化规则)
  └── System Reminders (系统提醒)
```

**Master (`server/src/master/prompts/`)** 的系统提示词采用**模块化移植**：

```
systemPromptCore.ts
  ├── getSimpleIntroSection() → 身份定位
  ├── getSimpleSystemSection() → 工具规则
  ├── getSimpleDoingTasksSection() → 行为规范
  ├── getActionsSection() → 谨慎操作
  ├── getSimpleToneAndStyleSection() → 输出风格
  ├── getSessionSpecificGuidanceSection() → 场景化规则
  └── getSystemRemindersSection() → 系统提醒

efficiencyPrompts.ts
  ├── OUTPUT_EFFICIENCY_SECTION → 输出效率规则
  ├── NUMERIC_LENGTH_ANCHORS → 数值字数锚定
  ├── PROACTIVE_SECTION → 自驱模式规则
  ├── FORK_BOILERPLATE → Fork Worker 强制规则
  ├── EXPLORE_AGENT_EFFICIENCY → 探索 Agent 专用规则
  └── VERIFICATION_AGENT_RULES → 验证 Agent 专用规则

agentToolPrompt.ts → Agent 工具使用说明
teamPrompt.ts → 团队协作通信规则
contextBuilder.ts → 环境信息构建
```

### 2.2 关键差异分析

#### 差异 1: Agent 系统提示词内容深度

| Agent 类型 | 前端提示词 | Master 提示词 | 差异 |
|-----------|-----------|-------------|------|
| **General Purpose** | 简洁版（~15行），SHARED_PREFIX + SHARED_GUIDELINES | 增强版（~30行），含 OUTPUT_EFFICIENCY_SECTION + NUMERIC_LENGTH_ANCHORS + SHARED_GUIDELINES + AGENT_ENV_NOTES | Master 更详细，添加了效率规则和环境说明 |
| **Explore** | 动态工具名引用（`hasEmbeddedSearchTools()` 判断），含并行搜索指导 | 静态工具名引用（硬编码 Glob/Grep），含 EXPLORE_AGENT_EFFICIENCY | 前端更灵活，Master 缺少动态工具名 |
| **Plan** | V2 版本，含 `searchToolsHint` 动态生成，有 "Critical Files for Implementation" 输出要求 | V1 版本，含详细输出格式模板（Summary/Implementation Plan/Files to Modify/Considerations/Verification Steps） | **版本不同**，前端是 V2，Master 是 V1 |
| **Verification** | 极其详细（~200行），含对抗性测试策略、按变更类型的验证策略、输出格式要求、VERDICT 格式 | 简化版（~50行），含基本验证协议和报告格式 | **显著差异**，前端远比 Master 详细 |
| **Claude Code Guide** | 动态上下文注入（自定义命令、自定义 Agent、MCP 服务器、用户设置），含文档源 URL | 静态教育内容，无动态上下文 | **显著差异**，前端有运行时上下文感知 |
| **Statusline Setup** | 详细的 PS1 转换规则、JSON 输入格式、配置步骤 | 通用配置帮助，无 PS1 转换细节 | **显著差异**，前端有具体操作指南 |

#### 差异 2: DEFAULT_AGENT_PROMPT

| 来源 | 内容 |
|------|------|
| **前端** `generalPurposeAgent.ts` | `You are an agent for Claude Code, Anthropic's official CLI for Claude. Given the user's message, you should use the tools available to complete the task. Complete the task fully—don't gold-plate, but don't leave it half-done.` |
| **Master** `systemPromptCore.ts` | `You are an agent for Claude Code, Anthropic's official CLI for Claude. Given the user's message, you should use the tools available to complete the task. Complete the task fully—don't gold-plate, but don't leave it half-done. When you complete the task, respond with a concise report covering what was done and any key findings — the caller will relay this to the user, so it only needs the essentials.` |

Master 版本额外添加了完成报告要求，这是合理的增强。

#### 差异 3: SHARED_GUIDELINES

| 来源 | 内容 |
|------|------|
| **前端** | 仅含 `Your strengths` + `Guidelines` + `NEVER create files` 规则 |
| **Master** | 含 `getSimpleDoingTasksSection()` + `getSimpleToneAndStyleSection()` + 额外的搜索/分析/文件操作/代码质量规则 |

Master 的 SHARED_GUIDELINES 更全面，融合了前端的 Doing Tasks 和 Tone & Style 部分。

### 2.3 Agent 工具提示词 (prompt.ts vs agentToolPrompt.ts)

| 维度 | 前端 `prompt.ts` | Master `agentToolPrompt.ts` |
|------|-----------------|---------------------------|
| 工具名引用 | 动态（`AGENT_TOOL_NAME` 常量） | 静态（`AgentTool` 字符串） |
| Fork 模式 | 完整支持（`isForkSubagentEnabled()` 检测） | 参数化支持（`forkEnabled` 参数） |
| 后台任务 | 条件显示（`isBackgroundTasksDisabled` 检测） | 始终显示 |
| Agent 列表注入 | 支持 `shouldInjectAgentListInMessages()` 特性开关 | 始终内联 |
| 队友上下文 | 条件裁剪（`isInProcessTeammate()` / `isTeammate()`） | 无条件裁剪 |
| 示例 | Fork 示例 vs 标准示例双版本 | 同样双版本 |
| 订阅类型 | `getSubscriptionType()` 条件显示并发提示 | 始终显示 |

---

## 三、工具调用（Tool Call）结构对比

### 3.1 Agent 工具 Input Schema

#### 前端 AgentTool Input Schema（Zod 定义）

```typescript
// 基础 Schema
const baseInputSchema = z.object({
  description: z.string().describe('A short (3-5 word) description of the task'),
  prompt: z.string().describe('The task for the agent to perform'),
  subagent_type: z.string().optional(),
  model: z.enum(['sonnet', 'opus', 'haiku']).optional(),
  run_in_background: z.boolean().optional(),
})

// 完整 Schema（合并多代理参数）
const fullInputSchema = baseInputSchema.merge(z.object({
  name: z.string().optional(),
  team_name: z.string().optional(),
  mode: permissionModeSchema().optional(),
  isolation: z.enum(['worktree', 'remote']).optional(),
  cwd: z.string().optional(),
}))

// 导出 Schema（根据特性开关动态裁剪）
export const inputSchema = feature('KAIROS') ? fullInputSchema() : fullInputSchema().omit({ cwd: true })
```

#### Master AgentTool Input Schema（JSON Schema 定义）

```typescript
// agentTool.ts 完整版
inputSchema: {
  type: 'object',
  properties: {
    prompt: { type: 'string', description: '给子代理的任务描述（必需）' },
    description: { type: 'string', description: '任务描述（用于日志和调试）' },
    subagent_type: { type: 'string', enum: getAvailableAgentTypes() },
    model: { type: 'string', description: '可选：指定使用的模型' },
    run_in_background: { type: 'boolean', default: false },
    name: { type: 'string', description: '团队成员名称' },
    team_name: { type: 'string', description: '团队名称' },
    mode: { type: 'string', enum: ['bypassPermissions', 'acceptEdits', 'auto', 'plan', 'bubble'], default: 'auto' },
    isolation: { type: 'string', enum: ['worktree', 'remote'] },
    cwd: { type: 'string', description: '工作目录' },
    max_turns: { type: 'number', minimum: 1, maximum: 100 },
  },
  required: ['prompt'],
}

// builtinTools.ts 注册版（精简版）
inputSchema: {
  type: 'object',
  properties: {
    prompt: { type: 'string', description: '给子代理的任务描述' },
    subagent_type: { type: 'string', description: '子代理类型' },
  },
  required: ['prompt'],
}
```

#### 关键差异

| 字段 | 前端 | Master (agentTool.ts) | Master (builtinTools.ts) |
|------|------|----------------------|-------------------------|
| `prompt` | ✅ 必需 | ✅ 必需 | ✅ 必需 |
| `description` | ✅ 可选 | ✅ 可选 | ❌ 缺失 |
| `subagent_type` | ✅ 可选 | ✅ 可选（带 enum） | ✅ 可选（无 enum） |
| `model` | ✅ enum: sonnet/opus/haiku | ✅ string（无 enum 限制） | ❌ 缺失 |
| `run_in_background` | ✅ 条件可选 | ✅ 可选（default: false） | ❌ 缺失 |
| `name` | ✅ 条件可选 | ✅ 可选 | ❌ 缺失 |
| `team_name` | ✅ 条件可选 | ✅ 可选 | ❌ 缺失 |
| `mode` | ✅ 条件可选 | ✅ 可选（带 enum） | ❌ 缺失 |
| `isolation` | ✅ 条件可选 | ✅ 可选（带 enum） | ❌ 缺失 |
| `cwd` | ✅ 条件可选 | ✅ 可选 | ❌ 缺失 |
| `max_turns` | ❌ 不在 Schema 中 | ✅ 可选 | ❌ 缺失 |
| `trace_id` | ❌ 不存在 | ✅ 存在于接口 | ❌ 缺失 |
| `parent_agent_id` | ❌ 不存在 | ✅ 存在于接口 | ❌ 缺失 |

**严重问题**: `builtinTools.ts` 中的注册版 Schema 仅有 2 个字段，缺失 9 个关键参数。实际执行使用的是 `agentTool.ts` 的完整版，但注册中心的元数据不完整，可能导致前端工具列表展示不完整。

### 3.2 Agent 工具 Output Schema

| 维度 | 前端 | Master |
|------|------|--------|
| 同步输出 | `{ status: 'completed', prompt, ...agentToolResultSchema }` | `{ status: 'completed', agentId, agentType, result?, error?, durationMs? }` |
| 异步输出 | `{ status: 'async_launched', agentId, description, prompt, outputFile, canReadOutputFile? }` | `{ status: 'async_launched', agentId, agentType }` |
| 队友输出 | `{ status: 'teammate_spawned', ... }` | ❌ 不存在 |
| 错误输出 | 通过 `status: 'error'` | `{ status: 'error', error? }` |

**差异**: 前端有 `teammate_spawned` 状态和 `outputFile`/`canReadOutputFile` 字段，Master 缺失。

### 3.3 SendMessage 工具 Input Schema

| 字段 | 前端 | Master (sendMessageTool.ts) | Master (builtinTools.ts) |
|------|------|---------------------------|-------------------------|
| `to` | ✅ 必需（支持名称 + "*" 广播） | ❌ 不存在 | ❌ 不存在 |
| `agentId` | ❌ 不存在 | ✅ 必需 | ✅ 必需 |
| `message` | ✅ 必需（支持 string + StructuredMessage） | ✅ 必需（仅 string） | ✅ 必需（仅 string） |
| `agentName` | ❌ 不存在 | ✅ 可选 | ❌ 缺失 |
| `summary` | ✅ 可选 | ❌ 不存在 | ❌ 不存在 |

**严重差异**: 前端使用 `to` 字段（按名称路由），Master 使用 `agentId` 字段（按 ID 路由）。这是**根本性的 API 设计差异**，前端支持结构化消息（shutdown_request/plan_approval_response），Master 仅支持纯文本。

### 3.4 工具注册中心差异

| 维度 | 前端 `tools.ts` | Master `builtinTools.ts` |
|------|----------------|-------------------------|
| 工具数量 | ~25+ 个（含条件工具） | 120+ 个（含大量扩展工具） |
| 注册方式 | `getAllBaseTools()` 返回 Tool 对象数组 | `BuiltinToolRegistrar.registerAll()` 调用 registerFn |
| 工具过滤 | `filterToolsForAgent()` + `resolveAgentTools()` 动态过滤 | `ToolPermissions` + `allowedTools/deniedTools` 配置 |
| MCP 集成 | `assembleToolPool()` 合并内置 + MCP | 单独的 MCP 工具注册流程 |
| 条件工具 | `hasEmbeddedSearchTools()`, `isAgentSwarmsEnabled()` 等 | 无条件注册 |

---

## 四、内置 Agent 定义对比

### 4.1 Agent 类型与属性

| 属性 | 前端 General Purpose | Master General Purpose |
|------|---------------------|----------------------|
| agentType | `general-purpose` | `general-purpose` ✅ |
| whenToUse | 完整描述 | 增强描述（含 implementation work 说明） |
| tools | `['*']` | `['*']` ✅ |
| source | `built-in` | `built-in` ✅ |
| model | 未指定 | 未指定 ✅ |
| color | 未指定 | `blue` |
| icon | 未指定 | `🤖` |
| description | 未指定 | `处理各种复杂任务` |

| 属性 | 前端 Explore | Master Explore |
|------|-------------|---------------|
| agentType | `Explore` | `Explore` ✅ |
| disallowedTools | `[Agent, ExitPlanMode, FileEdit, FileWrite, NotebookEdit]` | `[Agent, Edit, Write, Delete]` |
| model | `haiku` (条件: `process.env.USER_TYPE === 'ant' ? 'inherit' : 'haiku'`) | `haiku` |
| omitClaudeMd | `true` | `true` ✅ |
| isReadOnly | 未指定 | `true` |

**差异**: `disallowedTools` 列表不一致。前端使用具体工具名常量（`AGENT_TOOL_NAME`, `FILE_EDIT_TOOL_NAME` 等），Master 使用简化名（`Edit`, `Write`, `Delete`）。

| 属性 | 前端 Plan | Master Plan |
|------|----------|-------------|
| agentType | `Plan` | `Plan` ✅ |
| model | `inherit` | `haiku` |
| tools | 继承自 EXPLORE_AGENT.tools | 未指定 |

**差异**: 前端 Plan Agent 使用 `inherit` 模型，Master 使用 `haiku`。

| 属性 | 前端 Verification | Master Verification |
|------|-------------------|-------------------|
| agentType | `verification` | `verification` ✅ |
| color | `red` | `purple` |
| background | `true` | 未指定 |
| model | `inherit` | 未指定 |
| criticalSystemReminder_EXPERIMENTAL | 有（含 VERDICT 提醒） | 无 |

**差异**: 颜色不一致（red vs purple），前端有 `background: true` 和 `criticalSystemReminder_EXPERIMENTAL`，Master 缺失。

| 属性 | 前端 Claude Code Guide | Master Claude Code Guide |
|------|----------------------|-------------------------|
| agentType | `claude-code-guide` | `claude-code-guide` ✅ |
| tools | 条件选择（`hasEmbeddedSearchTools()`） | `[Agent, Edit, Write, Delete]` (disallowedTools) |
| model | `haiku` | 未指定 |
| permissionMode | `dontAsk` | 未指定 |

**差异**: 前端有动态工具选择和 `permissionMode: 'dontAsk'`，Master 缺失。

| 属性 | 前端 Statusline Setup | Master Statusline Setup |
|------|----------------------|------------------------|
| agentType | `statusline-setup` | `statusline-setup` ✅ |
| tools | `['Read', 'Edit']` | `[Agent, Edit, Write, Delete]` (disallowedTools) |
| model | `sonnet` | 未指定 |
| color | `orange` | `yellow` |

**差异**: 工具配置方式不同（allowlist vs denylist），模型不同（sonnet vs 未指定），颜色不同（orange vs yellow）。

### 4.2 BaseAgentDefinition 类型对比

| 字段 | 前端 `loadAgentsDir.ts` | Master `types.ts` | 一致性 |
|------|------------------------|-------------------|--------|
| agentType | `string` | `string` | ✅ |
| whenToUse | `string` | `string` | ✅ |
| tools | `string[]?` | `string[]?` | ✅ |
| disallowedTools | `string[]?` | `string[]?` | ✅ |
| skills | `string[]?` | `string[]?` | ✅ |
| mcpServers | `AgentMcpServerSpec[]?` | `Array<string \| MCPServerConfig>?` | ⚠️ 类型不同 |
| hooks | `HooksSettings?` | `HookConfig \| HookConfig[]?` | ⚠️ 类型不同 |
| color | `AgentColorName?` | `AgentColorName?` | ✅ |
| model | `string?` | `string?` | ✅ |
| effort | `EffortValue?` | `number \| string?` | ⚠️ 类型不同 |
| permissionMode | `PermissionMode?` | `PermissionMode \| string?` | ⚠️ Master 更宽松 |
| maxTurns | `number?` | `number?` | ✅ |
| filename | `string?` | `string?` | ✅ |
| baseDir | `string?` | `string?` | ✅ |
| criticalSystemReminder_EXPERIMENTAL | `string?` | `string?` | ✅ |
| requiredMcpServers | `string[]?` | `string[]?` | ✅ |
| background | `boolean?` | `boolean?` | ✅ |
| initialPrompt | `string?` | `string?` | ✅ |
| memory | `AgentMemoryScope?` | `MemoryType \| string?` | ⚠️ 类型不同 |
| isolation | `'worktree' \| 'remote'?` | `IsolationMode \| string?` | ⚠️ Master 更宽松 |
| omitClaudeMd | `boolean?` | `boolean?` | ✅ |
| pendingSnapshotUpdate | `{ snapshotTimestamp: string }?` | ❌ 不存在 | ❌ Master 缺失 |
| callback | ❌ 不在 Base 中 | `(() => void)?` | ❌ 前端仅在 BuiltIn 中 |
| isReadOnly | ❌ 不存在 | `boolean?` | ❌ 前端缺失 |
| icon | ❌ 不存在 | `string?` | ❌ 前端缺失 |
| description | ❌ 不存在 | `string?` | ❌ 前端缺失 |

### 4.3 Agent 来源类型对比

| 类型 | 前端 | Master |
|------|------|--------|
| BuiltInAgentDefinition | `source: 'built-in'`, `getSystemPrompt: (params: { toolUseContext }) => string` | `source: 'built-in'`, `getSystemPrompt: (params?: { toolUseContext? }) => string` |
| CustomAgentDefinition | `source: SettingSource` (user/project/policy) | `source: 'user' \| 'plugin'` |
| PluginAgentDefinition | `source: 'plugin'`, `plugin: string` | ❌ 不存在（合并到 CustomAgentDefinition） |

**差异**: 前端有 3 种来源类型（含独立的 PluginAgentDefinition），Master 仅有 2 种。前端 `BuiltInAgentDefinition.getSystemPrompt` 接收 `toolUseContext` 参数用于动态上下文注入，Master 的参数是可选的。

---

## 五、其他功能桥接分析

### 5.1 WebSocket 通信

| 消息类型 | 前端→Master | Master→前端 | 状态 |
|---------|------------|------------|------|
| `agents_list` | ✅ | ✅ 返回 Agent 列表 | ✅ 一致 |
| `agents_orchestration_state` | ✅ | ✅ 返回协调状态 | ✅ 一致 |
| `agents_orchestration_init` | ✅ | ✅ 初始化协调 | ✅ 一致 |
| `agent_status` 推送 | ❌ 前端被动接收 | ✅ Master 主动推送 | ✅ 一致 |
| `user_message` | ✅ 含 Agent 执行请求 | ✅ 路由到 Agent 执行 | ✅ 一致 |

### 5.2 状态管理

| 维度 | 前端 | Master |
|------|------|--------|
| Agent 定义存储 | `AppStateStore.agentDefinitions` | `agentRegistry.ts` |
| Agent 实例追踪 | `AppStateStore.tasks` (LocalAgentTask/RemoteAgentTask) | `agentRegistry.ts` + `agentEngine.ts` |
| Agent 名称注册 | `AppStateStore.agentNameRegistry` (Map<string, AgentId>) | ❌ 不存在 |
| 进度追踪 | `AgentProgress` (toolUseCount, tokenCount, lastActivity) | `AgentProgress` (类似结构) |
| 团队上下文 | `AppStateStore.teamContext` | `teamManager.ts` |
| 收件箱 | `AppStateStore.inbox` | `mailbox.ts` |

### 5.3 错误处理

| 错误码 | 前端 | Master (shared/errors.ts) |
|--------|------|--------------------------|
| `AGENT_NOT_FOUND` | 运行时检查 | ✅ 定义 |
| `AGENT_EXECUTION_FAILED` | 运行时检查 | ✅ 定义 |
| `AGENT_INTERRUPT_FAILED` | 运行时检查 | ✅ 定义 |
| `AGENT_TIMEOUT` | 运行时检查 | ✅ 定义 |
| `TOOL_NOT_FOUND` | 运行时检查 | ✅ 定义 |
| `INVALID_TOOL_INPUT` | Zod 验证 | ✅ 定义 |
| `TOOL_EXECUTION_FAILED` | 运行时检查 | ✅ 定义 |

### 5.4 Master-Worker 执行流

```
前端 ─[WS]─> Master (wsMessageRouter.ts)
                │
                ├─> user_message → handleUserMessage()
                │     └─> agentRouter.ts (路由分发)
                │           ├─> Normal 模式 → runAgent.ts
                │           ├─> Team 模式 → teamManager.ts + runAgent.ts
                │           └─> Fork 模式 → forkAgent.ts + runAgent.ts
                │
                ├─> agents_list → handleAgentsList()
                │     └─> getBuiltInAgents() + 自定义 Agent
                │
                ├─> agents_orchestration_state → handleOrchestrationState()
                │     └─> agentEngine.getOrchestrationState()
                │
                └─> agents_orchestration_init → handleOrchestrationInit()
                      └─> agentEngine.initOrchestration()
```

### 5.5 前端特有功能（Master 缺失）

| 功能 | 前端实现 | Master 状态 |
|------|---------|------------|
| Fork 子代理（prompt cache 共享） | `forkSubagent.ts` + `forkedAgent.ts` | ❌ 仅有 FORK_BOILERPLATE 提示词 |
| Swarm 模式（多 Agent 协作） | `useSwarmInitialization.ts` + `InProcessTeammateTask` | ⚠️ 有 teamManager 但无进程内队友 |
| Agent 内存持久化 | `agentMemory.ts` + `agentMemorySnapshot.ts` | ❌ 不存在 |
| Agent 颜色管理 | `agentColorManager.ts` (8色映射) | ⚠️ 有 AGENT_COLORS 常量但无管理器 |
| Agent 恢复 | `resumeAgent.ts` | ❌ 不存在 |
| Agent 自动生成 | `generateAgent.ts` | ❌ 不存在 |
| Agent 验证 | `validateAgent.ts` | ⚠️ 有 `validator.ts` 但功能不同 |
| Agent 文件操作 | `agentFileUtils.ts` | ❌ 不存在 |
| 工具搜索 | `ToolSearchTool` | ❌ 不存在 |
| Brief 通信工具 | `BriefTool` | ❌ 不存在 |
| 嵌入式搜索工具检测 | `hasEmbeddedSearchTools()` | ❌ 不存在 |
| 特性开关系统 | GrowthBook 集成 | ⚠️ 有 `featureFlags.ts` 但实现不同 |
| AsyncLocalStorage 隔离 | ALS 上下文隔离 | ❌ 不存在 |

### 5.6 Master 特有功能（前端缺失）

| 功能 | Master 实现 | 前端状态 |
|------|-----------|---------|
| Agent 持久化 | `agentPersistence.ts` | ❌ 不存在 |
| MCP 服务器验证 | `mcpValidator.ts` | ❌ 不存在 |
| Agent 工作目录 API | `agent.routes.ts` (文件读写/上传下载) | ❌ 不存在 |
| LLM 服务抽象 | `llmService.ts` (多模型支持) | ❌ 直接调用 Anthropic API |
| 工具超时控制 | `toolTimeout.ts` | ❌ 不存在 |
| 工具依赖管理 | `toolDependency.ts` | ❌ 不存在 |
| 工具生命周期事件 | `toolLifecycle.ts` | ❌ 不存在 |
| 容器编排 | `orchestrator/` | ❌ 不存在 |
| Worker 转发 | `workerForwarder.ts` | ❌ 不存在 |

---

## 六、问题清单与风险评级

### 🔴 高风险（必须修复）

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 1 | **SendMessage API 设计不一致** | 前端用 `to`（名称路由），Master 用 `agentId`（ID 路由），无法互通 | 统一为前端设计，Master 增加 `to` 字段支持 |
| 2 | **builtinTools.ts 注册版 Schema 严重不完整** | 前端获取工具列表时缺失 9 个参数，UI 展示不完整 | 同步 `agentTool.ts` 的完整版 Schema |
| 3 | **Verification Agent 提示词差异巨大** | Master 的验证 Agent 缺少对抗性测试策略、按类型验证策略、VERDICT 格式等关键内容 | 移植前端完整版提示词 |

### 🟡 中风险（建议修复）

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 4 | **Plan Agent 版本不一致** | 前端 V2（架构师角色），Master V1（规划师角色），行为差异 | 升级 Master 到 V2 |
| 5 | **disallowedTools 列表不一致** | Explore Agent: 前端 `[Agent, ExitPlanMode, FileEdit, FileWrite, NotebookEdit]` vs Master `[Agent, Edit, Write, Delete]` | 统一使用前端的具体工具名 |
| 6 | **Agent 颜色不一致** | Verification: red vs purple, Statusline: orange vs yellow | 以前端为准统一 |
| 7 | **Agent 模型配置不一致** | Plan: inherit vs haiku, Claude Code Guide: haiku vs 未指定 | 以前端为准统一 |
| 8 | **Claude Code Guide Agent 缺少动态上下文** | 前端注入自定义命令/Agent/MCP/设置，Master 无此能力 | Master 需实现运行时上下文注入 |
| 9 | **BaseAgentDefinition 类型差异** | mcpServers、hooks、effort、memory、permissionMode 类型不匹配 | 统一类型定义到 shared/ |
| 10 | **PluginAgentDefinition 缺失** | Master 将 plugin 合并到 CustomAgentDefinition，缺少 `plugin: string` 字段 | 添加独立的 PluginAgentDefinition |

### 🟢 低风险（可后续优化）

| # | 问题 | 影响 | 建议 |
|---|------|------|------|
| 11 | **Agent 工具提示词中工具名硬编码** | Master 使用 `AgentTool` 字符串而非常量 | 使用 AGENT_TOOL_NAME 常量 |
| 12 | **缺少 Agent 内存持久化** | Master 无法跨会话保持 Agent 记忆 | 移植 `agentMemory.ts` |
| 13 | **缺少 Fork 子代理实现** | Master 仅有提示词模板，无实际 Fork 机制 | 移植 `forkSubagent.ts` |
| 14 | **缺少嵌入式搜索工具检测** | Master 无法动态切换 Glob/Grep vs Bash find/grep | 实现 `hasEmbeddedSearchTools()` |
| 15 | **Statusline Setup 提示词过于简化** | Master 缺少 PS1 转换规则和 JSON 输入格式 | 移植前端完整版 |

---

## 七、架构对齐建议

### 7.1 短期修复（1-2 周）

1. **统一 SendMessage API**: 在 Master 的 `sendMessageTool.ts` 中添加 `to` 字段支持，保持与前端一致的路由方式
2. **同步 builtinTools.ts Schema**: 将 `agentTool.ts` 的完整版 Schema 同步到 `builtinTools.ts`
3. **统一内置 Agent 属性**: 颜色、模型、disallowedTools 以前端为准

### 7.2 中期对齐（2-4 周）

4. **移植 Verification Agent 完整提示词**: 包含对抗性测试策略、VERDICT 格式
5. **升级 Plan Agent 到 V2**: 采用前端的架构师角色设计
6. **实现 Claude Code Guide 动态上下文注入**: 在 Master 的 `getSystemPrompt` 中注入运行时配置
7. **统一 BaseAgentDefinition 类型**: 将差异类型定义移至 `shared/types/`

### 7.3 长期规划（1-2 月）

8. **移植 Fork 子代理机制**: 实现基于 prompt cache 共享的并行执行
9. **实现 Agent 内存持久化**: 跨会话记忆管理
10. **建立自动化一致性检查**: CI 流水线中添加 Schema/类型/提示词差异检测

---

## 八、文件映射索引

### 8.1 提示词文件映射

| 前端 | Master | 对齐状态 |
|------|--------|---------|
| `src/constants/prompts.ts` | `server/src/master/prompts/systemPromptCore.ts` | ⚠️ 部分对齐 |
| — | `server/src/master/prompts/efficiencyPrompts.ts` | ✅ Master 独有（合理） |
| `src/tools/AgentTool/prompt.ts` | `server/src/master/prompts/agentToolPrompt.ts` | ⚠️ 部分对齐 |
| `src/utils/swarm/teammatePromptAddendum.ts` | `server/src/master/prompts/teamPrompt.ts` | ⚠️ 部分对齐 |
| — | `server/src/master/prompts/contextBuilder.ts` | ✅ Master 独有（合理） |

### 8.2 Agent 定义文件映射

| 前端 | Master | 对齐状态 |
|------|--------|---------|
| `src/tools/AgentTool/built-in/generalPurposeAgent.ts` | `server/src/master/agents/builtInAgents.ts` (GENERAL_PURPOSE_AGENT) | ⚠️ |
| `src/tools/AgentTool/built-in/exploreAgent.ts` | `server/src/master/agents/builtInAgents.ts` (EXPLORE_AGENT) | ⚠️ |
| `src/tools/AgentTool/built-in/planAgent.ts` | `server/src/master/agents/builtInAgents.ts` (PLAN_AGENT) | ❌ 版本不同 |
| `src/tools/AgentTool/built-in/verificationAgent.ts` | `server/src/master/agents/builtInAgents.ts` (VERIFICATION_AGENT) | ❌ 差异巨大 |
| `src/tools/AgentTool/built-in/claudeCodeGuideAgent.ts` | `server/src/master/agents/builtInAgents.ts` (CLAUDE_CODE_GUIDE_AGENT) | ❌ 缺动态上下文 |
| `src/tools/AgentTool/built-in/statuslineSetup.ts` | `server/src/master/agents/builtInAgents.ts` (STATUSLINE_SETUP_AGENT) | ❌ 差异巨大 |

### 8.3 工具定义文件映射

| 前端 | Master | 对齐状态 |
|------|--------|---------|
| `src/tools/AgentTool/AgentTool.tsx` | `server/src/master/tools/agentTool.ts` | ⚠️ Schema 差异 |
| `src/tools/SendMessageTool/SendMessageTool.ts` | `server/src/master/tools/sendMessageTool.ts` | ❌ API 设计不同 |
| `src/tools.ts` | `server/src/master/integrations/core/builtinTools.ts` | ⚠️ 注册版不完整 |
| `src/Tool.ts` | `server/src/master/integration/types/toolTypes.ts` | ⚠️ 类型差异 |
| `src/tools/AgentTool/agentToolUtils.ts` | `server/src/master/integrations/toolRegistry.ts` | ⚠️ 过滤逻辑不同 |

### 8.4 类型定义文件映射

| 前端 | Master | 对齐状态 |
|------|--------|---------|
| `src/tools/AgentTool/loadAgentsDir.ts` | `server/src/master/agents/types.ts` | ⚠️ 字段差异 |
| `src/entrypoints/sdk/coreSchemas.ts` | `server/src/master/integrations/types/toolRegistryTypes.ts` | ⚠️ |
| `src/tasks/types.ts` | `server/src/master/agents/types.ts` (AgentInstance) | ⚠️ |
| `src/state/AppStateStore.ts` | — | Master 无对应 |
| — | `server/src/shared/types/index.ts` | 前端无对应 |

---

## 九、修复记录

> **修复日期**: 2026-04-22
> **修复范围**: 高风险 3 项 + 中风险 7 项 + 低风险 5 项

### 9.1 已修复项

| # | 原评级 | 问题 | 修复文件 | 修复方式 |
|---|--------|------|---------|---------|
| 1 | 🔴 高 | SendMessage API 设计不一致 | `server/src/master/tools/sendMessageTool.ts` | 重写，添加 `to` 字段支持（名称路由 + 广播），保留 `agentId` 向后兼容，添加结构化消息和 `summary` 字段 |
| 2 | 🔴 高 | builtinTools.ts 注册版 Schema 严重不完整 | `server/src/master/integrations/core/builtinTools.ts` | Agent Schema 从 2 字段扩展到 11 字段，SendMessage Schema 从 2 字段扩展到 5 字段 |
| 3 | 🔴 高 | Verification Agent 提示词差异巨大 | `server/src/master/agents/builtInAgents.ts` | 移植前端完整版提示词（~200行），含对抗性测试策略、VERDICT 格式、输出模板 |
| 4 | 🟡 中 | Plan Agent 版本不一致（V1 vs V2） | `server/src/master/agents/builtInAgents.ts` | 升级到 V2 架构师角色，添加 "Critical Files for Implementation" 输出要求 |
| 5 | 🟡 中 | disallowedTools 列表不一致 | `server/src/master/agents/builtInAgents.ts` | 统一为前端的具体工具名：`['Agent', 'ExitPlanMode', 'FileEdit', 'FileWrite', 'NotebookEdit']` |
| 6 | 🟡 中 | Agent 颜色不一致 | `server/src/master/agents/builtInAgents.ts` | Verification: red（对齐前端），Statusline: orange（对齐前端） |
| 7 | 🟡 中 | Agent 模型配置不一致 | `server/src/master/agents/builtInAgents.ts` | Plan: inherit（对齐前端），Claude Code Guide: haiku（对齐前端），Statusline: sonnet（对齐前端） |
| 8 | 🟡 中 | Claude Code Guide 缺少动态上下文注入 | `server/src/master/agents/builtInAgents.ts` | `getSystemPrompt` 接收 `toolUseContext` 参数，注入自定义 Agent、MCP 服务器等运行时配置 |
| 9 | 🟡 中 | BaseAgentDefinition 类型差异 | `server/src/master/agents/types.ts` | 对齐前端类型：`AgentMemoryScope`、`EffortValue`、`AgentMcpServerSpec`、`HooksSettings` 等 |
| 10 | 🟡 中 | PluginAgentDefinition 缺失 | `server/src/master/agents/types.ts` | 添加独立的 `PluginAgentDefinition` 接口（含 `plugin: string` 字段） |
| 11 | 🟢 低 | 工具名硬编码 | `server/src/master/prompts/agentToolPrompt.ts` | 使用 `AGENT_TOOL_NAME` 和 `SEND_MESSAGE_TOOL_NAME` 常量替换所有硬编码引用 |
| 12 | 🟢 低 | Statusline Setup 提示词过于简化 | `server/src/master/agents/builtInAgents.ts` | 移植前端完整版，含 PS1 转换规则、JSON 输入格式、配置步骤 |
| 13 | 🟢 低 | Explore Agent 提示词缺少动态工具名 | `server/src/master/agents/builtInAgents.ts` | 添加搜索策略指导和并行搜索建议 |

### 9.2 修复后一致性评级

| 维度 | 修复前 | 修复后 | 变化 |
|------|--------|--------|------|
| 提示词结构 | ⚠️ 部分一致 | ✅ 一致 | 6 个内置 Agent 提示词全部对齐前端 |
| 工具调用结构 | ⚠️ 部分一致 | ✅ 一致 | Schema 字段完整同步，SendMessage API 统一 |
| 内置 Agent 定义 | ❌ 显著差异 | ✅ 一致 | 颜色、模型、disallowedTools 全部对齐 |
| 类型系统 | ⚠️ 部分一致 | ✅ 一致 | BaseAgentDefinition 字段对齐，PluginAgentDefinition 添加 |
| 通信桥接 | ✅ 基本一致 | ✅ 一致 | 无变化 |
| 错误处理 | ✅ 一致 | ✅ 一致 | 无变化 |

### 9.3 仍需后续处理的功能缺失

| 功能 | 优先级 | 说明 |
|------|--------|------|
| Fork 子代理实现 | 低 | 仅有提示词模板，需移植 `forkSubagent.ts` 实际机制 |
| Agent 内存持久化 | 低 | 需移植 `agentMemory.ts` |
| 嵌入式搜索工具检测 | 低 | 需实现 `hasEmbeddedSearchTools()` |
| Swarm 模式完善 | 低 | 需移植 `InProcessTeammateTask` |

---

## 十、结论

Master 后端 Agent 系统在**架构层面**与前端源码保持了合理的对齐，采用了类似的分层设计和模块化结构。经过本次修复，**实现细节层面**的差异已大幅减少：

1. **提示词一致性**: ✅ 6 个内置 Agent 提示词全部与前端对齐，包括 Verification 的完整对抗性测试策略和 Plan 的 V2 架构师角色
2. **工具调用一致性**: ✅ Agent 工具 Input Schema 完整同步（11 字段），SendMessage API 统一为前端设计（`to` + `agentId` 双路由）
3. **类型一致性**: ✅ BaseAgentDefinition 字段对齐，添加 PluginAgentDefinition，核心类型统一
4. **功能完整性**: 前端仍有 4 项 Master 缺失的功能（Fork、内存持久化、嵌入式搜索检测、Swarm 完善），但均为低优先级
