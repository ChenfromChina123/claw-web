# 前后端 API 连接修复 Spec

## Why

当前聊天模块无法正常工作，前端与后端的 API 连接存在多处问题：
1. WebSocket 消息发送时序问题 - 未等待连接建立就发送消息
2. HTTP API 路由缺失 - 前端定义了 `/api/sessions/*` 相关接口，但后端未实现
3. 前端 store 方法未正确返回 Promise，导致无法等待异步操作完成

## What Changes

### 1. WebSocket 连接时序修复
- 修改 `useWebSocket.ts` 中的 `connect()` 方法，确保连接建立后再返回
- 修改 `chat.ts` store，确保在连接成功后再执行后续操作

### 2. 后端 HTTP API 补全
- 在后端 `index.ts` 中添加 `/api/sessions/*` 相关的 HTTP 路由实现
- 实现会话的 CRUD 操作：创建、列表、加载、更新、删除、清空

### 3. 前端 Store 方法优化
- 修改 `chat.ts` 中的方法，使其正确返回 Promise
- 添加必要的错误处理和状态管理

## Impact

- Affected specs: 聊天模块、会话管理模块
- Affected code:
  - `web/src/composables/useWebSocket.ts`
  - `web/src/stores/chat.ts`
  - `web/src/views/Chat.vue`
  - `server/src/index.ts`

## ADDED Requirements

### Requirement: WebSocket 连接时序控制

系统应确保 WebSocket 连接建立完成后再执行依赖连接的操作。

#### Scenario: 用户打开聊天页面
- **WHEN** 用户打开聊天页面
- **THEN** 系统应先建立 WebSocket 连接
- **AND** 连接成功后再获取会话列表
- **AND** 如果没有会话则自动创建默认会话

### Requirement: HTTP Session API 实现

系统应提供完整的会话管理 HTTP API。

#### Scenario: 通过 HTTP API 管理会话
- **WHEN** 前端调用 `/api/sessions` 接口
- **THEN** 后端应正确处理请求并返回相应数据
- **AND** 支持创建、列表、加载、更新、删除、清空会话

### Requirement: 前端 Store 异步方法

前端 Store 中的会话相关方法应正确返回 Promise。

#### Scenario: 调用 store 方法
- **WHEN** 调用 `createSession()` 或 `loadSession()` 方法
- **THEN** 方法应返回 Promise
- **AND** 可以使用 await 等待操作完成

## MODIFIED Requirements

### Requirement: WebSocket 消息处理

原有的 WebSocket 消息处理逻辑需要增强，确保消息在连接就绪后发送。

### Requirement: 会话管理流程

会话管理流程需要优化，确保操作顺序正确：
1. 建立连接
2. 用户注册/登录
3. 获取会话列表
4. 创建或加载会话

## REMOVED Requirements

无移除的需求。
