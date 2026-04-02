# Tasks

## 任务 1: 修复 WebSocket 连接时序问题
- [x] Task 1.1: 修改 `useWebSocket.ts` 中的 `connect()` 方法
  - 确保连接建立并完成用户注册后再 resolve Promise
  - 添加连接状态的正确管理
- [x] Task 1.2: 修改 `chat.ts` store 中的 `connect()` 方法
  - 等待 WebSocket 连接成功后再设置状态
  - 确保后续操作在连接就绪后执行

## 任务 2: 修复前端 Store 异步方法
- [x] Task 2.1: 修改 `chat.ts` 中的 `createSession()` 方法
  - 返回 Promise，等待 `session_created` 事件
- [x] Task 2.2: 修改 `chat.ts` 中的 `loadSession()` 方法
  - 返回 Promise，等待 `session_loaded` 事件
- [x] Task 2.3: 修改 `chat.ts` 中的 `listSessions()` 方法
  - 返回 Promise，等待 `session_list` 事件

## 任务 3: 添加后端 HTTP Session API
- [x] Task 3.1: 在后端 `index.ts` 中添加 `/api/sessions` GET 路由
  - 获取用户会话列表
- [x] Task 3.2: 在后端 `index.ts` 中添加 `/api/sessions` POST 路由
  - 创建新会话
- [x] Task 3.3: 在后端 `index.ts` 中添加 `/api/sessions/:id` GET 路由
  - 加载会话详情（包含消息）
- [x] Task 3.4: 在后端 `index.ts` 中添加 `/api/sessions/:id` PUT 路由
  - 更新会话信息
- [x] Task 3.5: 在后端 `index.ts` 中添加 `/api/sessions/:id` DELETE 路由
  - 删除会话
- [x] Task 3.6: 在后端 `index.ts` 中添加 `/api/sessions/:id/clear` POST 路由
  - 清空会话消息

## 任务 4: 优化 Chat.vue 初始化流程
- [x] Task 4.1: 修改 `Chat.vue` 中的 `onMounted` 钩子
  - 确保按正确顺序执行：连接 -> 获取会话 -> 创建/加载会话
  - 添加错误处理和加载状态

## 任务 5: 测试验证
- [x] Task 5.1: 测试 WebSocket 连接流程
- [x] Task 5.2: 测试会话创建和加载
- [x] Task 5.3: 测试消息发送和接收

# Task Dependencies

- [Task 2] 依赖 [Task 1] - Store 方法修复依赖 WebSocket 连接修复
- [Task 4] 依赖 [Task 1] 和 [Task 2] - Chat.vue 初始化依赖连接和方法修复
- [Task 5] 依赖 [Task 1], [Task 2], [Task 3], [Task 4] - 测试依赖所有修复完成
