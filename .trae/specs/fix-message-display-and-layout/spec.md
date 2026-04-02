# 修复消息显示和界面布局问题 Spec

## Why

当前系统存在以下严重问题：
1. 后端正常发送流式消息，但前端没有显示 AI 的回复
2. 发送按钮位置不合理，应该放在输入框左边
3. 对话记录可能消失，影响用户体验

## What Changes

### 1. 修复消息显示问题
- 检查并修复 `content_block_delta` 事件处理逻辑
- 确保 AI 回复消息正确显示在界面上
- 验证消息状态更新的响应性

### 2. 调整发送按钮位置
- 将发送按钮从输入框右边移动到左边
- 优化输入区域布局

### 3. 修复对话记录消失问题
- 检查会话加载逻辑
- 确保消息正确持久化和加载

## Impact

- Affected specs: 消息显示模块、界面布局模块
- Affected code:
  - `web/src/components/ChatInput.vue`
  - `web/src/stores/chat.ts`
  - `web/src/composables/useWebSocket.ts`
  - `web/src/components/ChatMessageList.vue`

## ADDED Requirements

### Requirement: 消息正确显示

系统应正确显示 AI 的回复消息。

#### Scenario: 用户发送消息后
- **WHEN** 用户发送消息
- **AND** 后端返回流式消息
- **THEN** 前端应正确接收并显示 AI 的回复
- **AND** 消息应实时更新

### Requirement: 发送按钮位置

发送按钮应位于输入框左边，符合用户习惯。

#### Scenario: 查看输入区域
- **WHEN** 用户查看聊天输入区域
- **THEN** 发送按钮应在输入框左边
- **AND** 布局应美观协调

### Requirement: 对话记录持久化

对话记录应正确保存和加载。

#### Scenario: 刷新页面后
- **WHEN** 用户刷新页面
- **THEN** 对话记录应正确加载
- **AND** 所有历史消息应正确显示

## MODIFIED Requirements

### Requirement: 流式消息处理

需要修复流式消息处理逻辑，确保消息正确显示。

## REMOVED Requirements

无移除的需求。
