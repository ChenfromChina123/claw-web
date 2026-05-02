# Chat Application 性能优化计划

## 问题概述

当前聊天应用存在多个性能瓶颈，按严重级别分类如下：

### P0 级问题（严重影响性能）

1. **流式事件通道设计有丢事件风险**
   - 当前使用 `StateFlow<WebSocketEvent?>` 承载事件流
   - StateFlow 会合并状态/覆盖旧值，高频 delta 下可能掉帧或丢片段
   - 位置：`WebSocketManager.incomingMessages` 与 `handleEvent emit`

2. **流式更新触发列表全量重建**
   - 每次 token 更新都会复制 `_displayMessages` 再 `clear/addAll`
   - 导致频繁重组与测量
   - 位置：`ChatViewModel.updateStreamingMessage`

### P1 级问题（明显性能损耗）

3. **字符串拼接为 O(n²)**
   - 流式文本每个增量都 `old + delta`
   - 长回答时 CPU/GC 压力明显
   - 位置：`ChatViewModelWsExt.handleMessageDelta`

4. **UI 状态频繁全量复制**
   - `emitUiStateUpdate()` 每次都复制全部消息和工具调用列表
   - 流式/工具高频场景下开销大
   - 位置：`ChatViewModel.emitUiStateUpdate`

5. **任务区存在重复全表扫描**
   - `TaskStatusBar` 每次重组都对 `toolCalls` 做 `filter`（按任务重复）
   - 复杂度约 O(tasks * toolCalls)
   - 位置：`ChatScreen.kt` 中的 `TaskStatusBar` filter

6. **数据库有明显 N+1 查询**
   - `needsFullSync()` 对每个会话单独 `COUNT`
   - `syncAllChatData()` 同步时也逐会话先查计数再拉详情
   - 位置：`CachedChatRepository.needsFullSync` 与 `syncAllChatData`

7. **会话详情加载偏全量回写**
   - 即使有缓存也会取全量详情并整批 REPLACE 写入
   - 消息多时 I/O 抖动明显
   - 位置：`CachedChatRepository.getSessionDetail`

### P2 级问题（可优化项）

8. **索引缺口**
   - `tool_calls/background_tasks` 有按 `cachedAt` 清理语句但无对应索引
   - 数据量大时会全表扫描
   - 位置：`ToolCallEntity` 与 `TaskEntity` indices

9. **timestamp 用字符串存储**
   - 排序/比较依赖文本语义
   - 长期不利于查询优化与演进
   - 位置：`MessageEntity`

---

## 业界主流做法

| 层级 | 当前做法 | 业界主流做法 |
|------|----------|--------------|
| 流式事件层 | WebSocket -> StateFlow | WebSocket -> SharedFlow/Channel(有缓冲) -> Reducer |
| 文本渲染层 | token 级提交 UI | 按消息维度维护增量缓冲（StringBuilder），以 16~33ms 帧节流提交 |
| 列表层 | clear/addAll 全量重建 | 只更新变更的 item 状态，使用 derivedStateOf/remember 做映射缓存 |
| 数据层 | 全量同步、N+1 查询 | 首屏分页（Paging3）+ 增量同步（since cursor）+ 批量事务 + 必要索引 |
| 冷启动同步 | 全量阻塞式同步 | 先最小可用数据（会话+最后 N 条），后台补历史 |

---

## 修复计划（按优先级排序）

### 第一步：事件总线改造 + 流式文本缓冲（预计 1 天）

#### 1.1 将 StateFlow 改为 SharedFlow
**文件**: `WebSocketManager.kt`

**修改内容**:
```kotlin
// 修改前
private val _incomingMessages = MutableStateFlow<WebSocketEvent?>(null)
val incomingMessages: StateFlow<WebSocketEvent?> = _incomingMessages.asStateFlow()

// 修改后
private val _incomingMessages = MutableSharedFlow<WebSocketEvent>(
    extraBufferCapacity = 64,  // 缓冲 64 个事件
    onBufferOverflow = BufferOverflow.DROP_OLDEST  // 溢出时丢弃最旧的
)
val incomingMessages: SharedFlow<WebSocketEvent> = _incomingMessages.asSharedFlow()
```

