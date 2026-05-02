# 修复安卓 App 未优先从本地数据库加载聊天会话内容的问题

## 问题分析

经过完整代码审查，发现 `ChatViewModel.loadSession()` 存在以下关键问题：

### 核心问题：本地数据加载后 UI 状态仍为 Loading

`loadSession()` 的执行流程：

```
1. clearInternalState(); _uiState = Loading          ← 进入 Loading 状态
2. getLatestMessages(sessionId)                       ← 从本地 DB 快速加载消息
3. _messages.addAll(本地消息); updateDisplayMessages() ← 消息已加载到内存
4. _uiState 仍然是 Loading!!!                         ← ❌ 问题所在
5. getSessionDetail(sessionId).collect { ... }        ← 等待网络请求完成
6. _uiState = Success                                 ← 直到网络返回才变成 Success
```

**问题**：步骤 3 已经将本地消息加载到 `_displayMessages`，但步骤 4 没有将 `_uiState` 设为 `Success`。UI 层虽然会显示 `displayMessages` 中的消息（因为 Compose 会追踪 `mutableStateListOf` 的变化），但：

- **"Agent 思考中..." 加载指示器**会追加显示在消息列表底部（因为 `uiState == Loading`）
- **输入框被禁用**（`enabled = uiState !is UiState.Loading`）
- 用户看到旧消息却无法操作，体验很差

### 次要问题

1. **`getSessionDetail()` 始终发起网络请求** — 没有缓存新鲜度检查，即使本地缓存刚更新过也会重新请求
2. **冗余数据加载** — `getLatestMessages()` 和 `getSessionDetail()` 都从本地 DB 读取相同的消息数据
3. **`restoreSessionFromLocalStore()` 只恢复 sessionId** — 不加载实际数据，用户打开 App 后仍需等待网络

## 修复计划

### 步骤 1：修改 `ChatViewModel.loadSession()` — 本地数据加载后立即切换 UI 状态

**文件**：[ChatViewModel.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModel.kt)

**修改内容**：

在 `getLatestMessages()` 返回本地数据后，立即将 `_uiState` 设为 `Success`，让用户可以立即看到消息并操作输入框。然后将 `getSessionDetail()` 改为后台静默更新，不阻塞 UI。

```kotlin
fun loadSession(sessionId: String, forceRefresh: Boolean = false) {
    viewModelScope.launch {
        try {
            currentSessionId = sessionId; saveSessionToLocalStore(sessionId)
            clearInternalState(); _uiState.value = UiState.Loading

            loadTasksFromDatabase(sessionId)

            val latestResult = cachedChatRepository.getLatestMessages(sessionId)
            when (latestResult) {
                is CachedChatRepository.Result.Success -> {
                    _messages.addAll(latestResult.data.map { it.copy(isStreaming = false) })
                    updateDisplayMessages()
                    totalMessageCount = cachedChatRepository.getMessageCount(sessionId)
                    hasMoreHistory = _messages.size < totalMessageCount

                    // ✅ 新增：本地数据加载后立即切换为 Success，用户可立即交互
                    _uiState.value = UiState.Success(
                        messages = _messages.toList(),
                        toolCalls = _toolCalls.toList(),
                        executionStatus = null
                    )

                    // 后台静默获取完整会话详情（含工具调用），不阻塞 UI
                    launch {
                        cachedChatRepository.getSessionDetail(sessionId, forceRefresh).collect { result ->
                            when (result) {
                                is CachedChatRepository.Result.Loading -> {}
                                is CachedChatRepository.Result.Success -> {
                                    _toolCalls.clear(); _toolCalls.addAll(result.data.toolCalls)
                                    rebuildMessageToolCallMapping(); updateMessageToolCallMap()
                                    if (result.data.messages.size > totalMessageCount) {
                                        totalMessageCount = result.data.messages.size
                                        hasMoreHistory = _messages.size < totalMessageCount
                                    }
                                    _uiState.value = UiState.Success(
                                        messages = _messages.toList(),
                                        toolCalls = _toolCalls.toList(),
                                        executionStatus = null
                                    )
                                }
                                is CachedChatRepository.Result.Error -> {
                                    // 本地数据已显示，网络失败不影响 UI
                                    // 仅在无本地数据时才显示错误
                                    if (_messages.isEmpty()) {
                                        _uiState.value = UiState.Error(result.message)
                                    }
                                }
                            }
                        }
                    }
                }
                is CachedChatRepository.Result.Error -> loadSessionFallback(sessionId, forceRefresh)
                is CachedChatRepository.Result.Loading -> {}
            }
        } catch (e: Exception) { _uiState.value = UiState.Error(e.message ?: "加载失败") }
    }
}
```

**关键变化**：
- `getLatestMessages()` 成功后立即设置 `_uiState = Success`
- `getSessionDetail()` 改用 `launch {}` 在后台协程执行，不再阻塞主流程
- 网络失败时如果本地已有数据则静默忽略

### 步骤 2：修改 `CachedChatRepository.getSessionDetail()` — 添加缓存新鲜度检查

