# Tasks

## 后端任务

- [x] Task 1: 实现诊断 API 端点
  - [x] 1.1 在 `server/src/index.ts` 中添加 `/api/diagnostics/health` 路由
  - [x] 1.2 实现健康检查逻辑，收集各组件状态
  - [x] 1.3 添加 `/api/diagnostics/components` 路由获取详细组件信息
  - [x] 1.4 测试 API 端点返回正确的 JSON 格式

- [x] Task 2: 扩展性能监控器健康检查功能
  - [x] 2.1 在 `performanceMonitor.ts` 中添加 `getHealthStatus()` 方法
  - [x] 2.2 实现内存使用率计算
  - [x] 2.3 实现 CPU 使用率计算
  - [x] 2.4 实现 WebSocket 连接数统计

- [x] Task 3: 工具注册中心执行事件广播
  - [x] 3.1 在 `toolRegistry.ts` 中添加事件广播方法
  - [x] 3.2 在 `execute()` 方法中触发 `tool.execution_started` 事件
  - [x] 3.3 在工具执行过程中触发 `tool.execution_progress` 事件
  - [x] 3.4 在工具完成时触发 `tool.execution_completed` 或 `tool.execution_failed` 事件
  - [x] 3.5 测试事件能够正确广播到 WebSocket 客户端

## 前端任务

- [x] Task 4: 创建诊断面板组件
  - [x] 4.1 新建 `web/src/components/DiagnosticPanel.vue`
  - [x] 4.2 实现组件状态卡片 UI（网格布局）
  - [x] 4.3 实现状态指示器（颜色编码）
  - [x] 4.4 实现自动刷新逻辑（5 秒间隔）
  - [x] 4.5 集成到 `IntegrationHub.vue` 顶部区域

- [x] Task 5: 创建工具执行流程可视化组件
  - [x] 5.1 新建 `web/src/components/ToolExecutionFlow.vue`
  - [x] 5.2 实现时间线 UI 组件
  - [x] 5.3 实现执行状态显示（执行中/成功/失败）
  - [x] 5.4 实现输入参数格式化显示
  - [x] 5.5 实现输出结果折叠/展开
  - [x] 5.6 集成 WebSocket 事件监听
  - [x] 5.7 集成到 `ToolExecution.vue` 组件

- [ ] Task 6: 增强 MCP 服务器状态仪表盘
  - [ ] 6.1 修改 `MCPServers.vue` 组件，添加实时状态显示
  - [ ] 6.2 实现心跳时间相对显示（如"3 秒前"）
  - [ ] 6.3 添加连接状态图标指示器
  - [ ] 6.4 实现响应时间显示
  - [ ] 6.5 测试 WebSocket 事件驱动的实时更新

- [x] Task 7: 创建技能市场组件
  - [x] 7.1 新建 `web/src/components/SkillMarket.vue`
  - [x] 7.2 实现技能卡片网格布局
  - [x] 7.3 实现搜索功能（按名称/描述/标签）
  - [x] 7.4 实现类别筛选器
  - [x] 7.5 实现技能详情弹窗
  - [x] 7.6 实现一键启用/禁用功能
  - [x] 7.7 集成到 `IntegrationHub.vue` 技能标签页

- [x] Task 8: 重构 IntegrationHub 页面结构
  - [x] 8.1 修改 `IntegrationHub.vue` 布局，添加顶部诊断概览区域
  - [x] 8.2 调整 Tab 导航位置和内容区域
  - [x] 8.3 添加技能标签页到 Tab 导航
  - [x] 8.4 优化响应式布局

- [x] Task 9: 统一监控面板 API 调用
  - [x] 9.1 修改 `MonitoringPanel.vue`，使用 axios 替代 fetch
  - [x] 9.2 确保 API 路径与基地址正确拼接
  - [x] 9.3 测试所有监控功能正常工作

## 集成测试任务

- [ ] Task 10: 端到端测试
  - [ ] 10.1 测试诊断面板显示正确的组件状态
  - [ ] 10.2 测试工具执行流程实时更新
  - [ ] 10.3 测试 MCP 服务器状态实时刷新
  - [ ] 10.4 测试技能市场的搜索和筛选功能
  - [ ] 10.5 测试技能启用/禁用功能

# Task Dependencies

- [Task 4] depends on [Task 1, Task 2]
- [Task 5] depends on [Task 3]
- [Task 6] depends on [Task 3]
- [Task 7] depends on []
- [Task 8] depends on [Task 4, Task 7]
- [Task 9] depends on []
- [Task 10] depends on [Task 4, Task 5, Task 6, Task 7, Task 8, Task 9]
