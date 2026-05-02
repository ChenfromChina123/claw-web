# Agent 任务创建 UI 同步与层级展示实施计划

## 一、现状分析

### 1.1 服务端现状
- `BackgroundTaskManager` 在任务状态变更时发出 EventEmitter 事件（`task_created`、`task_started`、`task_completed` 等）
- **关键缺陷**：这些事件没有被桥接到 WebSocket 推送通道。主 WebSocket 通道只推送 `message_*`、`tool_*`、`conversation_end` 等事件
- `WorkflowEventService` 通过 `httpServer.ts` 广播 `workflow_event`，但 Android 端未监听

### 1.2 Web 前端现状
- Agent Store 监听了 `task_status_changed`、`workflow_event`、`agent_event` 三个事件
- 有完整的任务监控组件：`AgentTaskMonitorPanel`（全局悬浮）、`BackgroundTasksPanel`（侧边栏）、`TaskPipeline`（流水线）
- 聊天界面中的工具调用以独立卡片形式展示，**没有**任务级别的容器包裹

### 1.3 Android 端现状
- **完全缺失** `task_status_changed`、`workflow_event`、`agent_event` 三个事件的处理
- `WebSocketManager.handleEvent()` 的 `else` 分支静默丢弃未知事件
- `AgentTaskCard` 组件仅用于展示活跃工具调用步骤，不是任务级别的容器
- 没有后台任务数据模型、没有任务状态管理

### 1.4 数据流缺口
```
服务端 BackgroundTaskManager.emit('task_created')
    ↓ (缺失！没有桥接到 WebSocket)
    ✗ Android 端收不到任何任务事件
```

---

## 二、实施步骤

### 步骤 1：服务端 - 桥接任务事件到 WebSocket 推送

**目标**：当 `BackgroundTaskManager` 发出任务事件时，自动通过 WebSocket 推送 `task_status_changed` 事件到前端。

**修改文件**：
- `server/src/master/services/conversation/sessionConversationManager.ts` — 在 `processMessage` 流程中，监听 `BackgroundTaskManager` 事件并转发
- `server/src/shared/types/index.ts` — 在 `WebSocketEventType` 中添加 `task_status_changed`
- `server/src/shared/constants/index.ts` — 在 `WS_MESSAGE_TYPES` 中添加 `task_status_changed`

**具体实现**：
1. 在 `WebSocketEventType` 中添加 `'task_status_changed'`
2. 在 `sessionConversationManager.processMessage()` 中，获取 `BackgroundTaskManager` 实例并监听其事件
3. 当收到 `task_created`/`task_started`/`task_completed`/`task_failed`/`task_cancelled` 事件时，调用 `sendEvent('task_status_changed', payload)` 推送到前端
4. Payload 格式与 Web 前端 `TaskStatusChangePayload` 对齐：
   ```typescript
   {
     taskId: string
     taskName: string
     previousStatus: string
     newStatus: string
     result?: unknown
     error?: string
     traceId?: string
   }
   ```

**验证**：启动开发环境，发送消息触发 Agent 创建任务，确认 WebSocket 客户端收到 `task_status_changed` 事件。

---

### 步骤 2：Android 端 - 添加任务数据模型

**目标**：定义 Android 端的后台任务数据模型，与服务端对齐。

**修改文件**：
- `chat_application/app/src/main/java/com/example/claw_code_application/data/api/models/ToolModels.kt` — 添加 `BackgroundTask` 数据类

**具体实现**：
```kotlin
@Immutable
@Serializable
data class BackgroundTask(
    val taskId: String,
    val taskName: String,
    val description: String = "",
    val status: String,        // created/queued/running/completed/failed/cancelled
    val priority: String = "normal",
    val progress: Int = 0,
    val result: String? = null,
    val error: String? = null,
    val parentTaskId: String? = null,
    val agentId: String? = null,
    val createdAt: Long = 0L,
    val startedAt: Long? = null,
    val completedAt: Long? = null
)

@Serializable
data class TaskStatusChangePayload(
    val taskId: String,
    val taskName: String,
    val previousStatus: String,
    val newStatus: String,
    val result: String? = null,
    val error: String? = null,
    val traceId: String? = null
)
```

**验证**：编译通过。

---

### 步骤 3：Android 端 - 扩展 WebSocket 事件类型

**目标**：在 `WebSocketManager` 中添加 `task_status_changed` 事件的解析。

**修改文件**：
- `chat_application/app/src/main/java/com/example/claw_code_application/data/websocket/WebSocketManager.kt` — 在 `WebSocketEvent` sealed class 中添加新事件类型，在 `handleEvent()` 中添加解析逻辑

