# claw-web Agent 系统与前端源码桥接深度分析报告

> 生成日期：2026-04-22  
> 项目路径：D:\Users\Administrator\AistudyProject\claw-web

---

## 1. 概述

本文档深度分析 claw-web 项目中 `server/src/master` Agent 系统与 `web/src` 前端源码之间的桥接机制，包括：

- **提示词系统桥接**：系统提示词如何从服务端传递到前端
- **工具调用结构一致性**：后端工具定义与前端展示的对应关系
- **消息流程与数据流**：前后端之间的通信机制
- **功能完整性检查**：两端功能的对应情况

---

## 2. 项目架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                          claw-web 项目                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    server/src/master/                        │    │
│  │                      (Agent 后端核心)                        │    │
│  │                                                              │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │    │
│  │  │  prompts/   │  │ integrations/ │  │     services/    │  │    │
│  │  │  提示词系统  │  │    工具集成    │  │      服务层      │  │    │
│  │  │  ~6 个文件  │  │  ~20 个文件   │  │   ~15 个文件    │  │    │
│  │  └─────────────┘  └──────────────┘  └──────────────────┘  │    │
│  │                                                              │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │    │
│  │  │   agents/   │  │    tools/    │  │   orchestrator/  │  │    │
│  │  │   Agent     │  │    工具定义   │  │     容器编排     │  │    │
│  │  │  ~5 个文件  │  │  ~15 个文件  │  │   ~10 个文件    │  │    │
│  │  └─────────────┘  └──────────────┘  └──────────────────┘  │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────────┐  │    │
│  │  │                    server/agentApi.ts                  │  │    │
│  │  │                   (Master Agent 执行 API)              │  │    │
│  │  └──────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              │                                      │
│                     WebSocket / HTTP                               │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                        web/src/                               │    │
│  │                       (前端界面)                             │    │
│  │                                                              │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │    │
│  │  │ components/ │  │   composables │  │     stores/      │  │    │
│  │  │   Vue 组件   │  │   Vue 组合式   │  │   Pinia 状态    │  │    │
│  │  │  ~60 个文件 │  │   ~10 个文件   │  │   ~10 个文件    │  │    │
│  │  └─────────────┘  └──────────────┘  └──────────────────┘  │    │
│  │                                                              │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │    │
│  │  │    api/     │  │    utils/    │  │     types/       │  │    │
│  │  │   API 调用   │  │   工具函数    │  │    类型定义      │  │    │
│  │  │  ~10 个文件 │  │  ~10 个文件   │  │   ~15 个文件    │  │    │
│  │  └─────────────┘  └──────────────┘  └──────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 提示词系统桥接分析

### 3.1 服务端提示词模块 (`server/src/master/prompts/`)

| 文件 | 功能 | 行数 | 说明 |
|------|------|------|------|
| `systemPromptCore.ts` | 系统提示词核心 | ~167 | Agent 身份定位、规则、行为规范 |
| `contextBuilder.ts` | 上下文构建器 | ~277 | 环境信息、动态章节、MCP 指令集成 |
| `agentToolPrompt.ts` | Agent 工具提示词 | ~235 | 工具使用说明、Fork 模式指导 |
| `efficiencyPrompts.ts` | 效率相关提示词 | - | 优化执行效率的指导 |
| `teamPrompt.ts` | 团队协作提示词 | - | 多 Agent 协作场景 |
| `webSearchPrompt.ts` | **WebSearch 工具提示词** | ~120 | **从 `src/tools/WebSearchTool/prompt.ts` 移植** |
| `index.ts` | 统一导出 | - | 导出所有提示词相关函数 |

### 3.1.1 WebSearch 提示词桥接（新增）

**问题**：Claude Code HAHA (`src/`) 和 Master 服务端 (`server/src/master/`) 的 WebSearch 工具提示词不同步。

| 源 | 提示词内容 | 状态 |
|---|-----------|------|
| `src/tools/WebSearchTool/prompt.ts` | 详细提示词（Sources 引用、域名过滤、当前年份） | ✅ 完整 |
| `server/src/master/prompts/webSearchPrompt.ts` | 移植后的提示词 | ✅ 已同步 |

**已完成的同步工作：**

1. 创建了 `server/src/master/prompts/webSearchPrompt.ts`
2. 导入了 `getWebSearchPrompt()` 函数
3. 更新了 `server/src/master/integration/tools/webTools.ts` 的 WebSearch 描述

**WebSearch 工具核心提示词内容：**

