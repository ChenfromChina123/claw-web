# Claude Code 源码注释翻译任务分配表

## 项目信息
- **项目路径**: `d:\Users\Administrator\AistudyProject\HAHA\claude-code-haha`
- **总文件数**: 400+ 个文件
- **翻译目标**: 将所有英文注释翻译为中文
- **创建日期**: 2026-04-02

---

## 任务分配总览

| 任务编号 | 任务名称 | 目录范围 | 优先级 | 预估文件数 |
|---------|---------|---------|-------|----------|
| 任务1 | BashTool 工具目录 | `src/tools/BashTool/` | 高 | 15个 |
| 任务2 | 文件操作工具目录 | `src/tools/FileReadTool/`, `FileEditTool/`, `GlobTool/`, `GrepTool/` 等 | 高 | 15个 |
| 任务3 | Web 相关工具目录 | `src/tools/WebFetchTool/`, `WebSearchTool/`, `MCPTool/` 等 | 中 | 10个 |
| 任务4 | 任务管理工具目录 | `src/tools/TaskCreateTool/`, `TaskListTool/`, `TodoWriteTool/` 等 | 中 | 9个 |
| 任务5 | Agent 和协调器工具目录 | `src/tools/AgentTool/`, `SkillTool/`, `TeamCreateTool/` 等 | 中 | 30个 |
| 任务6 | 命令系统目录 | `src/commands/`, `src/` 根目录剩余文件 | 高 | 20个 |
| 任务7 | 状态和工具函数目录 | `src/state/`, `src/utils/` | 中 | 30个 |
| 任务8 | 核心服务和类型定义 | `src/services/`, `src/types/`, `src/screens/` | 高 | 50个 |

---

## 统一翻译要求

### 基本要求
1. 只翻译代码注释，不要修改代码逻辑
2. 保持原有的代码结构和格式
3. 注释翻译要准确、通顺
4. 不要翻译变量名、函数名、类名等标识符

### Git 提交要求
- 每翻译完一个文件后执行：
  ```bash
  git add [文件名]
  git commit -m "翻译 [文件名] 注释为中文"
  ```
- 提交信息必须使用中文

### 完成后报告
每个任务完成后需要报告：
1. 完成翻译的文件数量
2. 翻译的注释总数
3. git 提交记录数量

---

## 任务详细说明

### 任务1：BashTool 工具目录

**目录**: `src/tools/BashTool/`

**文件列表**:
- `bashSecurity.ts` (已完成部分)
- `bashPermissions.ts` (已完成部分)
- `bashCommandHelpers.ts` (已完成部分)
- `shouldUseSandbox.ts` (已完成部分)
- `commandSemantics.ts` (已完成部分)
- `destructiveCommandWarning.ts`
- `modeValidation.ts`
- `pathValidation.ts`
- `readOnlyValidation.ts`
- `sedValidation.ts`
- `sedEditParser.ts`
- `commentLabel.ts`
- `prompt.ts`

**翻译要点**:
- Bash 安全检查逻辑
- 权限管理机制
- 命令验证模式
- 沙箱使用决策

---

### 任务2：文件操作工具目录

**目录**: `src/tools/FileReadTool/`, `src/tools/FileEditTool/`, `src/tools/FileWriteTool/`, `src/tools/GlobTool/`, `src/tools/GrepTool/`, `src/tools/NotebookEditTool/`, `src/tools/ExitWorktreeTool/`, `src/tools/EnterWorktreeTool/`

**文件列表**:

FileReadTool:
- `FileReadTool.ts` (已完成部分)
- `limits.ts`
- `imageProcessor.ts`

FileEditTool:
- `FileEditTool.ts`
- `utils.ts`
- `types.ts`
- `constants.ts`

FileWriteTool:
- `FileWriteTool.ts`

GlobTool:
- `GlobTool.ts`

GrepTool:
- `GrepTool.ts`

NotebookEditTool:
- `NotebookEditTool.ts`

ExitWorktreeTool:
- `ExitWorktreeTool.ts`

