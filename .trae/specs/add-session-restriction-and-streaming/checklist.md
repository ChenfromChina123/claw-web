# Checklist

## 会话创建限制
- [ ] 前端 `ChatSidebar.vue` 中的 `handleNewChat` 方法正确验证当前会话是否有消息
- [ ] 前端 `chat.ts` store 中的 `createSession` 方法正确验证会话状态
- [ ] 后端 `index.ts` 中的 `create_session` 处理逻辑正确验证用户是否有空会话
- [ ] 后端 `sessionManager.ts` 中的 `createSession` 方法实现空会话检查
- [ ] 用户尝试创建空会话时显示友好的提示信息
- [ ] 用户在有消息的会话中可以成功创建新会话

## 流式对话配置
- [ ] 前端 `useWebSocket.ts` 中的 `handleContentDelta` 方法正确处理流式内容
- [ ] 前端 `chat.ts` 中的流式事件监听正确更新消息状态
- [ ] 流式消息在界面上实时显示
- [ ] 工具调用事件正确处理和显示
- [ ] 消息更新具有响应性，界面及时刷新

## 功能验证
- [ ] 空会话创建限制功能正常工作
- [ ] 流式对话功能正常工作
- [ ] 用户体验流畅，无卡顿或延迟
- [ ] 错误情况有适当的提示和处理
