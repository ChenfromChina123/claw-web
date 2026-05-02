package com.example.claw_code_application.viewmodel

import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.claw_code_application.data.api.models.*
import com.example.claw_code_application.data.local.PushMessageStore
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.local.SessionLocalStore
import com.example.claw_code_application.data.local.db.TaskDao
import com.example.claw_code_application.data.local.db.TaskEntity
import com.example.claw_code_application.data.local.db.toBackgroundTask
import com.example.claw_code_application.data.local.db.toTaskEntity
import com.example.claw_code_application.data.repository.CachedChatRepository
import com.example.claw_code_application.data.websocket.WebSocketManager
import com.example.claw_code_application.service.NotificationManager
import com.example.claw_code_application.ui.chat.components.shouldShowMessage
import com.example.claw_code_application.util.FileInfo
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.sample
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import java.util.UUID

class ChatViewModel(
    internal val cachedChatRepository: CachedChatRepository,
    internal val tokenManager: TokenManager,
    internal val webSocketManager: WebSocketManager = WebSocketManager(),
    internal val sessionLocalStore: SessionLocalStore? = null,
    internal val notificationManager: NotificationManager? = null,
    internal val pushMessageStore: PushMessageStore? = null,
    internal val taskDao: TaskDao? = null
) : ViewModel() {

    sealed class UiState {
        data object Idle : UiState()
        data object Loading : UiState()
        data class Success(
            val messages: List<Message>,
            val toolCalls: List<ToolCall>,
            val executionStatus: ExecutionStatus?
        ) : UiState()
        data class Error(val message: String) : UiState()
    }

    internal val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    var currentSessionId: String? = null
        private set

    var isLocalOnlySession: Boolean = false
        private set

    internal val _messages = mutableStateListOf<Message>()
    val messages: List<Message> = _messages

    internal val _displayMessages = mutableStateListOf<Message>()
    val displayMessages: List<Message> = _displayMessages

    var hasMoreHistory: Boolean = false
        internal set
    var isLoadingHistory: Boolean = false
        internal set
    internal var totalMessageCount: Int = 0

    internal val _toolCalls = mutableStateListOf<ToolCall>()
    val toolCalls: List<ToolCall> = _toolCalls

    internal val _tasks = mutableStateListOf<BackgroundTask>()
    val tasks: List<BackgroundTask> = _tasks

    internal val _collapsedTasks = mutableStateMapOf<String, Boolean>()
    val collapsedTasks: Map<String, Boolean> = _collapsedTasks

    internal val _messageToolCallMap = mutableStateMapOf<String, List<ToolCall>>()
    
    /**
     * 任务到工具调用的映射缓存
     * Key: taskId, Value: 该任务关联的工具调用列表
     * 避免 TaskStatusBar 每次重组都进行全表扫描
     */
    internal val _taskToolCallCache = mutableStateMapOf<String, List<ToolCall>>()
    
    /**
     * 获取指定任务关联的工具调用（使用缓存）
     */
    fun getToolCallsForTask(taskId: String): List<ToolCall> {
        return _taskToolCallCache[taskId] ?: emptyList()
    }
    
    /**
     * 重建任务-工具调用映射缓存
     * 在 toolCalls 或 tasks 变化时调用
     */
    internal fun rebuildTaskToolCallCache() {
        _taskToolCallCache.clear()
        _tasks.forEach { task ->
            _taskToolCallCache[task.taskId] = _toolCalls.filter { 
                isToolCallInTask(it, task) 
            }
        }
    }

    val connectionState = webSocketManager.connectionState

    var maxIterations: Int = 30
        private set

    fun setMaxIterations(value: Int) {
        maxIterations = value.coerceIn(1, 100)
    }

    /** 暴露viewModelScope供扩展函数使用 */
    internal val vmScope get() = viewModelScope

    internal val json = Json { ignoreUnknownKeys = true; isLenient = true }
    internal var streamingMessageId: String? = null
    
    /**
     * 流式消息内容缓冲 - 使用 StringBuilder 避免 O(n²) 字符串拼接
     * Key: messageId, Value: StringBuilder 缓冲
     */
    internal val messageContentBuffers = mutableMapOf<String, StringBuilder>()
    
    /**
     * 消息更新事件流 - 用于帧节流
     * extraBufferCapacity = 16: 缓冲 16 个更新事件
     * 默认策略 SUSPEND: 当缓冲区满时挂起
     */
    private val _messageUpdates = MutableSharedFlow<String>(
        extraBufferCapacity = 16
    )
    val messageUpdates: SharedFlow<String> = _messageUpdates.asSharedFlow()
    
    internal var debounceJob: Job? = null
    internal val debounceIntervalMs = 50L
    internal val pendingToolUpdates = mutableMapOf<String, ToolCall>()
    internal var toolUpdateDebounceJob: Job? = null
    // 优化：增加工具调用更新防抖间隔从100ms到300ms，减少UI刷新频率，避免与流式输出冲突
    internal val toolUpdateDebounceIntervalMs = 300L
    internal val pendingToolInput = mutableMapOf<String, StringBuilder>()
    internal val messageToToolCalls = mutableMapOf<String, MutableList<String>>()
    internal val unassociatedToolCallIds = mutableListOf<String>()
    internal var uiStateUpdateJob: Job? = null
    internal var currentThinkingBlockIndex: Int = -1
    internal var _thinkingContent: String = ""
    val thinkingContent: String get() = _thinkingContent
    
    /**
     * 帧节流任务 - 16ms 约等于 60fps
     */
    private var frameThrottleJob: Job? = null

    /** 获取指定消息关联的工具调用 */
    fun getToolCallsForMessage(messageId: String): List<ToolCall> {
        return _messageToolCallMap[messageId] ?: emptyList()
    }
    
    /**
     * 判断工具调用是否属于某个任务（基于时间窗口关联）
     * 
     * 策略：工具调用的创建时间在任务的 startedAt 之后且在 completedAt 之前
     */
    private fun isToolCallInTask(toolCall: ToolCall, task: BackgroundTask): Boolean {
        val toolCallTime = toolCall.createdAt.toLongOrNull() ?: return false
        val taskStart = task.startedAt ?: task.createdAt
        val taskEnd = task.completedAt ?: Long.MAX_VALUE
        return toolCallTime in taskStart..taskEnd
    }

    /** 增量更新显示消息列表（全量重建，仅在消息增删时调用） */
    internal fun updateDisplayMessages() {
        _displayMessages.clear()
        _displayMessages.addAll(_messages.reversed().filter { shouldShowMessage(it) })
    }

    /**
     * 流式增量更新：仅更新指定消息，避免全量重建列表 - 优化版
     * 
     * 优化策略：
     * 1. 直接使用 SnapshotStateList 的 set 操作，Compose 会通过 key 识别变化
     * 2. 避免 clear/addAll 导致的全列表重新测量
     * 3. 配合 LazyColumn 的 key 参数实现精准重组
     */
    internal fun updateStreamingMessage(messageId: String) {
        val message = _messages.find { it.id == messageId } ?: return
        if (!shouldShowMessage(message)) return
        val displayIndex = _displayMessages.indexOfFirst { it.id == messageId }
        if (displayIndex != -1) {
            // 直接修改列表项，Compose 通过 key 识别变化
            // 避免创建新列表和 clear/addAll 的开销
            _displayMessages[displayIndex] = message
        }
    }

    /** 更新消息-工具调用映射 */
    internal fun updateMessageToolCallMap() {
        _messageToolCallMap.clear()
        for (message in _messages) {
            if (message.role != "assistant") continue
            val toolCallIds = messageToToolCalls[message.id]
            if (toolCallIds != null && toolCallIds.isNotEmpty()) {
                _messageToolCallMap[message.id] = _toolCalls.filter { it.id in toolCallIds }
            }
        }
    }

    /** 防抖更新工具调用 */
    internal fun scheduleToolUpdate(toolCallId: String, updatedTool: ToolCall) {
        pendingToolUpdates[toolCallId] = updatedTool
        toolUpdateDebounceJob?.cancel()
        toolUpdateDebounceJob = viewModelScope.launch {
            delay(toolUpdateDebounceIntervalMs)
            for ((id, tool) in pendingToolUpdates) {
                val index = _toolCalls.indexOfFirst { it.id == id }
                if (index != -1) _toolCalls[index] = tool
                else _toolCalls.add(tool)
            }
            pendingToolUpdates.clear()
            updateMessageToolCallMap()
            rebuildTaskToolCallCache()
            emitUiStateUpdate()
        }
    }

    /** 防抖更新UI状态 */
    internal fun emitUiStateUpdate() {
        uiStateUpdateJob?.cancel()
        uiStateUpdateJob = viewModelScope.launch {
            delay(200L)
            _uiState.value = UiState.Success(
                messages = _messages.toList(),
                toolCalls = _toolCalls.toList(),
                executionStatus = null
            )
        }
    }

    init {
        viewModelScope.launch {
            // 使用 SharedFlow 收集事件，不再需要判断 null
            launch { 
                webSocketManager.incomingMessages.collect { event -> 
                    handleWebSocketEvent(event)
                } 
            }
            
            // 帧节流收集消息更新 - 50ms 配合增量解析器
            // 增量解析器只重组活跃块，50ms 节流足够流畅且减少计算量
            @OptIn(kotlinx.coroutines.FlowPreview::class)
            launch {
                _messageUpdates
                    .sample(50L)
                    .collect { messageId ->
                        flushMessageContentBuffer(messageId)
                    }
            }
            
            delay(500L)
            connectWebSocket()
            delay(300L)
            restoreSessionFromLocalStore()
        }
    }
    
    /**
     * 将缓冲区的内容刷新到消息列表
     * 在帧节流后被调用，减少 UI 重组频率
     */
    internal fun flushMessageContentBuffer(messageId: String) {
        val buffer = messageContentBuffers[messageId] ?: return
        val content = buffer.toString()
        if (content.isEmpty()) return
        
        val index = _messages.indexOfFirst { it.id == messageId }
        if (index != -1) {
            val oldMessage = _messages[index]
            // 只有当内容真正变化时才更新
            if (oldMessage.content != content) {
                _messages[index] = oldMessage.copy(content = content)
                updateStreamingMessage(messageId)
            }
        }
    }
    
    /**
     * 追加内容到消息缓冲区
     * 使用 StringBuilder 避免 O(n²) 字符串拼接
     */
    internal fun appendToMessageBuffer(messageId: String, delta: String) {
        val buffer = messageContentBuffers.getOrPut(messageId) { StringBuilder() }
        buffer.append(delta)
        // 触发更新事件，会被帧节流收集
        _messageUpdates.tryEmit(messageId)
    }
    
    /**
     * 清理消息缓冲区
     * 在消息结束时调用
     */
    internal fun clearMessageBuffer(messageId: String) {
        messageContentBuffers.remove(messageId)
    }

    /**
     * 迁移消息缓冲区键值（用于 messageId 变更场景）。
     * 避免 message_saved 后后续 delta 写入新 ID 时丢失既有缓冲内容。
     */
    internal fun migrateMessageBuffer(oldMessageId: String, newMessageId: String) {
        if (oldMessageId == newMessageId) return
        val oldBuffer = messageContentBuffers.remove(oldMessageId) ?: return
        val targetBuffer = messageContentBuffers.getOrPut(newMessageId) { StringBuilder() }
        if (targetBuffer.isEmpty()) {
            targetBuffer.append(oldBuffer.toString())
        }
    }

    private fun restoreSessionFromLocalStore() {
        viewModelScope.launch {
            sessionLocalStore?.let { store ->
                val savedSessionId = store.getSessionIdSync()
                if (!savedSessionId.isNullOrBlank()) {
                    android.util.Log.d(TAG, "从本地存储恢复会话: $savedSessionId")
                    currentSessionId = savedSessionId
                    loadSession(savedSessionId)
                }
            }
        }
    }

    internal fun saveSessionToLocalStore(sessionId: String) {
        viewModelScope.launch { sessionLocalStore?.saveSessionId(sessionId) }
    }

    private fun connectWebSocket() {
        viewModelScope.launch {
            val token = tokenManager.getTokenSync()
            if (token != null) webSocketManager.connect(token)
        }
    }

    fun sendMessage(content: String, imageAttachments: List<Map<String, String>>? = null) {
        viewModelScope.launch {
            val session = ensureSession() ?: run { _uiState.value = UiState.Error("无法创建会话"); return@launch }
            try {
                val userMessage = Message(
                    id = UUID.randomUUID().toString(), role = "user", content = content,
                    timestamp = System.currentTimeMillis().toString(), isStreaming = false,
                    attachments = imageAttachments?.map { ImageAttachment(imageId = it["imageId"] ?: "", type = "image", mimeType = it["mimeType"]) }
                )
                _messages.add(userMessage)
                updateDisplayMessages()
                _uiState.value = UiState.Loading

                if (webSocketManager.isConnected) {
                    webSocketManager.sendUserMessage(sessionId = session.id, content = content, imageAttachments = imageAttachments, maxIterations = maxIterations)
                } else {
                    val result = cachedChatRepository.executeAgent(sessionId = session.id, task = content, prompt = content)
                    when (result) {
                        is CachedChatRepository.Result.Success -> {
                            result.data.messages.forEach { msg -> if (_messages.none { it.id == msg.id }) _messages.add(msg) }
                            _toolCalls.clear(); _toolCalls.addAll(result.data.toolCalls)
                            rebuildTaskToolCallCache()
                            _uiState.value = UiState.Success(messages = _messages.toList(), toolCalls = _toolCalls.toList(), executionStatus = result.data.executionStatus)
                        }
                        is CachedChatRepository.Result.Error -> _uiState.value = UiState.Error(result.message)
                        is CachedChatRepository.Result.Loading -> {}
                    }
                }
            } catch (e: Exception) { _uiState.value = UiState.Error(e.message ?: "网络错误") }
        }
    }

    fun initNewSession(sessionId: String, isLocalOnly: Boolean = false) {
        currentSessionId = sessionId; isLocalOnlySession = isLocalOnly; saveSessionToLocalStore(sessionId)
        clearInternalState()
        _uiState.value = UiState.Success(messages = emptyList(), toolCalls = emptyList(), executionStatus = null)
    }

    fun loadSession(sessionId: String, forceRefresh: Boolean = false) {
        android.util.Log.i(TAG, "loadSession START: sessionId=$sessionId, forceRefresh=$forceRefresh")
        viewModelScope.launch {
            try {
                currentSessionId = sessionId; saveSessionToLocalStore(sessionId)
                clearInternalState(); _uiState.value = UiState.Loading

                loadTasksFromDatabase(sessionId)

                android.util.Log.d(TAG, "loadSession: loading from local cache first...")
                val latestResult = cachedChatRepository.getLatestMessages(sessionId)
                android.util.Log.d(TAG, "loadSession: getLatestMessages returned ${latestResult::class.simpleName}")

                when (latestResult) {
                    is CachedChatRepository.Result.Success -> {
                        android.util.Log.i(TAG, "loadSession: loaded ${latestResult.data.size} messages from local cache")
                        _messages.addAll(latestResult.data.map { it.copy(isStreaming = false) })
                        updateDisplayMessages()
                        totalMessageCount = cachedChatRepository.getMessageCount(sessionId)
                        hasMoreHistory = _messages.size < totalMessageCount
                        android.util.Log.d(TAG, "loadSession: local cache loaded, totalCount=$totalMessageCount, hasMoreHistory=$hasMoreHistory")

                        _uiState.value = UiState.Success(messages = _messages.toList(), toolCalls = _toolCalls.toList(), executionStatus = null)

                        // 后台从网络刷新
                        android.util.Log.d(TAG, "loadSession: starting background network refresh...")
                        launch {
                            cachedChatRepository.getSessionDetail(sessionId, forceRefresh).collect { result ->
                                when (result) {
                                    is CachedChatRepository.Result.Loading -> {
                                        android.util.Log.v(TAG, "loadSession: network refresh LOADING")
                                    }
                                    is CachedChatRepository.Result.Success -> {
                                        val remoteMessages = result.data.messages.map { it.copy(isStreaming = false) }
                                        val remoteToolCalls = result.data.toolCalls
                                        android.util.Log.i(TAG, "loadSession: network refresh SUCCESS, ${remoteMessages.size} messages, ${remoteToolCalls.size} toolCalls")

                                        _messages.clear()
                                        _messages.addAll(remoteMessages)

                                        _toolCalls.clear()
                                        _toolCalls.addAll(remoteToolCalls)
                                        rebuildMessageToolCallMapping()
                                        updateMessageToolCallMap()
                                        rebuildTaskToolCallCache()
                                        updateDisplayMessages()

                                        totalMessageCount = remoteMessages.size
                                        hasMoreHistory = _messages.size < totalMessageCount

                                        _uiState.value = UiState.Success(
                                            messages = _messages.toList(),
                                            toolCalls = _toolCalls.toList(),
                                            executionStatus = null
                                        )
                                        android.util.Log.i(TAG, "loadSession: UI updated with remote data")
                                    }
                                    is CachedChatRepository.Result.Error -> {
                                        android.util.Log.e(TAG, "loadSession: network refresh ERROR: ${result.message}")
                                        if (_messages.isEmpty()) _uiState.value = UiState.Error(result.message)
                                    }
                                }
                            }
                        }
                    }
                    is CachedChatRepository.Result.Error -> {
                        android.util.Log.w(TAG, "loadSession: local cache failed, falling back to network: ${latestResult.message}")
                        loadSessionFallback(sessionId, forceRefresh)
                    }
                    is CachedChatRepository.Result.Loading -> {
                        android.util.Log.v(TAG, "loadSession: local cache LOADING")
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e(TAG, "loadSession: EXCEPTION", e)
                _uiState.value = UiState.Error(e.message ?: "加载失败")
            }
        }
    }

    private suspend fun loadSessionFallback(sessionId: String, forceRefresh: Boolean) {
        cachedChatRepository.getSessionDetail(sessionId, forceRefresh).collect { result ->
            when (result) {
                is CachedChatRepository.Result.Loading -> {}
                is CachedChatRepository.Result.Success -> {
                    _messages.clear(); _messages.addAll(result.data.messages.map { it.copy(isStreaming = false) })
                    _toolCalls.clear(); _toolCalls.addAll(result.data.toolCalls)
                    rebuildMessageToolCallMapping(); updateMessageToolCallMap(); updateDisplayMessages()
                    rebuildTaskToolCallCache()
                    totalMessageCount = result.data.messages.size; hasMoreHistory = false
                    _uiState.value = UiState.Success(messages = _messages.toList(), toolCalls = _toolCalls.toList(), executionStatus = null)
                }
                is CachedChatRepository.Result.Error -> _uiState.value = UiState.Error(result.message)
            }
        }
    }

    /** 加载更早的历史消息（向上翻页） */
    fun loadOlderMessages() {
        if (isLoadingHistory || !hasMoreHistory) return
        val sessionId = currentSessionId ?: return
        isLoadingHistory = true
        viewModelScope.launch {
            try {
                val oldestTimestamp = _messages.minOfOrNull { it.timestamp.toLongOrNull() ?: Long.MAX_VALUE }?.toString() ?: return@launch
                val result = cachedChatRepository.getOlderMessages(sessionId, oldestTimestamp)
                when (result) {
                    is CachedChatRepository.Result.Success -> {
                        if (result.data.isEmpty()) { hasMoreHistory = false }
                        else {
                            val sortedOlder = result.data.sortedBy { it.timestamp.toLongOrNull() ?: 0L }.map { it.copy(isStreaming = false) }
                            _messages.addAll(0, sortedOlder); updateDisplayMessages()
                            hasMoreHistory = _messages.size < totalMessageCount
                        }
                    }
                    is CachedChatRepository.Result.Error -> android.util.Log.e(TAG, "加载更早消息失败: ${result.message}")
                    is CachedChatRepository.Result.Loading -> {}
                }
            } catch (e: Exception) { android.util.Log.e(TAG, "加载更早消息异常", e) }
            finally { isLoadingHistory = false }
        }
    }

    fun abortExecution() {
        viewModelScope.launch {
            try {
                currentSessionId?.let { webSocketManager.interruptGeneration(it) }
                cachedChatRepository.interruptAgent()
                _uiState.value = UiState.Success(messages = _messages.toList(), toolCalls = _toolCalls.toList(),
                    executionStatus = ExecutionStatus(status = "idle", currentTurn = 0, maxTurns = maxIterations, progress = 0, message = "已中断"))
            } catch (_: Exception) {}
        }
    }

    fun uploadFilesToWorkdir(files: List<FileInfo>, directory: String = "uploads", onProgress: ((Int, Int, String) -> Unit)? = null, onComplete: (Int, Int, List<String>) -> Unit) {
        viewModelScope.launch {
            val sessionId = currentSessionId
            if (sessionId == null) { onComplete(0, files.size, files.map { it.name }); return@launch }
            if (files.isEmpty()) { onComplete(0, 0, emptyList()); return@launch }
            val fileContents = files.map { it.name to it.content }
            val result = cachedChatRepository.uploadFilesToWorkdir(sessionId = sessionId, fileContents = fileContents, directory = directory)
            when (result) {
                is CachedChatRepository.Result.Success -> {
                    val r = result.data
                    if (r.uploaded.isNotEmpty()) {
                        val names = r.uploaded.joinToString(", ") { it.name }
                        _messages.add(Message(id = UUID.randomUUID().toString(), role = "system", content = "📎 已上传 ${r.uploaded.size} 个文件: $names", timestamp = System.currentTimeMillis().toString()))
                        emitUiStateUpdate()
                    }
                    onComplete(r.uploaded.size, r.failed.size, r.failed.map { it.name })
                }
                is CachedChatRepository.Result.Error -> onComplete(0, files.size, files.map { it.name })
                is CachedChatRepository.Result.Loading -> {}
            }
        }
    }

    var onConvertLocalSession: (suspend (tempSessionId: String) -> Session?)? = null

    private suspend fun ensureSession(): Session? {
        if (isLocalOnlySession && currentSessionId != null) {
            val realSession = onConvertLocalSession?.invoke(currentSessionId!!)
            if (realSession != null) { currentSessionId = realSession.id; isLocalOnlySession = false; saveSessionToLocalStore(realSession.id); return realSession }
            return null
        }
        return currentSessionId?.let { Session(id = it, title = "", createdAt = "", updatedAt = "") } ?: run {
            val result = cachedChatRepository.createSession(null, "qwen-plus")
            when (result) {
                is CachedChatRepository.Result.Success -> { val s = result.data; currentSessionId = s.id; isLocalOnlySession = false; saveSessionToLocalStore(s.id); s }
                else -> null
            }
        }
    }

    fun clearSession() {
        currentSessionId = null; clearInternalState(); _uiState.value = UiState.Idle
        viewModelScope.launch { sessionLocalStore?.clearSessionId() }
    }

    private fun clearInternalState() {
        _messages.clear(); _toolCalls.clear(); _displayMessages.clear(); _messageToolCallMap.clear()
        messageToToolCalls.clear(); unassociatedToolCallIds.clear(); pendingToolInput.clear()
        messageContentBuffers.clear(); _taskToolCallCache.clear()
        hasMoreHistory = false; isLoadingHistory = false; totalMessageCount = 0
    }

    override fun onCleared() { super.onCleared(); webSocketManager.disconnect() }

    /**
     * 从数据库加载会话关联的任务列表
     */
    private suspend fun loadTasksFromDatabase(sessionId: String) {
        val dao = taskDao ?: return
        try {
            val entities = dao.getTasksBySessionOnce(sessionId)
            _tasks.clear()
            _tasks.addAll(entities.map { it.toBackgroundTask() })
            rebuildTaskToolCallCache()
        } catch (e: Exception) {
            android.util.Log.w(TAG, "从数据库加载任务失败: ${e.message}")
        }
    }

    /**
     * 将任务持久化到数据库
     */
    internal suspend fun saveTaskToDatabase(task: BackgroundTask) {
        val dao = taskDao ?: return
        val sid = currentSessionId ?: return
        try {
            dao.insertTask(task.toTaskEntity(sid))
        } catch (e: Exception) {
            android.util.Log.w(TAG, "保存任务到数据库失败: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "ChatViewModel"
        fun provideFactory(
            cachedChatRepository: CachedChatRepository,
            tokenManager: TokenManager,
            sessionLocalStore: SessionLocalStore? = null,
            notificationManager: NotificationManager? = null,
            pushMessageStore: PushMessageStore? = null,
            taskDao: TaskDao? = null
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T = ChatViewModel(
                cachedChatRepository = cachedChatRepository, tokenManager = tokenManager,
                sessionLocalStore = sessionLocalStore, notificationManager = notificationManager,
                pushMessageStore = pushMessageStore, taskDao = taskDao
            ) as T
        }
    }
}
