# 手机端 vs Web端 Agent 工具解析逻辑深度对比分析

## 📋 研究结论

**核心问题：手机端不能完全解析 Agent 工具调用，存在多处与 Web 端不一致的逻辑。**

---

## 一、两端架构对比

| 维度 | Web 端 | 手机端 (Android) |
|------|--------|-----------------|
| WebSocket 事件接收 | `useWebSocket.ts` | `WebSocketManager.kt` |
| 状态管理 | `chat.ts` + `agent.ts` (Pinia) | `ChatViewModel.kt` (ViewModel) |
| 消息内容解析 | `ChatMessageList.vue` 内联 | `MessageContentParser.kt` |
| 工具深度解析 | `toolParser.ts` (900行) | ❌ **缺失** |
| 工具结果过滤 | `getMessageText()` + `shouldShowMessage()` + `getSafeAssistantContent()` 三重过滤 | `filterToolResultContent()` 单层过滤 |
| 工具展示组件 | `ToolUseEnhanced.vue` + `ToolResultEnhanced.vue` + `FileWriteToolInline.vue` | `ToolCallCard.kt` + `TerminalViewer.kt` |
| Agent 工作流 | `agent.ts` (独立 Store) | ❌ **缺失独立 Agent 状态管理** |

---

## 二、已发现的关键差异（导致不能完全解析的原因）

### 🔴 差异1：消息内容解析逻辑不完整

**Web 端** (`ChatMessageList.vue` L727-L815)：
- 支持 5 种内容格式：null、string、Array、Object、其他类型
- 对字符串格式：检测 `tool_result`/`tool_use` JSON 并过滤
- 对数组格式：提取 `text` 块，过滤 `tool_result` 块
- 对对象格式：递归处理嵌套 `content` 属性

**手机端** (`MessageContentParser.kt` L24-L112)：
- 仅支持 3 种格式：JSON数组、单个JSON对象、纯文本
- ❌ **不处理对象格式的 content（如 `{type: "text", text: "..."}`）**
- ❌ **不处理嵌套 content 属性**
- ❌ **对 Anthropic API 返回的混合格式支持不足**

### 🔴 差异2：tool_result 内容解析过于简单

**Web 端** (`toolParser.ts` L507-L672)：
- 完整的输出解析器 `parseToolOutput()`，支持：
  - 字符串输出：提取文件列表、行数、错误
  - 对象输出：处理 Git 状态、文件内容、搜索结果、Shell 命令输出
  - 错误输出：提取错误信息和类型
  - 知识提取：从输出中提取 KnowledgeCard

**手机端** (`MessageContentParser.kt` L135-L163)：
- 仅支持 2 种结果格式：Shell结果 (`stdout/stderr/exitCode`) 和 FileList结果 (`files/count`)
- ❌ **不支持 Git 操作结果**
- ❌ **不支持搜索结果 (`matches/results`)**
- ❌ **不支持文件内容读取结果 (`content/contents`)**
- ❌ **不支持通用对象输出**
- ❌ **不支持错误输出解析**
- ❌ **不支持知识提取**

### 🔴 差异3：tool_use 输入参数解析不完整

**Web 端** (`toolParser.ts` L94-L493)：
- 按工具类型分类解析参数（Read/Write/Edit/Search/Shell/通用）
- 支持丰富的字段映射：`PATH_FIELDS`、`CONTENT_FIELDS`、`COMMAND_FIELDS`、`SEARCH_FIELDS`
- 截断长内容显示
- 处理未知参数

**手机端** (`MessageContentParser.kt` L199-L205)：
- 简单的 `parseToolInput()`：遍历 JSON 对象的 key-value，全部转为 `Map<String, String>`
- ❌ **所有值都转为 String，丢失原始类型信息（数字、布尔、嵌套对象）**
- ❌ **不按工具类型分类处理**
- ❌ **不截断长内容**

### 🔴 差异4：消息-工具调用关联逻辑差异

**Web 端** (`chat.ts` L329-L415)：
- 工具调用直接关联 `messageId`（在 `tool_use` 事件中设置）
- 通过 `toolsForMessage(messageId)` 按 messageId 过滤

**手机端** (`ChatViewModel.kt` L59-L79)：
- 使用 `messageToToolCalls` 映射表手动维护关联
- 流式输出时通过 `streamingMessageId` 关联
- ❌ **历史消息加载时 `rebuildMessageToolCallMapping()` 基于时间戳匹配，不够精确**
- ❌ **如果 `tool_use` 事件到达时 `streamingMessageId` 为 null，工具调用将无法关联到任何消息**

### 🔴 差异5：tool_result/tool_use 过滤逻辑不完整