EnterWorktreeTool:
- `EnterWorktreeTool.ts`

**翻译要点**:
- 文件读取限制和验证
- 图像处理逻辑
- 文件编辑和写入机制
- Glob 和 Grep 搜索功能

---

### 任务3：Web 相关工具目录

**目录**: `src/tools/WebFetchTool/`, `src/tools/WebSearchTool/`, `src/tools/RemoteTriggerTool/`, `src/tools/McpAuthTool/`, `src/tools/MCPTool/`, `src/tools/ListMcpResourcesTool/`, `src/tools/ReadMcpResourceTool/`

**文件列表**:

WebFetchTool:
- `WebFetchTool.ts`
- `utils.ts`
- `preapproved.ts`

WebSearchTool:
- `WebSearchTool.ts`

RemoteTriggerTool:
- `RemoteTriggerTool.ts`

McpAuthTool:
- `McpAuthTool.ts`

MCPTool:
- `MCPTool.ts`
- `classifyForCollapse.ts`

ListMcpResourcesTool:
- `ListMcpResourcesTool.ts`

ReadMcpResourceTool:
- `ReadMcpResourceTool.ts`

**翻译要点**:
- Web 获取和搜索功能
- MCP 认证和工具管理
- 资源列表和读取

---

### 任务4：任务管理工具目录

**目录**: `src/tools/TaskCreateTool/`, `src/tools/TaskGetTool/`, `src/tools/TaskUpdateTool/`, `src/tools/TaskListTool/`, `src/tools/TaskStopTool/`, `src/tools/TaskOutputTool/`, `src/tools/TodoWriteTool/`, `src/tools/ExitPlanModeTool/`, `src/tools/EnterPlanModeTool/`

**文件列表**:

TaskCreateTool:
- `TaskCreateTool.ts`

TaskGetTool:
- `TaskGetTool.ts`

TaskUpdateTool:
- `TaskUpdateTool.ts`

TaskListTool:
- `TaskListTool.ts`

TaskStopTool:
- `TaskStopTool.ts`

TaskOutputTool:
- `TaskOutputTool.tsx`

TodoWriteTool:
- `TodoWriteTool.ts`

ExitPlanModeTool:
- `ExitPlanModeV2Tool.ts`

EnterPlanModeTool:
- `EnterPlanModeTool.ts`

**翻译要点**:
- 任务创建、获取、更新、列表
- 任务停止和输出
- 待办事项写入
- 计划模式进入和退出

---

### 任务5：Agent 和协调器工具目录

**目录**: `src/tools/AgentTool/`, `src/tools/SkillTool/`, `src/tools/TeamCreateTool/`, `src/tools/TeamDeleteTool/`, `src/tools/SendMessageTool/`, `src/tools/ScheduleCronTool/`, `src/tools/SleepTool/`, `src/tools/SyntheticOutputTool/`, `src/tools/TungstenTool/`, `src/tools/ConfigTool/`, `src/tools/BriefTool/`, `src/tools/REPLTool/`

**文件列表**:

AgentTool:
- `AgentTool.tsx`
- `runAgent.ts`
- `resumeAgent.ts`
- `loadAgentsDir.ts`
- `forkSubagent.ts`
- `agentToolUtils.ts`
- `agentMemory.ts`
- `agentMemorySnapshot.ts`
- `agentDisplay.ts`
- `agentColorManager.ts`

AgentTool/built-in:
- `generalPurposeAgent.ts`
- `exploreAgent.ts`
- `planAgent.ts`
- `verificationAgent.ts`
- `statuslineSetup.ts`
- `claudeCodeGuideAgent.ts`

SkillTool:
- `SkillTool.ts`

TeamCreateTool:
- `TeamCreateTool.ts`

TeamDeleteTool:
- `TeamDeleteTool.ts`

SendMessageTool:
- `SendMessageTool.ts`

ScheduleCronTool:
- `CronCreateTool.ts`
- `CronListTool.ts`
- `CronDeleteTool.ts`

SleepTool:
- `SleepTool.ts`

