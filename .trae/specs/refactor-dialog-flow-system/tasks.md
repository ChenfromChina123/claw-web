# Tasks

## 后端核心修复

- [x] Task 1: 重构 SessionConversationManager.processMessage() 工具调用循环
  - [x] 1.1 将工具调用逻辑从 message_stop 事件处理中提取到独立方法
  - [x] 1.2 实现 Agent Loop 主循环（支持多轮迭代，最多10次）
  - [x] 1.3 每轮迭代中：先收集完整AI响应（文本+工具调用），再决定是否继续
  - [x] 1.4 确保循环退出条件正确：无工具调用时才结束

- [x] Task 2: 实现完整的工具生命周期事件发送
  - [x] 2.1 在执行工具前发送 `tool_use` 事件（AI决策）
  - [x] 2.2 在执行工具前发送 `tool_start` 事件
  - [x] 2.3 工具成功时发送 `tool_end` 事件（包含结果和耗时）
  - [x] 2.4 工具失败时发送 `tool_error` 事件（包含错误详情）
  - [x] 2.5 统一事件数据格式，确保前端能正确解析

- [x] Task 3: 增强错误处理和恢复机制
  - [x] 3.1 捕获工具执行异常并发送结构化错误信息
  - [x] 3.2 错误信息包含：errorType（NOT_FOUND/PERMISSION/TIMEOUT等）+ message
  - [x] 3.3 将错误结果作为上下文传给AI，让其决定下一步
  - [x] 3.4 添加单次工具调用超时保护（默认30秒）
  - [x] 3.5 达到最大迭代次数时发送 `max_iterations_reached` 事件

## 前端状态同步修复

- [x] Task 4: 优化 WebSocket 客户端事件处理
  - [x] 4.1 确保 tool_use/tool_start/tool_end/tool_error 事件都被正确监听
  - [x] 4.2 验证事件数据解析逻辑与后端格式一致
  - [x] 4.3 添加事件处理日志便于调试
  - [x] 4.4 处理事件乱序情况（确保状态更新顺序正确）

- [x] Task 5: 完善 Chat Store 的 toolCalls 状态管理
  - [x] 5.1 tool_use 事件：创建 pending 状态的 toolCall
  - [x] 5.2 tool_start 事件：更新为 executing 状态
  - [x] 5.3 tool_end 事件：更新为 completed 并保存结果
  - [x] 5.4 tool_error 事件：更新为 error 并保存错误信息
  - [x] 5.5 确保状态变更触发 Vue 响应式更新

- [x] Task 6: 增强工具调用的 UI 展示
  - [x] 6.1 显示工具执行的实时状态（pending/executing/completed/error）
  - [x] 6.2 工具失败时显示红色错误提示框（含错误类型和建议）
  - [x] 6.3 支持展开/折叠查看详细输入输出
  - [x] 6.4 多个工具调用时显示序号和引导线

## 集成测试

- [x] Task 7: 端到端测试验证
  - [x] 7.1 测试场景1：简单问答（无工具调用），验证正常流式响应
  - [x] 7.2 测试场景2：单次工具调用（如"读取package.json"），验证完整事件链路
  - [x] 7.3 测试场景3：多轮工具调用（如"读取→分析→修改"），验证循环不中断
  - [x] 7.4 测试场景4：工具调用失败（如读取不存在的文件），验证错误反馈显示
  - [x] 7.5 测试场景5：达到最大迭代次数，验证优雅终止

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 2, Task 3]
- [Task 5] depends on [Task 4]
- [Task 6] depends on [Task 5]
- [Task 7] depends on [Task 1, Task 2, Task 3, Task 4, Task 5, Task 6]
