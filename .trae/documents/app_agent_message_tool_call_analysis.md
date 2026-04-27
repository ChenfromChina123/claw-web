# App 端 Agent 消息工具调用问题分析与修复计划

## 问题概述

用户反馈 App 端存在两个核心问题：
1. **工具调用的 JSON 格式解析与拦截不符合预期** - 与 Web 端表现不一致
2. **App 端发出的消息没有得到保存** - 感觉像新开的方法，与 Web 端逻辑不一致

## 详细分析

### 问题 1：工具调用事件不匹配

**后端实际发送的事件**（`sessionConversationManager.ts`）：
- `tool_use` - 工具开始（L505, L755）
- `tool_start` - 工具执行开始（L825）
- `tool_end` - 工具执行完成（L893）
- `tool_error` - 工具执行失败（L931）
- `tool_input_delta` - 工具输入增量（L517, L769）

**App 端期待的事件**（`WebSocketManager.kt` L232-242）：
- `tool_call_start` - 工具开始
- `tool_call_complete` - 工具完成

**Web 端处理的事件**（`chat.ts` L329-415）：
- `tool_use` - 工具使用
- `tool_start` - 工具开始执行
- `tool_end` - 工具完成
- `tool_error` - 工具错误

**结论**：App 端监听的事件名与后端不匹配，导致工具调用事件无法被正确处理。

### 问题 2：工具调用与消息关联缺失

**App 端当前实现**：
- `_toolCalls` 列表独立维护，不绑定到消息
- UI 渲染时使用 `message.toolCalls ?: emptyList()`，但消息的 `toolCalls` 始终为 null
- 没有类似 Web 端 `currentStreamingAssistantId` 的关联机制

**Web 端实现**：
- `toolCalls` 列表独立维护，但每个 `toolCall` 有 `messageId` 字段
- 通过 `currentStreamingAssistantId` 追踪当前正在流式输出的助手消息
- 组件通过工具调用的 `messageId` 与助手消息关联

**结论**：App 端需要实现类似的消息-工具调用关联机制。

### 问题 3：消息保存事件处理不完整

**后端发送的保存事件**（`sessionConversationManager.ts`）：
- `message_saved` - 消息已保存（L234, L290, L357, L379）

**App 端处理**（`ChatViewModel.kt` L150-162）：
- 处理了 `MessageSaved` 事件，但只更新了用户消息 ID
- 没有处理工具调用结果的保存

### 问题 4：消息格式解析差异

**App 端内容解析**（`MessageContentParser.kt`）：
- 尝试解析 JSON 格式的 `tool_use` 和 `tool_result`
- 使用正则表达式提取工具调用片段

**问题**：
- 后端发送的内容格式是数组格式 `[{type: 'text', text: '...'}, {type: 'tool_use', ...}]`
- App 端的解析逻辑可能无法正确处理这种格式

## 修复方案

### 修复 1：统一事件名称

**文件**：`chat_application/app/src/main/java/com/example/claw_code_application/data/websocket/WebSocketManager.kt`

**修改**：
1. 将事件名称从 `tool_call_start`/`tool_call_complete` 改为 `tool_use`/`tool_start`/`tool_end`/`tool_error`
2. 添加 `tool_input_delta` 事件处理
3. 更新 `WebSocketEvent` 密封类以匹配新的事件结构

### 修复 2：实现消息-工具调用关联

**文件**：`chat_application/app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModel.kt`

**修改**：
1. 添加 `streamingMessageId` 追踪当前流式输出的助手消息
2. 在 `tool_use` 事件中，将工具调用关联到当前流式消息
3. 在 `tool_end`/`tool_error` 事件中，更新对应工具调用的状态和结果
4. 确保 UI 能正确显示与消息关联的工具调用

### 修复 3：完善消息保存处理

**文件**：`chat_application/app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModel.kt`

**修改**：
1. 完善 `MessageSaved` 事件处理
2. 确保消息保存后状态一致

### 修复 4：优化内容解析

**文件**：`chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/MessageContentParser.kt`

**修改**：
1. 优化 JSON 数组格式解析
2. 确保能正确解析后端发送的内容格式

## 实施步骤

1. **修改 WebSocketManager.kt** - 更新事件名称和处理逻辑
2. **修改 ChatViewModel.kt** - 实现消息-工具调用关联
3. **修改 MessageContentParser.kt** - 优化内容解析
4. **测试验证** - 确保与 Web 端表现一致

## 预期效果

修复后，App 端将：
- 正确接收和处理工具调用事件
- 工具调用与消息正确关联显示
- 消息保存状态与 Web 端一致
- 整体体验与 Web 端保持一致
