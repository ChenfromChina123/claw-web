# Agent 可用工具清单探索计划

## 1. 项目概述

本项目（claw-web/claude-code-haha）是一个基于 TypeScript 的 AI Agent 系统，提供了丰富的工具集供 Agent 调用，包括终端命令执行、文件编辑、搜索等功能。

## 2. 工具系统架构

### 2.1 核心文件位置

| 文件 | 作用 |
|------|------|
| `src/tools.ts` | 工具注册中心，定义所有可用工具 |
| `src/Tool.ts` | 工具基类定义，包含 Tool 接口和 buildTool 工厂函数 |
| `src/services/tools/toolExecution.ts` | 工具执行引擎，负责调用工具的实际逻辑 |

### 2.2 工具定义结构

每个工具都遵循 `Tool` 接口定义，核心方法包括：
- `call()` - 实际执行工具逻辑
- `validateInput()` - 输入验证
- `checkPermissions()` - 权限检查
- `renderToolUseMessage()` - UI 渲染

## 3. 完整工具清单

### 3.1 基础工具（始终可用）

| 工具名称 | 文件路径 | 功能描述 |
|----------|----------|----------|
| **AgentTool** | `src/tools/AgentTool/AgentTool.tsx` | 子代理工具，用于创建和管理子代理 |
| **TaskOutputTool** | `src/tools/TaskOutputTool/TaskOutputTool.tsx` | 任务输出工具 |
| **BashTool** | `src/tools/BashTool/BashTool.tsx` | **终端命令执行工具** - 执行 bash 命令 |
| **FileReadTool** | `src/tools/FileReadTool/FileReadTool.ts` | 文件读取工具 |
| **FileEditTool** | `src/tools/FileEditTool/FileEditTool.ts` | **文件编辑工具** - 修改文件内容 |
| **FileWriteTool** | `src/tools/FileWriteTool/FileWriteTool.ts` | 文件写入工具 |
| **GlobTool** | `src/tools/GlobTool/GlobTool.ts` | 文件模式匹配工具 |
| **GrepTool** | `src/tools/GrepTool/GrepTool.ts` | 文本搜索工具 |
| **ExitPlanModeV2Tool** | `src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts` | 退出计划模式工具 |
| **NotebookEditTool** | `src/tools/NotebookEditTool/NotebookEditTool.ts` | Jupyter Notebook 编辑工具 |
| **WebFetchTool** | `src/tools/WebFetchTool/WebFetchTool.ts` | 网页获取工具 |
| **TodoWriteTool** | `src/tools/TodoWriteTool/TodoWriteTool.ts` | 待办事项写入工具 |
| **WebSearchTool** | `src/tools/WebSearchTool/WebSearchTool.ts` | 网络搜索工具 |
| **TaskStopTool** | `src/tools/TaskStopTool/TaskStopTool.ts` | 任务停止工具 |
| **AskUserQuestionTool** | `src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx` | 询问用户问题工具 |
| **SkillTool** | `src/tools/SkillTool/SkillTool.ts` | 技能工具 |
| **EnterPlanModeTool** | `src/tools/EnterPlanModeTool/EnterPlanModeTool.ts` | 进入计划模式工具 |
| **BriefTool** | `src/tools/BriefTool/BriefTool.ts` | 简要模式工具 |

### 3.2 条件启用工具（基于环境变量或特性开关）

