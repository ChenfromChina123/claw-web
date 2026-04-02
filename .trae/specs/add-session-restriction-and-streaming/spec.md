# 会话创建限制与流式对话优化 Spec

## Why

当前系统存在以下问题：
1. 用户可以创建多个空会话，导致会话列表中存在大量无意义的空会话
2. 流式对话虽然已实现，但前端处理逻辑存在重复，可能导致状态不一致

## What Changes

### 1. 会话创建限制
- 前端添加验证：当前会话没有消息时，不允许创建新会话
- 后端添加验证：在创建会话时检查用户是否存在空会话
- 提供友好的提示信息，引导用户先在当前会话中发送消息

### 2. 流式对话优化
- 统一前端流式消息处理逻辑，避免重复处理
- 确保流式内容正确显示在界面上
- 优化状态管理，确保消息更新的响应性

## Impact

- Affected specs: 会话管理模块、消息处理模块
- Affected code:
  - `web/src/stores/chat.ts`
  - `web/src/components/ChatSidebar.vue`
  - `web/src/composables/useWebSocket.ts`
  - `server/src/index.ts`
  - `server/src/services/sessionManager.ts`

## ADDED Requirements

### Requirement: 会话创建限制

系统应限制用户创建空会话，确保每个会话至少包含一条用户消息。

#### Scenario: 用户尝试创建新会话
- **WHEN** 用户点击"新对话"按钮
- **AND** 当前会话没有任何消息
- **THEN** 系统应阻止创建新会话
- **AND** 显示提示信息"请先在当前会话中发送消息"

#### Scenario: 用户已有空会话
- **WHEN** 用户尝试创建新会话
- **AND** 用户已有一个或多个空会话
- **THEN** 系统应阻止创建新会话
- **AND** 建议用户使用现有的空会话

### Requirement: 流式对话配置

系统应正确配置和处理流式对话，确保用户能够实时看到 AI 的回复。

#### Scenario: 用户发送消息
- **WHEN** 用户发送消息
- **THEN** 系统应建立流式连接
- **AND** 实时显示 AI 的回复内容
- **AND** 正确处理工具调用事件

#### Scenario: 流式消息更新
- **WHEN** 收到 `content_block_delta` 事件
- **THEN** 系统应增量更新消息内容
- **AND** 界面应实时反映更新

## MODIFIED Requirements

### Requirement: 会话创建流程

原有的会话创建流程需要增强验证逻辑：
1. 检查当前会话是否有消息
2. 如果没有消息，阻止创建并提示用户
3. 如果有消息，允许创建新会话

### Requirement: 消息状态管理

消息状态管理需要优化，确保流式消息的正确处理：
1. 统一消息更新入口
2. 避免重复处理流式事件
3. 确保响应式更新

## REMOVED Requirements

无移除的需求。
