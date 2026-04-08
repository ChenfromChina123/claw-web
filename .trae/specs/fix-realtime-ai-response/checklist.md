# Checklist

- [x] handleMessage方法能够正确识别`type: 'event'`格式的消息
- [x] 后端发送的content_block_delta事件能够触发前端对应的事件监听器
- [x] 后端发送的message_start事件能够触发前端对应的事件监听器
- [x] 后端发送的message_stop事件能够触发前端对应的事件监听器
- [x] 流式响应文本能够实时追加到assistant消息中
- [x] 用户消息发送后立即显示AI的loading状态
- [x] AI回复完成后loading状态正确关闭
- [x] 刷新页面后仍能从数据库加载完整历史（此功能保持不变）
- [x] 其他WebSocket消息类型（ping/pong, rpc_response）不受影响
- [x] 浏览器控制台无相关错误日志