**Web 端** (`ChatMessageList.vue`)：
- 三重过滤：`getMessageText()` + `shouldShowMessage()` + `getSafeAssistantContent()`
- 支持：字符串格式、数组格式、对象格式
- 支持：`tool_result`、`tool_use`、`tool_use_id` 三种关键词检测

**手机端** (`EnhancedMessageBubble.kt` L392-L413)：
- 仅 `filterToolResultContent()` 单层过滤
- 仅检测字符串格式（`startsWith("[")` 或 `startsWith("{")`）
- ❌ **不处理 Anthropic API 数组格式的 content**
- ❌ **不检测 `tool_use_id` 关键词**
- ❌ **没有 `shouldShowMessage()` 等价逻辑——tool_result 类型的用户消息可能被显示**

### 🟡 差异6：缺少 Agent 工作流状态管理

**Web 端**：
- 独立的 `agent.ts` Store，管理 Agent 执行状态
- 支持 `agent_tool_call` / `agent_tool_result` 事件
- 工作流步骤追踪

**手机端**：
- ❌ **没有独立的 Agent 状态管理**
- 仅在 `ChatViewModel` 中用 `ExecutionStatus` 简单跟踪
- ❌ **不支持 `agent_tool_call` / `agent_tool_result` 事件**

### 🟡 差异7：WebSocket 事件处理差异

**Web 端** (`useWebSocket.ts`)：
- 处理 `tool_use`、`tool_start`、`tool_end`、`tool_error`、`tool_progress`、`tool_use_end` 6种事件
- `tool_use` 事件中直接包含 `input` 数据

**手机端** (`WebSocketManager.kt`)：
- 处理 `tool_use`、`tool_input_delta`、`tool_start`、`tool_end`、`tool_error` 5种事件
- ❌ **不支持 `tool_progress` 事件**
- ❌ **不支持 `tool_use_end` 事件**
- `tool_use` 事件中不包含 `input`（需要通过 `tool_input_delta` 累积）

### 🟡 差异8：工具输出格式处理差异

**Web 端** (`useWebSocket.ts` L700-L737)：
- `tool_end` 事件中，对 result 做格式化：
  - 对象类型 → 直接赋值
  - 其他类型 → 包装为 `{ value: raw }`

**手机端** (`ChatViewModel.kt` L237-L254)：
- `tool_end` 事件中，直接赋值 `event.result`（类型为 `Any?`）
- ❌ **不做格式化处理，可能导致 UI 层解析失败**

---

## 三、修复计划

### 步骤1：增强 MessageContentParser.kt
- 补充对象格式 content 的处理
- 补充嵌套 content 属性的递归处理
- 增强 tool_result 解析，支持 Git/搜索/文件内容/错误等格式
- 修复 parseToolInput 保留原始类型信息

### 步骤2：增强 filterToolResultContent 逻辑
- 添加 Anthropic API 数组格式 content 的过滤
- 添加 `tool_use_id` 关键词检测
- 添加 `shouldShowMessage()` 等价逻辑，过滤 tool_result 用户消息

### 步骤3：修复消息-工具调用关联逻辑
- 修复 `streamingMessageId` 为 null 时工具调用无法关联的问题
- 改进 `rebuildMessageToolCallMapping()` 的关联算法

### 步骤4：增强 WebSocket 事件处理
- 添加 `tool_progress` 事件支持
- 添加 `tool_use_end` 事件支持
- 规范化 tool_end 事件的 result 格式

### 步骤5：添加工具深度解析器（对标 Web 端 toolParser.ts）
- 创建 `ToolParser.kt`，实现按工具类型分类的参数解析
- 实现工具输出解析器
- 实现知识提取逻辑

### 步骤6：增强 ToolCallCard.kt 展示
- 对标 Web 端的 ToolUseEnhanced / ToolResultEnhanced 组件
- 支持更多工具类型的专用展示

---

## 四、优先级排序

| 优先级 | 修复项 | 影响范围 |
|--------|--------|---------|
| P0 | 增强 tool_result 解析 | 工具结果无法正确显示 |
| P0 | 增强 filterToolResultContent | tool_result JSON 泄露到用户界面 |
| P0 | 修复消息-工具关联 | 工具调用不显示在对应消息下 |
| P1 | 增强 MessageContentParser | 混合格式消息无法解析 |
| P1 | 规范化 tool_end result 格式 | 工具输出 UI 解析失败 |
| P2 | 添加 tool_progress 事件 | 缺少执行进度反馈 |
| P2 | 创建 ToolParser.kt | 缺少深度解析能力 |
| P3 | 增强 ToolCallCard 展示 | 展示效果不如 Web 端 |