SyntheticOutputTool:
- `SyntheticOutputTool.ts`

TungstenTool:
- `TungstenTool.ts`

ConfigTool:
- `ConfigTool.ts`

BriefTool:
- `BriefTool.ts`

REPLTool:
- `REPLTool.ts`
- `primitiveTools.ts`

**翻译要点**:
- Agent 运行和恢复
- 子代理分叉和管理
- 团队创建和删除
- 计划任务调度
- REPL 原始工具

---

### 任务6：命令系统目录

**目录**: `src/commands/`, `src/`

**文件列表**:

commands/:
- `allCommands.ts`
- `registerCommands.ts`

src/ 根目录:
- `main.tsx` (继续完成剩余注释)
- `commands.ts` (已完成)
- `tools.ts` (已完成)
- `QueryEngine.ts` (已完成)
- `ask.ts`
- `askUser.ts`
- `print.ts`

**翻译要点**:
- 命令注册和加载
- 查询引擎初始化
- 主程序入口逻辑

---

### 任务7：状态和工具函数目录

**目录**: `src/state/`, `src/utils/`

**文件列表**:

state/:
- `store.ts`
- `appStore.ts`
- `uiStore.ts`
- `AppStateStore.ts`
- `teammateViewHelpers.ts`
- `selectors.ts`
- `onChangeAppState.ts`

utils/bash/:
- `bashParser.ts`
- `commands.ts`
- `shellQuoting.ts`

utils/permissions/:
- `permissions.ts`

utils/settings/:
- `settings.ts`

**翻译要点**:
- 状态存储和管理
- Bash 命令解析
- 权限管理
- 设置加载和合并

---

### 任务8：核心服务和类型定义

**目录**: `src/services/`, `src/types/`, `src/screens/`, `src/components/`, `src/ink/`

**文件列表**:

services/:
- `api/claude.ts`
- `analytics/` 目录下的文件
- `mcp/` 目录下的文件
- `oauth/` 目录下的文件
- `lsp/` 目录下的文件
- `voice/` 目录下的文件

types/:
- `types.ts`
- `permissions.ts`
- `messages.ts`

screens/:
- `REPL.tsx`
- 其他 screen 文件

components/:
- 各种 React 组件

ink/:
- ink 渲染组件

**翻译要点**:
- API 服务接口
- 分析服务
- MCP 客户端
- OAuth 认证
- LSP 管理
- 类型定义
- React 组件
- Ink 渲染

---

## 进度追踪

### 已完成任务
- [x] main.tsx (部分)
- [x] commands.ts
- [x] tools.ts
- [x] QueryEngine.ts
- [x] src/tools/utils.ts
- [x] src/tools/BashTool/utils.ts
- [x] src/tools/BashTool/toolName.ts
- [x] src/tools/BashTool/shouldUseSandbox.ts
- [x] src/tools/BashTool/bashSecurity.ts
- [x] src/tools/BashTool/bashPermissions.ts
- [x] src/tools/BashTool/bashCommandHelpers.ts
- [x] src/tools/BashTool/commandSemantics.ts
- [x] src/tools/BashTool/destructiveCommandWarning.ts
- [x] src/tools/FileReadTool/FileReadTool.ts

### 进行中任务
- [ ] 任务1：BashTool 工具目录
- [ ] 任务2：文件操作工具目录
- [ ] 任务3：Web 相关工具目录
- [ ] 任务4：任务管理工具目录
- [ ] 任务5：Agent 和协调器工具目录
- [ ] 任务6：命令系统目录
- [ ] 任务7：状态和工具函数目录
- [ ] 任务8：核心服务和类型定义

---

## 使用方法

1. 将任务分配给不同的 Agent
2. 每个 Agent 按照任务要求独立工作
3. Agent 完成任务后提交到 Git
4. 定期合并分支并推送

## 注意事项

1. 翻译过程中保持代码功能不变
2. 确保注释翻译准确，避免机器翻译错误
3. 保持代码风格一致性
4. 及时提交避免冲突

---

*最后更新: 2026-04-02*