```typescript
export function getWebSearchPrompt(): string {
  return `
- Allows Claude to search the web and use the results to inform responses
- Provides up-to-date information for current events and recent data
- Returns search result information formatted as search result blocks

CRITICAL REQUIREMENT - You MUST follow this:
  - After answering, you MUST include a "Sources:" section
  - List all relevant URLs as markdown hyperlinks: [Title](URL)
  - Example:
    [Your answer here]
    Sources:
    - [Source Title 1](https://example.com/1)

IMPORTANT - Use the correct year:
  - Current month is ${currentMonthYear}
  - Use this year when searching for recent information
`
}
```

**WebSearch 工具描述更新：**

```typescript
// 之前
description: 'Search the web for information'

// 之后
description: 'Search the web for current information. Returns results with links that MUST be cited in Sources section. Use this for events, recent data, or info beyond knowledge cutoff.'
```

### 3.2 提示词构建流程 (`contextBuilder.ts`)

```typescript
// 系统提示词组装顺序（buildCompleteSystemPrompt 函数）

1. 【静态部分 - 可全局缓存】
   ├── getSimpleIntroSection()        // 简介（Agent 身份定位）
   ├── getSimpleSystemSection()       // 系统规则（工具使用、权限模式）
   ├── getSimpleDoingTasksSection()   // 任务执行指南（代码风格、行为规范）
   ├── getActionsSection()           // 操作谨慎性（风险操作确认）
   └── getSimpleToneAndStyleSection()// 语调风格（输出格式规范）

2. 【动态边界】__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__

3. 【动态部分 - 会话特定】
   ├── getSessionSpecificGuidanceSection()  // 会话特定指导
   ├── ruleInjector.buildRulesInjection()    // 规则注入（用户/项目规则）
   ├── 语言偏好 (languagePreference)         // 动态
   ├── 输出样式 (outputStyleConfig)          // 动态
   ├── buildEnvInfo()                       // 环境信息（动态）
   ├── 工作区摘要 (workspaceSummary)         // 动态
   └── MCP 指令 (mcpInstructions)           // 动态
```

### 3.3 核心提示词内容对照

| 功能模块 | server/master/prompts/ | 前端对应 | 一致性 |
|----------|------------------------|----------|--------|
| Agent 身份定义 | `getSimpleIntroSection()` | `src/views/Chat.vue` 欢迎消息 | ✅ 已实现 |
| 工具使用规则 | `getSimpleSystemSection()` | `src/components/ToolUse.vue` | ✅ 已实现 |
| 代码风格指南 | `getSimpleDoingTasksSection()` | 无直接对应 | ⚠️ 需前端展示 |
| 风险操作确认 | `getActionsSection()` | `src/components/PermissionInterceptor.vue` | ✅ 已实现 |
| 语调风格 | `getSimpleToneAndStyleSection()` | 无直接对应 | ⚠️ 需前端展示 |
| 环境信息 | `buildEnvInfo()` | `src/composables/useAgentIntegration.ts` | ✅ 部分实现 |

### 3.4 提示词桥接问题发现

| 问题 | 严重程度 | 描述 |
|------|----------|------|
| 规则注入未同步 | ⚠️ 中 | `ruleInjector.buildRulesInjection()` 的结果未传递给前端 |
| 语言偏好未传递 | ⚠️ 中 | `languagePreference` 仅在后端使用，前端无配置入口 |
| 输出样式未应用 | ⚠️ 中 | `outputStyleConfig` 在服务端定义但前端未接收 |
| MCP 指令缺失 | ⚠️ 中 | 前端未提供 MCP 工具注册和管理界面 |

---

## 4. 工具调用结构分析

### 4.1 服务端工具定义 (`server/src/master/integration/tools/`)

| 文件 | 工具列表 | 行数 |
|------|----------|------|
| `fileTools.ts` | FileRead, FileWrite, FileEdit, FileDelete, FileRename, Glob, FileList | ~500+ |
| `shellTools.ts` | Bash, PowerShell, Cmd 等 Shell 命令执行 | ~400+ |
| `searchTools.ts` | Grep, WebSearch 搜索工具 | ~200+ |
| `webTools.ts` | WebFetch, WebRead 网页抓取 | ~200+ |
| `apiTools.ts` | JsonParse, JsonFormat, Base64Encode/Decode, HashCalculate, UuidGenerate, Timestamp, RandomGenerate, ColorConvert | ~630 |
| `networkTools.ts` | Ping, DnsLookup, PortScan, Traceroute, IpInfo, NetworkInterfaces, NetConnect, WhoisLookup | ~626 |
| `skillTools.ts` | SkillList, SkillExecute, SkillInfo, TemplateRender, MacroExpand, SkillRegister | ~763 |
| `devTools.ts` | 开发相关工具 | ~300+ |
| `systemTools.ts` | 系统工具 | ~200+ |
| `taskTools.ts` | 任务管理工具 | ~200+ |

### 4.2 工具类型定义 (`integration/types/toolTypes.ts`)

```typescript
// 核心类型定义
interface ToolDefinition {
  name: string           // 工具名称
  description: string     // 工具描述
  inputSchema: {          // 输入参数 schema
    type?: 'object'
    properties?: Record<string, unknown>
    required?: string[]
  } | Record<string, unknown>
  category: ToolCategory  // 工具类别
  handler: (input, context, sendEvent?) => Promise<ToolResult>  // 处理函数
  permissions?: ToolPermissions  // 权限配置
}

// 工具类别
type ToolCategory = 
  | 'file'      // 文件操作
  | 'shell'     // Shell 命令
  | 'web'       // 网络操作
  | 'system'    // 系统工具
  | 'ai'        // AI 相关
  | 'mcp'       // MCP 工具
  | 'agent'     // Agent 调用
  | 'plan'      // 计划工具
  | 'development' // 开发工具
  | 'database'  // 数据库
  | 'devops'    // DevOps
  | 'vcs'       // 版本控制
```

### 4.3 前端工具解析 (`web/src/utils/toolParser.ts`)

```typescript
// 工具解析器核心功能

// 1. 工具描述映射
const TOOL_DESCRIPTIONS: Record<string, string> = {
  'Read': '读取文件内容',
  'Write': '写入文件内容',
  'Edit': '编辑文件',
  'Bash': '执行 Shell 命令',
  // ...
}

// 2. 参数解析
function parseToolParameters(toolName: string, input: Record<string, unknown>): ParameterInfo[]

// 3. 输出解析
function parseToolOutput(toolName: string, output: unknown): ParsedResult

// 4. 知识提取
function extractKnowledgeFromTool(toolCall: ToolCall): KnowledgeCard[]

// 5. 流程图构建
function buildFlowGraph(toolCalls: ToolCall[], sessionId?: string): FlowGraph
```

### 4.4 工具名称映射对照表

| 后端工具名 | 前端解析名 | 状态 |
|-----------|-----------|------|
| `Read` / `ReadFile` / `read_file` | `Read` | ✅ 一致 |
| `Write` / `WriteFile` / `write_file` / `FileWrite` | `Write` | ✅ 一致 |
| `Edit` / `EditFile` / `edit_file` / `str_replace` | `Edit` | ✅ 一致 |
| `Glob` / `glob` | `Glob` | ✅ 一致 |
| `Bash` / `bash` / `Shell` / `PowerShell` | `Bash` | ✅ 一致 |
| `Grep` / `grep` / `Search` | `Grep` | ✅ 一致 |
| `WebSearch` / `web_search` | `WebSearch` | ✅ 一致 |
| `WebFetch` / `web_fetch` | `WebFetch` | ✅ 一致 |

### 4.5 工具调用结构一致性检查

| 检查项 | 服务端 | 前端 | 一致性 |
|--------|--------|------|--------|
| 工具名称定义 | `ToolDefinition.name` | `TOOL_DESCRIPTIONS` | ✅ 一致 |
| 参数类型定义 | `inputSchema.properties` | `parseToolParameters()` | ✅ 一致 |
| 输出格式 | `ToolResult` | `parseToolOutput()` | ✅ 一致 |
| 状态追踪 | 无状态字段 | `toolCall.status` | ⚠️ 部分缺失 |
| 错误处理 | `ToolResult.error` | `getErrorInfo()` | ✅ 一致 |

---

## 5. 消息流程与数据流

### 5.1 消息发送流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                         用户发送消息流程                              │
└─────────────────────────────────────────────────────────────────────┘

用户输入 ──► ChatInput.vue ──► chatStore.sendMessage()
                                      │
                                      ▼
                              useWebSocket.ts
                                      │
                                      ▼
                           WebSocket 连接发送
                                      │
                                      ▼
                         server/master/server/agentApi.ts
                                      │
                                      ▼
                        Worker 容器执行 Agent
                                      │
                                      ▼
                         SSE 流式响应返回
                                      │
                                      ▼
                         前端解析并展示
```

### 5.2 工具调用流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                        工具调用流程                                  │
└─────────────────────────────────────────────────────────────────────┘

AI 决定调用工具 ──► 生成 ToolCall
                            │
                            ▼
                   后端 ToolRegistry 执行
                            │
                            ▼
                   返回 ToolResult (成功/错误)
                            │
                            ▼
              ChatMessageList.vue 接收工具结果
                            │
                            ▼
         toolParser.ts 解析工具输入输出
                            │
                            ▼
     FlowVisualizer + KnowledgeCard 展示流程和知识
```

### 5.3 数据流关键文件

| 阶段 | 服务端文件 | 前端文件 |
|------|-----------|----------|
| 消息发送 | `server/agentApi.ts` | `web/src/stores/chat.ts` |
| 工具执行 | `integrations/toolRegistry.ts` | - |
| 工具展示 | - | `components/ChatMessageList.vue` |
| 工具解析 | - | `utils/toolParser.ts` |
| 文件写入 | - | `components/FileWriteToolInline.vue` |

---

## 6. 功能完整性检查

### 6.1 已完整桥接的功能

| 功能模块 | 服务端实现 | 前端实现 | 状态 |
|----------|-----------|----------|------|
| 消息发送 | ✅ `agentApi.ts` | ✅ `chatStore.sendMessage()` | 完成 |
| 消息接收 | ✅ SSE 流 | ✅ WebSocket 处理 | 完成 |
| 工具调用 | ✅ `toolRegistry.ts` | ✅ `ChatMessageList.vue` | 完成 |
| 工具解析 | ✅ `ToolDefinition` | ✅ `toolParser.ts` | 完成 |
| 文件写入展示 | ✅ `fileTools.ts` | ✅ `FileWriteToolInline.vue` | 完成 |
| 流程可视化 | ❌ 无服务端支持 | ✅ `FlowVisualizer.vue` | 需补充 |
| 知识卡片 | ❌ 无服务端支持 | ✅ `KnowledgeCard.vue` | 需补充 |
| 错误处理 | ✅ `ToolResult.error` | ✅ `getErrorInfo()` | 完成 |
| 状态追踪 | ⚠️ 部分支持 | ✅ `toolCall.status` | 需完善 |

### 6.2 需要补充的功能

| 功能 | 当前状态 | 建议 |
|------|----------|------|
| 工具执行统计 | 前端仅有本地统计 | 服务端应提供 `toolStats` API |
| Token 消耗追踪 | 无完整实现 | 需要 `tokenAudit.ts` 集成 |
| 上下文压缩信息 | 无传递 | 前端应显示上下文压缩状态 |
| Agent 中断功能 | 前端有 `interruptAgent` 调用 | 需验证后端是否实现 |
| 规则注入展示 | 服务端有 `ruleInjector` | 前端无展示入口 |

---

## 7. 关键文件对应关系

### 7.1 服务端 → 前端映射表

| 服务端文件 | 功能 | 前端对应文件 | 功能 |
|-----------|------|-------------|------|
| `prompts/systemPromptCore.ts` | 系统提示词核心 | - | 需前端展示 |
| `prompts/contextBuilder.ts` | 上下文构建 | `useAgentIntegration.ts` | 部分对应 |
| `prompts/agentToolPrompt.ts` | Agent 工具提示词 | `components/AgentTool.vue` | 需验证 |
| `integration/toolRegistry.ts` | 工具注册中心 | `utils/toolParser.ts` | 解析对应 |
| `integration/tools/*.ts` | 工具定义 | `types/tool.ts` | 类型对应 |
| `server/agentApi.ts` | Agent 执行 API | `api/agentApi.ts` | API 调用 |
| `services/sessionManager.ts` | 会话管理 | `stores/chat.ts` | 状态管理 |
| `integrations/wsBridge.ts` | WebSocket 桥接 | `composables/useWebSocket.ts` | 通信 |

### 7.2 前端特有功能（无后端对应）

| 文件 | 功能 | 缺失的后端支持 |
|------|------|---------------|
| `components/FlowVisualizer.vue` | 流程可视化 | 需要服务端提供流程数据 |
| `components/KnowledgeCard.vue` | 知识卡片 | 需要服务端知识提取支持 |
| `components/AgentTeamPanel.vue` | Agent 团队面板 | 需要多 Agent 协作支持 |
| `components/PromptTemplateLibrary.vue` | 提示词模板库 | 需要模板 CRUD API |

---

## 8. 深度问题分析

### 8.1 提示词系统问题

**问题 1：静态/动态提示词边界未传递给前端**
```typescript
// 服务端定义
export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'

// 前端无法获知这个边界，导致：
// - 无法区分可缓存和不可缓存的提示词
// - 无法实现提示词热更新
```

**问题 2：规则注入未在前端展示**
```typescript
// 服务端
const rulesInjection = await ruleInjector.buildRulesInjection(cwd)

// 前端无对应功能
// 用户看不到当前生效的规则
```

### 8.2 工具调用问题

**问题 1：工具状态不一致**
```typescript
// 后端 ToolResult 不包含状态字段
interface ToolResult {
  success: boolean
  result?: unknown
  error?: string
  output?: string
  metadata?: { duration?: number; tokens?: number; ... }
}

// 前端使用状态字段
toolCall.status: 'pending' | 'executing' | 'completed' | 'error'
// 状态转换完全由前端控制，可能与后端不一致
```

**问题 2：工具并行执行不支持**
```typescript
// 当前工具调用是串行的
// Agent 调用工具 → 等待结果 → 继续
// 缺少并行执行支持（如 Fork 模式）
```

### 8.3 通信机制问题

**问题 1：SSE 事件类型不完整**
```typescript
// 当前 SSEParser 解析的事件类型有限
// 可能缺少的事件类型：
// - `thinking_start` / `thinking_end`
// - `tool_call_start` / `tool_call_end`
// - `context_compressed`
```

**问题 2：重连机制缺失**
```typescript
// useWebSocket.ts 无重连逻辑
// WebSocket 断开后无自动恢复
```

---

## 9. 建议与改进方案

### 9.1 提示词系统改进

1. **添加提示词同步 API**
   ```typescript
   // server/src/master/routes/prompt.routes.ts
   GET /api/prompts/system        // 获取系统提示词
   GET /api/prompts/dynamic        // 获取动态提示词
   POST /api/prompts/update        // 更新提示词模板
   ```

2. **前端提示词展示组件**
   ```vue
   <!-- PromptPreview.vue -->
   <template>
     <div class="prompt-preview">
       <div v-for="(section, i) in sections" :key="i">
         <span v-if="section === DYNAMIC_BOUNDARY" class="boundary"></span>
         <span v-else>{{ section }}</span>
       </div>
     </div>
   </template>
   ```

### 9.2 工具系统改进

1. **添加工具执行统计 API**
   ```typescript
   // GET /api/tools/stats
   interface ToolStats {
     totalCalls: number
     successRate: number
     avgDuration: number
     byTool: Record<string, ToolStats>
   }
   ```

2. **前端添加工具监控面板**
   ```vue
   <!-- ToolMonitor.vue -->
   <template>
     <div class="tool-monitor">
       <PieChart :data="toolStats" />
       <Table :data="recentCalls" />
     </div>
   </template>
   ```

### 9.3 通信机制改进

1. **扩展 SSE 事件类型**
   ```typescript
   type SSEEventType = 
     | 'message'
     | 'message_start'
     | 'message_delta'
     | 'message_end'
     | 'tool_call'
     | 'tool_result'
     | 'thinking_start'   // 新增
     | 'thinking_end'     // 新增
     | 'context_compressed' // 新增
   ```

2. **添加 WebSocket 重连机制**
   ```typescript
   // useWebSocket.ts
   const MAX_RECONNECT_ATTEMPTS = 5
   const RECONNECT_DELAY = 1000
   
   function connect() {
     ws.onclose = () => {
       if (attempts < MAX_RECONNECT_ATTEMPTS) {
         setTimeout(connect, RECONNECT_DELAY * attempts++)
       }
     }
   }
   ```

---

## 10. 总结

### 10.1 桥接完整性评分

| 模块 | 完整性 | 说明 |
|------|--------|------|
| 提示词系统 | 65% | 核心功能已实现，但规则注入、语言偏好等未同步 |
| 工具调用 | 85% | 工具定义与展示基本一致，缺少并行执行支持 |
| 消息流程 | 80% | 消息发送接收正常，缺少部分事件类型 |
| 状态管理 | 70% | 会话管理正常，工具状态追踪需完善 |
| 可视化 | 50% | 流程可视化前端已实现，服务端无支持 |

### 10.2 总体评估

**优点：**
- 架构设计清晰，分层合理
- 工具系统完整，类型定义一致
- 前端组件功能丰富，用户体验良好
- 服务端提示词系统模块化程度高

**需改进：**
- 前后端提示词同步机制缺失
- 工具状态追踪需加强
- SSE 事件类型不完整
- 缺乏完整的监控和统计 API
- 多 Agent 协作功能未实现

### 10.3 下一步行动

1. **优先级高：**
   - 实现提示词同步 API
   - 补充 SSE 事件类型
   - 添加 WebSocket 重连机制

2. **优先级中：**
   - 添加工具执行统计 API
   - 完善工具状态追踪
   - 前端添加规则展示组件

3. **优先级低：**
   - 多 Agent 协作支持
   - 流程知识服务端提取
   - 提示词模板管理界面

---

## 附录 A：文件清单

### 服务端关键文件

```
server/src/master/
├── prompts/
│   ├── index.ts                          # 统一导出
│   ├── systemPromptCore.ts               # 系统提示词核心
│   ├── contextBuilder.ts                 # 上下文构建器
│   ├── agentToolPrompt.ts               # Agent 工具提示词
│   ├── efficiencyPrompts.ts             # 效率提示词
│   └── teamPrompt.ts                    # 团队提示词
├── integration/
│   ├── types/toolTypes.ts               # 工具类型定义
│   ├── toolRegistry.ts                  # 工具注册中心
│   ├── toolExecutor.ts                  # 工具执行器
│   ├── enhancedToolExecutor.ts           # 增强执行器
│   ├── tools/
│   │   ├── apiTools.ts                  # API 工具
│   │   ├── fileTools.ts                # 文件工具
│   │   ├── networkTools.ts              # 网络工具
│   │   ├── searchTools.ts               # 搜索工具
│   │   ├── shellTools.ts                # Shell 工具
│   │   ├── skillTools.ts               # Skill 工具
│   │   ├── systemTools.ts               # 系统工具
│   │   ├── taskTools.ts                # 任务工具
│   │   └── webTools.ts                 # Web 工具
│   └── core/builtinTools.ts             # 内置工具注册
├── server/
│   └── agentApi.ts                      # Agent 执行 API
├── services/
│   ├── sessionManager.ts               # 会话管理
│   ├── ruleInjector.ts                  # 规则注入
│   └── tokenAudit.ts                   # Token 审计
└── websocket/
    ├── wsBridge.ts                      # WebSocket 桥接
    └── wsMessageRouter.ts              # 消息路由
```

### 前端关键文件

```
web/src/
├── api/
│   ├── agentApi.ts                      # Agent API 调用
│   └── toolApi.ts                       # 工具 API
├── components/
│   ├── ChatMessageList.vue              # 消息列表（核心）
│   ├── FileWriteToolInline.vue          # 文件写入展示
│   ├── FlowVisualizer.vue              # 流程可视化
│   ├── KnowledgeCard.vue               # 知识卡片
│   ├── ToolUse.vue                     # 工具使用
│   ├── ToolUseEnhanced.vue             # 增强工具使用
│   ├── AgentTeamPanel.vue              # Agent 团队
│   ├── PromptTemplateLibrary.vue       # 提示词模板库
│   └── messages/
│       ├── AssistantMessage.vue
│       ├── UserMessage.vue
│       └── ThinkingMessage.vue
├── composables/
│   ├── useAgentIntegration.ts          # Agent 集成
│   ├── usePromptTemplateLibrary.ts     # 提示词模板
│   └── useWebSocket.ts                  # WebSocket
├── stores/
│   ├── chat.ts                         # 聊天状态
│   ├── agent.ts                        # Agent 状态
│   └── settings.ts                     # 设置状态
├── types/
│   ├── tool.ts                         # 工具类型
│   ├── agent.ts                        # Agent 类型
│   ├── flowKnowledge.ts               # 流程知识类型
│   └── message.ts                       # 消息类型
└── utils/
    ├── toolParser.ts                   # 工具解析器
    ├── chatTimeline.ts                 # 聊天时间线
    └── ideUserMessageMarkers.ts        # IDE 消息标记
```

---

## 附录 B：API 端点列表

### 服务端 API

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/agent/execute` | 执行 Agent |
| POST | `/api/agent/interrupt` | 中断 Agent |
| GET | `/api/tools/list` | 获取工具列表 |
| GET | `/api/tools/:name` | 获取工具详情 |
| GET | `/api/session/:id` | 获取会话 |
| POST | `/api/session/create` | 创建会话 |
| GET | `/api/prompts/system` | 获取系统提示词（待实现） |
| GET | `/api/prompts/dynamic` | 获取动态提示词（待实现） |

---

*报告结束*