**具体实现**：
1. 在 `WebSocketEvent` sealed class 中添加：
   ```kotlin
   data class TaskStatusChanged(val payload: TaskStatusChangePayload) : WebSocketEvent()
   ```
2. 在 `handleEvent()` 的 `when` 分支中添加：
   ```kotlin
   "task_status_changed" -> {
       try {
           val payload = json.decodeFromJsonElement(TaskStatusChangePayload.serializer(), data)
           WebSocketEvent.TaskStatusChanged(payload)
       } catch (e: Exception) {
           Log.e(TAG, "Failed to parse task_status_changed: ${e.message}")
           return
       }
   }
   ```

**验证**：编译通过。

---

### 步骤 4：Android 端 - ViewModel 处理任务事件

**目标**：在 `ChatViewModel` 中维护任务列表状态，处理 `task_status_changed` 事件。

**修改文件**：
- `chat_application/app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModel.kt` — 添加任务状态管理
- `chat_application/app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModelWsExt.kt` — 添加任务事件处理函数

**具体实现**：
1. 在 `ChatViewModel` 中添加：
   ```kotlin
   val _tasks = mutableListOf<BackgroundTask>()
   val tasks: List<BackgroundTask> get() = _tasks.toList()

   fun getTaskForToolCall(toolCallId: String): BackgroundTask? {
       // 根据 toolCall 的创建时间匹配最近的活动任务
   }
   ```
2. 在 `ChatViewModelWsExt.kt` 中添加：
   ```kotlin
   is WebSocketManager.WebSocketEvent.TaskStatusChanged -> handleTaskStatusChanged(event)

   private fun ChatViewModel.handleTaskStatusChanged(event: ...) {
       val existingIndex = _tasks.indexOfFirst { it.taskId == event.payload.taskId }
       val task = if (existingIndex != -1) {
           _tasks[existingIndex].copy(
               status = event.payload.newStatus,
               ...
           )
       } else {
           BackgroundTask(
               taskId = event.payload.taskId,
               taskName = event.payload.taskName,
               status = event.payload.newStatus,
               ...
           )
       }
       if (existingIndex != -1) _tasks[existingIndex] = task else _tasks.add(task)
       updateDisplayMessages()
   }
   ```
3. 建立工具调用与任务的关联：当 `tool_start` 事件发生时，将当前工具调用关联到最近的活动任务

**验证**：发送消息触发 Agent，确认任务列表正确更新。

---

### 步骤 5：Android 端 - 创建 TaskContainerCard 组件

**目标**：创建任务容器组件，作为任务标题和内部操作内容的包裹器，实现层级缩进。

**新建文件**：
- `chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/components/TaskContainerCard.kt`

**具体实现**：
1. 组件参数：
   ```kotlin
   @Composable
   fun TaskContainerCard(
       task: BackgroundTask,
       isCollapsed: Boolean,
       onCollapsedChange: (Boolean) -> Unit,
       content: @Composable () -> Unit
   )
   ```
2. 布局结构：
   ```
   Card (圆角12dp, 左侧3dp主题色竖线)
   ├── Row (任务标题行)
   │   ├── 状态图标 (✦ 进行中 / ✓ 已完成 / ✗ 失败)
   │   ├── 任务名称 (Text, 加粗)
   │   ├── 状态标签 (进行中/已完成/失败, 带颜色)
   │   └── 展开/收起箭头
   └── AnimatedVisibility (展开区域)
       └── Column (paddingStart = 24.dp) ← 层级缩进
           └── content() ← 内部工具调用卡片
   ```
3. 视觉缩进：任务内容区域左侧 padding 24dp，形成 IDE 风格的层级缩进
4. 状态颜色映射：
   - `created`/`queued`/`running` → 蓝色主题
   - `completed` → 绿色
   - `failed` → 红色
   - `cancelled` → 灰色
5. 完成状态自动折叠逻辑（在步骤 6 中实现）

**验证**：组件预览正常。

---

### 步骤 6：Android 端 - 修改 ChatScreen 集成任务容器

**目标**：修改聊天消息列表，将工具调用包裹在任务容器中，实现操作上下文包含和层级缩进。

**修改文件**：
- `chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/ChatScreen.kt` — 修改 `ChatMessageList` 的渲染逻辑

**具体实现**：
1. 修改消息列表渲染逻辑：当存在活动任务时，将工具调用按任务分组
2. 渲染结构变更：
   ```
   之前：
   LazyColumn
   ├── Message 1
   ├── Message 2
   └── AgentTaskCard (所有活跃工具调用)

   之后：
   LazyColumn
   ├── Message 1 (用户消息)
   ├── Message 2 (AI消息文本)
   ├── TaskContainerCard (任务1)
   │   ├── 任务标题行
   │   └── [缩进] CompactToolCallCard (工具1)
   │   └── [缩进] CompactToolCallCard (工具2)
   ├── TaskContainerCard (任务2)
   │   ├── 任务标题行
   │   └── [缩进] CompactToolCallCard (工具3)
   └── ...
   ```