| 工具名称 | 启用条件 | 功能描述 |
|----------|----------|----------|
| **ConfigTool** | `USER_TYPE === 'ant'` | 配置工具 |
| **TungstenTool** | `USER_TYPE === 'ant'` | Tungsten 工具 |
| **SuggestBackgroundPRTool** | 特性开关 | 后台 PR 建议工具 |
| **WebBrowserTool** | `feature('WEB_BROWSER_TOOL')` | 网页浏览器工具 |
| **TaskCreateTool/TaskGetTool/TaskUpdateTool/TaskListTool** | `isTodoV2Enabled()` | 任务管理工具集 |
| **OverflowTestTool** | `feature('OVERFLOW_TEST_TOOL')` | 溢出测试工具 |
| **CtxInspectTool** | `feature('CONTEXT_COLLAPSE')` | 上下文检查工具 |
| **TerminalCaptureTool** | `feature('TERMINAL_PANEL')` | 终端捕获工具 |
| **LSPTool** | `ENABLE_LSP_TOOL` 环境变量 | LSP 语言服务器工具 |
| **EnterWorktreeTool/ExitWorktreeTool** | `isWorktreeModeEnabled()` | 工作树模式工具 |
| **SendMessageTool** | 动态加载 | 发送消息工具 |
| **ListPeersTool** | `feature('UDS_INBOX')` | 列出对等节点工具 |
| **TeamCreateTool/TeamDeleteTool** | `isAgentSwarmsEnabled()` | 团队管理工具 |
| **VerifyPlanExecutionTool** | `CLAUDE_CODE_VERIFY_PLAN === 'true'` | 计划执行验证工具 |
| **REPLTool** | `USER_TYPE === 'ant'` | REPL 交互式工具 |
| **WorkflowTool** | `feature('WORKFLOW_SCRIPTS')` | 工作流工具 |
| **SleepTool** | `feature('PROACTIVE') \|\| feature('KAIROS')` | 睡眠/延迟工具 |
| **CronCreateTool/CronDeleteTool/CronListTool** | `feature('AGENT_TRIGGERS')` | 定时任务工具 |
| **RemoteTriggerTool** | `feature('AGENT_TRIGGERS_REMOTE')` | 远程触发工具 |
| **MonitorTool** | `feature('MONITOR_TOOL')` | 监控工具 |
| **SendUserFileTool** | `feature('KAIROS')` | 发送用户文件工具 |
| **PushNotificationTool** | `feature('KAIROS')` | 推送通知工具 |
| **SubscribePRTool** | `feature('KAIROS_GITHUB_WEBHOOKS')` | PR 订阅工具 |
| **PowerShellTool** | `isPowerShellToolEnabled()` | PowerShell 命令工具 |
| **SnipTool** | `feature('HISTORY_SNIP')` | 历史片段工具 |
| **TestingPermissionTool** | `NODE_ENV === 'test'` | 测试权限工具 |
| **ListMcpResourcesTool** | 始终启用 | MCP 资源列表工具 |
| **ReadMcpResourceTool** | 始终启用 | MCP 资源读取工具 |
| **ToolSearchTool** | `isToolSearchEnabledOptimistic()` | 工具搜索工具 |

## 4. 终端工具（BashTool）深度分析

### 4.1 调用流程

```
1. 模型生成 tool_use 请求
   ↓
2. toolExecution.ts 中的 runToolUse() 接收请求
   ↓
3. checkPermissionsAndCallTool() 进行权限检查
   ↓
4. BashTool.call() 被调用
   ↓
5. runShellCommand() 生成器函数执行
   ↓
6. Shell.ts 中的 exec() 创建子进程
   ↓
7. ShellCommand.ts 中的 wrapSpawn() 包装子进程
   ↓
8. 实际执行 bash 命令（通过 child_process.spawn）
```

### 4.2 真实执行验证

**结论：终端命令是真实执行的！**

关键证据：
1. **进程创建**：`Shell.ts:316` 使用 `spawn(spawnBinary, shellArgs, {...})` 创建真实子进程
2. **命令执行**：`ShellCommand.ts:337` 使用 `treeKill` 终止进程，说明是真实进程
3. **输出捕获**：通过文件描述符或管道捕获 stdout/stderr
4. **沙箱支持**：支持通过 `shouldUseSandbox` 启用沙箱模式

### 4.3 安全机制

