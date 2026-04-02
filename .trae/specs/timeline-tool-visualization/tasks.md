# Tasks

- [ ] Task 1: 修改 ChatMessageList.vue 组件结构，实现时间轴步骤条
  - [ ] SubTask 1.1: 添加响应式变量 activeStep 管理展开状态
  - [ ] SubTask 1.2: 实现 getToolIcon 函数，返回工具对应图标
  - [ ] SubTask 1.3: 实现 getStatusType 函数，映射状态到标签类型
  - [ ] SubTask 1.4: 实现 getShortSummary 函数，生成智能摘要
  - [ ] SubTask 1.5: 实现 handleStepClick 函数，处理步骤点击交互

- [ ] Task 2: 重构模板中的工具调用展示区域
  - [ ] SubTask 2.1: 创建 tool-sequence-container 容器结构
  - [ ] SubTask 2.2: 添加 sequence-line 时间轴引导线
  - [ ] SubTask 2.3: 实现 tool-step-item 循环渲染
  - [ ] SubTask 2.4: 添加 step-badge 序号徽章
  - [ ] SubTask 2.5: 实现 step-card 可交互卡片
  - [ ] SubTask 2.6: 添加展开/收起条件渲染逻辑

- [ ] Task 3: 实现时间轴样式系统
  - [ ] SubTask 3.1: 添加 .tool-sequence-container 样式（相对定位、左侧 padding）
  - [ ] SubTask 3.2: 实现 .sequence-line 引导线（绝对定位、渐变背景）
  - [ ] SubTask 3.3: 实现 .tool-step-item 样式（相对定位、过渡动画）
  - [ ] SubTask 3.4: 实现 .step-badge 样式（圆形徽章、定位在引导线上）
  - [ ] SubTask 3.5: 实现 .step-card 样式（背景、边框、圆角）
  - [ ] SubTask 3.6: 添加 hover 和 is-active 状态样式
  - [ ] SubTask 3.7: 实现 .step-detail-transition 展开动画

- [ ] Task 4: 优化现有功能集成
  - [ ] SubTask 4.1: 确保 ToolUseEnhanced 组件正确集成到展开区域
  - [ ] SubTask 4.2: 验证 FlowVisualizer 和 KnowledgeCard 不受影响
  - [ ] SubTask 4.3: 测试工具状态实时更新功能

- [ ] Task 5: 测试与验证
  - [ ] SubTask 5.1: 测试单个工具调用的展示
  - [ ] SubTask 5.2: 测试多个工具调用的时间轴展示
  - [ ] SubTask 5.3: 测试展开/收起交互的手风琴效果
  - [ ] SubTask 5.4: 测试不同状态（pending/executing/completed/error）的视觉反馈
  - [ ] SubTask 5.5: 测试智能摘要的准确性
  - [ ] SubTask 5.6: 验证响应式布局在不同屏幕尺寸下的表现

# Task Dependencies
- Task 2 depends on Task 1 (需要先实现辅助函数才能在模板中使用)
- Task 3 depends on Task 2 (样式需要在 HTML 结构完成后添加)
- Task 4 depends on Task 3 (功能集成需要在样式完成后验证)
- Task 5 depends on Task 4 (测试需要在所有功能完成后进行)
