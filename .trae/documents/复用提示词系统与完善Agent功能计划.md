# 复用提示词系统与完善 Agent 功能计划

## 问题诊断

### 1. `getAgentTools` 函数缺失
- `agentApi.ts` 第14行：`import { getAgentTools } from '../tools'`
- `sessionManager.ts` 第814行：`const { getAgentTools } = await import('../tools')`
- 但 `server/src/master/tools/index.ts` 中**没有导出 `getAgentTools` 函数**
- 这会导致运行时错误，工具列表无法获取

### 2. 系统提示词被硬编码，未复用现有提示词系统
- `agentApi.ts` 第362-374行：`buildSystemPrompt()` 被硬编码为简单中文提示词
- `sessionManager.ts` 第882-894行：`buildSystemPrompt()` 同样被硬编码
- 项目已有完善的提示词系统：
  - `server/src/master/prompts/contextBuilder.ts`：`buildCompleteSystemPrompt()` - 完整系统提示构建器
  - `server/src/master/prompts/systemPromptCore.ts`：核心提示词章节（Doing Tasks, Actions, Tone & Style）
  - `server/src/master/prompts/agentToolPrompt.ts`：Agent 工具使用指导
  - `server/src/master/prompts/webSearchPrompt.ts`：WebSearch 专用提示词
  - `server/src/master/prompts/index.ts`：统一导出入口

### 3. AI 不知道可以使用网络搜索
- 硬编码提示词只提到"网络操作：发送 HTTP 请求"
- 没有明确告知 AI 可以使用 `WebSearch`、`WebFetch`、`HttpRequest` 工具
- 现有 `webSearchPrompt.ts` 已定义了完整的 WebSearch 使用规范

### 4. 桥接模式代码在 `src/` 目录下未被复用
- `src/bridge/` 目录包含完整的桥接模式实现（bridgeMain.ts, bridgeApi.ts 等）
- 当前 `server/src/master/server/agentApi.ts` 使用简单的 HTTP 转发，未复用桥接模式的通信抽象
- 需要评估哪些桥接功能可以被复用

## 实施步骤

### 步骤 1：创建 `getAgentTools` 函数
**文件**：`server/src/master/tools/agentToolsProvider.ts`（新建）

- 从 `ToolRegistry` 获取所有已注册工具
- 转换为 Agent 可用的工具定义格式
- 导出 `getAgentTools()` 函数
- 在 `server/src/master/tools/index.ts` 中导出

### 步骤 2：修改 `agentApi.ts` 复用提示词系统
**文件**：`server/src/master/server/agentApi.ts`

- 移除硬编码的 `buildSystemPrompt()` 函数
- 导入 `buildCompleteSystemPrompt` 和 `getWebSearchPrompt`
- 在 `prepareAgentContext()` 中使用 `buildCompleteSystemPrompt()` 构建系统提示词
- 添加网络搜索工具指导到提示词中
- 保持流式转发逻辑不变

### 步骤 3：修改 `sessionManager.ts` 复用提示词系统
**文件**：`server/src/master/services/sessionManager.ts`

- 移除硬编码的 `buildSystemPrompt()` 方法
- 导入 `buildCompleteSystemPrompt`
- 在 `prepareAgentContext()` 中使用 `buildCompleteSystemPrompt()` 构建系统提示词
- 添加网络搜索工具指导

### 步骤 4：完善 `getSessionSpecificGuidanceSection` 添加网络搜索指导
**文件**：`server/src/master/prompts/systemPromptCore.ts`

- 在 `getSessionSpecificGuidanceSection()` 中添加 WebSearch 使用指导
- 当 `enabledTools` 包含 'WebSearch' 时，注入 `getWebSearchPrompt()` 内容

### 步骤 5：验证和测试
- 确保所有导入路径正确
- 确保 `getAgentTools()` 能正确返回工具列表
- 确保系统提示词包含完整的工具使用说明
- 确保网络搜索功能正常工作

## 预期结果

1. AI Agent 能够正确获取所有可用工具列表
2. 系统提示词使用项目已有的完整提示词系统结构
3. AI 明确知道可以使用 `WebSearch`、`WebFetch`、`HttpRequest` 进行网络操作
4. 桥接模式代码被评估并尽可能复用
5. 解决 AI 说"无法访问互联网"的问题

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/src/master/tools/agentToolsProvider.ts` | 新建 | 提供 `getAgentTools()` 函数 |
| `server/src/master/tools/index.ts` | 修改 | 导出 `getAgentTools` |
| `server/src/master/server/agentApi.ts` | 修改 | 复用提示词系统 |
| `server/src/master/services/sessionManager.ts` | 修改 | 复用提示词系统 |
| `server/src/master/prompts/systemPromptCore.ts` | 修改 | 添加网络搜索指导 |

## 风险与回退

- 如果 `buildCompleteSystemPrompt` 依赖的服务（如 `ruleInjector`）不可用，需要添加降级逻辑
- 如果工具注册表未初始化，需要确保 `getAgentTools()` 能优雅处理
- 所有修改保持向后兼容，不影响现有 API 接口