- **权限检查**：`bashPermissions.ts` 中的 `bashToolHasPermission()`
- **命令解析**：`bashSecurity.ts` 中的安全解析
- **沙箱模式**：通过 `SandboxManager` 限制命令执行范围
- **超时控制**：默认 30 分钟超时

## 5. 编辑工具（FileEditTool）深度分析

### 5.1 调用流程

```
1. 模型生成 FileEditTool 调用请求
   ↓
2. toolExecution.ts 中的 runToolUse() 接收请求
   ↓
3. checkPermissionsAndCallTool() 进行权限检查
   ↓
4. FileEditTool.validateInput() 验证输入
   ↓
5. FileEditTool.call() 被调用
   ↓
6. 读取原文件内容 (readFileForEdit)
   ↓
7. 应用编辑操作 (getPatchForEdit)
   ↓
8. 写入磁盘 (writeTextContent)
   ↓
9. 通知 LSP 服务器 (changeFile/saveFile)
   ↓
10. 更新文件状态缓存
```

### 5.2 真实执行验证

**结论：文件编辑是真实执行的！**

关键证据：
1. **文件系统操作**：`FileEditTool.ts:491` 调用 `writeTextContent()` 写入磁盘
2. **原子性保证**：先读取再写入，确保操作原子性
3. **LSP 集成**：编辑后通知 LSP 服务器（`lspManager.changeFile/saveFile`）
4. **VSCode 通知**：`notifyVscodeFileUpdated()` 通知 VSCode 文件变化
5. **文件历史**：`fileHistoryTrackEdit()` 记录编辑历史用于撤销

### 5.3 安全机制

- **必须预读**：文件必须先被 FileReadTool 读取才能编辑
- **时间戳检查**：检查文件是否在读取后被修改
- **权限检查**：`checkWritePermissionForTool()` 检查写入权限
- **UNC 路径保护**：防止 Windows UNC 路径导致的凭证泄露

## 6. 工具调用机制总结

### 6.1 调用链

```
模型输出 tool_use
    ↓
src/query.ts 处理响应
    ↓
src/services/tools/toolExecution.ts:runToolUse()
    ↓
checkPermissionsAndCallTool()
    ↓
tool.call(input, toolUseContext, canUseTool, parentMessage, onProgress)
    ↓
【实际执行】
    ↓
tool.mapToolResultToToolResultBlockParam()
    ↓
返回 tool_result 给模型
```

### 6.2 执行确认

| 工具类型 | 是否真实执行 | 执行方式 |
|----------|--------------|----------|
| BashTool | ✅ 是 | child_process.spawn 创建真实 shell 进程 |
| FileEditTool | ✅ 是 | fs.writeFile 真实写入磁盘 |
| FileWriteTool | ✅ 是 | fs.writeFile 真实写入磁盘 |
| FileReadTool | ✅ 是 | fs.readFile 真实读取磁盘 |
| GlobTool | ✅ 是 | 真实文件系统遍历 |
| GrepTool | ✅ 是 | 真实文件内容搜索 |
| WebFetchTool | ✅ 是 | HTTP 请求获取网页 |
| WebSearchTool | ✅ 是 | 调用搜索 API |
| AgentTool | ✅ 是 | 创建子代理进程/上下文 |

## 7. 结论

**终端和编辑能力是真实调用的！**

1. **终端命令**通过 Node.js 的 `child_process.spawn` 真实执行，不是模拟
2. **文件编辑**通过真实的文件系统 API 读写磁盘，不是虚拟操作
3. 所有工具都有完整的权限检查、安全验证和错误处理机制
4. 工具执行结果会真实影响系统状态（文件修改、命令执行等）

## 8. 建议的验证方式

如需进一步验证工具调用，可以：

1. **查看日志**：启用 `CLAUDE_CODE_DEBUG=1` 查看详细执行日志
2. **监控进程**：使用系统监控工具观察子进程创建
3. **文件监控**：使用文件系统监控工具观察文件变化
4. **代码断点**：在 `toolExecution.ts:1207` 处设置断点观察工具调用