**emit 方式变更**:
```kotlin
// 修改前
_incomingMessages.value = webSocketEvent

// 修改后
_incomingMessages.tryEmit(webSocketEvent)
```

#### 1.2 流式文本增量缓冲 + 帧节流
**文件**: `ChatViewModel.kt` 和 `ChatViewModelWsExt.kt`

**修改内容**:
1. 为每条流式消息维护 `StringBuilder` 缓冲
2. 使用 `MutableSharedFlow` 或 `Channel` 收集 delta
3. 以 16~33ms 帧率节流提交 UI

```kotlin
// ChatViewModel 新增
internal val messageContentBuffers = mutableMapOf<String, StringBuilder>()
internal val messageUpdateFlow = MutableSharedFlow<String>(extraBufferCapacity = 16)

// 帧节流协程
init {
    viewModelScope.launch {
        messageUpdateFlow
            .sample(16L)  // 16ms 节流，约 60fps
            .collect { messageId ->
                updateStreamingMessage(messageId)
            }
    }
}
```

### 第二步：移除列表全量重建（预计 1 天）

#### 2.1 优化 updateStreamingMessage
**文件**: `ChatViewModel.kt`

**修改内容**:
```kotlin
// 修改前：全量重建
internal fun updateStreamingMessage(messageId: String) {
    val message = _messages.find { it.id == messageId } ?: return
    if (!shouldShowMessage(message)) return
    val displayIndex = _displayMessages.indexOfFirst { it.id == messageId }
    if (displayIndex != -1) {
        val newList = _displayMessages.toMutableList()
        newList[displayIndex] = message
        _displayMessages.clear()
        _displayMessages.addAll(newList)
    }
}

// 修改后：局部更新
internal fun updateStreamingMessage(messageId: String) {
    val message = _messages.find { it.id == messageId } ?: return
    if (!shouldShowMessage(message)) return
    val displayIndex = _displayMessages.indexOfFirst { it.id == messageId }
    if (displayIndex != -1) {
        // 直接修改，Compose 通过 key 识别变化
        _displayMessages[displayIndex] = message
    }
}
```

#### 2.2 使用 SnapshotStateList 的优化特性
确保使用 `mutableStateListOf` 并配合 `key` 使用:

```kotlin
// ChatScreen.kt 中
items(
    items = displayMessages,
    key = { message -> message.id }
) { message ->
    // 内容
}
```

### 第三步：重构任务区工具调用关联（预计 1 天）

#### 3.1 预构建 taskId -> toolCalls 映射并缓存
**文件**: `ChatViewModel.kt`

**修改内容**:
```kotlin
// 新增缓存
internal val taskToolCallCache = mutableStateMapOf<String, List<ToolCall>>()

// 当 toolCalls 变化时更新缓存
internal fun rebuildTaskToolCallCache() {
    taskToolCallCache.clear()
    _tasks.forEach { task ->
        taskToolCallCache[task.taskId] = _toolCalls.filter { 
            isToolCallInTask(it, task) 
        }
    }
}

// 提供获取方法
fun getToolCallsForTask(taskId: String): List<ToolCall> {
    return taskToolCallCache[taskId] ?: emptyList()
}
```

#### 3.2 TaskStatusBar 使用缓存数据
**文件**: `ChatScreen.kt`

**修改内容**:
```kotlin
// 修改前：每次重组都 filter
val taskToolCalls = viewModel.toolCalls.filter { toolCall ->
    isToolCallInTask(toolCall, task)
}

// 修改后：使用缓存
val taskToolCalls = viewModel.getToolCallsForTask(task.taskId)
```

### 第四步：修复数据库 N+1 问题（预计 1~2 天）

#### 4.1 批量统计查询
**文件**: `SessionDao.kt`

**新增查询**:
```kotlin
@Query("""
    SELECT s.id, COUNT(m.id) as messageCount 
    FROM sessions s 
    LEFT JOIN messages m ON s.id = m.sessionId 
    GROUP BY s.id
""")
suspend fun getSessionMessageCounts(): Map<String, Int>
```

#### 4.2 优化 needsFullSync
**文件**: `CachedChatRepository.kt`

