# 安卓 App AI 流式输出问题修复计划

## 问题分析

### 根本原因
**后端发送的事件名称与客户端期望的事件名称不匹配**

- **后端发送**：`content_block_delta`（见 `sessionConversationManager.ts` 第567行和第807行）
- **客户端期望**：`message_delta`（见 `wsBridge.ts` 第66行定义，`WebSocketManager.kt` 第256-259行监听）

### 数据流追踪

1. **客户端发送消息**：`WebSocketManager.sendUserMessage()` 通过 WebSocket 发送 `user_message`
2. **后端处理**：`wsMessageRouter.handleUserMessage()` 调用 `sessionConversationManager.processMessage()`
3. **AI 流式调用**：`callAnthropicWithStream()` 或 `callQwenWithStream()` 处理流式响应
4. **后端发送事件**：调用 `sendEvent('content_block_delta', { text: ... })`
5. **客户端接收**：客户端监听的是 `message_delta` 事件，无法匹配到 `content_block_delta`

### 涉及的代码文件

**后端**：
- `server/src/master/services/conversation/sessionConversationManager.ts`
  - 第567行：`sendEvent('content_block_delta', ...)` (Anthropic)
  - 第807行：`sendEvent('content_block_delta', ...)` (Qwen)

**客户端**：
- `chat_application/.../data/websocket/WebSocketManager.kt`
  - 第256-259行：监听 `message_delta`

**类型定义**：
- `server/src/master/integration/wsBridge.ts`
  - 第66行：定义的事件类型是 `message_delta`

## 修复方案

修改 `sessionConversationManager.ts`，将 `content_block_delta` 改为 `message_delta`：

### 修改点 1：Anthropic 流式处理（第567行）
```typescript
// 修改前
sendEvent('content_block_delta', { text: event.delta.text })

// 修改后
sendEvent('message_delta', { delta: event.delta.text })
```

### 修改点 2：Qwen 流式处理（第807行）
```typescript
// 修改前
sendEvent('content_block_delta', { text: delta.content })

// 修改后
sendEvent('message_delta', { delta: delta.content })
```

### 客户端对应修改

确保客户端正确解析 `message_delta` 事件：
- `WebSocketManager.kt` 第257-259行已正确监听 `message_delta`
- 需要确认 `delta` 字段名称与客户端期望一致

## 实施步骤

1. 修改 `sessionConversationManager.ts` 第567行
2. 修改 `sessionConversationManager.ts` 第807行
3. 验证客户端代码是否正确解析 `message_delta` 事件的 `delta` 字段
4. 提交代码更改

## 风险评估

- **风险等级**：低
- 事件名称统一后，流式输出应能正常工作
- 不涉及业务逻辑变更