3. 自动折叠逻辑：
   - 维护 `collapsedTasks` 状态：`Map<String, Boolean>`
   - 当任务状态变为 `completed` 时，自动设置 `collapsedTasks[taskId] = true`
   - 折叠动画使用 `AnimatedVisibility` + `animateContentSize()`
4. 工具调用与任务的关联策略：
   - 方案A（简单）：按时间窗口关联 — 工具调用创建时间在任务 `startedAt` 之后且在任务 `completedAt` 之前
   - 方案B（精确）：在 `task_status_changed` 事件中包含关联的工具调用 ID
   - **选择方案A**，因为服务端 `BackgroundTaskManager` 事件中不包含工具调用 ID，避免修改服务端协议

**验证**：发送消息触发 Agent 创建任务，确认任务容器正确显示，工具调用在容器内部缩进展示。

---

### 步骤 7：Android 端 - 处理无任务场景的兼容

**目标**：确保没有任务事件时，聊天界面保持原有行为。

**修改文件**：
- `chat_application/app/src/main/java/com/example/claw_code_application/ui/chat/ChatScreen.kt`

**具体实现**：
1. 当 `_tasks` 为空时，保持原有的 `AgentTaskCard` 渲染逻辑
2. 当 `_tasks` 非空时，使用新的 `TaskContainerCard` 渲染逻辑
3. 对于不属于任何任务的工具调用，仍然在消息气泡下方独立显示

**验证**：在无任务创建的场景下，聊天界面行为不变。

---

### 步骤 8：端到端测试与验证

**目标**：验证完整的功能链路。

**测试场景**：
1. 发送消息触发 Agent 创建任务 → Android 端实时显示任务容器
2. Agent 执行工具调用 → 工具调用在任务容器内缩进展示
3. Agent 完成任务 → 任务容器自动折叠
4. 多个任务并行 → 多个任务容器独立显示
5. 无任务场景 → 界面保持原有行为

---

## 三、文件修改清单

| 序号 | 文件路径 | 修改类型 | 说明 |
|------|---------|---------|------|
| 1 | `server/src/shared/types/index.ts` | 修改 | 添加 `task_status_changed` 事件类型 |
| 2 | `server/src/shared/constants/index.ts` | 修改 | 添加 `TASK_STATUS_CHANGED` 常量 |
| 3 | `server/src/master/services/conversation/sessionConversationManager.ts` | 修改 | 桥接 BackgroundTaskManager 事件到 WebSocket |
| 4 | `chat_application/.../data/api/models/ToolModels.kt` | 修改 | 添加 BackgroundTask、TaskStatusChangePayload 数据类 |
| 5 | `chat_application/.../data/websocket/WebSocketManager.kt` | 修改 | 添加 TaskStatusChanged 事件类型和解析 |
| 6 | `chat_application/.../viewmodel/ChatViewModel.kt` | 修改 | 添加任务状态管理 |
| 7 | `chat_application/.../viewmodel/ChatViewModelWsExt.kt` | 修改 | 添加 handleTaskStatusChanged 处理函数 |
| 8 | `chat_application/.../ui/chat/components/TaskContainerCard.kt` | **新建** | 任务容器组件（含层级缩进、自动折叠） |
| 9 | `chat_application/.../ui/chat/ChatScreen.kt` | 修改 | 集成任务容器到消息列表 |

---

## 四、架构决策记录

### D1: 为什么选择方案A（时间窗口关联）而非方案B（精确关联）？
- 服务端 `BackgroundTaskManager` 事件不包含工具调用 ID
- 修改服务端协议需要改动较多代码（BackgroundTaskManager → runAgent → toolExecutor 链路）
- 时间窗口关联在大多数场景下足够准确（一个任务内的工具调用通常是连续的）
- 后续可迭代升级为精确关联

### D2: 为什么不直接复用 AgentTaskCard？
- `AgentTaskCard` 是步骤列表组件，不支持包裹子内容
- 需要一个新的容器组件来支持 `content: @Composable () -> Unit` 模式
- `AgentTaskCard` 可以在任务容器内部继续使用，显示任务步骤

### D3: 自动折叠的时机
- 任务状态变为 `completed` 时自动折叠
- 用户可以手动展开查看历史操作
- `failed` 状态不自动折叠，让用户查看错误详情
