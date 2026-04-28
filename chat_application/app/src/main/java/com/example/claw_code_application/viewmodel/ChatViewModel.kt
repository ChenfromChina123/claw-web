package com.example.claw_code_application.viewmodel

import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.claw_code_application.data.api.models.*
import com.example.claw_code_application.data.local.TokenManager
import com.example.claw_code_application.data.local.SessionLocalStore
import com.example.claw_code_application.data.repository.CachedChatRepository
import com.example.claw_code_application.data.websocket.WebSocketManager
import com.example.claw_code_application.ui.chat.components.shouldShowMessage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.util.UUID

class ChatViewModel(
    private val cachedChatRepository: CachedChatRepository,
    private val tokenManager: TokenManager,
    private val webSocketManager: WebSocketManager = WebSocketManager(),
    private val sessionLocalStore: SessionLocalStore? = null
) : ViewModel() {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

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

    private val _uiState = MutableStateFlow<UiState>(UiState.Idle)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    var currentSessionId: String? = null
        private set

    private val _messages = mutableStateListOf<Message>()
    val messages: List<Message> = _messages

    val displayMessages: List<Message> by derivedStateOf {
        _messages.reversed().filter { shouldShowMessage(it) }
    }

    private val _toolCalls = mutableStateListOf<ToolCall>()
    val toolCalls: List<ToolCall> = _toolCalls

    val connectionState = webSocketManager.connectionState

    private var streamingMessageId: String? = null
    private var pendingDeltaText = StringBuilder()
    private var debounceJob: Job? = null
    private val debounceIntervalMs = 50L
    private val pendingToolUpdates = mutableMapOf<String, ToolCall>()
    private var toolUpdateDebounceJob: Job? = null
    private val toolUpdateDebounceIntervalMs = 100L
    private val pendingToolInput = mutableMapOf<String, StringBuilder>()
    private val messageToToolCalls = mutableMapOf<String, MutableList<String>>()
    private val unassociatedToolCallIds = mutableListOf<String>()

    fun getToolCallsForMessage(messageId: String): List<ToolCall> {
        val toolCallIds = messageToToolCalls[messageId]
        if (toolCallIds == null) {
            return emptyList()
        }
        return _toolCalls.filter { it.id in toolCallIds }
    }

    private fun scheduleToolUpdate(toolCallId: String, updatedTool: ToolCall) {
        pendingToolUpdates[toolCallId] = updatedTool

        toolUpdateDebounceJob?.cancel()
        toolUpdateDebounceJob = viewModelScope.launch {
            delay(toolUpdateDebounceIntervalMs)

            for ((id, tool) in pendingToolUpdates) {
                val index = _toolCalls.indexOfFirst { it.id == id }
                if (index != -1) {
                    _toolCalls[index] = tool
                } else {
                    _toolCalls.add(tool)
                }
            }
            pendingToolUpdates.clear()

            emitUiStateUpdate()
        }
    }

    private var uiStateUpdateJob: Job? = null

    private fun emitUiStateUpdate() {
        uiStateUpdateJob?.cancel()
        uiStateUpdateJob = viewModelScope.launch {
            delay(50L)
            _uiState.value = UiState.Success(
                messages = _messages.toList(),
                toolCalls = _toolCalls.toList(),
                executionStatus = null
            )
        }
    }

    init {
        viewModelScope.launch {
            webSocketManager.incomingMessages.collect { event ->
                event?.let { handleWebSocketEvent(it) }
            }
        }

        connectWebSocket()
        restoreSessionFromLocalStore()
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

    private fun saveSessionToLocalStore(sessionId: String) {
        viewModelScope.launch {
            sessionLocalStore?.saveSessionId(sessionId)
        }
    }

    private fun connectWebSocket() {
        viewModelScope.launch {
            val token = tokenManager.getTokenSync()
            if (token != null) {
                webSocketManager.connect(token)
            }
        }
    }

    private fun handleWebSocketEvent(event: WebSocketManager.WebSocketEvent) {
        when (event) {
            is WebSocketManager.WebSocketEvent.MessageStart -> {
                streamingMessageId = event.messageId

                if (unassociatedToolCallIds.isNotEmpty()) {
                    val toolCallList = messageToToolCalls.getOrPut(event.messageId) { mutableListOf() }
                    toolCallList.addAll(unassociatedToolCallIds)
                    unassociatedToolCallIds.clear()
                }

                val assistantMessage = Message(
                    id = event.messageId,
                    role = "assistant",
                    content = "",
                    timestamp = System.currentTimeMillis().toString(),
                    isStreaming = true
                )
                _messages.add(assistantMessage)
                _uiState.value = UiState.Success(
                    messages = _messages.toList(),
                    toolCalls = _toolCalls.toList(),
                    executionStatus = ExecutionStatus(
                        status = "running",
                        currentTurn = event.iteration,
                        maxTurns = 20,
                        progress = 0
                    )
                )
            }

            is WebSocketManager.WebSocketEvent.MessageDelta -> {
                pendingDeltaText.append(event.delta)

                debounceJob?.cancel()
                debounceJob = viewModelScope.launch {
                    delay(debounceIntervalMs)

                    val deltaToApply = pendingDeltaText.toString()
                    pendingDeltaText.clear()

                    streamingMessageId?.let { messageId ->
                        val index = _messages.indexOfFirst { it.id == messageId }
                        if (index != -1) {
                            val oldMessage = _messages[index]
                            _messages[index] = oldMessage.copy(
                                content = oldMessage.content + deltaToApply
                            )
                        }
                    }
                }
            }

            is WebSocketManager.WebSocketEvent.MessageStop -> {
                debounceJob?.cancel()
                val remainingDelta = pendingDeltaText.toString()
                pendingDeltaText.clear()

                streamingMessageId?.let { messageId ->
                    val index = _messages.indexOfFirst { it.id == messageId }
                    if (index != -1) {
                        val oldMessage = _messages[index]
                        val updatedMessage = oldMessage.copy(
                            content = oldMessage.content + remainingDelta,
                            isStreaming = false
                        )
                        _messages[index] = updatedMessage
                    }
                }
                streamingMessageId = null

                _uiState.value = UiState.Success(
                    messages = _messages.toList(),
                    toolCalls = _toolCalls.toList(),
                    executionStatus = ExecutionStatus(
                        status = if (event.stopReason == "end_turn") "completed" else "running",
                        currentTurn = event.iteration,
                        maxTurns = 20,
                        progress = if (event.stopReason == "end_turn") 100 else 50
                    )
                )
            }

            is WebSocketManager.WebSocketEvent.MessageSaved -> {
                if (event.role == "user") {
                    val lastUserMsgIndex = _messages.indexOfLast { it.role == "user" }
                    if (lastUserMsgIndex != -1) {
                        val oldMsg = _messages[lastUserMsgIndex]
                        if (oldMsg.id != event.messageId) {
                            _messages[lastUserMsgIndex] = oldMsg.copy(id = event.messageId)
                        }
                    }
                }
            }

            is WebSocketManager.WebSocketEvent.ToolUse -> {
                val toolCall = ToolCall(
                    id = event.id,
                    toolName = event.name,
                    toolInput = JsonObject(emptyMap()),
                    toolOutput = null,
                    status = "pending",
                    createdAt = System.currentTimeMillis().toString()
                )
                _toolCalls.add(toolCall)
                pendingToolInput[event.id] = StringBuilder()

                streamingMessageId?.let { messageId ->
                    messageToToolCalls.getOrPut(messageId) { mutableListOf() }.add(event.id)
                } ?: run {
                    unassociatedToolCallIds.add(event.id)
                }

                emitUiStateUpdate()
            }

            is WebSocketManager.WebSocketEvent.ToolInputDelta -> {
                pendingToolInput[event.id]?.append(event.partialJson)
            }

            is WebSocketManager.WebSocketEvent.ToolStart -> {
                val index = _toolCalls.indexOfFirst { it.id == event.id }
                if (index != -1) {
                    val oldTool = _toolCalls[index]
                    val inputJson = pendingToolInput[event.id]?.toString()
                    val toolInput: JsonObject = if (!inputJson.isNullOrEmpty()) {
                        try {
                            val element = json.parseToJsonElement(inputJson)
                            when (element) {
                                is JsonObject -> element
                                else -> JsonObject(emptyMap())
                            }
                        } catch (e: Exception) {
                            JsonObject(emptyMap())
                        }
                    } else {
                        (event.input as? JsonObject) ?: JsonObject(emptyMap())
                    }
                    val updatedTool = oldTool.copy(
                        status = "executing",
                        toolInput = toolInput
                    )
                    scheduleToolUpdate(event.id, updatedTool)
                }
            }

            is WebSocketManager.WebSocketEvent.ToolEnd -> {
                val index = _toolCalls.indexOfFirst { it.id == event.id }
                if (index != -1) {
                    val oldTool = _toolCalls[index]
                    val outputStr = event.result?.let {
                        try {
                            json.encodeToString(JsonElement.serializer(), it)
                        } catch (e: Exception) {
                            it.toString()
                        }
                    }
                    val updatedTool = oldTool.copy(
                        status = "completed",
                        toolOutput = outputStr,
                        completedAt = System.currentTimeMillis().toString()
                    )
                    scheduleToolUpdate(event.id, updatedTool)
                }
                pendingToolInput.remove(event.id)
            }

            is WebSocketManager.WebSocketEvent.ToolError -> {
                val index = _toolCalls.indexOfFirst { it.id == event.id }
                if (index != -1) {
                    val oldTool = _toolCalls[index]
                    val updatedTool = oldTool.copy(
                        status = "error",
                        error = event.error,
                        completedAt = System.currentTimeMillis().toString()
                    )
                    scheduleToolUpdate(event.id, updatedTool)
                }
                pendingToolInput.remove(event.id)
            }

            is WebSocketManager.WebSocketEvent.ToolProgress -> {
                // 进度事件暂不改变工具状态
            }

            is WebSocketManager.WebSocketEvent.ToolUseEnd -> {
                val index = _toolCalls.indexOfFirst { it.id == event.id }
                if (index != -1) {
                    val oldTool = _toolCalls[index]
                    val newStatus = if (event.error != null) "error" else "completed"
                    val outputStr = event.output?.let {
                        try {
                            json.encodeToString(JsonElement.serializer(), it)
                        } catch (e: Exception) {
                            it.toString()
                        }
                    }
                    val updatedTool = oldTool.copy(
                        status = newStatus,
                        toolOutput = outputStr ?: oldTool.toolOutput,
                        error = event.error ?: oldTool.error,
                        completedAt = System.currentTimeMillis().toString()
                    )
                    scheduleToolUpdate(event.id, updatedTool)
                }
            }

            is WebSocketManager.WebSocketEvent.ConversationEnd -> {
                _uiState.value = UiState.Success(
                    messages = _messages.toList(),
                    toolCalls = _toolCalls.toList(),
                    executionStatus = ExecutionStatus(
                        status = "completed",
                        currentTurn = 0,
                        maxTurns = 20,
                        progress = 100
                    )
                )
            }

            is WebSocketManager.WebSocketEvent.Error -> {
                _uiState.value = UiState.Error(event.message)
            }
        }
    }

    fun sendMessage(content: String, imageAttachments: List<Map<String, String>>? = null) {
        viewModelScope.launch {
            val session = ensureSession() ?: run {
                _uiState.value = UiState.Error("无法创建会话")
                return@launch
            }

            try {
                val userMessage = Message(
                    id = UUID.randomUUID().toString(),
                    role = "user",
                    content = content,
                    timestamp = System.currentTimeMillis().toString(),
                    isStreaming = false,
                    attachments = imageAttachments?.map {
                        ImageAttachment(
                            imageId = it["imageId"] ?: "",
                            type = "image",
                            mimeType = it["mimeType"]
                        )
                    }
                )
                _messages.add(userMessage)

                _uiState.value = UiState.Loading

                if (webSocketManager.isConnected) {
                    webSocketManager.sendUserMessage(
                        sessionId = session.id,
                        content = content,
                        imageAttachments = imageAttachments
                    )
                } else {
                    val result = cachedChatRepository.executeAgent(
                        sessionId = session.id,
                        task = content,
                        prompt = content
                    )

                    when (result) {
                        is CachedChatRepository.Result.Success -> {
                            val response = result.data
                            response.messages.forEach { msg ->
                                _messages.add(msg)
                            }
                            _toolCalls.clear()
                            _toolCalls.addAll(response.toolCalls)
                            _uiState.value = UiState.Success(
                                messages = _messages.toList(),
                                toolCalls = _toolCalls.toList(),
                                executionStatus = response.executionStatus
                            )
                        }
                        is CachedChatRepository.Result.Error -> {
                            _uiState.value = UiState.Error(result.message)
                        }
                        is CachedChatRepository.Result.Loading -> {
                            // 忽略
                        }
                    }
                }
            } catch (e: Exception) {
                _uiState.value = UiState.Error(e.message ?: "网络错误")
            }
        }
    }

    fun initNewSession(sessionId: String) {
        android.util.Log.d(TAG, "initNewSession() - 初始化新会话: $sessionId")
        currentSessionId = sessionId
        saveSessionToLocalStore(sessionId)

        _messages.clear()
        _toolCalls.clear()
        messageToToolCalls.clear()
        unassociatedToolCallIds.clear()
        pendingToolInput.clear()

        _uiState.value = UiState.Success(
            messages = emptyList(),
            toolCalls = emptyList(),
            executionStatus = null
        )
        android.util.Log.d(TAG, "新会话已初始化为空白状态")
    }

    fun loadSession(sessionId: String, forceRefresh: Boolean = false) {
        android.util.Log.d(TAG, "loadSession() - sessionId: $sessionId, forceRefresh: $forceRefresh")
        viewModelScope.launch {
            try {
                currentSessionId = sessionId
                saveSessionToLocalStore(sessionId)

                _messages.clear()
                _toolCalls.clear()
                messageToToolCalls.clear()
                unassociatedToolCallIds.clear()
                pendingToolInput.clear()

                _uiState.value = UiState.Loading

                cachedChatRepository.getSessionDetail(sessionId, forceRefresh).collect { result ->
                    when (result) {
                        is CachedChatRepository.Result.Loading -> {
                            // 保持 Loading 状态
                        }
                        is CachedChatRepository.Result.Success -> {
                            val detail = result.data
                            _messages.clear()
                            _messages.addAll(detail.messages)

                            _toolCalls.clear()
                            _toolCalls.addAll(detail.toolCalls)

                            rebuildMessageToolCallMapping()

                            android.util.Log.d(TAG, "会话加载成功: ${detail.messages.size} 条消息, ${detail.toolCalls.size} 个工具调用")
                            _uiState.value = UiState.Success(
                                messages = _messages.toList(),
                                toolCalls = _toolCalls.toList(),
                                executionStatus = null
                            )
                        }
                        is CachedChatRepository.Result.Error -> {
                            android.util.Log.e(TAG, "加载会话失败: ${result.message}")
                            _uiState.value = UiState.Error(result.message)
                        }
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e(TAG, "加载异常", e)
                _uiState.value = UiState.Error(e.message ?: "加载失败")
            }
        }
    }

    private fun rebuildMessageToolCallMapping() {
        messageToToolCalls.clear()

        for (message in _messages) {
            if (message.role != "assistant") continue

            val content = message.content.trim()
            if (!content.startsWith("[") && !content.startsWith("{")) continue

            try {
                val toolUseIds = extractToolUseIdsFromContent(content)
                if (toolUseIds.isNotEmpty()) {
                    messageToToolCalls[message.id] = toolUseIds.toMutableList()
                }
            } catch (e: Exception) {
                // 解析失败，跳过
            }
        }

        val associatedIds = messageToToolCalls.values.flatten().toSet()
        val unassociated = _toolCalls.filter { it.id !in associatedIds }

        if (unassociated.isNotEmpty()) {
            var lastAssistantMessageId: String? = null
            for (message in _messages) {
                if (message.role == "assistant") {
                    lastAssistantMessageId = message.id
                }
            }

            for (toolCall in unassociated) {
                val toolCallTime = toolCall.createdAt.toLongOrNull() ?: 0
                var bestMessageId: String? = null

                for (message in _messages) {
                    if (message.role == "assistant") {
                        val messageTime = message.timestamp.toLongOrNull() ?: 0
                        if (messageTime <= toolCallTime) {
                            bestMessageId = message.id
                        } else {
                            break
                        }
                    }
                }

                if (bestMessageId == null) {
                    bestMessageId = lastAssistantMessageId
                }

                if (bestMessageId != null) {
                    messageToToolCalls.getOrPut(bestMessageId) { mutableListOf() }.add(toolCall.id)
                }
            }
        }
    }

    private fun extractToolUseIdsFromContent(content: String): List<String> {
        val ids = mutableListOf<String>()
        try {
            if (content.startsWith("[")) {
                val jsonArray = json.parseToJsonElement(content).jsonArray
                for (element in jsonArray) {
                    if (element is JsonObject) {
                        if (element["type"]?.jsonPrimitive?.content == "tool_use") {
                            element["id"]?.jsonPrimitive?.content?.let { ids.add(it) }
                        }
                    }
                }
            } else if (content.startsWith("{")) {
                val jsonObj = json.parseToJsonElement(content).jsonObject
                if (jsonObj["type"]?.jsonPrimitive?.content == "tool_use") {
                    jsonObj["id"]?.jsonPrimitive?.content?.let { ids.add(it) }
                }
            }
        } catch (_: Exception) {
        }
        return ids
    }

    fun abortExecution() {
        viewModelScope.launch {
            try {
                currentSessionId?.let { sessionId ->
                    webSocketManager.interruptGeneration(sessionId)
                }

                cachedChatRepository.interruptAgent()
                _uiState.value = UiState.Success(
                    messages = _messages.toList(),
                    toolCalls = _toolCalls.toList(),
                    executionStatus = ExecutionStatus(
                        status = "idle",
                        currentTurn = 0,
                        maxTurns = 100,
                        progress = 0,
                        message = "已中断"
                    )
                )
            } catch (e: Exception) {
                // 忽略中断错误
            }
        }
    }

    private suspend fun ensureSession(): Session? {
        android.util.Log.d(TAG, "ensureSession() - currentSessionId: $currentSessionId")

        return currentSessionId?.let { id ->
            android.util.Log.d(TAG, "复用现有会话: $id")
            Session(id = id, title = "", createdAt = "", updatedAt = "")
        } ?: run {
            android.util.Log.d(TAG, "创建新会话...")
            val result = cachedChatRepository.createSession(null, "qwen-plus")
            when (result) {
                is CachedChatRepository.Result.Success -> {
                    val session = result.data
                    currentSessionId = session.id
                    saveSessionToLocalStore(session.id)
                    android.util.Log.d(TAG, "新会话已创建并保存: ${session.id}")
                    session
                }
                is CachedChatRepository.Result.Error -> {
                    android.util.Log.e(TAG, "创建会话失败: ${result.message}")
                    null
                }
                is CachedChatRepository.Result.Loading -> null
            }
        }
    }

    fun clearSession() {
        android.util.Log.d(TAG, "clearSession() - 清空当前会话")
        currentSessionId = null
        _messages.clear()
        _toolCalls.clear()
        _uiState.value = UiState.Idle

        viewModelScope.launch {
            sessionLocalStore?.clearSessionId()
            android.util.Log.d(TAG, "本地存储的会话ID已清除")
        }
    }

    override fun onCleared() {
        super.onCleared()
        webSocketManager.disconnect()
    }

    companion object {
        private const val TAG = "ChatViewModel"

        fun provideFactory(
            cachedChatRepository: CachedChatRepository,
            tokenManager: com.example.claw_code_application.data.local.TokenManager,
            sessionLocalStore: SessionLocalStore? = null
        ): ViewModelProvider.Factory {
            return object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
                    return ChatViewModel(
                        cachedChatRepository = cachedChatRepository,
                        tokenManager = tokenManager,
                        sessionLocalStore = sessionLocalStore
                    ) as T
                }
            }
        }
    }
}