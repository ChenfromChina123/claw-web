# 工具调用时间轴可视化优化 Spec

## Why
当前 ChatMessageList.vue 组件虽然已经具备了解析工具调用并生成流程图的能力，但存在以下问题：
1. **信息过载**：大量 JSON 数据和底部统计区域让用户难以快速理解关键信息
2. **缺乏顺序感**：无法直观地看到"每一步"发生了什么，工具调用的时间顺序不够清晰
3. **交互性不足**：用户无法按需查看每个步骤的详细信息，所有信息平铺直叙

本优化旨在通过引入时间轴步骤条、改进交互方式、优化信息展示层次，提升用户体验。

## What Changes
- **重构工具调用展示区域**：将现有的 tool-calls-enhanced 区域改造为垂直时间轴步骤条（Timeline Stepper）
- **实现可交互步骤卡片**：每个工具调用变为可点击的步骤项，点击展开/收起详细信息
- **优化信息层次**：默认显示简短摘要，展开后显示完整 JSON 和详细输出
- **改进视觉流**：添加时间轴线、步骤序号徽章、状态指示器，强化调用顺序
- **增强状态反馈**：使用颜色、图标、动画等多维度展示工具状态（pending/executing/completed/error）
- **保留现有功能**：保持 FlowVisualizer 和 KnowledgeCard 的独立展示，形成互补

## Impact
- **Affected specs**: 无前置依赖 spec
- **Affected code**: 
  - `web/src/components/ChatMessageList.vue` - 主要修改文件
  - `web/src/components/ToolUseEnhanced.vue` - 可能需要适配新的展示方式
  - 无需修改后端代码

## ADDED Requirements

### Requirement: 时间轴步骤条展示
系统 SHALL 将工具调用序列以垂直时间轴形式展示，包含：
- 左侧时间轴引导线（渐变效果）
- 每个步骤带有序号徽章（badge）
- 步骤卡片包含工具名称、状态标签、简要摘要
- 点击步骤可展开/收起详细信息

#### Scenario: 用户查看工具调用序列
- **WHEN** 消息中包含 toolCalls 数据
- **THEN** 显示垂直时间轴步骤条
- **AND** 每个步骤显示序号、工具名称、状态
- **AND** 默认收起详细信息，仅显示摘要

### Requirement: 步骤交互功能
系统 SHALL 支持用户与步骤条的交互：
- 点击任意步骤卡片可展开/收起该步骤
- 同一时间只展开一个步骤（手风琴效果）
- 展开时显示 ToolUseEnhanced 组件的完整内容
- 收起时显示简短摘要文本

#### Scenario: 用户点击步骤查看详情
- **WHEN** 用户点击某个步骤卡片
- **THEN** 该步骤展开显示详细信息
- **AND** 其他已展开的步骤自动收起
- **AND** 再次点击已展开的步骤会收起

### Requirement: 智能摘要生成
系统 SHALL 为不同类型的工具调用生成简短摘要：
- FileRead: "读取文件：{path}"
- FileList: "浏览目录：{path}"
- Bash: "执行命令：{command 前 50 字符}"
- Search: "搜索：{query 前 30 字符}"
- 其他：显示"点击查看详情"

#### Scenario: 显示步骤摘要
- **WHEN** 步骤处于收起状态
- **THEN** 显示根据工具类型生成的智能摘要
- **AND** 摘要长度不超过 60 字符

### Requirement: 状态视觉映射
系统 SHALL 使用视觉元素清晰展示工具状态：
- completed: 绿色系（成功标识）
- error: 红色系（错误标识）
- executing/pending: 橙色/黄色系（进行中标识）
- 每个状态配有对应的图标和颜色编码

#### Scenario: 展示工具状态
- **WHEN** 工具状态发生变化
- **THEN** 步骤卡片的边框、徽章、标签颜色实时更新
- **AND** 执行中的工具显示加载动画

### Requirement: 工具图标映射
系统 SHALL 为常见工具类型显示对应的图标：
- FileRead: 📄
- FileList: 📂
- Shell/Bash: 🐚
- Search/Grep: 🔍
- Edit: 📝
- Write: ✍️
- Delete: 🗑️
- Git: 🔀
- 其他：🔧

## MODIFIED Requirements

### Requirement: ChatMessageList.vue 组件结构
**修改前**：工具调用区域使用简单的列表展示
**修改后**：
- 引入 `tool-sequence-container` 容器
- 添加 `sequence-line` 时间轴引导线
- 每个工具调用包装为 `tool-step-item`
- 添加 `step-badge` 显示序号
- 添加 `step-card` 作为可交互卡片
- 添加 `is-active` 状态类管理展开/收起

### Requirement: 样式系统
**修改前**：统一的工具卡片样式
**修改后**：
- 时间轴容器添加左侧 padding 容纳引导线
- 引导线使用渐变色从主色调到透明
- 步骤徽章为圆形，定位在引导线上
- 步骤卡片支持 hover 和 active 状态
- active 状态添加发光效果

## REMOVED Requirements
无 - 本优化为增强型改进，不删除现有功能
