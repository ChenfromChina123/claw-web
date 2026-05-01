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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    internal var pendingDeltaText = StringBuilder()
    internal var debounceJob: Job? = null
    internal val debounceIntervalMs = 120L
    internal val pendingToolUpdates = mutableMapOf<String, ToolCall>()
    internal var toolUpdateDebounceJob: Job? = null
    internal val toolUpdateDebounceIntervalMs = 150L
    internal val pendingToolInput = mutableMapOf<String, StringBuilder>()
    internal val messageToToolCalls = mutableMapOf<String, MutableList<String>>()
    internal val unassociatedToolCallIds = mutableListOf<String>()
    internal var uiStateUpdateJob: Job? = null
    internal var currentThinkingBlockIndex: Int = -1
    internal var _thinkingContent: String = ""
    val thinkingContent: String get() = _thinkingContent

    /** 获取指定消息关联的工具调用 */
    fun getToolCallsForMessage(messageId: String): List<ToolCall> {
        return _messageToolCallMap[messageId] ?: emptyList()
    }

    /** 全量重建显示消息列表（仅在消息增删时调用） */
    internal fun updateDisplayMessages() {
        _displayMessages.clear()
        _displayMessages.addAll(_messages.reversed().filter { shouldShowMessage(it) })
    }

    /** 增量更新流式消息（仅更新指定消息，避免全量重建） */
    internal fun updateStreamingMessage(messageId: String) {
        val message = _messages.find { it.id == messageId } ?: return
        if (!shouldShowMessage(message)) return
        val displayIndex = _displayMessages.indexOfFirst { it.id == messageId }
        if (displayIndex != -1) {
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
            launch { webSocketManager.incomingMessages.collect { event -> event?.let { handleWebSocketEvent(it) } } }
            delay(500L)
            connectWebSocket()
            delay(300L)
            restoreSessionFromLocalStore()
        }
    }

    private fun restoreSessionFromLocalStore() {
        viewModelScope.launch {
            sessionLocalStore?.let { store ->
                val savedSessionId = store.getSessionIdSync()
                if (!savedSessionId.isNullOrBlank()) {
                    android.util.Log.d(TAG, "从本地存储恢复会话: $savedSessionId")
                    currentSessionId = savedSessionId
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
                                    _uiState.value = UiState.Success(messages = _messages.toList(), toolCalls = _toolCalls.toList(), executionStatus = null)
                                }
                                is CachedChatRepository.Result.Error -> {
                                    if (_messages.isNotEmpty()) _uiState.value = UiState.Success(messages = _messages.toList(), toolCalls = _toolCalls.toList(), executionStatus = null)
                                    else _uiState.value = UiState.Error(result.message)
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
