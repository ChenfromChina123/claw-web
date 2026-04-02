# Checklist

## WebSocket 连接时序
- [x] WebSocket `connect()` 方法在连接建立并完成用户注册后才 resolve
- [x] 前端 store 的 `connect()` 方法正确等待 WebSocket 连接成功
- [x] 连接状态正确反映当前连接情况

## 前端 Store 异步方法
- [x] `createSession()` 方法返回 Promise 并正确等待会话创建完成
- [x] `loadSession()` 方法返回 Promise 并正确等待会话加载完成
- [x] `listSessions()` 方法返回 Promise 并正确等待会话列表返回

## 后端 HTTP Session API
- [x] `GET /api/sessions` 正确返回用户会话列表
- [x] `POST /api/sessions` 正确创建新会话
- [x] `GET /api/sessions/:id` 正确返回会话详情和消息
- [x] `PUT /api/sessions/:id` 正确更新会话信息
- [x] `DELETE /api/sessions/:id` 正确删除会话
- [x] `POST /api/sessions/:id/clear` 正确清空会话消息

## Chat.vue 初始化流程
- [x] 页面加载时按正确顺序执行初始化
- [x] 无会话时自动创建默认会话
- [x] 有会话时正确加载第一个会话
- [x] 错误情况有适当的提示和处理

## 功能验证
- [x] 用户可以正常发送消息
- [x] 消息可以正常接收并显示
- [x] 会话列表正确显示
- [x] 会话切换正常工作
