# AI即时回复功能修复 Spec

## Why
用户报告前端发送消息后，AI不能即时回复，只有刷新页面后才能从数据库加载到完整的对话历史。这严重影响了用户体验，因为聊天应用的核心价值在于实时交互。

## What Changes
- **修复WebSocket事件分发机制**：当前端收到后端的流式响应事件时，事件类型没有正确传递给事件监听器
- **确保实时消息推送**：修复后端发送的`{type: 'event', event: 'xxx', data: {...}}`格式消息能够正确触发对应的事件处理器

## Impact
- Affected specs: WebSocket通信、实时消息推送、AI流式响应
- Affected code:
  - `web/src/composables/useWebSocket.ts` (第345-365行 handleMessage方法)
  - `server/src/index.ts` (事件发送逻辑)

## ADDED Requirements

### Requirement: 正确的WebSocket事件路由
系统 SHALL 确保从后端收到的`{type: 'event', event: 'eventName', data: {...}}`格式的消息能够正确路由到对应的`eventName`事件监听器。

#### Scenario: 后端发送流式响应事件
- **WHEN** 后端通过sendEvent发送`content_block_delta`事件，格式为`{type: 'event', event: 'content_block_delta', data: {text: '...'}}`
- **THEN** 前端的WebSocket客户端应该调用`emitEvent('content_block_delta', data)`而不是`emitEvent('event', message)`
- **AND** chat.ts中注册的`wsClient.on('content_block_delta', ...)`监听器应该被触发

#### Scenario: 后端发送消息开始事件
- **WHEN** 后端发送`{type: 'event', event: 'message_start', data: {iteration: 1}}`
- **THEN** 前端应该触发`message_start`事件监听器，添加空的assistant消息并设置loading状态

## MODIFIED Requirements

### Requirement: 消息处理流程
修改`handleMessage`方法，增加对`type: 'event'`消息的特殊处理：
- 当`message.type === 'event'`时，提取`message.event`作为实际的事件名称
- 使用`message.event`调用`emitEvent`
- 同时传递`message.data`作为事件数据（而不是整个message对象）

### Requirement: 事件数据格式一致性
确保所有事件监听器接收到的数据格式一致：
- 当前chat.ts中的监听器期望接收`data`字段（即`message.data`）
- 修复后应该传递`message.data`而不是完整的message对象

## REMOVED Requirements
无
