# Tasks

## 任务 1: 前端会话创建限制
- [ ] Task 1.1: 修改 `ChatSidebar.vue` 中的 `handleNewChat` 方法
  - 添加验证逻辑：检查当前会话是否有消息
  - 如果没有消息，显示提示信息
  - 如果有消息，允许创建新会话
- [ ] Task 1.2: 修改 `chat.ts` store 中的 `createSession` 方法
  - 添加验证逻辑：检查当前会话消息数量
  - 返回验证结果，允许或拒绝创建

## 任务 2: 后端会话创建限制
- [ ] Task 2.1: 修改 `index.ts` 中的 `create_session` WebSocket 消息处理
  - 添加验证逻辑：检查用户是否有空会话
  - 如果有空会话，返回错误信息
  - 如果没有空会话，允许创建
- [ ] Task 2.2: 修改 `sessionManager.ts` 中的 `createSession` 方法
  - 添加参数：是否强制创建（跳过验证）
  - 实现空会话检查逻辑

## 任务 3: 前端流式对话优化
- [ ] Task 3.1: 优化 `useWebSocket.ts` 中的流式消息处理
  - 确保 `handleContentDelta` 方法正确更新消息
  - 避免与 `chat.ts` 中的处理逻辑冲突
- [ ] Task 3.2: 优化 `chat.ts` 中的流式事件监听
  - 确保正确监听 `content_block_delta` 事件
  - 统一消息更新逻辑
  - 确保响应式更新

## 任务 4: 测试验证
- [ ] Task 4.1: 测试会话创建限制功能
  - 测试空会话时创建新会话（应被阻止）
  - 测试有消息时创建新会话（应成功）
  - 测试提示信息是否正确显示
- [ ] Task 4.2: 测试流式对话功能
  - 测试消息发送和流式接收
  - 测试工具调用的流式显示
  - 测试界面实时更新

# Task Dependencies

- [Task 2] 依赖 [Task 1] - 后端验证应与前端验证保持一致
- [Task 3] 独立执行 - 流式对话优化不依赖其他任务
- [Task 4] 依赖 [Task 1], [Task 2], [Task 3] - 测试依赖所有功能完成