**修改内容**:
```kotlin
// 修改前：逐个会话 COUNT
suspend fun needsFullSync(): Boolean = withContext(Dispatchers.IO) {
    val localSessionCount = sessionDao.getSessionCount()
    if (localSessionCount == 0) return@withContext true

    val sessionsWithMessages = sessionDao.getAllSessionsOnce()
    for (session in sessionsWithMessages) {
        val msgCount = messageDao.getMessageCount(session.id)
        if (msgCount == 0) return@withContext true
    }
    false
}

// 修改后：批量查询
suspend fun needsFullSync(): Boolean = withContext(Dispatchers.IO) {
    val localSessionCount = sessionDao.getSessionCount()
    if (localSessionCount == 0) return@withContext true

    val messageCounts = sessionDao.getSessionMessageCounts()
    messageCounts.any { it.value == 0 }
}
```

#### 4.3 增量同步策略
**文件**: `CachedChatRepository.kt`

**新增方法**:
```kotlin
/**
 * 增量同步会话消息（基于最后更新时间）
 */
suspend fun syncMessagesSince(
    sessionId: String,
    lastSyncTimestamp: Long
): Result<List<Message>> = withContext(Dispatchers.IO) {
    try {
        // 调用后端增量同步 API
        val response = apiService.getMessagesSince(sessionId, lastSyncTimestamp)
        if (response.isSuccessful) {
            val newMessages = response.body()?.data ?: emptyList()
            // 只插入新消息，不删除旧消息
            messageDao.insertMessages(newMessages.toMessageEntities(sessionId))
            Result.Success(newMessages)
        } else {
            Result.Error("同步失败: ${response.code()}")
        }
    } catch (e: Exception) {
        Result.Error(e.message ?: "同步失败", e)
    }
}
```

### 第五步：数据库索引优化（预计 0.5 天）

#### 5.1 添加 cachedAt 索引
**文件**: `ToolCallEntity.kt`

**修改内容**:
```kotlin
@Entity(
    tableName = "tool_calls",
    foreignKeys = [...],
    indices = [
        Index(value = ["sessionId"]),
        Index(value = ["messageId"]),
        Index(value = ["cachedAt"])  // 新增：支持按时间清理
    ]
)
```

**文件**: `TaskEntity.kt`

**修改内容**:
```kotlin
@Entity(
    tableName = "background_tasks",
    foreignKeys = [...],
    indices = [
        Index(value = ["sessionId"]),
        Index(value = ["status"]),
        Index(value = ["cachedAt"])  // 新增：支持按时间清理
    ]
)
```

#### 5.2 评估 timestamp 迁移到 Long
**文件**: `MessageEntity.kt`（需要确认是否存在）

**建议修改**:
```kotlin
// 修改前
val timestamp: String

// 修改后
val timestamp: Long
```

**注意**: 此修改涉及数据库迁移，需要创建 Migration。

---

## 实施顺序建议

```
第 1 天: 第一步（事件总线 + 流式缓冲）
        └─ 风险最高，收益最大
        
第 2 天: 第二步（列表局部更新）
        └─ 配合第一步，解决流式卡顿
        
第 3 天: 第三步（任务区优化）
        └─ 减少重组开销
        
第 4-5 天: 第四步（数据库 N+1 + 增量同步）
        └─ 数据层优化
        
第 6 天: 第五步（索引 + timestamp 迁移）
        └─ 数据库层优化
```

---

## 验证清单

- [ ] WebSocket 事件不再丢失，高频 delta 场景测试通过
- [ ] 流式输出流畅，无卡顿掉帧
- [ ] 长文本（>5000 字）流式输出 CPU 占用合理
- [ ] 任务区展开/折叠响应迅速
- [ ] 会话列表加载速度 < 1s（100+ 会话）
- [ ] 冷启动首屏加载速度 < 2s
- [ ] 数据库查询无 N+1 问题（通过日志验证）

---

## 风险提示

1. **StateFlow -> SharedFlow 变更**: 需要检查所有收集点，确保使用 `collect` 而非 `value`
2. **数据库迁移**: timestamp 字段类型变更需要 Migration，否则会导致用户数据丢失
3. **增量同步 API**: 需要后端支持 `since` 参数，如不支持需先协调后端开发