**文件**：[CachedChatRepository.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/data/repository/CachedChatRepository.kt)

**修改内容**：

在 `getSessionDetail()` 中添加缓存新鲜度检查，如果缓存足够新鲜（在 `MIN_CACHE_AGE_MS` 内），跳过网络请求。

```kotlin
fun getSessionDetail(sessionId: String, forceRefresh: Boolean = false): Flow<Result<SessionDetail>> = flow {
    emit(Result.Loading)

    try {
        sessionDao.updateLastAccessedAt(sessionId, System.currentTimeMillis())

        val localSession = sessionDao.getSessionById(sessionId)
        val localMessages = messageDao.getMessagesBySessionOnce(sessionId)
        val localToolCalls = toolCallDao.getToolCallsBySessionOnce(sessionId)

        if (localSession != null && localMessages.isNotEmpty() && !forceRefresh) {
            val cachedDetail = SessionDetail(
                session = localSession.toSession(),
                messages = localMessages.toMessages(),
                toolCalls = localToolCalls.toToolCalls()
            )
            emit(Result.Success(cachedDetail))

            // ✅ 新增：检查缓存新鲜度，如果足够新鲜则跳过网络请求
            val cacheAge = System.currentTimeMillis() - localSession.cachedAt
            if (cacheAge < MIN_CACHE_AGE_MS) {
                Logger.d(TAG, "缓存新鲜（${cacheAge}ms），跳过网络请求: sessionId=$sessionId")
                return@flow
            }
        }

        val remoteDetail = fetchSessionDetailFromNetwork(sessionId)
        // ... 后续逻辑不变
    }
}
```

### 步骤 3：修改 `ChatViewModel.restoreSessionFromLocalStore()` — 恢复时自动加载本地数据

**文件**：[ChatViewModel.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModel.kt)

**修改内容**：

在恢复 sessionId 后，立即从本地数据库加载消息数据，实现真正的"打开即看"体验。

```kotlin
private fun restoreSessionFromLocalStore() {
    viewModelScope.launch {
        sessionLocalStore?.let { store ->
            val savedSessionId = store.getSessionIdSync()
            if (!savedSessionId.isNullOrBlank()) {
                android.util.Log.d(TAG, "从本地存储恢复会话: $savedSessionId")
                currentSessionId = savedSessionId
                // ✅ 新增：立即从本地数据库加载消息，无需等待网络
                loadSession(savedSessionId)
            }
        }
    }
}
```

### 步骤 4：修改 `loadSessionFallback()` — 同样支持本地优先

**文件**：[ChatViewModel.kt](file:///d:/Users/Administrator/AistudyProject/claw-web/chat_application/app/src/main/java/com/example/claw_code_application/viewmodel/ChatViewModel.kt)

**修改内容**：

在 fallback 路径中，如果 `getSessionDetail()` 返回了缓存数据（第一次 emit），也立即切换 UI 状态。

```kotlin
private suspend fun loadSessionFallback(sessionId: String, forceRefresh: Boolean) {
    cachedChatRepository.getSessionDetail(sessionId, forceRefresh).collect { result ->
        when (result) {
            is CachedChatRepository.Result.Loading -> {}
            is CachedChatRepository.Result.Success -> {
                _messages.clear(); _messages.addAll(result.data.messages.map { it.copy(isStreaming = false) })
                _toolCalls.clear(); _toolCalls.addAll(result.data.toolCalls)
                rebuildMessageToolCallMapping(); updateMessageToolCallMap(); updateDisplayMessages()
                totalMessageCount = result.data.messages.size; hasMoreHistory = false
                _uiState.value = UiState.Success(messages = _messages.toList(), toolCalls = _toolCalls.toList(), executionStatus = null)
            }
            is CachedChatRepository.Result.Error -> _uiState.value = UiState.Error(result.message)
        }
    }
}
```

（此方法逻辑不变，但配合步骤 2 的缓存新鲜度检查，fallback 路径也会优先使用本地缓存）

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `ChatViewModel.kt` | 1. `loadSession()` 本地数据加载后立即设 Success；2. `getSessionDetail()` 改后台协程；3. `restoreSessionFromLocalStore()` 恢复时自动加载 |
| `CachedChatRepository.kt` | `getSessionDetail()` 添加缓存新鲜度检查，新鲜缓存跳过网络请求 |

## 预期效果

| 场景 | 修改前 | 修改后 |
|------|--------|--------|
| 打开已有会话（有本地缓存） | 显示消息 + "Agent思考中..." + 输入框禁用，等网络返回后才可操作 | 立即显示消息 + 输入框可用，后台静默更新 |
| 打开已有会话（缓存新鲜 <1min） | 仍然发起网络请求 | 跳过网络请求，直接使用缓存 |
| 打开已有会话（无本地缓存） | 显示加载指示器，等网络返回 | 同修改前（无缓存只能等网络） |
| App 冷启动恢复会话 | 只恢复 sessionId，不加载消息 | 恢复 sessionId 并立即从本地 DB 加载消息 |
