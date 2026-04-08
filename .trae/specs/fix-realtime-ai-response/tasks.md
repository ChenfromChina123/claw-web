# Tasks

- [x] Task 1: 修复WebSocket事件路由机制
  - [x] 1.1 分析当前handleMessage方法的事件分发逻辑
  - [x] 1.2 修改handleMessage方法，增加对`type: 'event'`消息的特殊处理
  - [x] 1.3 确保event字段被正确提取并用于emitEvent调用
  - [x] 1.4 验证数据传递格式（传递message.data而不是整个message对象）

- [x] Task 2: 测试实时消息推送功能
  - [x] 2.1 启动开发服务器并连接WebSocket
  - [x] 2.2 发送测试消息，验证AI响应是否实时显示
  - [x] 2.3 检查浏览器控制台日志，确认事件正确触发
  - [x] 2.4 验证流式响应的增量更新是否正常工作

- [x] Task 3: 边界情况处理和代码优化
  - [x] 3.1 处理event字段缺失的情况（向后兼容）
  - [x] 3.2 添加必要的错误处理和日志输出
  - [x] 3.3 确保不影响其他类型消息的正常处理（pong, rpc_response等）

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
