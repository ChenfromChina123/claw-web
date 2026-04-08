# 对话流程系统重构 Spec

## Why
当前对话流程系统存在两个核心问题导致用户体验严重受损：

1. **Agent 工具调用循环无故打断**：在多轮工具调用场景下，循环提前终止，导致 Agent 无法完成复杂任务
2. **工具调用失败无反馈**：工具执行出错时，前端无法收到错误详情，用户看到的是空白或卡死状态

## What Changes

### 核心问题定位

#### 问题1: 工具调用循环中断 (server/src/index.ts:198-359)
**根因**:
- 工具调用在 `message_stop` 事件中批量处理（第278-326行）
- 循环退出条件判断逻辑有缺陷（第339-349行）
- 缺少完整的工具生命周期事件发送（tool_start/tool_end/tool_error）

**现象**: 
- Agent 调用一次工具后就停止
- 复杂任务（如"读取文件→修改→保存"）无法完成
- 前端显示工具状态一直停留在 "pending"

#### 问题2: 工具错误无反馈 (前后端事件链路断裂)
**根因**:
- 后端 catch 错误后未发送 `tool_error` 事件（第307-320行）
- 后端未发送 `tool_end` 事件标记工具完成（无论成功失败）
- 前端 `toolCalls` 状态永远无法从 `pending` 更新为 `completed/error`

**现象**:
- 工具执行失败时界面无任何提示
- 用户不知道是网络问题、权限问题还是参数错误
- 无法重试或纠正

### 修复方案

#### 1. 重构工具调用循环机制
- **将工具调用从 message_stop 事件中提取出来**
- **实现真正的 Agent Loop**：支持最多10轮工具调用迭代
- **每次工具调用前后都发送完整的事件序列**
- **添加超时保护和错误恢复机制**

#### 2. 完善工具生命周期事件
```
用户消息 → message_start → [流式文本] → tool_use → tool_start → [执行中] → tool_end/tool_error → 继续循环/结束
```

必须确保每个工具调用都发送：
- `tool_use`: AI 决定使用工具（含工具名和输入参数）
- `tool_start`: 工具开始执行
- `tool_end`: 工具成功完成（含结果）
- `tool_error`: 工具执行失败（含错误信息）

#### 3. 增强错误处理和用户反馈
- 捕获所有异常并发送结构化错误信息
- 前端显示友好的错误提示（而非空白）
- 支持工具级别的重试机制

## Impact

### 受影响的模块
- **后端核心**: `server/src/index.ts` - SessionConversationManager.processMessage()
- **WebSocket 客户端**: `web/src/composables/useWebSocket.ts` - 事件处理
- **状态管理**: `web/src/stores/chat.ts` - toolCalls 状态更新
- **UI 组件**: `web/src/components/ChatMessageList.vue` - 工具状态展示

### 数据流变更
```
当前（断裂）:
  AI响应 → [隐式工具调用] → ❌ 无事件 → 前端不知情

修复后（完整）:
  AI响应 → tool_use事件 → tool_start → 执行工具 → tool_end/error → 前端实时更新 → 继续下一轮
```

## ADDED Requirements

### Requirement: 完整的工具调用循环
系统 SHALL 实现 Agentic Loop，支持 AI 自主决定是否需要调用工具，并在工具完成后自动继续对话。

#### Scenario: 多轮工具调用成功
- **WHEN** 用户请求需要多个步骤的任务（如"读取package.json并总结依赖"）
- **THEN** 系统 SHALL:
  1. 发送 `message_start` 和流式文本
  2. 发送 `tool_use` 事件（AI选择FileRead工具）
  3. 发送 `tool_start` 事件
  4. 执行工具并获取结果
  5. 发送 `tool_end` 事件（包含文件内容）
  6. **自动继续**下一轮AI调用（将工具结果作为上下文）
  7. 重复步骤1-5直到AI生成最终文本回复
  8. 发送 `message_stop` 和 `conversation_end`

#### Scenario: 工具调用失败时继续
- **WHEN** 工具执行抛出异常（如文件不存在、权限不足）
- **THEN** 系统 SHALL:
  1. 发送 `tool_error` 事件（包含错误类型和消息）
  2. 将错误信息作为上下文传给AI
  3. AI可以选择重试、换方案或向用户解释
  4. **不中断循环**，除非达到最大迭代次数

### Requirement: 实时的工具状态反馈
系统 SHALL 在工具执行的每个阶段都向前端发送事件，确保UI实时反映真实状态。

#### Scenario: 工具执行中的状态展示
- **WHEN** 工具正在执行（如运行Bash命令耗时5秒）
- **THEN** 前端 SHALL 显示:
  - 工具名称和图标
  - "执行中..." 状态标签
  - 输入参数摘要（可展开）
  - 进度指示器（spinner）

#### Scenario: 工具完成后的结果展示
- **WHEN** 工具执行完成（成功或失败）
- **THEN** 前端 SHALL 更新为:
  - 成功：绿色"完成"标签 + 结果预览（可折叠）
  - 失败：红色"错误"标签 + 错误信息 + 建议操作

## MODIFIED Requirements

### Requirement: SessionConversationManager.processMessage()
**原有实现**: 在单个 while 循环中混合处理流式输出和工具调用，容易状态混乱
**修改为**:
```typescript
async processMessage(sessionId, userMessage, model, sessionManager, sendEvent) {
  // 1. 保存用户消息
  // 2. 进入 Agent Loop (max 10 iterations)
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // 2.1 调用AI API (streaming)
    // 2.2 收集完整响应对（文本 + 工具调用列表）
    // 2.3 如果有工具调用:
    //      for each toolCall:
    //        - sendEvent('tool_use', {...})
    //        - sendEvent('tool_start', {...})
    //        - result = await executeTool(...)
    //        - if success: sendEvent('tool_end', {...})
    //        - else: sendEvent('tool_error', {...})
    //      - 将工具结果加入messages数组
    //      - continue (进入下一轮迭代)
    // 2.4 如果无工具调用 (纯文本回复):
    //      - sendEvent('message_stop')
    //      - break (结束循环)
  }
  // 3. 发送 conversation_end
}
```

### Requirement: WebSocket 事件协议
**原有实现**: 部分事件缺失或格式不一致
**修改为**: 标准化所有工具相关事件格式

| 事件名 | 触发时机 | 必需字段 | 示例 |
|--------|---------|----------|------|
| `tool_use` | AI决定使用工具 | id, name, input | `{id:"tool_1", name:"FileRead", input:{path:"/a.txt"}}` |
| `tool_start` | 开始执行工具 | id, name, input | 同上 |
| `tool_end` | 工具成功完成 | id, result, duration | `{id:"tool_1", result:{content:"..."}, duration:120}` |
| `tool_error` | 工具执行失败 | id, error, errorType | `{id:"tool_1", error:"文件不存在", errorType:"NOT_FOUND"}` |

## REMOVED Requirements

### Requirement: 隐式工具调用（message_stop 内处理）
**原因**: 导致事件链路断裂，前端无法感知工具状态
**迁移**: 显式地在循环中逐个处理工具调用，每步都发送事件
